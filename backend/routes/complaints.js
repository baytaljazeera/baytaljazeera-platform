const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authMiddleware, requireRoles, JWT_SECRET, JWT_VERIFY_OPTIONS } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');
const { getAccountComplaintScope, getComplaintSmartRouting } = require('../utils/customerServiceScope');

// Rate limiter on complaint submission was removed per owner request:
// legitimate users were hitting the 3/hour cap. If we see abuse we can
// re-import `complaintsLimiter` from '../config/security' and re-add it
// here as middleware on the POST route.
const complaintLimiter = (req, res, next) => next();

const COMPLAINTS_ADMIN_ROLES = [
  'super_admin',
  'admin',
  'support_admin',
  'finance_admin',
  'content_admin',
  'admin_manager',
];

/**
 * Append an event to the complaint audit timeline. Snapshots the actor's
 * name/email/role at the moment of the action so future role changes don't
 * rewrite history. Best-effort — failures are logged but don't break the
 * caller (we don't want a notifications table issue to block a customer
 * submission).
 */
async function logComplaintEvent({
  complaintId,
  eventType,
  actor,                  // { id, name, email, role } — may be null for system events
  fromRole, toRole,
  fromStatus, toStatus,
  note,
  visibility = 'internal',  // 'internal' (staff-only) or 'customer_visible'
}) {
  // Try with visibility column first. If the column doesn't exist yet
  // (42703), fall back to the older shape. We never break the caller.
  try {
    await db.query(
      `INSERT INTO complaint_events
         (complaint_id, event_type,
          actor_user_id, actor_name_snapshot, actor_email_snapshot, actor_role_snapshot,
          from_role, to_role, from_status, to_status, note, visibility, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
      [
        complaintId, eventType,
        actor?.id || null,
        actor?.name || null,
        actor?.email || null,
        actor?.role || null,
        fromRole || null,
        toRole || null,
        fromStatus || null,
        toStatus || null,
        note || null,
        visibility,
      ]
    );
  } catch (err) {
    if (err && err.code === '42703') {
      try {
        await db.query(
          `INSERT INTO complaint_events
             (complaint_id, event_type,
              actor_user_id, actor_name_snapshot, actor_email_snapshot, actor_role_snapshot,
              from_role, to_role, from_status, to_status, note, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
          [
            complaintId, eventType,
            actor?.id || null,
            actor?.name || null,
            actor?.email || null,
            actor?.role || null,
            fromRole || null,
            toRole || null,
            fromStatus || null,
            toStatus || null,
            note || null,
          ]
        );
        return;
      } catch (err2) {
        console.warn('[complaint_events] fallback insert failed:', err2.code || err2.message);
        return;
      }
    }
    console.warn('[complaint_events] insert failed:', err.code || err.message);
  }
}

