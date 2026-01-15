"use client";

import { useState, useEffect } from "react";
import { 
  AlertCircle, Eye, CheckCircle, XCircle, Clock, Search, RefreshCw,
  ExternalLink, User, Phone, FileText, Calendar, MessageSquare, X,
  AlertTriangle, Mail, Building2
} from "lucide-react";
import Link from "next/link";

interface AccountComplaint {
  id: number;
  user_id: string | null;
  user_name: string;
  user_email: string;
  user_phone: string;
  category: string;
  subject: string;
  details: string;
  status: string;
  admin_note: string | null;
  created_at: string;
  submitter_name?: string;
  submitter_email?: string;
}

const statusColors: Record<string, { bg: string; text: string; label: string; border: string }> = {
  new: { bg: "bg-red-100", text: "text-red-700", label: "جديد", border: "border-red-300" },
  in_review: { bg: "bg-amber-100", text: "text-amber-700", label: "قيد المراجعة", border: "border-amber-300" },
  closed: { bg: "bg-green-100", text: "text-green-700", label: "تم الحل", border: "border-green-300" },
  dismissed: { bg: "bg-slate-100", text: "text-slate-600", label: "غير مقبول", border: "border-slate-300" },
};

const categoryLabels: Record<string, string> = {
  account_issue: "مشكلة في الحساب",
  subscription: "مشكلة في الاشتراك",
  technical: "مشكلة تقنية",
  billing: "مشكلة في الفواتير",
  other: "شكوى أخرى",
};

