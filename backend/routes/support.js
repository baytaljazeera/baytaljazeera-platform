const express = require("express");
const db = require("../db");
const { authMiddleware, adminMiddleware, requireRoles } = require("../middleware/auth");

// ────────────────────────────────────────────────────────────────
// Owner rule: accountant (role='finance_admin') NEVER accesses any
// support ticket — not the list, not the detail, not the reply
// thread. Finance only sees the Refund Request object on the
// finance side, written as a summary by support. This middleware
// fires a hard 403 with an explicit message so the boundary is
// visible in network logs.
// ────────────────────────────────────────────────────────────────
function denyFinanceFromSupport(req, res, next) {
  if (req.user && req.user.role === 'finance_admin') {
    return res.status(403).json({
      error: "المالية لا تصل لتذاكر الدعم. افتح طلبات الاسترداد من صندوق المالية.",
      errorEn: "Finance role is not permitted to access support tickets. Use refund-requests instead.",
      errorCode: "FINANCE_DENIED_SUPPORT_ACCESS",
    });
  }
  return next();
}
const { asyncHandler } = require('../middleware/asyncHandler');
const {
  getSupportTicketScope,
  hasFullCustomerServiceAccess,
} = require("../utils/customerServiceScope");

const router = express.Router();

function generateTicketNumber() {
  const date = new Date();
  const year = date.getFullYear();
  const random = Math.floor(100000 + Math.random() * 900000);
  return `TKT-${year}-${random}`;
}

const DEPARTMENT_CONFIG = {
  financial: {
    name_ar: 'مالية',
    role: 'finance_admin',
    sla_hours: 24,
    subcategories: {
      refund: 'استرداد مبلغ',
      invoice: 'فاتورة أو إيصال',
      payment_failed: 'دفع فاشل',
      subscription: 'اشتراك أو تجديد',
      pricing: 'استفسار عن الأسعار'
    }
  },
  account: {
    name_ar: 'حسابي/إداري',
    role: 'support_admin',
    sla_hours: 48,
    subcategories: {
      profile_update: 'تعديل بيانات الحساب',
      delete_account: 'حذف الحساب',
      permissions: 'صلاحيات أو وصول',
      verification: 'توثيق الحساب',
      listing_issue: 'مشكلة في إعلان'
    }
  },
  technical: {
    name_ar: 'تقنية',
    role: 'support_admin',
    sla_hours: 12,
    subcategories: {
      app_error: 'خطأ في التطبيق',
      display_issue: 'مشكلة في العرض',
      slow_performance: 'بطء في الأداء',
      upload_issue: 'مشكلة رفع ملفات',
      map_issue: 'مشكلة في الخريطة'
    }
  }
};

function getSmartRouting(department, priority, plan_tier) {
  const config = DEPARTMENT_CONFIG[department] || DEPARTMENT_CONFIG.technical;
  let slaHours = config.sla_hours;

  if (priority === 'high') slaHours = Math.floor(slaHours / 2);
  if (priority === 'urgent') slaHours = Math.floor(slaHours / 4);

  // Premium-tier boost — mirrors the complaint router so both surfaces honor
  // the customer's paid SLA: royal = 0.5x, featured = 0.75x. Loose match on
  // English code or Arabic name so either passes.
  const t = String(plan_tier || "").toLowerCase();
  const isRoyal    = /royal|ملكي|elite|enterprise|عمل/.test(t);
  const isFeatured = /featured|مميز|premium|تميز|صفوة/.test(t);
  if (isRoyal) slaHours = Math.ceil(slaHours * 0.5);
  else if (isFeatured) slaHours = Math.ceil(slaHours * 0.75);

  return {
    role: config.role,
    sla_hours: Math.max(slaHours, 2),
  };
}

router.get("/count", authMiddleware, denyFinanceFromSupport, asyncHandler(async (req, res) => {
  if (req.user.role === "user") {
    return res.json({ count: 0 });
  }

  const { clause, params } = getSupportTicketScope(req.user.role, req.user.id, 1);
  const where = clause
    ? `FROM support_tickets st WHERE status IN ('new', 'in_progress') AND ${clause}`
    : `FROM support_tickets WHERE status IN ('new', 'in_progress')`;

  const result = await db.query(`SELECT COUNT(*)::int as count ${where}`, params);
  res.json({ count: parseInt(result.rows[0].count, 10) || 0 });
}));

router.get("/", authMiddleware, denyFinanceFromSupport, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;

  if (role === "user") {
    const result = await db.query(
      `
      SELECT 
        st.*,
        (SELECT COUNT(*) FROM support_ticket_replies WHERE ticket_id = st.id) as reply_count
      FROM support_tickets st
      WHERE st.user_id = $1
      ORDER BY st.created_at DESC
    `,
      [userId]
    );
    return res.json({ tickets: result.rows });
  }

  const { clause, params } = getSupportTicketScope(role, userId, 1);
  const whereSql = clause ? `WHERE ${clause}` : "";

  const result = await db.query(
    `
      SELECT 
        st.*,
        u.name as user_name,
        u.email as user_email,
        u.phone as user_phone,
        a.name as assigned_name,
        (SELECT COUNT(*) FROM support_ticket_replies WHERE ticket_id = st.id) as reply_count
      FROM support_tickets st
      LEFT JOIN users u ON st.user_id = u.id
      LEFT JOIN users a ON st.assigned_to = a.id
      ${whereSql}
      ORDER BY 
        CASE st.status 
          WHEN 'new' THEN 1 
          WHEN 'in_progress' THEN 2 
          ELSE 3 
        END,
        st.created_at DESC
    `,
    params
  );
  res.json({ tickets: result.rows });
}));

router.get("/categories", asyncHandler(async (req, res) => {
  const departments = Object.entries(DEPARTMENT_CONFIG).map(([key, config]) => ({
    id: key,
    name_ar: config.name_ar,
    subcategories: Object.entries(config.subcategories).map(([subKey, subName]) => ({
      id: subKey,
      name_ar: subName
    }))
  }));
  
  res.json({ departments });
}));

