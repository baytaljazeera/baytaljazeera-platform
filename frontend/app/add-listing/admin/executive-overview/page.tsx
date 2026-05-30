"use client";

/**
 * Executive Overview — operational command-center for super_admin /
 * admin / admin_manager. Aggregates KPIs, bottlenecks, health, and
 * the status×priority complaint heatmap.
 *
 * Feeds from GET /api/admin/executive-overview.
 */

import Link from "next/link";
import { useMemo } from "react";
import {
  Crown,
  FileText,
  AlertTriangle,
  Wallet,
  Users,
  Calendar,
  Activity,
  Inbox as InboxIcon,
  ArrowUpRight,
  Flame,
  Clock,
  ShieldCheck,
  RefreshCw,
  Loader2,
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
    oldest_pending_complaints: {
      id: number;
      subject: string;
      auto_assigned_role: string;
      priority: string;
      created_at: string;
      sla_due_at: string | null;
      hours_open: number;
    }[];
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

const STATUS_LABEL: Record<string, string> = {
  new: "جديدة",
  pending: "قيد المعالجة",
  in_progress: "قيد العمل",
  resolved: "محلولة",
  closed: "مغلقة",
  dismissed: "مرفوضة",
};

const PRIORITY_LABEL: Record<string, string> = {
  urgent: "عاجل",
  high: "مرتفع",
  medium: "متوسط",
  low: "منخفض",
};

// Status hue only when actually meaningful — kept consistent with the
// rest of the admin: rose for urgent, amber for warning, slate elsewhere.
const PRI_DOT: Record<string, string> = {
  urgent: "bg-rose-500",
  high: "bg-amber-500",
  medium: "bg-slate-400",
  low: "bg-slate-300",
};

const PRI_PILL: Record<string, string> = {
  urgent: "bg-rose-50 text-rose-700 border-rose-200",
  high: "bg-amber-50 text-amber-700 border-amber-200",
  medium: "bg-slate-50 text-slate-600 border-slate-200",
  low: "bg-slate-50 text-slate-500 border-slate-100",
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
      kpis: {
        listings_pending: 0,
        listings_new_7d: 0,
        complaints_open: 0,
        complaints_breached_sla: 0,
        complaints_new_24h: 0,
        revenue_7d: 0,
        revenue_30d: 0,
        employees_active: 0,
        contracts_expiring_30d: 0,
        vacations_pending: 0,
      },
      bottlenecks: {
        complaints_by_role: [],
        oldest_pending_complaints: [],
        pending_approvals_count: 0,
      },
      health: { sla_breach_rate_24h: 0, avg_response_time_hours: null },
      heatmap: { by_status_priority: [] },
    }
  );

  const heatmapGrid = useMemo(() => {
    const statuses = Array.from(
      new Set(data.heatmap.by_status_priority.map((c) => c.status))
    );
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
        <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <Crown className="w-12 h-12 mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">هذه الصفحة مخصصة للإدارة العليا</p>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-10">
      {/* ── Hero header ───────────────────────────────────────────────── */}
      <header className="relative overflow-hidden rounded-3xl border border-[#EDE6D6] bg-gradient-to-l from-white via-[#FAF8F4] to-white">
        <div className="pointer-events-none absolute -left-12 -top-12 w-48 h-48 rounded-full bg-[#D4AF37]/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 -bottom-12 w-56 h-56 rounded-full bg-[#002845]/5 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #002845 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4 px-6 md:px-8 py-7 md:py-9">
          <div className="flex items-start gap-4 min-w-0">
            <div className="shrink-0 w-14 h-14 rounded-2xl bg-white border border-[#EDE6D6] shadow-sm flex items-center justify-center">
              <Crown className="w-7 h-7 text-[#D4AF37]" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-[#9A7D28] tracking-[0.2em] uppercase mb-1">
                Executive
              </p>
              <h1 className="text-2xl md:text-3xl font-black text-[#002845] leading-tight">
                لوحة الإدارة التنفيذية
              </h1>
              <p className="text-sm text-slate-500 mt-1.5 max-w-2xl">
                مؤشّرات الأداء، اختناقات التدفّق، وصحّة العمليات في لقطة واحدة
                {data.generated_at && (
                  <span className="block text-xs text-slate-400 mt-1">
                    حُدِّثت {new Date(data.generated_at).toLocaleString("ar")}
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={refetch}
            disabled={loading}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#D4AF37]/40 text-[#9A7D28] bg-white hover:bg-[#FFFCEE] active:scale-95 transition disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            تحديث
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
          خطأ في تحميل اللوحة: {error}
        </div>
      ) : (
        <>
          {/* ── KPI strip ──────────────────────────────────────────────── */}
          <section>
            <SectionTitle title="مؤشّرات الأداء" />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
              <Kpi
                icon={FileText}
                label="إعلانات قيد المراجعة"
                value={data.kpis.listings_pending}
                sub={`+${data.kpis.listings_new_7d} خلال ٧ أيام`}
                href="/add-listing/admin/listings"
                tone={toneByCount(data.kpis.listings_pending, 3, 10)}
              />
              <Kpi
                icon={InboxIcon}
                label="شكاوى مفتوحة"
                value={data.kpis.complaints_open}
                sub={`+${data.kpis.complaints_new_24h} اليوم`}
                href="/add-listing/admin/customer-service"
                tone={toneByCount(data.kpis.complaints_open, 1, 5)}
              />
              <Kpi
                icon={AlertTriangle}
                label="تجاوز SLA"
                value={data.kpis.complaints_breached_sla}
                sub="بحاجة تدخّل فوري"
                href="/add-listing/admin/customer-service"
                tone={data.kpis.complaints_breached_sla > 0 ? "urgent" : "normal"}
              />
              <Kpi
                icon={Wallet}
                label="إيراد ٧ أيام"
                value={`${formatMoney(data.kpis.revenue_7d)} ر.س`}
                sub={`${formatMoney(data.kpis.revenue_30d)} ر.س / ٣٠ يوم`}
                href="/add-listing/admin/finance"
              />
              <Kpi
                icon={Users}
                label="موظفون نشطون"
                value={data.kpis.employees_active}
                href="/add-listing/admin/hr"
              />
              <Kpi
                icon={Calendar}
                label="عقود قاربت الانتهاء"
                value={data.kpis.contracts_expiring_30d}
                sub="خلال ٣٠ يوم"
                href="/add-listing/admin/hr"
                tone={toneByCount(data.kpis.contracts_expiring_30d, 1, 5)}
              />
              <Kpi
                icon={Activity}
                label="طلبات إجازة معلّقة"
                value={data.kpis.vacations_pending}
                sub="بانتظار البتّ"
                href="/add-listing/admin/hr"
                tone={toneByCount(data.kpis.vacations_pending, 1, 5)}
              />
              <Kpi
                icon={ShieldCheck}
                label="موافقات معلّقة"
                value={data.bottlenecks.pending_approvals_count}
                sub="إعلانات/إجازات/عضويات"
                href="/add-listing/admin/dashboard"
                tone={toneByCount(data.bottlenecks.pending_approvals_count, 1, 10)}
              />
              <Kpi
                icon={Clock}
                label="متوسّط زمن الردّ"
                value={
                  data.health.avg_response_time_hours != null
                    ? `${data.health.avg_response_time_hours} س`
                    : "—"
                }
                sub="على شكاوى ٣٠ يوم"
              />
              <Kpi
                icon={Flame}
                label="معدّل تجاوز SLA"
                value={`${(data.health.sla_breach_rate_24h * 100).toFixed(0)}%`}
                sub="آخر ٢٤ ساعة"
                tone={
                  data.health.sla_breach_rate_24h > 0.2
                    ? "urgent"
                    : data.health.sla_breach_rate_24h > 0.05
                      ? "attention"
                      : "normal"
                }
              />
            </div>
          </section>

          {/* ── Bottlenecks + Heatmap ─────────────────────────────────── */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
            {/* By role */}
            <Panel
              icon={Activity}
              title="شكاوى مفتوحة بحسب الدور"
              cta={
                <Link
                  href="/add-listing/admin/customer-service"
                  className="text-xs text-[#9A7D28] hover:underline inline-flex items-center gap-1"
                >
                  افتح المصنّف <ArrowUpRight className="w-3 h-3" />
                </Link>
              }
            >
              {data.bottlenecks.complaints_by_role.length === 0 ? (
                <EmptyLine text="لا توجد شكاوى مفتوحة." />
              ) : (
                <ul className="divide-y divide-[#F1ECE0]">
                  {data.bottlenecks.complaints_by_role.map((r, i) => (
                    <li
                      key={i}
                      className="py-3 flex items-center justify-between gap-3"
                    >
                      <span className="text-sm text-[#002845] font-medium">
                        {ROLE_LABEL[r.role] || r.role || "غير محدّد"}
                      </span>
                      <div className="flex items-center gap-2">
                        {r.breached > 0 && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                            {r.breached} متجاوز
                          </span>
                        )}
                        <span className="text-base font-black text-[#9A7D28] tabular-nums">
                          {r.open_count}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {/* Heatmap */}
            <Panel icon={Flame} title="خريطة حرارية — الحالة × الأولوية">
              {heatmapGrid.statuses.length === 0 ? (
                <EmptyLine text="لا بيانات." />
              ) : (
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-400">
                        <th className="text-start p-2 font-normal" />
                        {heatmapGrid.priorities.map((p) => (
                          <th
                            key={p}
                            className="text-center p-2 font-normal whitespace-nowrap"
                          >
                            {PRIORITY_LABEL[p]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {heatmapGrid.statuses.map((s) => (
                        <tr key={s}>
                          <td className="p-2 text-[#002845] font-medium whitespace-nowrap">
                            {STATUS_LABEL[s] || s}
                          </td>
                          {heatmapGrid.priorities.map((p) => {
                            const n = heatmapGrid.map[s]?.[p] || 0;
                            return (
                              <td key={p} className="p-1">
                                <HeatCell count={n} priority={p} />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </section>

          {/* ── Oldest pending complaints ─────────────────────────────── */}
          <section>
            <Panel icon={Clock} title="أقدم الشكاوى المعلّقة">
              {data.bottlenecks.oldest_pending_complaints.length === 0 ? (
                <EmptyLine text="لا توجد شكاوى معلّقة." />
              ) : (
                <ul className="divide-y divide-[#F1ECE0]">
                  {data.bottlenecks.oldest_pending_complaints.map((c) => (
                    <li
                      key={c.id}
                      className="py-3 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <span
                          className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${
                            PRI_DOT[c.priority] || PRI_DOT.medium
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="text-sm text-[#002845] font-medium truncate">
                            <span className="text-slate-400">#{c.id}</span>{" "}
                            {c.subject || "بدون عنوان"}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {ROLE_LABEL[c.auto_assigned_role] ||
                              c.auto_assigned_role ||
                              "غير موجّه"}
                            <span className="mx-1.5 text-slate-300">·</span>
                            مفتوحة منذ {Math.round(c.hours_open)} ساعة
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full border ${
                          PRI_PILL[c.priority] || PRI_PILL.medium
                        }`}
                      >
                        {PRIORITY_LABEL[c.priority] || c.priority || "متوسط"}
                      </span>
                      <Link
                        href={`/add-listing/admin/customer-service?complaint=${c.id}`}
                        className="text-xs text-[#9A7D28] hover:underline inline-flex items-center gap-1"
                      >
                        فتح <ArrowUpRight className="w-3 h-3" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </section>
        </>
      )}
    </div>
  );
}

// ─── Visual primitives ─────────────────────────────────────────────────────
function SectionTitle({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-1.5 h-6 rounded-full bg-[#D4AF37]" />
      <h2 className="text-base md:text-lg font-bold text-[#002845]">{title}</h2>
      <div className="flex-1 h-px bg-[#EDE6D6]" />
    </div>
  );
}

function Panel({
  icon: Icon,
  title,
  cta,
  children,
}: {
  icon: typeof Crown;
  title: string;
  cta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-[#EDE6D6] bg-white p-5 md:p-6">
      <header className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-[#002845] flex items-center gap-2">
          <Icon className="w-4 h-4 text-[#D4AF37]" />
          {title}
        </h3>
        {cta}
      </header>
      {children}
    </section>
  );
}

type KpiTone = "normal" | "attention" | "urgent";

// Threshold helper — keeps the call sites readable.
function toneByCount(n: number, attentionAt: number, urgentAt: number): KpiTone {
  if (n >= urgentAt) return "urgent";
  if (n >= attentionAt) return "attention";
  return "normal";
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  href,
  tone = "normal",
}: {
  icon: typeof Crown;
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
  tone?: KpiTone;
}) {
  // Three visual states. Urgent screams (rose chrome + ring + pulse dot),
  // attention nudges (amber accent), normal is calm gold-on-paper.
  const chrome =
    tone === "urgent"
      ? "border-rose-300 bg-rose-50 ring-2 ring-rose-200 shadow-[0_0_0_4px_rgba(244,63,94,0.05)] hover:border-rose-400"
      : tone === "attention"
        ? "border-amber-200 bg-amber-50/60 hover:border-amber-300"
        : "border-[#EDE6D6] bg-white hover:border-[#D4AF37]/50 hover:shadow-[0_1px_24px_-12px_rgba(212,175,55,0.4)]";

  const iconColor =
    tone === "urgent"
      ? "text-rose-600"
      : tone === "attention"
        ? "text-amber-600"
        : "text-[#D4AF37]";

  const numberColor =
    tone === "urgent"
      ? "text-rose-700"
      : tone === "attention"
        ? "text-amber-800"
        : "text-[#002845]";

  const inner = (
    <div
      className={`group relative h-full rounded-2xl border bg-white p-4 md:p-5 transition ${chrome}`}
    >
      {tone === "urgent" && (
        <span
          className="absolute top-3 left-3 w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse ring-4 ring-rose-100"
          aria-label="عاجل"
        />
      )}
      <div className="flex items-start justify-between mb-3">
        <Icon className={`w-5 h-5 ${iconColor}`} />
        {href && tone !== "urgent" && (
          <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-[#D4AF37] transition" />
        )}
      </div>
      <p
        className={`text-2xl md:text-3xl font-black leading-none tabular-nums ${numberColor}`}
      >
        {value}
      </p>
      <p
        className={`text-sm font-semibold mt-3 ${
          tone === "urgent" ? "text-rose-900" : "text-[#002845]"
        }`}
      >
        {label}
      </p>
      {sub && (
        <p
          className={`text-xs mt-1 ${
            tone === "urgent" ? "text-rose-700" : "text-slate-500"
          }`}
        >
          {sub}
        </p>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function HeatCell({ count, priority }: { count: number; priority: string }) {
  if (count === 0) {
    return (
      <div className="rounded-lg text-center py-2 text-slate-300 bg-[#FAF8F4] border border-transparent text-xs">
        —
      </div>
    );
  }
  // Single hue per priority — intensity by row count instead of mixing tones.
  const hue =
    priority === "urgent"
      ? { bg: "bg-rose-500", text: "text-white", border: "border-rose-600" }
      : priority === "high"
        ? { bg: "bg-amber-400", text: "text-amber-900", border: "border-amber-500" }
        : priority === "medium"
          ? { bg: "bg-[#D4AF37]/30", text: "text-[#9A7D28]", border: "border-[#D4AF37]/40" }
          : { bg: "bg-slate-200", text: "text-slate-700", border: "border-slate-300" };
  const intensity = Math.min(1, count / 10);
  return (
    <div
      className={`rounded-lg text-center py-2 font-bold border tabular-nums text-sm ${hue.bg} ${hue.text} ${hue.border}`}
      style={{ opacity: 0.55 + intensity * 0.45 }}
    >
      {count}
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="text-sm text-slate-400 py-6 text-center">{text}</p>;
}

function formatMoney(n: number): string {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}م`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}ك`;
  return String(Math.round(n));
}
