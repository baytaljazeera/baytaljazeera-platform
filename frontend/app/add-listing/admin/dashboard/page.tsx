"use client";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────
// Operations Command Center  (v5 — SLA-driven, auto-refreshing).
//
// At 8 AM, this page answers ONE question in 5 seconds:
//     "Where is the problem RIGHT NOW?"
//
// What changed from v4:
//   • Hero Intervention Bar and Platform Health Strip are FUSED
//     into a single command panel — the eye lands on one block
//     with the total number on the left and the 4 traffic-lights
//     on the right. No section break between them.
//   • Health is now computed by SLA AGE, not by volume. A single
//     refund stuck for 26 hours outranks 5 fresh ones.
//       age >= 24h    → bad   (red, pulsing)
//       age >= 6h     → warn  (orange)
//       0 / fresh     → ok    (green)
//   • Page polls the API every 30 seconds. Operators no longer
//     need to press refresh.
//   • Section gaps tightened mb-8 → mb-4 / mb-5 so the page feels
//     dense, not prototype-y.
//   • KPI strip (revenue / users / subscriptions / listings /
//     elite slots) MOVED OUT entirely to /admin/executive — those
//     are reference numbers for the CFO, not work items.
//   • Recent Activity now anchors mid-page.
//
// Semantic color law, applied uniformly across the page:
//   🔴 bad   = past SLA / stuck (≥24h)
//   🟠 warn  = needs action / aging (6–24h)
//   🟢 ok    = clean / done
//   🔵 info  = informational (activity feed icons)
//   🟡 gold  = brand / CTA only (never used for state)
//   ⚪ neutral = passive numbers, archives
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from "react";
import {
  AlertCircle, Headset, Wallet, Building2, MessageSquare, RefreshCw,
  FileText, CreditCard, Crown, ArrowLeft, ChevronLeft,
  Activity, CheckCircle2, AlertTriangle, BarChart3,
} from "lucide-react";
import {
  BJPageShell, BJPageHeader, BJButton, BJCard, BJBadge,
  BJAttentionCard, BJEmptyState, BJSectionHeader,
  BJSkeletonStat,
} from "@/components/admin/ui";
import Link from "next/link";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://baytaljazeera-backend.onrender.com";

const BUILD_TAG = "2026-06-02/v5-sla-driven";
const REFRESH_MS = 30_000;  // auto-refresh cadence — 30 seconds

// ─── types ──────────────────────────────────────────────────────
interface AreaAges {
  listings: number | null;
  reports: number | null;
  refunds: number | null;
  refundsInProgress: number | null;
  complaints: number | null;
  support: number | null;
  financeInbox: number | null;
  executiveInbox: number | null;
}

interface PendingCounts {
  listingsNew: number; listingsInProgress: number;
  reportsNew: number; reportsInProgress: number;
  membershipNew: number; membershipInProgress: number;
  refundsNew: number; refundsInProgress: number;
  messagesNew: number;
  complaintsNew: number; complaintsInProgress: number;
  supportNew: number; supportInProgress: number;
  ambassadorPending: number; ambassadorWithdrawals: number;
  financeInboxNew: number;
  executiveInboxNew: number;
  ages?: Partial<AreaAges>;
}

interface ActivityItem { id: string; type: string; text: string; time: string }

// ─── helpers ────────────────────────────────────────────────────
const EMPTY_AGES: AreaAges = {
  listings: null, reports: null, refunds: null, refundsInProgress: null,
  complaints: null, support: null, financeInbox: null, executiveInbox: null,
};

const EMPTY_COUNTS: PendingCounts = {
  listingsNew: 0, listingsInProgress: 0,
  reportsNew: 0, reportsInProgress: 0,
  membershipNew: 0, membershipInProgress: 0,
  refundsNew: 0, refundsInProgress: 0,
  messagesNew: 0,
  complaintsNew: 0, complaintsInProgress: 0,
  supportNew: 0, supportInProgress: 0,
  ambassadorPending: 0, ambassadorWithdrawals: 0,
  financeInboxNew: 0,
  executiveInboxNew: 0,
  ages: EMPTY_AGES,
};

function timeAgo(iso: string): string {
  if (!iso) return "الآن";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `قبل ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${h} ساعة`;
  const d = Math.floor(h / 24);
  return `قبل ${d} يوم`;
}

