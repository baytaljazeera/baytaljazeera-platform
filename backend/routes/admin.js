const express = require("express");
const db = require("../db");
const { authMiddleware, adminMiddleware, requireRoles, ADMIN_ROLES } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");
const { validatePagination } = require("../middleware/validation");
const userService = require("../services/userService");
const listingService = require("../services/listingService");
const { ROLE_LABELS, VALID_ROLES, VALID_USER_STATUSES, CACHE_KEYS } = require("../utils/constants");
const { logAdminAction, AUDIT_ACTIONS } = require("../services/auditService");
const { buildSearchClause, buildWhereClause, paginatedQuery, handleDatabaseError } = require("../utils/queryHelpers");
const emailService = require("../services/emailService");
const {
  hasFullCustomerServiceAccess,
  getSupportTicketScope,
  getAccountComplaintScope,
} = require("../utils/customerServiceScope");

const router = express.Router();

// 🔧 اختبار خدمة البريد الإلكتروني
router.get("/test-email-status", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const gmailClient = emailService.getGmailClient();
  
  res.json({
    ok: true,
    emailService: {
      initialized: !!gmailClient,
      status: gmailClient ? 'جاهز للإرسال' : 'غير مفعل - تحقق من إعدادات Gmail'
    }
  });
}));

router.post("/test-send-email", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: "البريد الإلكتروني مطلوب" });
  }
  
  const htmlBody = `
    <div style="direction: rtl; font-family: Arial, sans-serif; padding: 20px;">
      <h2 style="color: #D4AF37;">اختبار البريد الإلكتروني - بيت الجزيرة</h2>
      <p>هذا بريد اختباري للتأكد من عمل خدمة البريد الإلكتروني.</p>
      <p>الوقت: ${new Date().toLocaleString('ar-SA')}</p>
      <hr style="border-color: #D4AF37;" />
      <p style="color: #666;">فريق بيت الجزيرة</p>
    </div>
  `;
  
  const result = await emailService.sendEmail(email, 'اختبار البريد - بيت الجزيرة', htmlBody);
  
  if (result.success) {
    res.json({ ok: true, message: `تم إرسال البريد الاختباري إلى ${email}` });
  } else {
    res.status(500).json({ ok: false, error: result.error || 'فشل في إرسال البريد' });
  }
}));

// 🟢 جلب الأعداد للشريط الجانبي - GET /api/admin/pending-counts
// النظام الموحد: أحمر = جديد (أولوية قصوى)، أصفر = قيد التنفيذ، أخضر = مكتمل
// تحسين الأداء: CTE + UNION ALL بدلاً من 13 subquery + Caching 30 ثانية
router.get("/pending-counts", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const CACHE_KEY = 'admin:pending-counts';
  
  const cached = await db.cachedQuery(CACHE_KEY, `
    WITH counts AS (
      SELECT 'listings_new' as key, COUNT(*)::int as cnt FROM properties WHERE status = 'pending'
      UNION ALL SELECT 'listings_in_progress', COUNT(*)::int FROM properties WHERE status = 'in_review'
      UNION ALL SELECT 'reports_new', COUNT(*)::int FROM listing_reports WHERE status IN ('new', 'pending')
      UNION ALL SELECT 'reports_in_progress', COUNT(*)::int FROM listing_reports WHERE status = 'in_review'
      UNION ALL SELECT 'membership_new', COUNT(*)::int FROM membership_requests WHERE status = 'pending'
      UNION ALL SELECT 'membership_in_progress', COUNT(*)::int FROM membership_requests WHERE status = 'in_review'
      UNION ALL SELECT 'refunds_new', COUNT(*)::int FROM refunds WHERE status = 'pending'
      UNION ALL SELECT 'refunds_in_progress', COUNT(*)::int FROM refunds WHERE status = 'approved' AND payout_confirmed_at IS NULL
      UNION ALL SELECT 'messages_new', COUNT(*)::int FROM admin_messages WHERE read_by IS NULL
      UNION ALL SELECT 'complaints_new', COUNT(*)::int FROM account_complaints WHERE status = 'new'
      UNION ALL SELECT 'complaints_in_progress', COUNT(*)::int FROM account_complaints WHERE status = 'in_review'
      UNION ALL SELECT 'support_new', COUNT(*)::int FROM support_tickets WHERE status IN ('new', 'open')
      UNION ALL SELECT 'support_in_progress', COUNT(*)::int FROM support_tickets WHERE status = 'in_progress'
      UNION ALL SELECT 'ambassador_pending', COUNT(*)::int FROM ambassador_requests WHERE status IN ('pending', 'under_review')
      UNION ALL SELECT 'ambassador_withdrawals', COUNT(*)::int FROM ambassador_withdrawal_requests WHERE status IN ('pending', 'finance_review', 'in_progress')
      -- Finance Inbox: complaints transferred to finance + open finance-dept tickets + pending refunds.
      UNION ALL SELECT 'finance_inbox_new',
        (SELECT COUNT(*)::int FROM account_complaints WHERE auto_assigned_role = 'finance_admin' AND status IN ('new','in_review','pending','in_progress'))
        + (SELECT COUNT(*)::int FROM support_tickets WHERE department = 'financial' AND status IN ('new','open','in_progress'))
        + (SELECT COUNT(*)::int FROM refunds WHERE status = 'pending')
      -- Executive Inbox: complaints escalated to admin / super_admin via the transfer modal.
      UNION ALL SELECT 'executive_inbox_new',
        (SELECT COUNT(*)::int FROM account_complaints WHERE auto_assigned_role IN ('admin','super_admin') AND status IN ('new','in_review','pending','in_progress'))
    )
    SELECT 
      MAX(CASE WHEN key = 'listings_new' THEN cnt END) as listings_new,
      MAX(CASE WHEN key = 'listings_in_progress' THEN cnt END) as listings_in_progress,
      MAX(CASE WHEN key = 'reports_new' THEN cnt END) as reports_new,
      MAX(CASE WHEN key = 'reports_in_progress' THEN cnt END) as reports_in_progress,
      MAX(CASE WHEN key = 'membership_new' THEN cnt END) as membership_new,
      MAX(CASE WHEN key = 'membership_in_progress' THEN cnt END) as membership_in_progress,
      MAX(CASE WHEN key = 'refunds_new' THEN cnt END) as refunds_new,
      MAX(CASE WHEN key = 'refunds_in_progress' THEN cnt END) as refunds_in_progress,
      MAX(CASE WHEN key = 'messages_new' THEN cnt END) as messages_new,
      MAX(CASE WHEN key = 'complaints_new' THEN cnt END) as complaints_new,
      MAX(CASE WHEN key = 'complaints_in_progress' THEN cnt END) as complaints_in_progress,
      MAX(CASE WHEN key = 'support_new' THEN cnt END) as support_new,
      MAX(CASE WHEN key = 'support_in_progress' THEN cnt END) as support_in_progress,
      MAX(CASE WHEN key = 'ambassador_pending' THEN cnt END) as ambassador_pending,
      MAX(CASE WHEN key = 'ambassador_withdrawals' THEN cnt END) as ambassador_withdrawals,
      MAX(CASE WHEN key = 'finance_inbox_new' THEN cnt END) as finance_inbox_new,
      MAX(CASE WHEN key = 'executive_inbox_new' THEN cnt END) as executive_inbox_new
    FROM counts
  `, [], 30000);
  
  const row = { ...(cached.rows[0] || {}) };
  const role = req.user.role;
  const uid = req.user.id;

  if (!hasFullCustomerServiceAccess(role)) {
    const sScope = getSupportTicketScope(role, uid, 1);
    const sSql = sScope.clause ? ` AND ${sScope.clause}` : "";
    const cScope = getAccountComplaintScope(role, uid, 1);
    const cSql = cScope.clause ? ` AND ${cScope.clause}` : "";

    const [sn, sip, cn, cip] = await Promise.all([
      db.query(
        `SELECT COUNT(*)::int AS c FROM support_tickets st WHERE st.status IN ('new', 'open')${sSql}`,
        sScope.params
      ),
      db.query(
        `SELECT COUNT(*)::int AS c FROM support_tickets st WHERE st.status = 'in_progress'${sSql}`,
        sScope.params
      ),
      db.query(
        `SELECT COUNT(*)::int AS c FROM account_complaints c WHERE c.status IN ('new', 'pending')${cSql}`,
        cScope.params
      ),
      db.query(
        `SELECT COUNT(*)::int AS c FROM account_complaints c WHERE c.status IN ('in_review', 'in_progress')${cSql}`,
        cScope.params
      ),
    ]);

    row.support_new = sn.rows[0]?.c ?? 0;
    row.support_in_progress = sip.rows[0]?.c ?? 0;
    row.complaints_new = cn.rows[0]?.c ?? 0;
    row.complaints_in_progress = cip.rows[0]?.c ?? 0;
  }

  res.json({
    listingsNew: row.listings_new || 0,
    listingsInProgress: row.listings_in_progress || 0,
    reportsNew: row.reports_new || 0,
    reportsInProgress: row.reports_in_progress || 0,
    membershipNew: row.membership_new || 0,
    membershipInProgress: row.membership_in_progress || 0,
    refundsNew: row.refunds_new || 0,
    refundsInProgress: row.refunds_in_progress || 0,
    messagesNew: row.messages_new || 0,
    complaintsNew: row.complaints_new || 0,
    complaintsInProgress: row.complaints_in_progress || 0,
    supportNew: row.support_new || 0,
    supportInProgress: row.support_in_progress || 0,
    ambassadorPending: row.ambassador_pending || 0,
    ambassadorWithdrawals: row.ambassador_withdrawals || 0,
    financeInboxNew: row.finance_inbox_new || 0,
    executiveInboxNew: row.executive_inbox_new || 0,
  });
}));

