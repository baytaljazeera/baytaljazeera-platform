"use client";

/**
 * Executive Overview — the operational command-center for super_admin /
 * admin / admin_manager. Aggregates KPIs, bottlenecks, health indicators,
 * and a status×priority complaint heatmap into a single board.
 *
 * Feeds from GET /api/admin/executive-overview (one round-trip, every
 * block is independently fault-tolerant on the backend).
 */

import Link from "next/link";
import { useMemo } from "react";
import {
  Crown, FileText, AlertTriangle, Wallet, Users, Calendar, Activity,
  Inbox as InboxIcon, ArrowUpRight, Flame, Clock, ShieldCheck,
} from "lucide-react";
import { useAdminFetch } from "@/lib/hooks/useAdminFetch";
import { useAdminGate } from "@/lib/hooks/useAdminGate";

type Overview = {
  generated_at: string;
  kpis: {
    listings_pending: number;
    listings_new_7d: number;
    complaints_open: number;
    complaints_breached_sla: number;
    complaints_new_24h: number;
    revenue_7d: number;
    revenue_30d: number;
    employees_active: number;
    contracts_expiring_30d: number;
    vacations_pending: number;
  };
  bottlenecks: {
    complaints_by_role: { role: string; open_count: number; breached: number }[];
    oldest_pending_complaints: { id: number; subject: string; auto_assigned_role: string; priority: string; created_at: string; sla_due_at: string | null; hours_open: number }[];
    pending_approvals_count: number;
  };
  health: {
    sla_breach_rate_24h: number;
    avg_response_time_hours: number | null;
  };
  heatmap: {
    by_status_priority: { status: string; priority: string; n: number }[];
  };
};

const ROLE_LABEL: Record<string, string> = {
  super_admin: "المدير العام",
  admin: "مدير",
  admin_manager: "مدير إداري",
  finance_admin: "المالية",
  support_admin: "الدعم",
  content_admin: "المحتوى",
  hr_admin: "الموارد البشرية",
};

const PRI_TONE: Record<string, string> = {
  urgent: "bg-red-500/30 text-red-100",
  high:   "bg-amber-500/30 text-amber-100",
  medium: "bg-slate-500/20 text-slate-100",
  low:    "bg-slate-500/10 text-slate-300",
};

const STATUS_LABEL: Record<string, string> = {
  new: "جديدة",
  pending: "قيد المعالجة",
  in_progress: "قيد العمل",
  resolved: "محلولة",
  closed: "مغلقة",
  dismissed: "مرفوضة",
};