function ageBadge(hours: number | null | undefined): string | null {
  if (hours == null || hours <= 0) return null;
  if (hours < 1) return "أقل من ساعة";
  if (hours < 24) return `أقدم منذ ${Math.round(hours)} ساعة`;
  return `أقدم منذ ${Math.floor(hours / 24)} يوم`;
}

// Health = max severity across (count > 0 ? severity_by_age : ok).
//   - empty queue            → ok
//   - oldest >= 24h          → bad
//   - oldest >= 6h           → warn
//   - oldest < 6h but exists → warn (anything pending deserves a soft flag)
type Health = "ok" | "warn" | "bad";

function healthFor(count: number, ageHours: number | null | undefined): Health {
  if (!count || count <= 0) return "ok";
  const age = ageHours ?? 0;
  if (age >= 24) return "bad";
  if (age >= 6)  return "warn";
  return "warn";
}

// Combine multiple sub-area healths into a single area health.
// Used for "Refunds" area which covers both `refunds_new` and
// `refunds_in_progress`.
function combineHealth(a: Health, b: Health): Health {
  if (a === "bad"  || b === "bad")  return "bad";
  if (a === "warn" || b === "warn") return "warn";
  return "ok";
}

const HEALTH_LABEL: Record<Health, string> = {
  ok:   "طبيعي",
  warn: "يحتاج متابعة",
  bad:  "حرج / متأخر",
};

