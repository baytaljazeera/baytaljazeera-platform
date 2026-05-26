// backend/services/auditSafety.js
// Action Safety Layer — every destructive admin action (delete, deactivate,
// role removal, complaint dismissal, ...) must flow through here so we get:
//   1. an immutable admin_audit_logs row with before/after snapshots
//   2. an explicit `reason` captured from the actor
//   3. actor identity snapshot (id + email + role) so later role changes
//      don't rewrite history
//
// Soft-delete helpers below write the deleted_* trio to common tables. They
// never throw — best-effort logging; the caller is expected to have already
// validated authorization.

const db = require("../db");

/**
 * Require a non-empty reason in req.body.reason on destructive routes.
 * Usage:
 *   router.delete('/foo/:id', authMiddleware, requireReason(), async (req,res)=>{...})
 */
function requireReason() {
  return (req, res, next) => {
    const reason = (req.body?.reason ?? '').toString().trim();
    if (!reason || reason.length < 4) {
      return res.status(400).json({
        error: "السبب مطلوب",
        message: "يجب توضيح سبب هذا الإجراء (4 أحرف على الأقل) قبل التنفيذ.",
        field: "reason",
      });
    }
    req.auditReason = reason;
    next();
  };
}

/**
 * Record an immutable audit entry for a destructive operation.
 *
 * @param {object} req — express request (for actor + ip + user_agent)
 * @param {object} opts
 * @param {string} opts.action            — 'DELETE_CUSTOM_ROLE' | 'SOFT_DELETE_CONTRACT' | ...
 * @param {string} opts.resourceType
 * @param {string|number} opts.resourceId
 * @param {object} [opts.before]          — snapshot of row before change
 * @param {object} [opts.after]           — snapshot of row after change
 * @param {string} [opts.reason]          — actor's stated reason (defaults to req.auditReason)
 */
async function recordDestructive(req, opts = {}) {
  const {
    action, resourceType, resourceId,
    before = null, after = null,
    reason = req?.auditReason || null,
  } = opts;

  try {
    await db.query(
      `INSERT INTO admin_audit_logs
         (admin_id, admin_email, action, resource_type, resource_id,
          details, reason, before_snapshot, after_snapshot,
          ip_address, user_agent, created_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9::jsonb,$10,$11,NOW())`,
      [
        req?.user?.id || null,
        req?.user?.email || null,
        action,
        resourceType || null,
        resourceId != null ? String(resourceId) : null,
        JSON.stringify({
          actor_role: req?.user?.role,
          actor_name: req?.user?.name,
        }),
        reason,
        before ? JSON.stringify(before) : null,
        after  ? JSON.stringify(after)  : null,
        req?.ip || req?.headers?.['x-forwarded-for'] || null,
        req?.headers?.['user-agent'] || null,
      ]
    );
    return { ok: true };
  } catch (e) {
    // Schema-ensure may not have run yet on a stale env — try the legacy form.
    if (e && (e.code === '42703' || e.code === '42P01')) {
      try {
        await db.query(
          `INSERT INTO admin_audit_logs
             (admin_id, admin_email, action, resource_type, resource_id, details, ip_address, user_agent, created_at)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,NOW())`,
          [
            req?.user?.id || null,
            req?.user?.email || null,
            action,
            resourceType || null,
            resourceId != null ? String(resourceId) : null,
            JSON.stringify({
              reason, before, after,
              actor_role: req?.user?.role,
              actor_name: req?.user?.name,
            }),
            req?.ip || null,
            req?.headers?.['user-agent'] || null,
          ]
        );
        return { ok: true, degraded: true };
      } catch (e2) {
        console.warn('[auditSafety] legacy insert failed:', e2.message);
        return { ok: false, error: e2.message };
      }
    }
    console.warn('[auditSafety] insert failed:', e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Soft-delete a row by setting deleted_at/deleted_by/deleted_reason. Returns
 * the row snapshot used as `before` for audit, plus boolean success.
 *
 * Caller is expected to have already verified the row exists and the actor
 * is authorized.
 */
async function softDelete(req, { table, idColumn = 'id', id, reason }) {
  // Allow-list the table name — we interpolate it into SQL because PG can't
  // parameterize identifiers. Adding a new soft-deletable table requires
  // editing this list (intentional gate).
  const SOFT_DELETE_TABLES = new Set([
    'custom_roles',
    'employee_contracts',
    'account_complaints',
    'admin_inboxes',
    'admin_nav_links',
    'admin_nav_sections',
    'hr_warnings',
    'hr_attachments',
  ]);
  if (!SOFT_DELETE_TABLES.has(table)) {
    throw new Error(`softDelete: table "${table}" not in allow-list`);
  }
  const finalReason = (reason || req?.auditReason || '').toString().trim();
  if (!finalReason || finalReason.length < 4) {
    throw new Error('softDelete: reason required');
  }

  // Fetch the row first as the `before` snapshot.
  let before = null;
  try {
    const r = await db.query(
      `SELECT * FROM ${table} WHERE ${idColumn} = $1`,
      [id]
    );
    before = r.rows[0] || null;
  } catch (e) {
    console.warn(`[auditSafety.softDelete] could not read ${table}:`, e.message);
  }
  if (!before) return { ok: false, error: 'row not found' };
  if (before.deleted_at) return { ok: true, alreadyDeleted: true, before };

  await db.query(
    `UPDATE ${table}
       SET deleted_at = NOW(),
           deleted_by = $2,
           deleted_reason = $3
     WHERE ${idColumn} = $1`,
    [id, req?.user?.id || null, finalReason]
  );

  await recordDestructive(req, {
    action: `SOFT_DELETE_${table.toUpperCase()}`,
    resourceType: table,
    resourceId: id,
    before,
    after: null,
    reason: finalReason,
  });

  return { ok: true, before };
}

/**
 * Restore a soft-deleted row (undo).
 */
async function softRestore(req, { table, idColumn = 'id', id, reason }) {
  const r = await db.query(`SELECT * FROM ${table} WHERE ${idColumn} = $1`, [id]);
  const before = r.rows[0] || null;
  if (!before) return { ok: false, error: 'row not found' };
  await db.query(
    `UPDATE ${table}
       SET deleted_at = NULL, deleted_by = NULL, deleted_reason = NULL
     WHERE ${idColumn} = $1`,
    [id]
  );
  await recordDestructive(req, {
    action: `RESTORE_${table.toUpperCase()}`,
    resourceType: table,
    resourceId: id,
    before,
    after: { ...before, deleted_at: null, deleted_by: null, deleted_reason: null },
    reason: reason || req?.auditReason || 'restored',
  });
  return { ok: true };
}

module.exports = { requireReason, recordDestructive, softDelete, softRestore };