// استخدام ROLE_LABELS من constants.js

router.get("/users", authMiddleware, requireRoles('super_admin'), validatePagination, asyncHandler(async (req, res) => {
  const { page, limit, offset } = req.pagination;
  const search = req.query.search?.trim() || '';
  const adminOnly = req.query.admin_only === 'true';
  
  const clauses = [];
  const params = [];
  
  if (search) {
    params.push(`%${search}%`);
    clauses.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length} OR phone ILIKE $${params.length})`);
  }
  
  if (adminOnly) {
    clauses.push(`role != 'user'`);
  }
  
  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  
  const result = await paginatedQuery(db, {
    baseQuery: `
      SELECT 
        id, name, email, phone, role, role_level, status, created_at,
        (SELECT p.name_ar FROM user_plans up JOIN plans p ON up.plan_id = p.id WHERE up.user_id = users.id AND (up.expires_at IS NULL OR up.expires_at > NOW()) AND up.status = 'active' ORDER BY up.created_at DESC LIMIT 1) as plan_name
      FROM users
      ${whereClause}
      ORDER BY created_at DESC`,
    countQuery: `SELECT COUNT(*) as total FROM users ${whereClause}`,
    params: params,
    pagination: { page, limit, offset }
  });
  
  res.json({ users: result.data, pagination: result.pagination });
}));

router.patch("/users/:id/role", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  
  const defaultRoles = ['user', 'content_admin', 'support_admin', 'finance_admin', 'admin_manager', 'admin', 'super_admin'];
  
  let isValidRole = defaultRoles.includes(role);
  
  if (!isValidRole) {
    const customRole = await db.query(
      "SELECT key FROM custom_roles WHERE key = $1 AND is_active = true",
      [role]
    );
    isValidRole = customRole.rows.length > 0;
  }
  
  if (!isValidRole) {
    return res.status(400).json({ error: "الدور غير صالح" });
  }
  
  const oldUser = await db.query("SELECT name, role FROM users WHERE id = $1", [id]);
  const oldRole = oldUser.rows[0]?.role || 'user';
  const userName = oldUser.rows[0]?.name || 'Unknown';

  // Footgun guards: we never want the platform to end up with zero
  // super_admins (would lock the owner out forever) and we don't want
  // the requester to accidentally demote themselves.
  const targetIdInt = parseInt(id, 10);
  const requesterIdInt = parseInt(req.user?.id, 10);
  const isSelf = Number.isFinite(targetIdInt) && Number.isFinite(requesterIdInt) && targetIdInt === requesterIdInt;
  const isDemotingFromSuper = oldRole === 'super_admin' && role !== 'super_admin';

  if (isSelf && isDemotingFromSuper) {
    return res.status(403).json({
      error: "لا يمكنك تخفيض دور حسابك من super_admin بنفسك. اطلب من super_admin آخر تعديل دورك.",
      errorEn: "Cannot demote yourself from super_admin. Ask another super_admin to do it."
    });
  }

  if (isDemotingFromSuper) {
    const remaining = await db.query(
      "SELECT COUNT(*)::int AS n FROM users WHERE role = 'super_admin' AND id <> $1",
      [id]
    );
    if ((remaining.rows[0]?.n || 0) === 0) {
      return res.status(403).json({
        error: "لا يمكن تخفيض دور آخر super_admin. عيّن super_admin آخر أولاً ثم أعد المحاولة.",
        errorEn: "Cannot demote the last super_admin. Promote another super_admin first."
      });
    }
  }

  const result = await db.query(
    "UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, email, role",
    [role, id]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "المستخدم غير موجود" });
  }
  
  await logAdminAction(req, AUDIT_ACTIONS.USER_ROLE_CHANGE, 'user', id, { 
    newRole: role, 
    userName: result.rows[0].name,
    userEmail: result.rows[0].email 
  });
  
  await db.query(
    `INSERT INTO permission_audit_log 
     (action_type, target_user_id, target_user_name, changed_by_id, changed_by_name, old_value, new_value, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      'UPDATE_USER_ROLE',
      id,
      userName,
      req.user?.id || 'system',
      req.user?.name || 'النظام',
      JSON.stringify({ role: oldRole }),
      JSON.stringify({ role }),
      req.ip || req.headers['x-forwarded-for'] || 'unknown',
      req.headers['user-agent'] || 'unknown'
    ]
  );
  
  let roleLabel = ROLE_LABELS[role];
  if (!roleLabel) {
    const customRoleResult = await db.query("SELECT label FROM custom_roles WHERE key = $1", [role]);
    roleLabel = customRoleResult.rows[0]?.label || role;
  }
  
  res.json({ ok: true, user: result.rows[0], message: `تم تعديل دور المستخدم إلى: ${roleLabel}` });
}));

router.get("/users/customers", authMiddleware, requireRoles('super_admin'), validatePagination, asyncHandler(async (req, res) => {
  const { page, limit, offset } = req.pagination;
  const search = req.query.search?.trim() || '';
  const planFilter = req.query.plan_id ? parseInt(req.query.plan_id) : null;
  const statusFilter = req.query.status?.trim() || '';
  
  let params = [];
  let conditions = [`u.role = 'user'`];
  
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.phone ILIKE $${params.length})`);
  }
  
  if (planFilter) {
    params.push(planFilter);
    conditions.push(`up.plan_id = $${params.length}`);
  }
  
  if (statusFilter && ['active', 'on_hold', 'under_review', 'blocked'].includes(statusFilter)) {
    params.push(statusFilter);
    conditions.push(`u.status = $${params.length}`);
  }
  
  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  
  const result = await paginatedQuery(db, {
    baseQuery: `
      SELECT 
        u.id, u.name, u.email, u.phone, u.role, u.status, u.created_at,
        up.plan_id,
        p.name_ar as plan_name,
        p.color as plan_color,
        p.logo as plan_logo,
        up.status as subscription_status,
        up.expires_at as subscription_expires
      FROM users u
      LEFT JOIN user_plans up ON up.user_id = u.id AND (up.expires_at IS NULL OR up.expires_at > NOW()) AND up.status = 'active'
      LEFT JOIN plans p ON up.plan_id = p.id
      ${whereClause}
      ORDER BY u.created_at DESC`,
    countQuery: `
      SELECT COUNT(*) as total FROM users u
      LEFT JOIN user_plans up ON up.user_id = u.id AND (up.expires_at IS NULL OR up.expires_at > NOW()) AND up.status = 'active'
      ${whereClause}`,
    params,
    pagination: { page, limit, offset }
  });
  
  // Add auth_provider field (default to 'email' since oauth_provider column may not exist in production)
  const usersWithAuth = result.data.map(user => ({
    ...user,
    auth_provider: 'email'
  }));
  
  res.json({ users: usersWithAuth, pagination: result.pagination });
}));

router.get("/users/find-by-email", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const email = req.query.email?.trim().toLowerCase();
  
  if (!email) {
    return res.status(400).json({ error: "البريد الإلكتروني مطلوب" });
  }
  
  const result = await db.query(
    `SELECT id, name, email, phone, role, status, created_at 
     FROM users WHERE LOWER(email) = $1`,
    [email]
  );
  
  if (result.rows.length === 0) {
    return res.json({ found: false, message: "لم يتم العثور على المستخدم" });
  }
  
  res.json({ found: true, user: result.rows[0] });
}));

router.get("/users/stats", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const CACHE_KEY = 'admin:users-stats';
  
  const statsResult = await db.cachedQuery(CACHE_KEY, `
    WITH user_counts AS (
      SELECT 
        COUNT(*) FILTER (WHERE role = 'user')::int as total,
        COUNT(*) FILTER (WHERE role = 'user' AND status = 'active')::int as active,
        COUNT(*) FILTER (WHERE role = 'user' AND status = 'on_hold')::int as on_hold,
        COUNT(*) FILTER (WHERE role = 'user' AND status = 'under_review')::int as under_review
      FROM users
    ),
    expired_count AS (
      SELECT COUNT(DISTINCT u.id)::int as expired
      FROM users u
      WHERE u.role = 'user' 
        AND NOT EXISTS (SELECT 1 FROM user_plans up WHERE up.user_id = u.id AND (up.expires_at IS NULL OR up.expires_at > NOW()) AND up.status = 'active')
    ),
    plan_counts AS (
      SELECT 
        p.id as plan_id,
        p.name_ar as plan_name,
        p.color as plan_color,
        p.logo as plan_logo,
        p.sort_order,
        COUNT(DISTINCT CASE WHEN u.role = 'user' AND (up.expires_at IS NULL OR up.expires_at > NOW()) AND up.status = 'active' THEN u.id END)::int as count
      FROM plans p
      LEFT JOIN user_plans up ON up.plan_id = p.id
      LEFT JOIN users u ON up.user_id = u.id
      WHERE p.visible = true
      GROUP BY p.id, p.name_ar, p.color, p.logo, p.sort_order
    )
    SELECT 
      (SELECT total FROM user_counts) as total,
      (SELECT active FROM user_counts) as active,
      (SELECT on_hold FROM user_counts) as on_hold,
      (SELECT under_review FROM user_counts) as under_review,
      (SELECT expired FROM expired_count) as expired,
      (SELECT json_agg(row_to_json(pc.*) ORDER BY pc.sort_order) FROM plan_counts pc) as by_plan
  `, [], 30000);
  
  const row = statsResult.rows[0] || {};
  
  res.json({
    total: row.total || 0,
    active: row.active || 0,
    onHold: row.on_hold || 0,
    underReview: row.under_review || 0,
    expired: row.expired || 0,
    byPlan: (row.by_plan || []).map(p => ({
      plan_id: p.plan_id,
      plan_name: p.plan_name,
      plan_color: p.plan_color,
      plan_logo: p.plan_logo,
      count: p.count || 0
    }))
  });
}));

router.get("/complaints/stats", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT 
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE status = 'new')::int as new,
      COUNT(*) FILTER (WHERE status = 'pending')::int as pending,
      COUNT(*) FILTER (WHERE status = 'in_progress')::int as in_progress,
      COUNT(*) FILTER (WHERE status = 'resolved')::int as resolved
    FROM account_complaints
  `);
  res.json(result.rows[0] || { total: 0, new: 0, pending: 0, in_progress: 0, resolved: 0 });
}));

