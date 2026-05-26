// backend/routes/notifications.js - Notifications Routes
const express = require("express");
const db = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();

router.get("/count", authMiddleware, asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT COUNT(*) AS c FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [req.user.id]
  );
  res.json({ unread: Number(result.rows[0].c) });
}));

router.get("/unread-count", authMiddleware, asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT COUNT(*) AS c FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [req.user.id]
  );
  res.json({ count: Number(result.rows[0].c) });
}));

router.get("/", authMiddleware, asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;
  
  const result = await db.query(
    `SELECT * FROM notifications
     WHERE user_id = $1
     ORDER BY (read_at IS NOT NULL), created_at DESC
     LIMIT $2 OFFSET $3`,
    [req.user.id, limit, offset]
  );
  
  const countResult = await db.query(
    `SELECT COUNT(*) as total FROM notifications WHERE user_id = $1`,
    [req.user.id]
  );
  
  res.json({ 
    notifications: result.rows,
    total: parseInt(countResult.rows[0].total)
  });
}));

router.patch("/read", authMiddleware, asyncHandler(async (req, res) => {
  const { ids } = req.body;
  
  if (!Array.isArray(ids) || !ids.length) {
    return res.json({ ok: true });
  }

  await db.query(
    `UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND id = ANY($2::bigint[])`,
    [req.user.id, ids]
  );

  res.json({ ok: true, message: "تم تحديث حالة القراءة" });
}));

router.patch("/:id/read", authMiddleware, asyncHandler(async (req, res) => {
  const notificationId = req.params.id;
  
  await db.query(
    `UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND id = $2`,
    [req.user.id, notificationId]
  );

  res.json({ ok: true, message: "تم تحديد الإشعار كمقروء" });
}));

router.patch("/read-all", authMiddleware, asyncHandler(async (req, res) => {
  await db.query(
    `UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL`,
    [req.user.id]
  );
  res.json({ ok: true, message: "تم تحديد الكل كمقروء" });
}));

/**
 * Notification center view — grouped + filterable.
 *
 * Query params:
 *   category=directive|transfer|assignment|escalation|reply|mention|complaint|system
 *   unread=1                 — only unread
 *   priority=high|urgent     — filter by priority
 *   q=string                 — substring search on title/body
 *   limit, offset            — pagination
 *
 * Returns:
 *   { items, total, counts: { byCategory: {...}, unread, urgent } }
 */
router.get("/center", authMiddleware, asyncHandler(async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit) || 30, 100);
  const offset = parseInt(req.query.offset) || 0;
  const category = (req.query.category || '').trim() || null;
  const unread = req.query.unread === '1' || req.query.unread === 'true';
  const priority = (req.query.priority || '').trim() || null;
  const q = (req.query.q || '').trim() || null;

  const where = ['user_id = $1'];
  const params = [req.user.id];
  if (category) { params.push(category); where.push(`category = $${params.length}`); }
  if (priority) { params.push(priority); where.push(`priority = $${params.length}`); }
  if (unread)   { where.push(`read_at IS NULL`); }
  if (q)        { params.push(`%${q}%`); where.push(`(title ILIKE $${params.length} OR body ILIKE $${params.length})`); }

  const itemsQ = `
    SELECT id, title, body, type, link, category, priority,
           source_type, source_id, actor_user_id, actor_name_snapshot,
           read_at, created_at
    FROM notifications
    WHERE ${where.join(' AND ')}
    ORDER BY (read_at IS NOT NULL), created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  let items = [];
  let total = 0;
  let countsByCategory = {};
  let unreadTotal = 0;
  let urgentTotal = 0;

  try {
    const r = await db.query(itemsQ, params);
    items = r.rows;
    const t = await db.query(
      `SELECT COUNT(*)::int AS n FROM notifications WHERE ${where.join(' AND ')}`,
      params
    );
    total = t.rows[0]?.n || 0;
    const c = await db.query(
      `SELECT COALESCE(category,'system') AS category, COUNT(*)::int AS n
       FROM notifications
       WHERE user_id = $1 AND read_at IS NULL
       GROUP BY 1`,
      [req.user.id]
    );
    countsByCategory = Object.fromEntries(c.rows.map(x => [x.category, x.n]));
    const u = await db.query(
      `SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
      [req.user.id]
    );
    unreadTotal = u.rows[0]?.n || 0;
    const ug = await db.query(
      `SELECT COUNT(*)::int AS n FROM notifications
       WHERE user_id = $1 AND read_at IS NULL AND priority IN ('high','urgent')`,
      [req.user.id]
    );
    urgentTotal = ug.rows[0]?.n || 0;
  } catch (e) {
    if (e && (e.code === '42703' || e.code === '42P01')) {
      // Older DB without category/priority — fall back to plain list.
      const fallback = await db.query(
        `SELECT id, title, body, type, link, read_at, created_at
         FROM notifications WHERE user_id = $1
         ORDER BY (read_at IS NOT NULL), created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
      );
      items = fallback.rows;
      const t = await db.query(`SELECT COUNT(*)::int n FROM notifications WHERE user_id = $1`, [req.user.id]);
      total = t.rows[0]?.n || 0;
      const u = await db.query(`SELECT COUNT(*)::int n FROM notifications WHERE user_id = $1 AND read_at IS NULL`, [req.user.id]);
      unreadTotal = u.rows[0]?.n || 0;
    } else {
      throw e;
    }
  }

  res.json({
    items,
    total,
    counts: { byCategory: countsByCategory, unread: unreadTotal, urgent: urgentTotal },
    page: { limit, offset },
  });
}));

/**
 * "Assigned to me" view — notifications whose category is in
 * [directive, assignment, transfer, escalation] and the actor isn't the user.
 * Useful for the home/dashboard "you have N pending actions" widget.
 */
router.get("/for-me", authMiddleware, asyncHandler(async (req, res) => {
  try {
    const r = await db.query(
      `SELECT id, title, body, link, category, priority, source_type, source_id,
              actor_name_snapshot, read_at, created_at
       FROM notifications
       WHERE user_id = $1
         AND category IN ('directive','assignment','transfer','escalation','mention')
       ORDER BY (read_at IS NOT NULL), priority DESC NULLS LAST, created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json({ items: r.rows });
  } catch (e) {
    if (e && (e.code === '42703' || e.code === '42P01')) {
      return res.json({ items: [] });
    }
    throw e;
  }
}));

router.get("/recent", authMiddleware, asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 5;
  
  const result = await db.query(
    `SELECT n.*, u.name as user_name
     FROM notifications n
     LEFT JOIN users u ON n.user_id = u.id
     WHERE n.user_id = $1
     ORDER BY n.created_at DESC
     LIMIT $2`,
    [req.user.id, limit]
  );
  
  res.json({ 
    notifications: result.rows.map(n => ({
      id: n.id,
      title: n.title,
      body: n.body,
      type: n.type,
      created_at: n.created_at,
      read_at: n.read_at,
      user_name: n.user_name
    }))
  });
}));

router.delete("/:id", authMiddleware, asyncHandler(async (req, res) => {
  await db.query(
    `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.user.id]
  );
  res.json({ ok: true, message: "تم حذف التنبيه" });
}));

module.exports = router;
