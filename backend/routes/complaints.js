const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authMiddleware, requireRoles, JWT_SECRET, JWT_VERIFY_OPTIONS } = require('../middleware/auth');
const { complaintsLimiter } = require('../config/security');
const { asyncHandler } = require('../middleware/asyncHandler');
const { getAccountComplaintScope } = require('../utils/customerServiceScope');

const isTest = process.env.NODE_ENV === 'test';
const complaintLimiter = isTest ? (req, res, next) => next() : complaintsLimiter;

const COMPLAINTS_ADMIN_ROLES = [
  'super_admin',
  'admin',
  'support_admin',
  'finance_admin',
  'content_admin',
  'admin_manager',
];

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

router.patch("/:id", authMiddleware, requireRoles(...COMPLAINTS_ADMIN_ROLES), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, adminNote } = req.body;

  const validStatuses = ['new', 'in_review', 'in_progress', 'closed', 'dismissed', 'resolved'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: "حالة غير صحيحة" });
  }

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
  res.json({ ok: true, complaint: result.rows[0], message: "تم تحديث الشكوى بنجاح" });
}));

module.exports = router;
