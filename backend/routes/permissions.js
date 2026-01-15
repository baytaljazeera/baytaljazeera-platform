const express = require("express");
const router = express.Router();
const db = require("../db");
const { authMiddleware, requireRoles } = require("../middleware/auth");
const { asyncHandler } = require('../middleware/asyncHandler');

const ALL_PERMISSIONS = [
  { key: 'dashboard', label: 'لوحة التحكم' },
  { key: 'listings', label: 'الإعلانات' },
  { key: 'reports', label: 'البلاغات' },
  { key: 'complaints', label: 'الشكاوى' },
  { key: 'support', label: 'الدعم الفني' },
  { key: 'messages', label: 'المراسلات الداخلية' },
  { key: 'news', label: 'شريط الأخبار' },
  { key: 'finance', label: 'المالية والاشتراكات' },
  { key: 'membership', label: 'طلبات العضوية' },
  { key: 'plans', label: 'إدارة الباقات' },
  { key: 'marketing', label: 'التسويق والدعاية' },
  { key: 'ambassador', label: 'سفراء البيت' },
  { key: 'ai_center', label: 'مركز الذكاء الاصطناعي' },
  { key: 'users', label: 'إدارة المستخدمين' },
  { key: 'roles', label: 'إدارة الصلاحيات' },
  { key: 'settings', label: 'الإعدادات' },
];

const DEFAULT_ADMIN_ROLES = [
  { key: 'content_admin', label: 'إدارة المحتوى', color: '#8B5CF6', icon: 'FileText', isDefault: true },
  { key: 'support_admin', label: 'الدعم الفني', color: '#3B82F6', icon: 'Headphones', isDefault: true },
  { key: 'finance_admin', label: 'إدارة المالية', color: '#10B981', icon: 'Wallet', isDefault: true },
  { key: 'admin_manager', label: 'مدير إداري', color: '#0EA5E9', icon: 'Settings', isDefault: true },
];

async function logAuditAction(action_type, data, req) {
  try {
    await db.query(
      `INSERT INTO permission_audit_log 
       (action_type, target_role, target_user_id, target_user_name, changed_by_id, changed_by_name, old_value, new_value, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        action_type,
        data.target_role || null,
        data.target_user_id || null,
        data.target_user_name || null,
        req.user?.id || 'system',
        req.user?.name || 'النظام',
        data.old_value ? JSON.stringify(data.old_value) : null,
        data.new_value ? JSON.stringify(data.new_value) : null,
        req.ip || req.headers['x-forwarded-for'] || 'unknown',
        req.headers['user-agent'] || 'unknown'
      ]
    );
  } catch (error) {
    console.error("Error logging audit action:", error);
  }
}

async function getAllRoles() {
  const customRolesResult = await db.query(
    "SELECT key, label, color, icon, description FROM custom_roles WHERE is_active = true ORDER BY created_at"
  );
  
  const customRoles = customRolesResult.rows.map(r => ({
    ...r,
    isDefault: false
  }));
  
  return [...DEFAULT_ADMIN_ROLES, ...customRoles];
}

router.get("/list", authMiddleware, requireRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const roles = await getAllRoles();
  res.json({
    permissions: ALL_PERMISSIONS,
    roles: roles
  });
}));

router.get("/role/:role", authMiddleware, requireRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const { role } = req.params;
  
  const result = await db.query(
    "SELECT permission_key, is_granted FROM role_permissions WHERE role = $1",
    [role]
  );
  
  const permissionsMap = {};
  result.rows.forEach(row => {
    permissionsMap[row.permission_key] = row.is_granted;
  });

  const permissions = ALL_PERMISSIONS.map(p => ({
    ...p,
    isGranted: permissionsMap[p.key] ?? false
  }));

  res.json({ role, permissions });
}));

router.get("/my-permissions", authMiddleware, asyncHandler(async (req, res) => {
  const userRole = req.user.role;
  
  if (userRole === 'super_admin' || userRole === 'admin') {
    const permissions = ALL_PERMISSIONS.map(p => p.key);
    return res.json({ permissions });
  }
  
  const result = await db.query(
    "SELECT permission_key FROM role_permissions WHERE role = $1 AND is_granted = true",
    [userRole]
  );
  
  const permissions = result.rows.map(row => row.permission_key);
  
  res.json({ permissions });
}));

router.put("/role/:role", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const { role } = req.params;
  const { permissions } = req.body;
  
  const allRoles = await getAllRoles();
  if (!allRoles.some(r => r.key === role)) {
    return res.status(400).json({ error: "دور غير صالح" });
  }
  
  const oldPermsResult = await db.query(
    "SELECT permission_key FROM role_permissions WHERE role = $1 AND is_granted = true",
    [role]
  );
  const oldPermissions = oldPermsResult.rows.map(r => r.permission_key);
  
  for (const perm of ALL_PERMISSIONS) {
    const isGranted = permissions.includes(perm.key);
    await db.query(
      `INSERT INTO role_permissions (role, permission_key, is_granted, updated_at) 
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP) 
       ON CONFLICT (role, permission_key) 
       DO UPDATE SET is_granted = $3, updated_at = CURRENT_TIMESTAMP`,
      [role, perm.key, isGranted]
    );
  }
  
  await logAuditAction('UPDATE_ROLE_PERMISSIONS', {
    target_role: role,
    old_value: { permissions: oldPermissions },
    new_value: { permissions }
  }, req);
  
  res.json({ message: "تم تحديث الصلاحيات بنجاح" });
}));

router.get("/audit-log", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, action_type } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  
  let whereClause = '';
  const params = [parseInt(limit), offset];
  
  if (action_type) {
    whereClause = 'WHERE action_type = $3';
    params.push(action_type);
  }
  
  const result = await db.query(
    `SELECT * FROM permission_audit_log ${whereClause} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    params
  );
  
  const countResult = await db.query(
    `SELECT COUNT(*) FROM permission_audit_log ${action_type ? 'WHERE action_type = $1' : ''}`,
    action_type ? [action_type] : []
  );
  
  res.json({
    logs: result.rows,
    total: parseInt(countResult.rows[0].count),
    page: parseInt(page),
    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit))
  });
}));

