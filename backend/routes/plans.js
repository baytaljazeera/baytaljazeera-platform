// backend/routes/plans.js - Plans Management API
const express = require("express");
const db = require("../db");
const fs = require("fs");
const path = require("path");
const { authMiddleware, authMiddlewareWithEmailCheck, adminOnly, requirePermission, requireRoles } = require("../middleware/auth");
const { asyncHandler } = require('../middleware/asyncHandler');
const { subscriptionLimiter } = require("../config/security");
const pricingService = require("../services/pricingService");
const planService = require("../services/planService");
const promotionService = require("../services/promotionService");

const router = express.Router();

// Plans are a STRATEGIC governance setting (pricing, free trials,
// country overrides, launch promos). Restricted to senior management.
// Previously any of 6 admin roles could mutate prices — that mixed
// "policy" with "finance ops" and let any finance_admin change
// pricing without senior review. Now: super_admin + admin_manager
// only. Read endpoints (GET) stay public for the customer site.
const adminAuth = [authMiddleware, requireRoles('super_admin', 'admin_manager')];

// ─── Plan-change audit ────────────────────────────────────────────
// Every write to plans / country_plan_prices passes through here so
// we have an immutable "who changed what when" trail. Best-effort —
// failures are logged but never block the actual change.
async function auditPlanChange({ actor, action, planId, countryCode, before, after }) {
  try {
    await db.query(
      `INSERT INTO ai_audit_log
         (action, target_kind, target_id, old_value, new_value, actor_id, actor_name, actor_role)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8)`,
      [
        action,
        countryCode ? 'plan_country_price' : 'plan',
        planId != null ? String(planId).slice(0, 80) : null,
        before == null ? null : JSON.stringify(before),
        after == null ? null : JSON.stringify(after),
        actor?.id || null,
        actor?.name || null,
        actor?.role || null,
      ]
    );
  } catch (e) {
    console.warn('[plans audit] failed:', e.message);
  }
}

const SUPPORTED_COUNTRIES = [
  ...Object.values(pricingService.SUPPORTED_COUNTRIES).map(c => ({
    code: c.code,
    name_ar: c.name_ar,
    currency_code: c.currency_code,
    currency_symbol: c.symbol
  })),
  { code: 'INT', name_ar: 'دولي', currency_code: 'USD', currency_symbol: '$' }
];

// ─── Launch-free-mode helper ──────────────────────────────────────
// Single source of truth for the master kill-switch. Reads
// app_settings.plans_launch_free_mode each call (no caching — the
// operator expects flipping the toggle to take effect immediately).
// Returns false on any error so we fail open to "show real prices".
async function isLaunchFreeMode() {
  try {
    const r = await db.query(
      `SELECT value FROM app_settings WHERE key = 'plans_launch_free_mode'`
    );
    return r.rows[0]?.value === 'true';
  } catch {
    return false;
  }
}

// Apply the master kill-switch to a list of plans. Zeroes out every
// price-bearing field the customer site might read, AND tags the
// plan so the UI can show a "launch promo" badge instead of just a
// 0. Country-pricing fields (local_price) get zeroed too because the
// kill-switch outranks per-country overrides.
//
// Critical: the promotion service writes snake_case fields
// (discounted_price, applied_promotion, original_price, etc.) BEFORE
// we run. Without clearing those, the customer page would still show
// "-100% خصم — مجاناً" even with the master switch off because the
// promo fields persist. So we wipe BOTH naming conventions.
function applyLaunchFreeMode(plans) {
  return plans.map((p) => ({
    ...p,
    price: 0,
    // camelCase (some endpoints / older clients)
    discountedPrice: 0,
    originalPrice: 0,
    discountPercentage: 0,
    discountAmount: 0,
    appliedPromotion: null,
    // snake_case (current promotionService output)
    discounted_price: 0,
    original_price: 0,
    discount_percentage: 0,
    discount_amount: 0,
    applied_promotion: null,
    // country override
    local_price: 0,
    // flag for UI
    is_launch_free_mode: true,
  }));
}

