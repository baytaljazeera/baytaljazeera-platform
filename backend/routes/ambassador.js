const express = require("express");
const db = require("../db");
const { authMiddleware, combinedAuthMiddleware, requireRoles } = require("../middleware/auth");
const { asyncHandler } = require('../middleware/asyncHandler');
const { analyzeAmbassadorRequest } = require('../services/ambassadorFraud');

const router = express.Router();

// Middleware للتحقق من أن نظام السفراء مفعّل
const requireAmbassadorEnabled = asyncHandler(async (req, res, next) => {
  const result = await db.query(
    `SELECT ambassador_enabled FROM ambassador_settings WHERE id = 1`
  );
  const enabled = result.rows[0]?.ambassador_enabled ?? true;
  if (!enabled) {
    return res.status(503).json({ 
      error: "نظام السفراء متوقف حالياً",
      code: "AMBASSADOR_SYSTEM_DISABLED"
    });
  }
  next();
});

router.get("/my-stats", combinedAuthMiddleware, requireAmbassadorEnabled, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  try {
    console.log(`📊 Fetching stats for user: ${userId}`);
    
    const userResult = await db.query(
      `SELECT 
        ambassador_code, ambassador_floors, total_floors_earned,
        referral_code, referral_count
       FROM users WHERE id = $1`,
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "المستخدم غير موجود" });
    }
    
    const user = userResult.rows[0];
    const ambassadorCode = user.ambassador_code || user.referral_code;
    console.log(`✅ User found: ${ambassadorCode}`);
  
    // حساب العدد الفعلي من جدول الإحالات (كل الطوابق المبنية: completed + flagged_fraud)
    const allFloorsResult = await db.query(
      `SELECT COUNT(*) as count FROM referrals WHERE referrer_id = $1 AND status IN ('completed', 'flagged_fraud')`,
      [userId]
    );
    const currentFloors = parseInt(allFloorsResult.rows[0]?.count || 0);
    console.log(`✅ Current floors: ${currentFloors}`);
    
    // حساب عدد الإحالات الموصومة (الطوابق المنهارة - مواصفات غير سليمة)
    const flaggedReferralsResult = await db.query(
      `SELECT COUNT(*) as count FROM referrals WHERE referrer_id = $1 AND status = 'flagged_fraud'`,
      [userId]
    );
    const flaggedFloors = parseInt(flaggedReferralsResult.rows[0]?.count || 0);
    console.log(`✅ Flagged floors: ${flaggedFloors}`);
    
    const settingsResult = await db.query(
      `SELECT max_floors, floors_per_reward, consumption_enabled, require_first_listing, require_email_verified FROM ambassador_settings WHERE id = 1`
    );
    const settings = settingsResult.rows[0] || { max_floors: 20, floors_per_reward: [], consumption_enabled: true, require_first_listing: false, require_email_verified: false };
    console.log(`✅ Settings loaded: max_floors=${settings.max_floors}`);
    
    // جلب الإحالات - استخدام query بسيط بدون referral_risk_scores (مؤقتاً لتجنب المشاكل)
    console.log(`📋 Fetching referrals for user ${userId}...`);
    const referralsResult = await db.query(
      `SELECT r.id, r.status, r.created_at, r.collapse_reason, r.collapsed_at,
              COALESCE(u.name, 'مستخدم اختباري') as referred_name, 
              COALESCE(u.email, 'test@test.com') as referred_email,
              NULL::DECIMAL as risk_score, NULL::VARCHAR as risk_level, NULL::JSONB as triggered_rules, NULL::TEXT as ai_explanation
       FROM referrals r
       LEFT JOIN users u ON u.id = r.referred_id
       WHERE r.referrer_id = $1 AND r.status IN ('completed', 'flagged_fraud')
       ORDER BY r.created_at ASC`,
      [userId]
    );
    console.log(`✅ Referrals fetched: ${referralsResult.rows.length}`);
  
    // جلب الطوابق الموصومة بالتفصيل
    console.log(`📋 Fetching flagged floors...`);
    const flaggedFloorsResult = await db.query(
      `SELECT r.id, r.status, r.created_at, r.collapse_reason, r.collapsed_at, r.flag_reason,
              COALESCE(u.name, 'مستخدم اختباري') as referred_name, 
              COALESCE(u.email, 'test@test.com') as referred_email,
              ROW_NUMBER() OVER (ORDER BY r.created_at ASC) as floor_number
       FROM referrals r
       LEFT JOIN users u ON u.id = r.referred_id
       WHERE r.referrer_id = $1 AND r.status = 'flagged_fraud'
       ORDER BY r.created_at ASC`,
      [userId]
    );
    console.log(`✅ Flagged floors fetched: ${flaggedFloorsResult.rows.length}`);
    
    console.log(`📋 Fetching consumptions...`);
    const consumptionsResult = await db.query(
      `SELECT ac.*, p.name_ar as plan_name
       FROM ambassador_consumptions ac
       LEFT JOIN plans p ON p.id = ac.reward_plan_id
       WHERE ac.user_id = $1
       ORDER BY ac.consumed_at DESC`,
      [userId]
    );
    console.log(`✅ Consumptions fetched: ${consumptionsResult.rows.length}`);
    
    // حساب مجموع الطوابق المستهلكة
    console.log(`📋 Calculating consumed floors...`);
    const totalConsumedResult = await db.query(
      `SELECT COALESCE(SUM(floors_consumed), 0) as total FROM ambassador_consumptions WHERE user_id = $1`,
      [userId]
    );
    const rawFloorsConsumed = parseInt(totalConsumedResult.rows[0]?.total || 0);
    // ضمان أن المستهلك لا يتجاوز الطوابق المبنية (لتجنب القيم السالبة عند انهيار طوابق بعد استهلاكها)
    const floorsConsumed = Math.min(rawFloorsConsumed, currentFloors);
    console.log(`✅ Floors consumed: ${floorsConsumed}`);
    
    console.log(`📋 Fetching pending requests...`);
    const pendingRequestResult = await db.query(
      `SELECT * FROM ambassador_requests 
       WHERE user_id = $1 AND status IN ('pending', 'under_review')
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    console.log(`✅ Pending requests fetched: ${pendingRequestResult.rows.length}`);
  
    console.log(`📋 Parsing rewards config...`);
    let rewards = settings.floors_per_reward || [];
    if (typeof rewards === 'string') {
      try {
        rewards = JSON.parse(rewards);
        console.log(`✅ Rewards parsed: ${rewards.length} rewards`);
      } catch (parseError) {
        console.error('❌ Error parsing floors_per_reward:', parseError);
        rewards = [];
      }
    }
    if (!Array.isArray(rewards)) {
      console.warn('⚠️ Rewards is not an array, using empty array');
      rewards = [];
    }
    
    // حساب الطوابق السليمة (المبنية - المنهارة)
    const healthyFloors = Math.max(0, currentFloors - flaggedFloors);
    console.log(`✅ Healthy floors: ${healthyFloors}`);
    
    // حساب الطوابق المتاحة (السليمة - المستهلكة) مع ضمان عدم السالب
    const availableFloors = Math.max(0, healthyFloors - floorsConsumed);
    console.log(`✅ Available floors: ${availableFloors}`);
    
    const availableReward = rewards
      .filter(r => r.floors <= availableFloors)
      .sort((a, b) => b.floors - a.floors)[0] || null;
    console.log(`✅ Available reward: ${availableReward ? availableReward.plan_tier : 'none'}`);
    
    const canConsume = availableReward && settings.consumption_enabled && !pendingRequestResult.rows.length;
    
    // حساب رقم الطابق لكل إحالة
    console.log(`📋 Adding floor numbers to referrals...`);
    const referralsWithFloorNumbers = referralsResult.rows.map((ref, idx) => ({
      ...ref,
      floor_number: idx + 1
    }));
    console.log(`✅ Floor numbers added: ${referralsWithFloorNumbers.length} referrals`);
    
    // عدد الإحالات المعلقة (pending_listing)
    console.log(`📋 Fetching pending listing count...`);
    const pendingListingResult = await db.query(
      `SELECT COUNT(*) as count FROM referrals WHERE referrer_id = $1 AND status = 'pending_listing'`,
      [userId]
    );
    const pendingListingCount = parseInt(pendingListingResult.rows[0]?.count || 0);
    console.log(`✅ Pending listing count: ${pendingListingCount}`);
    
    console.log(`✅ All queries completed successfully, preparing response...`);
    console.log(`📊 Response data summary:`, {
      currentFloors,
      flaggedFloors,
      referralsCount: referralsWithFloorNumbers.length,
      consumptionsCount: consumptionsResult.rows.length
    });

    // تحضير البيانات بشكل آمن - تحويل أي Date objects إلى strings
    const safeReferrals = referralsWithFloorNumbers.map(ref => ({
      ...ref,
      created_at: ref.created_at ? new Date(ref.created_at).toISOString() : null,
      collapse_reason: ref.collapse_reason || null,
      collapsed_at: ref.collapsed_at ? new Date(ref.collapsed_at).toISOString() : null
    }));
    
    const safeFlaggedFloorsDetails = flaggedFloorsResult.rows.map(floor => ({
      ...floor,
      created_at: floor.created_at ? new Date(floor.created_at).toISOString() : null,
      collapse_reason: floor.collapse_reason || null,
      collapsed_at: floor.collapsed_at ? new Date(floor.collapsed_at).toISOString() : null
    }));
    
    const safeConsumptions = consumptionsResult.rows.map(cons => ({
      ...cons,
      consumed_at: cons.consumed_at ? new Date(cons.consumed_at).toISOString() : null
    }));
    
    const safePendingRequest = pendingRequestResult.rows[0] ? {
      ...pendingRequestResult.rows[0],
      created_at: pendingRequestResult.rows[0].created_at ? new Date(pendingRequestResult.rows[0].created_at).toISOString() : null,
      updated_at: pendingRequestResult.rows[0].updated_at ? new Date(pendingRequestResult.rows[0].updated_at).toISOString() : null,
      reviewed_at: pendingRequestResult.rows[0].reviewed_at ? new Date(pendingRequestResult.rows[0].reviewed_at).toISOString() : null
    } : null;

    const responseData = {
      ambassador_code: ambassadorCode || '',
      // الإحصائيات الرئيسية
      built_floors: currentFloors,
      collapsed_floors: flaggedFloors,
      healthy_floors: healthyFloors,
      floors_consumed: floorsConsumed,
      available_floors: availableFloors,
      pending_listing_count: pendingListingCount,
      // للتوافق مع الكود القديم
      current_floors: currentFloors,
      flagged_floors: flaggedFloors,
      flagged_floors_details: safeFlaggedFloorsDetails,
      total_floors_earned: user.total_floors_earned || currentFloors || 0,
      max_floors: settings.max_floors || 20,
      rewards_config: Array.isArray(rewards) ? rewards : [],
      available_reward: availableReward ? {
        floors: availableReward.floors,
        plan_name: availableReward.plan_name || '',
        plan_tier: availableReward.plan_tier || '',
        plan_months: availableReward.plan_months || 0
      } : null,
      can_consume: Boolean(canConsume),
      consumption_enabled: Boolean(settings.consumption_enabled),
      pending_request: safePendingRequest,
      referrals: safeReferrals,
      consumptions: safeConsumptions,
      // شروط الإحالة
      requirements: {
        require_first_listing: Boolean(settings.require_first_listing) || false,
        require_email_verified: Boolean(settings.require_email_verified) || false
      }
    };
    
    console.log(`✅ Response prepared, sending...`);
    try {
      res.json(responseData);
      console.log(`✅ Response sent successfully`);
    } catch (jsonError) {
      console.error('❌ JSON serialization error:', jsonError);
      throw jsonError;
    }
  } catch (error) {
    console.error('❌ Error in /my-stats:', error);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error detail:', error.detail);
    console.error('Error stack:', error.stack);
    
    // إرجاع رسالة خطأ واضحة
    const errorMessage = error.message || 'Unknown error';
    const errorDetail = error.detail || error.code || '';
    
    return res.status(500).json({ 
      error: "حدث خطأ أثناء جلب الإحصائيات",
      details: process.env.NODE_ENV === 'development' ? `${errorMessage} ${errorDetail}` : undefined,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// إزالة طابق منهار (soft-delete - تغيير الحالة فقط)
router.delete("/floor/:referralId", combinedAuthMiddleware, requireAmbassadorEnabled, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { referralId } = req.params;
  
  // التحقق من أن الإحالة تخص المستخدم وأنها موصومة
  const referralResult = await db.query(
    `SELECT r.*, u.name as referred_name, u.email as referred_email
     FROM referrals r
     JOIN users u ON u.id = r.referred_id
     WHERE r.id = $1 AND r.referrer_id = $2`,
    [referralId, userId]
  );
  
  if (referralResult.rows.length === 0) {
    return res.status(404).json({ error: "الإحالة غير موجودة" });
  }
  
  const referral = referralResult.rows[0];
  
  if (referral.status !== 'flagged_fraud') {
    return res.status(400).json({ error: "يمكن إزالة الطوابق المنهارة فقط" });
  }
  
  // Soft-delete: تغيير حالة الإحالة فقط بدون حذف المستخدم
  await db.query(
    `UPDATE referrals 
     SET status = 'removed', 
         updated_at = NOW() 
     WHERE id = $1`,
    [referralId]
  );
  
  console.log(`[Ambassador] Floor removed: referral ${referralId} by user ${userId}`);
  
  res.json({ 
    success: true, 
    message: "تم إزالة الطابق المنهار بنجاح. يمكنك الآن بناء طابق جديد!"
  });
}));

router.get("/validate/:code", asyncHandler(async (req, res) => {
  const { code } = req.params;
  
  if (!code) {
    return res.status(400).json({ valid: false, error: "الكود مطلوب" });
  }
  
  const normalizedCode = code.toUpperCase().trim();
  
  const result = await db.query(
    `SELECT id, name, ambassador_code, referral_code FROM users 
     WHERE ambassador_code = $1 OR referral_code = $1`,
    [normalizedCode]
  );
  
  if (result.rows.length === 0) {
    return res.json({ valid: false, error: "كود السفير غير صالح" });
  }
  
  res.json({ 
    valid: true, 
    referrer_name: result.rows[0].name || 'سفير البيت'
  });
}));

router.post("/request-reward", combinedAuthMiddleware, requireAmbassadorEnabled, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { requested_floors, reward_tier } = req.body || {};
  
  const existingRequest = await db.query(
    `SELECT * FROM ambassador_requests 
     WHERE user_id = $1 AND status IN ('pending', 'under_review')`,
    [userId]
  );
  
  if (existingRequest.rows.length > 0) {
    return res.status(400).json({ error: "لديك طلب قيد المراجعة بالفعل" });
  }
  
  const userResult = await db.query(
    `SELECT id FROM users WHERE id = $1`,
    [userId]
  );
  
  if (userResult.rows.length === 0) {
    return res.status(404).json({ error: "المستخدم غير موجود" });
  }
  
  // حساب الطوابق المبنية من جدول الإحالات (completed + flagged_fraud)
  const builtFloorsResult = await db.query(
    `SELECT COUNT(*) as count FROM referrals WHERE referrer_id = $1 AND status IN ('completed', 'flagged_fraud')`,
    [userId]
  );
  const builtFloors = parseInt(builtFloorsResult.rows[0]?.count || 0);
  
  // حساب الطوابق المنهارة
  const collapsedFloorsResult = await db.query(
    `SELECT COUNT(*) as count FROM referrals WHERE referrer_id = $1 AND status = 'flagged_fraud'`,
    [userId]
  );
  const collapsedFloors = parseInt(collapsedFloorsResult.rows[0]?.count || 0);
  
  // حساب الطوابق السليمة
  const healthyFloors = Math.max(0, builtFloors - collapsedFloors);
  
  // حساب الطوابق المستهلكة
  const consumedResult = await db.query(
    `SELECT COALESCE(SUM(floors_consumed), 0) as total FROM ambassador_consumptions WHERE user_id = $1`,
    [userId]
  );
  const floorsConsumed = Math.min(parseInt(consumedResult.rows[0]?.total || 0), healthyFloors);
  
  // الطوابق المتاحة للاستخدام
  const availableFloors = Math.max(0, healthyFloors - floorsConsumed);
  
  const settingsResult = await db.query(
    `SELECT floors_per_reward FROM ambassador_settings WHERE id = 1`
  );
  
  let rewards = settingsResult.rows[0]?.floors_per_reward || [];
  if (typeof rewards === 'string') rewards = JSON.parse(rewards);
  
  // إذا تم تحديد مستوى معين، استخدمه بدلاً من اختيار الأعلى تلقائياً
  let selectedReward;
  if (requested_floors && reward_tier) {
    // بحث مرن: يقبل plan_tier أو plan_name
    selectedReward = rewards.find(r => 
      r.floors === requested_floors && 
      (r.plan_tier === reward_tier || r.plan_name === reward_tier)
    );
    // إذا لم نجد بالـ floors المحدد، نبحث بالـ tier/name فقط
    if (!selectedReward) {
      selectedReward = rewards.find(r => 
        r.plan_tier === reward_tier || r.plan_name === reward_tier
      );
    }
    // إذا لا زلنا لم نجد، نختار أعلى مستوى متاح
    if (!selectedReward) {
      selectedReward = rewards
        .filter(r => r.floors <= availableFloors)
        .sort((a, b) => b.floors - a.floors)[0];
    }
    if (selectedReward && availableFloors < selectedReward.floors) {
      return res.status(400).json({ error: "لم تصل لهذا المستوى بعد" });
    }
  } else {
    // السلوك القديم: اختيار أعلى مستوى متاح (للتوافقية)
    selectedReward = rewards
      .filter(r => r.floors <= availableFloors)
      .sort((a, b) => b.floors - a.floors)[0];
  }
  
  if (!selectedReward) {
    return res.status(400).json({ error: "لم تصل للحد الأدنى للمكافأة بعد" });
  }
  
  await db.query(
    `INSERT INTO ambassador_requests 
     (user_id, floors_at_request, reward_tier, reward_description, status)
     VALUES ($1, $2, $3, $4, 'pending')`,
    [userId, selectedReward.floors, selectedReward.plan_tier, selectedReward.description]
  );
  
  await db.query(
    `INSERT INTO notifications (user_id, type, title, message)
     VALUES ($1, 'ambassador', 'تم إرسال طلب المكافأة', 'طلبك قيد المراجعة من الإدارة - ${selectedReward.plan_name || selectedReward.plan_tier}')`,
    [userId]
  );
  
  res.json({ 
    success: true, 
    message: "تم إرسال طلبك للإدارة بنجاح",
    reward: selectedReward
  });
}));

router.post("/consume", combinedAuthMiddleware, requireAmbassadorEnabled, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  const settingsResult = await db.query(
    `SELECT consumption_enabled, floors_per_reward FROM ambassador_settings WHERE id = 1`
  );
  
  if (!settingsResult.rows[0]?.consumption_enabled) {
    return res.status(400).json({ error: "الاستهلاك غير متاح حالياً" });
  }
  
  const userResult = await db.query(
    `SELECT id, total_floors_earned FROM users WHERE id = $1`,
    [userId]
  );
  
  if (userResult.rows.length === 0) {
    return res.status(404).json({ error: "المستخدم غير موجود" });
  }
  
  // حساب الطوابق المبنية من جدول الإحالات (completed + flagged_fraud)
  const builtFloorsResult = await db.query(
    `SELECT COUNT(*) as count FROM referrals WHERE referrer_id = $1 AND status IN ('completed', 'flagged_fraud')`,
    [userId]
  );
  const builtFloors = parseInt(builtFloorsResult.rows[0]?.count || 0);
  
  // حساب الطوابق المنهارة
  const collapsedFloorsResult = await db.query(
    `SELECT COUNT(*) as count FROM referrals WHERE referrer_id = $1 AND status = 'flagged_fraud'`,
    [userId]
  );
  const collapsedFloors = parseInt(collapsedFloorsResult.rows[0]?.count || 0);
  
  // حساب الطوابق السليمة
  const healthyFloors = Math.max(0, builtFloors - collapsedFloors);
  
  // حساب الطوابق المستهلكة سابقاً
  const consumedResult = await db.query(
    `SELECT COALESCE(SUM(floors_consumed), 0) as total FROM ambassador_consumptions WHERE user_id = $1`,
    [userId]
  );
  const floorsConsumed = Math.min(parseInt(consumedResult.rows[0]?.total || 0), healthyFloors);
  
  // الطوابق المتاحة للاستخدام
  const availableFloors = Math.max(0, healthyFloors - floorsConsumed);
  
  let rewards = settingsResult.rows[0]?.floors_per_reward || [];
  if (typeof rewards === 'string') rewards = JSON.parse(rewards);
  
  const availableReward = rewards
    .filter(r => r.floors <= availableFloors)
    .sort((a, b) => b.floors - a.floors)[0];
  
  if (!availableReward) {
    return res.status(400).json({ error: "لم تصل للحد الأدنى للمكافأة بعد" });
  }
  
  let planId = availableReward.plan_id;
  if (!planId) {
    const planResult = await db.query(
      `SELECT id, price FROM plans WHERE name_ar ILIKE $1 AND is_active = true ORDER BY price DESC LIMIT 1`,
      [`%${availableReward.plan_tier}%`]
    );
    planId = planResult.rows[0]?.id;
  }
  
  const months = availableReward.plan_months || 1;
  const floorsToConsume = availableReward.floors;
  
  if (planId) {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + months);
    
    // جلب سعر الخطة لإنشاء الفاتورة
    const planPriceResult = await db.query(
      `SELECT price FROM plans WHERE id = $1`,
      [planId]
    );
    const planPrice = planPriceResult.rows[0]?.price || 0;
    
    const userPlanResult = await db.query(
      `INSERT INTO user_plans (user_id, plan_id, status, start_date, expires_at, source, payment_amount)
       VALUES ($1, $2, 'active', $3, $4, 'ambassador_reward', 0)
       RETURNING id`,
      [userId, planId, startDate, endDate]
    );
    
    // إنشاء فاتورة مجانية (لتتبع المكافآت في النظام المالي)
    await db.query(
      `INSERT INTO invoices (user_id, user_plan_id, amount, discount_amount, final_amount, status, payment_method, notes)
       VALUES ($1, $2, $3, $3, 0, 'paid', 'ambassador_reward', $4)`,
      [userId, userPlanResult.rows[0].id, planPrice, `مكافأة سفير البيت - ${floorsToConsume} طابق`]
    );
    
    await db.query(
      `INSERT INTO ambassador_consumptions 
       (user_id, floors_consumed, reward_plan_id, reward_months, user_plan_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, floorsToConsume, planId, months, userPlanResult.rows[0].id, availableReward.description]
    );
  } else {
    await db.query(
      `INSERT INTO ambassador_consumptions 
       (user_id, floors_consumed, reward_months, notes)
       VALUES ($1, $2, $3, $4)`,
      [userId, floorsToConsume, months, availableReward.description]
    );
  }
  
  const totalEarned = (userResult.rows[0].total_floors_earned || 0) + floorsToConsume;
  await db.query(
    `UPDATE users SET 
      ambassador_floors = 0, 
      referral_count = 0,
      total_floors_earned = $2
     WHERE id = $1`,
    [userId, totalEarned]
  );
  
  await db.query(
    `INSERT INTO notifications (user_id, type, title, message)
     VALUES ($1, 'ambassador', 'تم استهلاك رصيدك بنجاح! 🎉', 'تم تفعيل المكافأة وبدأت عمارة جديدة')`,
    [userId]
  );
  
  res.json({ 
    success: true, 
    message: "تم استهلاك رصيدك بنجاح وبدأت عمارة جديدة!",
    reward: availableReward,
    new_floors: 0
  });
}));

