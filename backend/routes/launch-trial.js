// backend/routes/launch-trial.js
// نظام باقة الانطلاق المجانية - Launch Trial System

const express = require("express");
const router = express.Router();
const db = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { asyncHandler, queryOne, queryAll, insertOne, updateOne } = require("../utils/queryHelpers");

// الحصول على باقة رجال الأعمال (أعلى باقة)
async function getBusinessPlan() {
  const result = await db.query(`
    SELECT * FROM plans 
    WHERE slug = 'business' OR name_en ILIKE '%business%' 
    ORDER BY price DESC 
    LIMIT 1
  `);
  return result.rows[0];
}

// التحقق من حالة التجربة المجانية للمستخدم
router.get("/status", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const trial = await queryOne(`
    SELECT lt.*, 
           (lt.max_listings - lt.used_listings) as remaining_listings,
           lt.expires_at > NOW() AND lt.status = 'active' as is_active
    FROM launch_trials lt
    WHERE lt.user_id = $1
  `, [userId]);

  if (!trial) {
    return res.json({
      hasTrial: false,
      canActivate: true,
      message: "يمكنك تفعيل باقة الانطلاق المجانية"
    });
  }

  const businessPlan = await getBusinessPlan();

  res.json({
    hasTrial: true,
    trial: {
      id: trial.id,
      maxListings: trial.max_listings,
      usedListings: trial.used_listings,
      remainingListings: trial.remaining_listings,
      durationDays: trial.duration_days,
      startedAt: trial.started_at,
      expiresAt: trial.expires_at,
      status: trial.status,
      isActive: trial.is_active,
      convertedToPaid: trial.converted_to_paid
    },
    planFeatures: businessPlan ? {
      name: businessPlan.name_ar,
      maxPhotos: businessPlan.max_photos_per_listing,
      maxVideos: businessPlan.max_videos_per_listing,
      showOnMap: businessPlan.show_on_map,
      aiSupport: businessPlan.ai_support_level
    } : null
  });
}));

// تفعيل باقة الانطلاق المجانية
router.post("/activate", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // التحقق من عدم وجود تجربة سابقة
  const existingTrial = await queryOne(
    `SELECT id, status FROM launch_trials WHERE user_id = $1`,
    [userId]
  );

  if (existingTrial) {
    if (existingTrial.status === 'active') {
      return res.status(400).json({ 
        error: "لديك باقة انطلاق مفعلة بالفعل",
        trialId: existingTrial.id
      });
    }
    return res.status(400).json({ 
      error: "لقد استخدمت باقة الانطلاق من قبل. يمكنك الترقية لباقة مدفوعة"
    });
  }

  // التحقق من عدم وجود اشتراك مدفوع
  const existingPlan = await queryOne(`
    SELECT id FROM user_plans 
    WHERE user_id = $1 AND status = 'active' AND expires_at > NOW()
  `, [userId]);

  if (existingPlan) {
    return res.status(400).json({ 
      error: "لديك اشتراك مدفوع فعال. باقة الانطلاق للمستخدمين الجدد فقط"
    });
  }

  // الحصول على إعدادات التجربة
  const settings = await queryAll(`
    SELECT key, value FROM app_settings 
    WHERE key IN ('launch_trial_enabled', 'launch_trial_max_listings', 'launch_trial_duration_days')
  `);

  const settingsMap = {};
  settings.forEach(s => { settingsMap[s.key] = s.value; });

  if (settingsMap.launch_trial_enabled !== 'true') {
    return res.status(400).json({ 
      error: "عرض الانطلاق غير متاح حالياً"
    });
  }

  const maxListings = parseInt(settingsMap.launch_trial_max_listings) || 3;
  const durationDays = parseInt(settingsMap.launch_trial_duration_days) || 45;

  // إنشاء التجربة
  const trial = await insertOne(`
    INSERT INTO launch_trials (user_id, max_listings, duration_days, expires_at)
    VALUES ($1, $2, $3, NOW() + INTERVAL '${durationDays} days')
    RETURNING *
  `, [userId, maxListings, durationDays]);

  // إرسال إشعار ترحيبي
  await db.query(`
    INSERT INTO notifications (user_id, title, body, type)
    VALUES ($1, $2, $3, $4)
  `, [
    userId,
    '🎉 مرحباً بك في بيت الجزيرة!',
    `تم تفعيل باقة الانطلاق المجانية. يمكنك الآن إضافة ${maxListings} إعلانات بمميزات رجال الأعمال لمدة ${durationDays} يوماً.`,
    'launch_trial_activated'
  ]);

  const businessPlan = await getBusinessPlan();

  res.json({
    success: true,
    message: `🎉 تم تفعيل باقة الانطلاق بنجاح!`,
    trial: {
      id: trial.id,
      maxListings: trial.max_listings,
      usedListings: 0,
      remainingListings: trial.max_listings,
      durationDays: trial.duration_days,
      expiresAt: trial.expires_at,
      status: 'active'
    },
    planFeatures: businessPlan ? {
      name: businessPlan.name_ar,
      maxPhotos: businessPlan.max_photos_per_listing,
      maxVideos: businessPlan.max_videos_per_listing,
      showOnMap: businessPlan.show_on_map
    } : null
  });
}));

