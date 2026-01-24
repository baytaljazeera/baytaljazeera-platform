const express = require("express");
const router = express.Router();
const db = require("../db");
const { asyncHandler } = require("../middleware/asyncHandler");
const { authMiddleware, requireRoles } = require("../middleware/auth");

const PROMOTION_TYPES = {
  free_trial: 'تجربة مجانية',
  free_plan: 'باقة مجانية بالكامل',
  percentage_discount: 'خصم بنسبة',
  fixed_discount: 'خصم ثابت'
};

const SEASONAL_TAGS = {
  ramadan: 'رمضان',
  eid_fitr: 'عيد الفطر',
  eid_adha: 'عيد الأضحى',
  national_day: 'اليوم الوطني',
  founding_day: 'يوم التأسيس',
  summer: 'موسم الصيف',
  winter: 'موسم الشتاء',
  launch: 'عرض الإطلاق'
};

router.get("/", authMiddleware, requireRoles('super_admin', 'admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const { status, type, plan_id } = req.query;
  
  let query = `
    SELECT p.*, 
           u.name as created_by_name,
           (SELECT COUNT(*) FROM promotion_usage pu WHERE pu.promotion_id = p.id) as total_used
    FROM promotions p
    LEFT JOIN users u ON p.created_by = u.id
    WHERE 1=1
  `;
  const params = [];
  
  if (status) {
    params.push(status);
    query += ` AND p.status = $${params.length}`;
  }
  
  if (type) {
    params.push(type);
    query += ` AND p.promotion_type = $${params.length}`;
  }
  
  if (plan_id) {
    params.push(parseInt(plan_id));
    query += ` AND (p.applies_to = 'all_plans' OR p.target_plan_ids @> to_jsonb(ARRAY[$${params.length}]::int[]))`;
  }
  
  query += ` ORDER BY p.priority DESC, p.created_at DESC`;
  
  const result = await db.query(query, params);
  
  res.json({
    ok: true,
    promotions: result.rows,
    types: PROMOTION_TYPES,
    seasonalTags: SEASONAL_TAGS
  });
}));

router.get("/active", asyncHandler(async (req, res) => {
  const { plan_id, user_id } = req.query;
  
  let query = `
    SELECT p.*
    FROM promotions p
    WHERE p.status = 'active'
      AND (p.start_at IS NULL OR p.start_at <= NOW())
      AND (p.end_at IS NULL OR p.end_at > NOW())
      AND (p.usage_limit_total IS NULL OR p.current_usage < p.usage_limit_total)
  `;
  const params = [];
  
  if (plan_id) {
    params.push(parseInt(plan_id));
    query += ` AND (p.applies_to = 'all_plans' OR p.target_plan_ids @> to_jsonb(ARRAY[$${params.length}]::int[]))`;
  }
  
  query += ` ORDER BY p.priority DESC, p.discount_value DESC LIMIT 10`;
  
  let promotions = (await db.query(query, params)).rows;
  
  if (user_id && promotions.length > 0) {
    const promoIds = promotions.map(p => p.id);
    const usageResult = await db.query(
      `SELECT promotion_id, COUNT(*) as use_count 
       FROM promotion_usage 
       WHERE user_id = $1 AND promotion_id = ANY($2)
       GROUP BY promotion_id`,
      [user_id, promoIds]
    );
    
    const usageMap = {};
    usageResult.rows.forEach(row => {
      usageMap[row.promotion_id] = parseInt(row.use_count);
    });
    
    promotions = promotions.filter(p => {
      const userUsage = usageMap[p.id] || 0;
      return !p.usage_limit_per_user || userUsage < p.usage_limit_per_user;
    });
  }
  
  res.json({ ok: true, promotions });
}));