router.get("/admin/stats", authMiddleware, requireRoles('super_admin', 'support_admin', 'finance_admin'), asyncHandler(async (req, res) => {
  const statsResult = await db.query(`
    SELECT 
      (SELECT COUNT(DISTINCT u.id) FROM users u WHERE u.ambassador_floors > 0 OR u.referral_count > 0)::int as active_ambassadors,
      (SELECT COUNT(*) FROM ambassador_requests WHERE status IN ('pending', 'under_review'))::int as pending_requests,
      (SELECT COUNT(*) FROM ambassador_withdrawal_requests WHERE status = 'pending')::int as pending_withdrawal_requests,
      (SELECT COUNT(*) FROM ambassador_consumptions WHERE consumed_at::date = CURRENT_DATE)::int as consumptions_today,
      (SELECT COUNT(*) FROM referrals WHERE status = 'completed')::int as total_referrals,
      (SELECT COALESCE(SUM(floors_consumed), 0) FROM ambassador_consumptions)::int as total_floors_consumed
  `);
  
  const topAmbassadors = await db.query(`
    SELECT u.id, u.name, u.email, 
           COALESCE(u.ambassador_floors, u.referral_count, 0) as current_floors,
           u.total_floors_earned,
           u.ambassador_code
    FROM users u
    WHERE COALESCE(u.ambassador_floors, u.referral_count, 0) > 0
    ORDER BY COALESCE(u.ambassador_floors, u.referral_count, 0) DESC
    LIMIT 10
  `);
  
  const response = {
    stats: statsResult.rows[0],
    top_ambassadors: topAmbassadors.rows
  };
  
  console.log('📊 Sending ambassador stats response:', response);
  res.json(response);
}));

