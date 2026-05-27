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

// Categorized so the UI can render permission groups instead of a flat
// grid. Category labels are Arabic; new categories should land in the
// CATEGORY_ORDER below so they sort predictably.
const ALL_PERMISSIONS = [
  { key: 'dashboard',        label: 'لوحة التحكم',           category: 'overview',  description: 'الوصول إلى لوحة المؤشرات الرئيسية وعرض الإحصاءات العامة.' },
  { key: 'listings',         label: 'الإعلانات',              category: 'properties',description: 'مراجعة وقبول ورفض الإعلانات، وإدارة قائمة العقارات.' },
  { key: 'reports',          label: 'البلاغات',               category: 'properties',description: 'فتح البلاغات الواردة على الإعلانات واتخاذ إجراء بشأنها.' },
  { key: 'complaints',       label: 'الشكاوى',                category: 'support',   description: 'قراءة وإدارة شكاوى العملاء.' },
  { key: 'support',          label: 'الدعم الفني',            category: 'support',   description: 'الرد على تذاكر الدعم وإغلاقها وتحويلها.' },
  { key: 'support_internal', label: 'المراسلات الداخلية',     category: 'support',   description: 'صندوق المراسلات بين أعضاء الفريق (Omni Inbox).' },
  { key: 'news',             label: 'شريط الأخبار',           category: 'marketing', description: 'إنشاء وتعديل عناصر شريط الأخبار في الصفحة الرئيسية.' },
  { key: 'finance',          label: 'المالية والاشتراكات',     category: 'finance',   description: 'إدارة الفواتير، الاسترداد، والمدفوعات الواردة.' },
  { key: 'plans',            label: 'إدارة الباقات',           category: 'finance',   description: 'تعريف الباقات، الأسعار، والتسعير حسب الدولة.' },
  { key: 'membership',       label: 'طلبات العضوية',          category: 'hr',        description: 'الموافقة على طلبات الانضمام/التوظيف وإدارة الموظفين.' },
  { key: 'marketing',        label: 'التسويق والدعاية',       category: 'marketing', description: 'حملات التسويق والإشعارات الترويجية وواتساب.' },
  { key: 'ambassador',       label: 'سفراء البيت',            category: 'marketing', description: 'إدارة برنامج السفراء والإحالات والمكافآت.' },
  { key: 'ai_center',        label: 'مركز الذكاء الاصطناعي',   category: 'system',    description: 'الوصول إلى أدوات الذكاء الاصطناعي والتحليلات المتقدمة.' },
  { key: 'users',            label: 'إدارة المستخدمين',        category: 'system',    description: 'عرض وتعديل بيانات المستخدمين، التفعيل والتعطيل.' },
  { key: 'roles',            label: 'إدارة الصلاحيات',         category: 'system',    description: 'إنشاء وتعديل الأدوار وصلاحياتها (هذه الصفحة).' },
  { key: 'settings',         label: 'الإعدادات',              category: 'system',    description: 'إعدادات النظام العامة وتصفير بيانات التجارب.' },
];

const PERMISSION_CATEGORIES = {
  overview:   { label: 'النظرة العامة',   sort: 10 },
  properties: { label: 'العقارات والإعلانات', sort: 20 },
  support:    { label: 'خدمة العملاء',     sort: 30 },
  finance:    { label: 'المالية',          sort: 40 },
  marketing:  { label: 'التسويق والنمو',   sort: 50 },
  hr:         { label: 'الموارد البشرية',   sort: 60 },
  system:     { label: 'النظام والحوكمة', sort: 70 },
};

