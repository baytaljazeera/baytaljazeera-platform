const express = require("express");
const router = express.Router();
const db = require("../db");
const { authMiddleware, requireRoles } = require("../middleware/auth");
const { asyncHandler } = require('../middleware/asyncHandler');

/** One-time data fix: canonical key for internal team messaging (Customer Service). */
async function ensureSupportInternalPermissionMigrated() {
  try {
    await db.query(`
      INSERT INTO role_permissions (role, permission_key, is_granted, updated_at)
      SELECT role, 'support_internal', is_granted, CURRENT_TIMESTAMP
      FROM role_permissions WHERE permission_key = 'messages'
      ON CONFLICT (role, permission_key) DO UPDATE SET
        is_granted = role_permissions.is_granted OR EXCLUDED.is_granted,
        updated_at = CURRENT_TIMESTAMP
    `);
    await db.query(`DELETE FROM role_permissions WHERE permission_key = 'messages'`);
  } catch (err) {
    console.warn("ensureSupportInternalPermissionMigrated:", err.message);
  }
}

const ALL_PERMISSIONS = [
  { key: 'dashboard', label: 'لوحة التحكم' },
  { key: 'listings', label: 'الإعلانات' },
  { key: 'reports', label: 'البلاغات' },
  { key: 'complaints', label: 'الشكاوى' },
  { key: 'support', label: 'الدعم الفني' },
  { key: 'support_internal', label: 'المراسلات الداخلية' },
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
  await ensureSupportInternalPermissionMigrated();
  const roles = await getAllRoles();
  res.json({
    permissions: ALL_PERMISSIONS,
    roles: roles
  });
}));

router.get("/role/:role", authMiddleware, requireRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  await ensureSupportInternalPermissionMigrated();
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
  await ensureSupportInternalPermissionMigrated();
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

/**
 * Phase 5 (in this PR's scope) — unified audit feed.
 *
 * Returns a merged, chronologically-sorted stream from BOTH audit tables:
 *   • permission_audit_log  (role / permission CRUD)
 *   • admin_audit_logs      (HR approvals, suspensions, password resets)
 *
 * Each row is normalized into a common shape:
 *   { source, action_type, target_role, target_user_id, target_user_name,
 *     changed_by_name, old_value, new_value, ip_address, user_agent,
 *     created_at }
 *
 * Backward-compat: the existing UI already reads logs[] with these field
 * names, so no frontend change is required for the basic display. New
 * `source` field distinguishes "permissions" vs "admin_action" so future
 * filters can layer on.
 */
router.get("/audit-log", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, action_type } = req.query;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  // We pull a generous slice from each source, merge, sort, then paginate
  // in-memory. Fine up to a few thousand rows total; if we ever cross
  // that we'll move to a UNION ALL view with a server-side cursor.
  const SLICE = 500;
  let permRows = [];
  let adminRows = [];

  try {
    const permRes = await db.query(
      action_type
        ? `SELECT 'permissions'::text AS source, action_type, target_role, target_user_id, target_user_name,
                  changed_by_id, changed_by_name, old_value, new_value, ip_address, user_agent, created_at
           FROM permission_audit_log WHERE action_type = $1
           ORDER BY created_at DESC LIMIT ${SLICE}`
        : `SELECT 'permissions'::text AS source, action_type, target_role, target_user_id, target_user_name,
                  changed_by_id, changed_by_name, old_value, new_value, ip_address, user_agent, created_at
           FROM permission_audit_log
           ORDER BY created_at DESC LIMIT ${SLICE}`,
      action_type ? [action_type] : []
    );
    permRows = permRes.rows;
  } catch (e) {
    if (!(e && e.code === '42P01')) throw e;
  }

  try {
    // admin_audit_logs columns: admin_id, action, resource_type, resource_id, details JSONB, created_at.
    // Map into the same shape — details JSONB becomes new_value so the UI's
    // diff view renders meaningfully without a code change.
    const adminRes = await db.query(
      action_type
        ? `SELECT 'admin_action'::text AS source,
                  action AS action_type,
                  resource_type AS target_role,
                  resource_id::text AS target_user_id,
                  NULL::text AS target_user_name,
                  admin_id AS changed_by_id,
                  NULL::text AS changed_by_name,
                  NULL::jsonb AS old_value,
                  details AS new_value,
                  NULL::text AS ip_address,
                  NULL::text AS user_agent,
                  created_at
           FROM admin_audit_logs WHERE action = $1
           ORDER BY created_at DESC LIMIT ${SLICE}`
        : `SELECT 'admin_action'::text AS source,
                  action AS action_type,
                  resource_type AS target_role,
                  resource_id::text AS target_user_id,
                  NULL::text AS target_user_name,
                  admin_id AS changed_by_id,
                  NULL::text AS changed_by_name,
                  NULL::jsonb AS old_value,
                  details AS new_value,
                  NULL::text AS ip_address,
                  NULL::text AS user_agent,
                  created_at
           FROM admin_audit_logs
           ORDER BY created_at DESC LIMIT ${SLICE}`,
      action_type ? [action_type] : []
    );
    adminRows = adminRes.rows;
  } catch (e) {
    if (!(e && e.code === '42P01')) throw e;
  }

  const merged = [...permRows, ...adminRows]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const total = merged.length;
  const slice = merged.slice(offset, offset + limitNum);

  res.json({
    logs: slice,
    total,
    page: pageNum,
    totalPages: Math.max(1, Math.ceil(total / limitNum)),
    sources: { permissions: permRows.length, admin_action: adminRows.length },
  });
}));