router.get("/admin/requests", authMiddleware, requireRoles('super_admin', 'support_admin'), asyncHandler(async (req, res) => {
  const { status = 'all', page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  
  let whereClause = '';
  const params = [parseInt(limit), offset];
  
  if (status !== 'all') {
    whereClause = 'WHERE ar.status = $3';
    params.push(status);
  }
  
  const result = await db.query(`
    SELECT 
      ar.*,
      u.name as user_name, u.email as user_email,
      u.ambassador_code, u.ambassador_floors,
      reviewer.name as reviewer_name
    FROM ambassador_requests ar
    JOIN users u ON u.id = ar.user_id
    LEFT JOIN users reviewer ON reviewer.id = ar.reviewed_by
    ${whereClause}
    ORDER BY ar.created_at DESC
    LIMIT $1 OFFSET $2
  `, params);
  
  const countParams = status !== 'all' ? [status] : [];
  const countResult = await db.query(
    `SELECT COUNT(*) FROM ambassador_requests ${status !== 'all' ? 'WHERE status = $1' : ''}`,
    countParams
  );
  
  res.json({
    requests: result.rows,
    total: parseInt(countResult.rows[0].count),
    page: parseInt(page),
    limit: parseInt(limit)
  });
}));

router.get("/admin/requests/:id/details", authMiddleware, requireRoles('super_admin', 'support_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const requestResult = await db.query(`
    SELECT 
      ar.*,
      u.id as user_id, u.name as user_name, u.email as user_email, u.phone,
      u.ambassador_code, u.ambassador_floors, u.referral_count,
      u.created_at as user_joined_at,
      u.total_floors_earned,
      reviewer.name as reviewer_name
    FROM ambassador_requests ar
    JOIN users u ON u.id = ar.user_id
    LEFT JOIN users reviewer ON reviewer.id = ar.reviewed_by
    WHERE ar.id = $1
  `, [id]);
  
  if (requestResult.rows.length === 0) {
    return res.status(404).json({ error: "الطلب غير موجود" });
  }
  
  const request = requestResult.rows[0];
  
  const referralsResult = await db.query(`
    SELECT 
      r.id, r.created_at,
      referred.id as referred_id, referred.name as referred_name, 
      referred.email as referred_email, referred.phone as referred_phone,
      referred.created_at as referred_joined,
      r.status
    FROM referrals r
    JOIN users referred ON referred.id = r.referred_id
    WHERE r.referrer_id = $1
    ORDER BY r.created_at DESC
    LIMIT 50
  `, [request.user_id]);
  
  const otherRequestsResult = await db.query(`
    SELECT id, status, floors_at_request, reward_tier, created_at, reviewed_at
    FROM ambassador_requests
    WHERE user_id = $1 AND id != $2
    ORDER BY created_at DESC
    LIMIT 10
  `, [request.user_id, id]);
  
  res.json({
    request,
    referrals: referralsResult.rows,
    other_requests: otherRequestsResult.rows,
    summary: {
      total_referrals: referralsResult.rows.length,
      completed_referrals: referralsResult.rows.filter(r => r.status === 'completed').length,
      days_since_joined: Math.floor((Date.now() - new Date(request.user_joined_at).getTime()) / (1000 * 60 * 60 * 24)),
      previous_requests_count: otherRequestsResult.rows.length
    }
  });
}));

router.post("/admin/requests/:id/review", authMiddleware, requireRoles('super_admin', 'support_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action, admin_notes, plan_id, plan_months } = req.body;
  const adminId = req.user.id;
  
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: "إجراء غير صالح" });
  }
  
  const requestResult = await db.query(
    `SELECT ar.*, u.name, u.email FROM ambassador_requests ar
     JOIN users u ON u.id = ar.user_id
     WHERE ar.id = $1`,
    [id]
  );
  
  if (requestResult.rows.length === 0) {
    return res.status(404).json({ error: "الطلب غير موجود" });
  }
  
  const request = requestResult.rows[0];
  
  if (request.status !== 'pending' && request.status !== 'under_review') {
    return res.status(400).json({ error: "تم معالجة هذا الطلب مسبقاً" });
  }
  
  const newStatus = action === 'approve' ? 'approved' : 'rejected';
  
  await db.query(
    `UPDATE ambassador_requests SET 
      status = $1, admin_notes = $2, reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW()
     WHERE id = $4`,
    [newStatus, admin_notes, adminId, id]
  );
  
  if (action === 'approve') {
    const floorsToConsume = request.floors_at_request;
    
    // تسجيل الاستهلاك في جدول ambassador_consumptions
    await db.query(`
      INSERT INTO ambassador_consumptions (user_id, floors_consumed, reward_plan_id, reward_months, notes)
      VALUES ($1, $2, $3, $4, $5)
    `, [request.user_id, floorsToConsume, plan_id || null, plan_months || 1, `طلب رقم ${id}`]);
    
    // خصم الطوابق من رصيد المستخدم
    await db.query(`
      UPDATE users SET 
        ambassador_floors = GREATEST(0, COALESCE(ambassador_floors, 0) - $1),
        referral_count = GREATEST(0, COALESCE(referral_count, 0) - $1)
      WHERE id = $2
    `, [floorsToConsume, request.user_id]);
    
    // إذا تم تحديد باقة، نضيفها للمستخدم
    if (plan_id) {
      const months = plan_months || 1;
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + months);
      
      await db.query(
        `INSERT INTO user_plans (user_id, plan_id, status, start_date, expires_at, source, payment_amount)
         VALUES ($1, $2, 'active', $3, $4, 'ambassador_reward', 0)`,
        [request.user_id, plan_id, startDate, endDate]
      );
    }
  }
  
  const notificationTitle = action === 'approve' ? '🎁 مبروك! تم قبول طلب هدية سفير' : 'تم مراجعة طلبك';
  const notificationMessage = action === 'approve' 
    ? `🎉 تهانينا يا سفيرنا المميز! تم تفعيل هديتك بنجاح. استمتع بباقتك المجانية واستمر في نشر كود الإحالة الخاص بك للحصول على المزيد من الهدايا الرائعة! 🌟` 
    : admin_notes || 'للأسف لم يتم قبول طلبك في الوقت الحالي';
  
  await db.query(
    `INSERT INTO notifications (user_id, type, title, message)
     VALUES ($1, 'ambassador', $2, $3)`,
    [request.user_id, notificationTitle, notificationMessage]
  );
  
  res.json({ 
    success: true, 
    message: action === 'approve' ? 'تم قبول الطلب بنجاح' : 'تم رفض الطلب'
  });
}));

router.get("/admin/chart-data", authMiddleware, requireRoles('super_admin', 'support_admin', 'finance_admin', 'content_admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;
  const daysInt = Math.min(Math.max(parseInt(days) || 30, 1), 90);
  
  const referralsData = await db.query(`
    SELECT 
      DATE(created_at)::text as date,
      COUNT(*)::int as count
    FROM referrals
    WHERE created_at >= NOW() - INTERVAL '${daysInt} days'
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `);
  
  const consumptionsData = await db.query(`
    SELECT 
      DATE(consumed_at)::text as date,
      COUNT(*)::int as count,
      COALESCE(SUM(floors_consumed), 0)::int as floors
    FROM ambassador_consumptions
    WHERE consumed_at >= NOW() - INTERVAL '${daysInt} days'
    GROUP BY DATE(consumed_at)
    ORDER BY date ASC
  `);
  
  const dateRange = [];
  const today = new Date();
  for (let i = daysInt - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dateRange.push(d.toISOString().split('T')[0]);
  }
  
  const referralsMap = new Map(referralsData.rows.map(r => [r.date, r.count]));
  const consumptionsMap = new Map(consumptionsData.rows.map(r => [r.date, {
    count: r.count,
    floors: r.floors
  }]));
  
  const chartData = dateRange.map(date => ({
    date,
    referrals: referralsMap.get(date) || 0,
    consumptions: consumptionsMap.get(date)?.count || 0,
    floors_consumed: consumptionsMap.get(date)?.floors || 0,
  }));
  
  res.json(chartData);
}));

router.get("/admin/stats-overview", authMiddleware, requireRoles('super_admin', 'support_admin', 'finance_admin'), asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT 
      (SELECT COUNT(*) FROM users WHERE ambassador_code IS NOT NULL)::int as total_ambassadors,
      (SELECT COUNT(*) FROM referrals)::int as total_referrals,
      (SELECT COUNT(*) FROM ambassador_consumptions)::int as total_rewards_given,
      (SELECT COUNT(*) FROM ambassador_requests WHERE status IN ('pending', 'under_review'))::int as pending_requests,
      (SELECT COUNT(*) FROM ambassador_withdrawal_requests WHERE status = 'pending')::int as pending_withdrawal_requests,
      (SELECT COUNT(*) FROM users WHERE ambassador_floors > 0)::int as active_buildings
  `);
  res.json(result.rows[0]);
}));

