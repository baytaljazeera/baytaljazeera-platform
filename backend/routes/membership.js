const express = require("express");
const db = require("../db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();

const cvUploadDir = path.join(__dirname, '../uploads/cv');
if (!fs.existsSync(cvUploadDir)) {
  fs.mkdirSync(cvUploadDir, { recursive: true });
}

const cvStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, cvUploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(8).toString('hex');
    cb(null, `cv_${Date.now()}_${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const cvUpload = multer({
  storage: cvStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('يُسمح فقط بملفات PDF و Word'));
    }
  }
});

const JOB_TITLES = [
  { id: 'marketing_manager', label: 'مدير التسويق' },
  { id: 'content_manager', label: 'مدير المحتوى' },
  { id: 'support_manager', label: 'مدير الدعم الفني' },
  { id: 'finance_manager', label: 'مدير المالية' },
  { id: 'admin_manager', label: 'مدير إداري' },
  { id: 'other', label: 'أخرى' }
];

router.get("/job-titles", (req, res) => {
  res.json({ titles: JOB_TITLES });
});

router.post("/apply", cvUpload.single('cv'), asyncHandler(async (req, res) => {
  const { full_name, email, phone, age, country, job_title, cover_letter } = req.body;

  if (!full_name || !email || !phone || !job_title) {
    return res.status(400).json({ error: "يرجى ملء جميع الحقول المطلوبة" });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "البريد الإلكتروني غير صالح" });
  }

  const existingRequest = await db.query(
    `SELECT * FROM membership_requests 
     WHERE email = $1 AND request_type = 'admin_promotion' AND status = 'pending'`,
    [email]
  );

  if (existingRequest.rows.length > 0) {
    return res.status(400).json({ error: "لديك طلب قيد الانتظار بالفعل" });
  }

  const cvPath = req.file ? `/uploads/cv/${req.file.filename}` : null;

  const result = await db.query(
    `INSERT INTO membership_requests 
     (user_id, request_type, full_name, email, phone, age, country, job_title, cover_letter, cv_path, status, created_at)
     VALUES (NULL, 'admin_promotion', $1, $2, $3, $4, $5, $6, $7, $8, 'pending', NOW())
     RETURNING *`,
    [full_name, email, phone, age || null, country || null, job_title, cover_letter || null, cvPath]
  );

  res.json({ 
    ok: true, 
    request: result.rows[0], 
    message: "تم إرسال طلبك بنجاح! سنتواصل معك قريباً" 
  });
}));

router.post("/request", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { plan_id, request_type, reason } = req.body;
  
  if (!request_type || !["plan_subscription", "admin_promotion"].includes(request_type)) {
    return res.status(400).json({ error: "نوع الطلب غير صالح" });
  }
  
  const existingRequest = await db.query(
    `SELECT * FROM membership_requests 
     WHERE user_id = $1 AND status = 'pending' 
     AND (request_type = $2 OR (request_type = 'plan_subscription' AND plan_id = $3))`,
    [userId, request_type, plan_id || null]
  );
  
  if (existingRequest.rows.length > 0) {
    return res.status(400).json({ error: "لديك طلب قيد الانتظار بالفعل" });
  }
  
  if (request_type === "admin_promotion") {
    const userCheck = await db.query("SELECT role FROM users WHERE id = $1", [userId]);
    if (userCheck.rows[0]?.role === "admin") {
      return res.status(400).json({ error: "أنت مدير بالفعل" });
    }
  }
  
  const result = await db.query(
    `INSERT INTO membership_requests (user_id, plan_id, request_type, reason, status, created_at)
     VALUES ($1, $2, $3, $4, 'pending', NOW())
     RETURNING *`,
    [userId, plan_id || null, request_type, reason || null]
  );
  
  res.json({ ok: true, request: result.rows[0], message: "تم إرسال طلبك بنجاح" });
}));

router.get("/my-requests", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  const result = await db.query(
    `SELECT 
      mr.*,
      p.name_ar as plan_name,
      p.price as plan_price
     FROM membership_requests mr
     LEFT JOIN plans p ON mr.plan_id = p.id
     WHERE mr.user_id = $1
     ORDER BY mr.created_at DESC`,
    [userId]
  );
  
  res.json({ requests: result.rows });
}));

router.delete("/request/:id", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  
  const result = await db.query(
    `DELETE FROM membership_requests 
     WHERE id = $1 AND user_id = $2 AND status = 'pending'
     RETURNING id`,
    [id, userId]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "الطلب غير موجود أو لا يمكن حذفه" });
  }
  
  res.json({ ok: true, message: "تم إلغاء الطلب" });
}));

router.get("/admin/requests", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { status, type } = req.query;
  
  let query = `
    SELECT 
      mr.*,
      u.name as user_name,
      u.email as user_email,
      u.phone as user_phone,
      p.name_ar as plan_name,
      reviewer.name as reviewed_by_name
    FROM membership_requests mr
    LEFT JOIN users u ON mr.user_id = u.id
    LEFT JOIN plans p ON mr.plan_id = p.id
    LEFT JOIN users reviewer ON mr.reviewed_by = reviewer.id
    WHERE 1=1
  `;
  const params = [];
  
  if (status) {
    params.push(status);
    query += ` AND mr.status = $${params.length}`;
  }
  
  if (type) {
    params.push(type);
    query += ` AND mr.request_type = $${params.length}`;
  }
  
  query += ` ORDER BY mr.created_at DESC`;
  
  const result = await db.query(query, params);
  
  res.json({ requests: result.rows });
}));

router.get("/admin/requests/:id", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const result = await db.query(
    `SELECT 
      mr.*,
      u.name as user_name,
      u.email as user_email,
      u.phone as user_phone,
      u.role as user_role,
      p.name_ar as plan_name,
      reviewer.name as reviewed_by_name
    FROM membership_requests mr
    LEFT JOIN users u ON mr.user_id = u.id
    LEFT JOIN plans p ON mr.plan_id = p.id
    LEFT JOIN users reviewer ON mr.reviewed_by = reviewer.id
    WHERE mr.id = $1`,
    [id]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "الطلب غير موجود" });
  }
  
  res.json({ request: result.rows[0] });
}));

router.post("/admin/requests/:id/approve", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { assigned_role, admin_note, password } = req.body;
  const reviewerId = req.user.id;
  
  const requestResult = await db.query(
    `SELECT * FROM membership_requests WHERE id = $1`,
    [id]
  );
  
  if (requestResult.rows.length === 0) {
    return res.status(404).json({ error: "الطلب غير موجود" });
  }
  
  const request = requestResult.rows[0];
  
  if (request.status !== 'pending' && request.status !== 'in_review') {
    return res.status(400).json({ error: "لا يمكن الموافقة على هذا الطلب" });
  }
  
  if (request.request_type === 'admin_promotion') {
    if (!assigned_role) {
      return res.status(400).json({ error: "يجب تحديد الدور للموظف" });
    }
    
    let userId = request.user_id;
    
    if (!userId && request.email) {
      const bcrypt = require('bcrypt');
      const userPassword = password || 'Temp@1234';
      const hashedPassword = await bcrypt.hash(userPassword, 10);
      
      const existingUser = await db.query(
        `SELECT id FROM users WHERE email = $1`,
        [request.email]
      );
      
      if (existingUser.rows.length > 0) {
        userId = existingUser.rows[0].id;
        await db.query(
          `UPDATE users SET role = $1, name = $2, phone = $3 WHERE id = $4`,
          [assigned_role, request.full_name, request.phone, userId]
        );
      } else {
        const newUser = await db.query(
          `INSERT INTO users (name, email, phone, password, role, status, created_at)
           VALUES ($1, $2, $3, $4, $5, 'active', NOW())
           RETURNING id`,
          [request.full_name, request.email, request.phone, hashedPassword, assigned_role]
        );
        userId = newUser.rows[0].id;
      }
    } else if (userId) {
      await db.query(
        `UPDATE users SET role = $1 WHERE id = $2`,
        [assigned_role, userId]
      );
    }
    
    await db.query(
      `UPDATE membership_requests 
       SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), 
           admin_note = $2, assigned_role = $3, user_id = $4
       WHERE id = $5`,
      [reviewerId, admin_note || null, assigned_role, userId, id]
    );
    
    await db.query(
      `INSERT INTO admin_audit_logs (action_type, target_role, target_user_id, changed_by_id, new_value, created_at)
       VALUES ('staff_approved', $1, $2, $3, $4, NOW())`,
      [assigned_role, userId, reviewerId, JSON.stringify({ request_id: id, role: assigned_role })]
    );
    
    res.json({ 
      ok: true, 
      message: "تمت الموافقة على الطلب وتعيين الموظف بنجاح",
      user_id: userId
    });
  } else {
    await db.query(
      `UPDATE membership_requests 
       SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), admin_note = $2
       WHERE id = $3`,
      [reviewerId, admin_note || null, id]
    );
    
    res.json({ ok: true, message: "تمت الموافقة على الطلب" });
  }
}));

router.post("/admin/requests/:id/reject", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { admin_note } = req.body;
  const reviewerId = req.user.id;
  
  if (!admin_note) {
    return res.status(400).json({ error: "يجب كتابة سبب الرفض" });
  }
  
  const result = await db.query(
    `UPDATE membership_requests 
     SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), admin_note = $2
     WHERE id = $3 AND status IN ('pending', 'in_review')
     RETURNING *`,
    [reviewerId, admin_note, id]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "الطلب غير موجود أو لا يمكن رفضه" });
  }
  
  res.json({ ok: true, message: "تم رفض الطلب" });
}));

router.post("/admin/requests/:id/restore", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminId = req.user.id;
  
  const current = await db.query(
    `SELECT * FROM membership_requests WHERE id = $1`,
    [id]
  );
  
  if (current.rows.length === 0) {
    return res.status(404).json({ error: "الطلب غير موجود" });
  }
  
  if (current.rows[0].status !== 'rejected') {
    return res.status(400).json({ error: "يمكن استرجاع الطلبات المرفوضة فقط" });
  }
  
  const result = await db.query(
    `UPDATE membership_requests 
     SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  
  await db.query(
    `INSERT INTO admin_audit_logs (action_type, target_role, target_user_id, changed_by_id, old_value, new_value, created_at)
     VALUES ('request_restored', NULL, NULL, $1, $2, $3, NOW())`,
    [adminId, JSON.stringify({ request_id: id, old_status: 'rejected' }), JSON.stringify({ request_id: id, new_status: 'pending' })]
  );
  
  res.json({ ok: true, message: "تم استرجاع الطلب بنجاح" });
}));

