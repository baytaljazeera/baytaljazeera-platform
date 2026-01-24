"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useRef } from "react";
import { 
  AlertCircle, Eye, CheckCircle, XCircle, Clock, Search, RefreshCw,
  ExternalLink, User, Phone, FileText, Calendar, MessageSquare, X,
  AlertTriangle, Mail, Building2, MapPin, EyeOff, Trash2, FileWarning
} from "lucide-react";
import Link from "next/link";

interface Report {
  id: number;
  listing_id: string;
  reason: string;
  details: string | null;
  reporter_name: string | null;
  reporter_phone: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  listing_title: string | null;
  listing_city: string | null;
  listing_district: string | null;
  listing_price: number | null;
  listing_status: string | null;
  action_taken?: string | null;
  action_note?: string | null;
}

const statusColors: Record<string, { bg: string; text: string; label: string; border: string }> = {
  new: { bg: "bg-red-100", text: "text-red-700", label: "جديد", border: "border-red-300" },
  pending: { bg: "bg-red-100", text: "text-red-700", label: "جديد", border: "border-red-300" },
  in_review: { bg: "bg-amber-100", text: "text-amber-700", label: "قيد المراجعة", border: "border-amber-300" },
  closed: { bg: "bg-green-100", text: "text-green-700", label: "تم الحل", border: "border-green-300" },
  accepted: { bg: "bg-green-100", text: "text-green-700", label: "تم الحل", border: "border-green-300" },
  resolved: { bg: "bg-green-100", text: "text-green-700", label: "تم الحل", border: "border-green-300" },
  dismissed: { bg: "bg-slate-100", text: "text-slate-600", label: "غير مقبول", border: "border-slate-300" },
  rejected: { bg: "bg-slate-100", text: "text-slate-600", label: "غير مقبول", border: "border-slate-300" },
};

const REASON_LABELS: Record<string, string> = {
  wrong_price: "السعر غير صحيح",
  wrong_location: "الموقع غير صحيح",
  wrong_specs: "المواصفات غير مطابقة",
  fake_images: "صور غير حقيقية",
  sold_rented: "العقار مباع أو مؤجر",
  fraud: "محاولة احتيال",
  fake_listing: "إعلان وهمي",
  duplicate: "إعلان مكرر",
  no_response: "المعلن لا يرد",
  wrong_contact: "بيانات التواصل خاطئة",
  spam: "إعلان مزعج أو ترويجي",
  inappropriate: "محتوى غير لائق",
  other: "سبب آخر",
  incorrect_info: "معلومات غير صحيحة",
  contact_issue: "مشكلة في التواصل",
  sold: "العقار مباع أو مؤجر",
};