router.post("/", complaintLimiter, asyncHandler(async (req, res) => {
  const { category, subject, details, userName, userEmail, userPhone, invoice_id, complaint_type, priority } = req.body;

  if (!category || !subject || !details) {
    return res.status(400).json({ error: "جميع الحقول مطلوبة", errorAr: "يرجى ملء جميع الحقول المطلوبة" });
  }

  const validPriorities = ['low', 'medium', 'high', 'urgent'];
  const actualPriority = validPriorities.includes(priority) ? priority : 'medium';

  let userId = null;
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET, JWT_VERIFY_OPTIONS);
      userId = decoded.userId;
    } catch (e) {}
  }

  if (!userId && userEmail) {
    const userResult = await db.query(`SELECT id FROM users WHERE email = $1`, [userEmail]);
    if (userResult.rows.length > 0) userId = userResult.rows[0].id;
  }

  let validatedInvoiceId = null;
  if (invoice_id) {
    const invoiceResult = await db.query(
      'SELECT id FROM invoices WHERE id = $1' + (userId ? ' AND user_id = $2' : ''),
      userId ? [invoice_id, userId] : [invoice_id]
    );
    if (invoiceResult.rows.length > 0) {
      validatedInvoiceId = invoice_id;
    }
  }

  const validComplaintTypes = ['general', 'billing', 'refund', 'service', 'technical'];
  const actualComplaintType = validComplaintTypes.includes(complaint_type) ? complaint_type : 'general';

  // Snapshot the customer's locale and active plan for use both by routing
  // (plan tier shortens SLA for premium customers) and by the admin UI
  // (shows due time in customer's local zone). All four fields are
  // wrapped in try/catch — if the new columns aren't deployed yet we
  // proceed with nulls and the older code path.
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
      // 42703 = column doesn't exist on users yet; just skip the snapshot.
      if (err && err.code !== '42703') console.error('[complaints] meta lookup failed', err.message);
    }
  }

  // Auto-route: pick the role that should own this complaint and the SLA
  // window before breach. Billing/invoice-linked → finance_admin, else
  // content_admin. SLA hours derived from priority, with a boost for
  // premium plan tiers (royal halves the window, featured ¾).
  const { role: autoAssignedRole, sla_hours: slaHours } = getComplaintSmartRouting({
    category,
    complaint_type: actualComplaintType,
    invoice_id: validatedInvoiceId,
    priority: actualPriority,
    plan_tier: planTier,
  });

  // Resilient insert ladder: try the richest shape first, drop the newest
  // columns on each retry if Postgres reports 42703 (undefined_column). This
  // keeps customer submissions working through schema rollouts where the
  // backend code lands before the migration finishes.
  //   tier-1: + plan_tier + customer_country/timezone/language (snapshot)
  //   tier-2: + priority + auto_assigned_role + sla_hours + sla_due_at
  //   tier-3: minimal (the original POST shape from before any of this)
  let result;
  try {
    result = await db.query(
      `INSERT INTO account_complaints (
         user_id, user_name, user_email, user_phone, category, subject, details,
         invoice_id, complaint_type, priority,
         auto_assigned_role, sla_hours, sla_due_at,
         plan_tier, customer_country, customer_timezone, customer_language,
         status, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               $11, $12, NOW() + ($12 || ' hours')::interval,
               $13, $14, $15, $16,
               'new', NOW())
       RETURNING *`,
      [userId, userName, userEmail, userPhone, category, subject, details,
       validatedInvoiceId, actualComplaintType, actualPriority,
       autoAssignedRole, slaHours,
       planTier, customerCountry, customerTimezone, customerLanguage]
    );
  } catch (err1) {
    if (!(err1 && err1.code === '42703')) throw err1;
    try {
      result = await db.query(
        `INSERT INTO account_complaints (
           user_id, user_name, user_email, user_phone, category, subject, details,
           invoice_id, complaint_type, priority,
           auto_assigned_role, sla_hours, sla_due_at,
           status, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                 $11, $12, NOW() + ($12 || ' hours')::interval,
                 'new', NOW())
         RETURNING *`,
        [userId, userName, userEmail, userPhone, category, subject, details,
         validatedInvoiceId, actualComplaintType, actualPriority,
         autoAssignedRole, slaHours]
      );
    } catch (err2) {
      if (!(err2 && err2.code === '42703')) throw err2;
      result = await db.query(
        `INSERT INTO account_complaints (user_id, user_name, user_email, user_phone, category, subject, details, invoice_id, complaint_type, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new', NOW()) RETURNING *`,
        [userId, userName, userEmail, userPhone, category, subject, details, validatedInvoiceId, actualComplaintType]
      );
    }
  }

  // Notify every active staff member with the assigned role so the queue
  // doesn't depend on someone happening to refresh the inbox. Best-effort
  // — failures are logged but don't break the customer's submission.
  try {
    const link = '/add-listing/admin/customer-service';
    const labelAr = autoAssignedRole === 'finance_admin' ? 'محاسبية' : 'دعم';
    await db.query(
      `INSERT INTO notifications (user_id, title, body, type, link, created_at)
       SELECT u.id,
              $1,
              $2,
              'complaint_assigned',
              $3,
              NOW()
       FROM users u
       WHERE u.role = $4
         AND COALESCE(u.is_active, true) = true`,
      [
        `شكوى جديدة (${labelAr})`,
        `${subject} — أولوية: ${actualPriority}`,
        link,
        autoAssignedRole,
      ]
    );
  } catch (e) {
    console.error('[complaints] assignment notification failed', e.message);
  }

  // Audit log — "created" event with the customer as actor (snapshot their
  // name/email so it shows up correctly even if they update their profile
  // later).
  await logComplaintEvent({
    complaintId: result.rows[0].id,
    eventType: 'created',
    actor: userId ? { id: userId, name: userName, email: userEmail, role: 'user' } : null,
    toRole: autoAssignedRole,
    toStatus: 'new',
    note: `أولوية: ${actualPriority}${validatedInvoiceId ? ` — فاتورة #${validatedInvoiceId}` : ''}`,
  });

  res.status(201).json({ ok: true, complaint: result.rows[0], message: "تم استلام شكواك بنجاح" });
}));

