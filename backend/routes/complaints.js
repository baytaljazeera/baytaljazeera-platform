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
  // Explicit-routing fields (only set for directive events)
  targetKind = null, targetUserId = null, targetRole = null,
  targetName = null, targetEmail = null,
  dueAt = null, assignmentPriority = null, assignmentStatus = null,
  // Multi-recipient routing — JSONB { users:[], roles:[], everyone:bool }
  recipients = null,
}) {
  // Try the fullest insert first. Each fallback drops the columns added in
  // the latest migration so the route keeps working through rollouts.
  const fullSql = `INSERT INTO complaint_events
       (complaint_id, event_type,
        actor_user_id, actor_name_snapshot, actor_email_snapshot, actor_role_snapshot,
        from_role, to_role, from_status, to_status, note, visibility,
        target_kind, target_user_id, target_role,
        target_name_snapshot, target_email_snapshot,
        due_at, assignment_priority, assignment_status, recipients, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb,NOW())`;
  const fullParams = [
    complaintId, eventType,
    actor?.id || null, actor?.name || null, actor?.email || null, actor?.role || null,
    fromRole || null, toRole || null, fromStatus || null, toStatus || null,
    note || null, visibility,
    targetKind, targetUserId, targetRole,
    targetName, targetEmail,
    dueAt, assignmentPriority, assignmentStatus,
    recipients ? JSON.stringify(recipients) : null,
  ];
  try {
    await db.query(fullSql, fullParams);
    return;
  } catch (err) {
    if (!(err && err.code === '42703')) {
      console.warn('[complaint_events] insert failed:', err.code || err.message);
      return;
    }
    // Fall through to legacy shapes.
  }
  // Fallback A — drop the routing fields, keep visibility.
  try {
    await db.query(
      `INSERT INTO complaint_events
         (complaint_id, event_type,
          actor_user_id, actor_name_snapshot, actor_email_snapshot, actor_role_snapshot,
          from_role, to_role, from_status, to_status, note, visibility, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())`,
      [complaintId, eventType,
       actor?.id || null, actor?.name || null, actor?.email || null, actor?.role || null,
       fromRole || null, toRole || null, fromStatus || null, toStatus || null,
       note || null, visibility]
    );
    return;
  } catch (errA) {
    if (!(errA && errA.code === '42703')) {
      console.warn('[complaint_events] fallback A failed:', errA.code || errA.message);
      return;
    }
  }
  // Fallback B — drop visibility too.
  try {
    await db.query(
      `INSERT INTO complaint_events
         (complaint_id, event_type,
          actor_user_id, actor_name_snapshot, actor_email_snapshot, actor_role_snapshot,
          from_role, to_role, from_status, to_status, note, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
      [complaintId, eventType,
       actor?.id || null, actor?.name || null, actor?.email || null, actor?.role || null,
       fromRole || null, toRole || null, fromStatus || null, toStatus || null, note || null]
    );
  } catch (errB) {
    console.warn('[complaint_events] fallback B failed:', errB.code || errB.message);
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

// Map the Arabic department label that ended up in admin_note's "تم التحويل
// إلى ..." line back to the role key the rest of the system uses. Used by
// the synthesizer to backfill transfer events that pre-date the audit log.
function labelToRole(label) {
  const t = String(label || "");
  if (/المالية|مالي/.test(t)) return "finance_admin";
  if (/المحتوى|محتوى/.test(t)) return "content_admin";
  if (/مدير الإدارة|إدارة/.test(t) && !/العليا/.test(t)) return "admin_manager";
  if (/الإدارة العليا|عليا/.test(t)) return "admin";
  return null;
}

/**
 * Synthesize a minimum viable timeline for a complaint from its row data +
 * admin_note text — so older complaints created before the audit log was
 * deployed still show a meaningful history instead of "لا توجد أحداث مسجلة".
 *
 * Always emits a "created" pseudo-event. Parses each "تم التحويل إلى ..."
 * line out of admin_note into a "transferred" pseudo-event. Both are tagged
 * `_synthesized=true` so the UI can render them with a softer treatment if
 * desired, and are marked visibility=internal so customers never see them.
 */
function synthesizeEventsFromRow(row, realEvents) {
  if (!row) return [];
  const out = [];

  // Always synthesize a "created" event if no real one exists.
  const hasCreated = realEvents.some(e => e.event_type === 'created');
  if (!hasCreated) {
    const parts = [];
    if (row.priority) parts.push(`أولوية: ${row.priority}`);
    if (row.complaint_type || row.category) parts.push(`نوع: ${row.complaint_type || row.category}`);
    if (row.invoice_id) parts.push(`فاتورة #${row.invoice_id}`);
    out.push({
      id: `synth-created-${row.id}`,
      event_type: 'created',
      actor_user_id: row.user_id || null,
      actor_name_snapshot: row.user_name || null,
      actor_email_snapshot: row.user_email || null,
      actor_role_snapshot: 'user',
      from_role: null,
      to_role: 'content_admin',
      from_status: null,
      to_status: 'new',
      note: parts.join(' · ') || null,
      visibility: 'internal',
      created_at: row.created_at,
      _synthesized: true,
    });
  }

  // Parse legacy transfer lines out of admin_note. Format the transfer
  // endpoint writes is:
  //   "— تم التحويل إلى ${labelAr} بواسطة ${actor} (${ISO})[ — ${note}]"
  if (row.admin_note) {
    const lines = row.admin_note.split('\n').filter(l => l.includes('تم التحويل'));
    const realTransferTimes = realEvents
      .filter(e => e.event_type === 'transferred')
      .map(e => new Date(e.created_at).getTime());
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/تم التحويل إلى\s+([^\s]+(?:\s+[^\s]+)?)\s+بواسطة\s+(.+?)\s+\(([^)]+)\)(?:\s*—\s*(.*))?$/);
      if (!m) continue;
      const [, toLabel, actorName, iso, note] = m;
      const t = Date.parse(iso);
      // Dedupe against real events that occurred within 60s of the parsed time.
      if (realTransferTimes.some(rt => Math.abs(rt - t) < 60_000)) continue;
      out.push({
        id: `synth-transfer-${row.id}-${i}`,
        event_type: 'transferred',
        actor_user_id: null,
        actor_name_snapshot: actorName.trim(),
        actor_email_snapshot: null,
        actor_role_snapshot: null,
        from_role: null,
        to_role: labelToRole(toLabel),
        from_status: null,
        to_status: null,
        note: (note || '').trim() || null,
        visibility: 'internal',
        created_at: iso,
        _synthesized: true,
      });
    }
  }

  return out;
}

