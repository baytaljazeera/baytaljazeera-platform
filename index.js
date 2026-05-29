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
const { asyncHandler } = require("./backend/middleware/asyncHandler");

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
// OAuth providers (Google/Apple) are handled by ./backend/routes/auth.js
// and ./backend/routes/oauth.js mounted later under /api/auth.

// 📧 Initialize Email Service (Gmail API) - Load early to show initialization messages
require("./backend/services/emailService");

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
const adminWhatsappRoutes = require("./backend/routes/admin-whatsapp");
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
const feedbackRoutes = require("./backend/routes/feedback");
const omniRoutes = require("./backend/routes/omni");
const { createSlideshowVideo, generateDynamicPromoText, generatePromotionalText } = require("./backend/routes/ai");

const app = express();

// Trust the first proxy hop (Render / Vercel edge) so rate-limiting,
// secure cookies, and req.ip see the real client address.
app.set('trust proxy', 1);

// 🔧 Hostname Fix Middleware - Fix "base" hostname from Next.js proxy
// This MUST run before session middleware to prevent ENOTFOUND errors
app.use((req, res, next) => {
  const originalHostname = req.hostname;
  
  // Fix invalid hostnames to prevent session middleware errors
  if (originalHostname === 'base' || !originalHostname || originalHostname.length < 3) {
    // Override hostname getter to return a valid hostname
    const validHostname = process.env.APP_HOSTNAME || '127.0.0.1';
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

// 🔒 CORS - MUST be before rate limiters so 429/5xx responses still have CORS headers (avoid "blocked by CORS" in browser)
app.use(cors(corsOptions));

// تطبيق Rate Limiting (بعد CORS حتى كل الاستجابات تحمل رؤوس CORS)
app.use(generalLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/ai", aiLimiter);

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

// 📲 Twilio WhatsApp Webhook - parse urlencoded payloads before global body parsers
app.use('/api/whatsapp/webhook', express.urlencoded({ extended: true }));

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// 🔒 Input Sanitization - حماية من XSS
app.use(sanitizeInput);

// 🔒 CSRF Protection - إعداد token للمتصفح
// Public webhooks should never require browser CSRF cookies/tokens.
app.use((req, res, next) => {
  if (req.path === '/api/whatsapp/webhook') {
    return next();
  }
  return setCsrfToken(req, res, next);
});
app.get('/api/csrf-token', getCsrfToken);

// 🔧 Site Status Note:
// The frontend handles site status display (normal, maintenance, coming_soon)
// via SiteStatusWrapper component that checks /api/settings/site-status
// No backend blocking needed - this allows the site to always load properly

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

    // Belt-and-braces schema ensure — Postgres ADD COLUMN IF NOT EXISTS is
    // idempotent and bypasses the knex_migrations tracking table, so any
    // migration that's recorded-but-not-applied (a state we've hit before
    // on Render) gets re-attempted here. Each statement is wrapped so a
    // single failure doesn't abort the rest.
    const schemaPatches = [
      // 20260525000000 priority field
      `ALTER TABLE IF EXISTS account_complaints ADD COLUMN IF NOT EXISTS priority varchar(16) NOT NULL DEFAULT 'medium'`,
      // 20260525120000 routing + SLA on complaints
      `ALTER TABLE IF EXISTS account_complaints ADD COLUMN IF NOT EXISTS auto_assigned_role varchar(32)`,
      `ALTER TABLE IF EXISTS account_complaints ADD COLUMN IF NOT EXISTS sla_hours integer`,
      `ALTER TABLE IF EXISTS account_complaints ADD COLUMN IF NOT EXISTS sla_due_at timestamptz`,
      `ALTER TABLE IF EXISTS account_complaints ADD COLUMN IF NOT EXISTS breach_notified_at timestamptz`,
      // 20260525140000 customer locale snapshot on complaints
      `ALTER TABLE IF EXISTS account_complaints ADD COLUMN IF NOT EXISTS plan_tier varchar(32)`,
      `ALTER TABLE IF EXISTS account_complaints ADD COLUMN IF NOT EXISTS customer_country varchar(2)`,
      `ALTER TABLE IF EXISTS account_complaints ADD COLUMN IF NOT EXISTS customer_timezone varchar(64)`,
      `ALTER TABLE IF EXISTS account_complaints ADD COLUMN IF NOT EXISTS customer_language varchar(16)`,
      // 20260525130000 users locale
      `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS country varchar(2)`,
      `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS timezone varchar(64)`,
      `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS preferred_language varchar(16)`,
      // 20260525150000 support_tickets parity
      `ALTER TABLE IF EXISTS support_tickets ADD COLUMN IF NOT EXISTS sla_due_at timestamptz`,
      `ALTER TABLE IF EXISTS support_tickets ADD COLUMN IF NOT EXISTS breach_notified_at timestamptz`,
      `ALTER TABLE IF EXISTS support_tickets ADD COLUMN IF NOT EXISTS plan_tier varchar(32)`,
      `ALTER TABLE IF EXISTS support_tickets ADD COLUMN IF NOT EXISTS customer_country varchar(2)`,
      `ALTER TABLE IF EXISTS support_tickets ADD COLUMN IF NOT EXISTS customer_timezone varchar(64)`,
      `ALTER TABLE IF EXISTS support_tickets ADD COLUMN IF NOT EXISTS customer_language varchar(16)`,
      // 20260526120000 complaint_events — audit timeline
      `CREATE TABLE IF NOT EXISTS complaint_events (
         id BIGSERIAL PRIMARY KEY,
         complaint_id BIGINT NOT NULL,
         event_type VARCHAR(32) NOT NULL,
         actor_user_id BIGINT NULL,
         actor_name_snapshot VARCHAR(200) NULL,
         actor_email_snapshot VARCHAR(200) NULL,
         actor_role_snapshot VARCHAR(64) NULL,
         from_role VARCHAR(64) NULL,
         to_role VARCHAR(64) NULL,
         from_status VARCHAR(32) NULL,
         to_status VARCHAR(32) NULL,
         note TEXT NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`,
      `CREATE INDEX IF NOT EXISTS idx_complaint_events_complaint_at ON complaint_events (complaint_id, created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_complaint_events_type ON complaint_events (event_type)`,
      // 20260526150000 visibility split — internal vs customer_visible
      `ALTER TABLE IF EXISTS complaint_events ADD COLUMN IF NOT EXISTS visibility VARCHAR(16) NOT NULL DEFAULT 'internal'`,
      // 20260526180000 explicit routing on internal directives
      `ALTER TABLE IF EXISTS complaint_events ADD COLUMN IF NOT EXISTS target_kind VARCHAR(16)`,
      `ALTER TABLE IF EXISTS complaint_events ADD COLUMN IF NOT EXISTS target_user_id BIGINT`,
      `ALTER TABLE IF EXISTS complaint_events ADD COLUMN IF NOT EXISTS target_role VARCHAR(64)`,
      `ALTER TABLE IF EXISTS complaint_events ADD COLUMN IF NOT EXISTS target_name_snapshot VARCHAR(200)`,
      `ALTER TABLE IF EXISTS complaint_events ADD COLUMN IF NOT EXISTS target_email_snapshot VARCHAR(200)`,
      `ALTER TABLE IF EXISTS complaint_events ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ`,
      `ALTER TABLE IF EXISTS complaint_events ADD COLUMN IF NOT EXISTS assignment_priority VARCHAR(16)`,
      `ALTER TABLE IF EXISTS complaint_events ADD COLUMN IF NOT EXISTS assignment_status VARCHAR(16)`,
      `ALTER TABLE IF EXISTS complaint_events ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ`,
      // 20260526210000 multi-recipient routing (JSONB)
      `ALTER TABLE IF EXISTS complaint_events ADD COLUMN IF NOT EXISTS recipients JSONB`,
      // 20260526230000 admin nav tables (Phase 1 — DB-driven sidebar)
      `CREATE TABLE IF NOT EXISTS admin_nav_sections (
         key VARCHAR(64) PRIMARY KEY,
         label VARCHAR(120) NOT NULL,
         icon_name VARCHAR(64) NOT NULL,
         color_class VARCHAR(64) NOT NULL DEFAULT 'text-slate-400',
         sort_order INTEGER NOT NULL DEFAULT 0,
         is_active BOOLEAN NOT NULL DEFAULT true,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`,
      `CREATE TABLE IF NOT EXISTS admin_nav_links (
         id BIGSERIAL PRIMARY KEY,
         section_key VARCHAR(64) NOT NULL REFERENCES admin_nav_sections(key) ON DELETE CASCADE,
         href VARCHAR(255) NOT NULL,
         label VARCHAR(120) NOT NULL,
         icon_name VARCHAR(64) NOT NULL,
         permission_key VARCHAR(64) NOT NULL DEFAULT 'dashboard',
         required_roles JSONB NULL,
         count_source VARCHAR(64) NULL,
         is_inbox BOOLEAN NOT NULL DEFAULT false,
         is_report BOOLEAN NOT NULL DEFAULT false,
         child_routes JSONB NULL,
         sort_order INTEGER NOT NULL DEFAULT 0,
         is_active BOOLEAN NOT NULL DEFAULT true,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`,
      `CREATE INDEX IF NOT EXISTS idx_admin_nav_links_section_sort ON admin_nav_links (section_key, sort_order)`,
      // 20260527030000 custom_roles capability flags (Phase 3.5)
      `ALTER TABLE IF EXISTS custom_roles ADD COLUMN IF NOT EXISTS can_receive_transfers BOOLEAN NOT NULL DEFAULT true`,
      `ALTER TABLE IF EXISTS custom_roles ADD COLUMN IF NOT EXISTS can_be_assigned BOOLEAN NOT NULL DEFAULT true`,
      `ALTER TABLE IF EXISTS custom_roles ADD COLUMN IF NOT EXISTS can_reply_to_customers BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE IF EXISTS custom_roles ADD COLUMN IF NOT EXISTS can_see_sensitive_finance BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE IF EXISTS custom_roles ADD COLUMN IF NOT EXISTS can_close_complaints BOOLEAN NOT NULL DEFAULT false`,
      // 20260527090000 HR depth (Phase 4 — contracts + evaluations)
      `CREATE TABLE IF NOT EXISTS employee_contracts (
         id BIGSERIAL PRIMARY KEY,
         user_id UUID NOT NULL,
         start_date DATE NOT NULL,
         end_date DATE NULL,
         status VARCHAR(32) NOT NULL DEFAULT 'active',
         contract_type VARCHAR(64) NULL,
         file_path VARCHAR(500) NULL,
         notes TEXT NULL,
         created_by UUID NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`,
      `CREATE INDEX IF NOT EXISTS idx_employee_contracts_user_status ON employee_contracts (user_id, status)`,
      `CREATE INDEX IF NOT EXISTS idx_employee_contracts_end ON employee_contracts (end_date)`,
      `CREATE TABLE IF NOT EXISTS employee_evaluations (
         id BIGSERIAL PRIMARY KEY,
         user_id UUID NOT NULL,
         evaluator_id UUID NULL,
         evaluator_name_snapshot VARCHAR(200) NULL,
         evaluator_role_snapshot VARCHAR(64) NULL,
         response_speed INTEGER NULL,
         interaction_quality INTEGER NULL,
         commitment INTEGER NULL,
         notes TEXT NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`,
      `CREATE INDEX IF NOT EXISTS idx_employee_evaluations_user ON employee_evaluations (user_id, created_at)`,
      // 20260527000000 admin_inboxes (Phase 2 — generic Inbox Engine)
      `CREATE TABLE IF NOT EXISTS admin_inboxes (
         key VARCHAR(64) PRIMARY KEY,
         title VARCHAR(120) NOT NULL,
         icon_name VARCHAR(64) NOT NULL DEFAULT 'Inbox',
         accent_color VARCHAR(32) NOT NULL DEFAULT 'text-slate-500',
         source_kind VARCHAR(32) NOT NULL DEFAULT 'complaints',
         source_filter JSONB NULL,
         required_roles JSONB NULL,
         count_source VARCHAR(64) NULL,
         is_active BOOLEAN NOT NULL DEFAULT true,
         sort_order INTEGER NOT NULL DEFAULT 0,
         description TEXT NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`,
      // ─────────────────────────────────────────────────────────────
      // Phase 6 — System Integrity Pass (Administrative OS)
      // Soft-delete + audit-reason columns on destructive surfaces, so
      // deletes leave a recoverable trail instead of erasing history.
      `ALTER TABLE IF EXISTS custom_roles        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
      `ALTER TABLE IF EXISTS custom_roles        ADD COLUMN IF NOT EXISTS deleted_by UUID`,
      `ALTER TABLE IF EXISTS custom_roles        ADD COLUMN IF NOT EXISTS deleted_reason TEXT`,
      `ALTER TABLE IF EXISTS employee_contracts  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
      `ALTER TABLE IF EXISTS employee_contracts  ADD COLUMN IF NOT EXISTS deleted_by UUID`,
      `ALTER TABLE IF EXISTS employee_contracts  ADD COLUMN IF NOT EXISTS deleted_reason TEXT`,
      `ALTER TABLE IF EXISTS account_complaints  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
      `ALTER TABLE IF EXISTS account_complaints  ADD COLUMN IF NOT EXISTS deleted_by UUID`,
      `ALTER TABLE IF EXISTS account_complaints  ADD COLUMN IF NOT EXISTS deleted_reason TEXT`,
      `ALTER TABLE IF EXISTS admin_inboxes       ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
      `ALTER TABLE IF EXISTS admin_nav_links     ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
      `ALTER TABLE IF EXISTS admin_nav_sections  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
      // admin_audit_logs gets structured reason + before/after snapshots so
      // destructive operations are queryable, not buried in details JSONB.
      `ALTER TABLE IF EXISTS admin_audit_logs    ADD COLUMN IF NOT EXISTS reason TEXT`,
      `ALTER TABLE IF EXISTS admin_audit_logs    ADD COLUMN IF NOT EXISTS before_snapshot JSONB`,
      `ALTER TABLE IF EXISTS admin_audit_logs    ADD COLUMN IF NOT EXISTS after_snapshot JSONB`,
      // Critical missing indexes — hot paths identified by audit.
      `CREATE INDEX IF NOT EXISTS idx_role_permissions_role_key ON role_permissions (role, permission_key)`,
      `CREATE INDEX IF NOT EXISTS idx_account_complaints_user ON account_complaints (user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_account_complaints_status ON account_complaints (status)`,
      `CREATE INDEX IF NOT EXISTS idx_account_complaints_role ON account_complaints (auto_assigned_role)`,
      `CREATE INDEX IF NOT EXISTS idx_account_complaints_sla_due ON account_complaints (sla_due_at) WHERE sla_due_at IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_account_complaints_alive ON account_complaints (status, created_at DESC) WHERE deleted_at IS NULL`,
      `CREATE INDEX IF NOT EXISTS idx_complaint_events_target_user ON complaint_events (target_user_id) WHERE target_user_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_complaint_events_target_role ON complaint_events (target_role) WHERE target_role IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_complaint_events_visibility ON complaint_events (visibility)`,
      `CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin ON admin_audit_logs (admin_id)`,
      `CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON admin_audit_logs (action)`,
      `CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created ON admin_audit_logs (created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_unread_user ON notifications (user_id, created_at DESC) WHERE read_at IS NULL`,
      // Notifications event-typing — lets the notification center group by
      // category and link back to source records (complaint, directive, etc).
      `ALTER TABLE IF EXISTS notifications ADD COLUMN IF NOT EXISTS category VARCHAR(32)`,
      `ALTER TABLE IF EXISTS notifications ADD COLUMN IF NOT EXISTS priority VARCHAR(16) NOT NULL DEFAULT 'medium'`,
      `ALTER TABLE IF EXISTS notifications ADD COLUMN IF NOT EXISTS source_type VARCHAR(32)`,
      `ALTER TABLE IF EXISTS notifications ADD COLUMN IF NOT EXISTS source_id BIGINT`,
      `ALTER TABLE IF EXISTS notifications ADD COLUMN IF NOT EXISTS actor_user_id UUID`,
      `ALTER TABLE IF EXISTS notifications ADD COLUMN IF NOT EXISTS actor_name_snapshot VARCHAR(200)`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_category ON notifications (category) WHERE category IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_notifications_source ON notifications (source_type, source_id) WHERE source_type IS NOT NULL`,
      // HR depth — warnings ledger, vacation/leave workflow, attachment categories.
      `CREATE TABLE IF NOT EXISTS hr_warnings (
         id BIGSERIAL PRIMARY KEY,
         user_id UUID NOT NULL,
         warning_type VARCHAR(32) NOT NULL DEFAULT 'verbal',
         severity VARCHAR(16) NOT NULL DEFAULT 'low',
         note TEXT NOT NULL,
         issued_by UUID NULL,
         issued_by_name_snapshot VARCHAR(200) NULL,
         acknowledged_at TIMESTAMPTZ NULL,
         deleted_at TIMESTAMPTZ NULL,
         deleted_by UUID NULL,
         deleted_reason TEXT NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`,
      `CREATE INDEX IF NOT EXISTS idx_hr_warnings_user ON hr_warnings (user_id, created_at DESC) WHERE deleted_at IS NULL`,
      `CREATE TABLE IF NOT EXISTS hr_vacation_requests (
         id BIGSERIAL PRIMARY KEY,
         user_id UUID NOT NULL,
         start_date DATE NOT NULL,
         end_date DATE NOT NULL,
         day_count INTEGER NULL,
         request_type VARCHAR(32) NOT NULL DEFAULT 'annual',
         status VARCHAR(16) NOT NULL DEFAULT 'pending',
         reason TEXT NULL,
         decided_by UUID NULL,
         decided_by_name_snapshot VARCHAR(200) NULL,
         decided_at TIMESTAMPTZ NULL,
         decision_note TEXT NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`,
      `CREATE INDEX IF NOT EXISTS idx_hr_vacation_user_status ON hr_vacation_requests (user_id, status)`,
      `CREATE INDEX IF NOT EXISTS idx_hr_vacation_pending ON hr_vacation_requests (status, created_at DESC) WHERE status = 'pending'`,
      `CREATE TABLE IF NOT EXISTS hr_attachments (
         id BIGSERIAL PRIMARY KEY,
         user_id UUID NOT NULL,
         category VARCHAR(32) NOT NULL DEFAULT 'general',
         file_name VARCHAR(255) NOT NULL,
         file_path VARCHAR(500) NULL,
         mime_type VARCHAR(120) NULL,
         uploaded_by UUID NULL,
         uploaded_by_name_snapshot VARCHAR(200) NULL,
         deleted_at TIMESTAMPTZ NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`,
      `CREATE INDEX IF NOT EXISTS idx_hr_attachments_user_cat ON hr_attachments (user_id, category) WHERE deleted_at IS NULL`,
    ];
    let patched = 0;
    for (const sql of schemaPatches) {
      try { await db.query(sql); patched++; } catch (e) {
        console.warn('[schema-ensure] skipped:', sql.slice(0, 80), '-', e.message);
      }
    }
    console.log(`🩹 schema-ensure: ${patched}/${schemaPatches.length} statements OK`);

    // Phase 1 seed — populate admin_nav_sections + admin_nav_links from
    // the historical hardcoded shape, but ONLY if the tables are empty.
    // Idempotent: re-running this on every boot is a no-op once seeded.
    try {
      const { rows: secCount } = await db.query(`SELECT COUNT(*)::int AS n FROM admin_nav_sections`);
      if ((secCount[0]?.n || 0) === 0) {
        const sections = [
          { key: 'executive', label: 'نظرة تنفيذية',      icon: 'LayoutDashboard',   color: 'text-[#D4AF37]',  order: 10 },
          { key: 'properties', label: 'إدارة العقارات',    icon: 'Home',              color: 'text-blue-400',   order: 20 },
          { key: 'support',    label: 'خدمة العملاء',       icon: 'HeartHandshake',    color: 'text-emerald-400',order: 30 },
          { key: 'quality',    label: 'متابعة الجودة',        icon: 'Eye',               color: 'text-amber-400',  order: 35 },
          { key: 'feedback',   label: 'تجربة المستخدم',     icon: 'MessageCirclePlus', color: 'text-amber-400',  order: 40 },
          { key: 'finance',    label: 'المالية والاشتراكات', icon: 'Wallet',            color: 'text-green-400',  order: 50 },
          { key: 'marketing',  label: 'النمو والتسويق',      icon: 'Megaphone',         color: 'text-purple-400', order: 60 },
          { key: 'hr',         label: 'الموارد البشرية',      icon: 'Users',             color: 'text-pink-400',   order: 70 },
          { key: 'system',     label: 'النظام والحوكمة',      icon: 'Lock',              color: 'text-slate-400',  order: 80 },
        ];
        for (const s of sections) {
          await db.query(
            `INSERT INTO admin_nav_sections (key,label,icon_name,color_class,sort_order) VALUES ($1,$2,$3,$4,$5)`,
            [s.key, s.label, s.icon, s.color, s.order]
          );
        }

        // Links — mirrors the current TS array exactly.
        // count_source values match keys returned by /api/admin/pending-counts.
        // required_roles is set ONLY for hard role-gated rows (otherwise null
        // and permission_key controls visibility).
        const links = [
          // executive
          { sec: 'executive', href: '/admin/dashboard',          label: 'لوحة التحكم',         icon: 'LayoutDashboard', perm: 'dashboard',       order: 10 },
          { sec: 'executive', href: '/admin/executive-inbox',    label: 'صندوق الإدارة العليا', icon: 'Crown',           perm: 'dashboard',       roles: ['super_admin','admin','admin_manager'], count: 'executiveInboxNew', isInbox: true, order: 20 },
          // properties
          { sec: 'properties', href: '/admin/listings',          label: 'الإعلانات',           icon: 'FileText',        perm: 'listings',        count: 'listingsNew',  children: ['/admin/elite-slots','/admin/finance/listings'], order: 10 },
          { sec: 'properties', href: '/admin/reports',           label: 'بلاغات الإعلانات',    icon: 'Flag',            perm: 'reports',         count: 'reportsNew',  isReport: true, order: 20 },
          { sec: 'properties', href: '/admin/featured-cities',   label: 'المدن الأكثر طلبًا',   icon: 'MapPin',          perm: 'settings',        order: 30 },
          // support
          { sec: 'support', href: '/admin/customer-service',     label: 'الشكاوى والدعم',      icon: 'Headset',         perm: 'support',         count: 'complaintsPlusSupport', children: ['/admin/complaints','/admin/support'], order: 10 },
          // Omni Inbox + Customer Conversations live under Quality, not Support.
          { sec: 'quality', href: '/admin/inbox/quality_monitor', label: 'صندوق متابعة الجودة', icon: 'Inbox',           perm: 'support',         roles: ['super_admin','admin','admin_manager','quality_monitor'], count: 'qualityInboxNew', isInbox: true, order: 10 },
          { sec: 'quality', href: '/admin/omni-inbox',            label: 'البريد الموحد',        icon: 'Inbox',           perm: 'support_internal',count: 'messagesNew', children: ['/admin/messages'], order: 20 },
          { sec: 'quality', href: '/admin/customer-conversations',label:'مراقبة المحادثات',      icon: 'Eye',             perm: 'support',         order: 30 },
          // feedback
          { sec: 'feedback', href: '/admin/feedback/overview',    label: 'نظرة عامة',           icon: 'LayoutDashboard', perm: 'support',         order: 10 },
          { sec: 'feedback', href: '/admin/feedback/responses',   label: 'الردود',              icon: 'MessageSquare',   perm: 'support',         count: 'feedbackNew', order: 20 },
          { sec: 'feedback', href: '/admin/feedback/settings',    label: 'إعدادات التغذية الراجعة', icon: 'Settings',    perm: 'support',         order: 30 },
          { sec: 'feedback', href: '/admin/feedback/questions',   label: 'إدارة الأسئلة',       icon: 'FileText',        perm: 'support',         order: 40 },
          // finance
          { sec: 'finance', href: '/admin/finance-inbox',        label: 'صندوق الوصول المالي', icon: 'Inbox',           perm: 'finance',         roles: ['super_admin','admin','finance_admin'], count: 'financeInboxNew', isInbox: true, order: 10 },
          { sec: 'finance', href: '/admin/finance',              label: 'المالية والمدفوعات',  icon: 'Wallet',          perm: 'finance',         count: 'refundsPlusWithdrawals', order: 20 },
          { sec: 'finance', href: '/admin/plans',                label: 'إدارة الباقات',       icon: 'CreditCard',      perm: 'plans',           children: ['/admin/plans/country-pricing'], order: 30 },
          // marketing
          { sec: 'marketing', href: '/admin/marketing',          label: 'التسويق والدعاية',    icon: 'Megaphone',       perm: 'marketing',       order: 10 },
          { sec: 'marketing', href: '/admin/whatsapp',           label: 'واتساب',             icon: 'MessageCircle',   perm: 'marketing',       count: 'whatsappUnread', order: 20 },
          { sec: 'marketing', href: '/admin/news',               label: 'شريط الأخبار',        icon: 'Newspaper',       perm: 'news',            order: 30 },
          { sec: 'marketing', href: '/admin/ambassador',         label: 'سفراء البيت',         icon: 'Building2',       perm: 'ambassador',      count: 'ambassadorPlusWithdrawals', order: 40 },
          // hr
          { sec: 'hr', href: '/admin/hr',                        label: 'نظرة عامة',           icon: 'Users',           perm: 'membership',      order: 10 },
          { sec: 'hr', href: '/admin/hr/employees',                label: 'طلبات التوظيف',       icon: 'UserPlus2',       perm: 'membership',      count: 'membershipNew', order: 20 },
          // system
          { sec: 'system', href: '/admin/ai-center',             label: 'مركز الذكاء الاصطناعي', icon: 'BrainCircuit',  perm: 'ai_center',       order: 10 },
          { sec: 'system', href: '/admin/users',                 label: 'إدارة العملاء',       icon: 'Users',           perm: 'users',           order: 20 },
          { sec: 'system', href: '/admin/roles',                 label: 'إدارة الصلاحيات',     icon: 'Shield',          perm: 'roles',           count: 'membershipNew', order: 30 },
          { sec: 'system', href: '/admin/audit',                 label: 'سجل التدقيق الإداري',  icon: 'History',         perm: 'roles',           roles: ['super_admin','admin'], order: 35 },
          { sec: 'system', href: '/admin/settings',              label: 'الإعدادات',           icon: 'Settings',        perm: 'settings',        order: 40 },
          { sec: 'system', href: '/admin/reset-data',            label: 'تصفير التجارب',       icon: 'RotateCcw',       perm: 'settings',        order: 50 },
        ];
        for (const l of links) {
          await db.query(
            `INSERT INTO admin_nav_links
               (section_key, href, label, icon_name, permission_key, required_roles, count_source,
                is_inbox, is_report, child_routes, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb,$11)`,
            [
              l.sec, l.href, l.label, l.icon, l.perm,
              l.roles ? JSON.stringify(l.roles) : null,
              l.count || null,
              !!l.isInbox,
              !!l.isReport,
              l.children ? JSON.stringify(l.children) : null,
              l.order,
            ]
          );
        }
        console.log(`🌱 admin_nav: seeded ${sections.length} sections, ${links.length} links`);
      }
    } catch (seedErr) {
      console.warn('[admin_nav seed] skipped:', seedErr.message);
    }

    // Phase 6 — ensure new links exist on already-seeded tenants. Idempotent:
    // skipped per row if href already present. We don't touch existing
    // labels/icons so admin overrides are preserved.
    try {
      const ensureLinks = [
        { sec: 'executive', href: '/admin/executive-overview', label: 'اللوحة التنفيذية', icon: 'Activity', perm: 'executive_inbox', roles: ['super_admin','admin','admin_manager'], order: 30 },
        { sec: 'executive', href: '/admin/notifications',      label: 'مركز الإشعارات',   icon: 'Bell',     perm: 'dashboard',         order: 40 },
      ];
      for (const l of ensureLinks) {
        const exists = await db.query(`SELECT 1 FROM admin_nav_links WHERE href = $1 LIMIT 1`, [l.href]);
        if (exists.rows.length > 0) continue;
        await db.query(
          `INSERT INTO admin_nav_links
             (section_key, href, label, icon_name, permission_key, required_roles, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
          [l.sec, l.href, l.label, l.icon, l.perm, l.roles ? JSON.stringify(l.roles) : null, l.order]
        );
      }
    } catch (ensureErr) {
      console.warn('[admin_nav ensure] skipped:', ensureErr.message);
    }

    // Phase 6.G — Quality Monitoring section.
    // 1. Ensure the section exists (between feedback and finance ideally).
    // 2. Move Omni Inbox + Customer Conversations into this section. They
    //    were previously under 'support' but conceptually they're QA
    //    surfaces (escalation review + fraud surveillance).
    // 3. Provision the QA team inbox (/admin/inbox/quality_monitor) +
    //    sidebar link + admin_inboxes config row.
    // Every step is idempotent — exists-check first, no destructive ops.
    try {
      // 1. Section
      await db.query(
        `INSERT INTO admin_nav_sections (key, label, icon_name, color_class, sort_order)
         VALUES ('quality', 'متابعة الجودة', 'Eye', 'text-amber-400', 35)
         ON CONFLICT (key) DO NOTHING`
      );
      // 2. Move existing links — only if they're still in their original
      //    section (don't override a manual move the owner already made).
      await db.query(
        `UPDATE admin_nav_links
            SET section_key = 'quality', updated_at = NOW()
          WHERE href IN ('/admin/omni-inbox', '/admin/customer-conversations')
            AND section_key = 'support'`
      );
      // 3a. QA team inbox config row
      await db.query(
        `INSERT INTO admin_inboxes
           (key, title, icon_name, accent_color, source_kind, source_filter, required_roles, sort_order, description)
         VALUES ('quality_monitor', 'صندوق متابعة الجودة', 'Eye', 'text-amber-500',
                 'complaints',
                 $1::jsonb,
                 $2::jsonb,
                 5,
                 'الشكاوى المحوّلة لفريق متابعة الجودة للمراجعة والإشراف.')
         ON CONFLICT (key) DO NOTHING`,
        [
          JSON.stringify({ auto_assigned_role: 'quality_monitor' }),
          JSON.stringify(['super_admin', 'admin', 'admin_manager', 'quality_monitor']),
        ]
      );
      // 3b. Sidebar link for the QA inbox
      const qaLinkExists = await db.query(
        `SELECT 1 FROM admin_nav_links WHERE href = '/admin/inbox/quality_monitor' LIMIT 1`
      );
      if (qaLinkExists.rows.length === 0) {
        await db.query(
          `INSERT INTO admin_nav_links
             (section_key, href, label, icon_name, permission_key, required_roles, is_inbox, sort_order)
           VALUES ('quality', '/admin/inbox/quality_monitor', 'صندوق متابعة الجودة', 'Inbox', 'support', $1::jsonb, true, 10)`,
          [JSON.stringify(['super_admin', 'admin', 'admin_manager', 'quality_monitor'])]
        );
      }
      console.log('🌱 quality monitoring section ensured');
    } catch (qaErr) {
      console.warn('[quality section ensure] skipped:', qaErr.message);
    }

    // Phase 6.H — surface pending join-requests as a sidebar counter on
    // /admin/roles so the owner sees membership pressure from any screen.
    // Idempotent — only sets count_source if it's currently NULL (don't
    // override a manual config).
    try {
      await db.query(
        `UPDATE admin_nav_links
            SET count_source = 'membershipNew', updated_at = NOW()
          WHERE href = '/admin/roles' AND count_source IS NULL`
      );
    } catch (rolesCountErr) {
      console.warn('[roles count_source ensure] skipped:', rolesCountErr.message);
    }

    // Phase 6.E seed — ensure 'admin' has explicit grant rows for every
    // permission. Previously, both super_admin and admin were treated as
    // implicit "all-granted" in /my-permissions; the owner asked that
    // admin become toggleable like every other role. To migrate without
    // suddenly stripping admin's access on existing tenants, we seed
    // every permission key as granted IF admin has zero rows in
    // role_permissions. Once any row exists (post-seed), explicit DB
    // state wins and the seed is a no-op.
    try {
      const { rows } = await db.query(
        `SELECT COUNT(*)::int AS n FROM role_permissions WHERE role = 'admin'`
      );
      if ((rows[0]?.n || 0) === 0) {
        const ADMIN_PERMS = [
          'dashboard', 'listings', 'reports', 'complaints', 'support',
          'support_internal', 'news', 'finance', 'plans', 'membership',
          'marketing', 'ambassador', 'ai_center', 'users', 'roles', 'settings',
        ];
        for (const key of ADMIN_PERMS) {
          await db.query(
            `INSERT INTO role_permissions (role, permission_key, is_granted, updated_at)
             VALUES ('admin', $1, true, CURRENT_TIMESTAMP)
             ON CONFLICT (role, permission_key) DO NOTHING`,
            [key]
          );
        }
        console.log(`🌱 role_permissions: seeded 'admin' with ${ADMIN_PERMS.length} granted permissions`);
      }
    } catch (adminPermsErr) {
      console.warn('[admin role_permissions seed] skipped:', adminPermsErr.message);
    }

    // Phase 2 seed — demonstration inboxes powered by the generic engine.
    // Idempotent: only seeds when admin_inboxes is empty. Adds two new
    // department inboxes (Content + HR) routed through the dynamic
    // /admin/inbox/[key] page. Finance/Executive stay on their bespoke
    // pages because they have richer features (audit timeline, directive
    // modals); they can be migrated later.
    try {
      const { rows: ibxCount } = await db.query(`SELECT COUNT(*)::int AS n FROM admin_inboxes`);
      if ((ibxCount[0]?.n || 0) === 0) {
        const inboxes = [
          {
            key: 'content',
            title: 'صندوق فريق المحتوى',
            icon: 'FileText',
            accent: 'text-blue-500',
            sourceFilter: { auto_assigned_role: 'content_admin' },
            roles: ['super_admin', 'admin', 'content_admin'],
            order: 10,
            desc: 'الشكاوى الموجّهة لفريق المحتوى — مشاكل الإعلانات والعرض والخريطة.',
          },
          {
            key: 'hr',
            title: 'صندوق الموارد البشرية',
            icon: 'Users',
            accent: 'text-pink-500',
            sourceFilter: { auto_assigned_role: 'hr_admin' },
            roles: ['super_admin', 'admin', 'hr_admin', 'admin_manager'],
            order: 20,
            desc: 'الحالات المُوجّهة للموارد البشرية — قضايا الموظفين والتوظيف.',
          },
        ];
        for (const ib of inboxes) {
          await db.query(
            `INSERT INTO admin_inboxes (key,title,icon_name,accent_color,source_kind,source_filter,required_roles,sort_order,description)
             VALUES ($1,$2,$3,$4,'complaints',$5::jsonb,$6::jsonb,$7,$8)`,
            [ib.key, ib.title, ib.icon, ib.accent, JSON.stringify(ib.sourceFilter), JSON.stringify(ib.roles), ib.order, ib.desc]
          );
          // Add a sidebar link for each — under the most relevant section.
          const sectionKey = ib.key === 'content' ? 'support' : ib.key === 'hr' ? 'hr' : 'system';
          await db.query(
            `INSERT INTO admin_nav_links
               (section_key, href, label, icon_name, permission_key, required_roles, count_source, is_inbox, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,true,$8)
             ON CONFLICT DO NOTHING`,
            [sectionKey, `/admin/inbox/${ib.key}`, ib.title, ib.icon, 'support', JSON.stringify(ib.roles), null, 99]
          );
        }
        console.log(`🌱 admin_inboxes: seeded ${inboxes.length} demo inboxes`);
      }
    } catch (ibxSeedErr) {
      console.warn('[admin_inboxes seed] skipped:', ibxSeedErr.message);
    }
    
    // Check if countries and cities tables exist before seeding
    let tablesExist = false;
    try {
      const tableCheck = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'countries'
        ) as countries_exists,
        EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'cities'
        ) as cities_exists
      `);
      tablesExist = tableCheck.rows[0]?.countries_exists && tableCheck.rows[0]?.cities_exists;
    } catch (checkErr) {
      console.log("⚠️ Could not verify tables existence:", checkErr.message);
    }
    
    // Verify required columns exist before seeding
    if (tablesExist) {
      try {
        const colCheck = await db.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'cities' 
          AND column_name IN ('is_popular', 'region_ar', 'region_en', 'is_active', 'display_order', 'latitude', 'longitude')
        `);
        const requiredCols = ['is_popular', 'region_ar', 'region_en', 'is_active', 'display_order', 'latitude', 'longitude'];
        const existingCols = colCheck.rows.map(r => r.column_name);
        const missingCols = requiredCols.filter(col => !existingCols.includes(col));
        
        if (missingCols.length > 0) {
          console.log(`⚠️ Cities seeding skipped: Missing columns: ${missingCols.join(', ')}`);
          console.log(`   Existing columns: ${existingCols.join(', ')}`);
        } else {
          // Seed missing cities for Turkey, Egypt, Lebanon
          try {
            const { seedMissingCities } = require("./backend/scripts/seed-missing-cities");
            await seedMissingCities();
          } catch (seedErr) {
            console.log("⚠️ Cities seeding skipped:", seedErr.message);
          }
          
          // Seed GCC cities (SA, AE, KW, QA, BH, OM)
          try {
            const { seedGCCCities } = require("./backend/scripts/seed-gcc-cities");
            await seedGCCCities();
          } catch (seedErr) {
            console.log("⚠️ GCC cities seeding skipped:", seedErr.message);
          }
        }
      } catch (checkErr) {
        console.log("⚠️ Could not verify cities columns:", checkErr.message);
      }
    } else {
      console.log("⚠️ Cities seeding skipped: countries or cities tables do not exist");
    }
    
    // Remove duplicate cities (one-time cleanup)
    try {
      const dupResult = await db.query(`
        DELETE FROM cities 
        WHERE id NOT IN (
          SELECT MIN(id) FROM cities GROUP BY name_ar, country_id
        );
      `);
      if (dupResult.rowCount > 0) {
        console.log(`🧹 Removed ${dupResult.rowCount} duplicate cities`);
      }
    } catch (dupErr) {
      console.log("⚠️ Duplicate cleanup skipped:", dupErr.message);
    }
    
    // إنشاء جدول flagged_conversations
    await db.query(`
      CREATE TABLE IF NOT EXISTS flagged_conversations (
        id SERIAL PRIMARY KEY,
        user1_id UUID REFERENCES users(id) ON DELETE CASCADE,
        user2_id UUID REFERENCES users(id) ON DELETE CASCADE,
        listing_id UUID REFERENCES properties(id) ON DELETE SET NULL,
        flag_type VARCHAR(50) NOT NULL DEFAULT 'suspicious',
        intent_category VARCHAR(100),
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
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'flagged_conversations' AND column_name = 'intent_category'
        ) THEN
          ALTER TABLE flagged_conversations ADD COLUMN intent_category VARCHAR(100);
        END IF;
      END $$;
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

// OAuth login fallback. Direct OAuth (Google/Apple) is handled by the
// dedicated /api/auth/* routes from authRoutes / oauthRoutes — this stub
// just answers /api/login with a clear "use email + password or the
// provider buttons" message for any old client that still calls it.
app.get('/api/login', (req, res) => {
  res.status(503).json({
    error: 'تسجيل الدخول عبر هذا المسار غير متاح. يرجى استخدام البريد الإلكتروني وكلمة المرور أو أزرار جوجل/آبل.',
    errorEn: 'OAuth login via this endpoint is not available. Use email/password or the Google/Apple buttons.',
    available: false,
  });
});

app.get('/api/logout', (req, res) => {
  // Simple logout - clear any cookies and redirect
  res.clearCookie('token');
  res.clearCookie('connect.sid');
  res.json({ 
    message: 'تم تسجيل الخروج بنجاح',
    messageEn: 'Logged out successfully'
  });
});

// 🔐 Check OAuth availability (now handled by oauth.js routes)

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

// Cloudinary status check
app.get('/api/cloudinary-status', (req, res) => {
  const { isCloudinaryConfigured } = require('./backend/services/cloudinaryService');
  res.json({
    configured: isCloudinaryConfigured(),
    hasCloudinaryUrl: !!process.env.CLOUDINARY_URL,
    hasIndividualVars: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
  });
});

// Test email endpoint - for debugging email issues
app.post('/api/test-email', asyncHandler(async (req, res) => {
  const { sendEmail } = require('./backend/services/emailService');
  const { to = 'info@baytaljazeera.com', subject = 'Test Email', body = 'This is a test email from Bayt Al Jazeera' } = req.body;
  
  console.log('📧 [Test Email] Attempting to send test email to:', to);
  
  const htmlBody = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
    </head>
    <body style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>اختبار إرسال البريد الإلكتروني</h2>
      <p>${body}</p>
      <p>تم إرسال هذا البريد في: ${new Date().toLocaleString('ar-SA')}</p>
    </body>
    </html>
  `;
  
  const result = await sendEmail(to, subject || 'اختبار إرسال البريد - بيت الجزيرة', htmlBody);
  
  if (result.success) {
    console.log('✅ [Test Email] Email sent successfully, messageId:', result.messageId);
    res.json({ 
      success: true, 
      message: 'تم إرسال الإيميل بنجاح',
      messageId: result.messageId 
    });
  } else {
    console.error('❌ [Test Email] Failed to send email:', result.error);
    res.status(500).json({ 
      success: false, 
      error: result.error || 'فشل إرسال الإيميل',
      message: 'فشل إرسال الإيميل. تحقق من refresh token في Render environment variables.'
    });
  }
}));

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
    if (!JWT_SECRET) {
      console.error('[AI-Level] SESSION_SECRET is not set');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
      console.error('[AI-Level] JWT verification failed:', jwtErr.message);
      // Return level 0 instead of error for invalid tokens
      return res.json({ level: 0, levelName: "غير مشترك", planName: "" });
    }
    
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