/**
 * GET the audit timeline for a complaint.
 *   Staff (any COMPLAINTS_ADMIN_ROLES): see everything.
 *   Customer (role=user): see only their own complaint AND only events
 *     marked visibility=customer_visible.
 */
router.get("/:id/events", authMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const role = req.user?.role;
  const isStaff = COMPLAINTS_ADMIN_ROLES.includes(role);

  // For non-staff, verify ownership first so we don't leak the existence of
  // an arbitrary complaint via a 200 with empty events vs a 404.
  if (!isStaff) {
    const own = await db.query(`SELECT user_id FROM account_complaints WHERE id = $1`, [id]);
    if (own.rows.length === 0) return res.status(404).json({ error: 'الشكوى غير موجودة' });
    if (own.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'غير مصرح' });
  }

  // Try visibility-aware SELECT. Falls back if the column hasn't been
  // added yet — in that case staff see everything (the old behavior) and
  // customers see nothing (safe default).
  try {
    const sql = isStaff
      ? `SELECT id, event_type,
                actor_user_id, actor_name_snapshot, actor_email_snapshot, actor_role_snapshot,
                from_role, to_role, from_status, to_status, note, visibility, created_at
         FROM complaint_events
         WHERE complaint_id = $1
         ORDER BY created_at ASC, id ASC`
      : `SELECT id, event_type,
                actor_name_snapshot, actor_role_snapshot,
                from_status, to_status, note, visibility, created_at
         FROM complaint_events
         WHERE complaint_id = $1 AND visibility = 'customer_visible'
         ORDER BY created_at ASC, id ASC`;
    const r = await db.query(sql, [id]);
    res.json({ events: r.rows });
  } catch (err) {
    if (err && err.code === '42P01') return res.json({ events: [] });
    if (err && err.code === '42703') {
      // visibility column missing — give staff a degraded view (no
      // visibility field) and customers an empty stream rather than crash.
      if (!isStaff) return res.json({ events: [] });
      const r = await db.query(
        `SELECT id, event_type,
                actor_user_id, actor_name_snapshot, actor_email_snapshot, actor_role_snapshot,
                from_role, to_role, from_status, to_status, note, created_at
         FROM complaint_events
         WHERE complaint_id = $1
         ORDER BY created_at ASC, id ASC`,
        [id]
      );
      return res.json({ events: r.rows });
    }
    throw err;
  }
}));

/**
 * Add a reply on a complaint — either internal (staff-only) or customer-
 * visible. Customer-visible replies ALSO push a notification to the
 * customer's bell and update admin_note so the legacy /my-complaints
 * surface still shows the most recent message.
 *
 * Body: { visibility: 'internal' | 'customer_visible', message: string }
 */