router.get("/admin/top", authMiddleware, requireRoles('super_admin', 'support_admin', 'finance_admin'), asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT id, name, ambassador_code, ambassador_floors, total_floors_earned
    FROM users
    WHERE ambassador_floors > 0 OR total_floors_earned > 0
    ORDER BY COALESCE(ambassador_floors, 0) DESC, COALESCE(total_floors_earned, 0) DESC
    LIMIT 10
  `);
  res.json({ ambassadors: result.rows });
}));

router.post("/admin/requests/:id/approve", authMiddleware, requireRoles('super_admin', 'support_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminId = req.user.id;
  
  const requestResult = await db.query(`SELECT * FROM ambassador_requests WHERE id = $1`, [id]);
  if (requestResult.rows.length === 0) {
    return res.status(404).json({ error: "الطلب غير موجود" });
  }
  
  const request = requestResult.rows[0];
  if (request.status !== 'pending' && request.status !== 'under_review') {
    return res.status(400).json({ error: "تم معالجة هذا الطلب مسبقاً" });
  }
  
  const floorsToConsume = request.floors_at_request;
  
  // جلب إعدادات المكافآت للعثور على الباقة المناسبة
  const settingsResult = await db.query(`SELECT floors_per_reward FROM ambassador_settings WHERE id = 1`);
  const settings = settingsResult.rows[0] || {};
  let rewards = settings.floors_per_reward || [];
  if (typeof rewards === 'string') rewards = JSON.parse(rewards);
  
  // البحث عن المكافأة المناسبة بناءً على عدد الطوابق
  const matchedReward = rewards.find(r => r.floors === floorsToConsume) || rewards[0];
  const planName = matchedReward?.plan_name || request.reward_tier;
  
  // جلب الباقة المناسبة بناءً على اسم الباقة
  let plan = null;
  if (planName) {
    const planResult = await db.query(
      `SELECT id, name_ar FROM plans WHERE name_ar ILIKE $1 OR name_ar ILIKE $2 LIMIT 1`,
      [`%${planName}%`, planName]
    );
    plan = planResult.rows[0];
  }
  
  // تحديث حالة الطلب
  await db.query(`
    UPDATE ambassador_requests 
    SET status = 'approved', processed_by = $1, processed_at = NOW()
    WHERE id = $2
  `, [adminId, id]);
  
  // تسجيل الاستهلاك
  await db.query(`
    INSERT INTO ambassador_consumptions (user_id, floors_consumed, reward_plan_id, notes)
    VALUES ($1, $2, $3, $4)
  `, [request.user_id, floorsToConsume, plan?.id || null, `طلب رقم ${id}`]);
  
  // خصم الطوابق من رصيد المستخدم
  await db.query(`
    UPDATE users SET 
      ambassador_floors = GREATEST(0, COALESCE(ambassador_floors, 0) - $1),
      referral_count = GREATEST(0, COALESCE(referral_count, 0) - $1)
    WHERE id = $2
  `, [floorsToConsume, request.user_id]);
  
  // منح الباقة للمستخدم إذا وجدت
  if (plan) {
    const months = matchedReward?.plan_months || 1;
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + months);
    
    await db.query(`
      INSERT INTO user_plans (user_id, plan_id, status, started_at, expires_at, paid_amount)
      VALUES ($1, $2, 'active', $3, $4, 0)
    `, [request.user_id, plan.id, startDate, endDate]);
  }
  
  await db.query(`
    INSERT INTO notifications (user_id, type, title, message)
    VALUES ($1, 'ambassador', '🎁 مبروك! تم قبول طلب هدية سفير', '🎉 تهانينا يا سفيرنا المميز! تم تفعيل هديتك بنجاح. استمتع بباقتك المجانية واستمر في نشر كود الإحالة للحصول على المزيد من الهدايا! 🌟')
  `, [request.user_id]);
  
  res.json({ success: true, message: "تم قبول الطلب بنجاح" });
}));

// إلغاء الطلب من قبل المستخدم نفسه
router.delete("/cancel-request", combinedAuthMiddleware, requireAmbassadorEnabled, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  const result = await db.query(
    `DELETE FROM ambassador_requests 
     WHERE user_id = $1 AND status IN ('pending', 'under_review')
     RETURNING *`,
    [userId]
  );
  
  if (result.rowCount === 0) {
    return res.status(404).json({ error: "لا يوجد طلب معلق" });
  }
  
  res.json({ success: true, message: "تم إلغاء الطلب بنجاح", deleted: result.rowCount });
}));

// حذف جميع الطلبات المعلقة (للإدارة)
router.delete("/admin/clear-pending", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const result = await db.query(
    `DELETE FROM ambassador_requests WHERE status IN ('pending', 'under_review') RETURNING *`
  );
  
  res.json({ success: true, message: `تم حذف ${result.rowCount} طلب`, deleted: result.rowCount });
}));

router.post("/admin/requests/:id/reject", authMiddleware, requireRoles('super_admin', 'support_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const adminId = req.user.id;
  
  const requestResult = await db.query(`SELECT * FROM ambassador_requests WHERE id = $1`, [id]);
  if (requestResult.rows.length === 0) {
    return res.status(404).json({ error: "الطلب غير موجود" });
  }
  
  const request = requestResult.rows[0];
  if (request.status !== 'pending' && request.status !== 'under_review') {
    return res.status(400).json({ error: "تم معالجة هذا الطلب مسبقاً" });
  }
  
  await db.query(`
    UPDATE ambassador_requests 
    SET status = 'rejected', admin_notes = $1, processed_by = $2, processed_at = NOW()
    WHERE id = $3
  `, [reason || '', adminId, id]);
  
  await db.query(`
    INSERT INTO notifications (user_id, type, title, message)
    VALUES ($1, 'ambassador', 'تم مراجعة طلبك', $2)
  `, [request.user_id, reason || 'للأسف لم يتم قبول طلبك في الوقت الحالي']);
  
  res.json({ success: true, message: "تم رفض الطلب" });
}));

router.post("/admin/requests/:id/analyze", authMiddleware, requireRoles('super_admin', 'support_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await analyzeAmbassadorRequest(id);
    res.json(result);
  } catch (error) {
    console.error('AI Analysis error:', error);
    res.status(500).json({ error: error.message || 'حدث خطأ أثناء التحليل' });
  }
}));

router.post("/admin/referrals/:referralId/flag-fraud", authMiddleware, requireRoles('super_admin', 'support_admin'), asyncHandler(async (req, res) => {
  const { referralId } = req.params;
  const { deduct_floor, reason } = req.body;
  const adminId = req.user.id;
  
  const referralResult = await db.query(`
    SELECT r.*, r.referrer_id, u.name as referrer_name, u.ambassador_floors,
           referred.name as referred_name, referred.email as referred_email
    FROM referrals r
    JOIN users u ON u.id = r.referrer_id
    JOIN users referred ON referred.id = r.referred_id
    WHERE r.id = $1
  `, [referralId]);
  
  if (referralResult.rows.length === 0) {
    return res.status(404).json({ error: "الإحالة غير موجودة" });
  }
  
  const referral = referralResult.rows[0];
  
  if (referral.status === 'flagged_fraud') {
    return res.status(400).json({ error: "تم وصم هذه الإحالة مسبقاً" });
  }
  
  await db.query(`
    UPDATE referrals SET status = 'flagged_fraud', updated_at = NOW()
    WHERE id = $1
  `, [referralId]);
  
  let floorsDeducted = 0;
  if (deduct_floor && referral.ambassador_floors > 0) {
    await db.query(`
      UPDATE users SET ambassador_floors = ambassador_floors - 1, updated_at = NOW()
      WHERE id = $1 AND ambassador_floors > 0
    `, [referral.referrer_id]);
    floorsDeducted = 1;
    
    await db.query(`
      INSERT INTO ambassador_consumptions (user_id, floors_consumed, notes)
      VALUES ($1, 1, $2)
    `, [referral.referrer_id, `خصم بسبب إحالة متلاعبة: ${referral.referred_name} - بواسطة المسؤول #${adminId}` + (reason ? ` - السبب: ${reason}` : '')]);
  }
  
  await db.query(`
    INSERT INTO admin_audit_logs (admin_id, action, resource_type, resource_id, details)
    VALUES ($1, 'flag_referral_fraud', 'referral', $2, $3)
  `, [adminId, referralId, JSON.stringify({
    referrer_id: referral.referrer_id,
    referrer_name: referral.referrer_name,
    referred_name: referral.referred_name,
    referred_email: referral.referred_email,
    reason,
    floors_deducted: floorsDeducted
  })]);
  
  res.json({ 
    success: true, 
    message: floorsDeducted > 0 ? "تم وصم الإحالة وخصم طابق" : "تم وصم الإحالة كمتلاعبة",
    floors_deducted: floorsDeducted
  });
}));

router.post("/admin/referrals/:referralId/unflag", authMiddleware, requireRoles('super_admin', 'support_admin'), asyncHandler(async (req, res) => {
  const { referralId } = req.params;
  const adminId = req.user.id;
  
  const referralResult = await db.query(`
    SELECT r.*, referred.name as referred_name
    FROM referrals r
    JOIN users referred ON referred.id = r.referred_id
    WHERE r.id = $1
  `, [referralId]);
  
  if (referralResult.rows.length === 0) {
    return res.status(404).json({ error: "الإحالة غير موجودة" });
  }
  
  const referral = referralResult.rows[0];
  
  if (referral.status !== 'flagged_fraud') {
    return res.status(400).json({ error: "هذه الإحالة ليست موصومة" });
  }
  
  await db.query(`
    UPDATE referrals SET status = 'completed', updated_at = NOW()
    WHERE id = $1
  `, [referralId]);
  
  await db.query(`
    INSERT INTO admin_audit_logs (admin_id, action, resource_type, resource_id, details)
    VALUES ($1, 'unflag_referral', 'referral', $2, $3)
  `, [adminId, referralId, JSON.stringify({ referred_name: referral.referred_name })]);
  
  res.json({ success: true, message: "تم إلغاء وصم الإحالة" });
}));

// جلب مباني سفير معين مقسمة حسب المباني (كل 20 طابق = مبنى)
router.get("/admin/ambassadors/:userId/buildings", authMiddleware, requireRoles('super_admin', 'support_admin'), asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const floorsPerBuilding = 20;
  
  // جلب معلومات السفير
  const userResult = await db.query(
    `SELECT id, name, email, ambassador_code, referral_code FROM users WHERE id = $1`,
    [userId]
  );
  
  if (userResult.rows.length === 0) {
    return res.status(404).json({ error: "المستخدم غير موجود" });
  }
  
  const user = userResult.rows[0];
  
  // جلب جميع الإحالات مرتبة بالتاريخ مع رقم الطابق
  const referralsResult = await db.query(`
    SELECT 
      r.id, r.status, r.created_at, r.collapse_reason, r.collapsed_at, r.flag_reason,
      u.name as referred_name, u.email as referred_email, u.phone as referred_phone,
      ROW_NUMBER() OVER (ORDER BY r.created_at ASC) as floor_number
    FROM referrals r
    JOIN users u ON u.id = r.referred_id
    WHERE r.referrer_id = $1 AND r.status IN ('completed', 'flagged_fraud')
    ORDER BY r.created_at ASC
  `, [userId]);
  
  const referrals = referralsResult.rows;
  const totalFloors = referrals.length;
  const totalBuildings = Math.ceil(totalFloors / floorsPerBuilding);
  
  // تقسيم الإحالات إلى مباني
  const buildings = [];
  for (let i = 0; i < totalBuildings; i++) {
    const startFloor = i * floorsPerBuilding;
    const endFloor = Math.min((i + 1) * floorsPerBuilding, totalFloors);
    const buildingFloors = referrals.slice(startFloor, endFloor);
    
    const flaggedCount = buildingFloors.filter(f => f.status === 'flagged_fraud').length;
    const completedCount = buildingFloors.filter(f => f.status === 'completed').length;
    
    buildings.push({
      building_number: i + 1,
      floors: buildingFloors.map(f => ({
        ...f,
        floor_in_building: parseInt(f.floor_number) - startFloor // رقم الطابق داخل المبنى (1-20)
      })),
      total_floors: buildingFloors.length,
      completed_floors: completedCount,
      flagged_floors: flaggedCount,
      has_issues: flaggedCount > 0,
      is_complete: buildingFloors.length === floorsPerBuilding
    });
  }
  
  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      ambassador_code: user.ambassador_code || user.referral_code
    },
    total_floors: totalFloors,
    total_buildings: totalBuildings,
    floors_per_building: floorsPerBuilding,
    buildings
  });
}));

// جلب قائمة السفراء مع إحصائيات المباني
router.get("/admin/ambassadors-list", authMiddleware, requireRoles('super_admin', 'support_admin'), asyncHandler(async (req, res) => {
  const floorsPerBuilding = 20;
  
  const result = await db.query(`
    SELECT 
      u.id, u.name, u.email, u.ambassador_code, u.referral_code,
      COUNT(r.id) FILTER (WHERE r.status IN ('completed', 'flagged_fraud')) as total_floors,
      COUNT(r.id) FILTER (WHERE r.status = 'flagged_fraud') as flagged_floors,
      COUNT(r.id) FILTER (WHERE r.status = 'completed') as completed_floors
    FROM users u
    LEFT JOIN referrals r ON r.referrer_id = u.id
    WHERE u.ambassador_code IS NOT NULL OR u.referral_code IS NOT NULL
    GROUP BY u.id, u.name, u.email, u.ambassador_code, u.referral_code
    HAVING COUNT(r.id) FILTER (WHERE r.status IN ('completed', 'flagged_fraud')) > 0
    ORDER BY total_floors DESC
  `);
  
  const ambassadors = result.rows.map(a => {
    const totalFloors = parseInt(a.total_floors);
    const totalBuildings = Math.ceil(totalFloors / floorsPerBuilding);
    const flaggedFloors = parseInt(a.flagged_floors);
    
    return {
      ...a,
      total_floors: totalFloors,
      total_buildings: totalBuildings,
      flagged_floors: flaggedFloors,
      completed_floors: parseInt(a.completed_floors),
      has_issues: flaggedFloors > 0,
      ambassador_code: a.ambassador_code || a.referral_code
    };
  });
  
  res.json({ ambassadors });
}));

router.get("/admin/settings", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const result = await db.query(`SELECT * FROM ambassador_settings WHERE id = 1`);
  res.json(result.rows[0] || {});
}));

router.put("/admin/settings", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const { 
    max_floors, floors_per_reward, require_email_verified, 
    require_phone_verified, require_first_listing, min_days_active,
    consumption_enabled, motivational_messages 
  } = req.body;
  
  await db.query(`
    UPDATE ambassador_settings SET
      max_floors = COALESCE($1, max_floors),
      floors_per_reward = COALESCE($2, floors_per_reward),
      require_email_verified = COALESCE($3, require_email_verified),
      require_phone_verified = COALESCE($4, require_phone_verified),
      require_first_listing = COALESCE($5, require_first_listing),
      min_days_active = COALESCE($6, min_days_active),
      consumption_enabled = COALESCE($7, consumption_enabled),
      motivational_messages = COALESCE($8, motivational_messages),
      updated_at = NOW(),
      updated_by = $9
    WHERE id = 1
  `, [
    max_floors, 
    floors_per_reward ? JSON.stringify(floors_per_reward) : null,
    require_email_verified,
    require_phone_verified,
    require_first_listing,
    min_days_active,
    consumption_enabled,
    motivational_messages ? JSON.stringify(motivational_messages) : null,
    req.user.id
  ]);
  
  res.json({ success: true, message: "تم حفظ الإعدادات بنجاح" });
}));

router.get("/share-text", requireAmbassadorEnabled, asyncHandler(async (req, res) => {
  const result = await db.query(`SELECT share_text_config FROM ambassador_settings WHERE id = 1`);
  const settings = result.rows[0];
  
  let config = settings?.share_text_config;
  if (typeof config === 'string') {
    config = JSON.parse(config);
  }
  
  const defaultConfig = {
    main_title: "🏠 انضم لعالم العقارات مع بيت الجزيرة!",
    code_line: "✨ استخدم كود السفير: {CODE}",
    benefit_line: "🎁 احصل على مميزات حصرية",
    cta_line: "سجل الآن:"
  };
  
  res.json(config || defaultConfig);
}));

router.get("/admin/share-text", authMiddleware, requireRoles('super_admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const result = await db.query(`SELECT share_text_config FROM ambassador_settings WHERE id = 1`);
  const settings = result.rows[0];
  
  let config = settings?.share_text_config;
  if (typeof config === 'string') {
    config = JSON.parse(config);
  }
  
  const defaultConfig = {
    main_title: "🏠 انضم لعالم العقارات مع بيت الجزيرة!",
    code_line: "✨ استخدم كود السفير: {CODE}",
    benefit_line: "🎁 احصل على مميزات حصرية",
    cta_line: "سجل الآن:"
  };
  
  res.json(config || defaultConfig);
}));