router.get("/custom-roles", authMiddleware, requireRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const result = await db.query(
    "SELECT * FROM custom_roles WHERE is_active = true ORDER BY created_at DESC"
  );
  res.json({ roles: result.rows });
}));

/**
 * Phase 3 — list nav sections for the "create role" modal's section
 * dropdown (where should the auto-provisioned sidebar link live?).
 * Falls back gracefully if the Phase 1 nav tables don't exist yet.
 */
router.get("/nav-sections", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  try {
    const r = await db.query(
      `SELECT key, label, icon_name, sort_order
       FROM admin_nav_sections
       WHERE is_active = true
       ORDER BY sort_order ASC, key ASC`
    );
    res.json({ sections: r.rows });
  } catch (e) {
    if (e && e.code === '42P01') return res.json({ sections: [] });
    throw e;
  }
}));

router.post("/custom-roles", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const { key, label, description, color, icon,
          has_inbox, inbox_title, section_key,
          can_receive_transfers, can_be_assigned, can_reply_to_customers,
          can_see_sensitive_finance, can_close_complaints } = req.body;

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

  // Boolean coercion — accept undefined as "use default", true/false strings as well as actual booleans.
  const b = (v, d) => (v === undefined || v === null ? d : !!v);
  const flags = {
    can_receive_transfers:     b(can_receive_transfers, true),
    can_be_assigned:           b(can_be_assigned, true),
    can_reply_to_customers:    b(can_reply_to_customers, false),
    can_see_sensitive_finance: b(can_see_sensitive_finance, false),
    can_close_complaints:      b(can_close_complaints, false),
  };

  // Resilient INSERT — try with the new flag columns first; if any are
  // missing on this env (rolling deploy), fall back to the legacy shape.
  let result;
  try {
    result = await db.query(
      `INSERT INTO custom_roles
         (key, label, description, color, icon, created_by,
          can_receive_transfers, can_be_assigned, can_reply_to_customers,
          can_see_sensitive_finance, can_close_complaints)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [key, label, description || null, color || '#6B7280', icon || 'Shield', req.user.id,
       flags.can_receive_transfers, flags.can_be_assigned, flags.can_reply_to_customers,
       flags.can_see_sensitive_finance, flags.can_close_complaints]
    );
  } catch (e) {
    if (e && e.code === '42703') {
      result = await db.query(
        `INSERT INTO custom_roles (key, label, description, color, icon, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [key, label, description || null, color || '#6B7280', icon || 'Shield', req.user.id]
      );
    } else { throw e; }
  }

  // Phase 3 — auto-provision an inbox + sidebar entry when the requester
  // checks "create inbox for this role". Two INSERTs wrapped so the role
  // creation never fails on a provisioning hiccup (we log + continue).
  let provisioned = { inbox: false, link: false };
  if (has_inbox && section_key) {
    try {
      await db.query(
        `INSERT INTO admin_inboxes
           (key, title, icon_name, accent_color, source_kind, source_filter, required_roles, sort_order, description)
         VALUES ($1, $2, $3, 'text-slate-500', 'complaints', $4::jsonb, $5::jsonb, 99, $6)
         ON CONFLICT (key) DO NOTHING`,
        [
          key,
          (inbox_title && inbox_title.trim()) || `صندوق ${label}`,
          icon || 'Inbox',
          JSON.stringify({ auto_assigned_role: key }),
          JSON.stringify(['super_admin', 'admin', key]),
          `الشكاوى الموجّهة إلى ${label}`,
        ]
      );
      provisioned.inbox = true;
    } catch (e) {
      console.warn('[custom-roles] inbox auto-provision failed:', e.code || e.message);
    }
    try {
      // Verify the section exists before linking — bad section_key from the
      // client shouldn't orphan a link.
      const sec = await db.query(`SELECT key FROM admin_nav_sections WHERE key = $1 AND is_active = true`, [section_key]);
      if (sec.rows.length > 0) {
        await db.query(
          `INSERT INTO admin_nav_links
             (section_key, href, label, icon_name, permission_key, required_roles, is_inbox, sort_order)
           VALUES ($1, $2, $3, $4, 'support', $5::jsonb, true, 99)`,
          [
            section_key,
            `/admin/inbox/${key}`,
            (inbox_title && inbox_title.trim()) || `صندوق ${label}`,
            icon || 'Inbox',
            JSON.stringify(['super_admin', 'admin', key]),
          ]
        );
        provisioned.link = true;
      }
    } catch (e) {
      console.warn('[custom-roles] sidebar link auto-provision failed:', e.code || e.message);
    }
  }

  await logAuditAction('CREATE_CUSTOM_ROLE', {
    target_role: key,
    new_value: { key, label, description, color, icon, has_inbox: !!has_inbox, section_key: section_key || null, provisioned, flags }
  }, req);

  res.status(201).json({
    role: result.rows[0],
    provisioned,
    message: provisioned.inbox && provisioned.link
      ? "تم إنشاء الدور مع صندوق وارد ورابط سايدبار"
      : "تم إنشاء الدور بنجاح",
  });
}));

