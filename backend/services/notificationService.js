// backend/services/notificationService.js
// Centralized writer for the structured `notifications` table.
//
// Every directive, transfer, escalation, assignment, or mention should flow
// through here instead of doing a raw INSERT in route code — that way the
// notification center (admin UI) can group, filter, and badge-count by
// category/priority/source consistently.
//
// All inserts are best-effort: failures are logged but don't propagate, so a
// missing column on an older deploy never breaks the originating action.

const db = require("../db");

const CATEGORIES = new Set([
  'directive',       // explicit-routing directive on a complaint
  'transfer',        // complaint transferred to another role/user
  'assignment',      // formal assignment (with due date, priority)
  'escalation',      // SLA breach / executive escalation
  'mention',         // someone tagged the user in a note
  'reply',           // customer-facing reply on complaint/ticket
  'complaint',       // new complaint landed for a role's queue
  'system',          // schema migrations, plan changes, etc.
]);

const PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);

function normalizeCategory(c) {
  if (!c) return null;
  return CATEGORIES.has(c) ? c : null;
}

function normalizePriority(p) {
  if (!p) return 'medium';
  return PRIORITIES.has(p) ? p : 'medium';
}

/**
 * Insert one notification per user. Tries the structured form first; falls
 * back to the legacy minimal form on undefined_column so older DBs still work.
 *
 * @param {object} opts
 * @param {Array<string|number>} opts.userIds — recipients (de-dup'd)
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {string} [opts.type]       — legacy `type` column (used by old UI)
 * @param {string} [opts.link]       — relative URL the user should land on
 * @param {string} [opts.category]   — directive | transfer | assignment | ...
 * @param {string} [opts.priority]   — low | medium | high | urgent
 * @param {string} [opts.sourceType] — 'complaint' | 'ticket' | 'employee' | ...
 * @param {number|string} [opts.sourceId]
 * @param {object} [opts.actor]      — { id, name, email, role } of the actor
 */
async function notify(opts) {
  const {
    userIds, title, body,
    type = 'system',
    link = null,
    category = null,
    priority = 'medium',
    sourceType = null,
    sourceId = null,
    actor = null,
  } = opts || {};

  if (!Array.isArray(userIds) || userIds.length === 0) return { sent: 0 };
  if (!title) return { sent: 0 };

  const cat = normalizeCategory(category);
  const pri = normalizePriority(priority);
  const ids = Array.from(new Set(userIds.filter(Boolean)));

  // Detect numeric vs uuid users.id by inspecting first id. The codebase has
  // some tables with BIGINT user ids and others with UUID — we let Postgres
  // figure it out by passing text[] and casting in SQL.
  try {
    await db.query(
      `INSERT INTO notifications
         (user_id, title, body, type, link, category, priority,
          source_type, source_id, actor_user_id, actor_name_snapshot, created_at)
       SELECT u.id, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW()
       FROM users u
       WHERE u.id::text = ANY($1::text[])`,
      [
        ids.map(String),
        title, body, type, link,
        cat, pri,
        sourceType, sourceId,
        actor?.id || null,
        actor?.name || actor?.email || null,
      ]
    );
    return { sent: ids.length };
  } catch (e) {
    // Older DB (missing new columns) — fall back to minimal insert so the
    // action still completes. Schema-ensure on next boot fixes it.
    if (e && (e.code === '42703' /* undefined_column */ || e.code === '42P01' /* relation */)) {
      try {
        await db.query(
          `INSERT INTO notifications (user_id, title, body, type, link, created_at)
           SELECT u.id, $2, $3, $4, $5, NOW()
           FROM users u WHERE u.id::text = ANY($1::text[])`,
          [ids.map(String), title, body, type, link]
        );
        return { sent: ids.length, degraded: true };
      } catch (e2) {
        console.warn('[notificationService] fallback insert failed:', e2.message);
        return { sent: 0, error: e2.message };
      }
    }
    console.warn('[notificationService] insert failed:', e.message);
    return { sent: 0, error: e.message };
  }
}

/**
 * Notify every active staff member with one of the given roles.
 */
async function notifyRoles(opts) {
  const { roles, title, body } = opts || {};
  if (!Array.isArray(roles) || roles.length === 0) return { sent: 0 };
  if (!title) return { sent: 0 };

  const r = await db.query(
    `SELECT id FROM users
     WHERE role = ANY($1::text[]) AND COALESCE(is_active, true) = true`,
    [roles]
  );
  if (r.rows.length === 0) return { sent: 0 };
  return notify({ ...opts, userIds: r.rows.map(x => x.id) });
}

/**
 * Convenience helpers. Each automatically dispatches to notifyRoles vs
 * notify(userIds) depending on which the caller passed.
 */
function categorized(category, type, defaults = {}) {
  return (o) => {
    const merged = { ...defaults, ...o, category, type };
    if (Array.isArray(merged.roles) && merged.roles.length) return notifyRoles(merged);
    return notify(merged);
  };
}
const directive  = categorized('directive',  'complaint_directive');
const transfer   = categorized('transfer',   'complaint_transferred');
const assignment = categorized('assignment', 'complaint_assignment');
const escalation = categorized('escalation', 'complaint_escalation', { priority: 'high' });
const reply      = categorized('reply',      'complaint_reply');
const complaint  = categorized('complaint',  'complaint_assigned');
const mention    = categorized('mention',    'mention');

module.exports = {
  notify,
  notifyRoles,
  directive,
  transfer,
  assignment,
  escalation,
  reply,
  complaint,
  mention,
  CATEGORIES: Array.from(CATEGORIES),
  PRIORITIES: Array.from(PRIORITIES),
};
