/**
 * Phase 4 — HR depth routes.
 *
 * GET    /api/hr/employees                 — list every active staff (role <> 'user')
 * GET    /api/hr/employees/:id             — profile + linked data (inboxes, directives, contracts, evaluations)
 * GET    /api/hr/employees/:id/activity    — activity timeline (last_login, last directive received, etc.)
 * GET    /api/hr/contracts                 — all contracts with employee name
 * POST   /api/hr/contracts                 — create
 * GET    /api/hr/evaluations               — all evaluations (admin overview)
 * POST   /api/hr/evaluations               — create
 *
 * All endpoints are gated to super_admin / admin / admin_manager / a user
 * holding the `membership` permission. We don't introduce a new
 * permission key — `membership` already represents "HR powers" in the
 * existing matrix.
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, requireRoles } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');
const notifier = require('../services/notificationService');
const { requireReason, recordDestructive, softDelete } = require('../services/auditSafety');

const HR_ROLES = ['super_admin', 'admin', 'admin_manager'];

// Allow super/admin/admin_manager OR anyone with `membership` permission.
async function hrGate(req, res, next) {
  const role = req.user?.role;
  if (HR_ROLES.includes(role)) return next();
  try {
    const r = await db.query(
      `SELECT 1 FROM role_permissions WHERE role = $1 AND permission_key = 'membership' AND COALESCE(is_granted, true) = true LIMIT 1`,
      [role]
    );
    if (r.rows.length > 0) return next();
  } catch {}
  return res.status(403).json({ error: 'غير مصرح' });
}

/**
 * GET /api/hr/employees — every staff row, with computed activity bucket.
 */
router.get('/employees', authMiddleware, hrGate, asyncHandler(async (req, res) => {
  const role = req.query.role;
  const status = req.query.status;
  const search = (req.query.search || '').trim();

  const conds = [`u.role IS NOT NULL`, `u.role <> 'user'`];
  const params = [];
  let p = 1;
  if (role) { conds.push(`u.role = $${p++}`); params.push(role); }
  if (status) { conds.push(`COALESCE(u.status, 'active') = $${p++}`); params.push(status); }
  if (search) {
    conds.push(`(LOWER(u.name) LIKE $${p} OR LOWER(u.email) LIKE $${p})`);
    params.push(`%${search.toLowerCase()}%`); p++;
  }

  const r = await db.query(
    `SELECT u.id, u.name, u.email, u.phone, u.role,
            COALESCE(u.status, 'active') AS status,
            u.created_at AS joined_at,
            u.last_login_at,
            (SELECT MAX(c.created_at) FROM complaint_events c WHERE c.actor_user_id = u.id) AS last_action_at,
            (SELECT COUNT(*)::int FROM complaint_events c WHERE c.actor_user_id = u.id) AS actions_total,
            (SELECT COUNT(*)::int FROM employee_contracts ec
              WHERE ec.user_id = u.id AND ec.status = 'active') AS active_contracts,
            (SELECT MIN(ec.end_date) FROM employee_contracts ec
              WHERE ec.user_id = u.id AND ec.status = 'active' AND ec.end_date IS NOT NULL) AS soonest_end
     FROM users u
     WHERE ${conds.join(' AND ')}
     ORDER BY u.created_at DESC
     LIMIT 500`,
    params
  );

  // Compute attendance bucket from activity timestamps.
  const now = Date.now();
  const employees = r.rows.map((row) => {
    const lastTs = Math.max(
      row.last_action_at ? new Date(row.last_action_at).getTime() : 0,
      row.last_login_at  ? new Date(row.last_login_at).getTime()  : 0,
    );
    let activity = 'inactive';
    if (lastTs > 0) {
      const hrs = (now - lastTs) / 3_600_000;
      if (hrs < 24) activity = 'today';
      else if (hrs < 24 * 7) activity = 'this_week';
      else if (hrs < 24 * 30) activity = 'this_month';
      else activity = 'inactive';
    }
    return { ...row, activity_bucket: activity };
  });

  res.json({ employees, total: employees.length });
}));

/**
 * GET /api/hr/employees/:id — detail page. Pulls together everything that
 * touches this staff member: user row, contracts, evaluations, the
 * inboxes their role can see, and recent directives/assignments they
 * received.
 */