router.put("/admin/share-text", authMiddleware, requireRoles('super_admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const { main_title, code_line, benefit_line, cta_line } = req.body;
  
  const config = {
    main_title: main_title || "",
    code_line: code_line || "",
    benefit_line: benefit_line || "",
    cta_line: cta_line || ""
  };
  
  await db.query(`
    UPDATE ambassador_settings 
    SET share_text_config = $1, updated_at = NOW(), updated_by = $2
    WHERE id = 1
  `, [JSON.stringify(config), req.user.id]);
  
  res.json({ success: true, message: "تم حفظ نصوص المشاركة بنجاح" });
}));

router.post("/admin/ai-suggest-share-text", authMiddleware, requireRoles('super_admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const { type = 'all', current_text = '' } = req.body;
  
  const OpenAI = require("openai");
  const openai = new OpenAI();
  
  const prompts = {
    main_title: `أنت خبير تسويق عقاري سعودي. اقترح عنوان جذاب وقصير (أقل من 50 حرف) لدعوة أصدقاء للتسجيل في منصة عقارية سعودية. يجب أن يكون:
- باللغة العربية الفصحى
- مناسب للسوق السعودي والخليجي
- يحتوي على إيموجي واحد أو اثنين كحد أقصى
- يشجع على المشاركة
النص الحالي للإلهام: ${current_text}

اكتب العنوان فقط بدون شرح.`,

    code_line: `أنت خبير تسويق. اكتب سطر قصير (أقل من 40 حرف) يدعو لاستخدام كود الإحالة. استخدم {CODE} كمكان للكود.
- باللغة العربية
- جذاب ومختصر
- إيموجي واحد فقط
النص الحالي: ${current_text}

اكتب السطر فقط.`,

    benefit_line: `أنت خبير تسويق عقاري. اكتب سطر قصير (أقل من 40 حرف) يوضح فائدة التسجيل عبر الكود.
- باللغة العربية
- يركز على الفائدة للمستخدم
- إيموجي واحد
النص الحالي: ${current_text}

اكتب السطر فقط.`,

    cta_line: `اكتب عبارة دعوة للعمل (CTA) قصيرة جداً (أقل من 15 حرف) لدعوة التسجيل.
- بالعربية
- بسيطة ومباشرة
- بدون إيموجي
النص الحالي: ${current_text}

اكتب العبارة فقط.`,

    all: `أنت خبير تسويق عقاري سعودي. اكتب رسالة مشاركة كاملة لبرنامج إحالة عقاري. يجب أن تتكون من 4 أسطر:

1. عنوان رئيسي جذاب (مع إيموجي)
2. سطر يحث على استخدام الكود (استخدم {CODE} كمكان للكود)
3. سطر يوضح الفائدة (مع إيموجي)
4. دعوة للتسجيل بسيطة

المتطلبات:
- باللغة العربية الفصحى
- مناسب للسوق السعودي والخليجي
- احترافي وجذاب
- إيموجي مناسبة (ليست كثيرة)

اكتب الرسالة بالتنسيق التالي فقط (كل سطر في سطر جديد):
العنوان
سطر الكود
سطر الفائدة
دعوة التسجيل`
  };

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "أنت مساعد تسويق متخصص في العقارات السعودية. تكتب نصوص تسويقية احترافية وجذابة." },
        { role: "user", content: prompts[type] || prompts.all }
      ],
      max_tokens: 300,
      temperature: 0.8
    });

    const suggestion = response.choices[0].message.content.trim();

    if (type === 'all') {
      const lines = suggestion.split('\n').filter(l => l.trim());
      res.json({
        success: true,
        suggestion: {
          main_title: lines[0] || "",
          code_line: lines[1] || "",
          benefit_line: lines[2] || "",
          cta_line: lines[3] || ""
        }
      });
    } else {
      res.json({
        success: true,
        suggestion: suggestion
      });
    }
  } catch (error) {
    console.error('AI suggestion error:', error);
    res.status(500).json({ 
      error: "حدث خطأ في توليد الاقتراح",
      fallback: type === 'all' ? {
        main_title: "🏠 ابحث عن منزل أحلامك بكل يسر وسهولة!",
        code_line: "✨ استخدم كود السفير: {CODE}",
        benefit_line: "🎁 واحصل على مميزات حصرية",
        cta_line: "سجل الآن:"
      } : "ابحث عن منزل أحلامك بكل يسر وسهولة!"
    });
  }
}));

// =====================================
// 💰 WALLET SYSTEM - نظام المحفظة المالية
// =====================================

// Get wallet info for authenticated user
router.get('/wallet', combinedAuthMiddleware, requireAmbassadorEnabled, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  // Get or create wallet
  let wallet = await db.query(`
    SELECT * FROM ambassador_wallet WHERE user_id = $1
  `, [userId]);
  
  if (wallet.rows.length === 0) {
    await db.query(`
      INSERT INTO ambassador_wallet (user_id) VALUES ($1)
    `, [userId]);
    wallet = await db.query(`SELECT * FROM ambassador_wallet WHERE user_id = $1`, [userId]);
  }
  
  // Get settings
  const settings = await db.query(`SELECT buildings_per_dollar, financial_rewards_enabled, min_withdrawal_cents FROM ambassador_settings WHERE id = 1`);
  const buildingsPerDollar = settings.rows[0]?.buildings_per_dollar || 5;
  const minWithdrawalCents = settings.rows[0]?.min_withdrawal_cents || 100;
  const financialRewardsEnabled = settings.rows[0]?.financial_rewards_enabled || false;
  
  // === حساب الرصيد الفعلي من الطوابق المتاحة ===
  // جلب عدد الطوابق المبنية (completed + flagged_fraud)
  const allFloorsResult = await db.query(
    `SELECT COUNT(*) as count FROM referrals WHERE referrer_id = $1 AND status IN ('completed', 'flagged_fraud')`,
    [userId]
  );
  const currentFloors = parseInt(allFloorsResult.rows[0]?.count || 0);
  
  // جلب عدد الطوابق المنهارة
  const flaggedResult = await db.query(
    `SELECT COUNT(*) as count FROM referrals WHERE referrer_id = $1 AND status = 'flagged_fraud'`,
    [userId]
  );
  const flaggedFloors = parseInt(flaggedResult.rows[0]?.count || 0);
  
  // جلب مجموع الطوابق المستهلكة
  const consumedResult = await db.query(
    `SELECT COALESCE(SUM(floors_consumed), 0) as total FROM ambassador_consumptions WHERE user_id = $1`,
    [userId]
  );
  const floorsConsumed = Math.min(parseInt(consumedResult.rows[0]?.total || 0), currentFloors);
  
  // حساب الطوابق السليمة والمتاحة
  const healthyFloors = Math.max(0, currentFloors - flaggedFloors);
  const availableFloors = Math.max(0, healthyFloors - floorsConsumed);
  
  // حساب المباني المكتملة والرصيد الإجمالي بالسنتات
  const completedBuildings = Math.floor(availableFloors / 20);
  const grossBalanceCents = Math.floor((completedBuildings / buildingsPerDollar) * 100);
  
  // جلب الأموال المحجوزة (pending withdrawals)
  const pendingWithdrawalsResult = await db.query(`
    SELECT COALESCE(SUM(amount_cents), 0) as total 
    FROM ambassador_withdrawal_requests 
    WHERE user_id = $1 AND status NOT IN ('completed', 'rejected')
  `, [userId]);
  const pendingHoldCents = parseInt(pendingWithdrawalsResult.rows[0]?.total || 0);
  
  // الرصيد المتاح = الإجمالي - المحجوز
  const calculatedBalanceCents = Math.max(0, grossBalanceCents - pendingHoldCents);
  
  // تحديث الرصيد في قاعدة البيانات لضمان التزامن
  if (wallet.rows[0] && wallet.rows[0].balance_cents !== calculatedBalanceCents) {
    await db.query(
      `UPDATE ambassador_wallet 
       SET balance_cents = $1, total_buildings_completed = $2, updated_at = NOW() 
       WHERE user_id = $3`,
      [calculatedBalanceCents, completedBuildings, userId]
    );
    wallet.rows[0].balance_cents = calculatedBalanceCents;
    wallet.rows[0].total_buildings_completed = completedBuildings;
  }
  
  // Get user stats
  const userStats = await db.query(`
    SELECT completed_buildings, clean_buildings, referral_count, total_floors_earned
    FROM users WHERE id = $1
  `, [userId]);
  
  // Get recent transactions
  const transactions = await db.query(`
    SELECT * FROM wallet_transactions 
    WHERE user_id = $1 
    ORDER BY created_at DESC 
    LIMIT 10
  `, [userId]);
  
  // Get pending withdrawal if exists
  const pendingWithdrawal = await db.query(`
    SELECT * FROM ambassador_withdrawal_requests
    WHERE user_id = $1 AND status NOT IN ('completed', 'rejected')
    ORDER BY created_at DESC LIMIT 1
  `, [userId]);
  
  res.json({
    wallet: wallet.rows[0],
    settings: {
      buildings_per_dollar: buildingsPerDollar,
      min_withdrawal_cents: minWithdrawalCents,
      financial_rewards_enabled: financialRewardsEnabled
    },
    user_stats: userStats.rows[0],
    transactions: transactions.rows,
    pending_withdrawal: pendingWithdrawal.rows[0] || null,
    // بيانات إضافية للتحقق
    floor_stats: {
      available_floors: availableFloors,
      completed_buildings: completedBuildings,
      calculated_balance_cents: calculatedBalanceCents
    }
  });
}));

// Accept terms and conditions - قبول الشروط والأحكام
router.post('/accept-terms', combinedAuthMiddleware, requireAmbassadorEnabled, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  // Check if already accepted
  const existingWallet = await db.query(
    `SELECT terms_accepted_at FROM ambassador_wallet WHERE user_id = $1`,
    [userId]
  );
  
  if (existingWallet.rows[0]?.terms_accepted_at) {
    return res.json({ 
      success: true, 
      message: "الشروط مقبولة مسبقاً",
      terms_accepted_at: existingWallet.rows[0].terms_accepted_at
    });
  }
  
  // Create or update wallet with terms acceptance
  const wallet = await db.query(`
    INSERT INTO ambassador_wallet (user_id, terms_accepted_at) 
    VALUES ($1, NOW())
    ON CONFLICT (user_id) 
    DO UPDATE SET terms_accepted_at = NOW(), updated_at = NOW()
    RETURNING terms_accepted_at
  `, [userId]);
  
  // Get user info for admin notification
  const userInfo = await db.query(
    `SELECT name, email, ambassador_code FROM users WHERE id = $1`,
    [userId]
  );
  const user = userInfo.rows[0];
  const ambassadorName = user.name || user.email || 'مستخدم';
  const ambassadorCode = user.ambassador_code || 'غير متوفر';
  
  // Send notification to all super admins
  const admins = await db.query(
    `SELECT id FROM users WHERE role = 'super_admin'`
  );
  
  for (const admin of admins.rows) {
    await db.query(`
      INSERT INTO notifications (user_id, type, title, message)
      VALUES ($1, 'ambassador_terms_accepted', '🎉 سفير جديد فعّل الخدمة!', $2)
    `, [
      admin.id,
      `السفير "${ambassadorName}" (كود: ${ambassadorCode}) وافق على الشروط والأحكام وفعّل خدمة سفير البيت`
    ]);
  }
  
  res.json({ 
    success: true, 
    message: "تم قبول الشروط والأحكام بنجاح! تم تفعيل خدمة سفير البيت",
    terms_accepted_at: wallet.rows[0].terms_accepted_at
  });
}));

// Check if terms accepted - التحقق من قبول الشروط
router.get('/terms-status', combinedAuthMiddleware, requireAmbassadorEnabled, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  const wallet = await db.query(
    `SELECT terms_accepted_at FROM ambassador_wallet WHERE user_id = $1`,
    [userId]
  );
  
  res.json({
    terms_accepted: !!wallet.rows[0]?.terms_accepted_at,
    terms_accepted_at: wallet.rows[0]?.terms_accepted_at || null
  });
}));