router.get("/:id", authMiddleware, requireRoles('super_admin', 'admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const result = await db.query(
    `SELECT p.*, 
            u.name as created_by_name,
            (SELECT COUNT(*) FROM promotion_usage pu WHERE pu.promotion_id = p.id) as total_used
     FROM promotions p
     LEFT JOIN users u ON p.created_by = u.id
     WHERE p.id = $1`,
    [id]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ ok: false, error: "العرض غير موجود" });
  }
  
  const usageResult = await db.query(
    `SELECT pu.*, u.name as user_name, u.email, pl.name_ar as plan_name
     FROM promotion_usage pu
     JOIN users u ON pu.user_id = u.id
     LEFT JOIN plans pl ON pu.plan_id = pl.id
     WHERE pu.promotion_id = $1
     ORDER BY pu.used_at DESC
     LIMIT 50`,
    [id]
  );
  
  res.json({
    ok: true,
    promotion: result.rows[0],
    usage: usageResult.rows
  });
}));

router.post("/", authMiddleware, requireRoles('super_admin', 'admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const {
    name, name_ar, slug, description, description_ar,
    promotion_type, discount_type, discount_value, skip_payment,
    applies_to, target_plan_ids, start_at, end_at, seasonal_tag,
    duration_value, duration_unit, usage_limit_total, usage_limit_per_user,
    badge_text, badge_color, banner_enabled, banner_text, priority, status,
    display_mode, display_position, background_color, dismiss_type, auto_dismiss_seconds, animation_type, target_pages,
    overlay_title, overlay_description, overlay_cta_text, overlay_cta_url
  } = req.body;
  
  if (!name || !name_ar) {
    return res.status(400).json({ ok: false, error: "الاسم مطلوب" });
  }
  
  const result = await db.query(
    `INSERT INTO promotions (
      name, name_ar, slug, description, description_ar,
      promotion_type, discount_type, discount_value, skip_payment,
      applies_to, target_plan_ids, start_at, end_at, seasonal_tag,
      duration_value, duration_unit, usage_limit_total, usage_limit_per_user,
      badge_text, badge_color, banner_enabled, banner_text, priority, status,
      display_mode, display_position, background_color, dismiss_type, auto_dismiss_seconds, animation_type, target_pages,
      overlay_title, overlay_description, overlay_cta_text, overlay_cta_url,
      created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36)
    RETURNING *`,
    [
      name, name_ar, slug || name.toLowerCase().replace(/\s+/g, '-'),
      description, description_ar,
      promotion_type || 'free_trial', discount_type || 'percentage',
      discount_value || 0, skip_payment || false,
      applies_to || 'specific_plans', JSON.stringify(target_plan_ids || []),
      start_at || null, end_at || null, seasonal_tag || null,
      duration_value || 7, duration_unit || 'days',
      usage_limit_total || null, usage_limit_per_user || 1,
      badge_text || null, badge_color || '#D4AF37',
      banner_enabled !== false, banner_text || null,
      priority || 0, status || 'draft',
      display_mode || 'banner', display_position || 'top_banner', background_color || '#002845',
      dismiss_type || 'click', auto_dismiss_seconds || 5, animation_type || 'fade',
      JSON.stringify(target_pages || []),
      overlay_title || null, overlay_description || null, overlay_cta_text || null, overlay_cta_url || null,
      req.user.userId
    ]
  );
  
  res.json({ ok: true, promotion: result.rows[0], message: "تم إنشاء العرض بنجاح" });
}));