router.post("/:id/reply", authMiddleware, requireRoles(...COMPLAINTS_ADMIN_ROLES), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { visibility, message } = req.body || {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: "نص الرد مطلوب" });
  }
  if (visibility !== 'internal' && visibility !== 'customer_visible') {
    return res.status(400).json({ error: "visibility غير صالح" });
  }

  const lookup = await db.query(
    `SELECT id, user_id, subject FROM account_complaints WHERE id = $1`,
    [id]
  );
  if (lookup.rows.length === 0) return res.status(404).json({ error: "الشكوى غير موجودة" });
  const row = lookup.rows[0];

  // For customer-visible replies, mirror the latest message into admin_note
  // so the existing /my-complaints page (which reads admin_note) keeps
  // showing the latest customer-facing reply without UI changes there.
  if (visibility === 'customer_visible') {
    try {
      await db.query(
        `UPDATE account_complaints SET admin_note = $1, updated_at = NOW() WHERE id = $2`,
        [message.trim(), id]
      );
    } catch (e) {
      console.warn('[complaints] /reply admin_note update failed', e.message);
    }
    if (row.user_id) {
      try {
        await db.query(
          `INSERT INTO notifications (user_id, title, body, type, link, created_at)
           VALUES ($1, $2, $3, 'complaint_reply', $4, NOW())`,
          [row.user_id, "رد جديد على شكواك", `${row.subject || ''}`.trim(), '/my-complaints']
        );
      } catch (e) {
        console.warn('[complaints] /reply notification failed', e.message);
      }
    }
  }

  await logComplaintEvent({
    complaintId: id,
    eventType: visibility === 'customer_visible' ? 'admin_reply' : 'internal_note',
    actor: { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role },
    note: message.trim(),
    visibility,
  });

  res.json({ ok: true, visibility, message: visibility === 'customer_visible' ? "تم إرسال الرد للعميل" : "تم حفظ التوجيه الداخلي" });
}));

router.get("/mine", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const result = await db.query(
    `SELECT * FROM account_complaints WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  res.json({ complaints: result.rows });
}));

router.get("/count", authMiddleware, requireRoles('super_admin', 'admin', 'support_admin', 'finance_admin'), asyncHandler(async (req, res) => {
  const { clause, params } = getAccountComplaintScope(req.user.role, req.user.id, 1);
  const where = clause
    ? `FROM account_complaints c WHERE c.status IN ('new', 'pending') AND ${clause}`
    : `FROM account_complaints WHERE status IN ('new', 'pending')`;

  const result = await db.query(`SELECT COUNT(*)::int as count ${where}`, params);
  res.json({ count: parseInt(result.rows[0].count, 10) || 0 });
}));

router.get("/stats", authMiddleware, requireRoles(...COMPLAINTS_ADMIN_ROLES), asyncHandler(async (req, res) => {
  const { clause, params } = getAccountComplaintScope(req.user.role, req.user.id, 1);
  const whereSql = clause ? `WHERE ${clause}` : "";

  const result = await db.query(
    `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE c.status IN ('new', 'pending'))::int AS new,
      COUNT(*) FILTER (WHERE c.status IN ('in_review', 'in_progress'))::int AS in_review,
      COUNT(*) FILTER (WHERE c.status IN ('closed', 'resolved'))::int AS closed,
      COUNT(*) FILTER (WHERE c.status = 'dismissed')::int AS dismissed
    FROM account_complaints c
    ${whereSql}
  `,
    params
  );
  res.json(result.rows[0]);
}));

router.get("/", authMiddleware, requireRoles(...COMPLAINTS_ADMIN_ROLES), asyncHandler(async (req, res) => {
  const { status, complaint_type, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const whereConditions = [];
  const params = [];
  let paramIndex = 1;

  if (status && status !== 'all') {
    whereConditions.push(`c.status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  if (complaint_type && complaint_type !== 'all') {
    whereConditions.push(`c.complaint_type = $${paramIndex}`);
    params.push(complaint_type);
    paramIndex++;
  }

  const scope = getAccountComplaintScope(req.user.role, req.user.id, paramIndex);
  if (scope.clause) {
    whereConditions.push(scope.clause);
    params.push(...scope.params);
    paramIndex += scope.params.length;
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  const result = await db.query(
    `
    SELECT c.*, 
           i.invoice_number, i.total as invoice_total,
           r.amount as refund_amount, r.status as refund_status
    FROM account_complaints c
    LEFT JOIN invoices i ON c.invoice_id = i.id
    LEFT JOIN refunds r ON c.refund_id = r.id
    ${whereClause}
    ORDER BY c.created_at DESC 
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `,
    [...params, parseInt(limit, 10), offset]
  );

  const countResult = await db.query(
    `SELECT COUNT(*)::int as total FROM account_complaints c ${whereClause}`,
    params
  );

  const total = parseInt(countResult.rows[0].total, 10) || 0;

  res.json({
    complaints: result.rows,
    pagination: {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total,
      totalPages: Math.ceil(total / parseInt(limit, 10)) || 0,
    },
  });
}));

