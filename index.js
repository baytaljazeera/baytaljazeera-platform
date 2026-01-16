// index.js - Aqar Al Jazeera Backend
// Refactored: Config and services moved to separate modules

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const db = require("./backend/db");
const { authMiddleware, requireRoles, adminMiddleware } = require("./backend/middleware/auth");
const { sanitizeInput, validatePagination } = require("./backend/middleware/validation");
const { setCsrfToken, getCsrfToken, csrfProtection } = require("./backend/middleware/csrf");

// 📦 Modular imports - security, multer, scheduler, services
const { 
  generalLimiter, authLimiter, aiLimiter, 
  reportCreateLimiter, adminPagesLimiter, complaintsLimiter,
  corsOptions 
} = require("./backend/config/security");
const { upload, cleanupUploadedFiles } = require("./backend/config/multer");
const { startScheduledTasks, fixActiveListings } = require("./backend/scheduler/tasks");
const { 
  FREE_PLAN_ID, getPlanById, getFreePlan, 
  getActivePaidPlanForUser, scheduleListingExpiryReminder 
} = require("./backend/services/planService");
const { generateListingSlideshow } = require("./backend/services/videoService");
const { cache, isRedisConnected } = require("./backend/config/redis");
const { initializeWorkers, closeAllQueues } = require("./backend/queues");
const { setupAuth, registerAuthRoutes } = require("./backend/replit_auth");

// 🔒 Startup Environment Validation
const REQUIRED_ENV_VARS = ['SESSION_SECRET', 'DATABASE_URL'];
const missingEnvVars = REQUIRED_ENV_VARS.filter(key => !process.env[key]);
if (missingEnvVars.length > 0) {
  console.error('❌ CRITICAL: Missing required environment variables:', missingEnvVars.join(', '));
  console.error('Please set these environment variables before starting the server.');
  process.exit(1);
}

// 📦 Route imports
const authRoutes = require("./backend/routes/auth");
const favoritesRoutes = require("./backend/routes/favorites");
const notificationsRoutes = require("./backend/routes/notifications");
const accountRoutes = require("./backend/routes/account");
const plansRoutes = require("./backend/routes/plans");
const adminRoutes = require("./backend/routes/admin");
const membershipRoutes = require("./backend/routes/membership");
const messagesRoutes = require("./backend/routes/messages");
const adminMessagesRoutes = require("./backend/routes/admin-messages");
const financeRoutes = require("./backend/routes/finance");
const marketingRoutes = require("./backend/routes/marketing");
const permissionsRoutes = require("./backend/routes/permissions");
const paymentsRoutes = require("./backend/routes/payments");
const quotaRoutes = require("./backend/routes/quota");
const supportRoutes = require("./backend/routes/support");
const eliteSlotsRoutes = require("./backend/routes/elite-slots");
const whatsappRoutes = require("./backend/routes/whatsapp");
const aiRoutes = require("./backend/routes/ai");
const listingsRoutes = require("./backend/routes/listings");
const reportsRoutes = require("./backend/routes/reports");
const complaintsRoutes = require("./backend/routes/complaints");
const newsRoutes = require("./backend/routes/news");
const locationsRoutes = require("./backend/routes/locations");
const geoRoutes = require("./backend/routes/geo");
const settingsRoutes = require("./backend/routes/settings");
const promotionsRoutes = require("./backend/routes/promotions");
const geolocationRoutes = require("./backend/routes/geolocation");
const featuredCitiesRoutes = require("./backend/routes/featured-cities");
const exchangeRatesRoutes = require("./backend/routes/exchange-rates");
const ratingsRoutes = require("./backend/routes/ratings");
const ambassadorRoutes = require("./backend/routes/ambassador");
const stripeRoutes = require("./backend/routes/stripe");
const listingWorkflowRoutes = require("./backend/routes/listing-workflow");
const launchTrialRoutes = require("./backend/routes/launch-trial");
const { createSlideshowVideo, generateDynamicPromoText, generatePromotionalText } = require("./backend/routes/ai");

const app = express();

// 🔒 Trust proxy for Replit (required for rate limiting)
app.set('trust proxy', 1);

// 🔧 Hostname Fix Middleware - Fix "base" hostname from Next.js proxy
// This MUST run before session middleware to prevent ENOTFOUND errors
app.use((req, res, next) => {
  const originalHostname = req.hostname;
  
  // Fix invalid hostnames to prevent session middleware errors
  if (originalHostname === 'base' || !originalHostname || originalHostname.length < 3) {
    // Override hostname getter to return a valid hostname
    const validHostname = process.env.REPLIT_DEV_DOMAIN || '127.0.0.1';
    Object.defineProperty(req, 'hostname', {
      get: () => validHostname,
      configurable: true
    });
    // Also fix the host header which session middleware may use
    if (req.headers.host === 'base' || !req.headers.host) {
      req.headers.host = validHostname;
    }
  }
  next();
});