router.patch("/users/:id/status", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  const validStatuses = ["active", "on_hold", "under_review", "blocked"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: "الحالة غير صالحة" });
  }
  
  const result = await db.query(
    "UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, email, status",
    [status, id]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "المستخدم غير موجود" });
  }
  
  const statusMessages = {
    active: "تم تفعيل الحساب",
    on_hold: "تم إيقاف الحساب مؤقتاً",
    under_review: "تم وضع الحساب تحت التدقيق",
    blocked: "تم حظر المستخدم"
  };
  
  res.json({ ok: true, user: result.rows[0], message: statusMessages[status] });
}));

router.patch("/users/:id/verify-email", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await db.query(
    "UPDATE users SET email_verified = true, email_verified_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING id, name, email, email_verified",
    [id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "المستخدم غير موجود" });
  }
  res.json({ ok: true, user: result.rows[0], message: "تم تفعيل البريد الإلكتروني بنجاح" });
}));

router.delete("/users/:id", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const user = await userService.getUserById(id);
  if (!user) {
    return res.status(404).json({ error: "المستخدم غير موجود" });
  }
  if (ADMIN_ROLES.includes(user.role)) {
    return res.status(400).json({ error: "لا يمكن حذف مدير" });
  }
  
  await userService.deleteUserCascade(id);
  
  await logAdminAction(req, AUDIT_ACTIONS.USER_DELETE, 'user', id, { 
    userName: user.name,
    userEmail: user.email 
  });
  
  res.json({ ok: true, message: "تم حذف المستخدم بنجاح" });
}));

router.get("/membership/requests", authMiddleware, requireRoles('finance_admin'), asyncHandler(async (req, res) => {
  const { status } = req.query;
  
  let query = `
    SELECT 
      mr.*,
      u.name as user_name,
      u.email as user_email,
      u.phone as user_phone,
      p.name_ar as plan_name,
      p.price as plan_price,
      reviewer.name as reviewer_name
    FROM membership_requests mr
    JOIN users u ON mr.user_id = u.id
    LEFT JOIN plans p ON mr.plan_id = p.id
    LEFT JOIN users reviewer ON mr.reviewed_by = reviewer.id
  `;
  
  const params = [];
  if (status && ["pending", "approved", "rejected"].includes(status)) {
    query += " WHERE mr.status = $1";
    params.push(status);
  }
  
  query += " ORDER BY mr.created_at DESC";
  
  const result = await db.query(query, params);
  res.json({ requests: result.rows });
}));

router.patch("/membership/requests/:id/approve", authMiddleware, requireRoles('finance_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const reviewerId = req.user.id;
  
  const requestCheck = await db.query(
    "SELECT * FROM membership_requests WHERE id = $1",
    [id]
  );
  
  if (requestCheck.rows.length === 0) {
    return res.status(404).json({ error: "الطلب غير موجود" });
  }
  
  const request = requestCheck.rows[0];
  if (request.status !== "pending") {
    return res.status(400).json({ error: "الطلب تم معالجته مسبقاً" });
  }
  
  await db.query(
    `UPDATE membership_requests 
     SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), updated_at = NOW()
     WHERE id = $2`,
    [reviewerId, id]
  );
  
  if (request.request_type === "admin_promotion") {
    await db.query(
      "UPDATE users SET role = 'admin', updated_at = NOW() WHERE id = $1",
      [request.user_id]
    );
  } else if (request.plan_id) {
    const plan = await db.query("SELECT duration_days FROM plans WHERE id = $1", [request.plan_id]);
    const durationDays = plan.rows[0]?.duration_days || 30;
    
    await db.query(
      `INSERT INTO user_plans (user_id, plan_id, started_at, expires_at)
       VALUES ($1, $2, NOW(), NOW() + INTERVAL '1 day' * $3)
       ON CONFLICT (user_id, plan_id) 
       DO UPDATE SET started_at = NOW(), expires_at = NOW() + INTERVAL '1 day' * $3`,
      [request.user_id, request.plan_id, durationDays]
    );
  }
  
  await db.query(
    `INSERT INTO notifications (user_id, title, body, type, created_at)
     VALUES ($1, 'تمت الموافقة على طلبك', 'تم قبول طلب العضوية الخاص بك. مرحباً بك!', 'membership_approved', NOW())`,
    [request.user_id]
  );
  
  res.json({ ok: true, message: "تمت الموافقة على الطلب" });
}));

router.patch("/membership/requests/:id/reject", authMiddleware, requireRoles('finance_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;
  const reviewerId = req.user.id;
  
  const requestCheck = await db.query(
    "SELECT * FROM membership_requests WHERE id = $1",
    [id]
  );
  
  if (requestCheck.rows.length === 0) {
    return res.status(404).json({ error: "الطلب غير موجود" });
  }
  
  if (requestCheck.rows[0].status !== "pending") {
    return res.status(400).json({ error: "الطلب تم معالجته مسبقاً" });
  }
  
  await db.query(
    `UPDATE membership_requests 
     SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), admin_note = $2, updated_at = NOW()
     WHERE id = $3`,
    [reviewerId, note || null, id]
  );
  
  await db.query(
    `INSERT INTO notifications (user_id, title, body, type, created_at)
     VALUES ($1, 'تم رفض طلبك', $2, 'membership_rejected', NOW())`,
    [requestCheck.rows[0].user_id, note || "تم رفض طلب العضوية. يرجى التواصل مع الدعم لمزيد من المعلومات."]
  );
  
  res.json({ ok: true, message: "تم رفض الطلب" });
}));

router.get("/membership/stats", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'approved') as approved,
      COUNT(*) FILTER (WHERE status = 'rejected') as rejected
    FROM membership_requests
  `);
  res.json(result.rows[0]);
}));

// ========== إدارة الإعلانات ==========

router.get("/listings", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { status } = req.query;
  let query = `
    SELECT 
      p.*,
      u.name as owner_name,
      u.email as owner_email,
      u.phone as owner_phone,
      reviewer.name as reviewer_name
    FROM properties p
    LEFT JOIN users u ON p.user_id = u.id
    LEFT JOIN users reviewer ON p.reviewed_by = reviewer.id
  `;
  
  const params = [];
  if (status && ["pending", "approved", "rejected", "hidden"].includes(status)) {
    query += " WHERE p.status = $1";
    params.push(status);
  }
  
  query += " ORDER BY p.created_at DESC";
  
  const result = await db.query(query, params);
  
  const listingsWithMedia = await Promise.all(result.rows.map(async (listing) => {
    const videosResult = await db.query(
      `SELECT url, kind FROM listing_media 
       WHERE listing_id = $1 AND kind = 'video' 
       ORDER BY sort_order`,
      [listing.id]
    );
    
    return {
      ...listing,
      image_url: listing.cover_image || (listing.images && listing.images[0]) || null,
      videos: videosResult.rows.map(v => v.url)
    };
  }));
  
  res.json({ listings: listingsWithMedia });
}));

router.get("/listings/stats", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT 
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE status = 'pending')::int as pending,
      COUNT(*) FILTER (WHERE status = 'in_review')::int as in_review,
      COUNT(*) FILTER (WHERE status = 'approved')::int as approved,
      COUNT(*) FILTER (WHERE status = 'rejected')::int as rejected,
      COUNT(*) FILTER (WHERE status = 'hidden')::int as hidden,
      COUNT(DISTINCT city) as cities
    FROM properties
  `);
  res.json(result.rows[0]);
}));