router.get("/stats", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { clause, params } = getSupportTicketScope(req.user.role, req.user.id, 1);
  const whereSql = clause ? `WHERE ${clause}` : "";

  const result = await db.query(
    `
    SELECT 
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE st.status = 'new')::int as new,
      COUNT(*) FILTER (WHERE st.status = 'in_progress')::int as in_progress,
      COUNT(*) FILTER (WHERE st.status = 'resolved')::int as resolved,
      COUNT(*) FILTER (WHERE st.status = 'closed')::int as closed,
      COUNT(*) FILTER (WHERE st.priority = 'high')::int as high_priority
    FROM support_tickets st
    ${whereSql}
  `,
    params
  );
  res.json(result.rows[0]);
}));

// ─── UNIFIED ticket_type taxonomy (June 2026) ────────────────────
// support_tickets is now the single home for ALL customer requests:
// support, complaints, property reports, escalations. ticket_type
// is the new top-level taxonomy. department still drives admin
// scope / auto-assignment so the existing inbox keeps working.
const TICKET_TYPE_TO_DEPARTMENT = {
  // Pure support flavors (legacy compatible)
  financial: 'financial',
  account: 'account',
  technical: 'technical',
  // Complaint flavors absorbed from account_complaints
  billing_complaint: 'financial',
  refund_claim: 'financial',
  service_complaint: 'account',
  general_complaint: 'account',
  // Property-page reports
  property_report: 'account',
  content_report: 'account',
  // AI chatbot escalations
  escalation: 'account',
};
const VALID_TICKET_TYPES = Object.keys(TICKET_TYPE_TO_DEPARTMENT);