// ─── Free-pricing diagnostic ──────────────────────────────────────
// Single source of truth that answers "why do customers see plans
// as free right now?". Inspects all THREE independent sources:
//   1. Master kill-switch (app_settings.plans_launch_free_mode)
//   2. Active promotions that produce 100%-off / free_plan / skip_payment
//   3. country_plan_prices rows with price=0 on any country
// Returns one consolidated object so the admin UI can render a
// single banner listing every active source + a deactivate path.
router.get("/free-pricing-diagnostic", asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store, max-age=0');
  const out = {
    master_switch: { enabled: false },
    free_promotions: [],
    zero_country_prices: { by_country: {} },
    any_active: false,
  };
  try {
    out.master_switch.enabled = await isLaunchFreeMode();
  } catch { /* default false */ }
  try {
    // Fetch ALL active promotions, then filter "free-ish" ones in
    // JS. Previous version pushed the filter into SQL and silently
    // returned 0 rows in production even though the promo matched
    // every condition — couldnt reproduce locally, so we drop the
    // SQL filter and apply the same logic in JS where its trivial
    // to debug. Also gives us correct number coercion for the
    // DECIMAL discount_value column.
    const r = await db.query(
      `SELECT id, name, name_ar, name_en, promotion_type, discount_type,
              discount_value, skip_payment, applies_to, status,
              start_at, end_at, current_usage, usage_limit_total
       FROM promotions
       WHERE status = 'active'
         AND (start_at IS NULL OR start_at <= NOW())
         AND (end_at IS NULL OR end_at >= NOW())
         AND (usage_limit_total IS NULL OR current_usage < usage_limit_total)
       ORDER BY id`
    );
    out.free_promotions = r.rows.filter((p) => {
      const type = String(p.promotion_type || '').toLowerCase();
      const dtype = String(p.discount_type || '').toLowerCase();
      const dval = Number(p.discount_value) || 0;
      const skipPay = p.skip_payment === true || p.skip_payment === 'true';
      return (
        type === 'free_plan' ||
        type === 'free_trial' ||
        (dtype === 'percentage' && dval >= 100) ||
        skipPay
      );
    });
    // TEMP debug — expose raw counts so we can see why the filter
    // seems empty in production. Will be removed once we know why.
    out._debug = {
      total_active_rows: r.rows.length,
      raw_sample: r.rows.slice(0, 2).map((p) => ({
        id: p.id, name_ar: p.name_ar, promotion_type: p.promotion_type,
        discount_type: p.discount_type, discount_value: p.discount_value,
        skip_payment: p.skip_payment, status: p.status,
      })),
    };
    console.log('[diagnostic] active=' + r.rows.length + ' free=' + out.free_promotions.length);
  } catch (e) {
    // TEMP — surface the actual error so we can see what's throwing
    out._debug_promo_error = {
      message: e?.message,
      code: e?.code,
      detail: e?.detail,
      hint: e?.hint,
      position: e?.position,
    };
    console.warn('[free-pricing-diagnostic] promo lookup failed:', e.message, e.code);
  }
  try {
    const r = await db.query(
      `SELECT country_code, country_name_ar, COUNT(*) AS zero_count,
              ARRAY_AGG(plan_id ORDER BY plan_id) AS plan_ids
       FROM country_plan_prices
       WHERE is_active = true AND price = 0
       GROUP BY country_code, country_name_ar
       ORDER BY country_code`
    );
    r.rows.forEach((row) => {
      out.zero_country_prices.by_country[row.country_code] = {
        country_name_ar: row.country_name_ar,
        zero_count: Number(row.zero_count),
        plan_ids: row.plan_ids,
      };
    });
  } catch (e) {
    console.warn('[free-pricing-diagnostic] country lookup failed:', e.message);
  }
  out.any_active =
    out.master_switch.enabled ||
    out.free_promotions.length > 0 ||
    Object.keys(out.zero_country_prices.by_country).length > 0;
  console.log('[free-pricing-diagnostic]', JSON.stringify({
    master: out.master_switch.enabled,
    promos: out.free_promotions.length,
    countries: Object.keys(out.zero_country_prices.by_country).length,
  }));
  res.json(out);
}));

