"use client";

import { useState, useEffect } from "react";
import { 
  UserPlus2, Check, X, Clock, Eye, Mail, Phone, Calendar, 
  Crown, RefreshCw, Loader2, MapPin, Briefcase, FileText,
  Download, User, Shield, ChevronDown, AlertTriangle, Search
} from "lucide-react";

interface MembershipRequest {
  id: number;
  user_id: string | null;
  full_name: string;
  email: string;
  phone: string;
  age: number | null;
  country: string | null;
  job_title: string | null;
  cover_letter: string | null;
  cv_path: string | null;
  plan_id?: number;
  plan_name?: string;
  plan_price?: number;
  request_type: string;
  reason?: string;
  status: string;
  assigned_role?: string;
  reviewed_by_name?: string;
  admin_note?: string;
  reviewed_at?: string;
  created_at: string;
  user_name?: string;
  user_email?: string;
  user_phone?: string;
}

const ROLES = [
  { id: 'content_admin', name: 'مدير المحتوى', color: '#8B5CF6' },
  { id: 'support_admin', name: 'مدير الدعم', color: '#3B82F6' },
  { id: 'finance_admin', name: 'مدير المالية', color: '#10B981' },
  { id: 'admin_manager', name: 'مدير إداري', color: '#0EA5E9' },
  { id: 'admin', name: 'مدير', color: '#D4AF37' },
];

const JOB_TITLE_LABELS: Record<string, string> = {
  marketing_manager: 'مدير التسويق',
  content_manager: 'مدير المحتوى',
  support_manager: 'مدير الدعم الفني',
  finance_manager: 'مدير المالية',
  admin_manager: 'مدير إداري',
  other: 'أخرى'
};

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-yellow-100", text: "text-yellow-700", label: "قيد الانتظار" },
  in_review: { bg: "bg-blue-100", text: "text-blue-700", label: "قيد المراجعة" },
  approved: { bg: "bg-green-100", text: "text-green-700", label: "موافق عليه" },
  rejected: { bg: "bg-red-100", text: "text-red-700", label: "مرفوض" },
};