router.get('/employees/:id', authMiddleware, hrGate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const ur = await db.query(
    `SELECT id, name, email, phone, role, COALESCE(status, 'active') AS status,
            created_at AS joined_at, last_login_at
     FROM users
     WHERE id = $1`,
    [id]
  );
  if (ur.rows.length === 0) return res.status(404).json({ error: 'الموظف غير موجود' });
  const user = ur.rows[0];

  // Inboxes whose required_roles contains this user's role (resilient if
  // admin_inboxes table doesn't exist yet).
  let inboxes = [];
  try {
    const ir = await db.query(
      `SELECT key, title, icon_name, accent_color
       FROM admin_inboxes
       WHERE is_active = true AND required_roles::jsonb ? $1
       ORDER BY sort_order ASC`,
      [user.role]
    );
    inboxes = ir.rows;
  } catch (e) {
    if (!(e && e.code === '42P01')) console.warn('[hr/employee] inbox query failed:', e.message);
  }

  // Recent directives received (either explicit user pick OR fell in a
  // role-routed/everyone fan-out).
  let directives = [];
  try {
    const dr = await db.query(
      `SELECT id, event_type, actor_name_snapshot, actor_role_snapshot,
              target_kind, recipients, note, due_at, assignment_status,
              assignment_priority, created_at
       FROM complaint_events
       WHERE complaint_id IS NOT NULL
         AND event_type IN ('directive', 'assignment', 'internal_note')
         AND (
            target_user_id = $1
            OR (recipients IS NOT NULL AND (
                recipients->'users' @> $2::jsonb
                OR (recipients->>'everyone')::boolean = true
                OR recipients->'roles' @> $3::jsonb
            ))
         )
       ORDER BY created_at DESC
       LIMIT 25`,
      [id, JSON.stringify([{ id: parseInt(id, 10) || id }]), JSON.stringify([{ role: user.role }])]
    );
    directives = dr.rows;
  } catch (e) {
    if (!(e && e.code === '42P01') && !(e && e.code === '42703')) console.warn('[hr/employee] directives query failed:', e.message);
  }

  // Contracts + evaluations
  let contracts = [];
  let evaluations = [];
  try {
    const cr = await db.query(
      `SELECT id, start_date, end_date, status, contract_type, file_path, notes, created_at
       FROM employee_contracts WHERE user_id = $1 ORDER BY start_date DESC`,
      [id]
    );
    contracts = cr.rows;
  } catch (e) {
    if (!(e && e.code === '42P01')) console.warn('[hr/employee] contracts query failed:', e.message);
  }
  try {
    const er = await db.query(
      `SELECT id, evaluator_id, evaluator_name_snapshot, evaluator_role_snapshot,
              response_speed, interaction_quality, commitment, notes, created_at
       FROM employee_evaluations WHERE user_id = $1 ORDER BY created_at DESC`,
      [id]
    );
    evaluations = er.rows;
  } catch (e) {
    if (!(e && e.code === '42P01')) console.warn('[hr/employee] evaluations query failed:', e.message);
  }

  // Average ratings (NULL if no evals)
  let averages = null;
  if (evaluations.length > 0) {
    const sum = { rs: 0, iq: 0, cm: 0, nRs: 0, nIq: 0, nCm: 0 };
    for (const e of evaluations) {
      if (e.response_speed != null)        { sum.rs += e.response_speed; sum.nRs++; }
      if (e.interaction_quality != null)   { sum.iq += e.interaction_quality; sum.nIq++; }
      if (e.commitment != null)            { sum.cm += e.commitment; sum.nCm++; }
    }
    averages = {
      response_speed:      sum.nRs ? +(sum.rs / sum.nRs).toFixed(2) : null,
      interaction_quality: sum.nIq ? +(sum.iq / sum.nIq).toFixed(2) : null,
      commitment:          sum.nCm ? +(sum.cm / sum.nCm).toFixed(2) : null,
    };
  }

  // HR depth — warnings, vacation requests, attachments. Each block is
  // 42P01-tolerant so a stale env without the new tables still returns
  // the basic profile.
  let warnings = [];
  let vacations = [];
  let attachments = [];
  try {
    const wr = await db.query(
      `SELECT id, warning_type, severity, note, issued_by, issued_by_name_snapshot,
              acknowledged_at, created_at
       FROM hr_warnings
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 50`,
      [id]
    );
    warnings = wr.rows;
  } catch (e) {
    if (!(e && e.code === '42P01')) console.warn('[hr/employee] warnings query failed:', e.message);
  }
  try {
    const vr = await db.query(
      `SELECT id, start_date, end_date, day_count, request_type, status,
              reason, decided_by_name_snapshot, decided_at, decision_note, created_at
       FROM hr_vacation_requests
       WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [id]
    );
    vacations = vr.rows;
  } catch (e) {
    if (!(e && e.code === '42P01')) console.warn('[hr/employee] vacations query failed:', e.message);
  }
  try {
    const ar = await db.query(
      `SELECT id, category, file_name, file_path, mime_type,
              uploaded_by_name_snapshot, created_at
       FROM hr_attachments
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 100`,
      [id]
    );
    attachments = ar.rows;
  } catch (e) {
    if (!(e && e.code === '42P01')) console.warn('[hr/employee] attachments query failed:', e.message);
  }

  res.json({ user, inboxes, directives, contracts, evaluations, averages, warnings, vacations, attachments });
}));

/**
 * Warning ledger — issue / list / acknowledge / soft-delete.
 * Soft delete requires `reason` (Action Safety Layer).
 */
router.post('/warnings', authMiddleware, hrGate, asyncHandler(async (req, res) => {
  const { user_id, warning_type, severity, note } = req.body || {};
  if (!user_id || !note) return res.status(400).json({ error: 'الموظف والملاحظة مطلوبان' });
  const validSeverity = ['low', 'medium', 'high'].includes(severity) ? severity : 'low';
  const validType = ['verbal', 'written', 'final'].includes(warning_type) ? warning_type : 'verbal';
  try {
    const r = await db.query(
      `INSERT INTO hr_warnings (user_id, warning_type, severity, note, issued_by, issued_by_name_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [user_id, validType, validSeverity, note.trim(), req.user.id, req.user.name || req.user.email || null]
    );
    // Notify the employee.
    try {
      await notifier.notify({
        userIds: [user_id],
        title: validType === 'final' ? 'تنبيه نهائي من إدارة الموارد البشرية' : 'تنبيه إداري جديد',
        body: note.trim().slice(0, 200),
        link: '/my-account',
        category: 'system',
        type: 'hr_warning',
        priority: validSeverity === 'high' ? 'high' : 'medium',
        sourceType: 'hr_warning',
        sourceId: r.rows[0]?.id || null,
        actor: { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role },
      });
    } catch {}
    res.status(201).json({ warning: r.rows[0] });
  } catch (e) {
    if (e && e.code === '42P01') return res.status(503).json({ error: 'جدول التحذيرات لم يُهيَّأ بعد' });
    throw e;
  }
}));