router.get("/dashboard/advanced-stats", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const [
    listingsStats,
    eliteStats,
    cityStats,
    subscriptionStats,
    revenueStats,
    weeklyListings,
    propertyTypes
  ] = await Promise.all([
    db.query(`
      SELECT 
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'approved')::int as approved,
        COUNT(*) FILTER (WHERE status = 'pending')::int as pending,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int as new_this_week,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int as new_this_month
      FROM properties
    `),
    db.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'active')::int as active_slots,
        COUNT(*) FILTER (WHERE status = 'pending_approval')::int as pending_approval,
        COUNT(*) FILTER (WHERE status = 'pending_payment')::int as pending_payment,
        COUNT(DISTINCT property_id) as unique_properties
      FROM elite_slot_reservations
    `),
    db.query(`
      SELECT city, COUNT(*)::int as count
      FROM properties
      WHERE city IS NOT NULL AND city != ''
      GROUP BY city
      ORDER BY count DESC
      LIMIT 6
    `),
    db.query(`
      SELECT 
        COUNT(*)::int as total_subscriptions,
        COUNT(*) FILTER (WHERE up.status = 'active')::int as active,
        COUNT(*) FILTER (WHERE p.name_ar ILIKE '%بزنس%' OR p.name_en ILIKE '%business%')::int as business,
        COUNT(*) FILTER (WHERE p.name_ar ILIKE '%بريميوم%' OR p.name_en ILIKE '%premium%')::int as premium,
        COUNT(*) FILTER (WHERE p.name_ar ILIKE '%أساسي%' OR p.name_en ILIKE '%basic%')::int as basic
      FROM user_plans up
      LEFT JOIN plans p ON up.plan_id = p.id
    `),
    db.query(`
      SELECT 
        COALESCE(SUM(p.price), 0)::numeric as total_revenue,
        COALESCE(SUM(CASE WHEN up.started_at > NOW() - INTERVAL '30 days' THEN p.price ELSE 0 END), 0)::numeric as this_month,
        COALESCE(SUM(CASE WHEN up.started_at > NOW() - INTERVAL '7 days' THEN p.price ELSE 0 END), 0)::numeric as this_week,
        COUNT(*)::int as total_transactions
      FROM user_plans up
      JOIN plans p ON up.plan_id = p.id
      WHERE up.status IN ('active', 'expired')
    `),
    db.query(`
      SELECT 
        DATE_TRUNC('day', created_at)::date as day,
        COUNT(*)::int as count
      FROM properties
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY day
    `),
    db.query(`
      SELECT type as property_type, COUNT(*)::int as count
      FROM properties
      WHERE type IS NOT NULL
      GROUP BY type
      ORDER BY count DESC
      LIMIT 5
    `)
  ]);

  res.json({
    listings: listingsStats.rows[0] || {},
    elite: eliteStats.rows[0] || { active_slots: 0, pending_approval: 0, pending_payment: 0, unique_properties: 0 },
    cities: cityStats.rows || [],
    subscriptions: subscriptionStats.rows[0] || {},
    revenue: revenueStats.rows[0] || { total_revenue: 0, this_month: 0, this_week: 0, total_transactions: 0 },
    weeklyListings: weeklyListings.rows || [],
    propertyTypes: propertyTypes.rows || []
  });
}));

router.get("/listings/:id", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await db.query(`
    SELECT 
      p.*,
      u.name as owner_name,
      u.email as owner_email,
      u.phone as owner_phone,
      reviewer.name as reviewer_name
    FROM properties p
    LEFT JOIN users u ON p.user_id = u.id
    LEFT JOIN users reviewer ON p.reviewed_by = reviewer.id
    WHERE p.id = $1
  `, [id]);
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "الإعلان غير موجود" });
  }
  
  const listing = result.rows[0];
  
  const mediaResult = await db.query(`
    SELECT id, url, kind, is_cover, sort_order
    FROM listing_media 
    WHERE listing_id = $1 
    ORDER BY is_cover DESC, sort_order ASC
  `, [id]);
  
  const images = mediaResult.rows.filter(m => m.kind === 'image' || !m.kind);
  const videos = mediaResult.rows.filter(m => m.kind === 'video');
  
  res.json({ 
    listing: {
      ...listing,
      images,
      videos
    }
  });
}));

router.delete("/listings/:id/media/:mediaId", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { id, mediaId } = req.params;
  
  const mediaResult = await db.query(`
    SELECT id, url, is_cover FROM listing_media WHERE id = $1 AND listing_id = $2
  `, [mediaId, id]);
  
  if (mediaResult.rows.length === 0) {
    return res.status(404).json({ error: "الصورة غير موجودة" });
  }
  
  const media = mediaResult.rows[0];
  
  await db.query(`DELETE FROM listing_media WHERE id = $1`, [mediaId]);
  
  if (media.is_cover) {
    await db.query(`
      UPDATE listing_media 
      SET is_cover = false 
      WHERE listing_id = $1
    `, [id]);
    
    const newCover = await db.query(`
      SELECT id, url FROM listing_media 
      WHERE listing_id = $1 AND (kind = 'image' OR kind IS NULL)
      ORDER BY sort_order ASC LIMIT 1
    `, [id]);
    
    if (newCover.rows.length > 0) {
      await db.query(`
        UPDATE listing_media SET is_cover = true WHERE id = $1
      `, [newCover.rows[0].id]);
      await db.query(`
        UPDATE properties SET cover_image = $1 WHERE id = $2
      `, [newCover.rows[0].url, id]);
    } else {
      await db.query(`
        UPDATE properties SET cover_image = NULL WHERE id = $1
      `, [id]);
    }
  }
  
  const listingResult = await db.query(`SELECT title, cover_image FROM properties WHERE id = $1`, [id]);
  await logAdminAction(req, 'media_delete', 'listing', id, { 
    media_id: mediaId,
    media_url: media.url,
    listing_title: listingResult.rows[0]?.title 
  });
  
  const updatedMedia = await db.query(`
    SELECT id, url, kind, is_cover, sort_order 
    FROM listing_media 
    WHERE listing_id = $1 
    ORDER BY sort_order ASC
  `, [id]);
  
  const images = updatedMedia.rows.filter(m => m.kind === 'image' || m.kind === null);
  const videos = updatedMedia.rows.filter(m => m.kind === 'video');
  
  res.json({ 
    success: true, 
    message: "تم حذف الصورة بنجاح",
    cover_image: listingResult.rows[0]?.cover_image,
    images,
    videos,
    remaining_count: images.length
  });
}));

router.patch("/listings/:id/approve", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const reviewerId = req.user.id;

  // Check current expires_at — fix it if null or already expired
  const existingResult = await db.query(`SELECT expires_at, plan_id FROM properties WHERE id = $1`, [id]);
  if (existingResult.rows.length === 0) {
    return res.status(404).json({ error: "الإعلان غير موجود" });
  }

  const existing = existingResult.rows[0];
  let newExpiresAt = existing.expires_at;

  if (!newExpiresAt || new Date(newExpiresAt) <= new Date()) {
    let durationDays = 30;
    if (existing.plan_id) {
      const planResult = await db.query(`SELECT duration_days FROM plans WHERE id = $1`, [existing.plan_id]);
      if (planResult.rows.length > 0 && planResult.rows[0].duration_days) {
        durationDays = planResult.rows[0].duration_days;
      }
    }
    newExpiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
  }

  const result = await db.query(
    `UPDATE properties 
     SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), updated_at = NOW(), rejection_reason = NULL,
         expires_at = $3
     WHERE id = $2 RETURNING *`,
    [reviewerId, id, newExpiresAt]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "الإعلان غير موجود" });
  }

  // Invalidate listings cache so approved listing appears immediately
  try { db.cache.invalidateFor('properties'); } catch (_) {}
  
  const listing = result.rows[0];
  
  const pendingElite = await db.query(`
    SELECT id FROM elite_slot_reservations 
    WHERE property_id = $1 AND status = 'pending_approval'
  `, [id]);
  
  const hasPendingElite = pendingElite.rows.length > 0;
  
  if (listing.user_id) {
    const payload = JSON.stringify({
      listing_id: id,
      listing_title: listing.title,
      action: 'approved',
      has_pending_elite: hasPendingElite
    });
    await db.query(
      `INSERT INTO notifications (user_id, title, body, type, listing_id, payload, status, scheduled_at, created_at)
       VALUES ($1, 'تمت الموافقة على إعلانك', $2, 'listing_approved', $3, $4::jsonb, 'sent', NOW(), NOW())`,
      [listing.user_id, `تم قبول إعلانك "${listing.title}" وهو الآن مرئي للجميع${hasPendingElite ? '. حجزك في نخبة العقارات قيد المراجعة.' : ''}`, id, payload]
    );
  }
  
  await logAdminAction(req, AUDIT_ACTIONS.LISTING_APPROVE, 'listing', id, { title: listing.title, hasPendingElite });
  
  res.json({ ok: true, message: "تمت الموافقة على الإعلان", listing: result.rows[0], hasPendingElite });
}));

router.patch("/listings/:id/reject", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const reviewerId = req.user.id;
  
  const result = await db.query(
    `UPDATE properties 
     SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), updated_at = NOW(), rejection_reason = $2
     WHERE id = $3 RETURNING *`,
    [reviewerId, reason || null, id]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "الإعلان غير موجود" });
  }
  
  const listing = result.rows[0];
  let eliteRefunded = false;
  let refundAmount = 0;
  
  const eliteReservation = await db.query(`
    SELECT esr.*, esp.price_per_slot, esp.start_date, esp.end_date
    FROM elite_slot_reservations esr
    LEFT JOIN elite_slot_periods esp ON esr.period_id = esp.id
    WHERE esr.property_id = $1 AND esr.status IN ('confirmed', 'held', 'pending_approval')
  `, [id]);
  
  if (eliteReservation.rows.length > 0) {
    const reservation = eliteReservation.rows[0];
    refundAmount = parseFloat(reservation.price_per_slot || reservation.amount_paid || 0);
    
    await db.query(`
      UPDATE elite_slot_reservations 
      SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = 'تم إلغاء الحجز تلقائياً بسبب رفض الإعلان'
      WHERE id = $1
    `, [reservation.id]);
    
    if (refundAmount > 0 && listing.user_id) {
      await db.query(`
        INSERT INTO refunds (user_id, amount, reason, status, decision_note, decided_at, decided_by)
        VALUES ($1, $2, $3, 'approved', $4, NOW(), $5)
        RETURNING *
      `, [
        listing.user_id, 
        refundAmount, 
        `استرداد تلقائي - إلغاء حجز النخبة بسبب رفض الإعلان: ${listing.title}`,
        'تم الاسترداد تلقائياً بسبب رفض الإعلان من قبل الإدارة',
        reviewerId
      ]);
      
      const invoiceNumber = `REF-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      await db.query(`
        INSERT INTO invoices (
          user_id, invoice_number, invoice_type, amount, vat_amount, total_amount, 
          status, description, created_at
        ) VALUES ($1, $2, 'refund', $3, 0, $3, 'completed', $4, NOW())
      `, [
        listing.user_id, 
        invoiceNumber, 
        refundAmount,
        `فاتورة استرداد - إلغاء حجز النخبة للإعلان: ${listing.title}`
      ]);
      
      eliteRefunded = true;
      
      await db.query(`
        INSERT INTO notifications (user_id, title, body, type, status, created_at)
        VALUES ($1, 'تم استرداد مبلغ حجز النخبة', $2, 'refund_approved', 'sent', NOW())
      `, [
        listing.user_id,
        `تم استرداد مبلغ ${refundAmount.toLocaleString('ar-SA')} ر.س تلقائياً بسبب رفض إعلانك "${listing.title}". سيتم تحويل المبلغ لحسابك قريباً.`
      ]);
    }
  }
  
  if (listing.user_id) {
    const payload = JSON.stringify({
      listing_id: id,
      listing_title: listing.title,
      action: 'rejected',
      reason: reason || null,
      elite_refunded: eliteRefunded,
      refund_amount: refundAmount
    });
    
    let notificationBody = reason || `تم رفض إعلانك "${listing.title}". يرجى مراجعته وإعادة تقديمه.`;
    if (eliteRefunded) {
      notificationBody += ` | تم إلغاء حجز النخبة واسترداد ${refundAmount.toLocaleString('ar-SA')} ر.س تلقائياً.`;
    }
    
    await db.query(
      `INSERT INTO notifications (user_id, title, body, type, listing_id, payload, status, scheduled_at, created_at)
       VALUES ($1, 'تم رفض إعلانك', $2, 'listing_rejected', $3, $4::jsonb, 'sent', NOW(), NOW())`,
      [listing.user_id, notificationBody, id, payload]
    );
  }
  
  await logAdminAction(req, AUDIT_ACTIONS.LISTING_REJECT, 'listing', id, { title: listing.title, reason, eliteRefunded, refundAmount });
  
  res.json({ 
    ok: true, 
    message: eliteRefunded 
      ? `تم رفض الإعلان وإلغاء حجز النخبة واسترداد ${refundAmount.toLocaleString('ar-SA')} ر.س تلقائياً` 
      : "تم رفض الإعلان", 
    listing: result.rows[0],
    eliteRefunded,
    refundAmount
  });
}));