// Wipe ALL country overrides in one shot — restores every country
// to the base SAR price. Two-step confirm on the frontend.
router.post("/admin/country-prices/clear-all", adminAuth, asyncHandler(async (req, res) => {
  const r = await db.query(`DELETE FROM country_plan_prices RETURNING id, country_code`);
  auditPlanChange({
    actor: req.user,
    action: 'plan_country_price.clear_all',
    planId: null,
    countryCode: null,
    before: { cleared_rows: r.rowCount },
    after: null,
  });
  console.log('[country-prices clear-all]', JSON.stringify({
    cleared: r.rowCount, by: req.user?.id,
  }));
  res.json({ ok: true, cleared: r.rowCount });
}));

// Quick-wipe per-country overrides — clears every row for one
// country_code so its customers see base SAR prices.
router.post("/admin/country-prices/clear-country", adminAuth, asyncHandler(async (req, res) => {
  const code = String(req.body?.country_code || '').toUpperCase();
  if (!/^[A-Z]{2,3}$/.test(code)) {
    return res.status(400).json({ error: "كود الدولة غير صالح" });
  }
  const r = await db.query(
    `DELETE FROM country_plan_prices WHERE country_code = $1 RETURNING id, plan_id, price`,
    [code]
  );
  auditPlanChange({
    actor: req.user,
    action: 'plan_country_price.bulk_clear',
    planId: null,
    countryCode: code,
    before: { cleared_rows: r.rowCount, rows: r.rows },
    after: null,
  });
  console.log('[country-prices clear]', JSON.stringify({
    code, cleared: r.rowCount, by: req.user?.id,
  }));
  res.json({ ok: true, cleared: r.rowCount });
}));

router.get("/", asyncHandler(async (req, res) => {
  const { all } = req.query;
  const includeHidden = all === "true";

  const plans = await planService.getAllPlans(includeHidden);
  const plansWithDiscounts = await promotionService.applyPromotionsToPlans(plans, null);
  const launchFree = await isLaunchFreeMode();
  const finalPlans = launchFree ? applyLaunchFreeMode(plansWithDiscounts) : plansWithDiscounts;

  res.json({ plans: finalPlans, launch_free_mode: launchFree });
}));

// Get all supported countries (MUST be before /:id to avoid route conflict)
router.get("/countries", (req, res) => {
  res.json({ countries: SUPPORTED_COUNTRIES });
});

// Get plans with country-specific pricing (MUST be before /:id)
router.get("/by-country/:countryCode", asyncHandler(async (req, res) => {
  const { countryCode } = req.params;
  const upperCode = countryCode.toUpperCase();
  
  const country = SUPPORTED_COUNTRIES.find(c => c.code === upperCode);
  if (!country) {
    return res.status(400).json({ error: "الدولة غير مدعومة", errorEn: "Country not supported" });
  }

  const basePlans = await planService.getAllPlans(false);
  
  const pricesResult = await db.query(
    `SELECT * FROM country_plan_prices WHERE country_code = $1 AND is_active = true`,
    [upperCode]
  );
  
  const priceMap = {};
  pricesResult.rows.forEach(p => {
    priceMap[p.plan_id] = p;
  });

  const plansWithLocalPricing = basePlans.map(plan => {
    const countryPrice = priceMap[plan.id];
    return {
      ...plan,
      local_price: countryPrice ? parseFloat(countryPrice.price) : parseFloat(plan.price),
      local_currency_code: countryPrice ? country.currency_code : 'SAR',
      local_currency_symbol: countryPrice ? country.currency_symbol : 'ر.س',
      country_code: countryPrice ? upperCode : 'SA',
      country_name_ar: countryPrice ? country.name_ar : 'السعودية',
      is_country_pricing: !!countryPrice
    };
  });

  const promotedPlans = await promotionService.applyPromotionsToPlans(plansWithLocalPricing, null);
  const launchFree = await isLaunchFreeMode();
  const plans = launchFree ? applyLaunchFreeMode(promotedPlans) : promotedPlans;

  res.json({
    plans,
    country,
    has_country_pricing: Object.keys(priceMap).length > 0,
    launch_free_mode: launchFree
  });
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // Validate ID is a positive integer
  const planId = parseInt(id, 10);
  if (isNaN(planId) || planId <= 0 || String(planId) !== id) {
    return res.status(400).json({ error: "معرف غير صالح", errorEn: "Invalid plan ID" });
  }
  
  const result = await db.query("SELECT * FROM plans WHERE id = $1", [planId]);
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "الباقة غير موجودة", errorEn: "Plan not found" });
  }
  
  res.json({ plan: result.rows[0] });
}));

