"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, Users, Crown, Wallet, Headphones, FileText,
  Loader2, Search, Check, AlertTriangle, User, Settings,
  ToggleLeft, ToggleRight, Save, CheckCircle2, X, UserX,
  History, Plus, Trash2, Edit2, Clock, Eye
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
};

type AdminRole = {
  key: string;
  label: string;
  color?: string;
  icon?: string;
  isDefault?: boolean;
  description?: string;
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

export default function AdminRolesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<'permissions' | 'users' | 'custom' | 'audit' | 'applications'>(
    tabFromUrl === 'applications' ? 'applications' : 'permissions'
  );
  const [users, setUsers] = useState<UserItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string>("");

  const [permissions, setPermissions] = useState<Permission[]>([]);
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
  const [newRole, setNewRole] = useState({ key: '', label: '', description: '', color: '#6B7280', icon: 'Shield' });
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
      }
    } catch (err) {
      console.error('Error fetching user:', err);
    }
  }

  async function fetchUsers() {
    try {
      setIsLoading(true);
      const res = await fetch("/api/admin/users?admin_only=true&limit=100", { credentials: "include" });
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
      const res = await fetch("/api/permissions/list", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setPermissions(data.permissions || []);
        setAdminRoles(data.roles || []);
        if (data.roles?.length > 0) {
          setSelectedAdminRole(data.roles[0].key);
        }
      }
    } catch (err) {
      console.error("Error fetching permissions list:", err);
    }
  }

  async function fetchRolePermissions(role: string) {
    try {
      setLoadingPermissions(true);
      const res = await fetch(`/api/permissions/role/${role}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setRolePermissions(data.permissions || []);
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
      const res = await fetch(`/api/permissions/audit-log?page=${auditPage}&limit=10`, { credentials: "include" });
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
    try {
      const res = await fetch("/api/permissions/custom-roles", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCustomRoles(data.roles || []);
      }
    } catch (err) {
      console.error("Error fetching custom roles:", err);
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
        setSuccessModal({ show: true, message: isEditing ? "تم تحديث الدور بنجاح" : "تم إنشاء الدور بنجاح" });
        setShowCreateRoleModal(false);
        setEditingRole(null);
        setNewRole({ key: '', label: '', description: '', color: '#6B7280', icon: 'Shield' });
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
    setConfirmModal({
      show: true,
      title: 'حذف الدور',
      message: 'هل أنت متأكد من حذف هذا الدور؟ سيتم حذف جميع الصلاحيات المرتبطة به.',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/permissions/custom-roles/${key}`, {
            method: "DELETE",
            credentials: "include",
          });

          if (res.ok) {
            setSuccessModal({ show: true, message: "تم حذف الدور بنجاح" });
            fetchCustomRoles();
            fetchPermissionsList();
          } else {
            const data = await res.json();
            toast.error(data.error || "حدث خطأ في حذف الدور");
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
        fetch("/api/membership/admin/requests?status=pending", { credentials: "include" }),
        fetch("/api/membership/admin/requests?status=rejected", { credentials: "include" })
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

  const getRoleInfo = (roleId: string) => ROLES.find(r => r.id === roleId) || ROLES[0];
  const getIconComponent = (iconKey: string) => ICON_OPTIONS.find(i => i.key === iconKey)?.icon || Shield;

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
        <button
          onClick={() => setActiveTab('permissions')}
          className={`px-5 py-2.5 rounded-xl font-semibold transition-all text-sm ${
            activeTab === 'permissions'
              ? 'bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white shadow-lg'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Settings className="w-4 h-4 inline-block ml-2" />
          صلاحيات الأدوار
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
          onClick={() => setActiveTab('custom')}
          className={`px-5 py-2.5 rounded-xl font-semibold transition-all text-sm ${
            activeTab === 'custom'
              ? 'bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white shadow-lg'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Plus className="w-4 h-4 inline-block ml-2" />
          أدوار مخصصة
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
        <button
          onClick={() => setActiveTab('applications')}
          className={`px-5 py-2.5 rounded-xl font-semibold transition-all text-sm relative ${
            activeTab === 'applications'
              ? 'bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white shadow-lg'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <FileText className="w-4 h-4 inline-block ml-2" />
          طلبات التوظيف
          {applications.length > 0 && (
            <span className="absolute -top-2 -left-2 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
              {applications.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'permissions' && (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-[#002845] to-[#003d5c]">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Settings className="w-5 h-5" />
              تحديد صلاحيات كل دور
            </h2>
            <p className="text-white/70 text-sm mt-1">اختر الدور ثم حدد الصلاحيات المتاحة له</p>
          </div>

          <div className="p-5">
            <div className="flex flex-wrap gap-3 mb-6">
              {adminRoles.map((role) => {
                const roleInfo = ROLES.find(r => r.id === role.key);
                const Icon = roleInfo?.icon || getIconComponent(role.icon || 'Shield');
                const isSelected = selectedAdminRole === role.key;
                const color = roleInfo?.color || role.color || '#6B7280';
                
                return (
                  <button
                    key={role.key}
                    onClick={() => setSelectedAdminRole(role.key)}
                    className={`flex items-center gap-3 px-5 py-3 rounded-xl border-2 transition-all ${
                      isSelected
                        ? 'border-[#D4AF37] bg-[#D4AF37]/10 shadow-md'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                      style={{ backgroundColor: color }}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="font-semibold text-[#002845]">{role.label}</span>
                    {!role.isDefault && (
                      <span className="text-[10px] bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">مخصص</span>
                    )}
                    {isSelected && <Check className="w-5 h-5 text-[#D4AF37]" />}
                  </button>
                );
              })}
            </div>

            {loadingPermissions ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
              </div>
            ) : (
              <>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                  <div className="flex items-center gap-2 text-blue-700">
                    <Shield className="w-5 h-5" />
                    <span className="font-semibold">تحكم كامل</span>
                  </div>
                  <p className="text-sm text-blue-600 mt-1">
                    المدير العام يتحكم بجميع الصلاحيات لكل دور إداري
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {rolePermissions.map((perm) => (
                    <button
                      key={perm.key}
                      onClick={() => togglePermission(perm.key)}
                      className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all text-right hover:shadow-md cursor-pointer ${
                        perm.isGranted
                          ? 'border-green-400 bg-green-50'
                          : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {perm.isGranted ? (
                          <ToggleRight className="w-6 h-6 text-green-500" />
                        ) : (
                          <ToggleLeft className="w-6 h-6 text-slate-400" />
                        )}
                        <div>
                          <p className="font-semibold text-[#002845]">{perm.label}</p>
                        </div>
                      </div>
                      {perm.isGranted && (
                        <Check className="w-5 h-5 text-green-500" />
                      )}
                    </button>
                  ))}
                </div>

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
          </div>
        </div>
      )}

      {activeTab === 'custom' && (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-[#002845] to-[#003d5c] flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5" />
                الأدوار المخصصة
              </h2>
              <p className="text-white/70 text-sm mt-1">إنشاء وإدارة أدوار مخصصة للنظام</p>
            </div>
            <button
              onClick={() => {
                setEditingRole(null);
                setNewRole({ key: '', label: '', description: '', color: '#6B7280', icon: 'Shield' });
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
                <p className="text-slate-500 text-lg">لا توجد أدوار مخصصة</p>
                <p className="text-slate-400 text-sm mt-1">اضغط على "إنشاء دور جديد" لإضافة دور</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {customRoles.map((role) => {
                  const Icon = getIconComponent(role.icon || 'Shield');
                  return (
                    <div
                      key={role.key}
                      className="p-4 rounded-xl border-2 border-slate-200 hover:border-slate-300 transition bg-white"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center text-white"
                          style={{ backgroundColor: role.color || '#6B7280' }}
                        >
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
                                icon: role.icon || 'Shield'
                              });
                              setShowCreateRoleModal(true);
                            }}
                            className="p-2 hover:bg-slate-100 rounded-lg transition"
                          >
                            <Edit2 className="w-4 h-4 text-slate-500" />
                          </button>
                          <button
                            onClick={() => deleteRole(role.key)}
                            className="p-2 hover:bg-red-50 rounded-lg transition"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        </div>
                      </div>
                      <h3 className="font-bold text-[#002845]">{role.label}</h3>
                      <p className="text-xs text-slate-400 mt-1">المفتاح: {role.key}</p>
                      {role.description && (
                        <p className="text-sm text-slate-500 mt-2">{role.description}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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
          <div className="grid lg:grid-cols-4 gap-6 mb-8">
            {ROLES.filter(r => r.id !== 'user').map((role) => {
              const Icon = role.icon;
              const count = users.filter(u => u.role === role.id).length;
              
              return (
                <button
                  key={role.id}
                  onClick={() => setSelectedRole(selectedRole === role.id ? "" : role.id)}
                  className={`p-5 rounded-2xl border-2 transition-all text-right ${
                    selectedRole === role.id
                      ? "border-[#D4AF37] bg-[#D4AF37]/5 shadow-lg"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-white"
                      style={{ backgroundColor: role.color }}
                    >
                      <Icon className="w-6 h-6" />
                    </div>
                    <span 
                      className="text-2xl font-black"
                      style={{ color: role.color }}
                    >
                      {count}
                    </span>
                  </div>
                  <h3 className="font-bold text-[#002845] mt-3">{role.name}</h3>
                  <p className="text-xs text-slate-500 mt-1">{role.description}</p>
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
                  {ROLES.filter(r => r.id !== 'user').map((role) => (
                    <option key={role.id} value={role.id} className="bg-[#002845]">
                      {role.name}
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
                  {ROLES.filter(r => !['user', 'super_admin'].includes(r.id)).map((role) => {
                    const Icon = role.icon;
                    return (
                      <button
                        key={role.id}
                        onClick={() => setAssignedRole(role.id)}
                        className={`w-full p-3 rounded-xl border-2 transition-all text-right flex items-center gap-3 ${
                          assignedRole === role.id
                            ? "border-[#D4AF37] bg-[#D4AF37]/10"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                          style={{ backgroundColor: role.color }}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-[#002845]">{role.name}</p>
                          <p className="text-xs text-slate-500">{role.description}</p>
                        </div>
                        {assignedRole === role.id && (
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
            onClick={() => setShowRoleModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden"
            >
              <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-[#002845] to-[#003d5c]">
                <h3 className="text-base font-bold text-white">تعديل الدور</h3>
                <p className="text-white/70 text-xs mt-1 truncate">{selectedUser.name}</p>
              </div>

              <div className="p-3 max-h-[50vh] overflow-y-auto">
                <p className="text-[10px] text-slate-400 mb-2 px-1">الأدوار الإدارية</p>
                <div className="space-y-2">
                  {ROLES.filter(r => r.id !== 'user').map((role) => {
                    const Icon = role.icon;
                    const isSelected = selectedUser.role === role.id;

                    return (
                      <button
                        key={role.id}
                        onClick={() => {
                          setConfirmModal({
                            show: true,
                            title: 'تغيير الدور',
                            message: `هل أنت متأكد من تغيير الدور إلى "${role.name}"؟`,
                            onConfirm: () => {
                              updateUserRole(selectedUser.id, role.id);
                              setConfirmModal(prev => ({ ...prev, show: false }));
                            }
                          });
                        }}
                        disabled={updating || isSelected}
                        className={`w-full p-2.5 rounded-lg border-2 transition-all text-right flex items-center gap-2.5 ${
                          isSelected
                            ? "border-[#D4AF37] bg-[#D4AF37]/10"
                            : "border-slate-200 hover:border-slate-300"
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
                          style={{ backgroundColor: role.color }}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-[#002845] text-sm">{role.name}</p>
                        </div>
                        {isSelected && (
                          <Check className="w-4 h-4 text-[#D4AF37] shrink-0" />
                        )}
                        {updating && !isSelected && (
                          <Loader2 className="w-4 h-4 animate-spin text-slate-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
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
                    disabled={updating || selectedUser.role === 'user'}
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
