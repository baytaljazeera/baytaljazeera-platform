"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";

export const dynamic = 'force-dynamic';

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, Users, Crown, Wallet, Headphones, FileText,
  Loader2, Search, Check, AlertTriangle, User, Settings,
  ToggleLeft, ToggleRight, Save, CheckCircle2, X, UserX,
  History, Plus, Trash2, Edit2, Clock, Eye,
  Mailbox, LayoutGrid,
} from "lucide-react";
import { toast } from "sonner";

type UserItem = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  created_at: string;
  plan_name: string | null;
};

type Permission = {
  key: string;
  label: string;
  isGranted?: boolean;
  category?: string;
  description?: string;
};

type PermissionCategory = { label: string; sort: number };

type AdminRole = {
  key: string;
  label: string;
  color?: string;
  icon?: string;
  isDefault?: boolean;
  hasOverride?: boolean;
  description?: string;
  member_count?: number;
  has_inbox?: boolean;
  has_sidebar?: boolean;
};

type AuditLog = {
  id: number;
  action_type: string;
  target_role: string | null;
  target_user_id: string | null;
  target_user_name: string | null;
  changed_by_id: string;
  changed_by_name: string;
  old_value: any;
  new_value: any;
  ip_address: string;
  user_agent: string;
  created_at: string;
};

type JobApplication = {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  age: number;
  country: string;
  job_title: string;
  cover_letter: string;
  cv_path: string | null;
  status: string;
  created_at: string;
  admin_note: string | null;
  reviewed_at: string | null;
};

const ICON_OPTIONS = [
  { key: 'Shield', icon: Shield },
  { key: 'FileText', icon: FileText },
  { key: 'Headphones', icon: Headphones },
  { key: 'Wallet', icon: Wallet },
  { key: 'Settings', icon: Settings },
  { key: 'Users', icon: Users },
  { key: 'Crown', icon: Crown },
];

const COLOR_OPTIONS = [
  '#8B5CF6', '#3B82F6', '#10B981', '#0EA5E9', '#F59E0B', '#EF4444', '#EC4899', '#6B7280'
];

const ROLES = [
  { 
    id: 'user', 
    name: 'مستخدم', 
    icon: User, 
    color: '#6B7280',
    description: 'صلاحيات عادية للمستخدمين',
    level: 0
  },
  { 
    id: 'content_admin', 
    name: 'مدير المحتوى', 
    icon: FileText, 
    color: '#8B5CF6',
    description: 'إدارة الإعلانات والبلاغات والأخبار',
    level: 60
  },
  { 
    id: 'support_admin', 
    name: 'مدير الدعم', 
    icon: Headphones, 
    color: '#3B82F6',
    description: 'إدارة الدعم الفني والشكاوى والرسائل',
    level: 60
  },
  { 
    id: 'finance_admin', 
    name: 'مدير المالية', 
    icon: Wallet, 
    color: '#10B981',
    description: 'إدارة الباقات والعضويات والمدفوعات',
    level: 70
  },
  { 
    id: 'admin_manager', 
    name: 'مدير إداري', 
    icon: Settings, 
    color: '#0EA5E9',
    description: 'إشراف إداري شامل مع صلاحيات موسعة',
    level: 80
  },
  { 
    id: 'admin', 
    name: 'مدير', 
    icon: Crown, 
    color: '#D4AF37',
    description: 'صلاحيات إدارية كاملة',
    level: 100
  },
  { 
    id: 'super_admin', 
    name: 'المدير العام', 
    icon: Shield, 
    color: '#FFD700',
    description: 'كل الصلاحيات بما فيها إدارة العملاء والإداريين',
    level: 100
  },
];

function AdminRolesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  // Default landing is "إضافة دور" (custom) per the new owner-spec order.
  // Legacy ?tab=applications links from old places redirect to HR where
  // that workflow actually lives now.
  const [activeTab, setActiveTab] = useState<'permissions' | 'users' | 'custom' | 'audit' | 'applications'>(
    tabFromUrl === 'users'   ? 'users'  :
    tabFromUrl === 'permissions' ? 'permissions' :
    tabFromUrl === 'audit'   ? 'audit'  :
                               'custom'
  );
  // Redirect /admin/roles?tab=applications → /admin/hr/employees
  useEffect(() => {
    if (tabFromUrl === 'applications') {
      router.replace('/add-listing/admin/hr/employees');
    }
  }, [tabFromUrl, router]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  // Search inside the role-reassignment modal — needed when many custom
  // roles exist; the picker becomes unscrollable otherwise.
  const [roleModalSearch, setRoleModalSearch] = useState("");
  const [updating, setUpdating] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string>("");
  // Track the signed-in user's id too so the role-edit modal can disable
  // the "demote me" path — guards owners from accidentally locking
  // themselves out (the backend rejects this too in admin.js).
  const [currentUserId, setCurrentUserId] = useState<string>("");

  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [permissionCategories, setPermissionCategories] = useState<Record<string, PermissionCategory>>({});
  const [adminRoles, setAdminRoles] = useState<AdminRole[]>([]);
  const [selectedAdminRole, setSelectedAdminRole] = useState<string>("");
  const [rolePermissions, setRolePermissions] = useState<Permission[]>([]);
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const [showCreateRoleModal, setShowCreateRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<AdminRole | null>(null);
  // Phase 3 fields: optional inbox + sidebar provisioning at create time.
  // has_inbox toggles the auto-provision; section_key picks which sidebar
  // section the new inbox link lives under.
  const [newRole, setNewRole] = useState({
    key: '', label: '', description: '', color: '#6B7280', icon: 'Shield',
    has_inbox: false, inbox_title: '', section_key: '',
    // Phase 3.5 capability flags. Defaults mirror the backend's safe defaults
    // (transfers/assignments yes, customer-reply/finance/close no).
    can_receive_transfers: true,
    can_be_assigned: true,
    can_reply_to_customers: false,
    can_see_sensitive_finance: false,
    can_close_complaints: false,
  });
  const [navSections, setNavSections] = useState<Array<{ key: string; label: string }>>([]);
  const [savingRole, setSavingRole] = useState(false);
  const [customRoles, setCustomRoles] = useState<AdminRole[]>([]);

  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [rejectedApplications, setRejectedApplications] = useState<JobApplication[]>([]);
  const [loadingApplications, setLoadingApplications] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<JobApplication | null>(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [assignedRole, setAssignedRole] = useState('support_admin');
  const [processingApplication, setProcessingApplication] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [applicationsSubTab, setApplicationsSubTab] = useState<'pending' | 'rejected'>('pending');

  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ show: false, title: '', message: '', onConfirm: () => {} });

  const [successModal, setSuccessModal] = useState<{
    show: boolean;
    message: string;
  }>({ show: false, message: '' });

  useEffect(() => {
    fetchCurrentUser();
    fetchUsers();
    fetchPermissionsList();
    fetchApplications();
    // Phase 3 — pull nav sections for the role-creation modal's
    // section dropdown. Fails silently if endpoint isn't available.
    (async () => {
      try {
        const res = await fetch('/api/permissions/nav-sections', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setNavSections(data.sections || []);
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (selectedAdminRole) {
      fetchRolePermissions(selectedAdminRole);
    }
  }, [selectedAdminRole]);

  useEffect(() => {
    if (activeTab === 'audit') {
      fetchAuditLogs();
    }
    if (activeTab === 'custom') {
      fetchCustomRoles();
    }
    if (activeTab === 'applications') {
      fetchApplications();
    }
  }, [activeTab, auditPage]);

  async function fetchCurrentUser() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCurrentUserRole(data.role);
        setCurrentUserId(String(data.id ?? data.user?.id ?? ""));
      }
    } catch (err) {
      console.error('Error fetching user:', err);
    }
  }

  async function fetchUsers() {
    try {
      setIsLoading(true);
      const res = await fetch(`${API_URL}/api/admin/users?admin_only=true&limit=100`, { credentials: "include", headers: getAuthHeaders() });
      if (res.status === 401 || res.status === 403) {
        router.push("/admin-login");
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error("Error fetching users:", err);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchPermissionsList() {
    try {
      // /list is the single source of truth — same merger /all-roles uses.
      // It returns every role (defaults + customs) with member_count,
      // has_inbox, has_sidebar already annotated, plus the categorized
      // permissions catalog. Tabs (تحديد صلاحيات / تعيين الأدوار) read
      // adminRoles from this call so creating a custom role anywhere
      // makes it appear in all three tabs without extra wiring.
      const res = await fetch(`${API_URL}/api/permissions/list`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setPermissions(data.permissions || []);
        setPermissionCategories(data.categories || {});
        setAdminRoles(data.roles || []);
        if (data.roles?.length > 0) {
          // Preserve existing selection if still valid; otherwise pick first.
          setSelectedAdminRole(prev => prev && data.roles.some((r: AdminRole) => r.key === prev) ? prev : data.roles[0].key);
        }
      }
    } catch (err) {
      console.error("Error fetching permissions list:", err);
    }
  }

  async function fetchRolePermissions(role: string) {
    try {
      setLoadingPermissions(true);
      const res = await fetch(`${API_URL}/api/permissions/role/${role}`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setRolePermissions(data.permissions || []);
        if (data.categories) setPermissionCategories(data.categories);
      }
    } catch (err) {
      console.error("Error fetching role permissions:", err);
    } finally {
      setLoadingPermissions(false);
    }
  }

  async function fetchAuditLogs() {
    try {
      setLoadingAudit(true);
      const res = await fetch(`/api/permissions/audit-log?page=${auditPage}&limit=10`, { credentials: "include", headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
        setAuditTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      console.error("Error fetching audit logs:", err);
    } finally {
      setLoadingAudit(false);
    }
  }

  async function fetchCustomRoles() {
    // Phase 3.6 — show BOTH default and custom roles in the "إضافة دور" tab.
    // The new endpoint /api/permissions/all-roles merges defaults +
    // custom_roles rows. Falls back to the old custom-roles endpoint if the
    // new one isn't deployed yet.
    try {
      let res = await fetch(`${API_URL}/api/permissions/all-roles`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok && res.status === 404) {
        res = await fetch(`${API_URL}/api/permissions/custom-roles`, { credentials: "include", headers: getAuthHeaders() });
      }
      if (res.ok) {
        const data = await res.json();
        setCustomRoles(data.roles || []);
      }
    } catch (err) {
      console.error("Error fetching roles:", err);
    }
  }

  async function saveRolePermissions() {
    try {
      setSavingPermissions(true);
      const grantedPermissions = rolePermissions
        .filter(p => p.isGranted)
        .map(p => p.key);
      
      const res = await fetch(`/api/permissions/role/${selectedAdminRole}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ permissions: grantedPermissions }),
      });

      if (res.ok) {
        setSuccessModal({ show: true, message: "تم حفظ الصلاحيات بنجاح" });
      } else {
        const data = await res.json();
        setSuccessModal({ show: true, message: data.error || "حدث خطأ في الحفظ" });
      }
    } catch (err) {
      console.error("Error saving permissions:", err);
      setSuccessModal({ show: true, message: "حدث خطأ في حفظ الصلاحيات" });
    } finally {
      setSavingPermissions(false);
    }
  }

  function togglePermission(permKey: string) {
    const perm = rolePermissions.find(p => p.key === permKey);
    if (!perm) return;
    
    const action = perm.isGranted ? 'إلغاء' : 'تفعيل';
    setConfirmModal({
      show: true,
      title: `${action} الصلاحية`,
      message: `هل أنت متأكد من ${action} صلاحية "${perm.label}"؟`,
      onConfirm: () => {
        setRolePermissions(prev =>
          prev.map(p =>
            p.key === permKey
              ? { ...p, isGranted: !p.isGranted }
              : p
          )
        );
        setConfirmModal(prev => ({ ...prev, show: false }));
      }
    });
  }

  async function createOrUpdateRole() {
    try {
      setSavingRole(true);
      const isEditing = !!editingRole;
      const url = isEditing 
        ? `/api/permissions/custom-roles/${editingRole.key}`
        : '/api/permissions/custom-roles';
      
      const res = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newRole),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const provisionedMsg = data?.provisioned?.inbox && data?.provisioned?.link
          ? " وتم إنشاء صندوق وارد وربطه بالسايدبار"
          : "";
        setSuccessModal({ show: true, message: (isEditing ? "تم تحديث الدور بنجاح" : "تم إنشاء الدور بنجاح") + provisionedMsg });
        setShowCreateRoleModal(false);
        setEditingRole(null);
        setNewRole({ key: '', label: '', description: '', color: '#6B7280', icon: 'Shield', has_inbox: false, inbox_title: '', section_key: '', can_receive_transfers: true, can_be_assigned: true, can_reply_to_customers: false, can_see_sensitive_finance: false, can_close_complaints: false });
        fetchCustomRoles();
        fetchPermissionsList();
      } else {
        const data = await res.json();
        toast.error(data.error || "حدث خطأ في حفظ الدور");
      }
    } catch (err) {
      console.error("Error saving role:", err);
      toast.error("حدث خطأ في الاتصال بالخادم");
    } finally {
      setSavingRole(false);
    }
  }

  async function deleteRole(key: string) {
    // Action Safety Layer — the backend now requires an explicit reason
    // (>= 4 chars) on every destructive action, and the delete is a soft
    // deactivation (is_active=false + deleted_at) instead of a hard wipe.
    // We prompt for the reason here and pass it through the request body.
    const reason = typeof window !== 'undefined'
      ? window.prompt('سبب التعطيل (مطلوب — لن يمكن إنجاز الإجراء بدونه):')
      : '';
    if (!reason || reason.trim().length < 4) {
      toast.error('السبب مطلوب (4 أحرف على الأقل)');
      return;
    }
    setConfirmModal({
      show: true,
      title: 'تعطيل الدور',
      message: 'سيتم تعطيل هذا الدور (يمكن استرجاعه من سجل التدقيق). تابع؟',
      onConfirm: async () => {
        try {
          const res = await fetch(`${API_URL}/api/permissions/custom-roles/${key}`, {
            method: "DELETE",
            credentials: "include",
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: reason.trim() }),
          });

          if (res.ok) {
            setSuccessModal({ show: true, message: "تم تعطيل الدور بنجاح" });
            fetchCustomRoles();
            fetchPermissionsList();
          } else {
            const data = await res.json();
            toast.error(data.error || "حدث خطأ في الإجراء");
          }
        } catch (err) {
          console.error("Error deleting role:", err);
          toast.error("حدث خطأ في الاتصال بالخادم");
        }
        setConfirmModal(prev => ({ ...prev, show: false }));
      }
    });
  }

  async function fetchApplications() {
    try {
      setLoadingApplications(true);
      const [pendingRes, rejectedRes] = await Promise.all([
        fetch(`${API_URL}/api/membership/admin/requests?status=pending`, { credentials: "include", headers: getAuthHeaders() }),
        fetch(`${API_URL}/api/membership/admin/requests?status=rejected`, { credentials: "include", headers: getAuthHeaders() })
      ]);
      
      if (pendingRes.ok) {
        const data = await pendingRes.json();
        setApplications(data.requests || []);
      }
      if (rejectedRes.ok) {
        const data = await rejectedRes.json();
        setRejectedApplications(data.requests || []);
      }
    } catch (err) {
      console.error("Error fetching applications:", err);
    } finally {
      setLoadingApplications(false);
    }
  }

  async function restoreApplication(id: number) {
    try {
      setProcessingApplication(true);
      const res = await fetch(`/api/membership/admin/requests/${id}/restore`, {
        method: "POST",
        credentials: "include",
      });

      if (res.ok) {
        setSuccessModal({ show: true, message: "تم استرجاع الطلب بنجاح" });
        fetchApplications();
      } else {
        const data = await res.json();
        toast.error(data.error || "حدث خطأ في استرجاع الطلب");
      }
    } catch (err) {
      console.error("Error restoring application:", err);
      toast.error("حدث خطأ في الاتصال بالخادم");
    } finally {
      setProcessingApplication(false);
    }
  }

  async function approveApplication() {
    if (!selectedApplication) return;
    try {
      setProcessingApplication(true);
      const res = await fetch(`/api/membership/admin/requests/${selectedApplication.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role: assignedRole }),
      });

      if (res.ok) {
        const data = await res.json();
        setSuccessModal({ 
          show: true, 
          message: `تم قبول الطلب بنجاح!\n\nالبريد: ${data.email}\nكلمة المرور المؤقتة: ${data.tempPassword}` 
        });
        setShowApproveModal(false);
        setSelectedApplication(null);
        fetchApplications();
        fetchUsers();
      } else {
        const data = await res.json();
        toast.error(data.error || "حدث خطأ في قبول الطلب");
      }
    } catch (err) {
      console.error("Error approving application:", err);
      toast.error("حدث خطأ في الاتصال بالخادم");
    } finally {
      setProcessingApplication(false);
    }
  }

  function openRejectModal(id: number) {
    setRejectingId(id);
    setRejectNote('');
    setShowRejectModal(true);
  }

  async function confirmRejectApplication() {
    if (!rejectingId) return;
    if (!rejectNote.trim()) {
      toast.error("يجب كتابة سبب الرفض");
      return;
    }
    
    try {
      setProcessingApplication(true);
      const res = await fetch(`/api/membership/admin/requests/${rejectingId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ admin_note: rejectNote.trim() }),
      });

      if (res.ok) {
        setSuccessModal({ show: true, message: "تم رفض الطلب" });
        setShowRejectModal(false);
        setRejectingId(null);
        setRejectNote('');
        fetchApplications();
      } else {
        const data = await res.json();
        toast.error(data.error || "حدث خطأ في رفض الطلب");
      }
    } catch (err) {
      console.error("Error rejecting application:", err);
      toast.error("حدث خطأ في الاتصال بالخادم");
    } finally {
      setProcessingApplication(false);
    }
  }

  async function updateUserRole(userId: string, newRole: string) {
    try {
      setUpdating(true);
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role: newRole }),
      });

      if (res.ok) {
        if (newRole === 'user') {
          setUsers(prev => prev.filter(u => u.id !== userId));
          setSuccessModal({ 
            show: true, 
            message: 'تم تجريد الصلاحيات بنجاح. تم إرجاع المستخدم لحساب عادي.' 
          });
        } else {
          setUsers(prev =>
            prev.map(u => u.id === userId ? { ...u, role: newRole } : u)
          );
          setSuccessModal({ 
            show: true, 
            message: `تم تحديث الدور بنجاح.` 
          });
        }
        setShowRoleModal(false);
        setSelectedUser(null);
      } else {
        const data = await res.json();
        toast.error(data.error || "حدث خطأ في تحديث الدور");
      }
    } catch (err) {
      console.error("Error updating role:", err);
      toast.error("حدث خطأ في الاتصال بالخادم");
    } finally {
      setUpdating(false);
    }
  }

  const filteredUsers = users.filter(user => {
    if (user.role === 'user') return false;
    const matchSearch = !search || 
      user.name?.toLowerCase().includes(search.toLowerCase()) ||
      user.email?.toLowerCase().includes(search.toLowerCase());
    const matchRole = !selectedRole || user.role === selectedRole;
    return matchSearch && matchRole;
  });

  // Resolve role display info from the unified merged list (adminRoles),
  // not the hardcoded ROLES constant — that way table cells, badges and
  // chips for custom roles render with the right label / color / icon
  // even though the constant only knows about the default six.
  const getIconComponent = (iconKey: string) => ICON_OPTIONS.find(i => i.key === iconKey)?.icon || Shield;
  const getRoleInfo = (roleKey: string) => {
    const adm = adminRoles.find(r => r.key === roleKey);
    if (adm) {
      const Icon = getIconComponent(adm.icon || 'Shield');
      return {
        id: adm.key,
        name: adm.label,
        color: adm.color || '#6B7280',
        icon: Icon,
        description: adm.description || '',
        level: adm.isDefault ? 60 : 50,
      };
    }
    return ROLES.find(r => r.id === roleKey) || ROLES[0];
  };

  const adminUsers = users.filter(u => u.role !== 'user');
  const regularUsers = users.filter(u => u.role === 'user');

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ar-SA', { 
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      'UPDATE_ROLE_PERMISSIONS': 'تحديث صلاحيات دور',
      'CREATE_CUSTOM_ROLE': 'إنشاء دور مخصص',
      'UPDATE_CUSTOM_ROLE': 'تحديث دور مخصص',
      'DELETE_CUSTOM_ROLE': 'حذف دور مخصص',
      'UPDATE_USER_ROLE': 'تغيير دور مستخدم',
    };
    return labels[action] || action;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
      </div>
    );
  }

  return (
    <div className="p-6" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#002845]">إدارة الصلاحيات</h1>
          <p className="text-slate-500 mt-1">تعديل أدوار المستخدمين وصلاحياتهم</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/admin/users')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition text-sm font-medium"
          >
            <Users className="w-4 h-4" />
            إدارة العملاء
          </button>
          <div className="bg-gradient-to-r from-[#D4AF37]/10 to-[#B8860B]/10 border border-[#D4AF37]/30 rounded-xl px-4 py-2">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#D4AF37]" />
              <span className="text-sm font-bold text-[#002845]">{adminUsers.length}</span>
              <span className="text-sm text-slate-500">مدير</span>
            </div>
          </div>
          <div className="bg-slate-100 rounded-xl px-4 py-2">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-slate-500" />
              <span className="text-sm font-bold text-[#002845]">{regularUsers.length}</span>
              <span className="text-sm text-slate-500">مستخدم</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {/* Tab order per owner spec: 1) Add Role  2) Define Role
            Permissions  3) Assign Roles  4) Audit Log.
            "طلبات التوظيف" lives in /admin/hr/employees now — no
            longer surfaced here to avoid duplication. */}
        <button
          onClick={() => setActiveTab('custom')}
          className={`px-5 py-2.5 rounded-xl font-semibold transition-all text-sm ${
            activeTab === 'custom'
              ? 'bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white shadow-lg'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Plus className="w-4 h-4 inline-block ml-2" />
          إضافة دور
        </button>
        <button
          onClick={() => setActiveTab('permissions')}
          className={`px-5 py-2.5 rounded-xl font-semibold transition-all text-sm ${
            activeTab === 'permissions'
              ? 'bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white shadow-lg'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Settings className="w-4 h-4 inline-block ml-2" />
          تحديد صلاحيات الدور
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-5 py-2.5 rounded-xl font-semibold transition-all text-sm ${
            activeTab === 'users'
              ? 'bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white shadow-lg'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Users className="w-4 h-4 inline-block ml-2" />
          تعيين الأدوار
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`px-5 py-2.5 rounded-xl font-semibold transition-all text-sm ${
            activeTab === 'audit'
              ? 'bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white shadow-lg'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <History className="w-4 h-4 inline-block ml-2" />
          سجل التدقيق
        </button>
      </div>

      {activeTab === 'permissions' && (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-[#002845] to-[#003d5c]">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Settings className="w-5 h-5" />
              تحديد صلاحيات كل دور
            </h2>
            <p className="text-white/70 text-sm mt-1">
              اختر دورًا من القائمة لعرض وتعديل صلاحياته — تظهر هنا تلقائيًا كل الأدوار (افتراضية ومخصّصة).
            </p>
          </div>

          <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Sidebar: every role rendered as a clickable card. */}
            <aside className="lg:col-span-4 xl:col-span-3 space-y-2">
              {adminRoles.length === 0 ? (
                <div className="text-center text-slate-400 py-8 text-sm">جاري تحميل الأدوار...</div>
              ) : (
                adminRoles.map((role) => {
                  const Icon = getIconComponent(role.icon || 'Shield');
                  const isSelected = selectedAdminRole === role.key;
                  const color = role.color || '#6B7280';
                  return (
                    <button
                      key={role.key}
                      onClick={() => setSelectedAdminRole(role.key)}
                      className={`w-full text-right p-3 rounded-xl border-2 transition-all flex items-start gap-3 ${
                        isSelected
                          ? 'border-[#D4AF37] bg-[#D4AF37]/10 shadow-md'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0"
                        style={{ backgroundColor: color }}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-[#002845] truncate">{role.label}</span>
                          {role.isDefault ? (
                            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">افتراضي</span>
                          ) : (
                            <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">مخصص</span>
                          )}
                          {role.hasOverride && (
                            <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full" title="مُعدَّل عن الافتراضي">مُعدّل</span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {role.member_count ?? 0} عضو
                          </span>
                          {role.has_inbox && (
                            <span className="inline-flex items-center gap-1 text-blue-600" title="لهذا الدور صندوق وارد">
                              <Mailbox className="w-3 h-3" />
                              صندوق
                            </span>
                          )}
                          {role.has_sidebar && (
                            <span className="inline-flex items-center gap-1 text-emerald-600" title="لهذا الدور قسم في القائمة الجانبية">
                              <LayoutGrid className="w-3 h-3" />
                              قسم
                            </span>
                          )}
                        </div>
                        {role.description && (
                          <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">{role.description}</p>
                        )}
                      </div>
                      {isSelected && <Check className="w-5 h-5 text-[#D4AF37] shrink-0" />}
                    </button>
                  );
                })
              )}
            </aside>

            {/* Permissions panel — categorized + tooltips. */}
            <section className="lg:col-span-8 xl:col-span-9">
              {loadingPermissions ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
                </div>
              ) : selectedAdminRole && (selectedAdminRole === 'super_admin' || selectedAdminRole === 'admin') ? (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
                  <div className="flex items-center gap-2 text-blue-700">
                    <Shield className="w-5 h-5" />
                    <span className="font-semibold">تحكم كامل</span>
                  </div>
                  <p className="text-sm text-blue-600 mt-1">
                    {selectedAdminRole === 'super_admin' ? 'المدير العام' : 'المدير'} يتحكم بجميع الصلاحيات تلقائيًا ولا يحتاج إلى تفعيل يدوي.
                  </p>
                </div>
              ) : !selectedAdminRole ? (
                <div className="py-16 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                  <Shield className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                  اختر دورًا من القائمة على اليمين لعرض وتعديل صلاحياته.
                </div>
              ) : rolePermissions.length === 0 ? (
                <div className="py-16 text-center text-slate-500 border-2 border-dashed border-slate-200 rounded-xl">
                  <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-amber-400" />
                  لم تُحمَّل صلاحيات هذا الدور. حاول إعادة تحديد الدور.
                </div>
              ) : (
                <>
                  {(() => {
                    // Group permissions by category, preserving the original
                    // order. Uncategorized fall into "أخرى" at the end.
                    const byCat: Record<string, Permission[]> = {};
                    for (const p of rolePermissions) {
                      const cat = p.category || 'other';
                      (byCat[cat] = byCat[cat] || []).push(p);
                    }
                    const catKeys = Object.keys(byCat).sort((a, b) => {
                      const sa = permissionCategories[a]?.sort ?? 999;
                      const sb = permissionCategories[b]?.sort ?? 999;
                      return sa - sb;
                    });
                    return (
                      <div className="space-y-5">
                        {catKeys.map((cat) => (
                          <div key={cat} className="border border-slate-200 rounded-xl overflow-hidden">
                            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                              <h3 className="text-sm font-bold text-[#002845]">
                                {permissionCategories[cat]?.label || 'أخرى'}
                              </h3>
                              <span className="text-[11px] text-slate-500">
                                {byCat[cat].filter(p => p.isGranted).length} / {byCat[cat].length} مفعّل
                              </span>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2 p-3">
                              {byCat[cat].map((perm) => (
                                <button
                                  key={perm.key}
                                  onClick={() => togglePermission(perm.key)}
                                  title={perm.description || perm.label}
                                  className={`flex items-start justify-between gap-3 p-3 rounded-lg border-2 transition text-right hover:shadow-sm cursor-pointer ${
                                    perm.isGranted
                                      ? 'border-green-400 bg-green-50'
                                      : 'border-slate-200 bg-white'
                                  }`}
                                >
                                  <div className="flex items-start gap-2 flex-1 min-w-0">
                                    {perm.isGranted ? (
                                      <ToggleRight className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                                    ) : (
                                      <ToggleLeft className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <p className="font-semibold text-[#002845] text-sm truncate">{perm.label}</p>
                                      {perm.description && (
                                        <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{perm.description}</p>
                                      )}
                                    </div>
                                  </div>
                                  {perm.isGranted && <Check className="w-4 h-4 text-green-500 shrink-0 mt-1" />}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  <div className="flex justify-end mt-6">
                    <button
                      onClick={saveRolePermissions}
                      disabled={savingPermissions}
                      className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white rounded-xl font-bold hover:shadow-lg transition disabled:opacity-50"
                    >
                      {savingPermissions ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Save className="w-5 h-5" />
                      )}
                      حفظ الصلاحيات
                    </button>
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      )}

      {activeTab === 'custom' && (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-[#002845] to-[#003d5c] flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5" />
                إضافة وإدارة الأدوار
              </h2>
              <p className="text-white/70 text-sm mt-1">
                هذه الشاشة لإدارة <span className="text-white font-semibold">بيانات الدور</span> فقط: الاسم، الوصف، اللون، الأيقونة، صندوق الوارد، قسم القائمة الجانبية.
                لتعديل صلاحيات الدور افتح تبويب &quot;تحديد صلاحيات&quot;، ولربط مستخدم بدور افتح تبويب &quot;تعيين&quot;.
              </p>
            </div>
            <button
              onClick={() => {
                setEditingRole(null);
                setNewRole({ key: '', label: '', description: '', color: '#6B7280', icon: 'Shield', has_inbox: false, inbox_title: '', section_key: '', can_receive_transfers: true, can_be_assigned: true, can_reply_to_customers: false, can_see_sensitive_finance: false, can_close_complaints: false });
                setShowCreateRoleModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl font-semibold transition"
            >
              <Plus className="w-5 h-5" />
              إنشاء دور جديد
            </button>
          </div>

          <div className="p-5">
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-amber-700 text-sm">
                <strong>ملاحظة:</strong> الأدوار الافتراضية (إدارة المحتوى، الدعم الفني، إدارة المالية، مدير إداري) لا يمكن تعديلها أو حذفها.
              </p>
            </div>

            {customRoles.length === 0 ? (
              <div className="text-center py-12">
                <Shield className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500 text-lg">لا توجد أدوار</p>
                <p className="text-slate-400 text-sm mt-1">اضغط على "إنشاء دور جديد" لإضافة دور مخصص</p>
              </div>
            ) : (() => {
              // Phase 3.6 — split into "افتراضية" + "مخصصة" sections so the
              // hierarchy reads naturally: system roles first, then any
              // custom ones the owner has built. Defaults can be edited
              // (label/color/icon/capabilities) but never deleted.
              const defaults = customRoles.filter((r: any) => r.isDefault);
              const customs = customRoles.filter((r: any) => !r.isDefault);
              const renderCard = (role: any) => {
                const Icon = getIconComponent(role.icon || 'Shield');
                const isDefault = !!role.isDefault;
                return (
                  <div
                    key={role.key}
                    className={`p-4 rounded-xl border-2 transition bg-white ${
                      isDefault ? "border-[#D4AF37]/40 hover:border-[#D4AF37]" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: role.color || '#6B7280' }}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingRole(role);
                            setNewRole({
                              key: role.key,
                              label: role.label,
                              description: role.description || '',
                              color: role.color || '#6B7280',
                              icon: role.icon || 'Shield',
                              has_inbox: false, inbox_title: '', section_key: '',
                              can_receive_transfers: (role as any).can_receive_transfers ?? true,
                              can_be_assigned: (role as any).can_be_assigned ?? true,
                              can_reply_to_customers: (role as any).can_reply_to_customers ?? false,
                              can_see_sensitive_finance: (role as any).can_see_sensitive_finance ?? false,
                              can_close_complaints: (role as any).can_close_complaints ?? false
                            });
                            setShowCreateRoleModal(true);
                          }}
                          className="p-2 hover:bg-slate-100 rounded-lg transition"
                          title="تعديل"
                        >
                          <Edit2 className="w-4 h-4 text-slate-500" />
                        </button>
                        {!isDefault && (
                          <button
                            onClick={() => deleteRole(role.key)}
                            className="p-2 hover:bg-red-50 rounded-lg transition"
                            title="حذف"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-[#002845]">{role.label}</h3>
                      {isDefault && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border bg-[#D4AF37]/10 text-[#9a7d28] border-[#D4AF37]/30 font-bold">
                          افتراضي
                        </span>
                      )}
                      {role.hasOverride && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200">
                          مُعدّل
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">المفتاح: {role.key}</p>
                    {role.description && (
                      <p className="text-sm text-slate-500 mt-2">{role.description}</p>
                    )}
                  </div>
                );
              };
              return (
                <div className="space-y-6">
                  {defaults.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-1 h-5 rounded-full bg-[#D4AF37]" />
                        <h3 className="text-sm font-bold text-[#002845]">الأدوار الافتراضية</h3>
                        <span className="text-xs text-slate-400">({defaults.length})</span>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{defaults.map(renderCard)}</div>
                    </div>
                  )}
                  {customs.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-1 h-5 rounded-full bg-slate-400" />
                        <h3 className="text-sm font-bold text-[#002845]">أدوار مخصصة</h3>
                        <span className="text-xs text-slate-400">({customs.length})</span>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{customs.map(renderCard)}</div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-[#002845] to-[#003d5c]">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <History className="w-5 h-5" />
              سجل التدقيق
            </h2>
            <p className="text-white/70 text-sm mt-1">تتبع جميع التغييرات على الصلاحيات والأدوار</p>
          </div>

          <div className="p-5">
            {loadingAudit ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="text-center py-12">
                <History className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500 text-lg">لا توجد سجلات تدقيق</p>
                <p className="text-slate-400 text-sm mt-1">ستظهر هنا جميع التغييرات على الصلاحيات</p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-4 rounded-xl border border-slate-200 hover:border-slate-300 transition bg-slate-50"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-full bg-[#002845] flex items-center justify-center text-white shrink-0">
                            <History className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="font-semibold text-[#002845]">{getActionLabel(log.action_type)}</p>
                            {log.target_role && (
                              <p className="text-sm text-slate-500 mt-0.5">الدور: {log.target_role}</p>
                            )}
                            {log.target_user_name && (
                              <p className="text-sm text-slate-500 mt-0.5">المستخدم: {log.target_user_name}</p>
                            )}
                            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDate(log.created_at)}
                              <span className="mx-1">•</span>
                              بواسطة: {log.changed_by_name}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="p-2 hover:bg-white rounded-lg transition"
                        >
                          <Eye className="w-4 h-4 text-slate-500" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {auditTotalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-6">
                    <button
                      onClick={() => setAuditPage(p => Math.max(1, p - 1))}
                      disabled={auditPage === 1}
                      className="px-4 py-2 border border-slate-200 rounded-lg disabled:opacity-50"
                    >
                      السابق
                    </button>
                    <span className="px-4 py-2 text-slate-600">
                      {auditPage} / {auditTotalPages}
                    </span>
                    <button
                      onClick={() => setAuditPage(p => Math.min(auditTotalPages, p + 1))}
                      disabled={auditPage === auditTotalPages}
                      className="px-4 py-2 border border-slate-200 rounded-lg disabled:opacity-50"
                    >
                      التالي
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <>
          <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-[#002845] to-[#003d5c] text-white">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Users className="w-5 h-5" />
              تعيين الأدوار للموظفين
            </h2>
            <p className="text-white/70 text-sm mt-1">
              هذه الشاشة لربط الموظفين بالأدوار فقط. اضغط بطاقة دور للتصفية، أو
              &quot;تغيير الدور&quot; بجانب اسم موظف لإعادة تعيينه لأي دور موجود — افتراضي أو مخصص.
              لتعديل بيانات الدور افتح تبويب &quot;إضافة دور&quot;، ولتعديل صلاحياته افتح &quot;تحديد صلاحيات&quot;.
            </p>
          </div>
          <div className="grid lg:grid-cols-4 gap-6 mb-8">
            {/*
              Now reads from adminRoles (same merged source as the permissions
              tab) so a freshly-created custom role appears here automatically.
              Member count comes from the server-side annotation, with a
              live local fallback for instant feedback after role changes.
            */}
            {adminRoles.map((role) => {
              const Icon = getIconComponent(role.icon || 'Shield');
              const liveCount = users.filter(u => u.role === role.key).length;
              const count = liveCount || role.member_count || 0;
              const color = role.color || '#6B7280';
              return (
                <button
                  key={role.key}
                  onClick={() => setSelectedRole(selectedRole === role.key ? "" : role.key)}
                  className={`p-5 rounded-2xl border-2 transition-all text-right ${
                    selectedRole === role.key
                      ? "border-[#D4AF37] bg-[#D4AF37]/5 shadow-lg"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-white"
                      style={{ backgroundColor: color }}
                    >
                      <Icon className="w-6 h-6" />
                    </div>
                    <span
                      className="text-2xl font-black"
                      style={{ color }}
                    >
                      {count}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                    <h3 className="font-bold text-[#002845]">{role.label}</h3>
                    {role.isDefault ? (
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">افتراضي</span>
                    ) : (
                      <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">مخصص</span>
                    )}
                  </div>
                  {role.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{role.description}</p>}
                </button>
              );
            })}
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-[#002845] to-[#003d5c]">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="بحث بالاسم أو البريد..."
                    className="w-full pr-12 pl-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:border-[#D4AF37] appearance-none cursor-pointer"
                >
                  <option value="" className="bg-[#002845]">كل الأدوار</option>
                  {adminRoles.map((role) => (
                    <option key={role.key} value={role.key} className="bg-[#002845]">
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 text-sm">
                    <th className="px-6 py-4 text-right font-semibold">المستخدم</th>
                    <th className="px-6 py-4 text-right font-semibold">البريد</th>
                    <th className="px-6 py-4 text-right font-semibold">الباقة</th>
                    <th className="px-6 py-4 text-right font-semibold">الدور الحالي</th>
                    <th className="px-6 py-4 text-right font-semibold">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center">
                        <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500">لا توجد نتائج</p>
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => {
                      const roleInfo = getRoleInfo(user.role);
                      const Icon = roleInfo.icon;
                      
                      return (
                        <tr key={user.id} className="hover:bg-slate-50/50 transition">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div 
                                className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
                                style={{ backgroundColor: roleInfo.color }}
                              >
                                {user.name?.charAt(0) || '؟'}
                              </div>
                              <div>
                                <p className="font-semibold text-[#002845]">{user.name || 'بدون اسم'}</p>
                                <p className="text-xs text-slate-400">{user.phone || '-'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-slate-600">{user.email}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-slate-500">
                              {user.plan_name || 'بدون باقة'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div 
                              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-white text-sm font-medium"
                              style={{ backgroundColor: roleInfo.color }}
                            >
                              <Icon className="w-4 h-4" />
                              {roleInfo.name}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <button
                              onClick={() => {
                                setSelectedUser(user);
                                setShowRoleModal(true);
                              }}
                              className="px-4 py-2 bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white rounded-xl text-sm font-semibold hover:shadow-lg transition"
                            >
                              تعديل الدور
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'applications' && (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-[#002845] to-[#003d5c]">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5" />
              طلبات التوظيف
            </h2>
            <p className="text-white/70 text-sm mt-1">مراجعة وقبول أو رفض طلبات الانضمام للفريق الإداري</p>
          </div>

          <div className="flex border-b border-slate-100">
            <button
              onClick={() => setApplicationsSubTab('pending')}
              className={`flex-1 px-4 py-3 text-sm font-semibold transition flex items-center justify-center gap-2 ${
                applicationsSubTab === 'pending'
                  ? 'text-[#D4AF37] border-b-2 border-[#D4AF37] bg-[#D4AF37]/5'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Clock className="w-4 h-4" />
              طلبات جديدة
              {applications.length > 0 && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700">
                  {applications.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setApplicationsSubTab('rejected')}
              className={`flex-1 px-4 py-3 text-sm font-semibold transition flex items-center justify-center gap-2 ${
                applicationsSubTab === 'rejected'
                  ? 'text-red-600 border-b-2 border-red-500 bg-red-50'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <X className="w-4 h-4" />
              طلبات مرفوضة
              {rejectedApplications.length > 0 && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700">
                  {rejectedApplications.length}
                </span>
              )}
            </button>
          </div>

          {loadingApplications ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
            </div>
          ) : applicationsSubTab === 'pending' && applications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
              <h3 className="text-xl font-bold text-[#002845] mb-2">لا توجد طلبات جديدة</h3>
              <p className="text-slate-500">جميع الطلبات تمت مراجعتها</p>
            </div>
          ) : applicationsSubTab === 'rejected' && rejectedApplications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle2 className="w-16 h-16 text-slate-300 mb-4" />
              <h3 className="text-xl font-bold text-[#002845] mb-2">لا توجد طلبات مرفوضة</h3>
              <p className="text-slate-500">لم يتم رفض أي طلبات بعد</p>
            </div>
          ) : applicationsSubTab === 'rejected' ? (
            <div className="divide-y divide-slate-100">
              {rejectedApplications.map((app) => (
                <div key={app.id} className="p-5 bg-red-50/30 hover:bg-red-50/50 transition">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center text-white font-bold text-lg">
                          {app.full_name?.charAt(0) || '؟'}
                        </div>
                        <div>
                          <h3 className="font-bold text-[#002845] text-lg">{app.full_name}</h3>
                          <p className="text-sm text-slate-500">{app.job_title}</p>
                        </div>
                        <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-700">مرفوض</span>
                      </div>

                      {app.admin_note && (
                        <div className="mb-3 p-3 bg-red-100 rounded-lg border border-red-200">
                          <p className="text-sm text-red-800 font-semibold mb-1">سبب الرفض:</p>
                          <p className="text-sm text-red-700">{app.admin_note}</p>
                          {app.reviewed_at && (
                            <p className="text-xs text-red-500 mt-2">
                              تم الرفض في: {new Date(app.reviewed_at).toLocaleDateString('ar-SA', { 
                                year: 'numeric', month: 'long', day: 'numeric'
                              })}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                        <div className="flex items-center gap-2 text-slate-600">
                          <span className="text-slate-400">البريد:</span>
                          <span>{app.email}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-600">
                          <span className="text-slate-400">الهاتف:</span>
                          <span dir="ltr">{app.phone}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-600">
                          <span className="text-slate-400">العمر:</span>
                          <span>{app.age} سنة</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-600">
                          <span className="text-slate-400">البلد:</span>
                          <span>{app.country}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-row lg:flex-col gap-2">
                      <button
                        onClick={() => restoreApplication(app.id)}
                        disabled={processingApplication}
                        className="flex-1 lg:flex-none px-5 py-2.5 bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white rounded-xl text-sm font-semibold hover:shadow-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {processingApplication ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <History className="w-4 h-4" />
                            استرجاع
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {applications.map((app) => (
                <div key={app.id} className="p-5 hover:bg-slate-50/50 transition">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#D4AF37] to-[#B8860B] flex items-center justify-center text-white font-bold text-lg">
                          {app.full_name?.charAt(0) || '؟'}
                        </div>
                        <div>
                          <h3 className="font-bold text-[#002845] text-lg">{app.full_name}</h3>
                          <p className="text-sm text-slate-500">{app.job_title}</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        <div className="bg-slate-50 rounded-lg p-3">
                          <p className="text-xs text-slate-400 mb-1">البريد</p>
                          <p className="text-sm text-[#002845] font-medium truncate">{app.email}</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3">
                          <p className="text-xs text-slate-400 mb-1">الهاتف</p>
                          <p className="text-sm text-[#002845] font-medium">{app.phone}</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3">
                          <p className="text-xs text-slate-400 mb-1">العمر</p>
                          <p className="text-sm text-[#002845] font-medium">{app.age} سنة</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3">
                          <p className="text-xs text-slate-400 mb-1">البلد</p>
                          <p className="text-sm text-[#002845] font-medium">{app.country}</p>
                        </div>
                      </div>

                      {app.cover_letter && (
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-3">
                          <p className="text-xs text-blue-600 mb-1 font-medium">رسالة التقديم</p>
                          <p className="text-sm text-slate-700 whitespace-pre-wrap">{app.cover_letter}</p>
                        </div>
                      )}

                      <div className="flex items-center gap-4 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {new Date(app.created_at).toLocaleDateString('ar-SA', { 
                            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </span>
                        {app.cv_path && (
                          <a
                            href={`/api/membership/admin/cv/${app.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[#D4AF37] hover:underline"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            عرض السيرة الذاتية
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-row lg:flex-col gap-2">
                      <button
                        onClick={() => {
                          setSelectedApplication(app);
                          setShowApproveModal(true);
                        }}
                        className="flex-1 lg:flex-none px-5 py-2.5 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl text-sm font-semibold hover:shadow-lg transition flex items-center justify-center gap-2"
                      >
                        <Check className="w-4 h-4" />
                        قبول
                      </button>
                      <button
                        onClick={() => openRejectModal(app.id)}
                        className="flex-1 lg:flex-none px-5 py-2.5 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl text-sm font-semibold hover:shadow-lg transition flex items-center justify-center gap-2"
                      >
                        <X className="w-4 h-4" />
                        رفض
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {showApproveModal && selectedApplication && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowApproveModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-green-500 to-green-600">
                <h3 className="text-lg font-bold text-white">قبول الطلب وتعيين الدور</h3>
                <p className="text-white/80 text-sm mt-1">{selectedApplication.full_name}</p>
              </div>

              <div className="p-5">
                <p className="text-sm text-slate-600 mb-4">اختر الدور الذي سيتم تعيينه للموظف الجديد:</p>
                
                <div className="space-y-2 mb-6">
                  {adminRoles.filter(r => r.key !== 'super_admin').map((role) => {
                    const Icon = getIconComponent(role.icon || 'Shield');
                    const color = role.color || '#6B7280';
                    return (
                      <button
                        key={role.key}
                        onClick={() => setAssignedRole(role.key)}
                        className={`w-full p-3 rounded-xl border-2 transition-all text-right flex items-center gap-3 ${
                          assignedRole === role.key
                            ? "border-[#D4AF37] bg-[#D4AF37]/10"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                          style={{ backgroundColor: color }}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-[#002845]">{role.label}</p>
                            {!role.isDefault && (
                              <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">مخصص</span>
                            )}
                          </div>
                          {role.description && <p className="text-xs text-slate-500">{role.description}</p>}
                        </div>
                        {assignedRole === role.key && (
                          <Check className="w-5 h-5 text-[#D4AF37]" />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowApproveModal(false)}
                    className="flex-1 px-5 py-3 border border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 transition"
                  >
                    إلغاء
                  </button>
                  <button
                    onClick={approveApplication}
                    disabled={processingApplication}
                    className="flex-1 px-5 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-semibold hover:shadow-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {processingApplication ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Check className="w-5 h-5" />
                        تأكيد القبول
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRejectModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowRejectModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-red-500 to-red-600">
                <h3 className="text-lg font-bold text-white">رفض طلب التوظيف</h3>
                <p className="text-white/80 text-sm mt-1">يرجى كتابة سبب الرفض</p>
              </div>

              <div className="p-5">
                <textarea
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="اكتب سبب رفض الطلب هنا..."
                  className="w-full h-32 px-4 py-3 border border-slate-200 rounded-xl text-right resize-none focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                />
                
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => {
                      setShowRejectModal(false);
                      setRejectingId(null);
                      setRejectNote('');
                    }}
                    className="flex-1 px-5 py-3 border border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 transition"
                  >
                    إلغاء
                  </button>
                  <button
                    onClick={confirmRejectApplication}
                    disabled={processingApplication || !rejectNote.trim()}
                    className="flex-1 px-5 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-semibold hover:shadow-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {processingApplication ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <X className="w-5 h-5" />
                        تأكيد الرفض
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRoleModal && selectedUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => { setShowRoleModal(false); setRoleModalSearch(""); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
            >
              <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-[#002845] to-[#003d5c]">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-white">تغيير الدور</h3>
                    <p className="text-white/70 text-xs mt-1 truncate">
                      {selectedUser.name} · <span className="text-white/50">{selectedUser.email}</span>
                    </p>
                    <p className="text-white/60 text-[11px] mt-1">
                      الدور الحالي: <span className="text-white font-semibold">{(adminRoles.find(r => r.key === selectedUser.role)?.label) || selectedUser.role}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => { setShowRoleModal(false); setRoleModalSearch(""); }}
                    className="text-white/60 hover:text-white p-1"
                    aria-label="إغلاق"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-3 border-b border-slate-100">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={roleModalSearch}
                    onChange={(e) => setRoleModalSearch(e.target.value)}
                    placeholder="ابحث في الأدوار (افتراضية ومخصصة)..."
                    autoFocus
                    className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-[#002845] placeholder:text-slate-400 focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>

              <div className="p-3 flex-1 overflow-y-auto">
                {/* Self-edit guard: if the signed-in user is looking at their
                    own row AND is currently super_admin, block any action
                    that would demote them. Backend rejects this too — UI
                    just makes the reason obvious. */}
                {(() => {
                  const isSelf = currentUserId && String(selectedUser.id) === String(currentUserId);
                  const isSuper = selectedUser.role === 'super_admin';
                  if (isSelf && isSuper) {
                    return (
                      <div className="mb-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>هذا حسابك. لا يمكنك تخفيض دورك من super_admin بنفسك حتى لا تفقد الوصول. اطلب من super_admin آخر تعديل دورك عند الحاجة.</span>
                      </div>
                    );
                  }
                  return null;
                })()}
                <p className="text-[10px] text-slate-400 mb-2 px-1">
                  أعِد تعيين الدور لأي دور موجود — افتراضي أو مخصّص. التغيير يُسجَّل في سجل التدقيق.
                </p>
                <div className="space-y-2">
                  {(() => {
                    const q = roleModalSearch.trim().toLowerCase();
                    const filtered = adminRoles.filter(r => {
                      if (!q) return true;
                      return (
                        r.label?.toLowerCase().includes(q) ||
                        r.key?.toLowerCase().includes(q) ||
                        r.description?.toLowerCase().includes(q)
                      );
                    });
                    if (filtered.length === 0) {
                      return (
                        <div className="py-8 text-center text-sm text-slate-400">
                          لا توجد أدوار تطابق البحث.
                        </div>
                      );
                    }
                    return filtered.map((role) => {
                      const Icon = getIconComponent(role.icon || 'Shield');
                      const isSelected = selectedUser.role === role.key;
                      const isSelf = !!currentUserId && String(selectedUser.id) === String(currentUserId);
                      const wouldDemoteSelfFromSuper = isSelf && selectedUser.role === 'super_admin' && role.key !== 'super_admin';
                      const color = role.color || '#6B7280';

                      return (
                        <button
                          key={role.key}
                          onClick={() => {
                            setConfirmModal({
                              show: true,
                              title: 'تأكيد تغيير الدور',
                              message: `سيتم تغيير دور "${selectedUser.name}" من "${(adminRoles.find(r => r.key === selectedUser.role)?.label) || selectedUser.role}" إلى "${role.label}". هل تريد المتابعة؟`,
                              onConfirm: () => {
                                updateUserRole(selectedUser.id, role.key);
                                setConfirmModal(prev => ({ ...prev, show: false }));
                              }
                            });
                          }}
                          disabled={updating || isSelected || wouldDemoteSelfFromSuper}
                          title={wouldDemoteSelfFromSuper ? "لا يمكنك تخفيض دورك بنفسك" : (role.description || undefined)}
                          className={`w-full p-3 rounded-lg border-2 transition-all text-right flex items-start gap-3 ${
                            isSelected
                              ? "border-[#D4AF37] bg-[#D4AF37]/10"
                              : "border-slate-200 hover:border-[#D4AF37]/60 hover:bg-slate-50"
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0"
                            style={{ backgroundColor: color }}
                          >
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-bold text-[#002845] text-sm">{role.label}</p>
                              {role.isDefault ? (
                                <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">افتراضي</span>
                              ) : (
                                <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">مخصص</span>
                              )}
                              {isSelected && (
                                <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">الحالي</span>
                              )}
                              {role.has_inbox && (
                                <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5">
                                  <Mailbox className="w-2.5 h-2.5" /> صندوق
                                </span>
                              )}
                            </div>
                            {role.description && (
                              <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{role.description}</p>
                            )}
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-[#D4AF37] shrink-0 mt-1" />}
                          {updating && !isSelected && (
                            <Loader2 className="w-4 h-4 animate-spin text-slate-400 shrink-0 mt-1" />
                          )}
                        </button>
                      );
                    });
                  })()}
                </div>

                <div className="mt-4 pt-3 border-t border-red-200">
                  <p className="text-[10px] text-red-500 mb-2 px-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    تجريد الصلاحيات
                  </p>
                  <button
                    onClick={() => {
                      setConfirmModal({
                        show: true,
                        title: 'تجريد الصلاحيات',
                        message: `هل أنت متأكد من تجريد "${selectedUser.name}" من جميع الصلاحيات الإدارية وإرجاعه لمستخدم عادي؟ سيفقد الوصول لجميع أقسام الإدارة.`,
                        onConfirm: () => {
                          updateUserRole(selectedUser.id, 'user');
                          setConfirmModal(prev => ({ ...prev, show: false }));
                        }
                      });
                    }}
                    disabled={updating || selectedUser.role === 'user' || (currentUserId !== "" && String(selectedUser.id) === String(currentUserId))}
                    title={currentUserId !== "" && String(selectedUser.id) === String(currentUserId) ? "لا يمكنك تجريد حسابك بنفسك" : undefined}
                    className={`w-full p-2.5 rounded-lg border-2 transition-all text-right flex items-center gap-2.5 ${
                      selectedUser.role === 'user'
                        ? "border-red-300 bg-red-50"
                        : "border-red-200 hover:border-red-400 hover:bg-red-50"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-500 text-white shrink-0">
                      <UserX className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-red-600 text-sm">إرجاع إلى مستخدم عادي</p>
                      <p className="text-[10px] text-red-400">إزالة جميع الصلاحيات الإدارية</p>
                    </div>
                    {selectedUser.role === 'user' && (
                      <Check className="w-4 h-4 text-red-500 shrink-0" />
                    )}
                    {updating && selectedUser.role !== 'user' && (
                      <Loader2 className="w-4 h-4 animate-spin text-red-400 shrink-0" />
                    )}
                  </button>
                </div>
              </div>

              <div className="p-3 border-t border-slate-100">
                <button
                  onClick={() => setShowRoleModal(false)}
                  className="w-full px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-semibold hover:bg-slate-50 transition text-sm"
                >
                  إغلاق
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCreateRoleModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowCreateRoleModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-[#002845] to-[#003d5c]">
                <h3 className="text-lg font-bold text-white">
                  {editingRole ? 'تعديل الدور' : 'إنشاء دور جديد'}
                </h3>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-[#002845] mb-2">المفتاح (بالإنجليزية)</label>
                  <input
                    type="text"
                    value={newRole.key}
                    onChange={(e) => setNewRole(prev => ({ ...prev, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                    disabled={!!editingRole}
                    placeholder="مثال: custom_role"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-[#D4AF37] disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#002845] mb-2">اسم الدور (بالعربية)</label>
                  <input
                    type="text"
                    value={newRole.label}
                    onChange={(e) => setNewRole(prev => ({ ...prev, label: e.target.value }))}
                    placeholder="مثال: مدير المبيعات"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#002845] mb-2">الوصف (اختياري)</label>
                  <textarea
                    value={newRole.description}
                    onChange={(e) => setNewRole(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="وصف مختصر للدور..."
                    rows={2}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-[#D4AF37] resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#002845] mb-2">اللون</label>
                  <div className="flex gap-2 flex-wrap">
                    {COLOR_OPTIONS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setNewRole(prev => ({ ...prev, color }))}
                        className={`w-8 h-8 rounded-lg transition ${
                          newRole.color === color ? 'ring-2 ring-offset-2 ring-[#D4AF37]' : ''
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#002845] mb-2">الأيقونة</label>
                  <div className="flex gap-2 flex-wrap">
                    {ICON_OPTIONS.map(({ key, icon: Icon }) => (
                      <button
                        key={key}
                        onClick={() => setNewRole(prev => ({ ...prev, icon: key }))}
                        className={`w-10 h-10 rounded-lg flex items-center justify-center transition ${
                          newRole.icon === key 
                            ? 'bg-[#D4AF37] text-white' 
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Phase 3.5 — capability flags. Five booleans that describe
                    what this role CAN do in the system. These drive future
                    filtering (e.g. transfer dropdown shows only roles where
                    can_receive_transfers=true) and audit display. */}
                <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2">
                  <p className="text-sm font-bold text-[#002845] mb-2">صلاحيات الدور</p>
                  {[
                    { k: 'can_receive_transfers',     label: 'يستقبل تحويلات الشكاوى',          hint: 'تظهر هذا الدور كخيار في قائمة "تحويل" بالشكاوى.' },
                    { k: 'can_be_assigned',           label: 'يمكن تعيين مهام له',              hint: 'يمكن اختياره مستقبلاً في توجيهات داخلية أو تكليفات.' },
                    { k: 'can_reply_to_customers',    label: 'يمكنه الرد المباشر على العملاء',  hint: 'بدون هذا، الدور يحفظ ملاحظات داخلية فقط ولا تصل للعميل.' },
                    { k: 'can_see_sensitive_finance', label: 'يرى بيانات مالية حساسة',         hint: 'فواتير، اشتراكات، استرداد، أرقام معاملات.' },
                    { k: 'can_close_complaints',      label: 'يستطيع إغلاق الشكاوى',             hint: 'إنهاء الحالة باعتمادها أو رفضها.' },
                  ].map((row) => (
                    <label key={row.k} className="flex items-start gap-2 cursor-pointer py-1">
                      <input
                        type="checkbox"
                        checked={!!(newRole as any)[row.k]}
                        onChange={(e) => setNewRole(prev => ({ ...prev, [row.k]: e.target.checked } as any))}
                        className="mt-1 w-4 h-4 rounded border-slate-300 text-[#D4AF37] focus:ring-[#D4AF37]"
                      />
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-[#002845]">{row.label}</p>
                        <p className="text-[10px] text-slate-500">{row.hint}</p>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Phase 3 — auto-provision a department inbox + sidebar
                    link when creating a new role. Only shown when creating;
                    editing existing roles doesn't re-provision. */}
                {!editingRole && (
                  <div className="p-4 bg-gradient-to-l from-[#FFF7E0] to-white border border-[#D4AF37]/30 rounded-xl space-y-3">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!newRole.has_inbox}
                        onChange={(e) => setNewRole(prev => ({ ...prev, has_inbox: e.target.checked }))}
                        className="mt-1 w-4 h-4 rounded border-slate-300 text-[#D4AF37] focus:ring-[#D4AF37]"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-[#002845]">إنشاء صندوق وارد لهذا الدور</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          يُولّد رابط سايدبار + صفحة /admin/inbox/{newRole.key || 'role'} تلقائياً.
                          الشكاوى المُحوّلة لهذا الدور تظهر هنا.
                        </p>
                      </div>
                    </label>

                    {newRole.has_inbox && (
                      <div className="space-y-2.5 pr-6">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">اسم الصندوق <span className="text-slate-400 font-normal">(اختياري)</span></label>
                          <input
                            type="text"
                            value={newRole.inbox_title}
                            onChange={(e) => setNewRole(prev => ({ ...prev, inbox_title: e.target.value }))}
                            placeholder={`صندوق ${newRole.label || 'الدور'}`}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#D4AF37]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">القسم في السايدبار</label>
                          <select
                            value={newRole.section_key}
                            onChange={(e) => setNewRole(prev => ({ ...prev, section_key: e.target.value }))}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-[#D4AF37]"
                          >
                            <option value="">— اختر القسم —</option>
                            {navSections.map((s) => (
                              <option key={s.key} value={s.key}>{s.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="p-4 bg-slate-50 rounded-xl">
                  <p className="text-sm font-semibold text-[#002845] mb-2">معاينة</p>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-white"
                      style={{ backgroundColor: newRole.color }}
                    >
                      {(() => {
                        const Icon = getIconComponent(newRole.icon);
                        return <Icon className="w-6 h-6" />;
                      })()}
                    </div>
                    <div>
                      <p className="font-bold text-[#002845]">{newRole.label || 'اسم الدور'}</p>
                      <p className="text-xs text-slate-400">{newRole.key || 'role_key'}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 flex gap-3">
                <button
                  onClick={() => setShowCreateRoleModal(false)}
                  className="flex-1 px-4 py-3 border border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 transition"
                >
                  إلغاء
                </button>
                <button
                  onClick={createOrUpdateRole}
                  disabled={savingRole || !newRole.key || !newRole.label}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white rounded-xl font-bold hover:shadow-lg transition disabled:opacity-50"
                >
                  {savingRole ? (
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  ) : (
                    editingRole ? 'حفظ التغييرات' : 'إنشاء الدور'
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedLog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedLog(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[80vh] overflow-y-auto"
            >
              <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-[#002845] to-[#003d5c]">
                <h3 className="text-lg font-bold text-white">تفاصيل السجل</h3>
              </div>

              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-400">نوع الإجراء</p>
                    <p className="font-semibold text-[#002845]">{getActionLabel(selectedLog.action_type)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">التاريخ والوقت</p>
                    <p className="font-semibold text-[#002845]">{formatDate(selectedLog.created_at)}</p>
                  </div>
                  {selectedLog.target_role && (
                    <div>
                      <p className="text-xs text-slate-400">الدور المستهدف</p>
                      <p className="font-semibold text-[#002845]">{selectedLog.target_role}</p>
                    </div>
                  )}
                  {selectedLog.target_user_name && (
                    <div>
                      <p className="text-xs text-slate-400">المستخدم المستهدف</p>
                      <p className="font-semibold text-[#002845]">{selectedLog.target_user_name}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-slate-400">بواسطة</p>
                    <p className="font-semibold text-[#002845]">{selectedLog.changed_by_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">عنوان IP</p>
                    <p className="font-semibold text-[#002845] text-sm">{selectedLog.ip_address}</p>
                  </div>
                </div>

                {selectedLog.old_value && (
                  <div>
                    <p className="text-xs text-slate-400 mb-2">القيمة السابقة</p>
                    <pre className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs overflow-x-auto text-red-800">
                      {JSON.stringify(selectedLog.old_value, null, 2)}
                    </pre>
                  </div>
                )}

                {selectedLog.new_value && (
                  <div>
                    <p className="text-xs text-slate-400 mb-2">القيمة الجديدة</p>
                    <pre className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs overflow-x-auto text-green-800">
                      {JSON.stringify(selectedLog.new_value, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-slate-100">
                <button
                  onClick={() => setSelectedLog(null)}
                  className="w-full px-4 py-3 bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white rounded-xl font-bold hover:shadow-lg transition"
                >
                  إغلاق
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmModal.show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
            onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden"
            >
              <div className="p-5 bg-gradient-to-r from-red-600 to-red-700">
                <div className="flex items-center justify-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                    <AlertTriangle className="w-7 h-7 text-white" />
                  </div>
                </div>
                <h3 className="text-lg font-bold text-white text-center mt-3">
                  {confirmModal.title}
                </h3>
              </div>

              <div className="p-5">
                <p className="text-center text-slate-700 font-medium">
                  {confirmModal.message}
                </p>
                <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-xs text-red-600 text-center">
                    هذا الإجراء سيؤثر على النظام فوراً
                  </p>
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 flex gap-3">
                <button
                  onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-bold hover:shadow-lg hover:scale-105 transition-all text-sm flex items-center justify-center gap-2"
                >
                  <span>إلغاء</span>
                </button>
                <button
                  onClick={confirmModal.onConfirm}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-xl font-bold hover:shadow-lg hover:shadow-green-200 hover:scale-105 transition-all text-sm flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>تأكيد</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {successModal.show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4"
            onClick={() => setSuccessModal({ show: false, message: '' })}
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden"
            >
              <div className="p-6 bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500">
                <div className="flex items-center justify-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                    className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-lg"
                  >
                    <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                  </motion.div>
                </div>
                <motion.h3
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-xl font-bold text-white text-center mt-4"
                >
                  تم بنجاح!
                </motion.h3>
              </div>

              <div className="p-5">
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-center text-slate-700 font-medium text-base"
                >
                  {successModal.message}
                </motion.p>
              </div>

              <div className="p-4 border-t border-slate-100">
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  onClick={() => setSuccessModal({ show: false, message: '' })}
                  className="w-full px-4 py-3 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-xl font-bold hover:shadow-lg hover:shadow-green-200 hover:scale-105 transition-all flex items-center justify-center gap-2"
                >
                  <Check className="w-5 h-5" />
                  <span>حسناً</span>
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AdminRolesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-gray-800 to-gray-900 rounded-full flex items-center justify-center shadow-lg">
            <svg className="animate-spin h-10 w-10 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          <p className="text-gray-700">جاري التحميل...</p>
        </div>
      </div>
    }>
      <AdminRolesPageContent />
    </Suspense>
  );
}
