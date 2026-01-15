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
