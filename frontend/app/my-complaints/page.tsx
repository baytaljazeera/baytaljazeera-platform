"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  AlertCircle, Clock, CheckCircle, XCircle, Eye, MessageSquare, 
  Plus, ChevronRight, Calendar, CreditCard, User, FileText, RefreshCw
} from "lucide-react";

interface Refund {
  id: number;
  amount: number;
  status: string;
  decision_note: string | null;
  payout_confirmed_at: string | null;
  bank_reference: string | null;
  created_at: string;
}

interface Complaint {
  id: number;
  category: string;
  subject: string;
  details: string;
  status: string;
  admin_note: string | null;
  created_at: string;
  updated_at: string | null;
  refund?: Refund;
}

const statusColors: Record<string, { bg: string; text: string; label: string; icon: any }> = {
  new: { bg: "bg-amber-100", text: "text-amber-700", label: "قيد الانتظار", icon: Clock },
  in_review: { bg: "bg-blue-100", text: "text-blue-700", label: "قيد المراجعة", icon: Eye },
  closed: { bg: "bg-green-100", text: "text-green-700", label: "تم الحل", icon: CheckCircle },
  dismissed: { bg: "bg-gray-100", text: "text-gray-600", label: "غير مقبول", icon: XCircle },
};

const categoryLabels: Record<string, { label: string; icon: any; color: string }> = {
  billing: { label: "شكوى مالية", icon: CreditCard, color: "text-green-600" },
  technical: { label: "شكوى تقنية", icon: AlertCircle, color: "text-blue-600" },
  account_issue: { label: "مشكلة في الحساب", icon: User, color: "text-purple-600" },
  subscription: { label: "مشكلة في الاشتراك", icon: FileText, color: "text-orange-600" },
  other: { label: "شكوى أخرى", icon: MessageSquare, color: "text-slate-600" },
};

type StatusFilter = "all" | "replied" | "refund_completed";
type CategoryFilter = "all" | "billing" | "technical" | "account_issue";