// Includes every admin-grade role the system recognizes. super_admin and
// admin sit at the top; the four functional roles follow. Display label /
// color / icon can be overridden by a custom_roles row with the same key
// (used to be impossible — POST blocked default keys — now editable via
// the upserting PUT endpoint below).
// Capability defaults per role — chosen to match each role's real job.
// These are the values you see in the create/edit modal BEFORE any
// override row in custom_roles is applied. Owner can still override
// per-tenant via the modal.
//   - super_admin : everything on (owner)
//   - admin       : everything on (general manager)
//   - admin_manager: cross-dept coordinator — transfers, assign, reply, close
//   - finance_admin: financial — transfers, assign, reply, close, +sensitive
//   - support_admin: customer-facing — transfers, assign, reply, close
//   - content_admin: content team — transfers, assign, close (no direct reply)
const DEFAULT_ADMIN_ROLES = [
  { key: 'super_admin',   label: 'المدير العام',   color: '#D4AF37', icon: 'Crown',    isDefault: true, description: 'مالك المنصة — كل الصلاحيات',
    can_receive_transfers: true,  can_be_assigned: true,  can_reply_to_customers: true,  can_see_sensitive_finance: true,  can_close_complaints: true },
  { key: 'admin',         label: 'مدير',           color: '#1F2937', icon: 'Shield',   isDefault: true, description: 'صلاحيات إدارية كاملة',
    can_receive_transfers: true,  can_be_assigned: true,  can_reply_to_customers: true,  can_see_sensitive_finance: true,  can_close_complaints: true },
  { key: 'admin_manager', label: 'مدير إداري',     color: '#0EA5E9', icon: 'Settings', isDefault: true, description: 'تنسيق بين الأقسام',
    can_receive_transfers: true,  can_be_assigned: true,  can_reply_to_customers: true,  can_see_sensitive_finance: false, can_close_complaints: true },
  { key: 'finance_admin', label: 'إدارة المالية',  color: '#10B981', icon: 'Wallet',   isDefault: true, description: 'الفواتير، الاسترداد، الاشتراكات',
    can_receive_transfers: true,  can_be_assigned: true,  can_reply_to_customers: true,  can_see_sensitive_finance: true,  can_close_complaints: true },
  { key: 'support_admin', label: 'الدعم الفني',    color: '#3B82F6', icon: 'Headset',  isDefault: true, description: 'الشكاوى والدعم العام',
    can_receive_transfers: true,  can_be_assigned: true,  can_reply_to_customers: true,  can_see_sensitive_finance: false, can_close_complaints: true },
  { key: 'content_admin', label: 'إدارة المحتوى',  color: '#8B5CF6', icon: 'FileText', isDefault: true, description: 'الإعلانات والعرض والخريطة',
    can_receive_transfers: true,  can_be_assigned: true,  can_reply_to_customers: false, can_see_sensitive_finance: false, can_close_complaints: true },
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
  // Pull every row from custom_roles. Two ways a row can show up there:
  //   (a) genuinely-custom role created via the UI
  //   (b) override row for a default role — same key as a DEFAULT entry,
  //       used to customize label/color/icon without code changes
  //
  // Fail-soft: any failure (table missing 42P01, columns missing 42703,
  // permission denied, etc.) just means "no custom rows" and we fall back
  // to the hardcoded DEFAULT_ADMIN_ROLES. The previous version re-threw
  // every error except 42703, which 500'd /list and /all-roles whenever
  // the migration hadn't run yet on a stale tenant.
  let customRows = [];
  try {
    const r = await db.query(
      `SELECT key, label, color, icon, description,
              can_receive_transfers, can_be_assigned, can_reply_to_customers,
              can_see_sensitive_finance, can_close_complaints
       FROM custom_roles WHERE is_active = true ORDER BY created_at`
    );
    customRows = r.rows;
  } catch (e) {
    if (e && e.code === '42703') {
      // Capability columns not migrated yet — try the legacy column set.
      try {
        const r = await db.query(
          `SELECT key, label, color, icon, description FROM custom_roles WHERE is_active = true ORDER BY created_at`
        );
        customRows = r.rows;
      } catch (e2) {
        console.warn('[getAllRoles] legacy custom_roles read also failed:', e2.message);
      }
    } else if (e && e.code === '42P01') {
      // custom_roles table missing entirely — pretend there are no custom rows.
      console.warn('[getAllRoles] custom_roles table missing — defaults only');
    } else {
      // Any other error: log and continue with no custom rows. Returning
      // defaults is better than 500'ing the entire endpoint.
      console.error('[getAllRoles] unexpected error reading custom_roles:', e?.message || e);
    }
  }
  const byKey = new Map();
  for (const r of customRows) byKey.set(r.key, r);

  // Count active users per role in one query, then look up below.
  const memberCounts = new Map();
  try {
    const r = await db.query(
      `SELECT role, COUNT(*)::int AS n
       FROM users
       WHERE role IS NOT NULL AND COALESCE(is_active, true) = true
       GROUP BY role`
    );
    for (const row of r.rows) memberCounts.set(row.role, row.n);
  } catch {}

  // Lookup which roles have an inbox + a sidebar section provisioned.
  // 42P01-tolerant — if Phase 1/2 tables don't exist, we just leave the
  // flags false instead of crashing the merge.
  const inboxRoles = new Set();
  const sidebarRoles = new Set();
  try {
    const r = await db.query(`SELECT required_roles FROM admin_inboxes WHERE is_active = true`);
    for (const row of r.rows) {
      try {
        const arr = Array.isArray(row.required_roles) ? row.required_roles : JSON.parse(row.required_roles || '[]');
        for (const k of arr) inboxRoles.add(k);
      } catch {}
    }
  } catch {}
  try {
    const r = await db.query(`SELECT required_roles FROM admin_nav_links WHERE is_active = true AND required_roles IS NOT NULL`);
    for (const row of r.rows) {
      try {
        const arr = Array.isArray(row.required_roles) ? row.required_roles : JSON.parse(row.required_roles || '[]');
        for (const k of arr) sidebarRoles.add(k);
      } catch {}
    }
  } catch {}

  const annotate = (r) => ({
    ...r,
    member_count: memberCounts.get(r.key) || 0,
    has_inbox: inboxRoles.has(r.key),
    has_sidebar: sidebarRoles.has(r.key),
  });

  const defaults = DEFAULT_ADMIN_ROLES.map(d => {
    const o = byKey.get(d.key);
    // ?? d.can_* fallback: legacy override rows might have NULL capability
    // columns (existed before Phase 3.5). Without the coalesce we'd
    // surface NULL/undefined and the modal checkbox would show unchecked
    // even though the role's purpose says it should be on.
    const base = o
      ? { ...d, label: o.label || d.label, description: o.description ?? d.description, color: o.color || d.color, icon: o.icon || d.icon,
          can_receive_transfers:     o.can_receive_transfers     ?? d.can_receive_transfers,
          can_be_assigned:           o.can_be_assigned           ?? d.can_be_assigned,
          can_reply_to_customers:    o.can_reply_to_customers    ?? d.can_reply_to_customers,
          can_see_sensitive_finance: o.can_see_sensitive_finance ?? d.can_see_sensitive_finance,
          can_close_complaints:      o.can_close_complaints      ?? d.can_close_complaints,
          isDefault: true, hasOverride: true }
      : { ...d, isDefault: true, hasOverride: false };
    return annotate(base);
  });

  const customs = customRows
    .filter(r => !DEFAULT_ADMIN_ROLES.find(d => d.key === r.key))
    .map(r => annotate({ ...r, isDefault: false }));

  return [...defaults, ...customs];
}