router.put("/:id", authMiddleware, requireRoles('super_admin', 'admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    name, name_ar, slug, description, description_ar,
    promotion_type, discount_type, discount_value, skip_payment,
    applies_to, target_plan_ids, start_at, end_at, seasonal_tag,
    duration_value, duration_unit, usage_limit_total, usage_limit_per_user,
    badge_text, badge_color, banner_enabled, banner_text, priority, status,
    display_mode, display_position, background_color, dismiss_type, auto_dismiss_seconds, animation_type, target_pages,
    overlay_title, overlay_description, overlay_cta_text, overlay_cta_url
  } = req.body;
  
  const result = await db.query(
    `UPDATE promotions SET
      name = COALESCE($1, name),
      name_ar = COALESCE($2, name_ar),
      slug = COALESCE($3, slug),
      description = COALESCE($4, description),
      description_ar = COALESCE($5, description_ar),
      promotion_type = COALESCE($6, promotion_type),
      discount_type = COALESCE($7, discount_type),
      discount_value = COALESCE($8, discount_value),
      skip_payment = COALESCE($9, skip_payment),
      applies_to = COALESCE($10, applies_to),
      target_plan_ids = COALESCE($11, target_plan_ids),
      start_at = $12,
      end_at = $13,
      seasonal_tag = $14,
      duration_value = COALESCE($15, duration_value),
      duration_unit = COALESCE($16, duration_unit),
      usage_limit_total = $17,
      usage_limit_per_user = COALESCE($18, usage_limit_per_user),
      badge_text = $19,
      badge_color = COALESCE($20, badge_color),
      banner_enabled = COALESCE($21, banner_enabled),
      banner_text = $22,
      priority = COALESCE($23, priority),
      status = COALESCE($24, status),
      display_mode = COALESCE($25, display_mode),
      display_position = COALESCE($26, display_position),
      background_color = COALESCE($27, background_color),
      dismiss_type = COALESCE($28, dismiss_type),
      auto_dismiss_seconds = COALESCE($29, auto_dismiss_seconds),
      animation_type = COALESCE($30, animation_type),
      target_pages = COALESCE($31, target_pages),
      overlay_title = $32,
      overlay_description = $33,
      overlay_cta_text = $34,
      overlay_cta_url = $35,
      updated_at = NOW()
    WHERE id = $36
    RETURNING *`,
    [
      name, name_ar, slug, description, description_ar,
      promotion_type, discount_type, discount_value, skip_payment,
      applies_to, target_plan_ids ? JSON.stringify(target_plan_ids) : null,
      start_at || null, end_at || null, seasonal_tag || null,
      duration_value, duration_unit, usage_limit_total || null, usage_limit_per_user,
      badge_text || null, badge_color, banner_enabled, banner_text || null,
      priority, status,
      display_mode, display_position, background_color, dismiss_type, auto_dismiss_seconds, animation_type,
      target_pages ? JSON.stringify(target_pages) : null,
      overlay_title || null, overlay_description || null, overlay_cta_text || null, overlay_cta_url || null,
      id
    ]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ ok: false, error: "العرض غير موجود" });
  }
  
  res.json({ ok: true, promotion: result.rows[0], message: "تم تحديث العرض بنجاح" });
}));

router.delete("/:id", authMiddleware, requireRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const usageCheck = await db.query(
    "SELECT COUNT(*) as count FROM promotion_usage WHERE promotion_id = $1",
    [id]
  );
  
  if (parseInt(usageCheck.rows[0].count) > 0) {
    await db.query("UPDATE promotions SET status = 'archived' WHERE id = $1", [id]);
    return res.json({ ok: true, message: "تم أرشفة العرض (لا يمكن حذفه لوجود استخدامات)" });
  }
  
  await db.query("DELETE FROM promotions WHERE id = $1", [id]);
  res.json({ ok: true, message: "تم حذف العرض بنجاح" });
}));