router.delete("/:id", authMiddleware, requireRoles("super_admin", "admin"), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "معرف غير صالح" });
  }

  const result = await db.query(
    `DELETE FROM account_complaints WHERE id = $1 RETURNING id`,
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "الشكوى غير موجودة" });
  }

  res.json({ ok: true, deleted: id, message: "تم حذف الشكوى نهائياً" });
}));

router.patch("/:id", authMiddleware, requireRoles(...COMPLAINTS_ADMIN_ROLES), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, adminNote } = req.body;

  const validStatuses = ['new', 'in_review', 'in_progress', 'closed', 'dismissed', 'resolved'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: "حالة غير صحيحة" });
  }

  // Snapshot of pre-update state so we can decide whether to notify the
  // customer (only when admin_note actually changes, or status transitions).
  const before = await db.query(
    `SELECT user_id, admin_note, status, subject FROM account_complaints WHERE id = $1`,
    [id]
  );
  const prev = before.rows[0];

  const sc = getAccountComplaintScope(req.user.role, req.user.id, 4);
  const scopeSql = sc.clause ? ` AND ${sc.clause}` : '';

  const result = await db.query(
    `UPDATE account_complaints c
     SET status = COALESCE($1, status), admin_note = COALESCE($2, admin_note), updated_at = NOW()
     WHERE c.id = $3${scopeSql}
     RETURNING *`,
    [status, adminNote, id, ...sc.params]
  );

  if (result.rows.length === 0) return res.status(404).json({ error: "الشكوى غير موجودة" });

  // Notify the customer when the admin meaningfully updated the complaint —
  // either added/changed a note or moved status to a terminal/active state.
  const noteChanged = typeof adminNote === 'string' && adminNote.trim() && adminNote !== prev?.admin_note;
  const statusChanged = status && prev && status !== prev.status;
  if (prev && prev.user_id && (noteChanged || statusChanged)) {
    const title = noteChanged ? "رد جديد على شكواك" : "تحديث حالة شكواك";
    const body = noteChanged
      ? `تم الرد على شكواك: ${prev.subject || ''}`.trim()
      : `تم تحديث حالة شكواك (${status}): ${prev.subject || ''}`.trim();
    try {
      await db.query(
        `INSERT INTO notifications (user_id, title, body, type, link, created_at)
         VALUES ($1, $2, $3, 'complaint_reply', $4, NOW())`,
        [prev.user_id, title, body, '/my-complaints']
      );
    } catch (e) {
      console.error('[complaints] notification insert failed', e.message);
    }
  }

  // Audit log entries — separate events for status change and note added
  // so the timeline reads naturally.
  if (statusChanged) {
    await logComplaintEvent({
      complaintId: id,
      eventType: 'status_changed',
      actor: { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role },
      fromStatus: prev.status,
      toStatus: status,
    });
  }
  if (noteChanged) {
    await logComplaintEvent({
      complaintId: id,
      eventType: 'note_added',
      actor: { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role },
      note: typeof adminNote === 'string' ? adminNote.trim() : null,
    });
  }

  res.json({ ok: true, complaint: result.rows[0], message: "تم تحديث الشكوى بنجاح" });
}));

/**
 * Transfer a complaint to a different role's queue. The agent picks the
 * destination at triage time — finance for billing/refund, executive for
 * cases that need owner attention, etc. Updates auto_assigned_role,
 * notifies the receiving role, and appends an audit line to admin_note.
 *
 * Body: { target_role: 'finance_admin' | 'admin' | 'super_admin' | 'content_admin' | 'admin_manager', note?: string }
 */
const TRANSFER_TARGETS = {
  finance_admin:   { labelAr: "المالية",       link: "/add-listing/admin/finance-inbox" },
  admin:           { labelAr: "الإدارة العليا", link: "/add-listing/admin/customer-service?tab=complaints" },
  super_admin:     { labelAr: "الإدارة العليا", link: "/add-listing/admin/customer-service?tab=complaints" },
  content_admin:   { labelAr: "فريق المحتوى",   link: "/add-listing/admin/customer-service?tab=complaints" },
  admin_manager:   { labelAr: "مدير الإدارة",   link: "/add-listing/admin/customer-service?tab=complaints" },
};