// 🔒 Security Middleware - Helmet (HTTP Security Headers)
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,
}));

// تطبيق Rate Limiting
app.use(generalLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/ai", aiLimiter);

// 🔒 CORS - استخدام الإعدادات من الملف المستورد
app.use(cors(corsOptions));

app.use(cookieParser());

// 💳 Stripe Webhook - MUST be before express.json()
const { processWebhook } = require('./backend/services/webhookHandlers');
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];
  if (!signature) {
    return res.status(400).json({ error: 'Missing stripe-signature' });
  }
  try {
    const sig = Array.isArray(signature) ? signature[0] : signature;
    if (!Buffer.isBuffer(req.body)) {
      console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
      return res.status(500).json({ error: 'Webhook processing error' });
    }
    await processWebhook(req.body, sig);
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error.message);
    res.status(400).json({ error: 'Webhook processing error' });
  }
});

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// 🔒 Input Sanitization - حماية من XSS
app.use(sanitizeInput);

// 🔒 CSRF Protection - إعداد token للمتصفح
app.use(setCsrfToken);
app.get('/api/csrf-token', getCsrfToken);

// 🔧 Maintenance Mode Middleware
const maintenanceModeMiddleware = async (req, res, next) => {
  const excludedPaths = [
    '/api/auth/login',
    '/api/auth/me', 
    '/api/admin',
    '/api/settings',
    '/api/health',
    '/admin',
    '/admin-login',
    '/uploads'
  ];
  
  const isExcluded = excludedPaths.some(path => req.path.startsWith(path));
  if (isExcluded) {
    return next();
  }
  
  try {
    const result = await db.query(
      `SELECT value FROM app_settings WHERE key = 'maintenance_mode'`
    );
    const isMaintenanceMode = result.rows.length > 0 && result.rows[0].value === 'true';
    
    if (isMaintenanceMode) {
      return res.status(503).json({
        error: "الموقع تحت الصيانة",
        errorEn: "Site is under maintenance",
        maintenance: true
      });
    }
  } catch (err) {
    console.error("Error checking maintenance mode:", err.message);
  }
  next();
};

app.use(maintenanceModeMiddleware);

// 🔒 Request Logging Middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
    if (req.path !== '/api/health' && !req.path.startsWith('/_next')) {
      console.log(`[${logLevel}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// خدمة الملفات الثابتة
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// 📦 Multer configuration imported from backend/config/multer.js

// Database initialization status
let dbInitialized = false;

// دالة تهيئة قاعدة البيانات (تُستدعى قبل بدء السيرفر)
async function runDatabaseInit() {
  try {
    const { initializeDatabase } = require("./backend/init");
    await initializeDatabase();
    console.log("✅ Database tables initialized");
    
    // إنشاء جدول flagged_conversations
    await db.query(`
      CREATE TABLE IF NOT EXISTS flagged_conversations (
        id SERIAL PRIMARY KEY,
        user1_id UUID REFERENCES users(id) ON DELETE CASCADE,
        user2_id UUID REFERENCES users(id) ON DELETE CASCADE,
        listing_id UUID REFERENCES properties(id) ON DELETE SET NULL,
        flag_type VARCHAR(50) NOT NULL DEFAULT 'suspicious',
        flag_reason TEXT,
        ai_analysis TEXT,
        ai_risk_score INTEGER DEFAULT 0,
        flagged_by UUID REFERENCES users(id) ON DELETE SET NULL,
        status VARCHAR(20) DEFAULT 'pending',
        admin_note TEXT,
        reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_flagged_conv_status ON flagged_conversations(status);`);
    console.log("✅ flagged_conversations table ready");
    
    // إضافة فهارس للأداء
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
      CREATE INDEX IF NOT EXISTS idx_properties_user_id ON properties(user_id);
      CREATE INDEX IF NOT EXISTS idx_properties_city ON properties(city);
      CREATE INDEX IF NOT EXISTS idx_properties_created_at ON properties(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_properties_is_featured ON properties(is_featured) WHERE is_featured = true;
      CREATE INDEX IF NOT EXISTS idx_user_plans_user_id ON user_plans(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_plans_status ON user_plans(status);
      CREATE INDEX IF NOT EXISTS idx_user_plans_plan_id ON user_plans(plan_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read) WHERE is_read = false;
      CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_listing_reports_status ON listing_reports(status);
      CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);
      CREATE INDEX IF NOT EXISTS idx_membership_requests_status ON membership_requests(status);
      CREATE INDEX IF NOT EXISTS idx_quota_buckets_user_id ON quota_buckets(user_id);
      CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
      CREATE INDEX IF NOT EXISTS idx_favorites_listing_id ON favorites(listing_id);
    `);
    console.log("✅ Performance indexes created");
    
    dbInitialized = true;
    return true;
  } catch (err) {
    console.error("❌ Database init error:", err.message);
    return false;
  }
}