router.post("/", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const {
    department: rawDepartment,
    subcategory,
    priority,
    subject,
    description,
    // ── new unified fields (all optional, backward compatible) ──
    ticket_type: rawTicketType,
    invoice_id,
    refund_id,
    related_property_id,
    report_reason_code,
  } = req.body;

  if (!subject || !description) {
    return res.status(400).json({ error: "الموضوع والوصف مطلوبان" });
  }

  // Resolve ticket_type + department. Three valid input shapes:
  //   1. {department}                 — legacy support flow
  //   2. {ticket_type}                — new unified flow
  //   3. {ticket_type, department}    — explicit override
  let ticketType = null;
  let department = null;
  if (rawTicketType && VALID_TICKET_TYPES.includes(rawTicketType)) {
    ticketType = rawTicketType;
    department = rawDepartment && ['financial', 'account', 'technical'].includes(rawDepartment)
      ? rawDepartment
      : TICKET_TYPE_TO_DEPARTMENT[rawTicketType];
  } else if (rawDepartment && ['financial', 'account', 'technical'].includes(rawDepartment)) {
    department = rawDepartment;
    ticketType = rawDepartment; // legacy: type === department
  } else {
    return res.status(400).json({ error: "يرجى اختيار نوع الطلب" });
  }

  const allowedSources = new Set([
    "manual", "complaint_page", "ai_chatbot", "feedback_followup",
    "property_report", "unified_composer",
  ]);
  const source = allowedSources.has(req.body?.source) ? req.body.source : "manual";

  /** Optional triage tag (e.g. billing_hint) — stored in category column; keeps CS queue + transfer workflow */
  const ALLOWED_CATEGORY_TAGS = new Set(["billing_hint"]);
  let categoryValue = department;
  if (typeof req.body.category === "string" && req.body.category.trim()) {
    const tag = req.body.category.trim();
    if (ALLOWED_CATEGORY_TAGS.has(tag)) {
      categoryValue = tag;
    }
  }
  
  const ticketNumber = generateTicketNumber();

  // Snapshot the customer's locale and active plan for use both by routing
  // (tier shortens SLA for premium customers) and by the admin UI later
  // (shows due-by time in customer's local zone, language hint, etc.).
  // Wrapped in try/catch so a missing users.country column (rolling deploy)
  // doesn't block ticket creation.
  let customerCountry = null, customerTimezone = null, customerLanguage = null, planTier = null;
  if (userId) {
    try {
      const meta = await db.query(
        `SELECT u.country, u.timezone, u.preferred_language,
                COALESCE(p.code, p.name) AS plan_tier
         FROM users u
         LEFT JOIN user_plans up
           ON up.user_id = u.id
          AND up.status = 'active'
          AND (up.expires_at IS NULL OR up.expires_at > NOW())
         LEFT JOIN plans p ON p.id = up.plan_id
         WHERE u.id = $1
         ORDER BY up.started_at DESC NULLS LAST
         LIMIT 1`,
        [userId]
      );
      const m = meta.rows[0] || {};
      customerCountry  = m.country || null;
      customerTimezone = m.timezone || null;
      customerLanguage = m.preferred_language || null;
      planTier         = m.plan_tier || null;
    } catch (err) {
      if (err && err.code !== '42703') console.error('[support] meta lookup failed', err.message);
    }
  }

  const routing = getSmartRouting(department, priority || 'medium', planTier);
  const deptConfig = DEPARTMENT_CONFIG[department];

  // Owner rule: customers never land directly in Finance. Even an explicit
  // refund request enters through Support first — Support clarifies, tries
  // to resolve, and only escalates to Finance if money actually needs to
  // move. So when a customer (role='user') opens a financial ticket, we
  // re-route to support_admin and keep the financial department/category
  // tag so the eventual transfer pre-fills the right context. Internal
  // admins (manual creates from finance) keep the original routing.
  if (
    department === 'financial' &&
    req.user?.role === 'user' &&
    routing.role === 'finance_admin'
  ) {
    routing.role = 'support_admin';
    routing.sla_hours = Math.max(routing.sla_hours, 24);
  }

  // Resilient INSERT ladder — try richest shape first, drop snapshot then
  // sla_due_at on 42703 so deploys can land before the migration finishes.
  let result;
  try {
    result = await db.query(
      `INSERT INTO support_tickets
       (user_id, ticket_number, department, subcategory, category, priority, subject, description,
        auto_assigned_role, sla_hours, sla_due_at,
        plan_tier, customer_country, customer_timezone, customer_language,
        source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
               $9, $10, NOW() + make_interval(hours => $10),
               $11, $12, $13, $14,
               $15)
       RETURNING *`,
      [userId, ticketNumber, department, subcategory || null, categoryValue,
       priority || 'medium', subject, description,
       routing.role, routing.sla_hours,
       planTier, customerCountry, customerTimezone, customerLanguage,
       source]
    );
  } catch (err1) {
    if (!(err1 && err1.code === '42703')) throw err1;
    try {
      result = await db.query(
        `INSERT INTO support_tickets
         (user_id, ticket_number, department, subcategory, category, priority, subject, description,
          auto_assigned_role, sla_hours, sla_due_at, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                 $9, $10, NOW() + make_interval(hours => $10), $11)
         RETURNING *`,
        [userId, ticketNumber, department, subcategory || null, categoryValue,
         priority || 'medium', subject, description,
         routing.role, routing.sla_hours, source]
      );
    } catch (err2) {
      if (!(err2 && err2.code === '42703')) throw err2;
      result = await db.query(
        `INSERT INTO support_tickets
         (user_id, ticket_number, department, subcategory, category, priority, subject, description, auto_assigned_role, sla_hours, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [userId, ticketNumber, department, subcategory || null, categoryValue,
         priority || 'medium', subject, description,
         routing.role, routing.sla_hours, source]
      );
    }
  }

  const ticket = result.rows[0];

  // Stamp the unified-system fields if they were provided. Done as a
  // post-insert UPDATE so the resilient INSERT ladder above doesn't
  // need a 4th tier — these columns are nullable and only one
  // UPDATE fires per ticket. 42703 catch lets old envs ignore the
  // call until the migration lands.
  if (ticketType || invoice_id || refund_id || related_property_id || report_reason_code) {
    try {
      const updRes = await db.query(
        `UPDATE support_tickets
         SET ticket_type = COALESCE($1, ticket_type),
             invoice_id = COALESCE($2, invoice_id),
             refund_id = COALESCE($3, refund_id),
             related_property_id = COALESCE($4, related_property_id),
             report_reason_code = COALESCE($5, report_reason_code)
         WHERE id = $6
         RETURNING ticket_type, invoice_id, refund_id, related_property_id, report_reason_code`,
        [
          ticketType,
          invoice_id ? parseInt(invoice_id, 10) : null,
          refund_id ? parseInt(refund_id, 10) : null,
          related_property_id || null,
          report_reason_code || null,
          ticket.id,
        ]
      );
      if (updRes.rows[0]) Object.assign(ticket, updRes.rows[0]);
    } catch (e) {
      if (e && e.code !== '42703') {
        console.warn('[support POST] unified-fields update:', e.message);
      }
    }
  }

  // Audit-log entry for the create event (best-effort, never blocks).
  try {
    await db.query(
      `INSERT INTO support_ticket_audit_log
         (ticket_id, event_type, actor_user_id, actor_name_snapshot,
          actor_email_snapshot, actor_role_snapshot, to_role, to_status, payload)
       VALUES ($1, 'created', $2, $3, $4, $5, $6, 'new', $7::jsonb)`,
      [
        ticket.id, userId, req.user?.name || null, req.user?.email || null,
        req.user?.role || 'user', routing.role,
        JSON.stringify({ ticket_type: ticketType, source, related_property_id, invoice_id }),
      ]
    );
  } catch (e) {
    if (e && e.code !== '42P01') {
      console.warn('[support POST] audit log:', e.message);
    }
  }

  try {
    await db.query(
      `INSERT INTO omni_conversations (source_type, source_id, status, created_at, updated_at)
       SELECT 'ticket', $1, 'open', NOW(), NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM omni_conversations WHERE source_type = 'ticket' AND source_id = $1
       )`,
      [ticket.id]
    );
  } catch (omniErr) {
    console.warn("[support POST] omni_conversations:", omniErr.message);
  }
  
  try {
    const targetAdmins = await db.query(
      `SELECT id FROM users WHERE role IN ('super_admin', 'admin', $1)`,
      [routing.role]
    );
    
    const deptName = deptConfig?.name_ar || 'دعم';
    
    for (const admin of targetAdmins.rows) {
      try {
        await db.query(
          `INSERT INTO notifications (user_id, title, body, type, link, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [
            admin.id,
            `تذكرة ${deptName} جديدة 🎫`,
            `تذكرة جديدة: ${subject} (${ticketNumber})`,
            'support_new',
            `/admin/support`
          ]
        );
      } catch (notifErr) {
        console.error(`Failed to notify admin ${admin.id}:`, notifErr.message);
      }
    }
  } catch (notifErr) {
    console.error("Failed to fetch admins for notification:", notifErr.message);
  }
  
  console.log(`📩 تذكرة ${deptConfig?.name_ar || department} جديدة: ${ticketNumber} → ${routing.role} (SLA: ${routing.sla_hours}h)`);
  
  res.status(201).json({ 
    ok: true, 
    ticket: ticket, 
    message: "تم إنشاء التذكرة بنجاح",
    routing: {
      department: deptConfig?.name_ar,
      assigned_to_role: routing.role,
      sla_hours: routing.sla_hours
    }
  });
}));

/** Mark this ticket as read for the requester. Two things happen:
 *  1. If the requester is the ticket owner, user_last_read_at bumps.
 *  2. Regardless of role, every unread notification belonging to the
 *     REQUESTER that links to this ticket gets cleared. Before, this
 *     route returned 403 for any role other than "user" — so a
 *     super_admin (or any staff that ALSO owns notifications about
 *     their own tickets, e.g. from a chatbot escalation they ran for
 *     testing) could never decrement their bell. */