router.post('/warnings/:id/acknowledge', authMiddleware, asyncHandler(async (req, res) => {
  // Employee acknowledges their own warning (no hrGate required — but it
  // must be the user's own warning).
  const { id } = req.params;
  const r = await db.query('SELECT user_id FROM hr_warnings WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (r.rows.length === 0) return res.status(404).json({ error: 'غير موجود' });
  if (String(r.rows[0].user_id) !== String(req.user.id)) {
    return res.status(403).json({ error: 'غير مصرح' });
  }
  await db.query('UPDATE hr_warnings SET acknowledged_at = NOW() WHERE id = $1', [id]);
  res.json({ ok: true });
}));

router.delete('/warnings/:id', authMiddleware, hrGate, requireReason(), asyncHandler(async (req, res) => {
  const { id } = req.params;
  try {
    const out = await softDelete(req, { table: 'hr_warnings', id });
    if (!out.ok) return res.status(404).json({ error: out.error || 'لم يتم العثور' });
    res.json({ ok: true, message: 'تم حذف التحذير' });
  } catch (e) {
    if (e.message.includes('reason required')) return res.status(400).json({ error: 'السبب مطلوب' });
    throw e;
  }
}));

/**
 * Vacation / leave workflow — employee submits, HR decides.
 *
 * POST    /vacations                — employee creates a request
 * GET     /vacations                — HR list (?status=pending|approved|rejected)
 * PATCH   /vacations/:id/decide     — HR approves/rejects (with note)
 */
router.post('/vacations', authMiddleware, asyncHandler(async (req, res) => {
  const { start_date, end_date, request_type, reason } = req.body || {};
  if (!start_date || !end_date) return res.status(400).json({ error: 'تواريخ البداية والنهاية مطلوبة' });
  const validType = ['annual', 'sick', 'emergency', 'unpaid', 'other'].includes(request_type) ? request_type : 'annual';
  // day_count = end-start+1 if both valid
  let days = null;
  try {
    const a = new Date(start_date); const b = new Date(end_date);
    days = Math.max(1, Math.round((b - a) / 86400000) + 1);
  } catch {}
  try {
    const r = await db.query(
      `INSERT INTO hr_vacation_requests (user_id, start_date, end_date, day_count, request_type, reason)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.id, start_date, end_date, days, validType, reason || null]
    );
    // Notify HR roles.
    try {
      await notifier.notifyRoles({
        roles: HR_ROLES,
        title: 'طلب إجازة جديد',
        body: `${req.user.name || req.user.email} — ${validType} (${days || ''} يوم)`,
        link: '/add-listing/admin/hr',
        category: 'system',
        type: 'hr_vacation_request',
        priority: 'medium',
        sourceType: 'hr_vacation',
        sourceId: r.rows[0]?.id || null,
        actor: { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role },
      });
    } catch {}
    res.status(201).json({ vacation: r.rows[0] });
  } catch (e) {
    if (e && e.code === '42P01') return res.status(503).json({ error: 'جدول الإجازات لم يُهيَّأ بعد' });
    throw e;
  }
}));

router.get('/vacations', authMiddleware, hrGate, asyncHandler(async (req, res) => {
  const status = req.query.status;
  const params = [];
  let where = '';
  if (status) { params.push(status); where = `WHERE v.status = $${params.length}`; }
  try {
    const r = await db.query(
      `SELECT v.*, u.name AS employee_name, u.email AS employee_email, u.role AS employee_role
       FROM hr_vacation_requests v
       LEFT JOIN users u ON u.id = v.user_id
       ${where}
       ORDER BY (v.status = 'pending') DESC, v.created_at DESC
       LIMIT 200`,
      params
    );
    res.json({ vacations: r.rows });
  } catch (e) {
    if (e && e.code === '42P01') return res.json({ vacations: [] });
    throw e;
  }
}));

router.get('/vacations/mine', authMiddleware, asyncHandler(async (req, res) => {
  try {
    const r = await db.query(
      `SELECT * FROM hr_vacation_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ vacations: r.rows });
  } catch (e) {
    if (e && e.code === '42P01') return res.json({ vacations: [] });
    throw e;
  }
}));

