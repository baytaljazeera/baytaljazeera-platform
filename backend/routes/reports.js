const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, requireRoles } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');
const { reportCreateLimiter } = require('../config/security');

const isTest = process.env.NODE_ENV === 'test';
const reportLimiter = isTest ? (req, res, next) => next() : reportCreateLimiter;

router.post("/", reportLimiter, asyncHandler(async (req, res) => {
  const { listingId, reason, details, reporterName, reporterPhone } = req.body;

  if (!listingId || !reason) {
    return res.status(400).json({ 
      error: "listingId و reason مطلوبان",
      errorAr: "يرجى تحديد رقم الإعلان وسبب البلاغ"
    });
  }

  const listingCheck = await db.query("SELECT id, status FROM properties WHERE id = $1", [listingId]);

  if (listingCheck.rows.length === 0) {
    return res.status(404).json({ error: "Listing not found", errorAr: "الإعلان غير موجود" });
  }

  const insertResult = await db.query(
    `INSERT INTO listing_reports (listing_id, reason, details, reporter_name, reporter_phone, status, created_at)
     VALUES ($1, $2, $3, $4, $5, 'new', NOW()) RETURNING *`,
    [listingId, reason, details || null, reporterName || null, reporterPhone || null]
  );

  const newReport = insertResult.rows[0];

  const countResult = await db.query(
    `SELECT COUNT(*) as cnt FROM listing_reports WHERE listing_id = $1 AND status != 'dismissed'`,
    [listingId]
  );
  const reportCount = parseInt(countResult.rows[0].cnt) || 0;

  const BLOCK_THRESHOLD = 5;
  let listingHidden = false;
  if (reportCount >= BLOCK_THRESHOLD) {
    await db.query("UPDATE properties SET status = 'hidden' WHERE id = $1", [listingId]);
    listingHidden = true;
  }

  res.status(201).json({ ok: true, report: newReport, reportCount, listingHidden, message: "تم استلام البلاغ بنجاح" });
}));

router.get("/", authMiddleware, requireRoles('super_admin', 'admin', 'content_admin', 'support_admin'), asyncHandler(async (req, res) => {
  const rawStatus = req.query.status;
  const status = typeof rawStatus === 'string' ? rawStatus.toLowerCase().trim() : undefined;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  let query = `SELECT r.*, p.title as listing_title, p.city as listing_city, p.district as listing_district,
               p.price as listing_price, p.status as listing_status
               FROM listing_reports r LEFT JOIN properties p ON r.listing_id::text = p.id::text`;
  const params = [];
  const col = `LOWER(TRIM(r.status))`;

  let whereClause = '';
  if (status && status !== 'all') {
    if (status === 'new') whereClause = ` WHERE ${col} IN ('new', 'pending')`;
    else if (status === 'in_review') whereClause = ` WHERE ${col} IN ('in_review', 'reviewing', 'under_review')`;
    else if (status === 'accepted') whereClause = ` WHERE ${col} IN ('accepted', 'resolved')`;
    else if (status === 'rejected') whereClause = ` WHERE ${col} IN ('rejected', 'dismissed')`;
    else if (status === 'hidden_listing') whereClause = ` WHERE p.status = 'hidden'`;
    else { whereClause = ` WHERE ${col} = $1`; params.push(status); }
  }

  query += whereClause;
  query += ` ORDER BY r.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const result = await db.query(query, params);

  let countQuery = `SELECT COUNT(*) as total FROM listing_reports r`;
  const countParams = [];
  if (status && status !== 'all') {
    if (status === 'new') countQuery += ` WHERE ${col} IN ('new', 'pending')`;
    else if (status === 'in_review') countQuery += ` WHERE ${col} IN ('in_review', 'reviewing', 'under_review')`;
    else if (status === 'accepted') countQuery += ` WHERE ${col} IN ('accepted', 'resolved')`;
    else if (status === 'rejected') countQuery += ` WHERE ${col} IN ('rejected', 'dismissed')`;
    else if (status === 'hidden_listing') countQuery = `SELECT COUNT(*) as total FROM listing_reports r JOIN properties p ON r.listing_id::text = p.id::text WHERE p.status = 'hidden'`;
    else { countQuery += ` WHERE ${col} = $1`; countParams.push(status); }
  }
  const countResult = await db.query(countQuery, countParams);
  const total = parseInt(countResult.rows[0].total) || 0;

  res.json({ reports: result.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
}));

router.get("/stats", authMiddleware, requireRoles('super_admin', 'admin', 'content_admin', 'support_admin'), asyncHandler(async (req, res) => {
  const col = `LOWER(TRIM(status))`;
  const newCount = await db.query(`SELECT COUNT(*) as count FROM listing_reports WHERE ${col} IN ('new', 'pending')`);
  const inReviewCount = await db.query(`SELECT COUNT(*) as count FROM listing_reports WHERE ${col} IN ('in_review', 'reviewing', 'under_review')`);
  const closedCount = await db.query(`SELECT COUNT(*) as count FROM listing_reports WHERE ${col} IN ('closed', 'accepted', 'resolved')`);
  const dismissedCount = await db.query(`SELECT COUNT(*) as count FROM listing_reports WHERE ${col} IN ('dismissed', 'rejected')`);
  const hiddenListingCount = await db.query(`SELECT COUNT(*) as count FROM listing_reports r JOIN properties p ON r.listing_id::text = p.id::text WHERE p.status = 'hidden'`);
  const totalResult = await db.query("SELECT COUNT(*) as total FROM listing_reports");

  const byStatus = [
    { status: 'new', count: newCount.rows[0]?.count || '0' },
    { status: 'in_review', count: inReviewCount.rows[0]?.count || '0' },
    { status: 'closed', count: closedCount.rows[0]?.count || '0' },
    { status: 'dismissed', count: dismissedCount.rows[0]?.count || '0' },
    { status: 'hidden_listing', count: hiddenListingCount.rows[0]?.count || '0' }
  ];

  res.json({ byStatus, total: parseInt(totalResult.rows[0].total) || 0 });
}));

router.patch("/:id", authMiddleware, requireRoles('super_admin', 'admin', 'content_admin', 'support_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const reportId = parseInt(id);
  if (isNaN(reportId)) return res.status(400).json({ error: "معرف البلاغ غير صالح" });

  const validStatuses = ['new', 'in_review', 'closed', 'dismissed', 'resolved'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: "حالة غير صحيحة", validStatuses });
  const finalStatus = status === 'resolved' ? 'closed' : status;

  const result = await db.query(
    `UPDATE listing_reports SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [finalStatus, reportId]
  );

  if (result.rows.length === 0) return res.status(404).json({ error: "البلاغ غير موجود" });
  res.json({ ok: true, report: result.rows[0], message: `تم تحديث حالة البلاغ إلى: ${status}` });
}));