// معالجة الأخطاء العامة
process.on("uncaughtException", (err) =>
  console.error("Uncaught error:", err)
);
process.on("unhandledRejection", (err) =>
  console.error("Unhandled rejection:", err)
);

// 📦 Plan functions imported from backend/services/planService.js
// 📦 Video generation imported from backend/services/videoService.js

// 🔐 Setup Replit OAuth (Google, Apple, GitHub, etc.)
(async () => {
  try {
    await setupAuth(app);
    registerAuthRoutes(app);
    console.log('✅ Replit Auth configured (Google, Apple, GitHub, X, Email)');
  } catch (err) {
    console.log('⚠️ Replit Auth not available:', err.message);
  }
})();

// 🟢 مسار اختبار بسيط
app.get("/", (req, res) => {
  res.json({ message: "Aqar Al Jazeera API", status: "ok", version: "2.0.0" });
});

// 🟢 Health Check Endpoint for monitoring
app.get("/api/health", async (req, res) => {
  const startTime = Date.now();
  const health = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    checks: {}
  };

  // Database check
  try {
    const dbStart = Date.now();
    await db.query("SELECT 1");
    health.checks.database = { status: "up", latencyMs: Date.now() - dbStart };
  } catch (err) {
    health.status = "unhealthy";
    health.checks.database = { status: "down", error: err.message };
  }

  health.responseTimeMs = Date.now() - startTime;
  res.status(health.status === "healthy" ? 200 : 503).json(health);
});

// 📦 Listings routes moved to backend/routes/listings.js

// 🟢 مسار إرسال التذكيرات المستحقة (محمي للمشرفين فقط)
app.get("/api/notifications/send-due", authMiddleware, requireRoles('super_admin', 'admin'), async (req, res) => {
  try {
    const result = await db.query(
      `
      SELECT *
      FROM notifications
      WHERE status = 'pending'
        AND scheduled_at <= NOW()
      ORDER BY scheduled_at ASC
      LIMIT 50
    `
    );

    const notifications = result.rows;

    for (const notif of notifications) {
      const payload = notif.payload || {};
      const listingTitle = payload.listing_title || "(بدون عنوان)";
      const planName = payload.plan_name_ar || "(بلا باقة)";
      const expiresAt = payload.expires_at || "";

      console.log("📣 إشعار (وهمي) إلى المستخدم:", notif.user_id);
      console.log(
        `رسالة: إعلانك "${listingTitle}" ضمن باقة "${planName}" سينتهي قريباً (تاريخ الانتهاء: ${expiresAt}).`
      );
      console.log("----");

      await db.query(
        `
        UPDATE notifications
        SET status = 'sent', sent_at = NOW()
        WHERE id = $1
      `,
        [notif.id]
      );
    }

    res.json({
      processed: notifications.length,
      message: "تمت معالجة الإشعارات المستحقة (وتم طباعتها في الـ Console).",
    });
  } catch (err) {
    console.error("Error sending notifications:", err);
    res
      .status(500)
      .json({ error: "Error sending notifications", message: err.message });
  }
});

// 🟢 تحديث صلاحية المستخدم (للمدير العام فقط)
app.post("/api/admin/make-admin", authMiddleware, requireRoles('super_admin'), async (req, res) => {
  try {
    const { email, role } = req.body;
    
    const validRoles = ['admin', 'finance_admin', 'support_admin', 'content_admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: "صلاحية غير صالحة" });
    }
    
    const result = await db.query(
      `UPDATE users SET role = $2 WHERE email = $1 RETURNING id, email, name, role`,
      [email, role]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "المستخدم غير موجود" });
    }
    
    res.json({
      ok: true,
      user: result.rows[0],
      message: "تم ترقية المستخدم لمسؤول بنجاح"
    });
  } catch (err) {
    console.error("Error making admin:", err);
    res.status(500).json({ error: "خطأ في تحديث الصلاحيات" });
  }
});