router.post("/:id/toggle", authMiddleware, requireRoles('super_admin', 'admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const result = await db.query(
    `UPDATE promotions 
     SET status = CASE WHEN status = 'active' THEN 'paused' ELSE 'active' END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ ok: false, error: "العرض غير موجود" });
  }
  
  res.json({ 
    ok: true, 
    promotion: result.rows[0], 
    message: result.rows[0].status === 'active' ? "تم تفعيل العرض" : "تم إيقاف العرض" 
  });
}));

router.post("/apply", authMiddleware, asyncHandler(async (req, res) => {
  const { promotion_id, plan_id } = req.body;
  const userId = req.user.userId;
  
  if (!promotion_id || !plan_id || isNaN(parseInt(promotion_id)) || isNaN(parseInt(plan_id))) {
    return res.status(400).json({ ok: false, error: "بيانات غير صالحة" });
  }
  
  const promoResult = await db.query(
    `SELECT * FROM promotions 
     WHERE id = $1 
       AND status = 'active'
       AND (start_at IS NULL OR start_at <= NOW())
       AND (end_at IS NULL OR end_at > NOW())`,
    [promotion_id]
  );
  
  if (promoResult.rows.length === 0) {
    return res.status(400).json({ ok: false, error: "العرض غير متاح" });
  }
  
  const promo = promoResult.rows[0];
  
  if (promo.usage_limit_total && promo.current_usage >= promo.usage_limit_total) {
    return res.status(400).json({ ok: false, error: "تم استنفاد العرض" });
  }
  
  const userUsage = await db.query(
    `SELECT COUNT(*) as count FROM promotion_usage 
     WHERE promotion_id = $1 AND user_id = $2`,
    [promotion_id, userId]
  );
  
  if (promo.usage_limit_per_user && parseInt(userUsage.rows[0].count) >= promo.usage_limit_per_user) {
    return res.status(400).json({ ok: false, error: "لقد استخدمت هذا العرض من قبل" });
  }
  
  if (promo.applies_to === 'specific_plans') {
    const targetPlanIds = promo.target_plan_ids || [];
    if (!targetPlanIds.includes(plan_id)) {
      return res.status(400).json({ ok: false, error: "العرض لا ينطبق على هذه الباقة" });
    }
  }
  
  const planResult = await db.query("SELECT * FROM plans WHERE id = $1", [plan_id]);
  if (planResult.rows.length === 0) {
    return res.status(400).json({ ok: false, error: "الباقة غير موجودة" });
  }
  
  const plan = planResult.rows[0];
  let finalPrice = parseFloat(plan.price);
  let discountAmount = 0;
  
  if (promo.skip_payment || promo.promotion_type === 'free_plan' || promo.promotion_type === 'free_trial') {
    discountAmount = finalPrice;
    finalPrice = 0;
  } else if (promo.discount_type === 'percentage') {
    discountAmount = finalPrice * (parseFloat(promo.discount_value) / 100);
    finalPrice -= discountAmount;
  } else if (promo.discount_type === 'fixed') {
    discountAmount = Math.min(parseFloat(promo.discount_value), finalPrice);
    finalPrice -= discountAmount;
  }
  
  res.json({
    ok: true,
    promotion: promo,
    plan: plan,
    originalPrice: parseFloat(plan.price),
    discountAmount: discountAmount,
    finalPrice: Math.max(0, finalPrice),
    skipPayment: promo.skip_payment || finalPrice === 0
  });
}));

router.post("/redeem", authMiddleware, asyncHandler(async (req, res) => {
  const { promotion_id, plan_id } = req.body;
  const userId = req.user.userId;
  
  if (!promotion_id || !plan_id || isNaN(parseInt(promotion_id)) || isNaN(parseInt(plan_id))) {
    return res.status(400).json({ ok: false, error: "بيانات غير صالحة" });
  }
  
  const client = await db.pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const promoResult = await client.query(
      `SELECT * FROM promotions 
       WHERE id = $1 
         AND status = 'active'
         AND (start_at IS NULL OR start_at <= NOW())
         AND (end_at IS NULL OR end_at > NOW())
       FOR UPDATE`,
      [promotion_id]
    );
    
    if (promoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: "العرض غير متاح" });
    }
    
    const promo = promoResult.rows[0];
    
    if (promo.usage_limit_total && promo.current_usage >= promo.usage_limit_total) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: "تم استنفاد العرض" });
    }
    
    const userUsage = await client.query(
      `SELECT COUNT(*) as count FROM promotion_usage 
       WHERE promotion_id = $1 AND user_id = $2`,
      [promotion_id, userId]
    );
    
    if (promo.usage_limit_per_user && parseInt(userUsage.rows[0].count) >= promo.usage_limit_per_user) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: "لقد استخدمت هذا العرض من قبل" });
    }
    
    const planResult = await client.query("SELECT * FROM plans WHERE id = $1", [plan_id]);
    const plan = planResult.rows[0];
    
    let finalPrice = parseFloat(plan.price);
    let discountAmount = 0;
    
    if (promo.skip_payment || promo.promotion_type === 'free_plan' || promo.promotion_type === 'free_trial') {
      discountAmount = finalPrice;
      finalPrice = 0;
    } else if (promo.discount_type === 'percentage') {
      discountAmount = finalPrice * (parseFloat(promo.discount_value) / 100);
      finalPrice -= discountAmount;
    } else if (promo.discount_type === 'fixed') {
      discountAmount = Math.min(parseFloat(promo.discount_value), finalPrice);
      finalPrice -= discountAmount;
    }
    
    let durationDays = plan.duration_days || 30;
    if (promo.promotion_type === 'free_trial') {
      if (promo.duration_unit === 'hours') {
        durationDays = Math.ceil(promo.duration_value / 24);
      } else if (promo.duration_unit === 'days') {
        durationDays = promo.duration_value;
      } else if (promo.duration_unit === 'weeks') {
        durationDays = promo.duration_value * 7;
      } else if (promo.duration_unit === 'months') {
        durationDays = promo.duration_value * 30;
      }
    }
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);
    
    const userPlanResult = await client.query(
      `INSERT INTO user_plans (user_id, plan_id, status, started_at, expires_at)
       VALUES ($1, $2, 'active', NOW(), $3)
       RETURNING *`,
      [userId, plan_id, expiresAt]
    );
    
    await client.query(
      `INSERT INTO quota_buckets (user_id, plan_id, source, total_slots, used_slots, expires_at, active)
       VALUES ($1, $2, 'promotion', $3, 0, $4, true)`,
      [userId, plan_id, plan.max_listings, expiresAt]
    );
    
    await client.query(
      `INSERT INTO promotion_usage (promotion_id, user_id, plan_id, user_plan_id, amount_original, amount_discounted)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [promotion_id, userId, plan_id, userPlanResult.rows[0].id, plan.price, discountAmount]
    );
    
    await client.query(
      `UPDATE promotions SET current_usage = current_usage + 1, updated_at = NOW() WHERE id = $1`,
      [promotion_id]
    );
    
    await client.query('COMMIT');
    
    res.json({
      ok: true,
      message: "تم تفعيل العرض بنجاح!",
      userPlan: userPlanResult.rows[0],
      promotion: promo,
      expiresAt: expiresAt
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Promotion redeem error:", error);
    res.status(500).json({ ok: false, error: "حدث خطأ في تطبيق العرض" });
  } finally {
    client.release();
  }
}));