router.post("/:id/action", authMiddleware, requireRoles('content_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, action, note, listingId } = req.body;

  const validStatuses = ['accepted', 'rejected', 'closed', 'dismissed'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: "حالة غير صحيحة", validStatuses });
  
  const normalizedStatus = (status === 'accepted') ? 'closed' : (status === 'rejected') ? 'dismissed' : status;

  let listingDeleted = false;
  let listingHidden = false;
  let listingRestored = false;
  let finalStatus = normalizedStatus;

  const reportData = await db.query(`SELECT * FROM listing_reports WHERE id = $1`, [id]);
  if (reportData.rows.length === 0) return res.status(404).json({ error: "البلاغ غير موجود" });
  const currentReport = reportData.rows[0];

  if (normalizedStatus === 'closed' && listingId) {
    if (action === 'hide') {
      await db.query(`UPDATE properties SET status = 'hidden', updated_at = NOW() WHERE id = $1`, [listingId]);
      listingHidden = true;
      finalStatus = 'in_review';
    } else if (action === 'delete') {
      const listingCheck = await db.query(`SELECT user_id, title FROM properties WHERE id = $1`, [listingId]);
      if (listingCheck.rows.length > 0) {
        await db.query("DELETE FROM notifications WHERE listing_id::text = $1::text", [listingId]);
        await db.query("DELETE FROM favorites WHERE listing_id::text = $1::text", [listingId]);
        await db.query("DELETE FROM listing_reports WHERE listing_id::text = $1::text AND id != $2", [listingId, id]);
        await db.query("DELETE FROM elite_slot_reservations WHERE property_id::text = $1::text", [listingId]);
        await db.query("DELETE FROM properties WHERE id::text = $1::text", [listingId]);
        listingDeleted = true;
      }
    }
  }

  if (normalizedStatus === 'dismissed' && action === 'restore' && listingId) {
    const listingCheck = await db.query(`SELECT user_id, title, status FROM properties WHERE id = $1`, [listingId]);
    if (listingCheck.rows.length > 0 && listingCheck.rows[0].status === 'hidden') {
      await db.query(`UPDATE properties SET status = 'approved', updated_at = NOW() WHERE id = $1`, [listingId]);
      listingRestored = true;
    }
  }

  const updateResult = await db.query(
    `UPDATE listing_reports SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [finalStatus, id]
  );

  if (updateResult.rows.length === 0) return res.status(404).json({ error: "البلاغ غير موجود" });

  let successMessage = listingRestored ? 'تم إعادة نشر الإعلان بنجاح' : listingHidden ? 'تم حجب الإعلان' : listingDeleted ? 'تم حذف الإعلان' : 'تم تحديث البلاغ';

  res.json({ ok: true, report: updateResult.rows[0], action: { type: action || 'none', listingHidden, listingDeleted, listingRestored }, message: successMessage });
}));

module.exports = router;
