"use client";

import { useEffect, useState } from "react";
import { Star, Check, X, Eye, Clock, AlertTriangle, ChevronLeft, ChevronRight, Filter, Search } from "lucide-react";

type Rating = {
  id: number;
  advertiser_id: string;
  rater_id: string;
  listing_id: number | null;
  rating: number;
  quick_rating: string;
  comment: string;
  advertiser_reply: string;
  status: string;
  admin_notes: string;
  created_at: string;
  rater_name: string;
  rater_email: string;
  advertiser_name: string;
  advertiser_email: string;
  listing_title: string;
  reviewer_name: string;
};

export default function AdminRatingsPage() {
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedRating, setSelectedRating] = useState<Rating | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [processing, setProcessing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const limit = 20;

  useEffect(() => {
    fetchRatings();
  }, [tab, page, statusFilter]);

  async function fetchRatings() {
    setLoading(true);
    try {
      const endpoint = tab === "pending" 
        ? `/api/ratings/admin/pending?page=${page}&limit=${limit}`
        : `/api/ratings/admin/all?page=${page}&limit=${limit}${statusFilter ? `&status=${statusFilter}` : ''}`;
      
      const res = await fetch(endpoint, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setRatings(data.ratings);
        setTotal(data.pagination.total);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(ratingId: number, status: "approved" | "rejected" | "hidden") {
    setProcessing(true);
    try {
      const res = await fetch(`/api/ratings/admin/${ratingId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, admin_notes: adminNotes }),
      });

      if (res.ok) {
        setSelectedRating(null);
        setAdminNotes("");
        fetchRatings();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setProcessing(false);
    }
  }

  function renderStars(rating: number) {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`w-4 h-4 ${
              star <= rating ? "fill-[#D4AF37] text-[#D4AF37]" : "text-slate-300"
            }`}
          />
        ))}
      </div>
    );
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "pending":
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">قيد المراجعة</span>;
      case "approved":
        return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">معتمد</span>;
      case "rejected":
        return <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">مرفوض</span>;
      case "hidden":
        return <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-full text-xs">مخفي</span>;
      default:
        return null;
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#002845] to-[#fdf6db] p-6" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-[#002845] to-[#01375e] p-6">
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Star className="w-8 h-8 text-[#D4AF37]" />
              إدارة تقييمات المعلنين
            </h1>
            <p className="text-slate-300 mt-1">مراجعة واعتماد تقييمات العملاء</p>
          </div>

          <div className="p-6">
            <div className="flex gap-4 mb-6 border-b pb-4">
              <button
                onClick={() => { setTab("pending"); setPage(1); }}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                  tab === "pending" 
                    ? "bg-[#002845] text-white" 
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <Clock className="w-4 h-4" />
                قيد المراجعة
              </button>
              <button
                onClick={() => { setTab("all"); setPage(1); }}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                  tab === "all" 
                    ? "bg-[#002845] text-white" 
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <Eye className="w-4 h-4" />
                جميع التقييمات
              </button>
              
              {tab === "all" && (
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                  className="mr-auto px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">كل الحالات</option>
                  <option value="approved">معتمد</option>
                  <option value="rejected">مرفوض</option>
                  <option value="hidden">مخفي</option>
                </select>
              )}
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="w-10 h-10 border-4 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-slate-500 mt-4">جاري التحميل...</p>
              </div>
            ) : ratings.length === 0 ? (
              <div className="text-center py-12">
                <Star className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">لا توجد تقييمات {tab === "pending" ? "قيد المراجعة" : ""}</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-right p-4 font-medium text-slate-600">المُقيّم</th>
                        <th className="text-right p-4 font-medium text-slate-600">المعلن</th>
                        <th className="text-right p-4 font-medium text-slate-600">التقييم</th>
                        <th className="text-right p-4 font-medium text-slate-600">التعليق</th>
                        <th className="text-right p-4 font-medium text-slate-600">التاريخ</th>
                        <th className="text-right p-4 font-medium text-slate-600">الحالة</th>
                        <th className="text-right p-4 font-medium text-slate-600">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {ratings.map((rating) => (
                        <tr key={rating.id} className="hover:bg-slate-50">
                          <td className="p-4">
                            <div className="font-medium text-[#002845]">{rating.rater_name || "-"}</div>
                            <div className="text-xs text-slate-500">{rating.rater_email}</div>
                          </td>
                          <td className="p-4">
                            <div className="font-medium text-[#002845]">{rating.advertiser_name || "-"}</div>
                            <div className="text-xs text-slate-500">{rating.advertiser_email}</div>
                          </td>
                          <td className="p-4">
                            {renderStars(rating.rating)}
                            {rating.quick_rating && (
                              <span className={`text-xs mt-1 block ${
                                rating.quick_rating === 'positive' ? 'text-green-600' :
                                rating.quick_rating === 'negative' ? 'text-red-600' : 'text-slate-500'
                              }`}>
                                {rating.quick_rating === 'positive' ? 'إيجابي' :
                                 rating.quick_rating === 'negative' ? 'سلبي' : 'محايد'}
                              </span>
                            )}
                          </td>
                          <td className="p-4 max-w-xs">
                            <p className="text-sm text-slate-600 truncate">{rating.comment || "-"}</p>
                          </td>
                          <td className="p-4 text-sm text-slate-500">
                            {new Date(rating.created_at).toLocaleDateString("ar-SA")}
                          </td>
                          <td className="p-4">{getStatusBadge(rating.status)}</td>
                          <td className="p-4">
                            <button
                              onClick={() => setSelectedRating(rating)}
                              className="text-[#D4AF37] hover:underline text-sm"
                            >
                              عرض التفاصيل
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-4 mt-6 pt-4 border-t">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                    <span className="text-sm text-slate-600">
                      صفحة {page} من {totalPages}
                    </span>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {selectedRating && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedRating(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-[#002845] to-[#01375e] p-4 text-white flex justify-between items-center sticky top-0">
              <h3 className="font-bold text-lg">تفاصيل التقييم</h3>
              <button onClick={() => setSelectedRating(null)} className="p-1 hover:bg-white/10 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">المُقيّم</p>
                  <p className="font-medium text-[#002845]">{selectedRating.rater_name || "-"}</p>
                  <p className="text-sm text-slate-500">{selectedRating.rater_email}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">المعلن</p>
                  <p className="font-medium text-[#002845]">{selectedRating.advertiser_name || "-"}</p>
                  <p className="text-sm text-slate-500">{selectedRating.advertiser_email}</p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-2">التقييم</p>
                <div className="flex items-center gap-4">
                  {renderStars(selectedRating.rating)}
                  <span className="text-2xl font-bold text-[#002845]">{selectedRating.rating}/5</span>
                </div>
              </div>

              {selectedRating.comment && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-2">التعليق</p>
                  <p className="text-[#002845]">{selectedRating.comment}</p>
                </div>
              )}

              {selectedRating.advertiser_reply && (
                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="text-xs text-blue-600 mb-2">رد المعلن</p>
                  <p className="text-blue-800">{selectedRating.advertiser_reply}</p>
                </div>
              )}

              {selectedRating.listing_title && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">الإعلان</p>
                  <p className="font-medium text-[#002845]">{selectedRating.listing_title}</p>
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-slate-600 block mb-2">ملاحظات إدارية</label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="أضف ملاحظات..."
                  className="w-full border rounded-lg p-3 h-24 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <button
                  onClick={() => handleAction(selectedRating.id, "approved")}
                  disabled={processing}
                  className="flex-1 bg-green-500 text-white py-3 rounded-xl font-bold hover:bg-green-600 flex items-center justify-center gap-2"
                >
                  <Check className="w-5 h-5" />
                  اعتماد
                </button>
                <button
                  onClick={() => handleAction(selectedRating.id, "rejected")}
                  disabled={processing}
                  className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold hover:bg-red-600 flex items-center justify-center gap-2"
                >
                  <X className="w-5 h-5" />
                  رفض
                </button>
                <button
                  onClick={() => handleAction(selectedRating.id, "hidden")}
                  disabled={processing}
                  className="flex-1 bg-slate-500 text-white py-3 rounded-xl font-bold hover:bg-slate-600 flex items-center justify-center gap-2"
                >
                  <Eye className="w-5 h-5" />
                  إخفاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
