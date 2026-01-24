const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authMiddleware, requireRoles, JWT_SECRET, JWT_VERIFY_OPTIONS } = require('../middleware/auth');
const { complaintsLimiter } = require('../config/security');
const { asyncHandler } = require('../middleware/asyncHandler');

const isTest = process.env.NODE_ENV === 'test';
const complaintLimiter = isTest ? (req, res, next) => next() : complaintsLimiter;

router.post("/", complaintLimiter, asyncHandler(async (req, res) => {
  const { category, subject, details, userName, userEmail, userPhone, invoice_id, complaint_type } = req.body;

  if (!category || !subject || !details) {
    return res.status(400).json({ error: "جميع الحقول مطلوبة", errorAr: "يرجى ملء جميع الحقول المطلوبة" });
  }

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

  const result = await db.query(
    `INSERT INTO account_complaints (user_id, user_name, user_email, user_phone, category, subject, details, invoice_id, complaint_type, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new', NOW()) RETURNING *`,
    [userId, userName, userEmail, userPhone, category, subject, details, validatedInvoiceId, actualComplaintType]
  );

  res.status(201).json({ ok: true, complaint: result.rows[0], message: "تم استلام شكواك بنجاح" });
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
  const result = await db.query(`SELECT COUNT(*) as count FROM account_complaints WHERE status IN ('new', 'pending')`);
  res.json({ count: parseInt(result.rows[0].count) || 0 });
}));

router.get("/", authMiddleware, requireRoles('super_admin', 'admin', 'support_admin'), asyncHandler(async (req, res) => {
  const { status, complaint_type, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let whereConditions = [];
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
  
  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  const result = await db.query(`
    SELECT c.*, 
           i.invoice_number, i.total as invoice_total,
           r.amount as refund_amount, r.status as refund_status
    FROM account_complaints c
    LEFT JOIN invoices i ON c.invoice_id = i.id
    LEFT JOIN refunds r ON c.refund_id = r.id
    ${whereClause}
    ORDER BY c.created_at DESC 
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, [...params, parseInt(limit), offset]);

  const countResult = await db.query(`
    SELECT COUNT(*) as total FROM account_complaints c ${whereClause}
  `, params);

  res.json({
    complaints: result.rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: parseInt(countResult.rows[0].total) || 0,
      totalPages: Math.ceil((parseInt(countResult.rows[0].total) || 0) / parseInt(limit))
    }
  });
}));

router.patch("/:id", authMiddleware, requireRoles('super_admin', 'admin', 'support_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, adminNote } = req.body;

  const validStatuses = ['new', 'in_progress', 'resolved', 'closed'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: "حالة غير صحيحة" });
  }

  const result = await db.query(
    `UPDATE account_complaints SET status = COALESCE($1, status), admin_note = COALESCE($2, admin_note), updated_at = NOW() WHERE id = $3 RETURNING *`,
    [status, adminNote, id]
  );

  if (result.rows.length === 0) return res.status(404).json({ error: "الشكوى غير موجودة" });
  res.json({ ok: true, complaint: result.rows[0], message: "تم تحديث الشكوى بنجاح" });
}));

module.exports = router;