router.put("/custom-roles/:key", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const { key } = req.params;
  const { label, description, color, icon,
          can_receive_transfers, can_be_assigned, can_reply_to_customers,
          can_see_sensitive_finance, can_close_complaints } = req.body;

  const existing = await db.query("SELECT * FROM custom_roles WHERE key = $1", [key]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ error: "الدور غير موجود" });
  }

  const oldRole = existing.rows[0];
  const pick = (v, d) => (v === undefined || v === null ? d : !!v);

  let result;
  try {
    result = await db.query(
      `UPDATE custom_roles SET
         label = $1, description = $2, color = $3, icon = $4,
         can_receive_transfers = $5, can_be_assigned = $6,
         can_reply_to_customers = $7, can_see_sensitive_finance = $8,
         can_close_complaints = $9,
         updated_at = CURRENT_TIMESTAMP
       WHERE key = $10 RETURNING *`,
      [
        label || oldRole.label,
        description ?? oldRole.description,
        color || oldRole.color,
        icon || oldRole.icon,
        pick(can_receive_transfers, oldRole.can_receive_transfers ?? true),
        pick(can_be_assigned, oldRole.can_be_assigned ?? true),
        pick(can_reply_to_customers, oldRole.can_reply_to_customers ?? false),
        pick(can_see_sensitive_finance, oldRole.can_see_sensitive_finance ?? false),
        pick(can_close_complaints, oldRole.can_close_complaints ?? false),
        key,
      ]
    );
  } catch (e) {
    if (e && e.code === '42703') {
      result = await db.query(
        `UPDATE custom_roles SET label = $1, description = $2, color = $3, icon = $4, updated_at = CURRENT_TIMESTAMP
         WHERE key = $5 RETURNING *`,
        [label || oldRole.label, description ?? oldRole.description, color || oldRole.color, icon || oldRole.icon, key]
      );
    } else { throw e; }
  }
  
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
