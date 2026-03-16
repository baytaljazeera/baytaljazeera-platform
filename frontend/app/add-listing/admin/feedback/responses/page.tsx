"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import {
  MessageSquare,
  Loader2,
  Download,
  Trash2,
  Search,
  AlertCircle,
} from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";

interface ResponseItem {
  id: number;
  rating: number | null;
  had_issue: boolean | null;
  comment: string | null;
  page_url: string | null;
  page_type: string | null;
  device_type: string | null;
  user_id?: string | null;
  user_name?: string | null;
  user_email?: string | null;
  user_whatsapp?: string | null;
  created_at: string;
}

const PAGE_TYPE_LABELS: Record<string, string> = {
  home: "الرئيسية",
  search: "نتائج البحث",
  search_map: "خريطة البحث",
  listing: "تفاصيل العقار",
};

export default function FeedbackResponsesPage() {
  const [items, setItems] = useState<ResponseItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageType, setPageType] = useState("");
  const [ratingFilter, setRatingFilter] = useState("");
  const [searchText, setSearchText] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const startInternalMessage = async (userId?: string | null, userName?: string | null) => {
    if (!userId) return;
    const label = userName && userName.trim() ? ` للعميل ${userName}` : "";
    const msg = window.prompt(`اكتب رسالة${label}:`);
    if (!msg) return;
    try {
      const res = await fetch(`${API_URL}/api/admin-messages/conversations`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          department: "support",
          subject: "متابعة تغذية راجعة (بيت الجزيرة)",
          message: msg,
          participants: [userId],
        }),
      });
      if (!res.ok) throw new Error();
      window.alert("تم إرسال رسالة داخلية بنجاح");
    } catch {
      window.alert("فشل إرسال الرسالة الداخلية");
    }
  };

  const fetchResponses = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (pageType) params.set("pageType", pageType);
      if (ratingFilter) params.set("rating", ratingFilter);
      if (searchText.trim()) params.set("search", searchText.trim());
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await fetch(`${API_URL}/api/feedback/admin/responses?${params}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("فشل تحميل الردود");
      const json = await res.json();
      setItems(json.items || []);
      setTotal(json.total ?? 0);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ");
    } finally {
      setLoading(false);
    }
  }, [page, limit, pageType, ratingFilter, searchText, fromDate, toDate]);

  useEffect(() => {
    fetchResponses();
  }, [fetchResponses]);

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      const res = await fetch(`${API_URL}/api/feedback/admin/responses/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("فشل الحذف");
      await fetchResponses();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "فشل الحذف");
    } finally {
      setDeletingId(null);
    }
  };

  const handleExport = async () => {
    const params = new URLSearchParams();
    if (pageType) params.set("pageType", pageType);
    if (ratingFilter) params.set("rating", ratingFilter);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    const res = await fetch(`${API_URL}/api/feedback/admin/responses/export?${params}`, {
      credentials: "include",
      headers: getAuthHeaders(),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "feedback-responses.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="space-y-6" dir="rtl">
      <h1 className="text-2xl font-bold text-[#002845] flex items-center gap-2">
        <MessageSquare className="w-7 h-7 text-[#D4AF37]" />
        ردود التغذية الراجعة
      </h1>

      <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="بحث في التعليق أو الرابط..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-48"
          />
        </div>
        <select
          value={pageType}
          onChange={(e) => setPageType(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">كل الصفحات</option>
          <option value="home">الرئيسية</option>
          <option value="search">نتائج البحث</option>
          <option value="search_map">خريطة البحث</option>
          <option value="listing">تفاصيل العقار</option>
        </select>
        <select
          value={ratingFilter}
          onChange={(e) => setRatingFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">كل التقييمات</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
          <option value="5">5</option>
        </select>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#D4AF37] text-[#002845] font-bold text-sm hover:bg-[#c49f2e]"
        >
          <Download className="w-4 h-4" />
          تصدير CSV
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              await fetch(`${API_URL}/api/feedback/admin/mark-read`, {
                method: "POST",
                credentials: "include",
                headers: getAuthHeaders(),
              });
            } catch {
              // ignore
            }
          }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-600 hover:bg-slate-50"
        >
          تمييز الكل كمقروء (تصفير العداد)
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-right py-3 px-4">التقييم</th>
                    <th className="text-right py-3 px-4">مشكلة</th>
                    <th className="text-right py-3 px-4">تعليق</th>
                    <th className="text-right py-3 px-4">صفحة</th>
                    <th className="text-right py-3 px-4">نوع الصفحة</th>
                    <th className="text-right py-3 px-4">العميل</th>
                    <th className="text-right py-3 px-4">تواصل</th>
                    <th className="text-right py-3 px-4">تاريخ</th>
                    <th className="text-right py-3 px-4">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-500">
                        لا توجد ردود
                      </td>
                    </tr>
                  ) : (
                    items.map((r) => {
                      const negative = r.rating != null && r.rating <= 2;
                      const positive = r.rating != null && r.rating >= 4;
                      return (
                        <tr
                          key={r.id}
                          className={`border-t border-slate-100 hover:bg-slate-50 ${
                            negative ? "bg-red-50/40" : ""
                          }`}
                        >
                          <td
                            className={`py-2 px-4 ${
                              negative
                                ? "text-red-600 font-bold"
                                : positive
                                ? "text-green-700 font-bold"
                                : ""
                            }`}
                          >
                            {r.rating ?? "—"}
                          </td>
                          <td
                            className={`py-2 px-4 ${
                              negative
                                ? "text-red-600"
                                : positive
                                ? "text-green-700"
                                : ""
                            }`}
                          >
                            {r.had_issue === true
                              ? "نعم"
                              : r.had_issue === false
                              ? "لا"
                              : "—"}
                          </td>
                          <td
                            className="py-2 px-4 max-w-[200px] truncate"
                            title={r.comment || ""}
                          >
                            {r.comment || "—"}
                          </td>
                          <td
                            className="py-2 px-4 max-w-[150px] truncate"
                            title={r.page_url || ""}
                          >
                            {r.page_url || "—"}
                          </td>
                          <td className="py-2 px-4">
                            {PAGE_TYPE_LABELS[r.page_type || ""] || r.page_type}
                          </td>
                          <td className="py-2 px-4">
                            <div className="min-w-[140px]">
                              <button
                                type="button"
                                className="font-medium text-[#002845] truncate text-right w-full hover:underline disabled:cursor-default disabled:opacity-70"
                                title={r.user_name || ""}
                                onClick={() => startInternalMessage(r.user_id, r.user_name)}
                                disabled={!r.user_id}
                              >
                                {r.user_name || "—"}
                              </button>
                              <div
                                className="text-xs text-slate-500 truncate"
                                title={r.user_email || ""}
                              >
                                {r.user_email || ""}
                              </div>
                              <div
                                className="text-xs text-slate-500 truncate"
                                title={r.user_whatsapp || ""}
                              >
                                {r.user_whatsapp || ""}
                              </div>
                            </div>
                          </td>
                          <td className="py-2 px-4">
                            <div className="flex items-center gap-2">
                              {r.user_email && (
                                <a
                                  className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
                                  href={`mailto:${encodeURIComponent(r.user_email)}`}
                                >
                                  Email
                                </a>
                              )}
                              {r.user_whatsapp && (
                                <a
                                  className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
                                  target="_blank"
                                  rel="noreferrer"
                                  href={`https://wa.me/${String(r.user_whatsapp).replace(
                                    /[^0-9]/g,
                                    ""
                                  )}`}
                                >
                                  WhatsApp
                                </a>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-4 text-slate-600">
                            {r.created_at
                              ? new Date(r.created_at).toLocaleString("ar-SA")
                              : "—"}
                          </td>
                          <td className="py-2 px-4">
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(r.id)}
                              disabled={deletingId === r.id}
                              className="p-2 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50"
                              title="حذف"
                            >
                              {deletingId === r.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {confirmDeleteId !== null && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 mx-4">
                  <h3 className="text-lg font-bold text-[#002845] mb-2">تأكيد حذف الرد</h3>
                  <p className="text-sm text-slate-600 mb-4">
                    هل أنت متأكد أنك تريد حذف هذا الرد؟ لا يمكن التراجع بعد الحذف.
                  </p>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50"
                      disabled={deletingId === confirmDeleteId}
                      onClick={() => {
                        if (confirmDeleteId !== null) {
                          handleDelete(confirmDeleteId).then(() => setConfirmDeleteId(null));
                        }
                      }}
                    >
                      {deletingId === confirmDeleteId ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "حذف الرد"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex justify-center gap-2 py-4 border-t border-slate-100">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-4 py-2 rounded-lg border border-slate-300 disabled:opacity-50"
                >
                  السابق
                </button>
                <span className="px-4 py-2 text-slate-600">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-4 py-2 rounded-lg border border-slate-300 disabled:opacity-50"
                >
                  التالي
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