router.patch("/listings/:id/in-review", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const result = await db.query(
    `UPDATE properties SET status = 'in_review', updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "الإعلان غير موجود" });
  }
  
  res.json({ ok: true, message: "تم نقل الإعلان لقيد المراجعة", listing: result.rows[0] });
}));

router.patch("/listings/:id/hide", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const result = await db.query(
    `UPDATE properties SET status = 'hidden', updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "الإعلان غير موجود" });
  }
  
  // تحرير موقع النخبة إذا كان محجوزًا لهذا الإعلان
  const eliteRelease = await db.query(`
    UPDATE elite_slot_reservations 
    SET status = 'cancelled', updated_at = NOW(), admin_notes = 'تم الإلغاء تلقائياً بسبب إخفاء الإعلان'
    WHERE property_id = $1 AND status IN ('confirmed', 'pending_approval')
    RETURNING slot_id
  `, [id]);
  
  const eliteReleased = eliteRelease.rows.length > 0;
  
  res.json({ 
    ok: true, 
    message: eliteReleased 
      ? "تم إخفاء الإعلان وتحرير موقع النخبة" 
      : "تم إخفاء الإعلان", 
    listing: result.rows[0],
    eliteReleased
  });
}));

router.patch("/listings/:id/show", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const result = await db.query(
    `UPDATE properties SET status = 'approved', updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "الإعلان غير موجود" });
  }
  
  res.json({ ok: true, message: "تم إظهار الإعلان", listing: result.rows[0] });
}));

router.delete("/listings/:id", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const listing = await listingService.getListingById(id);
  if (!listing) {
    return res.status(404).json({ error: "الإعلان غير موجود" });
  }
  
  await listingService.deleteListingCascade(id);
  
  if (listing.user_id) {
    await listingService.createNotification(
      listing.user_id,
      'تم حذف إعلانك',
      `تم حذف إعلانك "${listing.title}" من قبل الإدارة`,
      'listing_deleted'
    );
  }
  
  res.json({ ok: true, message: "تم حذف الإعلان بنجاح" });
}));

router.get("/customer-conversations", authMiddleware, requireRoles('super_admin', 'support_admin'), asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, date } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let whereClause = "WHERE 1=1";
  const params = [];
  let paramIndex = 1;

  if (search) {
    whereClause += ` AND (COALESCE(u1.name, 'مستخدم محذوف') ILIKE $${paramIndex} OR COALESCE(u2.name, 'مستخدم محذوف') ILIKE $${paramIndex} OR COALESCE(p.title, 'إعلان محذوف') ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  if (date) {
    whereClause += ` AND DATE(conv.last_message_at) = $${paramIndex}`;
    params.push(date);
    paramIndex++;
  }

  const countResult = await db.query(
    `SELECT COUNT(*) as total
     FROM (
       SELECT 
         LEAST(lm.sender_id, lm.recipient_id) as user1_id,
         GREATEST(lm.sender_id, lm.recipient_id) as user2_id,
         lm.listing_id,
         MAX(lm.created_at) as last_message_at
       FROM listing_messages lm
       GROUP BY LEAST(lm.sender_id, lm.recipient_id), GREATEST(lm.sender_id, lm.recipient_id), lm.listing_id
     ) conv
     LEFT JOIN users u1 ON conv.user1_id = u1.id
     LEFT JOIN users u2 ON conv.user2_id = u2.id
     LEFT JOIN properties p ON conv.listing_id = p.id
     ${whereClause}`,
    params
  );

  const conversationsResult = await db.query(
    `SELECT 
      conv.user1_id || '___' || conv.user2_id || '___' || conv.listing_id as id,
      conv.user1_id,
      COALESCE(u1.name, 'مستخدم محذوف') as user1_name,
      conv.user2_id,
      COALESCE(u2.name, 'مستخدم محذوف') as user2_name,
      conv.listing_id,
      COALESCE(p.title, 'إعلان محذوف') as listing_title,
      conv.message_count,
      COALESCE(last_msg.message, '') as last_message,
      conv.last_message_at
     FROM (
       SELECT 
         LEAST(lm.sender_id, lm.recipient_id) as user1_id,
         GREATEST(lm.sender_id, lm.recipient_id) as user2_id,
         lm.listing_id,
         COUNT(*) as message_count,
         MAX(lm.created_at) as last_message_at
       FROM listing_messages lm
       GROUP BY LEAST(lm.sender_id, lm.recipient_id), GREATEST(lm.sender_id, lm.recipient_id), lm.listing_id
     ) conv
     LEFT JOIN users u1 ON conv.user1_id = u1.id
     LEFT JOIN users u2 ON conv.user2_id = u2.id
     LEFT JOIN properties p ON conv.listing_id = p.id
     LEFT JOIN LATERAL (
       SELECT message FROM listing_messages lm2
       WHERE LEAST(lm2.sender_id, lm2.recipient_id) = conv.user1_id
       AND GREATEST(lm2.sender_id, lm2.recipient_id) = conv.user2_id
       AND lm2.listing_id = conv.listing_id
       ORDER BY lm2.created_at DESC LIMIT 1
     ) last_msg ON true
     ${whereClause}
     ORDER BY conv.last_message_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, parseInt(limit), offset]
  );

  res.json({
    conversations: conversationsResult.rows,
    total: parseInt(countResult.rows[0]?.total) || 0,
    page: parseInt(page),
    limit: parseInt(limit)
  });
}));

router.get("/customer-conversations/:id", authMiddleware, requireRoles('super_admin', 'support_admin'), asyncHandler(async (req, res) => {
  const convId = req.params.id;
  const parts = convId.split("___");
  
  if (parts.length !== 3) {
    return res.status(400).json({ error: "معرف المحادثة غير صحيح" });
  }
  
  const [user1Id, user2Id, listingId] = parts;

  if (!user1Id || !user2Id || !listingId) {
    return res.status(400).json({ error: "معرف المحادثة غير صحيح" });
  }

  const user1Result = await db.query("SELECT name FROM users WHERE id = $1", [user1Id]);
  const user2Result = await db.query("SELECT name FROM users WHERE id = $1", [user2Id]);
  const listingResult = await db.query("SELECT title FROM properties WHERE id = $1", [listingId]);

  const messagesResult = await db.query(
    `SELECT 
      lm.id,
      lm.sender_id,
      COALESCE(u.name, 'مستخدم محذوف') as sender_name,
      lm.message as content,
      lm.created_at
     FROM listing_messages lm
     LEFT JOIN users u ON lm.sender_id = u.id
     WHERE ((lm.sender_id = $1 AND lm.recipient_id = $2) OR (lm.sender_id = $2 AND lm.recipient_id = $1))
     AND lm.listing_id = $3
     ORDER BY lm.created_at ASC`,
    [user1Id, user2Id, listingId]
  );

  const flagResult = await db.query(
    `SELECT * FROM flagged_conversations 
     WHERE user1_id = $1 AND user2_id = $2 AND listing_id = $3`,
    [user1Id, user2Id, listingId]
  );

  res.json({
    id: convId,
    user1_id: user1Id,
    user2_id: user2Id,
    listing_id: listingId,
    user1_name: user1Result.rows[0]?.name || "مستخدم محذوف",
    user2_name: user2Result.rows[0]?.name || "مستخدم محذوف",
    listing_title: listingResult.rows[0]?.title || "إعلان محذوف",
    messages: messagesResult.rows,
    flag: flagResult.rows[0] || null
  });
}));

router.get("/customer-history/:userId", authMiddleware, requireRoles('super_admin', 'support_admin'), asyncHandler(async (req, res) => {
  const { userId } = req.params;
  
  const userResult = await db.query(
    `SELECT id, name, email, phone, role, created_at, status FROM users WHERE id = $1`,
    [userId]
  );
  
  if (userResult.rows.length === 0) {
    return res.status(404).json({ error: "العميل غير موجود" });
  }
  
  const conversationsResult = await db.query(
    `SELECT 
      CASE WHEN lm.sender_id = $1 THEN lm.recipient_id ELSE lm.sender_id END as other_user_id,
      COALESCE(u.name, 'مستخدم محذوف') as other_user_name,
      lm.listing_id,
      COALESCE(p.title, 'إعلان محذوف') as listing_title,
      COUNT(*) as message_count,
      SUM(CASE WHEN lm.sender_id = $1 THEN 1 ELSE 0 END) as sent_count,
      SUM(CASE WHEN lm.recipient_id = $1 THEN 1 ELSE 0 END) as received_count,
      MIN(lm.created_at) as first_message_at,
      MAX(lm.created_at) as last_message_at
     FROM listing_messages lm
     LEFT JOIN users u ON (CASE WHEN lm.sender_id = $1 THEN lm.recipient_id ELSE lm.sender_id END) = u.id
     LEFT JOIN properties p ON lm.listing_id = p.id
     WHERE lm.sender_id = $1 OR lm.recipient_id = $1
     GROUP BY other_user_id, u.name, lm.listing_id, p.title
     ORDER BY last_message_at DESC`,
    [userId]
  );
  
  const flagsResult = await db.query(
    `SELECT * FROM flagged_conversations 
     WHERE user1_id = $1 OR user2_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  
  const statsResult = await db.query(
    `SELECT 
      COUNT(DISTINCT CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END) as unique_contacts,
      COUNT(*) as total_messages,
      SUM(CASE WHEN sender_id = $1 THEN 1 ELSE 0 END) as sent_messages,
      SUM(CASE WHEN recipient_id = $1 THEN 1 ELSE 0 END) as received_messages,
      COUNT(DISTINCT listing_id) as listings_discussed
     FROM listing_messages
     WHERE sender_id = $1 OR recipient_id = $1`,
    [userId]
  );
  
  res.json({
    user: userResult.rows[0],
    conversations: conversationsResult.rows,
    flags: flagsResult.rows,
    stats: statsResult.rows[0]
  });
}));

router.post("/flag-conversation", authMiddleware, requireRoles('super_admin', 'support_admin'), asyncHandler(async (req, res) => {
  const { user1_id, user2_id, listing_id, flag_type, flag_reason, ai_analysis, ai_risk_score, intent_category } = req.body;
  const flaggedBy = req.user.id;
  
  const existingFlag = await db.query(
    `SELECT id FROM flagged_conversations 
     WHERE user1_id = LEAST($1::uuid, $2::uuid) AND user2_id = GREATEST($1::uuid, $2::uuid)
     AND listing_id = $3 AND status != 'resolved'`,
    [user1_id, user2_id, listing_id]
  );
  
  if (existingFlag.rows.length > 0) {
    return res.status(400).json({ error: "هذه المحادثة موسومة مسبقاً" });
  }

  const intent =
    intent_category && typeof intent_category === "string"
      ? intent_category.trim().toLowerCase().replace(/[\s-]+/g, "_").slice(0, 100) || null
      : null;
  
  const result = await db.query(
    `INSERT INTO flagged_conversations 
     (user1_id, user2_id, listing_id, flag_type, intent_category, flag_reason, ai_analysis, ai_risk_score, flagged_by)
     VALUES (LEAST($1::uuid, $2::uuid), GREATEST($1::uuid, $2::uuid), $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [user1_id, user2_id, listing_id, flag_type || 'suspicious', intent, flag_reason, ai_analysis, ai_risk_score || 0, flaggedBy]
  );
  
  res.json({ ok: true, flag: result.rows[0] });
}));

router.patch("/flag-conversation/:id", authMiddleware, requireRoles('super_admin', 'support_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, admin_note } = req.body;
  const reviewedBy = req.user.id;
  
  const result = await db.query(
    `UPDATE flagged_conversations 
     SET status = $1, admin_note = $2, reviewed_by = $3, reviewed_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [status, admin_note, reviewedBy, id]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "الوسم غير موجود" });
  }
  
  res.json({ ok: true, flag: result.rows[0] });
}));

