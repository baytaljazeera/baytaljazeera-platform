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

  res.json({ user, inboxes, directives, contracts, evaluations, averages });
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