router.get("/list", authMiddleware, requireRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  await ensureSupportInternalPermissionMigrated();
  const roles = await getAllRoles();
  res.json({
    permissions: ALL_PERMISSIONS,
    categories: PERMISSION_CATEGORIES,
    roles: roles
  });
}));

router.get("/role/:role", authMiddleware, requireRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  await ensureSupportInternalPermissionMigrated();
  const { role } = req.params;

  // Fail-soft: if role_permissions doesn't exist yet (42P01) treat as
  // empty — every permission renders as not-granted and the user can
  // grant + save which auto-creates the row.
  let result = { rows: [] };
  try {
    result = await db.query(
      "SELECT permission_key, is_granted FROM role_permissions WHERE role = $1",
      [role]
    );
  } catch (e) {
    if (e && (e.code === '42P01' || e.code === '42703')) {
      console.warn('[/role/:role] role_permissions read failed (degraded):', e.code);
    } else {
      throw e;
    }
  }

  const permissionsMap = {};
  result.rows.forEach(row => {
    permissionsMap[row.permission_key] = row.is_granted;
  });

  const permissions = ALL_PERMISSIONS.map(p => ({
    ...p,
    isGranted: permissionsMap[p.key] ?? false
  }));

  res.json({ role, permissions, categories: PERMISSION_CATEGORIES });
}));

