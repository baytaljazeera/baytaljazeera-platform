"use client";

/**
 * Phase 5 — Unified Administrative Audit Feed.
 *
 * One page that shows every admin-worthy action across three sources,
 * merged chronologically and filterable:
 *   • permissions    — role/permission CRUD (permission_audit_log)
 *   • admin_action   — HR approvals, suspensions, password resets (admin_audit_logs)
 *   • complaint_event — transfers / replies / directives / status changes
 *
 * Filters: source (multi), actor name search, date from/to.
 */

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { API_URL, getAuthHeaders } from "@/lib/api";
import {
  History, RefreshCcw, Loader2, AlertTriangle, Filter, ChevronLeft,
  Shield, MessageCircle, UserPlus2, Lock, ArrowLeftRight, CheckCircle,
} from "lucide-react";

type LogRow = {
  source: "permissions" | "admin_action" | "complaint_event";
  action_type: string;
  target_role?: string | null;
  target_user_id?: string | null;
  target_user_name?: string | null;
  changed_by_id?: string | null;
  changed_by_name?: string | null;
  old_value?: any;
  new_value?: any;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
};
type Response = {
  logs: LogRow[];
  total: number;
  page: number;
  totalPages: number;
  sources: { permissions: number; admin_action: number; complaint_event: number };
};

const SOURCE_LABEL: Record<string, string> = {
  permissions: "أدوار وصلاحيات",
  admin_action: "إجراء إداري",
  complaint_event: "حدث شكوى",
};
const SOURCE_TONE: Record<string, string> = {
  permissions: "bg-purple-50 text-purple-700 border-purple-200",
  admin_action: "bg-blue-50 text-blue-700 border-blue-200",
  complaint_event: "bg-amber-50 text-amber-700 border-amber-200",
};
const SOURCE_ICON: Record<string, any> = {
  permissions: Shield,
  admin_action: UserPlus2,
  complaint_event: ArrowLeftRight,
};

const ACTION_LABEL: Record<string, string> = {
  CREATE_CUSTOM_ROLE: "إنشاء دور مخصص",
  UPDATE_CUSTOM_ROLE: "تعديل دور",
  DELETE_CUSTOM_ROLE: "حذف دور",
  UPDATE_ROLE_PERMISSIONS: "تعديل صلاحيات",
  USER_ROLE_CHANGE: "تغيير دور مستخدم",
  USER_SUSPEND: "إيقاف مستخدم",
  USER_REACTIVATE: "إعادة تفعيل",
  USER_PASSWORD_RESET: "تصفير كلمة المرور",
  MEMBERSHIP_APPROVE: "قبول طلب توظيف",
  MEMBERSHIP_REJECT: "رفض طلب توظيف",
  created: "إنشاء شكوى",
  transferred: "تحويل شكوى",
  status_changed: "تغيير حالة",
  admin_reply: "رد على عميل",
  internal_note: "ملاحظة داخلية",
  directive: "توجيه داخلي",
  assignment: "تكليف رسمي",
  note_added: "إضافة ملاحظة",
};

function dateTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ar-SA", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function UnifiedAuditPage() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    sources: [] as string[],
    actor: "",
    from: "",
    to: "",
  });
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("page", String(page));
      qs.set("limit", "25");
      for (const s of filters.sources) qs.append("source", s);
      if (filters.actor.trim()) qs.set("actor", filters.actor.trim());
      if (filters.from) qs.set("from", filters.from);
      if (filters.to) qs.set("to", filters.to);
      const res = await fetch(`${API_URL}/api/permissions/audit-log?${qs.toString()}`, {
        credentials: "include", headers: getAuthHeaders(),
      });
      if (res.status === 403) throw new Error("هذه الصفحة للمدير العام فقط");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setData(d);
    } catch (e: any) {
      setError(e?.message || "خطأ في تحميل السجل");
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  const toggleSource = (s: string) => {
    setPage(1);
    setFilters(f => ({
      ...f,
      sources: f.sources.includes(s) ? f.sources.filter(x => x !== s) : [...f.sources, s],
    }));
  };

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5">
        <Link href="/add-listing/admin/dashboard" className="text-xs text-slate-500 hover:text-[#002845] inline-flex items-center gap-1">
          <ChevronLeft className="w-3 h-3" /> لوحة التحكم
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#002845] flex items-center gap-2">
              <History className="w-6 h-6 md:w-7 md:h-7 text-[#D4AF37]" />
              سجل التدقيق الإداري
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              كل إجراء مهم حدث على المنصة — أدوار، صلاحيات، توظيف، تحويلات، ردود. {data && `(${data.total} إجراء)`}
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
            تحديث
          </button>
        </div>

        {/* Source tally */}
        {data && (
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(data.sources) as Array<keyof typeof data.sources>).map((s) => {
              const Icon = SOURCE_ICON[s];
              const active = filters.sources.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => toggleSource(s)}
                  className={`px-3 py-2.5 rounded-lg border text-right transition ${
                    active ? "bg-[#D4AF37]/10 border-[#D4AF37] text-[#9a7d28]" : "bg-white border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-slate-500" />
                    <div className="flex-1">
                      <p className="text-[10px] text-slate-500">{SOURCE_LABEL[s]}</p>
                      <p className="text-base font-black text-[#002845]">{data.sources[s].toLocaleString("en-US")}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Filter row */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
          <p className="text-xs font-bold text-slate-600 inline-flex items-center gap-1.5"><Filter className="w-3 h-3" /> فلاتر</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              value={filters.actor}
              onChange={(e) => { setPage(1); setFilters(f => ({ ...f, actor: e.target.value })); }}
              placeholder="بحث باسم المنفّذ..."
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40"
            />
            <input
              type="date"
              value={filters.from}
              onChange={(e) => { setPage(1); setFilters(f => ({ ...f, from: e.target.value })); }}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              placeholder="من تاريخ"
            />
            <input
              type="date"
              value={filters.to}
              onChange={(e) => { setPage(1); setFilters(f => ({ ...f, to: e.target.value })); }}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              placeholder="إلى تاريخ"
            />
          </div>
          {(filters.sources.length > 0 || filters.actor || filters.from || filters.to) && (
            <button
              onClick={() => { setPage(1); setFilters({ sources: [], actor: "", from: "", to: "" }); }}
              className="text-xs text-slate-500 hover:text-red-600"
            >
              مسح كل الفلاتر
            </button>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {error}
          </div>
        )}

        {/* Log list */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="divide-y divide-slate-100">
            {loading ? (
              <p className="px-4 py-10 text-center text-sm text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> جاري التحميل...
              </p>
            ) : !data || data.logs.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">لا توجد سجلات مطابقة</p>
            ) : (
              data.logs.map((row, idx) => {
                const Icon = SOURCE_ICON[row.source] || History;
                const expanded = expandedRow === idx;
                return (
                  <div key={idx} className="px-4 py-3 hover:bg-slate-50 transition">
                    <div
                      onClick={() => setExpandedRow(expanded ? null : idx)}
                      className="cursor-pointer"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg border bg-slate-50 border-slate-200 flex items-center justify-center shrink-0">
                          <Icon className="w-3.5 h-3.5 text-slate-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${SOURCE_TONE[row.source]}`}>
                              {SOURCE_LABEL[row.source]}
                            </span>
                            <p className="text-sm font-bold text-[#002845]">
                              {ACTION_LABEL[row.action_type] || row.action_type}
                            </p>
                            {row.target_role && row.source !== "complaint_event" && (
                              <span className="text-[10px] text-slate-500">→ {row.target_role}</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            <span className="font-semibold text-slate-600">المنفّذ:</span>{" "}
                            {row.changed_by_name || row.changed_by_id || "النظام"}
                            <span className="mx-1.5 text-slate-300">|</span>
                            {dateTime(row.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                    {expanded && (
                      <div className="mt-2 mr-11 p-2.5 bg-slate-50 rounded text-[11px] space-y-1.5">
                        {row.target_user_name && (
                          <p><span className="font-semibold text-slate-600">المستهدف:</span> {row.target_user_name}</p>
                        )}
                        {row.target_user_id && !row.target_user_name && (
                          <p><span className="font-semibold text-slate-600">مستهدف:</span> {row.target_user_id}</p>
                        )}
                        {row.old_value && (
                          <div>
                            <p className="font-semibold text-slate-600 mb-0.5">قبل:</p>
                            <pre className="bg-white p-1.5 rounded border border-slate-100 text-[10px] overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(row.old_value, null, 2)}</pre>
                          </div>
                        )}
                        {row.new_value && (
                          <div>
                            <p className="font-semibold text-slate-600 mb-0.5">بعد:</p>
                            <pre className="bg-white p-1.5 rounded border border-slate-100 text-[10px] overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(row.new_value, null, 2)}</pre>
                          </div>
                        )}
                        {row.ip_address && <p><span className="font-semibold text-slate-600">IP:</span> {row.ip_address}</p>}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 text-xs">
            <button
              disabled={page <= 1 || loading}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 disabled:opacity-40"
            >
              السابق
            </button>
            <span className="text-slate-500">صفحة {data.page} من {data.totalPages}</span>
            <button
              disabled={page >= data.totalPages || loading}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 disabled:opacity-40"
            >
              التالي
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
