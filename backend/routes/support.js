const express = require("express");
const db = require("../db");
const { authMiddleware, adminMiddleware, requireRoles } = require("../middleware/auth");
const { asyncHandler } = require('../middleware/asyncHandler');
const {
  getSupportTicketScope,
  hasFullCustomerServiceAccess,
} = require("../utils/customerServiceScope");

const router = express.Router();

function generateTicketNumber() {
  const date = new Date();
  const year = date.getFullYear();
  const random = Math.floor(100000 + Math.random() * 900000);
  return `TKT-${year}-${random}`;
}

const DEPARTMENT_CONFIG = {
  financial: {
    name_ar: 'مالية',
    role: 'finance_admin',
    sla_hours: 24,
    subcategories: {
      refund: 'استرداد مبلغ',
      invoice: 'فاتورة أو إيصال',
      payment_failed: 'دفع فاشل',
      subscription: 'اشتراك أو تجديد',
      pricing: 'استفسار عن الأسعار'
    }
  },
  account: {
    name_ar: 'حسابي/إداري',
    role: 'support_admin',
    sla_hours: 48,
    subcategories: {
      profile_update: 'تعديل بيانات الحساب',
      delete_account: 'حذف الحساب',
      permissions: 'صلاحيات أو وصول',
      verification: 'توثيق الحساب',
      listing_issue: 'مشكلة في إعلان'
    }
  },
  technical: {
    name_ar: 'تقنية',
    role: 'support_admin',
    sla_hours: 12,
    subcategories: {
      app_error: 'خطأ في التطبيق',
      display_issue: 'مشكلة في العرض',
      slow_performance: 'بطء في الأداء',
      upload_issue: 'مشكلة رفع ملفات',
      map_issue: 'مشكلة في الخريطة'
    }
  }
};

function getSmartRouting(department, priority) {
  const config = DEPARTMENT_CONFIG[department] || DEPARTMENT_CONFIG.technical;
  let slaHours = config.sla_hours;
  
  if (priority === 'high') slaHours = Math.floor(slaHours / 2);
  if (priority === 'urgent') slaHours = Math.floor(slaHours / 4);
  
  return {
    role: config.role,
    sla_hours: Math.max(slaHours, 4)
  };
}

router.get("/count", authMiddleware, asyncHandler(async (req, res) => {
  if (req.user.role === "user") {
    return res.json({ count: 0 });
  }

  const { clause, params } = getSupportTicketScope(req.user.role, req.user.id, 1);
  const where = clause
    ? `FROM support_tickets st WHERE status IN ('new', 'in_progress') AND ${clause}`
    : `FROM support_tickets WHERE status IN ('new', 'in_progress')`;

  const result = await db.query(`SELECT COUNT(*)::int as count ${where}`, params);
  res.json({ count: parseInt(result.rows[0].count, 10) || 0 });
}));

router.get("/", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;

  if (role === "user") {
    const result = await db.query(
      `
      SELECT 
        st.*,
        (SELECT COUNT(*) FROM support_ticket_replies WHERE ticket_id = st.id) as reply_count
      FROM support_tickets st
      WHERE st.user_id = $1
      ORDER BY st.created_at DESC
    `,
      [userId]
    );
    return res.json({ tickets: result.rows });
  }

  const { clause, params } = getSupportTicketScope(role, userId, 1);
  const whereSql = clause ? `WHERE ${clause}` : "";

  const result = await db.query(
    `
      SELECT 
        st.*,
        u.name as user_name,
        u.email as user_email,
        u.phone as user_phone,
        a.name as assigned_name,
        (SELECT COUNT(*) FROM support_ticket_replies WHERE ticket_id = st.id) as reply_count
      FROM support_tickets st
      LEFT JOIN users u ON st.user_id = u.id
      LEFT JOIN users a ON st.assigned_to = a.id
      ${whereSql}
      ORDER BY 
        CASE st.status 
          WHEN 'new' THEN 1 
          WHEN 'in_progress' THEN 2 
          ELSE 3 
        END,
        st.created_at DESC
    `,
    params
  );
  res.json({ tickets: result.rows });
}));

router.get("/categories", asyncHandler(async (req, res) => {
  const departments = Object.entries(DEPARTMENT_CONFIG).map(([key, config]) => ({
    id: key,
    name_ar: config.name_ar,
    subcategories: Object.entries(config.subcategories).map(([subKey, subName]) => ({
      id: subKey,
      name_ar: subName
    }))
  }));
  
  res.json({ departments });
}));

router.get("/stats", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { clause, params } = getSupportTicketScope(req.user.role, req.user.id, 1);
  const whereSql = clause ? `WHERE ${clause}` : "";

  const result = await db.query(
    `
    SELECT 
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE st.status = 'new')::int as new,
      COUNT(*) FILTER (WHERE st.status = 'in_progress')::int as in_progress,
      COUNT(*) FILTER (WHERE st.status = 'resolved')::int as resolved,
      COUNT(*) FILTER (WHERE st.status = 'closed')::int as closed,
      COUNT(*) FILTER (WHERE st.priority = 'high')::int as high_priority
    FROM support_tickets st
    ${whereSql}
  `,
    params
  );
  res.json(result.rows[0]);
}));