/** Hard-delete AI flag row only (does not delete listing_messages). super_admin / admin only. */
router.delete("/flag-conversation/:id", authMiddleware, requireRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await db.query(
    `DELETE FROM flagged_conversations WHERE id = $1 RETURNING id, listing_id, user1_id, user2_id`,
    [id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "الوسم غير موجود" });
  }
  const row = result.rows[0];
  await logAdminAction(req, AUDIT_ACTIONS.CONVERSATION_FLAG_DELETE, 'flagged_conversation', String(row.id), {
    listing_id: row.listing_id,
    user1_id: row.user1_id,
    user2_id: row.user2_id,
  });
  res.json({ ok: true, deletedId: row.id });
}));

router.get("/flagged-conversations", authMiddleware, requireRoles('super_admin', 'support_admin'), asyncHandler(async (req, res) => {
  const { status } = req.query;
  
  let query = `
    SELECT 
      fc.*,
      u1.name as user1_name,
      u2.name as user2_name,
      p.title as listing_title,
      fb.name as flagged_by_name,
      rb.name as reviewed_by_name
    FROM flagged_conversations fc
    LEFT JOIN users u1 ON fc.user1_id = u1.id
    LEFT JOIN users u2 ON fc.user2_id = u2.id
    LEFT JOIN properties p ON fc.listing_id = p.id
    LEFT JOIN users fb ON fc.flagged_by = fb.id
    LEFT JOIN users rb ON fc.reviewed_by = rb.id
  `;
  
  const params = [];
  if (status) {
    query += ` WHERE fc.status = $1`;
    params.push(status);
  }
  
  query += ` ORDER BY fc.created_at DESC`;
  
  const result = await db.query(query, params);
  
  res.json({ flags: result.rows });
}));