// ─────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [counts, setCounts] = useState<PendingCounts>(EMPTY_COUNTS);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  // Delta tracker: how the total changed since the previous fetch.
  const [delta, setDelta] = useState<number | null>(null);
  const prevTotalRef = useRef<number | null>(null);

  const fetchAll = async (isAuto = false) => {
    if (!isAuto) setLoading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const init: RequestInit = { credentials: "include", headers };

      const [countsRes, notificationsRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/pending-counts`, init),
        fetch(`${API_URL}/api/notifications/recent`, init),
      ]);

      if (countsRes.ok) {
        const data = await countsRes.json();
        setCounts({
          ...EMPTY_COUNTS,
          ...data,
          ages: { ...EMPTY_AGES, ...(data.ages || {}) },
        });
      }

      if (notificationsRes.ok) {
        const data = await notificationsRes.json();
        setActivities(
          (data.notifications || []).slice(0, 8).map(
            (n: { id?: string | number; type?: string; title?: string; body?: string; created_at?: string }, i: number) => ({
              id: String(n.id ?? i),
              type: n.type || "general",
              text: n.title || n.body || "نشاط جديد",
              time: timeAgo(n.created_at || ""),
            })
          )
        );
      }

      setLastUpdate(new Date().toLocaleTimeString("ar-SA"));
    } catch (e) {
      console.error("[dashboard] fetch failed", e);
    } finally {
      if (!isAuto) setLoading(false);
    }
  };

  // Initial fetch + 30s auto-refresh. Tab visibility-aware: we don't
  // poll a hidden tab (saves backend cycles and avoids stale toasts
  // when the operator returns hours later).
  useEffect(() => {
    void fetchAll();
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => void fetchAll(true), REFRESH_MS);
    };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

    start();
    const onVis = () => (document.visibilityState === "visible" ? start() : stop());
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  // ── Attention items ─────────────────────────────────────────
  type AttnTone = "bad" | "warn" | "info";
  type Attn = {
    count: number;
    label: string;
    reason: string;
    href: string;
    icon: React.ReactNode;
    tone: AttnTone;
    oldestAgeHours: number | null;
  };

  const ages = counts.ages || EMPTY_AGES;

  const attentionItems: Attn[] = [
    counts.supportNew > 0 && {
      count: counts.supportNew,
      label: "تذاكر دعم بانتظار الرد",
      reason: "عملاء بانتظار أول رد من الدعم",
      href: "/add-listing/admin/customer-service",
      icon: <Headset className="w-5 h-5" />,
      tone: "bad" as AttnTone,
      oldestAgeHours: ages.support ?? null,
    },
    counts.financeInboxNew > 0 && {
      count: counts.financeInboxNew,
      label: "في صندوق المالية",
      reason: "تذاكر محوّلة + معاملات استرداد قيد المراجعة",
      href: "/add-listing/admin/finance-inbox",
      icon: <Wallet className="w-5 h-5" />,
      tone: "bad" as AttnTone,
      oldestAgeHours: ages.financeInbox ?? null,
    },
    counts.refundsNew > 0 && {
      count: counts.refundsNew,
      label: "استرجاعات لم تتم مراجعتها",
      reason: "معاملات استرداد جديدة لم يفتحها أحد بعد",
      href: "/add-listing/admin/finance-inbox",
      icon: <CreditCard className="w-5 h-5" />,
      tone: "bad" as AttnTone,
      oldestAgeHours: ages.refunds ?? null,
    },
    counts.complaintsNew > 0 && {
      count: counts.complaintsNew,
      label: "شكاوى جديدة",
      reason: "شكاوى لم يتم مراجعتها بعد",
      href: "/add-listing/admin/customer-service",
      icon: <AlertCircle className="w-5 h-5" />,
      tone: "bad" as AttnTone,
      oldestAgeHours: ages.complaints ?? null,
    },
    counts.executiveInboxNew > 0 && {
      count: counts.executiveInboxNew,
      label: "صندوق الإدارة العليا",
      reason: "حالات تم تصعيدها إليك مباشرة",
      href: "/add-listing/admin/executive-inbox",
      icon: <Crown className="w-5 h-5" />,
      tone: "bad" as AttnTone,
      oldestAgeHours: ages.executiveInbox ?? null,
    },
    counts.listingsNew > 0 && {
      count: counts.listingsNew,
      label: "إعلانات بانتظار الموافقة",
      reason: "إعلانات جديدة تنتظر اعتمادك",
      href: "/add-listing/admin/listings",
      icon: <Building2 className="w-5 h-5" />,
      tone: "warn" as AttnTone,
      oldestAgeHours: ages.listings ?? null,
    },
    counts.reportsNew > 0 && {
      count: counts.reportsNew,
      label: "بلاغات إعلانات",
      reason: "بلاغات على إعلانات بانتظار المراجعة",
      href: "/add-listing/admin/reports",
      icon: <AlertCircle className="w-5 h-5" />,
      tone: "warn" as AttnTone,
      oldestAgeHours: ages.reports ?? null,
    },
  ].filter(Boolean) as Attn[];

  // ── Totals + delta ──────────────────────────────────────────
  const totalIntervention = attentionItems.reduce((s, x) => s + x.count, 0);

  useEffect(() => {
    if (loading) return;
    if (prevTotalRef.current == null) {
      prevTotalRef.current = totalIntervention;
      setDelta(null);
      return;
    }
    const d = totalIntervention - prevTotalRef.current;
    if (d !== 0) setDelta(d);
    prevTotalRef.current = totalIntervention;
    // Hint clears after a few seconds — it's a "since last poll" signal,
    // not a permanent annotation.
    if (d !== 0) {
      const t = setTimeout(() => setDelta(null), 8000);
      return () => clearTimeout(t);
    }
  }, [totalIntervention, loading]);

  // Hero severity: derived from the worst age across critical areas.
  const criticalAges = [
    ages.support, ages.financeInbox, ages.refunds, ages.complaints, ages.executiveInbox,
  ].filter((x): x is number => typeof x === "number" && x > 0);
  const worstCriticalAge = criticalAges.length ? Math.max(...criticalAges) : 0;
  const heroTone: "bad" | "warn" | "ok" =
    totalIntervention === 0 ? "ok"
    : worstCriticalAge >= 24 ? "bad"
    : attentionItems.some(x => x.tone === "bad") ? "warn"
    : "warn";

  // Platform-area health (4 traffic lights) — driven by SLA age, not volume.
  const healthAreas = [
    {
      label: "الدعم",
      icon: <Headset className="w-4 h-4" />,
      health: healthFor(counts.supportNew, ages.support),
      detail: counts.supportNew > 0
        ? `${counts.supportNew} جديد${ageBadge(ages.support) ? ` · ${ageBadge(ages.support)}` : ""}`
        : "كل التذاكر تحت السيطرة",
      href: "/add-listing/admin/customer-service",
    },
    {
      label: "المالية",
      icon: <Wallet className="w-4 h-4" />,
      health: healthFor(counts.financeInboxNew, ages.financeInbox),
      detail: counts.financeInboxNew > 0
        ? `${counts.financeInboxNew} في الصندوق${ageBadge(ages.financeInbox) ? ` · ${ageBadge(ages.financeInbox)}` : ""}`
        : "الصندوق نظيف",
      href: "/add-listing/admin/finance-inbox",
    },
    {
      label: "الاسترجاعات",
      icon: <CreditCard className="w-4 h-4" />,
      health: combineHealth(
        healthFor(counts.refundsNew, ages.refunds),
        healthFor(counts.refundsInProgress, ages.refundsInProgress),
      ),
      detail: (counts.refundsNew + counts.refundsInProgress) > 0
        ? `${counts.refundsNew} جديد · ${counts.refundsInProgress} قيد العمل${
            ageBadge(ages.refunds ?? ages.refundsInProgress) ? ` · ${ageBadge(ages.refunds ?? ages.refundsInProgress)}` : ""
          }`
        : "لا استرجاعات معلّقة",
      href: "/add-listing/admin/finance-inbox",
    },
    {
      label: "الإعلانات",
      icon: <Building2 className="w-4 h-4" />,
      health: healthFor(counts.listingsNew, ages.listings),
      detail: counts.listingsNew + counts.listingsInProgress > 0
        ? `${counts.listingsNew} جديد · ${counts.listingsInProgress} قيد العمل${
            ageBadge(ages.listings) ? ` · ${ageBadge(ages.listings)}` : ""
          }`
        : "لا إعلانات بانتظار الموافقة",
      href: "/add-listing/admin/listings",
    },
  ];

  // ─── render ────────────────────────────────────────────────────
  return (
    <BJPageShell>
      <BJPageHeader
        title="مركز التشغيل"
        subtitle="ماذا يحتاج تدخّلك الآن؟ — الإجابة في أول 5 ثوان."
        meta={
          <>
            {lastUpdate && (
              <BJBadge tone="neutral" size="sm">
                آخر تحديث: {lastUpdate} · تلقائي كل 30 ث
              </BJBadge>
            )}
            <BJBadge tone="gold" size="sm">إصدار {BUILD_TAG}</BJBadge>
          </>
        }
        actions={
          <>
            <Link href="/add-listing/admin/executive">
              <BJButton variant="ghost" leadingIcon={<BarChart3 className="w-4 h-4" />}>
                الأرقام التنفيذية
              </BJButton>
            </Link>
            <BJButton
              variant="secondary"
              leadingIcon={<RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />}
              onClick={() => void fetchAll()}
              loading={loading}
            >
              تحديث
            </BJButton>
          </>
        }
      />

      {/* ═══════════════════════════════════════════════════════════
          1+2 FUSED: Command Panel
          Hero number on the left, traffic-lights on the right.
          Single visual unit — the eye lands here and gets the whole
          story before moving on.
          ═══════════════════════════════════════════════════════════ */}
      <section className="mb-5">
        <CommandPanel
          total={totalIntervention}
          tone={heroTone}
          worstAge={worstCriticalAge}
          delta={delta}
          items={attentionItems}
          areas={healthAreas}
          loading={loading}
        />
      </section>

      {/* ═══════════════════════════════════════════════════════════
          3. ATTENTION GRID (drill-in)
          ═══════════════════════════════════════════════════════════ */}
      <section className="mb-5">
        <BJSectionHeader
          title="قوائم التدخل"
          hint="ادخل أي بطاقة لإنجاز الإجراء المطلوب — الأقدم أولاً، الحمراء النابضة هي الأعجل."
        />
        {loading && attentionItems.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {[0,1,2,3].map(i => (
              <BJCard key={i} padding="md"><BJSkeletonStat /></BJCard>
            ))}
          </div>
        ) : attentionItems.length === 0 ? (
          <BJCard padding="lg" className="border-ok/30 bg-ok-soft/40">
            <BJEmptyState
              compact
              icon={<CheckCircle2 className="w-6 h-6 text-ok" />}
              title="كل القوائم نظيفة"
              body="لا توجد عناصر بانتظار تدخّلك. تابع النشاط أدناه."
            />
          </BJCard>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
            {attentionItems.slice(0, 8).map((item, i) => (
              <BJAttentionCard
                key={i}
                count={item.count}
                label={item.label}
                reason={item.reason}
                href={item.href}
                icon={item.icon}
                tone={item.tone}
                oldestAgeHours={item.oldestAgeHours ?? undefined}
              />
            ))}
          </div>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════════
          4. RECENT ACTIVITY + QUICK LINKS
          ═══════════════════════════════════════════════════════════ */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <BJCard padding="lg" className="lg:col-span-2">
          <BJSectionHeader
            title="آخر النشاط"
            hint="آخر 8 إشعارات / إجراءات على المنصة."
            action={
              <Link href="/add-listing/admin/notifications">
                <BJButton variant="ghost" size="sm" trailingIcon={<ChevronLeft className="w-4 h-4" />}>
                  عرض الكل
                </BJButton>
              </Link>
            }
          />
          {loading && activities.length === 0 ? (
            <ul className="space-y-3">
              {[0,1,2,3,4].map(i => (
                <li key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-bj-md bg-brand-paper-2 animate-pulse" />
                  <div className="flex-1 h-3 rounded-bj-sm bg-brand-paper-2 animate-pulse" />
                </li>
              ))}
            </ul>
          ) : activities.length === 0 ? (
            <BJEmptyState
              compact
              icon={<FileText className="w-6 h-6" />}
              title="لا توجد إشعارات"
              body="عند حدوث أي نشاط على المنصة سيظهر هنا."
            />
          ) : (
            <ul className="divide-y divide-brand-line">
              {activities.map(a => (
                <li key={a.id} className="py-2.5 flex items-start gap-3">
                  <div className="shrink-0 w-8 h-8 rounded-bj-md bg-info-soft text-info flex items-center justify-center ring-1 ring-info/20">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="bj-body line-clamp-2">{a.text}</p>
                    <p className="bj-meta mt-0.5">{a.time}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </BJCard>

        <BJCard padding="lg">
          <BJSectionHeader title="روابط سريعة" hint="ادخل أكثر الصفحات استخداماً بنقرة واحدة." />
          <ul className="space-y-1.5">
            {[
              { label: "صندوق الدعم",       href: "/add-listing/admin/customer-service", icon: <Headset className="w-4 h-4" /> },
              { label: "صندوق المالية",      href: "/add-listing/admin/finance-inbox",     icon: <Wallet className="w-4 h-4" /> },
              { label: "موافقات الإعلانات",  href: "/add-listing/admin/listings",           icon: <Building2 className="w-4 h-4" /> },
              { label: "الأرقام التنفيذية",  href: "/add-listing/admin/executive",          icon: <BarChart3 className="w-4 h-4" /> },
              { label: "الإشعارات",         href: "/add-listing/admin/notifications",      icon: <MessageSquare className="w-4 h-4" /> },
            ].map(link => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-bj-md hover:bg-brand-paper-2 transition-colors focus-visible:outline-none focus-visible:shadow-focus-gold"
                >
                  <span className="inline-flex items-center gap-2 text-brand-royal font-bold">
                    <span className="w-8 h-8 rounded-bj-md bg-brand-paper-2 flex items-center justify-center text-brand-royal">
                      {link.icon}
                    </span>
                    {link.label}
                  </span>
                  <ArrowLeft className="w-4 h-4 text-brand-ink-2" />
                </Link>
              </li>
            ))}
          </ul>
        </BJCard>
      </section>
    </BJPageShell>
  );
}

// ─────────────────────────────────────────────────────────────────
// Command Panel — fuses the Hero intervention bar with the
// platform-health traffic lights into one block. This is the
// page's center of gravity.
// ─────────────────────────────────────────────────────────────────
type AreaForPanel = {
  label: string;
  icon: React.ReactNode;
  health: Health;
  detail: string;
  href: string;
};

function CommandPanel({
  total,
  tone,
  worstAge,
  delta,
  items,
  areas,
  loading,
}: {
  total: number;
  tone: "bad" | "warn" | "ok";
  worstAge: number;
  delta: number | null;
  items: { count: number; label: string; href: string; tone: "bad" | "warn" | "info" }[];
  areas: AreaForPanel[];
  loading: boolean;
}) {
  const palette: Record<"bad" | "warn" | "ok", {
    bg: string; ring: string; text: string; icon: React.ReactNode; headline: string;
  }> = {
    bad: {
      bg: "bg-bad-soft", ring: "ring-bad/40", text: "text-bad",
      icon: <AlertTriangle className="w-7 h-7" />,
      headline: "يحتاج تدخّلك الآن",
    },
    warn: {
      bg: "bg-warn-soft", ring: "ring-warn/40", text: "text-warn",
      icon: <AlertCircle className="w-7 h-7" />,
      headline: "بعض القوائم تنتظر إجراء",
    },
    ok: {
      bg: "bg-ok-soft", ring: "ring-ok/30", text: "text-ok",
      icon: <CheckCircle2 className="w-7 h-7" />,
      headline: "كل شيء تحت السيطرة",
    },
  };
  const p = palette[tone];

  if (loading && total === 0) {
    return (
      <BJCard padding="lg" className="ring-1 ring-brand-line">
        <div className="h-32 animate-pulse rounded-bj-md bg-brand-paper-2" />
      </BJCard>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-bj-xl ring-1 ${p.ring} ${p.bg} shadow-card`}>
      {/* Top row: Hero (left) + Per-area chips (right) */}
      <div className="flex flex-col lg:flex-row gap-5 p-5 sm:p-6">
        {/* Hero */}
        <div className="flex items-center gap-4 lg:min-w-[340px]">
          <div className={`shrink-0 w-14 h-14 rounded-bj-lg bg-white ${p.text} flex items-center justify-center shadow-card ${tone === "bad" ? "animate-[pulse_2s_ease-in-out_infinite]" : ""}`}>
            {p.icon}
          </div>
          <div className="min-w-0">
            <div className={`text-[12px] font-bold uppercase tracking-wider ${p.text}`}>
              {p.headline}
            </div>
            <div className="flex items-baseline gap-3 mt-1">
              <div className={`bj-display ${p.text} leading-none`}>{total}</div>
              {delta != null && delta !== 0 && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ring-1 ${
                    delta > 0
                      ? "bg-bad/10 text-bad ring-bad/30"
                      : "bg-ok/10 text-ok ring-ok/30"
                  }`}
                  aria-label="تغيّر منذ آخر تحديث"
                >
                  {delta > 0 ? `+${delta}` : delta}
                </span>
              )}
            </div>
            <div className="bj-meta mt-1">
              {total === 0
                ? "لا توجد عناصر تنتظر تدخّلك في هذه اللحظة."
                : worstAge >= 24
                ? `أقدم عنصر حرج عمره ${Math.floor(worstAge / 24)} يوم وأكثر — يجب الفتح فوراً.`
                : worstAge >= 1
                ? `أقدم عنصر منذ ${Math.round(worstAge)} ساعة — اضغط أيّ شريحة للذهاب مباشرة.`
                : "عناصر جديدة وصلت — لا يزال الوقت مبكراً."}
            </div>
          </div>
        </div>

        {/* Per-area breakdown chips — only items > 0 */}
        {items.length > 0 && (
          <div className="flex flex-wrap gap-2 lg:ms-auto lg:items-start lg:justify-end">
            {items.slice(0, 6).map((it, i) => (
              <Link
                key={i}
                href={it.href}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-bj-md bg-white ring-1 ring-black/5 shadow-card hover:shadow-pop transition-shadow"
              >
                <span className={`inline-block w-2 h-2 rounded-full ${it.tone === "bad" ? "bg-bad" : it.tone === "warn" ? "bg-warn" : "bg-info"}`} />
                <span className="text-[12px] font-bold text-brand-royal">{it.count}</span>
                <span className="text-[12px] text-brand-ink">{it.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Divider that visually fuses the two regions */}
      <div className="border-t border-white/60 bg-white/30">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 p-3 sm:p-4">
          {areas.map((area, i) => (
            <HealthMini key={i} {...area} />
          ))}
        </div>
      </div>
    </div>
  );
}

// Compact health row — used inside the Command Panel.
function HealthMini({
  label,
  icon,
  health,
  detail,
  href,
}: AreaForPanel) {
  const map: Record<Health, { dot: string; text: string }> = {
    ok:   { dot: "bg-ok",   text: "text-ok"   },
    warn: { dot: "bg-warn", text: "text-warn" },
    bad:  { dot: "bg-bad",  text: "text-bad"  },
  };
  const c = map[health];

  return (
    <Link
      href={href}
      className="group flex items-center gap-2.5 rounded-bj-md bg-white/85 ring-1 ring-black/5 px-3 py-2 hover:bg-white transition-colors"
    >
      <span className="shrink-0 w-8 h-8 rounded-bj-md bg-brand-paper-2 text-brand-royal flex items-center justify-center">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${c.dot} ${health === "bad" ? "animate-[pulse_2s_ease-in-out_infinite]" : ""}`} />
          <span className="text-[13px] font-bold text-brand-royal truncate">{label}</span>
          <span className={`text-[11px] ms-auto ${c.text} font-bold`}>{HEALTH_LABEL[health]}</span>
        </div>
        <div className="text-[11px] text-brand-ink-2 mt-0.5 truncate">{detail}</div>
      </div>
    </Link>
  );
}