router.patch("/:id/mark-read", authMiddleware, denyFinanceFromSupport, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "معرف غير صالح" });
  }
  // Bump the customer-side marker only if the requester actually owns
  // the ticket. Doesnt 403 if they dont — staff just wont bump the
  // marker, but they CAN still clear their own notification rows.
  let bumpedOwner = false;
  try {
    const r = await db.query(
      `UPDATE support_tickets
       SET user_last_read_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, req.user.id]
    );
    bumpedOwner = r.rowCount > 0;
  } catch (e) {
    console.warn('[support mark-read] owner bump failed:', e.message);
  }
  let clearedNotifications = 0;
  try {
    const r = await db.query(
      `UPDATE notifications
       SET read_at = NOW()
       WHERE user_id = $1
         AND read_at IS NULL
         AND (link = $2 OR link LIKE $3)
       RETURNING id`,
      [req.user.id, `/account/my-tickets?open=${id}`, `/account/my-tickets?open=${id}&%`]
    );
    clearedNotifications = r.rowCount || 0;
  } catch (e) {
    console.warn('[support mark-read] notifications clear failed:', e.message);
  }
  console.log('[support mark-read]', JSON.stringify({
    ticketId: id, userId: req.user.id, role: req.user.role,
    bumpedOwner, clearedNotifications,
  }));
  res.json({ ok: true, bumpedOwner, clearedNotifications });
}));

/** Staff marks ticket as read on the admin side — counter for admin
 *  bell drops to reflect that the customers latest replies have been
 *  seen. user_last_read_at on the customer side is left untouched. */
router.patch("/:id/mark-read-admin", authMiddleware, denyFinanceFromSupport, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "معرف غير صالح" });
  }
  if (req.user.role === "user") {
    return res.status(403).json({ error: "غير مصرح" });
  }
  const sc = getSupportTicketScope(req.user.role, req.user.id, 2);
  let q = `UPDATE support_tickets SET admin_last_read_at = NOW() WHERE id = $1`;
  const params = [id];
  if (sc.clause) {
    q += ` AND ${sc.clause}`;
    params.push(...sc.params);
  }
  const r = await db.query(q + ` RETURNING id`, params);
  if (r.rows.length === 0) {
    return res.status(404).json({ error: "التذكرة غير موجودة" });
  }
  console.log('[support mark-read-admin]', JSON.stringify({
    ticketId: id, adminId: req.user.id, role: req.user.role,
  }));
  res.json({ ok: true });
}));

/** Admin-side unread count: tickets where the latest customer reply
 *  is newer than admin_last_read_at (or admin_last_read_at IS NULL).
 *  Scoped by role so finance_admin only sees finance department, etc.
 *
 *  Resilient: if the admin_last_read_at column hasnt landed yet
 *  (Postgres 42703 = undefined_column on a fresh deploy where init.js
 *  hasnt finished), fall back to "tickets that have ANY customer
 *  reply" so the bell still shows a meaningful number instead of a
 *  500. The fallback gets replaced as soon as init.js finishes. */
router.get("/admin-unread-count", authMiddleware, denyFinanceFromSupport, asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store, max-age=0');
  if (req.user.role === "user") {
    return res.json({ count: 0 });
  }
  const sc = getSupportTicketScope(req.user.role, req.user.id, 1);
  const scopeWhere = sc.clause ? ` AND ${sc.clause}` : '';
  try {
    const out = await db.query(
      `SELECT COUNT(DISTINCT st.id)::int AS count
       FROM support_tickets st
       JOIN support_ticket_replies r
         ON r.ticket_id = st.id
        AND r.sender_type = 'user'
       WHERE (st.admin_last_read_at IS NULL OR r.created_at > st.admin_last_read_at)
       ${scopeWhere}`,
      sc.params || []
    );
    const count = out.rows[0]?.count || 0;
    console.log('[admin-unread-count]', JSON.stringify({
      role: req.user.role, userId: req.user.id, count,
    }));
    return res.json({ count });
  } catch (e) {
    if (e && e.code === '42703') {
      console.warn('[admin-unread-count] admin_last_read_at column missing — running migration-less fallback');
      const out = await db.query(
        `SELECT COUNT(DISTINCT st.id)::int AS count
         FROM support_tickets st
         JOIN support_ticket_replies r
           ON r.ticket_id = st.id
          AND r.sender_type = 'user'
         ${sc.clause ? `WHERE ${sc.clause}` : ''}`,
        sc.params || []
      );
      return res.json({ count: out.rows[0]?.count || 0, _fallback: true });
    }
    throw e;
  }
}));

/** Manual routing: move ticket to Finance (audit trail as internal reply). */
// ════════════════════════════════════════════════════════════════════
// /api/support/:id/forward-to-finance
//
// Owner rule: Support is the ONLY role that can put a refund in front
// of finance. This route is the canonical handoff. Finance never sees
// the underlying ticket — they see the refund_request object that
// this route creates.
//
// Body: { amount, reason, support_note }
//   amount       — number, must be > 0 and <= invoice total when linked
//   reason       — short label (e.g. "duplicate charge", "user mistake")
//   support_note — REQUIRED. The consolidated summary the support agent
//                  writes after reviewing the conversation. Finance
//                  reads ONLY this — they cannot see the customer
//                  conversation.
//
// Effect:
//   - INSERT refunds (status='pending_review', case_number, ticket_id,
//     amount, support_note, …) — this is the refund_request finance sees
//   - UPDATE support_tickets SET refund_id, status='in_progress' — the
//     ticket STAYS on support's side; finance never owns it
//   - Customer notification: "نراجع طلب الاسترداد مع المالية"
// ════════════════════════════════════════════════════════════════════
router.post(
  "/:id/forward-to-finance",
  authMiddleware,
  denyFinanceFromSupport,
  requireRoles("super_admin", "admin", "support_admin", "admin_manager", "content_admin"),
  asyncHandler(async (req, res) => {
    const refundSM = require("../services/refundStateMachine");
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "معرف غير صالح" });

    const amount = req.body?.amount != null ? parseFloat(req.body.amount) : null;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    const supportNote = typeof req.body?.support_note === "string" ? req.body.support_note.trim() : "";

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "المبلغ مطلوب ويجب أن يكون أكبر من صفر" });
    }
    if (supportNote.length < 10) {
      return res.status(400).json({ error: "ملاحظة الدعم مطلوبة (10 حروف على الأقل). هذه ما ستقرأه المالية." });
    }

    const tRes = await db.query(
      `SELECT id, ticket_number, user_id, invoice_id, refund_id
       FROM support_tickets WHERE id = $1`,
      [id]
    );
    if (tRes.rows.length === 0) return res.status(404).json({ error: "التذكرة غير موجودة" });
    const ticket = tRes.rows[0];

    if (ticket.refund_id) {
      return res.status(409).json({
        error: "هذه التذكرة محوّلة بالفعل لطلب استرداد قائم",
        refund_id: ticket.refund_id,
      });
    }

    // Pull invoice total to bound the amount + populate original_amount
    let originalAmount = null;
    if (ticket.invoice_id) {
      const inv = await db.query(`SELECT total FROM invoices WHERE id = $1`, [ticket.invoice_id]);
      if (inv.rows[0]) {
        originalAmount = parseFloat(inv.rows[0].total);
        if (amount > originalAmount) {
          return res.status(400).json({
            error: `المبلغ (${amount} ر.س) يتجاوز قيمة الفاتورة (${originalAmount} ر.س)`,
          });
        }
      }
    }
    const refundType = (originalAmount != null && amount < originalAmount) ? "partial" : "full";

    const client = await db.getClient();
    let didCommit = false;
    try {
      await client.query("BEGIN");
      const caseNumber = await refundSM.mintCaseNumber(client);
      const ins = await client.query(
        `INSERT INTO refunds
           (user_id, invoice_id, ticket_id, amount, original_amount,
            estimated_refund_amount, refund_type, reason, support_note,
            status, case_number,
            state_changed_at, state_changed_by,
            created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $4, $6, $7, $8,
                 'pending_review', $9,
                 NOW(), $10, NOW(), NOW())
         RETURNING *`,
        [
          ticket.user_id, ticket.invoice_id || null, id,
          amount, originalAmount, refundType, reason || null, supportNote,
          caseNumber, req.user.id,
        ]
      );
      const refund = ins.rows[0];

      // Ticket stays on support's side — only link it, no ownership
      // change. Status flag tells the support UI "you're waiting on
      // finance for this one".
      await client.query(
        `UPDATE support_tickets
         SET refund_id = $1, status = 'in_progress', updated_at = NOW()
         WHERE id = $2`,
        [refund.id, id]
      );

      // Internal note on the ticket for the support audit trail.
      await client.query(
        `INSERT INTO support_ticket_replies (ticket_id, sender_id, sender_type, message)
         VALUES ($1, $2, 'internal', $3)`,
        [
          id, req.user.id,
          `تم تحويل الطلب لقضية استرداد ${caseNumber} بمبلغ ${amount} ر.س. ملاحظة المالية: ${supportNote}`,
        ]
      );

      // Event in the refund timeline.
      await refundSM.recordEvent(client, {
        refund_id: refund.id,
        event_type: "case_created",
        from_state: null,
        to_state: "pending_review",
        actor_user_id: req.user.id,
        actor_name: req.user.name,
        actor_role: req.user.role,
        note: supportNote,
        payload: { ticket_id: id, amount, case_number: caseNumber, reason },
      });

      // Customer notification — support is still the contact channel.
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, channel, status, payload, scheduled_at)
         VALUES ($1, 'refund_under_review', 'طلب الاسترداد قيد مراجعة المالية',
                 $2, 'app', 'pending', $3::jsonb, NOW())`,
        [
          ticket.user_id,
          `نراجع طلب الاسترداد بمبلغ ${amount} ر.س مع قسم المالية. سيصلك إشعار عند اعتماده.`,
          JSON.stringify({ ticket_id: id, refund_id: refund.id, case_number: caseNumber }),
        ]
      );

      await client.query("COMMIT");
      didCommit = true;
      client.release();

      res.json({ ok: true, refund });
    } catch (err) {
      if (!didCommit) { try { await client.query("ROLLBACK"); } catch { /* ignore */ } }
      try { client.release(); } catch { /* ignore */ }
      throw err;
    }
  })
);