export default function MyComplaintsPage() {
  const router = useRouter();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");

  useEffect(() => {
    fetchComplaints();
    // تحديث آخر زيارة للشكاوى
    fetch('/api/account/pending-counts/complaints/seen', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }).catch(() => {});
  }, []);

  const filteredComplaints = complaints.filter((c) => {
    let matchStatus = true;
    let matchCategory = true;
    
    if (statusFilter === "replied") {
      matchStatus = !!(c.admin_note || c.status === "closed" || c.status === "dismissed");
    } else if (statusFilter === "refund_completed") {
      matchStatus = c.category === "billing" && c.refund?.status === "completed" && !!c.refund?.payout_confirmed_at;
    }
    
    if (categoryFilter !== "all") {
      matchCategory = c.category === categoryFilter;
    }
    
    return matchStatus && matchCategory;
  });

  const countReplied = complaints.filter(c => c.admin_note || c.status === "closed" || c.status === "dismissed").length;
  const countRefundCompleted = complaints.filter(c => c.category === "billing" && c.refund?.status === "completed" && c.refund?.payout_confirmed_at).length;
  const countBilling = complaints.filter(c => c.category === "billing").length;
  const countTechnical = complaints.filter(c => c.category === "technical").length;
  const countAccount = complaints.filter(c => c.category === "account_issue").length;

  async function fetchComplaints() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/account-complaints/mine`, { credentials: "include", headers: getAuthHeaders() });
      if (res.status === 401) {
        router.push("/login?redirect=/my-complaints");
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setComplaints(data.complaints || []);
      }
    } catch (error) {
      console.error("Error fetching complaints:", error);
    } finally {
      setLoading(false);
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 py-8 px-4" dir="rtl">
      <div className="max-w-3xl mx-auto">
        <nav className="flex items-center gap-2 text-sm text-slate-500 mb-6">
          <Link href="/" className="hover:text-[#002845] transition">الرئيسية</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-[#002845] font-medium">شكاواي</span>
        </nav>

        <div className="bg-gradient-to-l from-[#002845] to-[#003d66] rounded-3xl p-6 mb-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center">
                <MessageSquare className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">شكاواي</h1>
                <p className="text-white/70 text-sm mt-1">تابع حالة شكاواك المقدمة</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={fetchComplaints}
                className="p-3 bg-white/10 rounded-xl hover:bg-white/20 transition"
                title="تحديث"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
              <Link
                href="/complaint"
                className="flex items-center gap-2 px-4 py-3 bg-[#D4AF37] text-[#002845] rounded-xl hover:bg-[#e5c868] transition font-bold"
              >
                <Plus className="w-5 h-5" />
                شكوى جديدة
              </Link>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        {!loading && complaints.length > 0 && (
          <div className="bg-white rounded-2xl p-4 mb-6 shadow-lg space-y-4">
            {/* Category Filters */}
            <div>
              <p className="text-xs text-slate-500 mb-2 font-medium">تصفية حسب النوع:</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setCategoryFilter("all")}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm transition ${
                    categoryFilter === "all"
                      ? "bg-[#002845] text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  الكل
                  <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                    categoryFilter === "all" ? "bg-white/20" : "bg-slate-200"
                  }`}>
                    {complaints.length}
                  </span>
                </button>
                
                <button
                  onClick={() => setCategoryFilter("billing")}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm transition ${
                    categoryFilter === "billing"
                      ? "bg-green-600 text-white"
                      : "bg-green-50 text-green-700 hover:bg-green-100"
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  مالية
                  {countBilling > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                      categoryFilter === "billing" ? "bg-white/20" : "bg-green-100"
                    }`}>
                      {countBilling}
                    </span>
                  )}
                </button>
                
                <button
                  onClick={() => setCategoryFilter("technical")}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm transition ${
                    categoryFilter === "technical"
                      ? "bg-blue-600 text-white"
                      : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                  }`}
                >
                  <AlertCircle className="w-4 h-4" />
                  تقنية
                  {countTechnical > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                      categoryFilter === "technical" ? "bg-white/20" : "bg-blue-100"
                    }`}>
                      {countTechnical}
                    </span>
                  )}
                </button>
                
                <button
                  onClick={() => setCategoryFilter("account_issue")}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm transition ${
                    categoryFilter === "account_issue"
                      ? "bg-purple-600 text-white"
                      : "bg-purple-50 text-purple-700 hover:bg-purple-100"
                  }`}
                >
                  <User className="w-4 h-4" />
                  حساب
                  {countAccount > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                      categoryFilter === "account_issue" ? "bg-white/20" : "bg-purple-100"
                    }`}>
                      {countAccount}
                    </span>
                  )}
                </button>
              </div>
            </div>
            
            {/* Status Filters */}
            <div className="border-t pt-4">
              <p className="text-xs text-slate-500 mb-2 font-medium">تصفية حسب الحالة:</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setStatusFilter("all")}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm transition ${
                    statusFilter === "all"
                      ? "bg-slate-700 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  الكل
                </button>
                
                <button
                  onClick={() => setStatusFilter("replied")}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm transition ${
                    statusFilter === "replied"
                      ? "bg-blue-600 text-white"
                      : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                  }`}
                >
                  <CheckCircle className="w-4 h-4" />
                  تم الرد
                  {countReplied > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                      statusFilter === "replied" ? "bg-white/20" : "bg-blue-100"
                    }`}>
                      {countReplied}
                    </span>
                  )}
                </button>
                
                <button
                  onClick={() => setStatusFilter("refund_completed")}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm transition ${
                    statusFilter === "refund_completed"
                      ? "bg-emerald-600 text-white"
                      : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  تم التحويل
                  {countRefundCompleted > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                      statusFilter === "refund_completed" ? "bg-white/20" : "bg-emerald-100"
                    }`}>
                      {countRefundCompleted}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-lg">
            <div className="w-10 h-10 border-3 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-slate-500 mt-4">جاري التحميل...</p>
          </div>
        ) : complaints.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-lg">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-10 h-10 text-slate-300" />
            </div>
            <h2 className="text-xl font-bold text-[#002845] mb-2">لا توجد شكاوى</h2>
            <p className="text-slate-500 mb-6">لم تقدم أي شكوى بعد</p>
            <Link
              href="/complaint"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#D4AF37] text-[#002845] rounded-xl hover:bg-[#e5c868] transition font-bold"
            >
              <Plus className="w-5 h-5" />
              تقديم شكوى جديدة
            </Link>
          </div>
        ) : filteredComplaints.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-lg">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-8 h-8 text-slate-300" />
            </div>
            <h2 className="text-lg font-bold text-[#002845] mb-2">
              لا توجد نتائج
            </h2>
            <p className="text-slate-500 text-sm">
              لا توجد شكاوى تطابق الفلتر المحدد
            </p>
            <button
              onClick={() => { setStatusFilter("all"); setCategoryFilter("all"); }}
              className="mt-4 px-4 py-2 text-sm text-[#D4AF37] hover:text-[#B8962E] font-medium"
            >
              عرض جميع الشكاوى
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredComplaints.map((complaint) => {
              const status = statusColors[complaint.status] || statusColors.new;
              const category = categoryLabels[complaint.category] || categoryLabels.other;
              const StatusIcon = status.icon;
              const CategoryIcon = category.icon;
              const isExpanded = expandedId === complaint.id;

              return (
                <div
                  key={complaint.id}
                  className="bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-100 hover:shadow-xl transition"
                >
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : complaint.id)}
                    className="w-full text-right p-5"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${status.bg}`}>
                          <StatusIcon className={`w-6 h-6 ${status.text}`} />
                        </div>
                        <div>
                          <h3 className="font-bold text-[#002845] text-lg">{complaint.subject}</h3>
                          <div className="flex items-center gap-3 mt-2">
                            <span className={`flex items-center gap-1.5 text-sm ${category.color}`}>
                              <CategoryIcon className="w-4 h-4" />
                              {category.label}
                            </span>
                            <span className="text-sm text-slate-400 flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" />
                              {formatDate(complaint.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${status.bg} ${status.text}`}>
                          {status.label}
                        </span>
                        <span className="text-xs text-slate-400">#{complaint.id}</span>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-5 pt-0 border-t border-slate-100">
                      <div className="bg-slate-50 rounded-xl p-4 mt-4">
                        <p className="text-xs text-slate-500 mb-2 font-medium">تفاصيل الشكوى:</p>
                        <p className="text-sm text-slate-700 leading-relaxed">{complaint.details}</p>
                      </div>

                      {complaint.admin_note && (
                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mt-4">
                          <p className="text-xs text-blue-600 mb-2 font-medium flex items-center gap-1">
                            <MessageSquare className="w-3.5 h-3.5" />
                            رد الإدارة:
                          </p>
                          <p className="text-sm text-blue-800 leading-relaxed">{complaint.admin_note}</p>
                        </div>
                      )}

                      {complaint.status === "new" && (
                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mt-4">
                          <p className="text-sm text-amber-700 flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            شكواك قيد الانتظار وسيتم مراجعتها قريباً
                          </p>
                        </div>
                      )}

                      {complaint.status === "in_review" && (
                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mt-4">
                          <p className="text-sm text-blue-700 flex items-center gap-2">
                            <Eye className="w-4 h-4" />
                            شكواك قيد المراجعة من قبل فريق الدعم
                          </p>
                        </div>
                      )}

                      {complaint.category === "billing" && complaint.refund && (
                        <div className="mt-4">
                          <div className="bg-gradient-to-l from-[#D4AF37]/10 to-[#002845]/10 rounded-xl p-4 border border-[#D4AF37]/20">
                            <div className="flex items-center gap-2 mb-3">
                              <CreditCard className="w-5 h-5 text-[#D4AF37]" />
                              <span className="font-bold text-[#002845]">حالة طلب الاسترداد</span>
                            </div>
                            
                            <div className="space-y-3">
                              {complaint.refund.status === "pending" && (
                                <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                                  <Clock className="w-5 h-5 text-amber-600" />
                                  <div>
                                    <p className="text-sm font-medium text-amber-800">قيد المراجعة</p>
                                    <p className="text-xs text-amber-600">طلب الاسترداد قيد المراجعة من قسم المالية</p>
                                  </div>
                                </div>
                              )}
                              
                              {complaint.refund.status === "approved" && !complaint.refund.payout_confirmed_at && (
                                <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                                  <CheckCircle className="w-5 h-5 text-green-600" />
                                  <div>
                                    <p className="text-sm font-medium text-green-800">تمت الموافقة على الاسترداد ✓</p>
                                    <p className="text-xs text-green-600">سيتم تحويل المبلغ إلى حسابكم خلال 5 أيام عمل</p>
                                    {complaint.refund.decision_note && (
                                      <p className="text-xs text-green-700 mt-1">ملاحظة: {complaint.refund.decision_note}</p>
                                    )}
                                  </div>
                                </div>
                              )}
                              
                              {complaint.refund.status === "completed" && complaint.refund.payout_confirmed_at && (
                                <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                                  <CreditCard className="w-5 h-5 text-blue-600" />
                                  <div>
                                    <p className="text-sm font-medium text-blue-800">تم إرجاع المبلغ بنجاح ✓</p>
                                    <p className="text-xs text-blue-600">
                                      تاريخ التحويل: {new Date(complaint.refund.payout_confirmed_at).toLocaleDateString("ar-SA")}
                                    </p>
                                    {complaint.refund.bank_reference && (
                                      <p className="text-xs text-blue-700 mt-1">رقم المرجع البنكي: {complaint.refund.bank_reference}</p>
                                    )}
                                  </div>
                                </div>
                              )}
                              
                              {complaint.refund.status === "rejected" && (
                                <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
                                  <XCircle className="w-5 h-5 text-red-600" />
                                  <div>
                                    <p className="text-sm font-medium text-red-800">تم رفض طلب الاسترداد</p>
                                    {complaint.refund.decision_note && (
                                      <p className="text-xs text-red-600">السبب: {complaint.refund.decision_note}</p>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8 text-center">
          <p className="text-sm text-slate-500">
            لديك استفسار؟{" "}
            <Link href="/complaint" className="text-[#D4AF37] hover:text-[#B8962E] font-medium">
              تقديم شكوى جديدة
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