router.put("/:id", adminAuth, async (req, res) => {
  const { id } = req.params;

  const planId = parseInt(id, 10);
  if (isNaN(planId) || planId <= 0 || String(planId) !== id) {
    return res.status(400).json({ error: "معرف غير صالح", errorEn: "Invalid plan ID" });
  }

  // Snapshot BEFORE so the audit trail captures the old price.
  let beforeSnap = null;
  try {
    const r = await db.query('SELECT id, name_ar, price, visible FROM plans WHERE id = $1', [planId]);
    beforeSnap = r.rows[0] || null;
  } catch { /* best-effort snapshot */ }

  try {
    const adminUserId = req.user.id;
    const result = await planService.updatePlan(planId, req.body, adminUserId);
    
    if (!result.success) {
      const statusCode = result.errors?.some(e => e.message === 'Plan not found') ? 404 : 400;
      return res.status(statusCode).json({ 
        error: result.errors?.[0]?.message || "خطأ في التحديث", 
        errors: result.errors 
      });
    }
    
    console.log(`Plan ${planId} updated successfully with propagation:`, result.propagation);
    auditPlanChange({
      actor: req.user,
      action: 'plan.update',
      planId,
      before: beforeSnap,
      after: result.plan ? { id: result.plan.id, name_ar: result.plan.name_ar, price: result.plan.price, visible: result.plan.visible } : null,
    });
    res.json({
      ok: true,
      plan: result.plan,
      propagation: result.propagation,
      message: "تم تحديث الباقة بنجاح وانعكست التغييرات على المشتركين الحاليين"
    });
  } catch (err) {
    console.error(`[Plans] ❌ Error updating plan ${planId}:`, err.message, err.stack);
    res.status(500).json({ 
      error: "خطأ في تحديث الباقة",
      errorEn: err.message,
      detail: err.detail || null
    });
  }
});

router.patch("/:id/visibility", adminAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // Validate ID is a positive integer
  const planId = parseInt(id, 10);
  if (isNaN(planId) || planId <= 0 || String(planId) !== id) {
    return res.status(400).json({ error: "معرف غير صالح", errorEn: "Invalid plan ID" });
  }
  
  const { visible } = req.body;

  const result = await db.query(
    "UPDATE plans SET visible = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
    [visible, planId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "الباقة غير موجودة", errorEn: "Plan not found" });
  }

  res.json({ 
    ok: true, 
    plan: result.rows[0], 
    message: visible ? "تم إظهار الباقة" : "تم إخفاء الباقة" 
  });
}));

router.post("/", adminAuth, asyncHandler(async (req, res) => {
  const adminUserId = req.user.id;
  const result = await planService.createPlan(req.body, adminUserId);
  
  if (!result.success) {
    const statusCode = result.errors?.some(e => e.field === 'slug') ? 409 : 400;
    return res.status(statusCode).json({ 
      error: result.errors?.[0]?.message || "خطأ في إنشاء الباقة", 
      errors: result.errors 
    });
  }

  res.status(201).json({ ok: true, plan: result.plan, message: "تم إنشاء الباقة بنجاح" });
}));

router.delete("/:id", adminAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const planId = parseInt(id, 10);
  if (isNaN(planId) || planId <= 0 || String(planId) !== id) {
    return res.status(400).json({ error: "معرف غير صالح", errorEn: "Invalid plan ID" });
  }
  
  const adminUserId = req.user.id;
  const result = await planService.deletePlan(planId, adminUserId);
  
  if (!result.success) {
    const statusCode = result.errors?.some(e => e.message?.includes('not found')) ? 404 : 400;
    return res.status(statusCode).json({ 
      error: result.errors?.[0]?.message || "خطأ في حذف الباقة",
      errorEn: result.errors?.[0]?.message || "Error deleting plan"
    });
  }

  res.json({ ok: true, message: "تم حذف الباقة بنجاح" });
}));