router.get("/my-permissions", authMiddleware, asyncHandler(async (req, res) => {
  await ensureSupportInternalPermissionMigrated();
  const userRole = req.user.role;

  // super_admin (the platform owner) is the only role that is
  // unconditionally granted everything — its permissions cannot be
  // toggled. Every other role, including 'admin', reads from
  // role_permissions so the owner can tighten or loosen access via the
  // permission matrix. (Boot-time seed in index.js ensures 'admin'
  // starts with every key granted, so the migration is invisible.)
  if (userRole === 'super_admin') {
    const permissions = ALL_PERMISSIONS.map(p => p.key);
    return res.json({ permissions });
  }

  let permissions = [];
  try {
    const result = await db.query(
      "SELECT permission_key FROM role_permissions WHERE role = $1 AND is_granted = true",
      [userRole]
    );
    permissions = result.rows.map(row => row.permission_key);
  } catch (e) {
    if (e && (e.code === '42P01' || e.code === '42703')) {
      console.warn('[/my-permissions] role_permissions read failed:', e.code);
    } else {
      throw e;
    }
  }

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

  // Pull complaint events too — transfers / replies / directives / status
  // changes are admin actions and belong in the unified feed.
  let complaintRows = [];
  try {
    const cRes = await db.query(
      action_type
        ? `SELECT 'complaint_event'::text AS source,
                  event_type AS action_type,
                  NULL::text AS target_role,
                  actor_user_id::text AS target_user_id,
                  NULL::text AS target_user_name,
                  actor_user_id AS changed_by_id,
                  actor_name_snapshot AS changed_by_name,
                  NULL::jsonb AS old_value,
                  jsonb_build_object(
                    'complaint_id', complaint_id,
                    'note', note,
                    'from_role', from_role,
                    'to_role', to_role,
                    'from_status', from_status,
                    'to_status', to_status,
                    'visibility', visibility,
                    'target_kind', target_kind
                  ) AS new_value,
                  NULL::text AS ip_address,
                  NULL::text AS user_agent,
                  created_at
           FROM complaint_events WHERE event_type = $1
           ORDER BY created_at DESC LIMIT ${SLICE}`
        : `SELECT 'complaint_event'::text AS source,
                  event_type AS action_type,
                  NULL::text AS target_role,
                  actor_user_id::text AS target_user_id,
                  NULL::text AS target_user_name,
                  actor_user_id AS changed_by_id,
                  actor_name_snapshot AS changed_by_name,
                  NULL::jsonb AS old_value,
                  jsonb_build_object(
                    'complaint_id', complaint_id,
                    'note', note,
                    'from_role', from_role,
                    'to_role', to_role,
                    'from_status', from_status,
                    'to_status', to_status,
                    'visibility', visibility,
                    'target_kind', target_kind
                  ) AS new_value,
                  NULL::text AS ip_address,
                  NULL::text AS user_agent,
                  created_at
           FROM complaint_events
           ORDER BY created_at DESC LIMIT ${SLICE}`,
      action_type ? [action_type] : []
    );
    complaintRows = cRes.rows;
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

  // Optional source filter (multi-value via repeating ?source=...)
  const sourceFilter = []
    .concat(req.query.source || [])
    .filter(Boolean);
  let merged = [...permRows, ...adminRows, ...complaintRows]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  if (sourceFilter.length > 0) {
    merged = merged.filter(r => sourceFilter.includes(r.source));
  }
  // Optional actor filter (by name or email substring)
  if (req.query.actor) {
    const q = String(req.query.actor).toLowerCase();
    merged = merged.filter(r =>
      String(r.changed_by_name || '').toLowerCase().includes(q)
    );
  }
  // Optional date range
  if (req.query.from) {
    const t = Date.parse(req.query.from);
    if (!Number.isNaN(t)) merged = merged.filter(r => new Date(r.created_at).getTime() >= t);
  }
  if (req.query.to) {
    const t = Date.parse(req.query.to);
    if (!Number.isNaN(t)) merged = merged.filter(r => new Date(r.created_at).getTime() <= t + 86_400_000);
  }

  const total = merged.length;
  const slice = merged.slice(offset, offset + limitNum);

  res.json({
    logs: slice,
    total,
    page: pageNum,
    totalPages: Math.max(1, Math.ceil(total / limitNum)),
    sources: {
      permissions: permRows.length,
      admin_action: adminRows.length,
      complaint_event: complaintRows.length,
    },
  });
}));

router.get("/custom-roles", authMiddleware, requireRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const result = await db.query(
    "SELECT * FROM custom_roles WHERE is_active = true ORDER BY created_at DESC"
  );
  res.json({ roles: result.rows });
}));

/**
 * Phase 3.6 — return EVERY admin role (defaults + customs) in one list.
 * Defaults carry isDefault=true and can_delete=false so the UI hides the
 * delete button. Their label/color/icon reflect any override row from
 * custom_roles with the same key.
 */