router.patch('/vacations/:id/decide', authMiddleware, hrGate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { decision, note } = req.body || {};
  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: 'القرار يجب أن يكون approved أو rejected' });
  }
  const before = await db.query('SELECT * FROM hr_vacation_requests WHERE id = $1', [id]);
  if (before.rows.length === 0) return res.status(404).json({ error: 'الطلب غير موجود' });
  if (before.rows[0].status !== 'pending') {
    return res.status(409).json({ error: 'تم البت في الطلب مسبقاً' });
  }
  const r = await db.query(
    `UPDATE hr_vacation_requests
       SET status = $1, decided_by = $2, decided_by_name_snapshot = $3,
           decided_at = NOW(), decision_note = $4, updated_at = NOW()
     WHERE id = $5 RETURNING *`,
    [decision, req.user.id, req.user.name || req.user.email || null, note || null, id]
  );
  // Notify the employee of the decision.
  try {
    await notifier.notify({
      userIds: [r.rows[0].user_id],
      title: decision === 'approved' ? 'تمت الموافقة على طلب إجازتك' : 'تم رفض طلب إجازتك',
      body: note || (decision === 'approved' ? 'وافقت إدارة الموارد البشرية على طلبك.' : 'يرجى التواصل مع إدارة الموارد البشرية.'),
      link: '/my-account',
      category: 'system',
      type: 'hr_vacation_decision',
      priority: decision === 'approved' ? 'medium' : 'high',
      sourceType: 'hr_vacation',
      sourceId: id,
      actor: { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role },
    });
  } catch {}
  await recordDestructive(req, {
    action: `DECIDE_VACATION_${decision.toUpperCase()}`,
    resourceType: 'hr_vacation_requests',
    resourceId: id,
    before: before.rows[0],
    after: r.rows[0],
    reason: note || decision,
  });
  res.json({ vacation: r.rows[0] });
}));