async function transferComplaintHandler(req, res, fixedTargetRole) {
  const { id } = req.params;
  const { note } = req.body || {};
  const targetRole = fixedTargetRole || (req.body && req.body.target_role);

  if (!TRANSFER_TARGETS[targetRole]) {
    return res.status(400).json({ error: "وجهة التحويل غير صالحة" });
  }
  const cfg = TRANSFER_TARGETS[targetRole];

  // Resilient SELECT — priority column may be missing on envs that haven't
  // picked up migration 20260525000000 yet; fall back to a minimal select.
  let row;
  try {
    const before = await db.query(
      `SELECT id, subject, priority, status, admin_note, user_id FROM account_complaints WHERE id = $1`,
      [id]
    );
    row = before.rows[0];
  } catch (err) {
    if (err && err.code === '42703') {
      const before = await db.query(
        `SELECT id, subject, status, admin_note, user_id FROM account_complaints WHERE id = $1`,
        [id]
      );
      row = before.rows[0];
    } else {
      throw err;
    }
  }
  if (!row) return res.status(404).json({ error: "الشكوى غير موجودة" });
  if (['closed', 'resolved', 'dismissed'].includes(row.status)) {
    return res.status(400).json({ error: "لا يمكن تحويل شكوى مغلقة" });
  }

  // Capture previous assignment so we can log it as from_role on the
  // audit event below.
  let previousRole = null;
  try {
    const prevRow = await db.query(
      `SELECT auto_assigned_role FROM account_complaints WHERE id = $1`,
      [id]
    );
    previousRole = prevRow.rows[0]?.auto_assigned_role || null;
  } catch {}

  const transferLine = `\n— تم التحويل إلى ${cfg.labelAr} بواسطة ${req.user?.name || req.user?.email || 'admin'} (${new Date().toISOString()})${note ? ` — ${note}` : ''}`;
  const newAdminNote = (row.admin_note || '') + transferLine;

  await db.query(
    `UPDATE account_complaints
     SET auto_assigned_role = $1,
         admin_note = $2,
         updated_at = NOW()
     WHERE id = $3`,
    [targetRole, newAdminNote, id]
  );

  await logComplaintEvent({
    complaintId: id,
    eventType: 'transferred',
    actor: { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role },
    fromRole: previousRole,
    toRole: targetRole,
    note: note || null,
  });

  // Notify users in the receiving role. For admin/super_admin we notify both
  // roles (executive escalation = whoever's available at the top).
  try {
    const notifyRoles = targetRole === 'admin' || targetRole === 'super_admin'
      ? ['admin', 'super_admin']
      : [targetRole];
    await db.query(
      `INSERT INTO notifications (user_id, title, body, type, link, created_at)
       SELECT u.id, $1, $2, 'complaint_transferred', $3, NOW()
       FROM users u
       WHERE u.role = ANY($4::text[])
         AND COALESCE(u.is_active, true) = true`,
      [
        `شكوى مُحوّلة إليك (${cfg.labelAr})`,
        `${row.subject || ''} — أولوية: ${row.priority || 'medium'}`,
        cfg.link,
        notifyRoles,
      ]
    );
  } catch (e) {
    console.error('[complaints] transfer notification failed', e.message);
  }

  res.json({ ok: true, target: targetRole, label: cfg.labelAr, message: `تم تحويل الشكوى إلى ${cfg.labelAr}` });
}

// Generic transfer — agent picks destination via body.
router.patch("/:id/transfer", authMiddleware, requireRoles(...COMPLAINTS_ADMIN_ROLES), asyncHandler(async (req, res) => {
  return transferComplaintHandler(req, res, null);
}));

// Backward-compat: keep the old /transfer-to-finance route so any in-flight
// frontend builds don't break.
router.patch("/:id/transfer-to-finance", authMiddleware, requireRoles(...COMPLAINTS_ADMIN_ROLES), asyncHandler(async (req, res) => {
  return transferComplaintHandler(req, res, 'finance_admin');
}));

module.exports = router;