router.post("/", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { department, subcategory, priority, subject, description } = req.body;
  
  if (!subject || !description) {
    return res.status(400).json({ error: "الموضوع والوصف مطلوبان" });
  }
  
  if (!department || !['financial', 'account', 'technical'].includes(department)) {
    return res.status(400).json({ error: "يرجى اختيار نوع المشكلة (مالية/حسابي/تقنية)" });
  }
  
  const ticketNumber = generateTicketNumber();
  const routing = getSmartRouting(department, priority || 'medium');
  const deptConfig = DEPARTMENT_CONFIG[department];
  
  const result = await db.query(
    `INSERT INTO support_tickets 
     (user_id, ticket_number, department, subcategory, category, priority, subject, description, auto_assigned_role, sla_hours)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      userId, 
      ticketNumber, 
      department,
      subcategory || null,
      department,
      priority || 'medium', 
      subject, 
      description,
      routing.role,
      routing.sla_hours
    ]
  );
  
  const ticket = result.rows[0];
  
  try {
    const targetAdmins = await db.query(
      `SELECT id FROM users WHERE role IN ('super_admin', 'admin', $1)`,
      [routing.role]
    );
    
    const deptName = deptConfig?.name_ar || 'دعم';
    
    for (const admin of targetAdmins.rows) {
      try {
        await db.query(
          `INSERT INTO notifications (user_id, title, body, type, link, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [
            admin.id,
            `تذكرة ${deptName} جديدة 🎫`,
            `تذكرة جديدة: ${subject} (${ticketNumber})`,
            'support_new',
            `/admin/support`
          ]
        );
      } catch (notifErr) {
        console.error(`Failed to notify admin ${admin.id}:`, notifErr.message);
      }
    }
  } catch (notifErr) {
    console.error("Failed to fetch admins for notification:", notifErr.message);
  }
  
  console.log(`📩 تذكرة ${deptConfig?.name_ar || department} جديدة: ${ticketNumber} → ${routing.role} (SLA: ${routing.sla_hours}h)`);
  
  res.status(201).json({ 
    ok: true, 
    ticket: ticket, 
    message: "تم إنشاء التذكرة بنجاح",
    routing: {
      department: deptConfig?.name_ar,
      assigned_to_role: routing.role,
      sla_hours: routing.sla_hours
    }
  });
}));

router.get("/:id", authMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const role = req.user.role;

  let query = `
    SELECT 
      st.*,
      u.name as user_name,
      u.email as user_email,
      u.phone as user_phone,
      a.name as assigned_name
    FROM support_tickets st
    LEFT JOIN users u ON st.user_id = u.id
    LEFT JOIN users a ON st.assigned_to = a.id
    WHERE st.id = $1
  `;
  const params = [id];

  if (role === "user") {
    query += " AND st.user_id = $2";
    params.push(userId);
  } else {
    const sc = getSupportTicketScope(role, userId, 2);
    if (sc.clause) {
      query += ` AND ${sc.clause}`;
      params.push(...sc.params);
    }
  }

  const ticketResult = await db.query(query, params);
  
  if (ticketResult.rows.length === 0) {
    return res.status(404).json({ error: "التذكرة غير موجودة" });
  }
  
  const repliesResult = await db.query(
    `SELECT 
      r.*,
      u.name as sender_name,
      u.role as sender_role
     FROM support_ticket_replies r
     LEFT JOIN users u ON r.sender_id = u.id
     WHERE r.ticket_id = $1
     ORDER BY r.created_at ASC`,
    [id]
  );
  
  res.json({
    ticket: ticketResult.rows[0],
    replies: repliesResult.rows
  });
}));