router.get("/:id/stats", authMiddleware, requireRoles('super_admin', 'admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const statsResult = await db.query(
    `SELECT 
       COUNT(*) as total_redemptions,
       COUNT(DISTINCT user_id) as unique_users,
       SUM(amount_original) as total_original_value,
       SUM(amount_discounted) as total_discount_given,
       MIN(used_at) as first_use,
       MAX(used_at) as last_use
     FROM promotion_usage
     WHERE promotion_id = $1`,
    [id]
  );
  
  const dailyStats = await db.query(
    `SELECT DATE(used_at) as date, COUNT(*) as count
     FROM promotion_usage
     WHERE promotion_id = $1
     GROUP BY DATE(used_at)
     ORDER BY date DESC
     LIMIT 30`,
    [id]
  );
  
  const planBreakdown = await db.query(
    `SELECT p.name_ar, COUNT(*) as count
     FROM promotion_usage pu
     JOIN plans p ON pu.plan_id = p.id
     WHERE pu.promotion_id = $1
     GROUP BY p.name_ar
     ORDER BY count DESC`,
    [id]
  );
  
  res.json({
    ok: true,
    stats: statsResult.rows[0],
    dailyStats: dailyStats.rows,
    planBreakdown: planBreakdown.rows
  });
}));

module.exports = router;