router.patch("/reorder", adminAuth, asyncHandler(async (req, res) => {
  const { orders } = req.body;
  
  for (const item of orders) {
    await db.query(
      "UPDATE plans SET sort_order = $1, updated_at = NOW() WHERE id = $2",
      [item.sort_order, item.id]
    );
  }

  res.json({ ok: true, message: "تم إعادة ترتيب الباقات بنجاح" });
}));

// 🔒 Security: Use centralized auth middleware with email verification for user subscriptions
const userAuth = authMiddlewareWithEmailCheck;

// Subscribe to a plan with promotion support (using centralized planService)
router.post("/subscribe", subscriptionLimiter, userAuth, asyncHandler(async (req, res) => {
  const { planId, countryCode } = req.body;
  const userId = req.user.id;

  if (!planId) {
    return res.status(400).json({ error: "يرجى تحديد الباقة", errorEn: "Plan ID required" });
  }

  const result = await planService.subscribeToPlan(userId, planId, countryCode || 'SA');
  
  if (!result.success) {
    if (result.requiresPayment) {
      return res.json({
        ok: false,
        requiresPayment: true,
        originalPrice: result.originalPrice,
        finalPrice: result.finalPrice,
        discount: result.discount,
        currencyCode: result.currencyCode,
        currencySymbol: result.currencySymbol,
        countryCode: result.countryCode,
        promotionId: result.promotionId,
        promotionName: result.promotionName,
        message: "يرجى إتمام الدفع للاشتراك في الباقة"
      });
    }
    
    const statusCode = result.error?.includes('not found') ? 404 : 400;
    return res.status(statusCode).json({ 
      error: result.error || "خطأ في الاشتراك",
      errorEn: result.error || "Subscription error"
    });
  }

  res.json({
    ok: true,
    message: result.promotion 
      ? `تم الاشتراك في الباقة بنجاح مع تطبيق عرض "${result.promotion.name}"`
      : "تم الاشتراك في الباقة بنجاح",
    subscription: result.subscription,
    plan: result.plan,
    expiresAt: result.expiresAt,
    originalPrice: result.originalPrice,
    finalPrice: result.finalPrice,
    promotion: result.promotion
  });
}));