router.post("/:id/reply", authMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { message } = req.body;
  const senderId = req.user.id;
  const role = req.user.role;
  const isStaff = role !== "user";

  if (!message || message.trim() === '') {
    return res.status(400).json({ error: "الرسالة مطلوبة" });
  }

  let ticketQuery = "SELECT * FROM support_tickets st WHERE st.id = $1";
  const ticketParams = [id];

  if (role === "user") {
    ticketQuery += " AND st.user_id = $2";
    ticketParams.push(senderId);
  } else {
    const sc = getSupportTicketScope(role, senderId, 2);
    if (sc.clause) {
      ticketQuery += ` AND ${sc.clause}`;
      ticketParams.push(...sc.params);
    }
  }

  const ticketCheck = await db.query(ticketQuery, ticketParams);
  if (ticketCheck.rows.length === 0) {
    return res.status(404).json({ error: "التذكرة غير موجودة" });
  }

  const senderType = isStaff ? "admin" : "user";
  
  const result = await db.query(
    `INSERT INTO support_ticket_replies (ticket_id, sender_id, sender_type, message)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [id, senderId, senderType, message.trim()]
  );

  const replyWithName = await db.query(
    `SELECT r.*, u.name as sender_name
     FROM support_ticket_replies r
     LEFT JOIN users u ON r.sender_id = u.id
     WHERE r.id = $1`,
    [result.rows[0].id]
  );
  
  await db.query(
    `UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`,
    [id]
  );
  
  const ticket = ticketCheck.rows[0];
  if (isStaff && ticket.user_id !== senderId) {
    await db.query(
      `INSERT INTO notifications (user_id, title, body, type, link, created_at)
       VALUES ($1, 'رد جديد على تذكرتك', $2, 'support_reply', $3, NOW())`,
      [ticket.user_id, `تم الرد على تذكرة "${ticket.subject}"`, `/account/my-tickets?open=${id}`]
    );
  }
  
  res.status(201).json({ ok: true, reply: replyWithName.rows[0], message: "تم إرسال الرد بنجاح" });
}));

router.patch("/:id/status", authMiddleware, requireRoles('super_admin', 'admin', 'support_admin', 'finance_admin', 'content_admin', 'admin_manager'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const role = req.user.role;

  const validStatuses = ['new', 'in_progress', 'resolved', 'closed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: "الحالة غير صالحة" });
  }

  const sc = getSupportTicketScope(role, req.user.id, 3);
  const scopeSql = sc.clause ? ` AND ${sc.clause}` : "";
  const resolvedAt = (status === 'resolved' || status === 'closed') ? 'NOW()' : 'NULL';

  const result = await db.query(
    `UPDATE support_tickets st
     SET status = $1, resolved_at = ${resolvedAt}, updated_at = NOW()
     WHERE st.id = $2${scopeSql}
     RETURNING *`,
    [status, id, ...sc.params]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "التذكرة غير موجودة" });
  }
  
  const ticket = result.rows[0];
  const statusLabels = {
    new: 'جديدة',
    in_progress: 'قيد المعالجة',
    resolved: 'تم الحل',
    closed: 'مغلقة'
  };
  
  await db.query(
    `INSERT INTO notifications (user_id, title, body, type, link, created_at)
     VALUES ($1, 'تحديث حالة التذكرة', $2, 'support_status', $3, NOW())`,
    [ticket.user_id, `تم تحديث حالة تذكرتك "${ticket.subject}" إلى: ${statusLabels[status] || status}`, `/account/my-tickets?open=${id}`]
  );
  
  res.json({ ok: true, ticket: result.rows[0], message: "تم تحديث الحالة" });
}));

router.patch("/:id/assign", authMiddleware, requireRoles('super_admin', 'admin', 'support_admin', 'finance_admin', 'content_admin', 'admin_manager'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { assigned_to } = req.body;
  const role = req.user.role;
  const sc = getSupportTicketScope(role, req.user.id, 3);
  const scopeSql = sc.clause ? ` AND ${sc.clause}` : "";

  const result = await db.query(
    `UPDATE support_tickets st
     SET assigned_to = $1, updated_at = NOW()
     WHERE st.id = $2${scopeSql}
     RETURNING *`,
    [assigned_to || null, id, ...sc.params]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "التذكرة غير موجودة" });
  }
  
  res.json({ ok: true, ticket: result.rows[0], message: "تم تعيين المسؤول" });
}));

router.patch("/:id/priority", authMiddleware, requireRoles('super_admin', 'admin', 'support_admin', 'finance_admin', 'content_admin', 'admin_manager'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { priority } = req.body;
  const role = req.user.role;
  const sc = getSupportTicketScope(role, req.user.id, 3);
  const scopeSql = sc.clause ? ` AND ${sc.clause}` : "";

  const validPriorities = ['low', 'medium', 'high', 'urgent'];
  if (!validPriorities.includes(priority)) {
    return res.status(400).json({ error: "الأولوية غير صالحة" });
  }

  const result = await db.query(
    `UPDATE support_tickets st
     SET priority = $1, updated_at = NOW()
     WHERE st.id = $2${scopeSql}
     RETURNING *`,
    [priority, id, ...sc.params]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "التذكرة غير موجودة" });
  }
  
  res.json({ ok: true, ticket: result.rows[0], message: "تم تحديث الأولوية" });
}));

router.delete("/:id", authMiddleware, requireRoles("super_admin", "admin"), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "معرف غير صالح" });
  }

  const result = await db.query(
    `DELETE FROM support_tickets WHERE id = $1 RETURNING id`,
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "التذكرة غير موجودة" });
  }

  res.json({ ok: true, deleted: id, message: "تم حذف التذكرة نهائياً" });
}));

module.exports = router;