router.patch(
  "/:id/transfer",
  authMiddleware,
  requireRoles(
    "super_admin",
    "admin",
    "support_admin",
    "admin_manager",
    "content_admin"
  ),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "معرف غير صالح" });
    }
    const target = (req.body?.target || "financial").toLowerCase();
    if (target !== "financial") {
      return res.status(400).json({ error: "نوع التحويل غير مدعوم حالياً" });
    }

    const sc = getSupportTicketScope(req.user.role, req.user.id, 2);
    let ticketQuery = `SELECT * FROM support_tickets st WHERE st.id = $1`;
    const ticketParams = [id];
    if (sc.clause) {
      ticketQuery += ` AND ${sc.clause}`;
      ticketParams.push(...sc.params);
    }

    const existing = await db.query(ticketQuery, ticketParams);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "التذكرة غير موجودة أو غير مصرح بعرضها" });
    }

    const ticket = existing.rows[0];
    // Idempotency rule: a ticket can be "in" the financial department and
    // still need transferring — customer-originated refund requests now
    // land in support_admin with department='financial' on purpose, so we
    // gate on auto_assigned_role / transferred_to_finance_at, not department.
    if (
      ticket.auto_assigned_role === "finance_admin" ||
      ticket.transferred_to_finance_at
    ) {
      return res.status(400).json({ error: "التذكرة محوّلة بالفعل إلى المالية" });
    }

    const routing = getSmartRouting("financial", ticket.priority || "medium");

    // Resilient UPDATE — try with the new transferred_to_finance_* +
    // finance_inbox_state columns first, fall back as columns get
    // missed on a rolling deploy (42703 = column does not exist).
    //
    // Contract change (Phase 1): /transfer no longer creates a refund
    // case. It only moves the ticket into the Finance Inbox
    // (finance_inbox_state='in_inbox'). Finance decides later whether
    // to convert it to a Refund Case via /finance/inbox/:id/convert-to-case
    // or to resolve it in place.
    let updated;
    try {
      updated = await db.query(
        `UPDATE support_tickets st
         SET department = 'financial',
             category = COALESCE(NULLIF(TRIM(category), ''), 'financial'),
             auto_assigned_role = $1,
             sla_hours = $2,
             transferred_to_finance_at = NOW(),
             transferred_to_finance_by = $3,
             finance_inbox_state = 'in_inbox',
             updated_at = NOW()
         WHERE st.id = $4
         RETURNING *`,
        [routing.role, routing.sla_hours, req.user.id, id]
      );
    } catch (err) {
      if (!(err && err.code === '42703')) throw err;
      try {
        updated = await db.query(
          `UPDATE support_tickets st
           SET department = 'financial',
               category = COALESCE(NULLIF(TRIM(category), ''), 'financial'),
               auto_assigned_role = $1,
               sla_hours = $2,
               transferred_to_finance_at = NOW(),
               transferred_to_finance_by = $3,
               updated_at = NOW()
           WHERE st.id = $4
           RETURNING *`,
          [routing.role, routing.sla_hours, req.user.id, id]
        );
      } catch (err2) {
        if (!(err2 && err2.code === '42703')) throw err2;
        updated = await db.query(
          `UPDATE support_tickets st
           SET department = 'financial',
               category = COALESCE(NULLIF(TRIM(category), ''), 'financial'),
               auto_assigned_role = $1,
               sla_hours = $2,
               updated_at = NOW()
           WHERE st.id = $3
           RETURNING *`,
          [routing.role, routing.sla_hours, id]
        );
      }
    }

    const transferNote = typeof req.body?.note === "string" ? req.body.note.trim() : "";
    const auditMessage = transferNote
      ? `تم تحويل التذكرة إلى قسم المالية — ${transferNote}`
      : "تم تحويل التذكرة إلى قسم المالية";

    await db.query(
      `INSERT INTO support_ticket_replies (ticket_id, sender_id, sender_type, message)
       VALUES ($1, $2, 'internal', $3)`,
      [id, req.user.id, auditMessage]
    );

    // Audit log entry (best-effort).
    try {
      await db.query(
        `INSERT INTO support_ticket_audit_log
           (ticket_id, event_type, actor_user_id, actor_name_snapshot,
            actor_email_snapshot, actor_role_snapshot, from_role, to_role, payload)
         VALUES ($1, 'transferred_to_finance', $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [
          id, req.user.id, req.user?.name || null, req.user?.email || null,
          req.user?.role || null, ticket.auto_assigned_role || null,
          routing.role, JSON.stringify({ note: transferNote || null }),
        ]
      );
    } catch (e) {
      if (e && e.code !== '42P01') console.warn('[support transfer] audit:', e.message);
    }

    // Wake up finance_admin inboxes — best effort, never blocks transfer.
    try {
      const fin = await db.query(`SELECT id FROM users WHERE role = 'finance_admin'`);
      for (const row of fin.rows) {
        await db.query(
          `INSERT INTO notifications (user_id, type, title, message, link, created_at)
           VALUES ($1, 'finance_transfer', $2, $3, $4, NOW())`,
          [
            row.id,
            'مراسلة محوّلة من الدعم',
            `تذكرة ${ticket.ticket_number || ('#' + ticket.id)} بانتظار مراجعة المالية`,
            '/add-listing/admin/finance?tab=messages',
          ]
        );
      }
    } catch (e) {
      if (e && e.code !== '42P01') console.warn('[support transfer] notify:', e.message);
    }

    res.json({ ok: true, ticket: updated.rows[0], message: auditMessage });
  })
);

router.get("/:id", authMiddleware, denyFinanceFromSupport, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const role = req.user.role;

  let query = `
    SELECT 
      st.*,
      u.name as user_name,
      u.email as user_email,
      u.phone as user_phone,
      a.name as assigned_name
    FROM support_tickets st
    LEFT JOIN users u ON st.user_id = u.id
    LEFT JOIN users a ON st.assigned_to = a.id
    WHERE st.id = $1
  `;
  const params = [id];

  if (role === "user") {
    query += " AND st.user_id = $2";
    params.push(userId);
  } else {
    const sc = getSupportTicketScope(role, userId, 2);
    if (sc.clause) {
      query += ` AND ${sc.clause}`;
      params.push(...sc.params);
    }
  }

  const ticketResult = await db.query(query, params);
  
  if (ticketResult.rows.length === 0) {
    return res.status(404).json({ error: "التذكرة غير موجودة" });
  }
  
  const repliesSql = `
     SELECT 
      r.*,
      u.name as sender_name,
      u.role as sender_role
     FROM support_ticket_replies r
     LEFT JOIN users u ON r.sender_id = u.id
     WHERE r.ticket_id = $1
     ${role === "user" ? "AND r.sender_type <> 'internal'" : ""}
     ORDER BY r.created_at ASC`;
  const repliesResult = await db.query(repliesSql, [id]);

  // Bump the customer-side marker if the requester owns this ticket
  // (works for staff too if theyre testing on their own ticket).
  try {
    await db.query(
      `UPDATE support_tickets SET user_last_read_at = NOW() WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
  } catch (e) {
    console.warn("[support GET :id] user_last_read_at:", e.message);
  }
  // Bump the admin-side marker if the requester is staff. Decoupled
  // from ownership so a super_admin testing their OWN ticket can
  // still see both markers fire.
  if (role !== "user") {
    try {
      await db.query(
        `UPDATE support_tickets SET admin_last_read_at = NOW() WHERE id = $1`,
        [id]
      );
    } catch (e) {
      console.warn("[support GET :id] admin_last_read_at:", e.message);
    }
  }
  // ALWAYS clear notification rows that belong to the REQUESTER and
  // point at this ticket. Bell counter drops the moment the thread
  // opens for whoever is looking at it — customer or staff.
  try {
    const r = await db.query(
      `UPDATE notifications SET read_at = NOW()
       WHERE user_id = $1 AND read_at IS NULL
         AND (link = $2 OR link LIKE $3)`,
      [userId, `/account/my-tickets?open=${id}`, `/account/my-tickets?open=${id}&%`]
    );
    if (r.rowCount > 0) {
      console.log('[support GET :id] cleared notifications', JSON.stringify({
        ticketId: id, userId, cleared: r.rowCount,
      }));
    }
  } catch (e) {
    console.warn("[support GET :id] notif clear:", e.message);
  }

  console.log('[support GET :id]', JSON.stringify({
    ticketId: id, role, viewerId: userId, replies: repliesResult.rows.length,
  }));

  res.json({
    ticket: ticketResult.rows[0],
    replies: repliesResult.rows
  });
}));

