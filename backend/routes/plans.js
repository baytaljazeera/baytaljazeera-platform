// backend/routes/plans.js - Plans Management API
const express = require("express");
const db = require("../db");
const fs = require("fs");
const path = require("path");
const { authMiddleware, authMiddlewareWithEmailCheck, adminOnly, requirePermission } = require("../middleware/auth");
const { asyncHandler } = require('../middleware/asyncHandler');
const { subscriptionLimiter } = require("../config/security");
const pricingService = require("../services/pricingService");
const planService = require("../services/planService");
const promotionService = require("../services/promotionService");

const router = express.Router();

const adminAuth = [authMiddleware, adminOnly];

const SUPPORTED_COUNTRIES = [
  ...Object.values(pricingService.SUPPORTED_COUNTRIES).map(c => ({
    code: c.code,
    name_ar: c.name_ar,
    currency_code: c.currency_code,
    currency_symbol: c.symbol
  })),
  { code: 'INT', name_ar: 'دولي', currency_code: 'USD', currency_symbol: '$' }
];

router.get("/", asyncHandler(async (req, res) => {
  const { all } = req.query;
  const includeHidden = all === "true";
  
  const plans = await planService.getAllPlans(includeHidden);
  const plansWithDiscounts = await promotionService.applyPromotionsToPlans(plans, null);

  res.json({ plans: plansWithDiscounts });
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

  const plans = await promotionService.applyPromotionsToPlans(plansWithLocalPricing, null);

  res.json({ 
    plans, 
    country,
    has_country_pricing: Object.keys(priceMap).length > 0
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

router.put("/:id", adminAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const planId = parseInt(id, 10);
  if (isNaN(planId) || planId <= 0 || String(planId) !== id) {
    return res.status(400).json({ error: "معرف غير صالح", errorEn: "Invalid plan ID" });
  }
  
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
  res.json({ 
    ok: true, 
    plan: result.plan, 
    propagation: result.propagation,
    message: "تم تحديث الباقة بنجاح وانعكست التغييرات على المشتركين الحاليين" 
  });
}));

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
  
  // Upsert price
  const result = await db.query(`
    INSERT INTO country_plan_prices (plan_id, country_code, country_name_ar, currency_code, currency_symbol, price)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (plan_id, country_code) 
    DO UPDATE SET price = $6, updated_at = NOW()
    RETURNING *
  `, [plan_id, upperCode, country.name_ar, country.currency_code, country.currency_symbol, price]);
  
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
  
  res.json({ ok: true, price: result.rows[0] });
}));

// ADMIN: Delete country price
router.delete("/admin/country-prices/:id", adminAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const result = await db.query("DELETE FROM country_plan_prices WHERE id = $1 RETURNING *", [id]);
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "السعر غير موجود", errorEn: "Price not found" });
  }
  
  res.json({ ok: true, message: "تم حذف السعر بنجاح" });
}));

module.exports = router;