router.get("/custom-roles", authMiddleware, requireRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const result = await db.query(
    "SELECT * FROM custom_roles WHERE is_active = true ORDER BY created_at DESC"
  );
  res.json({ roles: result.rows });
}));

router.post("/custom-roles", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const { key, label, description, color, icon } = req.body;
  
  if (!key || !label) {
    return res.status(400).json({ error: "المفتاح والاسم مطلوبان" });
  }
  
  const keyRegex = /^[a-z][a-z0-9_]*$/;
  if (!keyRegex.test(key)) {
    return res.status(400).json({ error: "المفتاح يجب أن يبدأ بحرف ويحتوي على أحرف صغيرة وأرقام وشرطات سفلية فقط" });
  }
  
  const existingDefault = DEFAULT_ADMIN_ROLES.find(r => r.key === key);
  if (existingDefault) {
    return res.status(400).json({ error: "هذا المفتاح محجوز للأدوار الافتراضية" });
  }
  
  const existing = await db.query("SELECT id FROM custom_roles WHERE key = $1", [key]);
  if (existing.rows.length > 0) {
    return res.status(400).json({ error: "هذا المفتاح مستخدم بالفعل" });
  }
  
  const result = await db.query(
    `INSERT INTO custom_roles (key, label, description, color, icon, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [key, label, description || null, color || '#6B7280', icon || 'Shield', req.user.id]
  );
  
  await logAuditAction('CREATE_CUSTOM_ROLE', {
    target_role: key,
    new_value: { key, label, description, color, icon }
  }, req);
  
  res.status(201).json({ role: result.rows[0], message: "تم إنشاء الدور بنجاح" });
}));

router.put("/custom-roles/:key", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const { key } = req.params;
  const { label, description, color, icon } = req.body;
  
  const existing = await db.query("SELECT * FROM custom_roles WHERE key = $1", [key]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ error: "الدور غير موجود" });
  }
  
  const oldRole = existing.rows[0];
  
  const result = await db.query(
    `UPDATE custom_roles SET label = $1, description = $2, color = $3, icon = $4, updated_at = CURRENT_TIMESTAMP
     WHERE key = $5 RETURNING *`,
    [label || oldRole.label, description ?? oldRole.description, color || oldRole.color, icon || oldRole.icon, key]
  );
  
  await logAuditAction('UPDATE_CUSTOM_ROLE', {
    target_role: key,
    old_value: oldRole,
    new_value: result.rows[0]
  }, req);
  
  res.json({ role: result.rows[0], message: "تم تحديث الدور بنجاح" });
}));

router.delete("/custom-roles/:key", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const { key } = req.params;
  
  const existing = await db.query("SELECT * FROM custom_roles WHERE key = $1", [key]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ error: "الدور غير موجود" });
  }
  
  const usersWithRole = await db.query("SELECT COUNT(*) FROM users WHERE role = $1", [key]);
  if (parseInt(usersWithRole.rows[0].count) > 0) {
    return res.status(400).json({ 
      error: `لا يمكن حذف الدور لأنه مستخدم من قبل ${usersWithRole.rows[0].count} مستخدم` 
    });
  }
  
  await db.query("UPDATE custom_roles SET is_active = false WHERE key = $1", [key]);
  
  await db.query("DELETE FROM role_permissions WHERE role = $1", [key]);
  
  await logAuditAction('DELETE_CUSTOM_ROLE', {
    target_role: key,
    old_value: existing.rows[0]
  }, req);
  
  res.json({ message: "تم حذف الدور بنجاح" });
}));

module.exports = router;