/**
 * Contract renewal alerts — endpoints the dashboard uses to flag contracts
 * expiring within N days.
 */
router.get('/contracts/expiring', authMiddleware, hrGate, asyncHandler(async (req, res) => {
  const days = Math.max(1, Math.min(180, parseInt(req.query.days, 10) || 30));
  try {
    const r = await db.query(
      `SELECT c.id, c.user_id, c.start_date, c.end_date, c.contract_type, c.status,
              u.name AS employee_name, u.email AS employee_email, u.role AS employee_role,
              (c.end_date - CURRENT_DATE)::int AS days_remaining
       FROM employee_contracts c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.status = 'active'
         AND c.end_date IS NOT NULL
         AND c.end_date <= CURRENT_DATE + ($1 || ' days')::interval
         AND COALESCE(c.deleted_at, NULL) IS NULL
       ORDER BY c.end_date ASC`,
      [String(days)]
    );
    res.json({ contracts: r.rows, window_days: days });
  } catch (e) {
    if (e && e.code === '42P01') return res.json({ contracts: [], window_days: days });
    throw e;
  }
}));

router.delete('/contracts/:id', authMiddleware, hrGate, requireReason(), asyncHandler(async (req, res) => {
  const { id } = req.params;
  try {
    const out = await softDelete(req, { table: 'employee_contracts', id });
    if (!out.ok) return res.status(404).json({ error: out.error || 'لم يتم العثور' });
    res.json({ ok: true, message: 'تم إنهاء العقد' });
  } catch (e) {
    if (e.message.includes('reason required')) return res.status(400).json({ error: 'السبب مطلوب' });
    throw e;
  }
}));

/**
 * Attachments — per-employee file references categorized by type
 * (id, contract, certification, evaluation_doc, general).
 *
 * The file itself is uploaded via the existing upload pipeline; this
 * endpoint just records the reference.
 */