// Request withdrawal
router.post('/wallet/withdraw', combinedAuthMiddleware, requireAmbassadorEnabled, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { amount_cents, payment_method } = req.body;
  
  console.log(`💰 Withdrawal request from user ${userId}:`, { amount_cents, payment_method });
  
  // التحقق من البيانات المرسلة
  if (!amount_cents || amount_cents <= 0) {
    console.error('❌ Invalid amount_cents:', amount_cents);
    return res.status(400).json({ error: "المبلغ غير صحيح" });
  }
  
  // Check if financial rewards enabled
  let settings;
  try {
    settings = await db.query(`SELECT financial_rewards_enabled, min_withdrawal_cents, buildings_per_dollar FROM ambassador_settings WHERE id = 1`);
  } catch (settingsError) {
    console.error('❌ Error fetching settings:', settingsError);
    return res.status(500).json({ error: "خطأ في جلب إعدادات النظام" });
  }
  
  if (!settings.rows || settings.rows.length === 0 || !settings.rows[0]?.financial_rewards_enabled) {
    console.warn('⚠️ Financial rewards disabled or settings not found');
    return res.status(400).json({ error: "المكافآت المالية غير مفعلة حالياً" });
  }
  const buildingsPerDollar = settings.rows[0]?.buildings_per_dollar || 5;
  
  // === حساب الرصيد الفعلي من الطوابق قبل التحقق ===
  // جلب عدد الطوابق المبنية
  const allFloorsResult = await db.query(
    `SELECT COUNT(*) as count FROM referrals WHERE referrer_id = $1 AND status IN ('completed', 'flagged_fraud')`,
    [userId]
  );
  const currentFloors = parseInt(allFloorsResult.rows[0]?.count || 0);
  
  // جلب عدد الطوابق المنهارة
  const flaggedResult = await db.query(
    `SELECT COUNT(*) as count FROM referrals WHERE referrer_id = $1 AND status = 'flagged_fraud'`,
    [userId]
  );
  const flaggedFloors = parseInt(flaggedResult.rows[0]?.count || 0);
  
  // جلب مجموع الطوابق المستهلكة
  const consumedResult = await db.query(
    `SELECT COALESCE(SUM(floors_consumed), 0) as total FROM ambassador_consumptions WHERE user_id = $1`,
    [userId]
  );
  const floorsConsumed = Math.min(parseInt(consumedResult.rows[0]?.total || 0), currentFloors);
  
  // حساب الطوابق السليمة والمتاحة
  const healthyFloors = Math.max(0, currentFloors - flaggedFloors);
  const availableFloors = Math.max(0, healthyFloors - floorsConsumed);
  
  // حساب المباني المكتملة والرصيد الإجمالي بالسنتات
  const completedBuildings = Math.floor(availableFloors / 20);
  const grossBalanceCents = Math.floor((completedBuildings / buildingsPerDollar) * 100);
  
  // جلب الأموال المحجوزة حالياً (pending withdrawals) - لا نحجز نفس المبلغ مرتين
  const pendingWithdrawalsResult = await db.query(`
    SELECT COALESCE(SUM(amount_cents), 0) as total 
    FROM ambassador_withdrawal_requests 
    WHERE user_id = $1 AND status NOT IN ('completed', 'rejected')
  `, [userId]);
  const pendingHoldCents = parseInt(pendingWithdrawalsResult.rows[0]?.total || 0);
  
  // الرصيد المتاح للسحب = الإجمالي - المحجوز مسبقاً
  const availableBalanceCents = Math.max(0, grossBalanceCents - pendingHoldCents);
  
  // التأكد من وجود المحفظة
  let wallet = await db.query(`SELECT * FROM ambassador_wallet WHERE user_id = $1`, [userId]);
  if (wallet.rows.length === 0) {
    await db.query(`INSERT INTO ambassador_wallet (user_id, balance_cents) VALUES ($1, $2)`, [userId, availableBalanceCents]);
    wallet = await db.query(`SELECT * FROM ambassador_wallet WHERE user_id = $1`, [userId]);
  }
  
  // التحقق من الرصيد المتاح (بعد طرح المحجوز)
  if (availableBalanceCents < amount_cents) {
    return res.status(400).json({ error: "رصيد غير كافٍ" });
  }
  
  // Check minimum
  const minCents = settings.rows[0]?.min_withdrawal_cents || 100;
  if (amount_cents < minCents) {
    return res.status(400).json({ error: `الحد الأدنى للسحب هو $${(minCents/100).toFixed(2)}` });
  }
  
  // Check for existing pending request
  const existing = await db.query(`
    SELECT id FROM ambassador_withdrawal_requests
    WHERE user_id = $1 AND status NOT IN ('completed', 'rejected')
  `, [userId]);
  if (existing.rows.length > 0) {
    return res.status(400).json({ error: "لديك طلب سحب قيد المراجعة" });
  }
  
  // AI fraud check for withdrawal
  console.log('🔍 Running fraud analysis...');
  let fraudAnalysis;
  try {
    fraudAnalysis = await analyzeWithdrawalRequest(userId, amount_cents);
    console.log('✅ Fraud analysis completed:', { riskScore: fraudAnalysis.riskScore, riskLevel: fraudAnalysis.riskLevel });
  } catch (fraudError) {
    console.error('❌ Error in fraud analysis:', fraudError);
    // في حالة الخطأ، نستخدم risk score منخفض بدلاً من إيقاف العملية
    fraudAnalysis = { riskScore: 0, riskLevel: 'low', riskFactors: [], analyzedAt: new Date().toISOString() };
  }
  
  // Create withdrawal request
  console.log('📝 Creating withdrawal request...');
  let result;
  try {
    result = await db.query(`
      INSERT INTO ambassador_withdrawal_requests 
      (user_id, amount_cents, payment_method, risk_score, risk_notes, ai_analyzed_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *
    `, [userId, amount_cents, payment_method || 'bank_transfer', fraudAnalysis.riskScore || 0, JSON.stringify(fraudAnalysis)]);
    console.log('✅ Withdrawal request created:', result.rows[0]?.id);
  } catch (insertError) {
    console.error('❌ Error creating withdrawal request:', insertError);
    console.error('Error details:', {
      message: insertError.message,
      code: insertError.code,
      detail: insertError.detail,
      table: insertError.table
    });
    return res.status(500).json({ 
      error: "حدث خطأ أثناء إنشاء طلب السحب",
      details: process.env.NODE_ENV === 'development' ? insertError.message : undefined
    });
  }
  
  if (!result.rows || result.rows.length === 0) {
    console.error('❌ No rows returned from withdrawal request insert');
    return res.status(500).json({ error: "فشل إنشاء طلب السحب" });
  }
  
  // الرصيد الجديد بعد السحب (للسجل فقط - الرصيد يُحسب تلقائياً الآن)
  const newBalanceAfterWithdraw = availableBalanceCents - amount_cents;
  
  // تحديث وقت آخر تعديل في المحفظة
  await db.query(`
    UPDATE ambassador_wallet 
    SET updated_at = NOW()
    WHERE user_id = $1
  `, [userId]);
  
  // Record transaction (with error handling - قد لا يكون الجدول موجوداً)
  try {
    await db.query(`
      INSERT INTO wallet_transactions 
      (user_id, type, amount_cents, balance_after_cents, description, related_request_id)
      VALUES ($1, 'withdrawal_hold', $2, $3, 'حجز رصيد لطلب سحب', $4)
    `, [userId, -amount_cents, newBalanceAfterWithdraw, result.rows[0].id]);
  } catch (txError) {
    console.error('Error recording wallet transaction (non-critical):', txError);
    // لا نوقف العملية إذا فشل تسجيل المعاملة
  }
  
  // إرسال إشعارات للمسؤولين (المالية + المديرين)
  try {
    // جلب المالية والمديرين
    const admins = await db.query(`
      SELECT id, email, role, name 
      FROM users 
      WHERE role IN ('super_admin', 'ambassador_admin', 'finance_admin')
    `);
    
    console.log(`📧 Sending notifications to ${admins.rows.length} admins`);
    
    for (const admin of admins.rows) {
      try {
        let title, message;
        
        // رسالة مختلفة للمالية
        if (admin.role === 'finance_admin') {
          title = '💰 طلب سحب مالي - يحتاج دفع';
          message = `طلب سحب جديد بقيمة $${(amount_cents/100).toFixed(2)} من مستخدم يحتاج إلى المراجعة والدفع. رقم الطلب: ${result.rows[0].id}`;
        } else {
          title = '💰 طلب سحب مالي جديد';
          message = `طلب سحب جديد بقيمة $${(amount_cents/100).toFixed(2)} يحتاج مراجعة. رقم الطلب: ${result.rows[0].id}`;
        }
        
        await db.query(`
          INSERT INTO notifications (user_id, type, title, message)
          VALUES ($1, 'ambassador_withdrawal', $2, $3)
        `, [admin.id, title, message]);
        
        console.log(`✅ Notification sent to ${admin.role} (${admin.email})`);
      } catch (notifError) {
        console.error(`Error sending notification to admin ${admin.email}:`, notifError);
        // لا نوقف العملية إذا فشل إرسال الإشعار
      }
    }
  } catch (adminError) {
    console.error('Error fetching admins for notification:', adminError);
    // لا نوقف العملية إذا فشل جلب الأدمن
  }
  
  // إرسال إشعار للمستخدم أيضاً
  try {
    await db.query(`
      INSERT INTO notifications (user_id, type, title, message)
      VALUES ($1, 'ambassador_withdrawal', '✅ تم استقبال طلب السحب', 'تم استقبال طلب السحب بقيمة $' || $2 || ' بنجاح. سيتم مراجعته من قبل المالية قريباً.')
    `, [userId, (amount_cents/100).toFixed(2)]);
    console.log(`✅ User notification sent`);
  } catch (userNotifError) {
    console.error('Error sending user notification:', userNotifError);
  }
  
  console.log(`✅ Withdrawal request completed successfully: ${result.rows[0].id} for user ${userId}, amount: $${(amount_cents/100).toFixed(2)}`);
  
  res.json({
    success: true,
    message: `تم تقديم طلب سحب $${(amount_cents/100).toFixed(2)} بنجاح. سيتم مراجعته قريباً.`,
    request: result.rows[0]
  });
}));