export default function AdminReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [stats, setStats] = useState({ new: 0, in_review: 0, closed: 0, dismissed: 0, total: 0 });
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState<string>("");
  const [adminNote, setAdminNote] = useState("");
  const [listingAction, setListingAction] = useState<"hide" | "delete" | "none">("hide");
  const [submitting, setSubmitting] = useState(false);
  
  const fetchIdRef = useRef(0);

  const fetchReports = async () => {
    const currentFetchId = ++fetchIdRef.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/report-listing?_t=${Date.now()}`, { 
        credentials: "include",
        cache: 'no-store'
      });
      
      if (res.ok && currentFetchId === fetchIdRef.current) {
        const data = await res.json();
        setReports(data.reports || []);
        
        const newStats = { new: 0, in_review: 0, closed: 0, dismissed: 0, total: data.reports?.length || 0 };
        data.reports?.forEach((r: Report) => {
          const status = normalizeStatus(r.status);
          if (status in newStats) {
            newStats[status as keyof typeof newStats]++;
          }
        });
        setStats(newStats);
      } else if (res.status === 401) {
        window.location.href = '/admin-login';
      }
    } catch (error) {
      console.error("Error fetching reports:", error);
    } finally {
      if (currentFetchId === fetchIdRef.current) {
        setLoading(false);
      }
    }
  };

  const normalizeStatus = (status: string): string => {
    if (status === "pending" || status === "new") return "new";
    if (status === "in_review") return "in_review";
    if (status === "accepted" || status === "resolved" || status === "closed") return "closed";
    if (status === "rejected" || status === "dismissed") return "dismissed";
    return status;
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const openActionModal = (report: Report, action: string) => {
    setSelectedReport(report);
    setActionType(action);
    setAdminNote(report.action_note || "");
    setListingAction("hide");
    setShowActionModal(true);
  };

  const executeAction = async () => {
    if (!selectedReport) return;
    setSubmitting(true);

    try {
      let newStatus = "";
      let action = "none";
      
      if (actionType === "in_review") {
        const res = await fetch(`/api/report-listing/${selectedReport.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "in_review" }),
        });
        if (res.ok) {
          setShowActionModal(false);
          setSelectedReport(null);
          fetchReports();
        }
        return;
      }
      
      if (actionType === "closed") {
        newStatus = "closed";
        action = listingAction;
      } else if (actionType === "dismissed") {
        newStatus = "dismissed";
        action = "none";
      } else if (actionType === "restore") {
        newStatus = "dismissed";
        action = "restore";
      } else if (actionType === "delete_final") {
        newStatus = "closed";
        action = "delete";
      }
      
      const res = await fetch(`/api/report-listing/${selectedReport.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          status: newStatus,
          action: action,
          note: adminNote,
          listingId: selectedReport.listing_id
        }),
      });
      
      if (res.ok) {
        setShowActionModal(false);
        setSelectedReport(null);
        setAdminNote("");
        setListingAction("hide");
        fetchReports();
      }
    } catch (error) {
      console.error("Error updating status:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredReports = reports.filter((r) => {
    const normalizedStatus = normalizeStatus(r.status);
    const matchesFilter = filter === "all" || normalizedStatus === filter || 
      (filter === "hidden_listing" && r.listing_status === "hidden");
    const matchesSearch = 
      (r.listing_title?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (r.reporter_name?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (r.details?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (r.reason?.toLowerCase() || "").includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const hiddenListingsCount = reports.filter(r => r.listing_status === "hidden").length;

  const getActionConfig = (action: string) => {
    switch(action) {
      case "in_review":
        return { 
          title: "بدء المراجعة", 
          desc: "سيتم وضع البلاغ قيد المراجعة",
          icon: Eye,
          color: "bg-amber-500 hover:bg-amber-600"
        };
      case "closed":
        return { 
          title: "تم الحل", 
          desc: "تم التحقق من البلاغ واتخاذ الإجراء المناسب",
          icon: CheckCircle,
          color: "bg-green-500 hover:bg-green-600"
        };
      case "dismissed":
        return { 
          title: "غير مقبول", 
          desc: "البلاغ غير صحيح أو لا يستدعي إجراء",
          icon: XCircle,
          color: "bg-gray-500 hover:bg-gray-600"
        };
      case "restore":
        return { 
          title: "إعادة الإعلان", 
          desc: "سيتم إرجاع الإعلان للعرض العام مع إشعار اعتذار للمعلن",
          icon: Eye,
          color: "bg-emerald-500 hover:bg-emerald-600"
        };
      case "delete_final":
        return { 
          title: "حذف نهائي", 
          desc: "سيتم حذف الإعلان وتسجيل مخالفة على حساب المعلن",
          icon: Trash2,
          color: "bg-red-600 hover:bg-red-700"
        };
      default:
        return { title: "", desc: "", icon: AlertCircle, color: "" };
    }
  };

  const formatPrice = (price: number | null) => {
    if (!price) return null;
    return new Intl.NumberFormat("ar-SA").format(price) + " ريال";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#002845]">بلاغات الإعلانات</h1>
          <p className="text-sm text-slate-500 mt-1">مراجعة وإدارة البلاغات المقدمة على الإعلانات العقارية</p>
        </div>
        <button
          onClick={fetchReports}
          className="flex items-center gap-2 px-4 py-2 bg-[#002845] text-white rounded-xl hover:bg-[#003d66] transition"
        >
          <RefreshCw className="w-4 h-4" />
          تحديث
        </button>
      </div>

      {/* الإحصائيات */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
              <FileWarning className="w-5 h-5 text-slate-600" />
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
        <div className="bg-white rounded-2xl p-4 border border-amber-200 shadow-sm cursor-pointer hover:shadow-md transition" onClick={() => setFilter("in_review")}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <Eye className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">{stats.in_review}</p>
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
        <div className="bg-white rounded-2xl p-4 border border-orange-200 shadow-sm cursor-pointer hover:shadow-md transition" onClick={() => setFilter("hidden_listing")}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
              <EyeOff className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-orange-600">{hiddenListingsCount}</p>
              <p className="text-xs text-slate-500">إعلان محجوب</p>
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
            {Object.entries({ new: "جديد", in_review: "قيد المراجعة", closed: "تم الحل", dismissed: "غير مقبول" }).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                  filter === key ? `${statusColors[key].bg} ${statusColors[key].text} ${statusColors[key].border} border` : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {label} ({stats[key as keyof typeof stats] || 0})
              </button>
            ))}
            <button
              onClick={() => setFilter("hidden_listing")}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                filter === "hidden_listing" ? "bg-orange-100 text-orange-700 border border-orange-300" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              إعلان محجوب ({hiddenListingsCount})
            </button>
          </div>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="بحث في البلاغات..."
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
        ) : filteredReports.length === 0 ? (
          <div className="p-12 text-center">
            <FileWarning className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">لا توجد بلاغات {filter !== "all" ? `بحالة "${filter === "hidden_listing" ? "إعلان محجوب" : statusColors[filter]?.label}"` : ""}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredReports.map((report) => (
              <div key={report.id} className="p-5 hover:bg-slate-50 transition">
                <div className="flex flex-col md:flex-row md:items-start gap-4">
                  {/* معلومات البلاغ */}
                  <div className="flex-1 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${statusColors[normalizeStatus(report.status)]?.bg} ${statusColors[normalizeStatus(report.status)]?.text}`}>
                          {statusColors[normalizeStatus(report.status)]?.label || report.status}
                        </span>
                        <span className="px-2 py-1 rounded-lg bg-red-50 text-red-600 text-xs border border-red-200">
                          {REASON_LABELS[report.reason] || report.reason}
                        </span>
                        <span className="text-xs text-slate-400">#{report.id}</span>
                      </div>
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(report.created_at).toLocaleDateString("ar-SA")}
                      </span>
                    </div>

                    {/* معلومات الإعلان */}
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                      <div className="flex items-start gap-2">
                        <Building2 className="w-4 h-4 text-[#D4AF37] mt-1 shrink-0" />
                        <div className="flex-1">
                          <h3 className="font-bold text-[#002845] mb-1">
                            {report.listing_title || `إعلان #${report.listing_id.slice(0, 8)}`}
                          </h3>
                          {report.listing_city && (
                            <p className="text-xs text-slate-500 flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {report.listing_city}
                              {report.listing_district && ` - ${report.listing_district}`}
                            </p>
                          )}
                          {report.listing_price && (
                            <p className="text-sm font-bold text-[#002845] mt-1">
                              {formatPrice(report.listing_price)}
                            </p>
                          )}
                        </div>
                        <a
                          href={`/listing/${report.listing_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-3 py-1.5 bg-white text-[#002845] rounded-lg text-xs font-medium hover:bg-slate-100 transition border border-slate-200"
                        >
                          <Eye className="w-3 h-3" />
                          عرض
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>

                    {/* تنبيه الإعلان المحجوب */}
                    {report.listing_status === "hidden" && (
                      <div className="bg-amber-100 border-2 border-amber-400 rounded-xl px-4 py-3 flex items-center gap-3">
                        <div className="bg-amber-500 rounded-full p-2">
                          <EyeOff className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-amber-800">هذا الإعلان محجوب حالياً</p>
                          <p className="text-xs text-amber-700">يتطلب قراراً نهائياً: إعادة أو حذف</p>
                        </div>
                      </div>
                    )}

                    {/* تفاصيل البلاغ */}
                    {report.details && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                        <p className="text-xs text-slate-500 mb-1 font-medium">تفاصيل البلاغ:</p>
                        <p className="text-sm text-slate-600">{report.details}</p>
                      </div>
                    )}

                    {/* معلومات المُبلِّغ */}
                    <div className="flex flex-wrap gap-4 text-sm">
                      {report.reporter_name && (
                        <div className="flex items-center gap-2 text-slate-600">
                          <User className="w-4 h-4 text-slate-400" />
                          <span>{report.reporter_name}</span>
                        </div>
                      )}
                      {report.reporter_phone && (
                        <a href={`tel:${report.reporter_phone}`} className="flex items-center gap-2 text-[#002845] hover:text-[#D4AF37] transition">
                          <Phone className="w-4 h-4" />
                          <span dir="ltr">{report.reporter_phone}</span>
                        </a>
                      )}
                      {!report.reporter_name && !report.reporter_phone && (
                        <span className="text-slate-400 text-xs">بلاغ مجهول</span>
                      )}
                    </div>

                    {/* ملاحظات الإدارة */}
                    {report.action_note && (
                      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                        <p className="text-xs text-blue-600 mb-1 font-medium">ملاحظات الإدارة:</p>
                        <p className="text-sm text-blue-800">{report.action_note}</p>
                      </div>
                    )}
                  </div>

                  {/* أزرار الإجراءات */}
                  <div className="flex md:flex-col gap-2 md:w-44">
                    {/* البلاغات الجديدة */}
                    {normalizeStatus(report.status) === "new" && (
                      <>
                        <button
                          onClick={() => openActionModal(report, "in_review")}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-100 text-amber-700 rounded-xl hover:bg-amber-200 transition text-sm font-medium"
                        >
                          <Eye className="w-4 h-4" />
                          بدء المراجعة
                        </button>
                        <button
                          onClick={() => openActionModal(report, "dismissed")}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition text-sm font-medium"
                        >
                          <XCircle className="w-4 h-4" />
                          غير مقبول
                        </button>
                      </>
                    )}
                    
                    {/* البلاغات قيد المراجعة */}
                    {normalizeStatus(report.status) === "in_review" && (
                      <>
                        <button
                          onClick={() => openActionModal(report, "closed")}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-green-100 text-green-700 rounded-xl hover:bg-green-200 transition text-sm font-medium"
                        >
                          <CheckCircle className="w-4 h-4" />
                          تم الحل
                        </button>
                        <button
                          onClick={() => openActionModal(report, "dismissed")}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition text-sm font-medium"
                        >
                          <XCircle className="w-4 h-4" />
                          غير مقبول
                        </button>
                      </>
                    )}
                    
                    {/* أزرار القرار النهائي للإعلانات المحجوبة */}
                    {report.listing_status === "hidden" && (
                      <>
                        <button
                          onClick={() => openActionModal(report, "restore")}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition text-sm font-bold shadow-md"
                        >
                          <Eye className="w-4 h-4" />
                          إعادة الإعلان
                        </button>
                        <button
                          onClick={() => openActionModal(report, "delete_final")}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 transition text-sm font-bold shadow-md"
                        >
                          <Trash2 className="w-4 h-4" />
                          حذف نهائي
                        </button>
                      </>
                    )}
                    
                    {/* البلاغات المغلقة أو المرفوضة (إذا الإعلان ليس محجوب) */}
                    {(normalizeStatus(report.status) === "closed" || normalizeStatus(report.status) === "dismissed") && report.listing_status !== "hidden" && (
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
      {showActionModal && selectedReport && (
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
              {/* وصف الإجراء */}
              <div className={`p-4 rounded-xl ${
                actionType === "restore" ? "bg-emerald-50 border border-emerald-200" :
                actionType === "delete_final" ? "bg-red-50 border border-red-200" :
                actionType === "closed" ? "bg-green-50 border border-green-200" :
                actionType === "dismissed" ? "bg-slate-50 border border-slate-200" :
                "bg-amber-50 border border-amber-200"
              }`}>
                <div className="flex items-center gap-3">
                  {(() => {
                    const config = getActionConfig(actionType);
                    const Icon = config.icon;
                    return <Icon className={`w-6 h-6 ${
                      actionType === "restore" ? "text-emerald-600" :
                      actionType === "delete_final" ? "text-red-600" :
                      actionType === "closed" ? "text-green-600" :
                      actionType === "dismissed" ? "text-slate-600" :
                      "text-amber-600"
                    }`} />;
                  })()}
                  <div>
                    <p className={`font-bold ${
                      actionType === "restore" ? "text-emerald-800" :
                      actionType === "delete_final" ? "text-red-800" :
                      actionType === "closed" ? "text-green-800" :
                      actionType === "dismissed" ? "text-slate-800" :
                      "text-amber-800"
                    }`}>
                      {getActionConfig(actionType).title}
                    </p>
                    <p className="text-sm text-slate-600 mt-0.5">
                      {getActionConfig(actionType).desc}
                    </p>
                  </div>
                </div>
              </div>

              {/* معلومات البلاغ */}
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-1">الإعلان</p>
                <p className="font-medium text-[#002845]">{selectedReport.listing_title || `إعلان #${selectedReport.listing_id.slice(0,8)}`}</p>
                <p className="text-sm text-slate-500 mt-1">
                  السبب: {REASON_LABELS[selectedReport.reason] || selectedReport.reason}
                </p>
              </div>

              {/* خيارات الإجراء على الإعلان (فقط عند تم الحل) */}
              {actionType === "closed" && (
                <div>
                  <label className="block text-sm font-bold text-[#002845] mb-2">
                    الإجراء على الإعلان:
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition">
                      <input
                        type="radio"
                        name="listingAction"
                        value="hide"
                        checked={listingAction === "hide"}
                        onChange={() => setListingAction("hide")}
                        className="w-4 h-4 text-[#002845]"
                      />
                      <EyeOff className="w-5 h-5 text-amber-500" />
                      <div>
                        <span className="font-medium text-[#002845]">حجب الإعلان</span>
                        <p className="text-xs text-slate-500">سيتم حجب الإعلان مؤقتاً</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition">
                      <input
                        type="radio"
                        name="listingAction"
                        value="delete"
                        checked={listingAction === "delete"}
                        onChange={() => setListingAction("delete")}
                        className="w-4 h-4 text-[#002845]"
                      />
                      <Trash2 className="w-5 h-5 text-red-500" />
                      <div>
                        <span className="font-medium text-[#002845]">حذف الإعلان نهائياً</span>
                        <p className="text-xs text-slate-500">لا يمكن التراجع عن هذا الإجراء</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition">
                      <input
                        type="radio"
                        name="listingAction"
                        value="none"
                        checked={listingAction === "none"}
                        onChange={() => setListingAction("none")}
                        className="w-4 h-4 text-[#002845]"
                      />
                      <CheckCircle className="w-5 h-5 text-slate-400" />
                      <div>
                        <span className="font-medium text-[#002845]">بدون إجراء</span>
                        <p className="text-xs text-slate-500">إغلاق البلاغ دون التأثير على الإعلان</p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* حقل الملاحظات */}
              <div>
                <label className="block text-sm font-medium text-[#002845] mb-2">
                  ملاحظات الإدارة (اختياري)
                </label>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder={
                    actionType === "restore" 
                      ? "ملاحظة للمعلن (سيتم إرسالها مع الاعتذار)..." 
                      : "أضف ملاحظة حول الإجراء المتخذ..."
                  }
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
