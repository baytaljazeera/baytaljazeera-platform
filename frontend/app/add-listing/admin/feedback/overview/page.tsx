"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  MessageSquare,
  Star,
  TrendingUp,
  Loader2,
  AlertCircle,
  FileText,
} from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";

interface OverviewData {
  total: number;
  avgRating: number | null;
  byPageType: { pageType: string; count: number }[];
  recent: {
    id: number;
    rating: number | null;
    had_issue: boolean | null;
    comment: string | null;
    page_type: string | null;
    page_url: string | null;
    created_at: string;
  }[];
  negativeComments: string[];
}

interface AnalysisData {
  summary: string;
  suggestions: string[];
}

const PAGE_TYPE_LABELS: Record<string, string> = {
  home: "الرئيسية",
  search: "نتائج البحث",
  search_map: "خريطة البحث",
  listing: "تفاصيل العقار",
};

export default function FeedbackOverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_URL}/api/feedback/admin/overview`, {
          credentials: "include",
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error("فشل تحميل البيانات");
        const json = await res.json();
        setData(json);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "خطأ");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const runAnalysis = async () => {
    try {
      setAnalyzing(true);
      const res = await fetch(`${API_URL}/api/feedback/admin/summary`, {
        method: "POST",
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("فشل تحليل البيانات");
      const json = await res.json();
      setAnalysis({
        summary: json.summary,
        suggestions: json.suggestions || [],
      });
    } catch (e) {
      setAnalysis({
        summary: e instanceof Error ? e.message : "حدث خطأ أثناء التحليل",
        suggestions: [],
      });
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-10 h-10 animate-spin text-[#D4AF37]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-6 flex items-center gap-3">
        <AlertCircle className="w-8 h-8 text-red-500 shrink-0" />
        <p className="text-red-700 font-medium">{error || "حدث خطأ"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-[#002845] flex items-center gap-2">
          <LayoutDashboard className="w-7 h-7 text-[#D4AF37]" />
          نظرة عامة — تجربة المستخدم
        </h1>
        <button
          type="button"
          onClick={runAnalysis}
          disabled={analyzing || !data.total}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#002845] text-white text-sm font-bold disabled:opacity-50"
        >
          {analyzing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <TrendingUp className="w-4 h-4" />
          )}
          تحليل تلقائي للتجربة
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl bg-gradient-to-br from-[#002845] to-[#003d5c] text-white p-5 shadow-lg">
          <MessageSquare className="w-8 h-8 text-[#D4AF37] mb-2" />
          <p className="text-white/70 text-sm">إجمالي الردود</p>
          <p className="text-2xl font-bold">{data.total}</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-[#002845] to-[#003d5c] text-white p-5 shadow-lg">
          <Star className="w-8 h-8 text-[#D4AF37] mb-2" />
          <p className="text-white/70 text-sm">متوسط التقييم</p>
          <p className="text-2xl font-bold">
            {data.avgRating != null ? data.avgRating.toFixed(1) : "—"}
          </p>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-sm">
          <TrendingUp className="w-8 h-8 text-[#D4AF37] mb-2" />
          <p className="text-slate-600 text-sm">حسب نوع الصفحة</p>
          <ul className="mt-2 space-y-1 text-sm font-medium text-[#002845]">
            {data.byPageType.length === 0 ? (
              <li>لا توجد بيانات</li>
            ) : (
              data.byPageType.map(({ pageType, count }) => (
                <li key={pageType}>
                  {PAGE_TYPE_LABELS[pageType] || pageType}: {count}
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 p-5 shadow-sm">
          <AlertCircle className="w-8 h-8 text-amber-500 mb-2" />
          <p className="text-slate-600 text-sm">تعليقات سلبية (عينة)</p>
          <p className="text-xl font-bold text-[#002845]">{data.negativeComments?.length ?? 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <h2 className="px-5 py-4 border-b border-slate-100 font-bold text-[#002845] flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#D4AF37]" />
            آخر الردود
          </h2>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="text-right py-2 px-3">التقييم</th>
                  <th className="text-right py-2 px-3">مشكلة</th>
                  <th className="text-right py-2 px-3">الصفحة</th>
                  <th className="text-right py-2 px-3">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500">
                      لا توجد ردود بعد
                    </td>
                  </tr>
                ) : (
                  data.recent.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="py-2 px-3">{r.rating ?? "—"}</td>
                      <td className="py-2 px-3">{r.had_issue === true ? "نعم" : r.had_issue === false ? "لا" : "—"}</td>
                      <td className="py-2 px-3">{PAGE_TYPE_LABELS[r.page_type || ""] || r.page_type}</td>
                      <td className="py-2 px-3 text-slate-600">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString("ar-SA") : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <h2 className="px-5 py-4 border-b border-slate-100 font-bold text-[#002845] flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-500" />
            تعليقات سلبية (عينة)
          </h2>
          <div className="p-4 max-h-[400px] overflow-y-auto space-y-2">
            {!data.negativeComments?.length ? (
              <p className="text-slate-500 text-sm">لا توجد تعليقات سلبية في العينة</p>
            ) : (
              data.negativeComments.slice(0, 15).map((c, i) => (
                <div
                  key={i}
                  className="p-3 rounded-lg bg-amber-50 border border-amber-100 text-sm text-[#002845]"
                >
                  {c}
                </div>
              ))
            )}
          </div>
        </div>

        {analysis && (
          <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden lg:col-span-2">
            <h2 className="px-5 py-4 border-b border-slate-100 font-bold text-[#002845]">
              نتيجة التحليل التلقائي
            </h2>
            <div className="p-5 space-y-3 text-sm text-[#002845]">
              <p>{analysis.summary}</p>
              {analysis.suggestions.length > 0 && (
                <div>
                  <p className="font-semibold mb-1">خطوات مقترحة:</p>
                  <ul className="list-disc pr-5 space-y-1">
                    {analysis.suggestions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