export default function ExecutiveOverviewPage() {
  const { ready, allowed } = useAdminGate({
    anyRole: ["super_admin", "admin", "admin_manager"],
    redirectTo: "/add-listing/admin/dashboard",
  });

  const { data, loading, error, refetch } = useAdminFetch<Overview>(
    "/api/admin/executive-overview",
    {
      generated_at: "",
      kpis: { listings_pending: 0, listings_new_7d: 0, complaints_open: 0, complaints_breached_sla: 0, complaints_new_24h: 0, revenue_7d: 0, revenue_30d: 0, employees_active: 0, contracts_expiring_30d: 0, vacations_pending: 0 },
      bottlenecks: { complaints_by_role: [], oldest_pending_complaints: [], pending_approvals_count: 0 },
      health: { sla_breach_rate_24h: 0, avg_response_time_hours: null },
      heatmap: { by_status_priority: [] },
    }
  );

  const heatmapGrid = useMemo(() => {
    const statuses = Array.from(new Set(data.heatmap.by_status_priority.map((c) => c.status)));
    const priorities = ["urgent", "high", "medium", "low"];
    const map: Record<string, Record<string, number>> = {};
    for (const c of data.heatmap.by_status_priority) {
      map[c.status] = map[c.status] || {};
      map[c.status][c.priority] = c.n;
    }
    return { statuses, priorities, map };
  }, [data.heatmap.by_status_priority]);

  if (!ready) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-300">
        <div className="text-center">
          <Crown className="w-12 h-12 mx-auto text-slate-500 mb-3" />
          <p>هذه الصفحة مخصصة للإدارة العليا.</p>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="p-4 md:p-6 max-w-7xl mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/40 flex items-center justify-center">
            <Crown className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white">لوحة الإدارة التنفيذية</h1>
            <p className="text-xs text-slate-400">
              KPIs، اختناقات التدفّق، ومؤشرات صحة العمليات في لقطة واحدة
              {data.generated_at && <> — حُدِّثت: {new Date(data.generated_at).toLocaleString("ar")}</>}
            </p>
          </div>
        </div>
        <button
          onClick={refetch}
          className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 transition text-sm"
        >
          تحديث
        </button>
      </header>

      {loading ? (
        <div className="py-12 flex items-center justify-center text-slate-400">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300">
          خطأ في تحميل اللوحة: {error}
        </div>
      ) : (
        <>
          {/* KPI grid */}
          <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            <KpiCard icon={FileText} label="إعلانات قيد المراجعة" value={data.kpis.listings_pending} sub={`+${data.kpis.listings_new_7d} في 7 أيام`} href="/add-listing/admin/listings" tone="blue" />
            <KpiCard icon={InboxIcon} label="شكاوى مفتوحة" value={data.kpis.complaints_open} sub={`+${data.kpis.complaints_new_24h} اليوم`} href="/add-listing/admin/customer-service" tone="cyan" />
            <KpiCard icon={AlertTriangle} label="تجاوز SLA" value={data.kpis.complaints_breached_sla} sub="بحاجة تدخّل فوري" href="/add-listing/admin/customer-service" tone="red" highlight={data.kpis.complaints_breached_sla > 0} />
            <KpiCard icon={Wallet} label="إيراد ٧ أيام" value={`${formatMoney(data.kpis.revenue_7d)} ر.س`} sub={`${formatMoney(data.kpis.revenue_30d)} ر.س / ٣٠ يوم`} href="/add-listing/admin/finance" tone="green" />
            <KpiCard icon={Users} label="موظفون نشطون" value={data.kpis.employees_active} sub="" href="/add-listing/admin/hr" tone="pink" />
            <KpiCard icon={Calendar} label="عقود قاربت الانتهاء" value={data.kpis.contracts_expiring_30d} sub="خلال 30 يوم" href="/add-listing/admin/hr" tone="amber" />
            <KpiCard icon={Activity} label="طلبات إجازة معلّقة" value={data.kpis.vacations_pending} sub="بانتظار البتّ" href="/add-listing/admin/hr" tone="purple" />
            <KpiCard icon={ShieldCheck} label="موافقات معلّقة" value={data.bottlenecks.pending_approvals_count} sub="إعلانات/إجازات/عضويات" href="/add-listing/admin/dashboard" tone="slate" />
            <KpiCard icon={Clock} label="متوسّط زمن الردّ" value={data.health.avg_response_time_hours != null ? `${data.health.avg_response_time_hours} س` : "—"} sub="على شكاوى ٣٠ يوم" tone="slate" />
            <KpiCard icon={Flame} label="معدّل تجاوز SLA" value={`${(data.health.sla_breach_rate_24h * 100).toFixed(0)}%`} sub="آخر 24 ساعة" tone="red" highlight={data.health.sla_breach_rate_24h > 0.2} />
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* Bottlenecks: by role */}
            <section className="bg-slate-900/40 border border-slate-700 rounded-xl p-4">
              <header className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-400" />
                  شكاوى مفتوحة بحسب الدور
                </h2>
                <Link href="/add-listing/admin/customer-service" className="text-xs text-amber-400 hover:text-amber-300 inline-flex items-center gap-1">
                  افتح المُصنّف <ArrowUpRight className="w-3 h-3" />
                </Link>
              </header>
              {data.bottlenecks.complaints_by_role.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">لا توجد شكاوى مفتوحة.</p>
              ) : (
                <ul className="space-y-2">
                  {data.bottlenecks.complaints_by_role.map((r, i) => (
                    <li key={i} className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50">
                      <span className="text-sm text-slate-200">{ROLE_LABEL[r.role] || r.role || "غير محدّد"}</span>
                      <div className="flex items-center gap-2">
                        {r.breached > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 text-xs">
                            {r.breached} متجاوز
                          </span>
                        )}
                        <span className="text-sm font-bold text-amber-400">{r.open_count}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Heatmap */}
            <section className="bg-slate-900/40 border border-slate-700 rounded-xl p-4">
              <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <Flame className="w-4 h-4 text-red-400" />
                خريطة حرارية — الحالة × الأولوية
              </h2>
              {heatmapGrid.statuses.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">لا بيانات.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-400">
                        <th className="text-start p-2"></th>
                        {heatmapGrid.priorities.map((p) => (
                          <th key={p} className="text-center p-2 font-normal">{p === "urgent" ? "عاجل" : p === "high" ? "مرتفع" : p === "medium" ? "متوسط" : "منخفض"}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {heatmapGrid.statuses.map((s) => (
                        <tr key={s}>
                          <td className="p-2 text-slate-300">{STATUS_LABEL[s] || s}</td>
                          {heatmapGrid.priorities.map((p) => {
                            const n = heatmapGrid.map[s]?.[p] || 0;
                            const intensity = Math.min(1, n / 10);
                            return (
                              <td key={p} className="p-1">
                                <div
                                  className={`rounded-md text-center py-1.5 font-semibold ${PRI_TONE[p]}`}
                                  style={{ opacity: n === 0 ? 0.25 : 0.5 + intensity * 0.5 }}
                                >
                                  {n}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          {/* Oldest pending complaints */}
          <section className="bg-slate-900/40 border border-slate-700 rounded-xl p-4">
            <header className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                أقدم الشكاوى المعلّقة
              </h2>
            </header>
            {data.bottlenecks.oldest_pending_complaints.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">لا توجد شكاوى معلّقة.</p>
            ) : (
              <ul className="divide-y divide-slate-800">
                {data.bottlenecks.oldest_pending_complaints.map((c) => (
                  <li key={c.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 truncate">#{c.id} — {c.subject || "بدون عنوان"}</p>
                      <p className="text-xs text-slate-500">
                        {ROLE_LABEL[c.auto_assigned_role] || c.auto_assigned_role || "غير موجّه"} ·
                        مفتوحة منذ {Math.round(c.hours_open)} ساعة
                      </p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${PRI_TONE[c.priority] || PRI_TONE.medium}`}>
                      {c.priority || "medium"}
                    </span>
                    <Link
                      href={`/add-listing/admin/customer-service?complaint=${c.id}`}
                      className="text-xs text-amber-400 hover:text-amber-300"
                    >
                      فتح
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon, label, value, sub, href, tone = "slate", highlight = false,
}: {
  icon: typeof Crown;
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
  tone?: "blue" | "cyan" | "red" | "green" | "amber" | "pink" | "purple" | "slate";
  highlight?: boolean;
}) {
  const tones: Record<string, string> = {
    blue:   "text-blue-400 bg-blue-500/10 border-blue-500/30",
    cyan:   "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
    red:    "text-red-400 bg-red-500/10 border-red-500/30",
    green:  "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    amber:  "text-amber-400 bg-amber-500/10 border-amber-500/30",
    pink:   "text-pink-400 bg-pink-500/10 border-pink-500/30",
    purple: "text-purple-400 bg-purple-500/10 border-purple-500/30",
    slate:  "text-slate-400 bg-slate-500/10 border-slate-500/20",
  };
  const inner = (
    <div className={`p-4 rounded-xl border transition ${
      highlight ? "bg-red-500/10 border-red-500/40 ring-2 ring-red-500/20" : "bg-slate-900/40 border-slate-700 hover:border-slate-600"
    }`}>
      <div className="flex items-center justify-between">
        <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${tones[tone]}`}>
          <Icon className="w-4 h-4" />
        </div>
        {href && <ArrowUpRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400" />}
      </div>
      <p className="text-xs text-slate-400 mt-3">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-1">{sub}</p>}
    </div>
  );
  return href ? <Link href={href} className="group block">{inner}</Link> : inner;
}

function formatMoney(n: number): string {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}م`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}ك`;
  return String(Math.round(n));
}