export default function ComplaintsPage() {
  const [complaints, setComplaints] = useState<AccountComplaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [stats, setStats] = useState({ new: 0, in_review: 0, closed: 0, dismissed: 0, total: 0 });
  const [selectedComplaint, setSelectedComplaint] = useState<AccountComplaint | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState<string>("");
  const [adminNote, setAdminNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchComplaints = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/account-complaints", { credentials: "include" });
      
      if (res.ok) {
        const data = await res.json();
        setComplaints(data.complaints || []);
        
        const newStats = { new: 0, in_review: 0, closed: 0, dismissed: 0, total: data.complaints?.length || 0 };
        data.complaints?.forEach((c: AccountComplaint) => {
          if (c.status in newStats) {
            newStats[c.status as keyof typeof newStats]++;
          }
        });
        setStats(newStats);
      } else if (res.status === 401) {
        window.location.href = '/admin-login';
      }
    } catch (error) {
      console.error("Error fetching complaints:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComplaints();
  }, []);

  const openActionModal = (complaint: AccountComplaint, action: string) => {
    setSelectedComplaint(complaint);
    setActionType(action);
    setAdminNote(complaint.admin_note || "");
    setShowActionModal(true);
  };

  const executeAction = async () => {
    if (!selectedComplaint) return;
    setSubmitting(true);

    try {
      const res = await fetch(`/api/account-complaints/${selectedComplaint.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: actionType, adminNote }),
      });
      
      if (res.ok) {
        setShowActionModal(false);
        setSelectedComplaint(null);
        fetchComplaints();
      }
    } catch (error) {
      console.error("Error updating status:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredComplaints = complaints.filter((c) => {
    const matchesFilter = filter === "all" || c.status === filter;
    const matchesSearch = 
      c.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.details?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.user_email?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getActionConfig = (action: string) => {
    switch(action) {
      case "in_review":
        return { 
          title: "بدء المراجعة", 
          desc: "سيتم وضع الشكوى قيد المراجعة",
          icon: Eye,
          color: "bg-yellow-500 hover:bg-yellow-600"
        };
      case "closed":
        return { 
          title: "إغلاق الشكوى (تم الحل)", 
          desc: "تم معالجة الشكوى واتخاذ الإجراء المناسب",
          icon: CheckCircle,
          color: "bg-green-500 hover:bg-green-600"
        };
      case "dismissed":
        return { 
          title: "رفض الشكوى", 
          desc: "الشكوى غير صحيحة أو لا تستدعي إجراء",
          icon: XCircle,
          color: "bg-gray-500 hover:bg-gray-600"
        };
      default:
        return { title: "", desc: "", icon: AlertCircle, color: "" };
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#002845]">شكاوى الحساب</h1>
          <p className="text-sm text-slate-500 mt-1">إدارة ومتابعة شكاوى المستخدمين العامة</p>
        </div>
        <button
          onClick={fetchComplaints}
          className="flex items-center gap-2 px-4 py-2 bg-[#002845] text-white rounded-xl hover:bg-[#003d66] transition"
        >
          <RefreshCw className="w-4 h-4" />
          تحديث
        </button>
      </div>

      {/* الإحصائيات */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#002845]">{stats.total}</p>
              <p className="text-xs text-slate-500">الإجمالي</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-red-200 shadow-sm cursor-pointer hover:shadow-md transition" onClick={() => setFilter("new")}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{stats.new}</p>
              <p className="text-xs text-slate-500">جديد</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-yellow-200 shadow-sm cursor-pointer hover:shadow-md transition" onClick={() => setFilter("in_review")}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-100 flex items-center justify-center">
              <Eye className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-600">{stats.in_review}</p>
              <p className="text-xs text-slate-500">قيد المراجعة</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-green-200 shadow-sm cursor-pointer hover:shadow-md transition" onClick={() => setFilter("closed")}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{stats.closed}</p>
              <p className="text-xs text-slate-500">تم الحل</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm cursor-pointer hover:shadow-md transition" onClick={() => setFilter("dismissed")}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
              <XCircle className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-600">{stats.dismissed}</p>
              <p className="text-xs text-slate-500">غير مقبول</p>
            </div>
          </div>
        </div>
      </div>

      {/* الفلاتر والبحث */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilter("all")}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                filter === "all" ? "bg-[#002845] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              الكل ({stats.total})
            </button>
            {Object.entries(statusColors).map(([key, value]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                  filter === key ? `${value.bg} ${value.text} ${value.border} border` : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {value.label} ({stats[key as keyof typeof stats] || 0})
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="بحث في الشكاوى..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-10 pl-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37] w-64"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-slate-500 mt-3 text-sm">جاري التحميل...</p>
          </div>
        ) : filteredComplaints.length === 0 ? (
          <div className="p-12 text-center">
            <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">لا توجد شكاوى {filter !== "all" ? `بحالة "${statusColors[filter]?.label}"` : ""}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredComplaints.map((complaint) => (
              <div key={complaint.id} className="p-5 hover:bg-slate-50 transition">
                <div className="flex flex-col md:flex-row md:items-start gap-4">
                  {/* معلومات الشكوى */}
                  <div className="flex-1 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${statusColors[complaint.status]?.bg} ${statusColors[complaint.status]?.text}`}>
                          {statusColors[complaint.status]?.label || complaint.status}
                        </span>
                        <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs">
                          {categoryLabels[complaint.category] || complaint.category}
                        </span>
                        <span className="text-xs text-slate-400">#{complaint.id}</span>
                      </div>
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(complaint.created_at).toLocaleDateString("ar-SA")}
                      </span>
                    </div>

                    {/* عنوان وتفاصيل الشكوى */}
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                      <h3 className="font-bold text-[#002845] mb-2">{complaint.subject}</h3>
                      <p className="text-sm text-slate-600">{complaint.details}</p>
                    </div>

                    {/* معلومات المُشتكي */}
                    <div className="flex flex-wrap gap-4 text-sm">
                      {complaint.user_name && (
                        <div className="flex items-center gap-2 text-slate-600">
                          <User className="w-4 h-4 text-slate-400" />
                          <span>{complaint.user_name}</span>
                        </div>
                      )}
                      {complaint.user_email && (
                        <a href={`mailto:${complaint.user_email}`} className="flex items-center gap-2 text-[#002845] hover:text-[#D4AF37] transition">
                          <Mail className="w-4 h-4" />
                          <span dir="ltr">{complaint.user_email}</span>
                        </a>
                      )}
                      {complaint.user_phone && (
                        <a href={`tel:${complaint.user_phone}`} className="flex items-center gap-2 text-[#002845] hover:text-[#D4AF37] transition">
                          <Phone className="w-4 h-4" />
                          <span dir="ltr">{complaint.user_phone}</span>
                        </a>
                      )}
                    </div>

                    {/* ملاحظات الإدارة */}
                    {complaint.admin_note && (
                      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                        <p className="text-xs text-blue-600 mb-1 font-medium">ملاحظات الإدارة:</p>
                        <p className="text-sm text-blue-800">{complaint.admin_note}</p>
                      </div>
                    )}
                  </div>

                  {/* أزرار الإجراءات */}
                  <div className="flex md:flex-col gap-2 md:w-40">
                    {complaint.status === "new" && (
                      <>
                        <button
                          onClick={() => openActionModal(complaint, "in_review")}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-yellow-100 text-yellow-700 rounded-xl hover:bg-yellow-200 transition text-sm font-medium"
                        >
                          <Eye className="w-4 h-4" />
                          بدء المراجعة
                        </button>
                        <button
                          onClick={() => openActionModal(complaint, "dismissed")}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition text-sm font-medium"
                        >
                          <XCircle className="w-4 h-4" />
                          رفض
                        </button>
                      </>
                    )}
                    {complaint.status === "in_review" && (
                      <>
                        <button
                          onClick={() => openActionModal(complaint, "closed")}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-green-100 text-green-700 rounded-xl hover:bg-green-200 transition text-sm font-medium"
                        >
                          <CheckCircle className="w-4 h-4" />
                          تم الحل
                        </button>
                        <button
                          onClick={() => openActionModal(complaint, "dismissed")}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition text-sm font-medium"
                        >
                          <XCircle className="w-4 h-4" />
                          رفض
                        </button>
                      </>
                    )}
                    {(complaint.status === "closed" || complaint.status === "dismissed") && (
                      <div className="text-center text-xs text-slate-400 py-2">
                        <CheckCircle className="w-5 h-5 mx-auto mb-1 text-slate-300" />
                        تم الإغلاق
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* نافذة تأكيد الإجراء */}
      {showActionModal && selectedComplaint && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-[#002845]">تأكيد الإجراء</h3>
                <button 
                  onClick={() => setShowActionModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              <div className={`p-4 rounded-xl ${statusColors[actionType]?.bg} ${statusColors[actionType]?.border} border`}>
                <div className="flex items-center gap-3">
                  {(() => {
                    const config = getActionConfig(actionType);
                    const Icon = config.icon;
                    return <Icon className={`w-6 h-6 ${statusColors[actionType]?.text}`} />;
                  })()}
                  <div>
                    <p className={`font-bold ${statusColors[actionType]?.text}`}>
                      {getActionConfig(actionType).title}
                    </p>
                    <p className="text-sm text-slate-600 mt-0.5">
                      {getActionConfig(actionType).desc}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-1">الشكوى</p>
                <p className="font-medium text-[#002845]">{selectedComplaint.subject}</p>
                <p className="text-sm text-slate-500 mt-1">
                  من: {selectedComplaint.user_name || "مجهول"}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#002845] mb-2">
                  ملاحظات الإدارة (اختياري)
                </label>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="أضف ملاحظة حول الإجراء المتخذ..."
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37] resize-none"
                  rows={3}
                />
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setShowActionModal(false)}
                className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition font-medium"
              >
                إلغاء
              </button>
              <button
                onClick={executeAction}
                disabled={submitting}
                className={`flex-1 px-4 py-3 text-white rounded-xl transition font-medium disabled:opacity-50 ${getActionConfig(actionType).color}`}
              >
                {submitting ? "جاري التنفيذ..." : "تأكيد"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