router.get("/all-roles", authMiddleware, requireRoles('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const roles = await getAllRoles();
  // UI hints
  res.json({
    roles: roles.map(r => ({
      ...r,
      can_delete: !r.isDefault,
      can_edit: true,
    })),
  });
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
          can_see_sensitive_finance, can_close_complaints,
          initial_permissions } = req.body;

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

  // Initial permissions — when the owner picks a starting permission set
  // in the create modal, INSERT one granted row per key into
  // role_permissions. This way a freshly-created role lands with the
  // expected access pattern instead of zero (everything blocked).
  let grantedCount = 0;
  if (Array.isArray(initial_permissions) && initial_permissions.length > 0) {
    const validKeys = new Set(ALL_PERMISSIONS.map(p => p.key));
    for (const pk of initial_permissions) {
      if (!validKeys.has(pk)) continue;
      try {
        await db.query(
          `INSERT INTO role_permissions (role, permission_key, is_granted, updated_at)
           VALUES ($1, $2, true, CURRENT_TIMESTAMP)
           ON CONFLICT (role, permission_key) DO UPDATE SET
             is_granted = true,
             updated_at = CURRENT_TIMESTAMP`,
          [key, pk]
        );
        grantedCount++;
      } catch (e) {
        console.warn(`[custom-roles] initial permission ${pk} failed:`, e.message);
      }
    }
  }

  await logAuditAction('CREATE_CUSTOM_ROLE', {
    target_role: key,
    new_value: { key, label, description, color, icon, has_inbox: !!has_inbox, section_key: section_key || null, provisioned, flags, initial_permissions_granted: grantedCount }
  }, req);

  const parts = [];
  if (provisioned.inbox && provisioned.link) parts.push("صندوق وارد + رابط سايدبار");
  if (grantedCount > 0) parts.push(`${grantedCount} صلاحية مفعّلة`);
  res.status(201).json({
    role: result.rows[0],
    provisioned,
    initial_permissions_granted: grantedCount,
    message: parts.length > 0
      ? `تم إنشاء الدور (${parts.join(" + ")})`
      : "تم إنشاء الدور بنجاح",
  });
}));

router.put("/custom-roles/:key", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const { key } = req.params;
  const { label, description, color, icon,
          can_receive_transfers, can_be_assigned, can_reply_to_customers,
          can_see_sensitive_finance, can_close_complaints } = req.body;

  const existing = await db.query("SELECT * FROM custom_roles WHERE key = $1", [key]);
  const isDefaultKey = !!DEFAULT_ADMIN_ROLES.find(d => d.key === key);
  if (existing.rows.length === 0 && !isDefaultKey) {
    return res.status(404).json({ error: "الدور غير موجود" });
  }

  // For default-key roles with no row yet, seed an override row using the
  // hardcoded defaults as the base — then apply the body's changes on top.
  const oldRole = existing.rows[0] || (() => {
    const d = DEFAULT_ADMIN_ROLES.find(r => r.key === key);
    return { key, label: d?.label, description: d?.description, color: d?.color, icon: d?.icon,
             can_receive_transfers: true, can_be_assigned: true,
             can_reply_to_customers: false, can_see_sensitive_finance: false,
             can_close_complaints: false };
  })();
  const pick = (v, d) => (v === undefined || v === null ? d : !!v);

  let result;
  try {
    if (existing.rows.length === 0 && isDefaultKey) {
      // First-time override for a default role — INSERT.
      result = await db.query(
        `INSERT INTO custom_roles
           (key, label, description, color, icon, created_by,
            can_receive_transfers, can_be_assigned, can_reply_to_customers,
            can_see_sensitive_finance, can_close_complaints)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          key,
          label || oldRole.label,
          description ?? oldRole.description,
          color || oldRole.color,
          icon || oldRole.icon,
          req.user.id,
          pick(can_receive_transfers, oldRole.can_receive_transfers),
          pick(can_be_assigned, oldRole.can_be_assigned),
          pick(can_reply_to_customers, oldRole.can_reply_to_customers),
          pick(can_see_sensitive_finance, oldRole.can_see_sensitive_finance),
          pick(can_close_complaints, oldRole.can_close_complaints),
        ]
      );
    } else {
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
    }
  } catch (e) {
    if (e && e.code === '42703') {
      // capability columns missing — degrade to label/desc/color/icon only
      if (existing.rows.length === 0 && isDefaultKey) {
        result = await db.query(
          `INSERT INTO custom_roles (key, label, description, color, icon, created_by)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [key, label || oldRole.label, description ?? oldRole.description, color || oldRole.color, icon || oldRole.icon, req.user.id]
        );
      } else {
        result = await db.query(
          `UPDATE custom_roles SET label = $1, description = $2, color = $3, icon = $4, updated_at = CURRENT_TIMESTAMP
           WHERE key = $5 RETURNING *`,
          [label || oldRole.label, description ?? oldRole.description, color || oldRole.color, icon || oldRole.icon, key]
        );
      }
    } else { throw e; }
  }
  
  await logAuditAction('UPDATE_CUSTOM_ROLE', {
    target_role: key,
    old_value: oldRole,
    new_value: result.rows[0]
  }, req);
  
  res.json({ role: result.rows[0], message: "تم تحديث الدور بنجاح" });
}));