router.get("/conversation-stats", authMiddleware, requireRoles('super_admin', 'support_admin'), asyncHandler(async (req, res) => {
  const statsResult = await db.query(`
    SELECT 
      COUNT(DISTINCT LEAST(sender_id, recipient_id) || '-' || GREATEST(sender_id, recipient_id) || '-' || listing_id) as total_conversations,
      COUNT(*) as total_messages,
      COUNT(DISTINCT sender_id) as unique_senders,
      COUNT(DISTINCT listing_id) as listings_with_messages,
      (
        SELECT COUNT(*) FROM flagged_conversations fc
        WHERE fc.status = 'pending'
        AND fc.listing_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM listing_messages lm
          WHERE lm.listing_id = fc.listing_id
          AND LEAST(lm.sender_id, lm.recipient_id) = LEAST(fc.user1_id, fc.user2_id)
          AND GREATEST(lm.sender_id, lm.recipient_id) = GREATEST(fc.user1_id, fc.user2_id)
        )
      ) as pending_flags,
      (
        SELECT COUNT(*) FROM flagged_conversations fc
        WHERE fc.status = 'investigating'
        AND fc.listing_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM listing_messages lm
          WHERE lm.listing_id = fc.listing_id
          AND LEAST(lm.sender_id, lm.recipient_id) = LEAST(fc.user1_id, fc.user2_id)
          AND GREATEST(lm.sender_id, lm.recipient_id) = GREATEST(fc.user1_id, fc.user2_id)
        )
      ) as investigating_flags,
      (
        SELECT COUNT(*) FROM flagged_conversations fc
        WHERE fc.listing_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM listing_messages lm
          WHERE lm.listing_id = fc.listing_id
          AND LEAST(lm.sender_id, lm.recipient_id) = LEAST(fc.user1_id, fc.user2_id)
          AND GREATEST(lm.sender_id, lm.recipient_id) = GREATEST(fc.user1_id, fc.user2_id)
        )
      ) as total_flags
    FROM listing_messages
  `);
  
  const activeUsersResult = await db.query(`
    SELECT 
      u.id, u.name, u.email,
      COUNT(*) as message_count,
      COUNT(DISTINCT CASE WHEN lm.sender_id = u.id THEN lm.recipient_id ELSE lm.sender_id END) as unique_contacts
    FROM users u
    JOIN listing_messages lm ON u.id = lm.sender_id OR u.id = lm.recipient_id
    GROUP BY u.id, u.name, u.email
    ORDER BY message_count DESC
    LIMIT 10
  `);
  
  res.json({
    stats: statsResult.rows[0],
    activeUsers: activeUsersResult.rows
  });
}));

// ============================================
// 🔔 نظام تنبيهات الحساب - Account Alerts System
// ============================================

router.post("/send-alert", authMiddleware, requireRoles('super_admin', 'support_admin'), asyncHandler(async (req, res) => {
  const { user_id, alert_type, title, message, related_conversation_id, related_flag_id } = req.body;
  const admin_id = req.user.id;
  
  if (!user_id || !title || !message) {
    return res.status(400).json({ error: "الحقول المطلوبة: user_id, title, message" });
  }
  
  const userCheck = await db.query("SELECT id, name FROM users WHERE id = $1", [user_id]);
  if (userCheck.rows.length === 0) {
    return res.status(404).json({ error: "المستخدم غير موجود" });
  }
  
  const result = await db.query(`
    INSERT INTO account_alerts (user_id, admin_id, alert_type, title, message, related_conversation_id, related_flag_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [user_id, admin_id, alert_type || 'warning', title, message, related_conversation_id || null, related_flag_id || null]);
  
  console.log(`[ALERT] Admin ${req.user.name} sent ${alert_type} alert to user ${userCheck.rows[0].name}`);
  
  res.json({ 
    success: true, 
    alert: result.rows[0],
    message: `تم إرسال التنبيه إلى ${userCheck.rows[0].name}`
  });
}));

router.get("/sent-alerts", authMiddleware, requireRoles('super_admin', 'support_admin'), asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT 
      aa.*,
      u.name as user_name, u.email as user_email,
      a.name as admin_name
    FROM account_alerts aa
    LEFT JOIN users u ON aa.user_id = u.id
    LEFT JOIN users a ON aa.admin_id = a.id
    ORDER BY aa.created_at DESC
    LIMIT 100
  `);
  
  res.json({ alerts: result.rows });
}));

// ============================================
// ⚙️ نظام التحكم في الشريط الجانبي - Sidebar Visibility Control
// ============================================

router.get("/sidebar-settings", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT 
      s.*,
      u.name as updated_by_name
    FROM admin_sidebar_settings s
    LEFT JOIN users u ON s.updated_by = u.id
    ORDER BY s.sort_order ASC
  `);
  
  res.json({ settings: result.rows });
}));

router.patch("/sidebar-settings/:sectionKey", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const { sectionKey } = req.params;
  const { is_visible } = req.body;
  const adminId = req.user.id;
  
  if (typeof is_visible !== 'boolean') {
    return res.status(400).json({ error: "الحقل is_visible مطلوب ويجب أن يكون قيمة منطقية" });
  }
  
  if (sectionKey === 'dashboard' || sectionKey === 'settings') {
    return res.status(400).json({ error: "لا يمكن إخفاء لوحة التحكم أو الإعدادات" });
  }
  
  const result = await db.query(`
    UPDATE admin_sidebar_settings 
    SET is_visible = $1, updated_by = $2, updated_at = NOW()
    WHERE section_key = $3
    RETURNING *
  `, [is_visible, adminId, sectionKey]);
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "القسم غير موجود" });
  }
  
  await logAdminAction(req, AUDIT_ACTIONS.UPDATE_SIDEBAR_SETTINGS, 'admin_sidebar_settings', sectionKey, {
    section_key: sectionKey,
    is_visible,
    action: is_visible ? 'show' : 'hide'
  });
  
  console.log(`[SIDEBAR] Admin ${req.user.name} ${is_visible ? 'showed' : 'hid'} section: ${sectionKey}`);
  
  res.json({ 
    success: true, 
    setting: result.rows[0],
    message: is_visible ? 'تم إظهار القسم' : 'تم إخفاء القسم'
  });
}));

router.get("/sidebar-settings/visible", asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT section_key FROM admin_sidebar_settings WHERE is_visible = true ORDER BY sort_order
  `);
  
  res.json({ 
    visible_sections: result.rows.map(r => r.section_key)
  });
}));