/**
 * GET the audit timeline for a complaint.
 *   Staff (any COMPLAINTS_ADMIN_ROLES): see real events + synthesized
 *     fallback events derived from the row data so older complaints don't
 *     show an empty timeline.
 *   Customer (role=user): see only their own complaint AND only events
 *     marked visibility=customer_visible. Synthesized events (all internal)
 *     are filtered out.
 */
router.get("/:id/events", authMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const role = req.user?.role;
  const isStaff = COMPLAINTS_ADMIN_ROLES.includes(role);

  // Fetch the complaint row up-front — we need it for ownership check AND
  // for synthesizing missing events.
  const rowR = await db.query(
    `SELECT id, user_id, user_name, user_email, subject, category, complaint_type,
            priority, status, admin_note, auto_assigned_role, invoice_id, created_at
     FROM account_complaints WHERE id = $1`,
    [id]
  );
  if (rowR.rows.length === 0) return res.status(404).json({ error: 'الشكوى غير موجودة' });
  const row = rowR.rows[0];

  if (!isStaff) {
    if (row.user_id !== req.user.id) return res.status(403).json({ error: 'غير مصرح' });
  }

  // Pull the real audit events — fall back gracefully if the table or the
  // visibility column doesn't exist yet.
  let realEvents = [];
  try {
    const r = await db.query(
      `SELECT id, event_type,
              actor_user_id, actor_name_snapshot, actor_email_snapshot, actor_role_snapshot,
              from_role, to_role, from_status, to_status, note, visibility,
              target_kind, target_user_id, target_role,
              target_name_snapshot, target_email_snapshot,
              due_at, assignment_priority, assignment_status, read_at,
              recipients,
              created_at
       FROM complaint_events
       WHERE complaint_id = $1
       ORDER BY created_at ASC, id ASC`,
      [id]
    );
    realEvents = r.rows;
  } catch (err) {
    if (err && err.code === '42P01') {
      realEvents = [];
    } else if (err && err.code === '42703') {
      // visibility column missing — re-read without it
      const r = await db.query(
        `SELECT id, event_type,
                actor_user_id, actor_name_snapshot, actor_email_snapshot, actor_role_snapshot,
                from_role, to_role, from_status, to_status, note, created_at
         FROM complaint_events
         WHERE complaint_id = $1
         ORDER BY created_at ASC, id ASC`,
        [id]
      );
      realEvents = r.rows.map(r => ({ ...r, visibility: 'internal' }));
    } else {
      throw err;
    }
  }

  // Synthesize anything that's missing from the real log (always includes
  // the "created" event; backfills transferred events from admin_note).
  const synthesized = synthesizeEventsFromRow(row, realEvents);

  // Merge + sort ascending by time.
  const merged = [...realEvents, ...synthesized];
  merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // Customer-facing view: drop everything that isn't customer_visible AND
  // strip the actor-email field on what remains.
  if (!isStaff) {
    const visible = merged.filter(e => e.visibility === 'customer_visible');
    return res.json({
      events: visible.map(e => ({
        id: e.id,
        event_type: e.event_type,
        actor_name_snapshot: e.actor_name_snapshot,
        actor_role_snapshot: e.actor_role_snapshot,
        from_status: e.from_status,
        to_status: e.to_status,
        note: e.note,
        visibility: e.visibility,
        created_at: e.created_at,
      })),
    });
  }

  res.json({ events: merged });
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

/**
 * Staff directory used to populate the "توجيه لموظف" picker. Returns just
 * the fields we need for the picker — id, name, email, role — for every
 * active staff member (anyone whose role isn't 'user').
 */
router.get("/_/staff", authMiddleware, requireRoles(...COMPLAINTS_ADMIN_ROLES), asyncHandler(async (req, res) => {
  const r = await db.query(
    `SELECT id, name, email, role
     FROM users
     WHERE role IS NOT NULL AND role <> 'user'
       AND COALESCE(is_active, true) = true
     ORDER BY role, name NULLS LAST`
  );
  res.json({ staff: r.rows });
}));

/**
 * Multi-recipient explicit-routing directive on a complaint.
 *
 *   kind='note'        — general internal note. No notification.
 *   kind='department'  — fans out to selected role queues. Notifies every
 *                        active user in those roles.
 *   kind='user'        — sent to selected user(s). Notifies them only.
 *   kind='assignment'  — formal assignment to selected user(s) with due
 *                        date + priority. Shared assignment when more
 *                        than one assignee.
 *
 * Body shape:
 *   {
 *     kind: 'note'|'department'|'user'|'assignment',
 *     message: string,
 *     recipients: {
 *       user_ids: number[],          // explicit user picks
 *       roles: string[],             // whole-department picks
 *       everyone: boolean            // fan out to every active staff
 *     },
 *     due_at?: ISO string,            // assignments only
 *     priority?: 'low'|'medium'|'high'|'urgent'   // assignments only
 *   }
 *
 * Legacy single-target body (target_role / target_user_id) is still
 * accepted as a fallback so older clients keep working through rollout.
 */
const ALLOWED_TARGET_ROLES = ['support_admin', 'finance_admin', 'content_admin', 'admin_manager', 'admin', 'super_admin'];

router.post("/:id/directive", authMiddleware, requireRoles(...COMPLAINTS_ADMIN_ROLES), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { kind, message, recipients, due_at, priority,
          target_role: legacyTargetRole, target_user_id: legacyTargetUserId } = req.body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: "نص الرسالة مطلوب" });
  }
  if (!['note', 'department', 'user', 'assignment'].includes(kind)) {
    return res.status(400).json({ error: "نوع التوجيه غير صالح" });
  }

  const lookup = await db.query(`SELECT id, subject FROM account_complaints WHERE id = $1`, [id]);
  if (lookup.rows.length === 0) return res.status(404).json({ error: "الشكوى غير موجودة" });
  const subject = lookup.rows[0].subject || '';

  // Normalize recipients — accept both the new shape and the legacy single-
  // target shape from older clients.
  const rcpUserIds   = Array.isArray(recipients?.user_ids) ? recipients.user_ids.filter(Number.isFinite) : [];
  const rcpRoles     = Array.isArray(recipients?.roles) ? recipients.roles.filter(r => ALLOWED_TARGET_ROLES.includes(r)) : [];
  const rcpEveryone  = !!recipients?.everyone;
  if (legacyTargetRole && ALLOWED_TARGET_ROLES.includes(legacyTargetRole) && !rcpRoles.includes(legacyTargetRole)) {
    rcpRoles.push(legacyTargetRole);
  }
  if (legacyTargetUserId && !rcpUserIds.includes(Number(legacyTargetUserId))) {
    rcpUserIds.push(Number(legacyTargetUserId));
  }

  // Sanity per kind.
  if (kind === 'department' && rcpRoles.length === 0 && !rcpEveryone) {
    return res.status(400).json({ error: "اختر قسماً واحداً على الأقل" });
  }
  if ((kind === 'user' || kind === 'assignment') && rcpUserIds.length === 0 && !rcpEveryone && rcpRoles.length === 0) {
    return res.status(400).json({ error: "اختر مستلماً واحداً على الأقل" });
  }

  // Resolve user snapshots (name/email/role at send time) for explicit picks.
  let userRecipients = [];
  if (rcpUserIds.length > 0) {
    const r = await db.query(
      `SELECT id, name, email, role
       FROM users
       WHERE id = ANY($1::bigint[]) AND COALESCE(is_active, true) = true AND role <> 'user'`,
      [rcpUserIds]
    );
    userRecipients = r.rows;
  }

  // Member-count snapshot for each chosen role (so the timeline can show
  // "فريق المالية (4 أعضاء)" without an extra query at render time).
  let roleSnapshots = [];
  if (rcpRoles.length > 0) {
    const r = await db.query(
      `SELECT role, COUNT(*)::int AS member_count
       FROM users
       WHERE role = ANY($1::text[]) AND COALESCE(is_active, true) = true
       GROUP BY role`,
      [rcpRoles]
    );
    roleSnapshots = r.rows;
  }

  // Resolve the final notification recipient set — every user we'll insert
  // a notification row for. Deduped across user picks + role expansion +
  // everyone. Excludes role='user' (customers).
  let everyoneSnapshot = null;
  let notifyUserIds = new Set(userRecipients.map(u => u.id));
  if (rcpEveryone) {
    const r = await db.query(
      `SELECT id FROM users WHERE role IS NOT NULL AND role <> 'user' AND COALESCE(is_active, true) = true`
    );
    for (const row of r.rows) notifyUserIds.add(row.id);
    everyoneSnapshot = { count: r.rows.length };
  } else if (rcpRoles.length > 0) {
    const r = await db.query(
      `SELECT id FROM users WHERE role = ANY($1::text[]) AND COALESCE(is_active, true) = true`,
      [rcpRoles]
    );
    for (const row of r.rows) notifyUserIds.add(row.id);
  }
  // Sender doesn't need to notify themselves.
  notifyUserIds.delete(req.user.id);

  // Validate assignment-specific fields.
  let validDueAt = null;
  let validPriority = null;
  let assignmentStatus = null;
  if (kind === 'assignment') {
    assignmentStatus = 'pending';
    if (due_at) {
      const d = new Date(due_at);
      if (!Number.isNaN(d.getTime())) validDueAt = d.toISOString();
    }
    validPriority = ['low', 'medium', 'high', 'urgent'].includes(priority) ? priority : 'medium';
  }

  const recipientsJson = {
    users: userRecipients.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role })),
    roles: roleSnapshots,
    everyone: rcpEveryone,
  };

  const eventType =
    kind === 'note' ? 'internal_note' :
    kind === 'assignment' ? 'assignment' : 'directive';

  // For single-recipient legacy compat: if exactly one user OR one role,
  // also stuff the legacy single-target columns.
  const oneUser = userRecipients.length === 1 && roleSnapshots.length === 0 && !rcpEveryone ? userRecipients[0] : null;
  const oneRole = roleSnapshots.length === 1 && userRecipients.length === 0 && !rcpEveryone ? roleSnapshots[0].role : null;

  await logComplaintEvent({
    complaintId: id,
    eventType,
    actor: { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role },
    note: message.trim(),
    visibility: 'internal',
    targetKind: kind,
    targetUserId: oneUser?.id || null,
    targetRole: oneRole,
    targetName: oneUser?.name || null,
    targetEmail: oneUser?.email || null,
    dueAt: validDueAt,
    assignmentPriority: validPriority,
    assignmentStatus,
    recipients: recipientsJson,
  });

  // Fan out notifications.
  try {
    const title = kind === 'assignment' ? "تكليف رسمي على شكوى"
      : (kind === 'user' || kind === 'department') ? "توجيه على شكوى"
      : null; // 'note' is silent

    if (title && notifyUserIds.size > 0) {
      const body = `${subject} — ${kind === 'assignment' && validPriority ? `أولوية: ${validPriority} · ` : ''}${message.trim().slice(0, 80)}`;
      const link = '/add-listing/admin/customer-service?tab=complaints';
      const idArr = Array.from(notifyUserIds);
      await db.query(
        `INSERT INTO notifications (user_id, title, body, type, link, created_at)
         SELECT UNNEST($1::bigint[]), $2, $3, 'complaint_directive', $4, NOW()`,
        [idArr, title, body, link]
      );
    }
  } catch (e) {
    console.warn('[complaints] directive notification failed', e.message);
  }

  res.json({
    ok: true,
    kind,
    recipients: recipientsJson,
    everyone_snapshot: everyoneSnapshot,
    notified_count: notifyUserIds.size,
    message:
      kind === 'note' ? "تم حفظ الملاحظة الداخلية" :
      kind === 'department' ? `تم إرسال التوجيه إلى ${notifyUserIds.size} مستلم` :
      kind === 'user' ? `تم إرسال التوجيه إلى ${notifyUserIds.size} مستلم` :
      `تم إنشاء التكليف لـ ${notifyUserIds.size} مستلم`,
  });
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