// 🟢 User AI Level Endpoint
app.get("/api/user/ai-level", async (req, res) => {
  const token = req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");
  
  if (!token) {
    return res.json({ level: 0, levelName: "غير مشترك", planName: "" });
  }

  try {
    const jwt = require("jsonwebtoken");
    const JWT_SECRET = process.env.SESSION_SECRET;
    const payload = jwt.verify(token, JWT_SECRET);
    
    const result = await db.query(
      `SELECT COALESCE(MAX(ai_level), 0) as ai_level, plan_name
       FROM (
         -- From user_plans
         SELECT p.ai_support_level as ai_level, p.name_ar as plan_name
         FROM user_plans up
         JOIN plans p ON up.plan_id = p.id
         WHERE up.user_id = $1 AND up.status = 'active' AND (up.expires_at IS NULL OR up.expires_at > NOW())
         UNION ALL
         -- From quota_buckets
         SELECT p.ai_support_level as ai_level, p.name_ar as plan_name
         FROM quota_buckets qb
         JOIN plans p ON qb.plan_id = p.id
         WHERE qb.user_id = $1 AND qb.active = true 
           AND (qb.expires_at IS NULL OR qb.expires_at > NOW())
           AND (qb.total_slots - qb.used_slots) > 0
       ) combined
       GROUP BY plan_name
       ORDER BY ai_level DESC
       LIMIT 1`,
      [payload.userId]
    );

    if (result.rows.length > 0) {
      const aiLevel = parseInt(result.rows[0].ai_level) || 0;
      const levelNames = {
        0: "غير مشترك",
        1: "أساسي",
        2: "متقدم",
        3: "متميز"
      };
      res.json({
        level: aiLevel,
        levelName: levelNames[aiLevel] || "غير مشترك",
        planName: result.rows[0].plan_name || ""
      });
    } else {
      res.json({ level: 0, levelName: "غير مشترك", planName: "" });
    }
  } catch (err) {
    console.error("Error getting AI level:", err);
    res.json({ level: 0, levelName: "غير مشترك", planName: "" });
  }
});

// 🟢 Auth & Account Routes
app.use("/api/auth", authRoutes);
app.use("/api/favorites", favoritesRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/plans", plansRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/membership", membershipRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/admin-messages", adminMessagesRoutes);
app.use("/api/finance", financeRoutes);
app.use("/api/marketing", marketingRoutes);
app.use("/api/permissions", permissionsRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/quota", quotaRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/elite-slots", eliteSlotsRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/listings", listingsRoutes);
app.use("/api/report-listing", reportsRoutes);
app.use("/api/account-complaints", complaintsRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/locations", locationsRoutes);
app.use("/api/geo", geoRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/promotions", promotionsRoutes);
app.use("/api/geolocation", geolocationRoutes);
app.use("/api/featured-cities", featuredCitiesRoutes);
app.use("/api/exchange-rates", exchangeRatesRoutes);
app.use("/api/ratings", ratingsRoutes);
app.use("/api/support-tickets", supportRoutes);
app.use("/api/refunds", financeRoutes);
app.use("/api/ambassador", ambassadorRoutes);
app.use("/api/stripe", stripeRoutes);
app.use("/api/listing-workflow", listingWorkflowRoutes);
app.use("/api/launch-trial", launchTrialRoutes);

// 🟢 معالج أخطاء عام (خصوصاً أخطاء Multer)
app.use((err, req, res, next) => {
  console.error("Error:", err.message || err);
  
  // معالجة أخطاء Multer
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ 
      error: true, 
      message: err.code === 'LIMIT_FILE_SIZE' 
        ? 'حجم الملف كبير جداً' 
        : 'خطأ في رفع الملف: ' + err.message 
    });
  }
  
  // معالجة أخطاء نوع الملف
  if (err.message === 'نوع الملف غير مدعوم') {
    return res.status(400).json({ 
      error: true, 
      message: 'نوع الملف غير مدعوم. الأنواع المسموحة: JPEG, PNG, WebP, GIF, MP4, WebM' 
    });
  }
  
  // أخطاء عامة
  res.status(500).json({ 
    error: true, 
    message: err.message || 'حدث خطأ في الخادم' 
  });
});

// 📦 fixActiveListings imported from backend/scheduler/tasks.js

// 🟢 تشغيل السيرفر على المنفذ 8080 (خليه ثابت كده في Replit)
const PORT = 8080;

// بدء السيرفر فوراً (لنجاح الـ health check)
const server = app.listen(PORT, async () => {
  console.log(`🚀 Aqar Al Jazeera backend running on port ${PORT}`);
  
  // تهيئة قاعدة البيانات بعد بدء الاستماع
  const dbReady = await runDatabaseInit();
  if (!dbReady) {
    console.error("⚠️ Database initialization had issues");
  }
  
  // 🔧 إصلاح الإعلانات عند بدء السيرفر
  await fixActiveListings();
  
  // ⏰ جدولة المهام التلقائية بعد بدء السيرفر
  startScheduledTasks();
  
  // 🔴 Redis & BullMQ initialization
  if (process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL) {
    console.log('🔴 Initializing Redis & BullMQ workers...');
    initializeWorkers();
  } else {
    console.log('⚠️ Redis not configured - using in-memory cache fallback');
  }
});

server.on("error", (err) => console.error("Server error:", err));

process.on('SIGTERM', async () => {
  console.log('🔌 Graceful shutdown initiated...');
  await closeAllQueues();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