router.post("/:id/reply", authMiddleware, denyFinanceFromSupport, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { message } = req.body;
  const senderId = req.user.id;
  const role = req.user.role;
  const isStaff = role !== "user";

  if (!message || message.trim() === '') {
    return res.status(400).json({ error: "الرسالة مطلوبة" });
  }

  let ticketQuery = "SELECT * FROM support_tickets st WHERE st.id = $1";
  const ticketParams = [id];

  if (role === "user") {
    ticketQuery += " AND st.user_id = $2";
    ticketParams.push(senderId);
  } else {
    const sc = getSupportTicketScope(role, senderId, 2);
    if (sc.clause) {
      ticketQuery += ` AND ${sc.clause}`;
      ticketParams.push(...sc.params);
    }
  }

  const ticketCheck = await db.query(ticketQuery, ticketParams);
  if (ticketCheck.rows.length === 0) {
    return res.status(404).json({ error: "التذكرة غير موجودة" });
  }

  const senderType = isStaff ? "admin" : "user";
  
  const result = await db.query(
    `INSERT INTO support_ticket_replies (ticket_id, sender_id, sender_type, message)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [id, senderId, senderType, message.trim()]
  );

  const replyWithName = await db.query(
    `SELECT r.*, u.name as sender_name
     FROM support_ticket_replies r
     LEFT JOIN users u ON r.sender_id = u.id
     WHERE r.id = $1`,
    [result.rows[0].id]
  );
  
  await db.query(
    `UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`,
    [id]
  );
  
  const ticket = ticketCheck.rows[0];
  // Notification fan-out — every reply notifies "the OTHER side".
  // Staff replied: ping the customer. Customer replied: ping the
  // assigned admin (or every admin in the auto_assigned_role if
  // theres no specific assignee yet) so the admin bell ticks even
  // when nobody is staring at the support board.
  if (isStaff && ticket.user_id !== senderId) {
    try {
      await db.query(
        `INSERT INTO notifications (user_id, title, body, type, link, created_at)
         VALUES ($1, 'رد جديد على تذكرتك', $2, 'support_reply', $3, NOW())`,
        [ticket.user_id, `تم الرد على تذكرة "${ticket.subject}"`, `/account/my-tickets?open=${id}`]
      );
      console.log('[support reply] customer notified', JSON.stringify({
        ticketId: id, customerId: ticket.user_id, by: senderId,
      }));
    } catch (e) {
      console.warn('[support reply] customer notify failed:', e.message);
    }
  } else if (!isStaff) {
    try {
      // Pick the recipients:
      //  1) ticket.assigned_to if set
      //  2) else every user with role = ticket.auto_assigned_role
      //  3) else every super_admin/admin/support_admin
      let recipients = [];
      if (ticket.assigned_to) {
        recipients = [ticket.assigned_to];
      } else if (ticket.auto_assigned_role) {
        const rs = await db.query(`SELECT id FROM users WHERE role = $1`, [ticket.auto_assigned_role]);
        recipients = rs.rows.map(r => r.id);
      }
      if (recipients.length === 0) {
        const rs = await db.query(
          `SELECT id FROM users WHERE role IN ('super_admin','admin','support_admin')`
        );
        recipients = rs.rows.map(r => r.id);
      }
      // Customer name for the body line.
      let custName = 'العميل';
      try {
        const u = await db.query(`SELECT name FROM users WHERE id = $1`, [ticket.user_id]);
        if (u.rows[0]?.name) custName = u.rows[0].name;
      } catch { /* fall back to default */ }
      const link = `/add-listing/admin/customer-service?ticketId=${id}`;
      let pinged = 0;
      for (const uid of recipients) {
        try {
          await db.query(
            `INSERT INTO notifications (user_id, title, body, type, link, created_at)
             VALUES ($1, 'رد جديد من العميل', $2, 'support_customer_reply', $3, NOW())`,
            [uid, `${custName} ردّ على تذكرة "${ticket.subject}"`, link]
          );
          pinged += 1;
        } catch (e) {
          console.warn(`[support reply] admin notify failed uid=${uid}:`, e.message);
        }
      }
      console.log('[support reply] admins notified', JSON.stringify({
        ticketId: id, recipients: recipients.length, pinged, by: senderId,
      }));
    } catch (e) {
      console.warn('[support reply] admin notify outer failed:', e.message);
    }
  }

  res.status(201).json({ ok: true, reply: replyWithName.rows[0], message: "تم إرسال الرد بنجاح" });
}));

router.patch("/:id/status", authMiddleware, requireRoles('super_admin', 'admin', 'support_admin', 'content_admin', 'admin_manager'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const role = req.user.role;

  const validStatuses = ['new', 'in_progress', 'resolved', 'closed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: "الحالة غير صالحة" });
  }

  const sc = getSupportTicketScope(role, req.user.id, 3);
  const scopeSql = sc.clause ? ` AND ${sc.clause}` : "";
  const resolvedAt = (status === 'resolved' || status === 'closed') ? 'NOW()' : 'NULL';

  const result = await db.query(
    `UPDATE support_tickets st
     SET status = $1, resolved_at = ${resolvedAt}, updated_at = NOW()
     WHERE st.id = $2${scopeSql}
     RETURNING *`,
    [status, id, ...sc.params]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "التذكرة غير موجودة" });
  }
  
  const ticket = result.rows[0];
  const statusLabels = {
    new: 'جديدة',
    in_progress: 'قيد المعالجة',
    resolved: 'تم الحل',
    closed: 'مغلقة'
  };
  
  await db.query(
    `INSERT INTO notifications (user_id, title, body, type, link, created_at)
     VALUES ($1, 'تحديث حالة التذكرة', $2, 'support_status', $3, NOW())`,
    [ticket.user_id, `تم تحديث حالة تذكرتك "${ticket.subject}" إلى: ${statusLabels[status] || status}`, `/account/my-tickets?open=${id}`]
  );
  
  res.json({ ok: true, ticket: result.rows[0], message: "تم تحديث الحالة" });
}));

router.patch("/:id/assign", authMiddleware, requireRoles('super_admin', 'admin', 'support_admin', 'content_admin', 'admin_manager'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { assigned_to } = req.body;
  const role = req.user.role;
  const sc = getSupportTicketScope(role, req.user.id, 3);
  const scopeSql = sc.clause ? ` AND ${sc.clause}` : "";

  const result = await db.query(
    `UPDATE support_tickets st
     SET assigned_to = $1, updated_at = NOW()
     WHERE st.id = $2${scopeSql}
     RETURNING *`,
    [assigned_to || null, id, ...sc.params]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "التذكرة غير موجودة" });
  }
  
  res.json({ ok: true, ticket: result.rows[0], message: "تم تعيين المسؤول" });
}));

router.patch("/:id/priority", authMiddleware, requireRoles('super_admin', 'admin', 'support_admin', 'content_admin', 'admin_manager'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { priority } = req.body;
  const role = req.user.role;
  const sc = getSupportTicketScope(role, req.user.id, 3);
  const scopeSql = sc.clause ? ` AND ${sc.clause}` : "";

  const validPriorities = ['low', 'medium', 'high', 'urgent'];
  if (!validPriorities.includes(priority)) {
    return res.status(400).json({ error: "الأولوية غير صالحة" });
  }

  const result = await db.query(
    `UPDATE support_tickets st
     SET priority = $1, updated_at = NOW()
     WHERE st.id = $2${scopeSql}
     RETURNING *`,
    [priority, id, ...sc.params]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "التذكرة غير موجودة" });
  }
  
  res.json({ ok: true, ticket: result.rows[0], message: "تم تحديث الأولوية" });
}));

router.delete("/:id", authMiddleware, requireRoles("super_admin", "admin"), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "معرف غير صالح" });
  }

  const result = await db.query(
    `DELETE FROM support_tickets WHERE id = $1 RETURNING id`,
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "التذكرة غير موجودة" });
  }

  res.json({ ok: true, deleted: id, message: "تم حذف التذكرة نهائياً" });
}));

// ────────────────────────────────────────────────────────────────────
// Customer-facing: bank info update + reopen window.
// Used when the refund case is in waiting_customer_info and we asked
// the customer for their IBAN, or when a finance_inbox_resolved
// ticket is within its 7-day reopen window.
// ────────────────────────────────────────────────────────────────────

router.patch("/:id/bank-info", authMiddleware, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "معرف غير صالح" });

  const bankName = typeof req.body?.bank_name === 'string' ? req.body.bank_name.trim() : '';
  const iban = typeof req.body?.bank_account_iban === 'string' ? req.body.bank_account_iban.trim() : '';
  const holder = typeof req.body?.account_holder_name === 'string' ? req.body.account_holder_name.trim() : '';
  const saveToProfile = req.body?.save_to_profile === true;

  if (!bankName || !iban || !holder) {
    return res.status(400).json({ error: "اسم البنك و IBAN واسم صاحب الحساب مطلوبة" });
  }

  const t = await db.query(
    `SELECT id, user_id, refund_id FROM support_tickets WHERE id = $1`,
    [id]
  );
  if (t.rows.length === 0) return res.status(404).json({ error: "التذكرة غير موجودة" });
  // Owner-only: a customer can only update bank info on their own ticket.
  if (req.user.role === 'user' && t.rows[0].user_id !== req.user.id) {
    return res.status(403).json({ error: "غير مصرح" });
  }

  // Persist the snapshot on the ticket for audit + immediate finance use.
  await db.query(
    `UPDATE support_tickets
     SET refund_bank_details_snapshot = $1::jsonb, updated_at = NOW()
     WHERE id = $2`,
    [JSON.stringify({ bank_name: bankName, bank_account_iban: iban, account_holder_name: holder }), id]
  );

  // If a refund case is already linked and waiting on this info,
  // funnel through the finance route via direct DB ops here to avoid
  // a cross-router call (kept idempotent — finance UI can also push
  // the case back to pending_review with the new info).
  if (t.rows[0].refund_id) {
    try {
      await db.query(
        `UPDATE refunds
         SET bank_name = $1, bank_account_iban = $2, account_holder_name = $3,
             status = CASE WHEN status = 'waiting_customer_info'
                           THEN COALESCE(pre_wait_status, 'pending_review')
                           ELSE status END,
             waiting_info_received_at = CASE WHEN status = 'waiting_customer_info' THEN NOW() ELSE waiting_info_received_at END,
             state_changed_at = CASE WHEN status = 'waiting_customer_info' THEN NOW() ELSE state_changed_at END,
             updated_at = NOW()
         WHERE id = $4`,
        [bankName, iban, holder, t.rows[0].refund_id]
      );
      await db.query(
        `INSERT INTO refund_case_events
           (refund_id, event_type, from_state, to_state,
            actor_user_id, actor_name_snapshot, actor_role_snapshot, payload)
         VALUES ($1, 'customer_info_received', 'waiting_customer_info', 'pending_review',
                 $2, $3, $4, $5::jsonb)`,
        [
          t.rows[0].refund_id, req.user.id, req.user?.name || null, req.user?.role || 'user',
          JSON.stringify({ via: 'customer_ticket', bank_name: bankName, account_holder_name: holder }),
        ]
      );
    } catch (e) {
      if (e && e.code !== '42703' && e.code !== '42P01') {
        console.warn('[support bank-info] case update:', e.message);
      }
    }
  }

  if (saveToProfile) {
    try {
      await db.query(
        `UPDATE users SET bank_name = $1, bank_account_iban = $2, account_holder_name = $3 WHERE id = $4`,
        [bankName, iban, holder, req.user.id]
      );
    } catch (e) {
      if (e && e.code !== '42703') console.warn('[support bank-info] profile save:', e.message);
    }
  }

  res.json({ ok: true });
}));

router.patch("/:id/reopen", authMiddleware, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "معرف غير صالح" });

  const t = await db.query(
    `SELECT id, user_id, finance_inbox_state, customer_reopen_deadline, status
     FROM support_tickets WHERE id = $1`,
    [id]
  );
  if (t.rows.length === 0) return res.status(404).json({ error: "التذكرة غير موجودة" });
  const tk = t.rows[0];
  if (req.user.role === 'user' && tk.user_id !== req.user.id) {
    return res.status(403).json({ error: "غير مصرح" });
  }
  if (tk.finance_inbox_state !== 'inbox_resolved') {
    return res.status(400).json({ error: "هذه التذكرة غير قابلة لإعادة الفتح" });
  }
  if (tk.customer_reopen_deadline && new Date(tk.customer_reopen_deadline) < new Date()) {
    return res.status(400).json({ error: "انتهت مهلة 7 أيام لإعادة الفتح" });
  }

  await db.query(
    `UPDATE support_tickets
     SET finance_inbox_state = 'in_inbox',
         status = 'in_progress',
         updated_at = NOW()
     WHERE id = $1`,
    [id]
  );

  res.json({ ok: true });
}));

module.exports = router;