// Get user's current subscription
router.get("/my-subscription", userAuth, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const result = await db.query(
    `SELECT up.*, p.name_ar, p.name_en, p.max_listings, p.max_photos_per_listing, 
            p.max_videos_per_listing, p.show_on_map, p.price
     FROM user_plans up
     JOIN plans p ON up.plan_id = p.id
     WHERE up.user_id = $1 AND up.status = 'active' AND up.expires_at > NOW()
     ORDER BY up.created_at DESC
     LIMIT 1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return res.json({ subscription: null, message: "لا يوجد اشتراك نشط" });
  }

  res.json({ subscription: result.rows[0] });
}));

router.get("/icons/list", asyncHandler(async (req, res) => {
  const iconsDir = path.join(__dirname, "../../frontend/public/icons");
  
  if (!fs.existsSync(iconsDir)) {
    return res.json({ icons: [] });
  }
  
  const files = fs.readdirSync(iconsDir);
  const icons = files
    .filter(f => /\.(jpeg|jpg|png|gif|svg|webp)$/i.test(f))
    .map(f => ({
      filename: f,
      path: `/icons/${f}`,
      name: f.replace(/\.(jpeg|jpg|png|gif|svg|webp)$/i, "").replace(/-/g, " ")
    }));
  
  res.json({ icons });
}));

router.post("/icons/upload", adminAuth, asyncHandler(async (req, res) => {
  const { filename, data } = req.body;
  
  if (!filename || !data) {
    return res.status(400).json({ error: "الملف مطلوب", errorEn: "File required" });
  }
  
  // التحقق من نوع الملف
  const ext = path.extname(filename).toLowerCase();
  if (![".jpeg", ".jpg", ".png", ".gif", ".webp"].includes(ext)) {
    return res.status(400).json({ error: "نوع الملف غير مدعوم (يُسمح بـ: JPEG, PNG, GIF, WebP)", errorEn: "Invalid file type" });
  }
  
  // التحقق من الـ MIME type في بيانات base64
  const mimeMatch = data.match(/^data:(image\/\w+);base64,/);
  if (!mimeMatch) {
    return res.status(400).json({ error: "تنسيق البيانات غير صحيح", errorEn: "Invalid data format" });
  }
  
  const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
  if (!allowedMimes.includes(mimeMatch[1])) {
    return res.status(400).json({ error: "نوع الصورة غير مدعوم", errorEn: "Unsupported image type" });
  }
  
  // التحقق من حجم الملف (الحد الأقصى 2MB)
  const base64Data = data.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");
  const maxSize = 2 * 1024 * 1024; // 2MB
  if (buffer.length > maxSize) {
    return res.status(400).json({ error: "حجم الملف كبير جداً (الحد الأقصى 2MB)", errorEn: "File too large (max 2MB)" });
  }
  
  const iconsDir = path.join(__dirname, "../../frontend/public/icons");
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }
  
  // إنشاء اسم ملف آمن وفريد
  const randomSuffix = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  const baseName = filename.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-").toLowerCase();
  const safeName = `${baseName.replace(/-(jpeg|jpg|png|gif|webp)$/i, "")}-${randomSuffix}${ext}`;
  const filePath = path.join(iconsDir, safeName);
  
  // منع الوصول خارج المجلد
  if (!filePath.startsWith(iconsDir)) {
    return res.status(400).json({ error: "مسار غير صالح", errorEn: "Invalid path" });
  }
  
  fs.writeFileSync(filePath, buffer);
  
  res.json({ 
    ok: true, 
    icon: { filename: safeName, path: `/icons/${safeName}` },
    message: "تم رفع الأيقونة بنجاح" 
  });
}));

// ==========================================
// 🌍 COUNTRY-BASED PRICING ADMIN APIS
// ==========================================

// ADMIN: Get all country prices for a plan
router.get("/admin/country-prices/:planId", adminAuth, asyncHandler(async (req, res) => {
  const { planId } = req.params;
  
  const result = await db.query(
    `SELECT * FROM country_plan_prices WHERE plan_id = $1 ORDER BY country_name_ar`,
    [planId]
  );
  
  // Get plan info
  const planResult = await db.query("SELECT * FROM plans WHERE id = $1", [planId]);
  if (planResult.rows.length === 0) {
    return res.status(404).json({ error: "الباقة غير موجودة", errorEn: "Plan not found" });
  }
  
  res.json({ 
    plan: planResult.rows[0],
    country_prices: result.rows,
    supported_countries: SUPPORTED_COUNTRIES
  });
}));

// ADMIN: Get all country prices (matrix view)
router.get("/admin/country-prices", adminAuth, asyncHandler(async (req, res) => {
  const plansResult = await db.query("SELECT * FROM plans ORDER BY sort_order ASC, price ASC");
  const pricesResult = await db.query("SELECT * FROM country_plan_prices ORDER BY plan_id, country_code");
  
  // Create matrix structure
  const matrix = {};
  SUPPORTED_COUNTRIES.forEach(c => {
    matrix[c.code] = {
      ...c,
      prices: {}
    };
  });
  
  pricesResult.rows.forEach(price => {
    if (matrix[price.country_code]) {
      matrix[price.country_code].prices[price.plan_id] = {
        id: price.id,
        price: parseFloat(price.price),
        is_active: price.is_active
      };
    }
  });
  
  res.json({ 
    plans: plansResult.rows,
    countries: SUPPORTED_COUNTRIES,
    price_matrix: matrix
  });
}));

// ADMIN: Set/Update country price for a plan
router.post("/admin/country-prices", adminAuth, asyncHandler(async (req, res) => {
  const { plan_id, country_code, price } = req.body;
  
  if (!plan_id || !country_code || price === undefined) {
    return res.status(400).json({ error: "بيانات ناقصة", errorEn: "Missing data" });
  }
  
  const upperCode = country_code.toUpperCase();
  const country = SUPPORTED_COUNTRIES.find(c => c.code === upperCode);
  if (!country) {
    return res.status(400).json({ error: "الدولة غير مدعومة", errorEn: "Country not supported" });
  }
  
  // Snapshot current price for audit (may be null on first insert).
  let beforeRow = null;
  try {
    const r = await db.query(
      'SELECT price, is_active FROM country_plan_prices WHERE plan_id = $1 AND country_code = $2',
      [plan_id, upperCode]
    );
    beforeRow = r.rows[0] || null;
  } catch { /* ignore */ }

  // Upsert price
  const result = await db.query(`
    INSERT INTO country_plan_prices (plan_id, country_code, country_name_ar, currency_code, currency_symbol, price)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (plan_id, country_code)
    DO UPDATE SET price = $6, updated_at = NOW()
    RETURNING *
  `, [plan_id, upperCode, country.name_ar, country.currency_code, country.currency_symbol, price]);

  auditPlanChange({
    actor: req.user,
    action: beforeRow ? 'plan_country_price.update' : 'plan_country_price.create',
    planId: plan_id,
    countryCode: upperCode,
    before: beforeRow,
    after: { price: parseFloat(result.rows[0].price), is_active: result.rows[0].is_active },
  });

  res.json({
    ok: true,
    price: result.rows[0],
    message: "تم حفظ السعر بنجاح"
  });
}));

// ADMIN: Bulk update country prices
router.post("/admin/country-prices/bulk", adminAuth, asyncHandler(async (req, res) => {
  const { prices } = req.body;
  
  if (!Array.isArray(prices) || prices.length === 0) {
    return res.status(400).json({ error: "لا توجد أسعار للتحديث", errorEn: "No prices to update" });
  }
  
  let updated = 0;
  let errors = [];
  
  for (const item of prices) {
    try {
      const { plan_id, country_code, price } = item;
      const upperCode = country_code.toUpperCase();
      const country = SUPPORTED_COUNTRIES.find(c => c.code === upperCode);
      
      if (!country) continue;
      
      await db.query(`
        INSERT INTO country_plan_prices (plan_id, country_code, country_name_ar, currency_code, currency_symbol, price)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (plan_id, country_code) 
        DO UPDATE SET price = $6, updated_at = NOW()
      `, [plan_id, upperCode, country.name_ar, country.currency_code, country.currency_symbol, price]);
      
      updated++;
    } catch (e) {
      errors.push({ item, error: e.message });
    }
  }
  
  res.json({ 
    ok: true, 
    updated,
    errors: errors.length > 0 ? errors : undefined,
    message: `تم تحديث ${updated} سعر`
  });
}));

// ADMIN: Toggle country price active status
router.patch("/admin/country-prices/:id/toggle", adminAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const result = await db.query(
    `UPDATE country_plan_prices SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "السعر غير موجود", errorEn: "Price not found" });
  }

  const row = result.rows[0];
  auditPlanChange({
    actor: req.user,
    action: 'plan_country_price.toggle',
    planId: row.plan_id,
    countryCode: row.country_code,
    before: { is_active: !row.is_active },
    after: { is_active: row.is_active },
  });

  res.json({ ok: true, price: row });
}));

// ADMIN: Delete country price
router.delete("/admin/country-prices/:id", adminAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await db.query("DELETE FROM country_plan_prices WHERE id = $1 RETURNING *", [id]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "السعر غير موجود", errorEn: "Price not found" });
  }

  const row = result.rows[0];
  auditPlanChange({
    actor: req.user,
    action: 'plan_country_price.delete',
    planId: row.plan_id,
    countryCode: row.country_code,
    before: { price: parseFloat(row.price), is_active: row.is_active },
    after: null,
  });

  res.json({ ok: true, message: "تم حذف السعر بنجاح" });
}));

module.exports = router;