router.post('/attachments', authMiddleware, hrGate, asyncHandler(async (req, res) => {
  const { user_id, category, file_name, file_path, mime_type } = req.body || {};
  if (!user_id || !file_name) return res.status(400).json({ error: 'الموظف واسم الملف مطلوبان' });
  const validCat = ['id', 'contract', 'certification', 'evaluation_doc', 'general'].includes(category) ? category : 'general';
  try {
    const r = await db.query(
      `INSERT INTO hr_attachments (user_id, category, file_name, file_path, mime_type, uploaded_by, uploaded_by_name_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [user_id, validCat, file_name, file_path || null, mime_type || null, req.user.id, req.user.name || req.user.email || null]
    );
    res.status(201).json({ attachment: r.rows[0] });
  } catch (e) {
    if (e && e.code === '42P01') return res.status(503).json({ error: 'جدول المرفقات لم يُهيَّأ بعد' });
    throw e;
  }
}));

router.delete('/attachments/:id', authMiddleware, hrGate, requireReason(), asyncHandler(async (req, res) => {
  const { id } = req.params;
  try {
    const out = await softDelete(req, { table: 'hr_attachments', id });
    if (!out.ok) return res.status(404).json({ error: out.error || 'لم يتم العثور' });
    res.json({ ok: true, message: 'تم حذف المرفق' });
  } catch (e) {
    if (e.message.includes('reason required')) return res.status(400).json({ error: 'السبب مطلوب' });
    throw e;
  }
}));

/**
 * Dashboard widget — HR overview counters (used by /admin/dashboard exec view).
 */
router.get('/overview', authMiddleware, hrGate, asyncHandler(async (req, res) => {
  const out = {
    employees_total: 0,
    employees_active: 0,
    contracts_active: 0,
    contracts_expiring_30d: 0,
    vacations_pending: 0,
    warnings_open: 0,
  };
  try {
    const r = await db.query(`SELECT
      (SELECT COUNT(*)::int FROM users WHERE role IS NOT NULL AND role <> 'user') AS employees_total,
      (SELECT COUNT(*)::int FROM users WHERE role IS NOT NULL AND role <> 'user' AND COALESCE(is_active, true) = true) AS employees_active`);
    Object.assign(out, r.rows[0]);
  } catch {}
  try {
    const r = await db.query(`SELECT
      (SELECT COUNT(*)::int FROM employee_contracts WHERE status='active' AND COALESCE(deleted_at, NULL) IS NULL) AS contracts_active,
      (SELECT COUNT(*)::int FROM employee_contracts WHERE status='active' AND end_date IS NOT NULL AND end_date <= CURRENT_DATE + INTERVAL '30 days') AS contracts_expiring_30d`);
    Object.assign(out, r.rows[0]);
  } catch {}
  try {
    const r = await db.query(`SELECT COUNT(*)::int AS n FROM hr_vacation_requests WHERE status='pending'`);
    out.vacations_pending = r.rows[0]?.n || 0;
  } catch {}
  try {
    const r = await db.query(`SELECT COUNT(*)::int AS n FROM hr_warnings WHERE deleted_at IS NULL AND acknowledged_at IS NULL`);
    out.warnings_open = r.rows[0]?.n || 0;
  } catch {}
  res.json(out);
}));

/**
 * POST /api/hr/contracts — create a contract row for a staff member.
 */
router.post('/contracts', authMiddleware, hrGate, asyncHandler(async (req, res) => {
  const { user_id, start_date, end_date, status, contract_type, file_path, notes } = req.body || {};
  if (!user_id || !start_date) return res.status(400).json({ error: 'الموظف وتاريخ البداية مطلوبان' });
  try {
    const r = await db.query(
      `INSERT INTO employee_contracts
         (user_id, start_date, end_date, status, contract_type, file_path, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [user_id, start_date, end_date || null, status || 'active', contract_type || null, file_path || null, notes || null, req.user.id]
    );
    res.status(201).json({ contract: r.rows[0] });
  } catch (e) {
    if (e && e.code === '42P01') return res.status(503).json({ error: 'جدول العقود لم يُهيَّأ بعد' });
    throw e;
  }
}));

/**
 * GET /api/hr/contracts — list all contracts (with employee name joined).
 */
router.get('/contracts', authMiddleware, hrGate, asyncHandler(async (req, res) => {
  try {
    const r = await db.query(
      `SELECT c.*, u.name AS employee_name, u.email AS employee_email, u.role AS employee_role
       FROM employee_contracts c
       LEFT JOIN users u ON u.id = c.user_id
       ORDER BY c.end_date NULLS LAST, c.start_date DESC
       LIMIT 200`
    );
    res.json({ contracts: r.rows });
  } catch (e) {
    if (e && e.code === '42P01') return res.json({ contracts: [] });
    throw e;
  }
}));

/**
 * POST /api/hr/evaluations — record an evaluation.
 */
router.post('/evaluations', authMiddleware, hrGate, asyncHandler(async (req, res) => {
  const { user_id, response_speed, interaction_quality, commitment, notes } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'الموظف مطلوب' });
  // Clamp 1..5 or null
  const clamp = (v) => {
    if (v == null) return null;
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) return null;
    return Math.max(1, Math.min(5, n));
  };
  try {
    const r = await db.query(
      `INSERT INTO employee_evaluations
         (user_id, evaluator_id, evaluator_name_snapshot, evaluator_role_snapshot,
          response_speed, interaction_quality, commitment, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [user_id, req.user.id, req.user.name || null, req.user.role || null,
       clamp(response_speed), clamp(interaction_quality), clamp(commitment), notes || null]
    );
    res.status(201).json({ evaluation: r.rows[0] });
  } catch (e) {
    if (e && e.code === '42P01') return res.status(503).json({ error: 'جدول التقييمات لم يُهيَّأ بعد' });
    throw e;
  }
}));

module.exports = router;
