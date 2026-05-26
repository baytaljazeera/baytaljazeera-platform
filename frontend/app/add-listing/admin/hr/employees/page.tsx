"use client";

/**
 * Phase 4 — Employees list under HR.
 * Pulls from GET /api/hr/employees (every staff member with role != 'user').
 * Each row: name, email, role, status, activity bucket, joined date, link
 * to /admin/hr/employees/:id.
 */

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { API_URL, getAuthHeaders } from "@/lib/api";
import {
  Users, RefreshCcw, Loader2, AlertTriangle, Search, ChevronLeft,
  Mail, Clock, AlertCircle,
} from "lucide-react";

type Employee = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  joined_at: string;
  last_login_at: string | null;
  last_action_at: string | null;
  actions_total: number;
  active_contracts: number;
  soonest_end: string | null;
  activity_bucket: "today" | "this_week" | "this_month" | "inactive";
};

const ROLE_LABEL: Record<string, string> = {
  super_admin: "المدير العام",
  admin: "إدارة عليا",
  admin_manager: "مدير الإدارة",
  finance_admin: "المالية",
  support_admin: "الدعم",
  content_admin: "المحتوى",
  hr_admin: "الموارد البشرية",
};

const ACTIVITY_LABEL: Record<string, string> = {
  today: "اليوم", this_week: "هذا الأسبوع", this_month: "هذا الشهر", inactive: "خامل",
};
const ACTIVITY_TONE: Record<string, string> = {
  today: "bg-emerald-50 text-emerald-700 border-emerald-200",
  this_week: "bg-blue-50 text-blue-700 border-blue-200",
  this_month: "bg-amber-50 text-amber-700 border-amber-200",
  inactive: "bg-slate-100 text-slate-500 border-slate-200",
};
const STATUS_LABEL: Record<string, string> = {
  active: "نشط", suspended: "موقوف", under_review: "تحت المراجعة", pending: "قيد التفعيل",
};
const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  suspended: "bg-red-50 text-red-700 border-red-200",
  under_review: "bg-amber-50 text-amber-700 border-amber-200",
  pending: "bg-slate-50 text-slate-600 border-slate-200",
};

function dateOnly(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" });
}
function timeAgo(iso?: string | null) {
  if (!iso) return "لم يسجل دخول";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `قبل ${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${h} س`;
  const d = Math.floor(h / 24);
  return `قبل ${d} يوم`;
}

export default function HREmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set("search", search.trim());
      if (roleFilter) qs.set("role", roleFilter);
      if (statusFilter) qs.set("status", statusFilter);
      const res = await fetch(`${API_URL}/api/hr/employees${qs.toString() ? `?${qs}` : ''}`, {
        credentials: "include", headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEmployees(data.employees || []);
    } catch (e: any) {
      setError(e?.message || "خطأ في تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Unique role list for the filter dropdown — computed from data.
  const availableRoles = useMemo(() => {
    const s = new Set(employees.map(e => e.role));
    return Array.from(s).sort();
  }, [employees]);

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <Link href="/add-listing/admin/hr" className="text-xs text-slate-500 hover:text-[#002845] inline-flex items-center gap-1 mb-1">
              <ChevronLeft className="w-3 h-3" /> الموارد البشرية
            </Link>
            <h1 className="text-2xl md:text-3xl font-bold text-[#002845] flex items-center gap-2">
              <Users className="w-6 h-6 md:w-7 md:h-7 text-pink-500" />
              الموظفون
            </h1>
            <p className="text-slate-500 text-sm mt-1">{employees.length} موظف نشط في الفريق الإداري.</p>
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

        {/* Filter row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="relative">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالاسم أو الإيميل..."
              className="w-full ps-3 pe-8 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
          >
            <option value="">جميع الأدوار</option>
            {availableRoles.map(r => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
          >
            <option value="">جميع الحالات</option>
            <option value="active">نشط</option>
            <option value="suspended">موقوف</option>
            <option value="under_review">تحت المراجعة</option>
            <option value="pending">قيد التفعيل</option>
          </select>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {error}
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="divide-y divide-slate-100">
            {loading ? (
              <p className="px-4 py-10 text-center text-sm text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> جاري التحميل...
              </p>
            ) : employees.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">لا يوجد موظفون مطابقون</p>
            ) : (
              employees.map((e) => {
                const endingSoon = e.soonest_end && (new Date(e.soonest_end).getTime() - Date.now()) < 30 * 86_400_000;
                return (
                  <Link
                    key={e.id}
                    href={`/add-listing/admin/hr/employees/${e.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition"
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#002845] to-[#003366] text-white flex items-center justify-center font-bold text-sm shrink-0">
                      {(e.name || "?").trim().charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-[#002845] truncate">{e.name || "—"}</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600">
                          {ROLE_LABEL[e.role] || e.role}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_TONE[e.status] || STATUS_TONE.active}`}>
                          {STATUS_LABEL[e.status] || e.status}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${ACTIVITY_TONE[e.activity_bucket]} inline-flex items-center gap-1`}>
                          <Clock className="w-2.5 h-2.5" /> {ACTIVITY_LABEL[e.activity_bucket]}
                        </span>
                        {endingSoon && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-red-50 border-red-200 text-red-700 inline-flex items-center gap-1">
                            <AlertCircle className="w-2.5 h-2.5" /> عقد قارب الانتهاء
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5 inline-flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {e.email}
                        <span className="mx-1.5 text-slate-300">·</span>
                        انضم {dateOnly(e.joined_at)}
                        <span className="mx-1.5 text-slate-300">·</span>
                        آخر نشاط {timeAgo(e.last_action_at || e.last_login_at)}
                      </p>
                    </div>
                    <ChevronLeft className="w-4 h-4 text-slate-400 shrink-0" />
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