// 🧪 Test Email Endpoint (for debugging - remove in production)
app.post("/api/test-email", asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }
  
  const { sendEmailVerificationEmail } = require('./backend/services/emailService');
  const result = await sendEmailVerificationEmail(email, 'test-token-123', 'Test User');
  
  res.json({
    success: result.success,
    message: result.success ? 'Test email sent successfully' : 'Failed to send test email',
    error: result.error,
    messageId: result.messageId
  });
}));

// 🟢 OAuth Routes (Google, Apple)
const oauthRoutes = require("./backend/routes/oauth");
app.use("/api/auth", oauthRoutes);
app.use("/api/favorites", favoritesRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/plans", plansRoutes);
/* Must be before /api/admin — same router as /api/finance (DELETE /reset-invoices, etc.) */
app.use("/api/admin/finance", financeRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/membership", membershipRoutes);
app.use("/api/hr", require("./backend/routes/hr"));
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
app.use("/api/admin/whatsapp", adminWhatsappRoutes);
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
app.use("/api/feedback", feedbackRoutes);
app.use("/api/admin/omni", omniRoutes);

// 🟢 معالج أخطاء عام (خصوصاً أخطاء Multer)
app.use((err, req, res, next) => {
  console.error("❌ [ERROR HANDLER]", err.message || err);
  if (err.stack) {
    console.error("Stack trace:", err.stack);
  }
  
  // معالجة أخطاء Multer
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ 
      error: err.code === 'LIMIT_FILE_SIZE' 
        ? 'حجم الملف كبير جداً' 
        : 'خطأ في رفع الملف: ' + err.message,
      errorEn: err.code === 'LIMIT_FILE_SIZE'
        ? 'File size too large'
        : 'File upload error: ' + err.message
    });
  }
  
  // معالجة أخطاء نوع الملف
  if (err.message === 'نوع الملف غير مدعوم') {
    return res.status(400).json({ 
      error: 'نوع الملف غير مدعوم. الأنواع المسموحة: JPEG, PNG, WebP, GIF, MP4, WebM',
      errorEn: 'File type not supported. Allowed types: JPEG, PNG, WebP, GIF, MP4, WebM'
    });
  }
  
  // أخطاء قاعدة البيانات
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.message?.includes('database')) {
    console.error("❌ Database connection error:", err.message);
    return res.status(500).json({ 
      error: 'خطأ في الاتصال بقاعدة البيانات',
      errorEn: 'Database connection error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
  
  // أخطاء Foreign Key Constraint (23503)
  if (err.code === '23503') {
    // Foreign key violation - usually means referenced record doesn't exist
    const tableName = err.table || 'unknown';
    const constraintName = err.constraint || 'unknown';
    console.warn(`[Foreign Key] Constraint violation: ${constraintName} on table ${tableName}`);
    
    // For user_badge_state, return default counts instead of error
    if (constraintName.includes('user_badge_state') || tableName === 'user_badge_state') {
      return res.status(200).json({ listings: 0, invoices: 0, complaints: 0, messages: 0, refunds: 0 });
    }
    
    return res.status(400).json({ 
      error: 'مرجع غير صالح',
      errorEn: 'Invalid reference',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
  
  // أخطاء PostgreSQL Pool
  if (err.message?.includes('Cannot use a pool after calling end') || 
      err.message?.includes('pool') || 
      err.message?.includes('connection')) {
    console.error("❌ Database pool error:", err.message);
    return res.status(500).json({ 
      error: 'خطأ في اتصال قاعدة البيانات، يرجى المحاولة مرة أخرى',
      errorEn: 'Database connection error, please try again',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
  
  // أخطاء JWT
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ 
      error: 'رمز الدخول غير صالح أو منتهي الصلاحية',
      errorEn: 'Invalid or expired token'
    });
  }
  
  // أخطاء عامة
  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({ 
    error: err.message || 'حدث خطأ في الخادم',
    errorEn: err.errorEn || 'Server error occurred',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// 📦 fixActiveListings imported from backend/scheduler/tasks.js

// 🟢 تشغيل السيرفر — يستخدم PORT env أو 8080 احتياطياً
const PORT = process.env.PORT || 8080;

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