// 🧹 تصفير بيانات التجارب
router.post("/reset-test-data", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const { categories } = req.body;
  if (!categories || !Array.isArray(categories) || categories.length === 0) {
    return res.status(400).json({ ok: false, error: "يجب تحديد فئة واحدة على الأقل" });
  }

  // منع التصفير في الإنتاج إلا بموافقة صريحة عبر متغير البيئة (طوارئ فقط)
  const isProduction = process.env.NODE_ENV === 'production';
  const allowResetInProd = String(process.env.ALLOW_RESET_TEST_DATA || '').toLowerCase() === 'true';
  if (isProduction && !allowResetInProd) {
    return res.status(403).json({
      ok: false,
      error: 'تصفير بيانات التجارب غير مسموح في بيئة الإنتاج. للطوارئ فقط: ضبط ALLOW_RESET_TEST_DATA=true في بيئة الخادم ثم إعادة التشغيل.',
    });
  }

  const validCategories = ['financial', 'messages', 'ambassador', 'ai_logs', 'whatsapp', 'notifications', 'customers'];
  const invalid = categories.filter(c => !validCategories.includes(c));
  if (invalid.length > 0) {
    return res.status(400).json({ ok: false, error: `فئات غير صالحة: ${invalid.join(', ')}` });
  }

  const results = {};
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    if (categories.includes('financial')) {
      const r0 = await client.query('DELETE FROM elite_extension_requests');
      const r4 = await client.query('DELETE FROM elite_slot_reservations');
      const r1 = await client.query('DELETE FROM refunds');
      const r2 = await client.query('DELETE FROM invoices');
      const r3 = await client.query('DELETE FROM payments');
      results.financial = {
        elite_extensions: r0.rowCount,
        elite_reservations: r4.rowCount,
        refunds: r1.rowCount,
        invoices: r2.rowCount,
        payments: r3.rowCount,
      };
    }

    if (categories.includes('messages')) {
      const r1 = await client.query('DELETE FROM messages');
      const r2 = await client.query('DELETE FROM conversations');
      const r3 = await client.query('DELETE FROM admin_messages');
      const r4 = await client.query('DELETE FROM admin_conversation_participants');
      const r5 = await client.query('DELETE FROM admin_conversations');
      results.messages = {
        messages: r1.rowCount,
        conversations: r2.rowCount,
        admin_messages: r3.rowCount,
        admin_participants: r4.rowCount,
        admin_conversations: r5.rowCount,
      };
    }

    if (categories.includes('ambassador')) {
      const r1 = await client.query('DELETE FROM wallet_transactions');
      const r2 = await client.query('DELETE FROM ambassador_withdrawal_requests');
      const r3 = await client.query('UPDATE ambassador_wallet SET balance_cents = 0, total_earned_cents = 0, total_withdrawn_cents = 0');
      const r4 = await client.query('UPDATE referrals SET status = $1 WHERE status != $1', ['completed']);
      results.ambassador = {
        wallet_transactions: r1.rowCount,
        withdrawal_requests: r2.rowCount,
        wallets_reset: r3.rowCount,
        referrals_reset: r4.rowCount,
      };
    }

    if (categories.includes('ai_logs')) {
      const r1 = await client.query('DELETE FROM ai_chat_logs');
      results.ai_logs = { chat_logs: r1.rowCount };
    }

    if (categories.includes('whatsapp')) {
      const r0 = await client.query('DELETE FROM whatsapp_conversations');
      const r1 = await client.query('DELETE FROM whatsapp_messages');
      const r2 = await client.query('DELETE FROM whatsapp_campaigns');
      results.whatsapp = {
        conversation_status: r0.rowCount,
        messages: r1.rowCount,
        campaigns: r2.rowCount,
      };
    }

    if (categories.includes('notifications')) {
      const r1 = await client.query('DELETE FROM notifications');
      const r2 = await client.query('DELETE FROM account_alerts');
      results.notifications = {
        notifications: r1.rowCount,
        alerts: r2.rowCount,
      };
    }

    if (categories.includes('customers')) {
      // شكاوى الحساب: user_id قد يصبح NULL عند حذف المستخدم (ON DELETE SET NULL) — نحذف الجدول بالكامل مع تصفير العملاء لضمان عدم بقاء سجلات تجريبية
      const rComplaints = await client.query('DELETE FROM account_complaints');
      await client.query('DELETE FROM messages');
      await client.query('DELETE FROM conversations');
      await client.query('DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE role = $1)', ['user']);
      await client.query('DELETE FROM account_alerts WHERE user_id IN (SELECT id FROM users WHERE role = $1)', ['user']);
      await client.query('DELETE FROM ai_chat_logs WHERE user_id IN (SELECT id FROM users WHERE role = $1)', ['user']);
      await client.query('DELETE FROM wallet_transactions WHERE user_id IN (SELECT id FROM users WHERE role = $1)', ['user']);
      await client.query('DELETE FROM ambassador_withdrawal_requests WHERE user_id IN (SELECT id FROM users WHERE role = $1)', ['user']);
      await client.query('DELETE FROM ambassador_wallet WHERE user_id IN (SELECT id FROM users WHERE role = $1)', ['user']);
      await client.query('DELETE FROM referrals WHERE referrer_id IN (SELECT id FROM users WHERE role = $1) OR referred_id IN (SELECT id FROM users WHERE role = $1)', ['user', 'user']);
      await client.query('DELETE FROM advertiser_reviews WHERE reviewer_id IN (SELECT id FROM users WHERE role = $1) OR advertiser_id IN (SELECT id FROM users WHERE role = $1)', ['user', 'user']);
      await client.query('DELETE FROM advertiser_reputation WHERE user_id IN (SELECT id FROM users WHERE role = $1)', ['user']);
      await client.query('DELETE FROM listing_media WHERE listing_id IN (SELECT id FROM properties WHERE user_id IN (SELECT id FROM users WHERE role = $1))', ['user']);
      await client.query('DELETE FROM elite_extension_requests WHERE user_id IN (SELECT id FROM users WHERE role = $1)', ['user']);
      await client.query('DELETE FROM elite_slot_reservations WHERE user_id IN (SELECT id FROM users WHERE role = $1)', ['user']);
      await client.query('DELETE FROM refunds WHERE user_id IN (SELECT id FROM users WHERE role = $1)', ['user']);
      await client.query('DELETE FROM invoices WHERE user_id IN (SELECT id FROM users WHERE role = $1)', ['user']);
      await client.query('DELETE FROM payments WHERE user_id IN (SELECT id FROM users WHERE role = $1)', ['user']);
      await client.query('DELETE FROM quota_buckets WHERE user_id IN (SELECT id FROM users WHERE role = $1)', ['user']);
      await client.query('DELETE FROM user_plans WHERE user_id IN (SELECT id FROM users WHERE role = $1)', ['user']);
      await client.query('DELETE FROM properties WHERE user_id IN (SELECT id FROM users WHERE role = $1)', ['user']);
      const r1 = await client.query('DELETE FROM users WHERE role = $1', ['user']);
      results.customers = {
        account_complaints: rComplaints.rowCount,
        deleted_users: r1.rowCount,
      };
    }

    await client.query('COMMIT');

    await logAdminAction(req, 'RESET_TEST_DATA', 'test_data', null, { categories, results });

    res.json({ ok: true, results });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Reset test data error:', err);
    res.status(500).json({ ok: false, error: "حدث خطأ أثناء تصفير البيانات" });
  } finally {
    client.release();
  }
}));

// 🧹 إحصائيات بيانات التجارب (عدد السجلات في كل جدول)
router.get("/reset-test-data/stats", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const tables = [
    { key: 'financial', queries: [
      { name: 'payments', q: 'SELECT COUNT(*) FROM payments' },
      { name: 'invoices', q: 'SELECT COUNT(*) FROM invoices' },
      { name: 'refunds', q: 'SELECT COUNT(*) FROM refunds' },
      { name: 'elite_reservations', q: 'SELECT COUNT(*) FROM elite_slot_reservations' },
      { name: 'elite_extensions', q: 'SELECT COUNT(*) FROM elite_extension_requests' },
    ]},
    { key: 'messages', queries: [
      { name: 'messages', q: 'SELECT COUNT(*) FROM messages' },
      { name: 'conversations', q: 'SELECT COUNT(*) FROM conversations' },
      { name: 'admin_messages', q: 'SELECT COUNT(*) FROM admin_messages' },
      { name: 'admin_conversations', q: 'SELECT COUNT(*) FROM admin_conversations' },
    ]},
    { key: 'ambassador', queries: [
      { name: 'wallet_transactions', q: 'SELECT COUNT(*) FROM wallet_transactions' },
      { name: 'withdrawal_requests', q: 'SELECT COUNT(*) FROM ambassador_withdrawal_requests' },
      { name: 'wallets', q: 'SELECT COUNT(*) FROM ambassador_wallet WHERE balance_cents > 0' },
    ]},
    { key: 'ai_logs', queries: [
      { name: 'chat_logs', q: 'SELECT COUNT(*) FROM ai_chat_logs' },
    ]},
    { key: 'whatsapp', queries: [
      { name: 'messages', q: 'SELECT COUNT(*) FROM whatsapp_messages' },
      { name: 'conversations', q: 'SELECT COUNT(*) FROM whatsapp_conversations' },
      { name: 'campaigns', q: 'SELECT COUNT(*) FROM whatsapp_campaigns' },
    ]},
    { key: 'notifications', queries: [
      { name: 'notifications', q: 'SELECT COUNT(*) FROM notifications' },
      { name: 'alerts', q: 'SELECT COUNT(*) FROM account_alerts' },
    ]},
    { key: 'customers', queries: [
      { name: 'users', q: "SELECT COUNT(*) FROM users WHERE role = 'user'" },
      { name: 'properties', q: "SELECT COUNT(*) FROM properties WHERE user_id IN (SELECT id FROM users WHERE role = 'user')" },
      { name: 'subscriptions', q: "SELECT COUNT(*) FROM user_plans WHERE user_id IN (SELECT id FROM users WHERE role = 'user')" },
    ]},
  ];

  const stats = {};
  for (const category of tables) {
    stats[category.key] = {};
    let total = 0;
    for (const item of category.queries) {
      try {
        const r = await db.query(item.q);
        const count = parseInt(r.rows[0].count);
        stats[category.key][item.name] = count;
        total += count;
      } catch {
        stats[category.key][item.name] = 0;
      }
    }
    stats[category.key]._total = total;
  }

  res.json({ ok: true, stats });
}));

module.exports = router;