// استخدام إعلان من التجربة
router.post("/use-listing", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const trial = await queryOne(`
    SELECT * FROM launch_trials 
    WHERE user_id = $1 AND status = 'active' AND expires_at > NOW()
  `, [userId]);

  if (!trial) {
    return res.status(400).json({ 
      error: "ليس لديك باقة انطلاق فعالة"
    });
  }

  if (trial.used_listings >= trial.max_listings) {
    return res.status(400).json({ 
      error: "لقد استنفدت جميع إعلانات باقة الانطلاق. يمكنك الترقية لباقة مدفوعة"
    });
  }

  // زيادة عدد الإعلانات المستخدمة
  await updateOne(`
    UPDATE launch_trials 
    SET used_listings = used_listings + 1, updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [trial.id]);

  const remaining = trial.max_listings - trial.used_listings - 1;

  res.json({
    success: true,
    usedListings: trial.used_listings + 1,
    remainingListings: remaining,
    maxListings: trial.max_listings
  });
}));

// التحقق من إمكانية إضافة إعلان
router.get("/can-add-listing", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // التحقق من الاشتراك المدفوع أولاً
  const paidPlan = await queryOne(`
    SELECT up.*, p.max_listings, p.name_ar as plan_name
    FROM user_plans up
    JOIN plans p ON up.plan_id = p.id
    WHERE up.user_id = $1 AND up.status = 'active' AND up.expires_at > NOW()
  `, [userId]);

  if (paidPlan) {
    const usedCount = await queryOne(`
      SELECT COUNT(*) as count FROM properties WHERE user_id = $1 AND status != 'rejected'
    `, [userId]);
    
    return res.json({
      canAdd: true,
      source: 'paid_plan',
      planName: paidPlan.plan_name,
      maxListings: paidPlan.max_listings,
      usedListings: parseInt(usedCount.count),
      remainingListings: paidPlan.max_listings - parseInt(usedCount.count)
    });
  }

  // التحقق من باقة الانطلاق
  const trial = await queryOne(`
    SELECT * FROM launch_trials 
    WHERE user_id = $1 AND status = 'active' AND expires_at > NOW()
  `, [userId]);

  if (trial && trial.used_listings < trial.max_listings) {
    return res.json({
      canAdd: true,
      source: 'launch_trial',
      planName: 'باقة الانطلاق',
      maxListings: trial.max_listings,
      usedListings: trial.used_listings,
      remainingListings: trial.max_listings - trial.used_listings,
      expiresAt: trial.expires_at
    });
  }

  // لا يوجد اشتراك أو تجربة
  res.json({
    canAdd: false,
    source: null,
    message: trial 
      ? 'انتهت باقة الانطلاق أو استنفدت الإعلانات' 
      : 'لا يوجد اشتراك فعال',
    canActivateTrial: !trial
  });
}));

// الحصول على تفاصيل مميزات باقة الانطلاق
router.get("/features", asyncHandler(async (req, res) => {
  const businessPlan = await getBusinessPlan();
  
  const settings = await queryAll(`
    SELECT key, value FROM app_settings 
    WHERE key LIKE 'launch_trial_%'
  `);
  
  const settingsMap = {};
  settings.forEach(s => { settingsMap[s.key] = s.value; });

  res.json({
    enabled: settingsMap.launch_trial_enabled === 'true',
    maxListings: parseInt(settingsMap.launch_trial_max_listings) || 3,
    durationDays: parseInt(settingsMap.launch_trial_duration_days) || 45,
    planFeatures: businessPlan ? {
      name: businessPlan.name_ar,
      nameEn: businessPlan.name_en,
      maxPhotos: businessPlan.max_photos_per_listing,
      maxVideos: businessPlan.max_videos_per_listing,
      showOnMap: businessPlan.show_on_map,
      aiSupport: businessPlan.ai_support_level,
      color: businessPlan.color,
      icon: businessPlan.icon || businessPlan.custom_icon
    } : null,
    benefits: [
      'تجربة كاملة لمميزات رجال الأعمال',
      'عرض العقار على الخريطة التفاعلية',
      'صور عالية الجودة حتى 15 صورة',
      'فيديو ترويجي بالذكاء الاصطناعي',
      'دعم فني مميز'
    ]
  });
}));

module.exports = router;