router.post("/admin/requests/:id/review", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const reviewerId = req.user.id;
  
  const result = await db.query(
    `UPDATE membership_requests 
     SET status = 'in_review', reviewed_by = $1
     WHERE id = $2 AND status = 'pending'
     RETURNING *`,
    [reviewerId, id]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "الطلب غير موجود" });
  }
  
  res.json({ ok: true, message: "تم نقل الطلب إلى قيد المراجعة" });
}));

router.get("/admin/staff", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT 
      u.id, u.name, u.email, u.phone, u.role, u.status, u.created_at,
      mr.job_title, mr.cv_path, mr.country, mr.age
    FROM users u
    LEFT JOIN membership_requests mr ON mr.user_id = u.id AND mr.request_type = 'admin_promotion' AND mr.status = 'approved'
    WHERE u.role NOT IN ('user')
    ORDER BY u.created_at DESC`
  );
  
  res.json({ staff: result.rows });
}));

router.post("/admin/staff/:id/suspend", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const adminId = req.user.id;
  
  if (id === adminId) {
    return res.status(400).json({ error: "لا يمكنك إيقاف حسابك" });
  }
  
  const result = await db.query(
    `UPDATE users SET status = 'suspended' WHERE id = $1 AND role != 'super_admin' RETURNING *`,
    [id]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "المستخدم غير موجود أو لا يمكن إيقافه" });
  }
  
  await db.query(
    `INSERT INTO admin_audit_logs (action_type, target_user_id, changed_by_id, new_value, created_at)
     VALUES ('staff_suspended', $1, $2, $3, NOW())`,
    [id, adminId, JSON.stringify({ reason })]
  );
  
  res.json({ ok: true, message: "تم إيقاف الحساب" });
}));

router.post("/admin/staff/:id/activate", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminId = req.user.id;
  
  const result = await db.query(
    `UPDATE users SET status = 'active' WHERE id = $1 RETURNING *`,
    [id]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "المستخدم غير موجود" });
  }
  
  await db.query(
    `INSERT INTO admin_audit_logs (action_type, target_user_id, changed_by_id, created_at)
     VALUES ('staff_activated', $1, $2, NOW())`,
    [id, adminId]
  );
  
  res.json({ ok: true, message: "تم تفعيل الحساب" });
}));

router.post("/admin/staff/:id/demote", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const adminId = req.user.id;
  
  if (id === adminId) {
    return res.status(400).json({ error: "لا يمكنك تخفيض نفسك" });
  }
  
  const userCheck = await db.query(`SELECT role FROM users WHERE id = $1`, [id]);
  if (userCheck.rows.length === 0) {
    return res.status(404).json({ error: "المستخدم غير موجود" });
  }
  
  if (userCheck.rows[0].role === 'super_admin') {
    return res.status(400).json({ error: "لا يمكن تخفيض المدير العام" });
  }
  
  const oldRole = userCheck.rows[0].role;
  
  await db.query(`UPDATE users SET role = 'user' WHERE id = $1`, [id]);
  
  await db.query(
    `INSERT INTO admin_audit_logs (action_type, target_user_id, changed_by_id, old_value, new_value, created_at)
     VALUES ('staff_demoted', $1, $2, $3, $4, NOW())`,
    [id, adminId, JSON.stringify({ role: oldRole }), JSON.stringify({ role: 'user', reason })]
  );
  
  res.json({ ok: true, message: "تم إلغاء صلاحيات الموظف" });
}));

router.post("/admin/staff/:id/reset-password", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminId = req.user.id;
  
  const bcrypt = require('bcrypt');
  const tempPassword = 'Reset@' + Math.random().toString(36).slice(-6);
  const hashedPassword = await bcrypt.hash(tempPassword, 10);
  
  const result = await db.query(
    `UPDATE users SET password = $1 WHERE id = $2 RETURNING email, name`,
    [hashedPassword, id]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "المستخدم غير موجود" });
  }
  
  await db.query(
    `INSERT INTO admin_audit_logs (action_type, target_user_id, changed_by_id, created_at)
     VALUES ('password_reset', $1, $2, NOW())`,
    [id, adminId]
  );
  
  res.json({ 
    ok: true, 
    message: "تم إعادة تعيين كلمة المرور",
    temp_password: tempPassword,
    user_email: result.rows[0].email,
    user_name: result.rows[0].name
  });
}));

router.get("/admin/cv/:filename", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(cvUploadDir, filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "الملف غير موجود" });
  }
  
  res.sendFile(filePath);
}));

module.exports = router;