// Request building addition (for manual review)
router.post('/request-building', combinedAuthMiddleware, requireAmbassadorEnabled, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { note } = req.body;
  
  // Check if user already has a pending building request
  const existing = await db.query(`
    SELECT id FROM ambassador_building_requests
    WHERE user_id = $1 AND status = 'pending'
  `, [userId]);
  
  if (existing.rows.length > 0) {
    return res.status(400).json({ error: "لديك طلب إضافة مبنى قيد المراجعة" });
  }
  
  // Get user stats for context
  const stats = await db.query(`
    SELECT 
      COUNT(CASE WHEN r.status = 'active' THEN 1 END) as active_referrals,
      COUNT(CASE WHEN r.status = 'flagged' THEN 1 END) as flagged_referrals
    FROM referrals r
    WHERE r.referrer_id = $1
  `, [userId]);
  
  // Create building request
  const result = await db.query(`
    INSERT INTO ambassador_building_requests 
    (user_id, note, active_referrals, flagged_referrals)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [userId, note || null, stats.rows[0]?.active_referrals || 0, stats.rows[0]?.flagged_referrals || 0]);
  
  // Notify ambassador admins
  const user = await db.query(`SELECT name FROM users WHERE id = $1`, [userId]);
  const admins = await db.query(`SELECT id FROM users WHERE role IN ('super_admin', 'ambassador_admin')`);
  for (const admin of admins.rows) {
    await db.query(`
      INSERT INTO notifications (user_id, type, title, message)
      VALUES ($1, 'building_request', '🏢 طلب إضافة مبنى جديد', $2)
    `, [admin.id, `${user.rows[0]?.name || 'مستخدم'} يطلب إضافة مبنى جديد للتدقيق`]);
  }
  
  res.json({
    success: true,
    request: result.rows[0],
    message: "تم إرسال طلب إضافة المبنى بنجاح"
  });
}));

// Admin: Get withdrawal requests
router.get('/admin/financial-requests', combinedAuthMiddleware, requireRoles(['super_admin', 'ambassador_admin', 'finance_admin']), asyncHandler(async (req, res) => {
  const { status = 'all', page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  
  console.log(`📋 Fetching withdrawal requests: status=${status}, page=${page}, limit=${limit}, offset=${offset}`);
  
  let statusFilter = '';
  const params = [parseInt(limit), parseInt(offset)];
  if (status !== 'all') {
    statusFilter = `WHERE wr.status = $3`;
    params.push(status);
  }
  
  const requests = await db.query(`
    SELECT 
      wr.*,
      u.name as user_name,
      u.email as user_email,
      u.phone as user_phone,
      aw.balance_cents as current_balance,
      aw.total_buildings_completed,
      aw.total_earned_cents,
      aw.total_withdrawn_cents
    FROM ambassador_withdrawal_requests wr
    JOIN users u ON u.id = wr.user_id
    LEFT JOIN ambassador_wallet aw ON aw.user_id = wr.user_id
    ${statusFilter}
    ORDER BY wr.created_at DESC
    LIMIT $1 OFFSET $2
  `, params);
  
  const countParams = status !== 'all' ? [status] : [];
  const countResult = await db.query(`
    SELECT COUNT(*) FROM ambassador_withdrawal_requests ${status !== 'all' ? 'WHERE status = $1' : ''}
  `, countParams);
  
  // Get pending count for badge
  const pendingCount = await db.query(`
    SELECT COUNT(*) FROM ambassador_withdrawal_requests WHERE status = 'pending'
  `);
  
  console.log(`✅ Found ${requests.rows.length} withdrawal requests (total: ${countResult.rows[0].count}, pending: ${pendingCount.rows[0].count})`);
  
  res.json({
    requests: requests.rows,
    total: parseInt(countResult.rows[0].count),
    pending_count: parseInt(pendingCount.rows[0].count),
    page: parseInt(page),
    limit: parseInt(limit)
  });
}));

// Admin: Review withdrawal request (ambassador admin step)
router.post('/admin/financial-requests/:id/review', combinedAuthMiddleware, requireRoles(['super_admin', 'ambassador_admin']), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action, notes } = req.body;
  const adminId = req.user.id;
  
  const request = await db.query(`SELECT * FROM ambassador_withdrawal_requests WHERE id = $1`, [id]);
  if (!request.rows[0]) {
    return res.status(404).json({ error: "الطلب غير موجود" });
  }
  
  if (request.rows[0].status !== 'pending') {
    return res.status(400).json({ error: "الطلب ليس في حالة انتظار" });
  }
  
  let newStatus = 'pending';
  let notificationMsg = '';
  
  if (action === 'approve') {
    newStatus = 'finance_review';
    notificationMsg = '✅ تمت موافقة إدارة السفراء على طلب السحب وتم تحويله للمالية';
    
    // Notify finance
    const financeAdmins = await db.query(`SELECT id FROM users WHERE role IN ('super_admin', 'finance_admin')`);
    for (const admin of financeAdmins.rows) {
      await db.query(`
        INSERT INTO notifications (user_id, type, title, message)
        VALUES ($1, 'finance_withdrawal', '💰 طلب سحب للمراجعة المالية', 'طلب سحب بقيمة $' || $2 || ' جاهز للمراجعة المالية')
      `, [admin.id, (request.rows[0].amount_cents/100).toFixed(2)]);
    }
  } else if (action === 'reject') {
    newStatus = 'rejected';
    notificationMsg = '❌ تم رفض طلب السحب. السبب: ' + (notes || 'مخالفة للشروط');
    
    // Refund the held amount
    const wallet = await db.query(`SELECT * FROM ambassador_wallet WHERE user_id = $1`, [request.rows[0].user_id]);
    const newBalance = (wallet.rows[0]?.balance_cents || 0) + request.rows[0].amount_cents;
    await db.query(`
      UPDATE ambassador_wallet SET balance_cents = $1, updated_at = NOW() WHERE user_id = $2
    `, [newBalance, request.rows[0].user_id]);
    
    await db.query(`
      INSERT INTO wallet_transactions 
      (user_id, type, amount_cents, balance_after_cents, description, related_request_id, created_by)
      VALUES ($1, 'withdrawal_refund', $2, $3, 'استرجاع رصيد - طلب مرفوض', $4, $5)
    `, [request.rows[0].user_id, request.rows[0].amount_cents, newBalance, id, adminId]);
  }
  
  await db.query(`
    UPDATE ambassador_withdrawal_requests 
    SET status = $1, ambassador_admin_notes = $2, ambassador_reviewed_by = $3, ambassador_reviewed_at = NOW(), updated_at = NOW()
    WHERE id = $4
  `, [newStatus, notes, adminId, id]);
  
  // Notify user
  await db.query(`
    INSERT INTO notifications (user_id, type, title, message)
    VALUES ($1, 'ambassador_withdrawal', '💰 تحديث طلب السحب', $2)
  `, [request.rows[0].user_id, notificationMsg]);
  
  res.json({ success: true, new_status: newStatus });
}));

// Finance: Complete withdrawal
router.post('/admin/financial-requests/:id/complete', combinedAuthMiddleware, requireRoles(['super_admin', 'finance_admin']), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { payment_reference, notes } = req.body;
  const adminId = req.user.id;
  
  // Check if user has finance permission
  if (!['super_admin', 'finance_admin'].includes(req.user.role)) {
    return res.status(403).json({ error: "صلاحية المالية مطلوبة" });
  }
  
  const request = await db.query(`SELECT * FROM ambassador_withdrawal_requests WHERE id = $1`, [id]);
  if (!request.rows[0]) {
    return res.status(404).json({ error: "الطلب غير موجود" });
  }
  
  if (request.rows[0].status !== 'finance_review') {
    return res.status(400).json({ error: "الطلب ليس في مرحلة المراجعة المالية" });
  }
  
  await db.query(`
    UPDATE ambassador_withdrawal_requests 
    SET status = 'completed', finance_notes = $1, finance_reviewed_by = $2, finance_reviewed_at = NOW(), 
        payment_reference = $3, updated_at = NOW()
    WHERE id = $4
  `, [notes, adminId, payment_reference, id]);
  
  // Get settings to calculate floors per dollar
  const settings = await db.query(`SELECT buildings_per_dollar FROM ambassador_settings WHERE id = 1`);
  const buildingsPerDollar = settings.rows[0]?.buildings_per_dollar || 5;
  
  // Calculate floors to consume: amount_cents / 100 * buildingsPerDollar * 20 floors per building
  const amountDollars = request.rows[0].amount_cents / 100;
  const buildingsConsumed = amountDollars * buildingsPerDollar;
  const floorsToConsume = Math.ceil(buildingsConsumed * 20);
  
  // Add consumption record for the withdrawn floors
  await db.query(`
    INSERT INTO ambassador_consumptions 
    (user_id, reward_type, floors_consumed, consumed_at, admin_id, notes)
    VALUES ($1, 'financial_withdrawal', $2, NOW(), $3, $4)
  `, [request.rows[0].user_id, floorsToConsume, adminId, `سحب مالي: $${amountDollars.toFixed(2)} - مرجع: ${payment_reference || 'N/A'}`]);
  
  // Update wallet totals
  await db.query(`
    UPDATE ambassador_wallet 
    SET total_withdrawn_cents = total_withdrawn_cents + $1, updated_at = NOW()
    WHERE user_id = $2
  `, [request.rows[0].amount_cents, request.rows[0].user_id]);
  
  // Notify user
  await db.query(`
    INSERT INTO notifications (user_id, type, title, message)
    VALUES ($1, 'ambassador_withdrawal', '🎉 تم تحويل المبلغ!', 'تم تحويل مبلغ $' || $2 || ' بنجاح. رقم المرجع: ' || $3)
  `, [request.rows[0].user_id, (request.rows[0].amount_cents/100).toFixed(2), payment_reference || 'N/A']);
  
  res.json({ success: true });
}));

// Helper: AI fraud analysis for withdrawal
async function analyzeWithdrawalRequest(userId, amountCents) {
  try {
    const userStats = await db.query(`
      SELECT 
        u.*,
        (SELECT COUNT(*) FROM referrals WHERE referrer_id = u.id AND status = 'flagged_fraud') as flagged_referrals,
        (SELECT COUNT(*) FROM referrals WHERE referrer_id = u.id) as total_referrals,
        (SELECT COUNT(*) FROM ambassador_withdrawal_requests WHERE user_id = u.id AND status = 'completed') as past_withdrawals
      FROM users u WHERE u.id = $1
    `, [userId]);
    
    if (!userStats.rows || userStats.rows.length === 0) {
      throw new Error('المستخدم غير موجود');
    }
    
    const user = userStats.rows[0];
    let riskScore = 0;
    const riskFactors = [];
    
    // Check flagged ratio
    const flaggedReferrals = parseInt(user.flagged_referrals || 0);
    const totalReferrals = parseInt(user.total_referrals || 0);
    const flaggedRatio = totalReferrals > 0 ? flaggedReferrals / totalReferrals : 0;
    
    if (flaggedRatio > 0.3) {
      riskScore += 40;
      riskFactors.push({ factor: 'high_flagged_ratio', score: 40, detail: `${(flaggedRatio*100).toFixed(1)}% إحالات مشبوهة` });
    } else if (flaggedRatio > 0.1) {
      riskScore += 20;
      riskFactors.push({ factor: 'moderate_flagged_ratio', score: 20, detail: `${(flaggedRatio*100).toFixed(1)}% إحالات مشبوهة` });
    }
    
    // Check account age
    if (user.created_at) {
      const accountAgeDays = Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000*60*60*24));
      if (accountAgeDays < 30) {
        riskScore += 30;
        riskFactors.push({ factor: 'new_account', score: 30, detail: `حساب عمره ${accountAgeDays} يوم فقط` });
      }
    }
    
    // Check if first withdrawal
    const pastWithdrawals = parseInt(user.past_withdrawals || 0);
    if (pastWithdrawals === 0) {
      riskScore += 10;
      riskFactors.push({ factor: 'first_withdrawal', score: 10, detail: 'أول طلب سحب' });
    }
    
    // Large amount check
    if (amountCents > 100000) { // أكثر من $1000
      riskScore += 15;
      riskFactors.push({ factor: 'large_amount', score: 15, detail: `مبلغ كبير: $${(amountCents/100).toFixed(2)}` });
    }
    
    return {
      riskScore,
      riskLevel: riskScore >= 60 ? 'high' : riskScore >= 30 ? 'medium' : 'low',
      riskFactors,
      analyzedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error in analyzeWithdrawalRequest:', error);
    // في حالة الخطأ، نعيد risk score منخفض بدلاً من إيقاف العملية
    return {
      riskScore: 0,
      riskLevel: 'low',
      riskFactors: [],
      analyzedAt: new Date().toISOString(),
      error: error.message
    };
  }
}

// Middleware للأدوات التطويرية - متاح في Production للاختبار قبل الإطلاق (سيتم إزالتها لاحقاً)
const requireDevEnvironment = (req, res, next) => {
  // مؤقتاً: متاح في جميع البيئات للاختبار قبل الإطلاق
  // TODO: إزالة هذه الأدوات بعد الانتهاء من الاختبار
  next();
};

// [DEV ONLY] إضافة إحالات اختبارية للسفير - لأي مستخدم مسجل في بيئة التطوير
router.post("/dev/add-test-referrals", combinedAuthMiddleware, requireDevEnvironment, asyncHandler(async (req, res) => {
  
  const userId = req.user.id;
  const { count = 15 } = req.body;
  
  // جلب كود السفير للمستخدم
  const userInfo = await db.query(
    `SELECT ambassador_code FROM users WHERE id = $1`,
    [userId]
  );
  
  if (!userInfo.rows || userInfo.rows.length === 0) {
    return res.status(404).json({ error: "المستخدم غير موجود" });
  }
  
  let referralCode = userInfo.rows[0]?.ambassador_code;
  
  // إذا لم يكن هناك كود سفير، قم بإنشائه
  if (!referralCode) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'AQR';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // تحديث كود السفير
    await db.query(
      `UPDATE users SET ambassador_code = $1 WHERE id = $2`,
      [code, userId]
    );
    
    referralCode = code;
  }
  
  // إنشاء مستخدمين وهميين وإحالات - محسّن للأداء (Batch Insert)
  const timestamp = Date.now();
  const added = [];
  
  // قائمة أسماء عربية وهمية واقعية
  const fakeNames = [
    'أحمد محمد العلي', 'فاطمة سعيد الأحمد', 'خالد عبدالله النور', 'سارة علي المالكي',
    'محمد حسن الشمري', 'نورا عبدالرحمن الدوسري', 'عبدالله خالد القحطاني', 'ليلى فهد العتيبي',
    'يوسف سعد الزهراني', 'مريم إبراهيم الحربي', 'عمر محمد المطيري', 'هند خالد الغامدي',
    'طارق علي الشهراني', 'ريم فهد القحطاني', 'سعد عبدالله العتيبي', 'لينا محمد الدوسري',
    'بدر حسن المالكي', 'نور خالد الشمري', 'علي أحمد النور', 'سلمى فهد الأحمد',
    'حسام سعيد العلي', 'دانة محمد القحطاني', 'وليد عبدالرحمن المطيري', 'جنى علي الحربي',
    'مشعل خالد الزهراني', 'تالا فهد الغامدي', 'راشد سعد الشهراني', 'زينب محمد العتيبي',
    'فيصل عبدالله الدوسري', 'لينا حسن المالكي', 'بندر علي الشمري', 'ريماز خالد النور',
    'عبدالرحمن فهد الأحمد', 'مها سعيد العلي', 'نواف محمد القحطاني', 'سارة عبدالله المطيري',
    'ماجد خالد الحربي', 'نورا فهد الزهراني', 'عبدالعزيز علي الغامدي', 'ليلى سعد الشهراني',
    'سامي محمد العتيبي', 'هند خالد الدوسري', 'يوسف فهد المالكي', 'مريم علي الشمري',
    'خالد سعيد النور', 'فاطمة عبدالرحمن الأحمد', 'أحمد محمد العلي', 'سارة خالد القحطاني',
    'محمد فهد المطيري', 'نورا علي الحربي', 'عبدالله سعد الزهراني', 'ليلى محمد الغامدي',
    'طارق خالد الشهراني', 'ريم فهد العتيبي', 'سعد علي الدوسري', 'لينا سعيد المالكي',
    'بدر عبدالرحمن الشمري', 'نور محمد النور', 'علي خالد الأحمد', 'سلمى فهد العلي'
  ];
  
  // إعداد البيانات للـ Batch Insert للمستخدمين
  const userPlaceholders = [];
  const userParams = [];
  
  for (let i = 0; i < count; i++) {
    const paramIndex = i * 2 + 1;
    userPlaceholders.push(`($${paramIndex}, $${paramIndex + 1}, 'test_hash_not_usable')`);
    const randomName = fakeNames[Math.floor(Math.random() * fakeNames.length)];
    userParams.push(randomName, `test_ref_${timestamp}_${i}@test.com`);
  }
  
  // Batch Insert للمستخدمين - أسرع بكثير من الحلقة المتسلسلة
  let userResult;
  try {
    userResult = await db.query(
      `INSERT INTO users (name, email, password_hash) 
       VALUES ${userPlaceholders.join(', ')}
       RETURNING id, name, email`,
      userParams
    );
  } catch (dbError) {
    console.error('Error creating test users:', dbError);
    return res.status(500).json({ 
      error: "حدث خطأ أثناء إنشاء المستخدمين الاختباريين",
      details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
    });
  }
  
  if (!userResult.rows || userResult.rows.length === 0) {
    return res.status(500).json({ error: "فشل إنشاء المستخدمين الاختباريين" });
  }
  
  // Batch Insert للإحالات
  const referralPlaceholders = [];
  const referralParams = [];
  
  userResult.rows.forEach((user, i) => {
    const paramIndex = i * 3 + 1;
    referralPlaceholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, 'completed', NOW() - INTERVAL '${i} days')`);
    referralParams.push(userId, user.id, referralCode);
    added.push({ id: user.id, name: user.name, email: user.email });
  });
  
  if (referralPlaceholders.length > 0) {
    try {
      await db.query(
        `INSERT INTO referrals (referrer_id, referred_id, referral_code, status, created_at)
         VALUES ${referralPlaceholders.join(', ')}`,
        referralParams
      );
      
      // تحديث referral_count في جدول users
      const updateResult = await db.query(
        `UPDATE users 
         SET referral_count = (
           SELECT COUNT(*) FROM referrals 
           WHERE referrer_id = $1 AND status IN ('completed', 'flagged_fraud')
         ),
         ambassador_floors = (
           SELECT COUNT(*) FROM referrals 
           WHERE referrer_id = $1 AND status IN ('completed', 'flagged_fraud')
         )
         WHERE id = $1
         RETURNING referral_count, ambassador_floors`,
        [userId]
      );
      
      // التحقق من عدد الإحالات الفعلي
      const verifyResult = await db.query(
        `SELECT COUNT(*) as count FROM referrals WHERE referrer_id = $1 AND status IN ('completed', 'flagged_fraud')`,
        [userId]
      );
      
      const actualCount = parseInt(verifyResult.rows[0]?.count || 0);
      console.log(`✅ Test referrals added: ${added.length}, Updated count: ${updateResult.rows[0]?.referral_count}, Actual count: ${actualCount}`);
    } catch (refError) {
      console.error('Error creating referrals:', refError);
      // حذف المستخدمين الذين تم إنشاؤهم لأن الإحالات فشلت
      const userIds = userResult.rows.map(u => u.id);
      await db.query(
        `DELETE FROM users WHERE id = ANY($1::uuid[])`,
        [userIds]
      );
      return res.status(500).json({ 
        error: "حدث خطأ أثناء إنشاء الإحالات",
        details: process.env.NODE_ENV === 'development' ? refError.message : undefined
      });
    }
  }
  
  res.json({ 
    success: true, 
    message: `تمت إضافة ${count} إحالات اختبارية`,
    added 
  });
}));