// Soft-deletes a custom role. Action Safety Layer applies: actor must
// provide a `reason` (>= 4 chars) in body, snapshot is captured, role is
// flagged is_active=false + deleted_at=NOW(), and role_permissions rows are
// kept (not hard-deleted) so we can restore later. Default keys cannot be
// removed (they're hardcoded, not in custom_roles).
const { requireReason, recordDestructive } = require('../services/auditSafety');

router.delete("/custom-roles/:key", authMiddleware, requireRoles('super_admin'), requireReason(), asyncHandler(async (req, res) => {
  const { key } = req.params;

  const existing = await db.query("SELECT * FROM custom_roles WHERE key = $1", [key]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ error: "الدور غير موجود" });
  }
  const before = existing.rows[0];

  const usersWithRole = await db.query("SELECT COUNT(*) FROM users WHERE role = $1", [key]);
  if (parseInt(usersWithRole.rows[0].count) > 0) {
    return res.status(400).json({
      error: `لا يمكن حذف الدور لأنه مستخدم من قبل ${usersWithRole.rows[0].count} مستخدم`
    });
  }

  // Soft deactivation — preserves the row + role_permissions so a restore
  // can put the role back. is_active=false hides it from the role picker.
  try {
    await db.query(
      `UPDATE custom_roles
         SET is_active = false,
             deleted_at = NOW(),
             deleted_by = $2,
             deleted_reason = $3
       WHERE key = $1`,
      [key, req.user.id || null, req.auditReason]
    );
  } catch (e) {
    // Older DB without deleted_* columns — fall back to is_active flag only.
    if (e && e.code === '42703') {
      await db.query("UPDATE custom_roles SET is_active = false WHERE key = $1", [key]);
    } else {
      throw e;
    }
  }

  // We INTENTIONALLY keep role_permissions rows so restore works. They are
  // gated by `is_active=false` already (custom role merger won't surface
  // an inactive role to any UI).
  await logAuditAction('DELETE_CUSTOM_ROLE', {
    target_role: key,
    old_value: before,
    reason: req.auditReason,
  }, req);
  await recordDestructive(req, {
    action: 'SOFT_DELETE_CUSTOM_ROLE',
    resourceType: 'custom_roles',
    resourceId: key,
    before,
    reason: req.auditReason,
  });

  res.json({ message: "تم تعطيل الدور (يمكن استرجاعه من سجل التدقيق)", restorable: true });
}));

// Restore a soft-deleted custom role. Audit-logged.
router.post("/custom-roles/:key/restore", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const { key } = req.params;
  const r = await db.query("SELECT * FROM custom_roles WHERE key = $1", [key]);
  if (r.rows.length === 0) return res.status(404).json({ error: "الدور غير موجود" });
  const before = r.rows[0];
  try {
    await db.query(
      `UPDATE custom_roles
         SET is_active = true, deleted_at = NULL, deleted_by = NULL, deleted_reason = NULL
       WHERE key = $1`,
      [key]
    );
  } catch (e) {
    if (e && e.code === '42703') {
      await db.query("UPDATE custom_roles SET is_active = true WHERE key = $1", [key]);
    } else {
      throw e;
    }
  }
  await recordDestructive(req, {
    action: 'RESTORE_CUSTOM_ROLE',
    resourceType: 'custom_roles',
    resourceId: key,
    before,
    after: { ...before, is_active: true, deleted_at: null },
    reason: (req.body?.reason || 'restored from audit log').toString().trim() || 'restored',
  });
  res.json({ ok: true, message: "تم استرجاع الدور" });
}));

module.exports = router;