export default function MembershipPage() {
  const [requests, setRequests] = useState<MembershipRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<MembershipRequest | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  const [showApproveModal, setShowApproveModal] = useState<number | null>(null);
  const [selectedRole, setSelectedRole] = useState("");
  const [approveNote, setApproveNote] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  
  const [showRejectModal, setShowRejectModal] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const statusParam = filter === "all" ? "" : `?status=${filter}&type=admin_promotion`;
      const res = await fetch(`/api/membership/admin/requests${statusParam}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
      }
    } catch (error) {
      console.error("Error fetching requests:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [filter]);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const handleApprove = async (id: number) => {
    if (!selectedRole) {
      setMessage({ type: "error", text: "يجب تحديد الدور للموظف" });
      return;
    }
    
    setActionLoading(id);
    try {
      const res = await fetch(`/api/membership/admin/requests/${id}/approve`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          assigned_role: selectedRole, 
          admin_note: approveNote,
          password: tempPassword || undefined
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: "success", text: data.message });
        if (data.temp_password) {
          setTempPassword(data.temp_password);
          alert(`تم إنشاء حساب للموظف\n\nالبريد: ${data.user_email}\nكلمة المرور المؤقتة: ${data.temp_password}\n\nيرجى إبلاغ الموظف بهذه البيانات`);
        }
        fetchRequests();
        setShowApproveModal(null);
        setSelectedRole("");
        setApproveNote("");
        setSelectedRequest(null);
      } else {
        setMessage({ type: "error", text: data.error });
      }
    } catch (error) {
      setMessage({ type: "error", text: "حدث خطأ" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: number) => {
    if (!rejectNote.trim()) {
      setMessage({ type: "error", text: "يجب كتابة سبب الرفض" });
      return;
    }
    
    setActionLoading(id);
    try {
      const res = await fetch(`/api/membership/admin/requests/${id}/reject`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_note: rejectNote }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: "success", text: data.message });
        fetchRequests();
        setShowRejectModal(null);
        setRejectNote("");
        setSelectedRequest(null);
      } else {
        setMessage({ type: "error", text: data.error });
      }
    } catch (error) {
      setMessage({ type: "error", text: "حدث خطأ" });
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getDisplayName = (req: MembershipRequest) => req.full_name || req.user_name || "بدون اسم";
  const getDisplayEmail = (req: MembershipRequest) => req.email || req.user_email || "-";
  const getDisplayPhone = (req: MembershipRequest) => req.phone || req.user_phone || "-";

  const filteredRequests = requests.filter(r => {
    if (!searchQuery) return true;
    const name = getDisplayName(r).toLowerCase();
    const email = getDisplayEmail(r).toLowerCase();
    return name.includes(searchQuery.toLowerCase()) || email.includes(searchQuery.toLowerCase());
  });

  const stats = {
    total: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    in_review: requests.filter(r => r.status === 'in_review').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  };

  return (
    <div className="space-y-6">
      {message && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-lg ${
          message.type === "success" ? "bg-green-500 text-white" : "bg-red-500 text-white"
        }`}>
          {message.text}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#002845]">طلبات الانضمام للإدارة</h1>
          <p className="text-sm text-slate-500 mt-1">مراجعة طلبات التوظيف وتعيين الصلاحيات</p>
        </div>
        <button
          onClick={fetchRequests}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition"
        >
          <RefreshCw className="w-4 h-4" />
          تحديث
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <UserPlus2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-[#002845]">{stats.total}</p>
              <p className="text-xs text-slate-500">الكل</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-yellow-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-yellow-600">{stats.pending}</p>
              <p className="text-xs text-slate-500">انتظار</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-blue-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Eye className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-blue-600">{stats.in_review}</p>
              <p className="text-xs text-slate-500">مراجعة</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-green-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
              <Check className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-green-600">{stats.approved}</p>
              <p className="text-xs text-slate-500">موافق</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-red-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
              <X className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-red-600">{stats.rejected}</p>
              <p className="text-xs text-slate-500">مرفوض</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setFilter("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  filter === "all" ? "bg-[#002845] text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                الكل
              </button>
              {Object.entries(statusColors).map(([key, value]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    filter === key ? `${value.bg} ${value.text}` : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {value.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث بالاسم أو البريد..."
                className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37] mx-auto" />
              <p className="text-slate-500 mt-3 text-sm">جاري التحميل...</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="p-12 text-center">
              <UserPlus2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">لا توجد طلبات</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
              {filteredRequests.map((request) => (
                <div
                  key={request.id}
                  onClick={() => setSelectedRequest(request)}
                  className={`p-4 cursor-pointer hover:bg-slate-50 transition ${
                    selectedRequest?.id === request.id ? "bg-blue-50 border-r-4 border-r-[#D4AF37]" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#002845] to-[#004d7a] flex items-center justify-center text-white font-bold text-lg">
                        {getDisplayName(request).charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-[#002845]">{getDisplayName(request)}</p>
                        <p className="text-xs text-slate-500">{JOB_TITLE_LABELS[request.job_title || ''] || request.job_title || 'طلب ترقية'}</p>
                        <p className="text-xs text-slate-400">{getDisplayEmail(request)}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[request.status]?.bg} ${statusColors[request.status]?.text}`}>
                        {statusColors[request.status]?.label}
                      </span>
                      <p className="text-xs text-slate-400">{formatDate(request.created_at)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 h-fit sticky top-4">
          {selectedRequest ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#002845] to-[#004d7a] flex items-center justify-center text-white text-2xl font-bold">
                  {getDisplayName(selectedRequest).charAt(0)}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-[#002845]">{getDisplayName(selectedRequest)}</h3>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[selectedRequest.status]?.bg} ${statusColors[selectedRequest.status]?.text}`}>
                    {statusColors[selectedRequest.status]?.label}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-600">{getDisplayEmail(selectedRequest)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-600">{getDisplayPhone(selectedRequest)}</span>
                </div>
                {selectedRequest.age && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600">العمر: {selectedRequest.age} سنة</span>
                  </div>
                )}
                {selectedRequest.country && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600">{selectedRequest.country}</span>
                  </div>
                )}
                {selectedRequest.job_title && (
                  <div className="flex items-center gap-2 text-sm">
                    <Briefcase className="w-4 h-4 text-[#D4AF37]" />
                    <span className="text-[#002845] font-medium">{JOB_TITLE_LABELS[selectedRequest.job_title] || selectedRequest.job_title}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-600">{formatDate(selectedRequest.created_at)}</span>
                </div>
              </div>

              {selectedRequest.cover_letter && (
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    نبذة عن المتقدم:
                  </p>
                  <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg leading-relaxed">{selectedRequest.cover_letter}</p>
                </div>
              )}

              {selectedRequest.cv_path && (
                <div className="pt-3 border-t border-slate-100">
                  <a
                    href={`/api/membership${selectedRequest.cv_path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition text-sm font-medium"
                  >
                    <Download className="w-4 h-4" />
                    تحميل السيرة الذاتية
                  </a>
                </div>
              )}

              {selectedRequest.assigned_role && (
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-xs text-slate-500 mb-2">الدور المُعيّن:</p>
                  <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg">
                    <Shield className="w-4 h-4 text-green-600" />
                    <span className="text-green-700 font-medium">
                      {ROLES.find(r => r.id === selectedRequest.assigned_role)?.name || selectedRequest.assigned_role}
                    </span>
                  </div>
                </div>
              )}

              {selectedRequest.admin_note && (
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-xs text-slate-500 mb-2">ملاحظة المدير:</p>
                  <p className={`text-sm p-3 rounded-lg ${selectedRequest.status === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-700'}`}>
                    {selectedRequest.admin_note}
                  </p>
                </div>
              )}

              {(selectedRequest.status === "pending" || selectedRequest.status === "in_review") && (
                <div className="flex gap-2 pt-4">
                  <button
                    onClick={() => setShowApproveModal(selectedRequest.id)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 text-white rounded-xl hover:bg-green-600 transition font-medium"
                  >
                    <Check className="w-4 h-4" />
                    موافقة وتعيين
                  </button>
                  <button
                    onClick={() => setShowRejectModal(selectedRequest.id)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 text-white rounded-xl hover:bg-red-600 transition font-medium"
                  >
                    <X className="w-4 h-4" />
                    رفض
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <Eye className="w-14 h-14 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">اختر طلباً لعرض التفاصيل</p>
              <p className="text-slate-400 text-sm mt-1">اضغط على أي طلب من القائمة</p>
            </div>
          )}
        </div>
      </div>

      {showApproveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                <Check className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#002845]">الموافقة وتعيين الدور</h3>
                <p className="text-sm text-slate-500">اختر الدور المناسب للموظف</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <Shield className="w-4 h-4 inline ml-1" />
                  الدور الوظيفي <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {ROLES.map((role) => (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => setSelectedRole(role.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 transition text-right ${
                        selectedRole === role.id 
                          ? 'border-green-500 bg-green-50' 
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div 
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: role.color + '20' }}
                      >
                        <Shield className="w-4 h-4" style={{ color: role.color }} />
                      </div>
                      <span className="font-medium text-[#002845]">{role.name}</span>
                      {selectedRole === role.id && (
                        <Check className="w-5 h-5 text-green-500 mr-auto" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">ملاحظات (اختياري)</label>
                <textarea
                  value={approveNote}
                  onChange={(e) => setApproveNote(e.target.value)}
                  placeholder="أي ملاحظات إضافية..."
                  className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  rows={2}
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => { setShowApproveModal(null); setSelectedRole(""); setApproveNote(""); }}
                className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition font-medium"
              >
                إلغاء
              </button>
              <button
                onClick={() => handleApprove(showApproveModal)}
                disabled={!selectedRole || actionLoading === showApproveModal}
                className="flex-1 px-4 py-2.5 bg-green-500 text-white rounded-xl hover:bg-green-600 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading === showApproveModal ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "تأكيد الموافقة"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#002845]">رفض الطلب</h3>
                <p className="text-sm text-slate-500">يجب كتابة سبب الرفض</p>
              </div>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                سبب الرفض <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="اكتب سبب الرفض هنا..."
                className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                rows={3}
              />
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => { setShowRejectModal(null); setRejectNote(""); }}
                className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition font-medium"
              >
                إلغاء
              </button>
              <button
                onClick={() => handleReject(showRejectModal)}
                disabled={!rejectNote.trim() || actionLoading === showRejectModal}
                className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl hover:bg-red-600 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading === showRejectModal ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "تأكيد الرفض"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