// [DEV ONLY] حذف الإحالات الاختبارية - لأي مستخدم مسجل في بيئة التطوير
router.delete("/dev/clear-test-referrals", combinedAuthMiddleware, asyncHandler(async (req, res) => {
  // تم إزالة requireDevEnvironment للسماح بالاختبار في production
  
  const userId = req.user.id;
  
  // حذف الإحالات للمستخدمين الاختباريين (جميع الأنواع)
  const deleted = await db.query(
    `DELETE FROM referrals 
     WHERE referrer_id = $1 
     AND referred_id IN (
       SELECT id FROM users 
       WHERE email LIKE 'test_ref_%@test.com' 
          OR email LIKE 'test_%@test.com'
          OR email LIKE '%@test.com'
     )
     RETURNING id`,
    [userId]
  );
  
  const deletedCount = deleted.rowCount || 0;
  
  // حذف المستخدمين الاختباريين
  const deletedUsers = await db.query(
    `DELETE FROM users 
     WHERE email LIKE 'test_ref_%@test.com' 
        OR email LIKE 'test_%@test.com'
     RETURNING id`
  );
  
  // تحديث referral_count و ambassador_floors للمستخدم بعد الحذف
  const updateResult = await db.query(
    `UPDATE users 
     SET referral_count = (
       SELECT COUNT(*) FROM referrals 
       WHERE referrer_id = $1 AND status IN ('completed', 'flagged_fraud')
     ),
     ambassador_floors = (
       SELECT COUNT(*) FROM referrals 
       WHERE referrer_id = $1 AND status IN ('completed', 'flagged_fraud')
     )
     WHERE id = $1
     RETURNING referral_count, ambassador_floors`,
    [userId]
  );
  
  const newCount = updateResult.rows[0]?.referral_count || 0;
  const newFloors = updateResult.rows[0]?.ambassador_floors || 0;
  
  console.log(`✅ Cleared test referrals: ${deletedCount} referrals, ${deletedUsers.rowCount} users. New count: ${newCount}`);
  
  res.json({ 
    success: true, 
    message: `تم حذف ${deletedCount} إحالة اختبارية و ${deletedUsers.rowCount} مستخدم اختباري. العدد الحالي: ${newCount}`,
    deleted_referrals: deletedCount,
    deleted_users: deletedUsers.rowCount,
    current_count: newCount,
    current_floors: newFloors
  });
}));

// [DEV ONLY] حذف جميع طلبات السحب - للتجربة فقط
router.delete("/dev/clear-withdrawal-requests", combinedAuthMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  console.log(`🗑️ Clearing all withdrawal requests for user ${userId}...`);
  
  // التحقق من وجود طلبات قبل الحذف
  const beforeCount = await db.query(
    `SELECT COUNT(*) as count FROM ambassador_withdrawal_requests WHERE user_id = $1`,
    [userId]
  );
  console.log(`📊 Found ${beforeCount.rows[0].count} withdrawal requests before deletion`);
  
  // حذف جميع طلبات السحب للمستخدم الحالي (بأي status)
  const deleted = await db.query(
    `DELETE FROM ambassador_withdrawal_requests 
     WHERE user_id = $1
     RETURNING id, status, amount_cents`,
    [userId]
  );
  
  const deletedCount = deleted.rowCount || 0;
  console.log(`✅ Deleted ${deletedCount} withdrawal requests:`, deleted.rows.map(r => ({ id: r.id, status: r.status, amount: r.amount_cents })));
  
  // تحديث المحفظة (إعادة الرصيد المحجوز)
  const wallet = await db.query(`SELECT * FROM ambassador_wallet WHERE user_id = $1`, [userId]);
  if (wallet.rows.length > 0) {
    // حساب الرصيد من جديد بناءً على الطوابق المكتملة
    const allFloorsResult = await db.query(
      `SELECT COUNT(*) as count FROM referrals WHERE referrer_id = $1 AND status IN ('completed', 'flagged_fraud')`,
      [userId]
    );
    const currentFloors = parseInt(allFloorsResult.rows[0]?.count || 0);
    
    const flaggedResult = await db.query(
      `SELECT COUNT(*) as count FROM referrals WHERE referrer_id = $1 AND status = 'flagged_fraud'`,
      [userId]
    );
    const flaggedFloors = parseInt(flaggedResult.rows[0]?.count || 0);
    
    const consumedResult = await db.query(
      `SELECT COALESCE(SUM(floors_consumed), 0) as total FROM ambassador_consumptions WHERE user_id = $1`,
      [userId]
    );
    const floorsConsumed = Math.min(parseInt(consumedResult.rows[0]?.total || 0), currentFloors);
    
    const settings = await db.query(`SELECT buildings_per_dollar FROM ambassador_settings WHERE id = 1`);
    const buildingsPerDollar = settings.rows[0]?.buildings_per_dollar || 5;
    
    const healthyFloors = Math.max(0, currentFloors - flaggedFloors);
    const availableFloors = Math.max(0, healthyFloors - floorsConsumed);
    const completedBuildings = Math.floor(availableFloors / 20);
    const newBalanceCents = Math.floor((completedBuildings / buildingsPerDollar) * 100);
    
    await db.query(`
      UPDATE ambassador_wallet 
      SET balance_cents = $1, updated_at = NOW()
      WHERE user_id = $2
    `, [newBalanceCents, userId]);
    
    console.log(`✅ Wallet balance updated: ${newBalanceCents} cents`);
  }
  
  console.log(`✅ Cleared ${deletedCount} withdrawal requests`);
  
  res.json({ 
    success: true, 
    message: `تم حذف ${deletedCount} طلب سحب`,
    deleted_count: deletedCount
  });
}));

// ============ AI Fraud Detection APIs ============

const fraudDetection = require('../services/fraudDetectionEngine');

// فحص AI لسفير معين (يدوي)
router.post("/admin/ai-scan/:userId", authMiddleware, requireRoles('super_admin', 'support_admin'), asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { buildingNumber } = req.body;
  const adminId = req.user.id;
  
  const result = await fraudDetection.runFullScan(userId, {
    triggeredBy: adminId,
    buildingNumber: buildingNumber ? parseInt(buildingNumber) : null,
    saveResults: false
  });
  
  await db.query(`
    INSERT INTO admin_audit_logs (admin_id, action, resource_type, resource_id, details)
    VALUES ($1, 'ai_fraud_scan', 'ambassador', $2, $3)
  `, [adminId, userId, JSON.stringify({ buildingNumber, summary: result.summary })]);
  
  res.json(result);
}));

// جلب نتائج المخاطر لسفير
router.get("/admin/ai-risks/:userId", authMiddleware, requireRoles('super_admin', 'support_admin'), asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { buildingNumber } = req.query;
  
  const risks = await fraudDetection.getReferralRiskScores(
    userId, 
    buildingNumber ? parseInt(buildingNumber) : null
  );
  
  res.json({ risks });
}));

// جلب سجل الفحوصات لسفير
router.get("/admin/ai-scans/:userId", authMiddleware, requireRoles('super_admin', 'support_admin'), asyncHandler(async (req, res) => {
  const { userId } = req.params;
  
  const scans = await fraudDetection.getScanHistory(userId);
  
  res.json({ scans });
}));

// فحص سريع بدون حفظ (للعرض المباشر)
router.get("/admin/ai-analyze/:userId", authMiddleware, requireRoles('super_admin', 'support_admin'), asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { buildingNumber } = req.query;
  
  const { referrals, analysis } = await fraudDetection.analyzeAmbassadorReferrals(
    userId,
    { buildingNumber: buildingNumber ? parseInt(buildingNumber) : null }
  );
  
  res.json({ referrals: referrals.length, analysis });
}));

// ============ سويتش تشغيل/إيقاف نظام السفراء ============

// التحقق من حالة النظام (عام - للمستخدمين)
router.get("/status", asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT ambassador_enabled FROM ambassador_settings WHERE id = 1`
  );
  const enabled = result.rows[0]?.ambassador_enabled ?? true;
  res.json({ enabled });
}));

// تغيير حالة النظام (للمدير فقط)
router.patch("/admin/toggle", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const { enabled } = req.body;
  const adminId = req.user.id;
  
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: "يجب تحديد الحالة (enabled: true/false)" });
  }
  
  await db.query(
    `UPDATE ambassador_settings SET ambassador_enabled = $1 WHERE id = 1`,
    [enabled]
  );
  
  // تسجيل في سجل الإدارة
  await db.query(`
    INSERT INTO admin_audit_logs (admin_id, action, resource_type, details)
    VALUES ($1, $2, 'ambassador_settings', $3)
  `, [adminId, enabled ? 'ambassador_enabled' : 'ambassador_disabled', JSON.stringify({ enabled })]);
  
  res.json({ 
    success: true, 
    enabled,
    message: enabled ? 'تم تفعيل نظام السفراء' : 'تم إيقاف نظام السفراء'
  });
}));

// جلب حالة النظام (للمدير)
router.get("/admin/system-status", authMiddleware, requireRoles('super_admin', 'support_admin'), asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT ambassador_enabled, consumption_enabled, financial_rewards_enabled FROM ambassador_settings WHERE id = 1`
  );
  res.json(result.rows[0] || { ambassador_enabled: true, consumption_enabled: true, financial_rewards_enabled: false });
}));

module.exports = router;
