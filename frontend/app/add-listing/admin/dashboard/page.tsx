"use client";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────
// Operations Command Center.
//
// The page is built around ONE question, asked at 8 AM:
//     "Where is the problem RIGHT NOW?"
//
// Layout (top → bottom, by operational urgency):
//
//   1. HERO INTERVENTION BAR  — total items needing intervention.
//                                Red if anything overdue, orange
//                                otherwise. Per-area chips. This
//                                dominates the fold.
//   2. PLATFORM HEALTH STRIP   — 4 traffic-light chips:
//                                Support / Finance / Refunds / Listings
//                                Operator can see overall health
//                                without reading any number.
//   3. ATTENTION GRID          — same data, deeper drill-in. Strict
//                                color semantics (bad/warn/ok/info).
//   4. RECENT ACTIVITY         — promoted to mid-page (daily ops
//                                reads this constantly).
//   5. KPI STRIP               — demoted to the bottom. Revenue,
//                                listings, users — these are
//                                reference numbers, not work items.
//                                Stay calm and white.
//
// Semantic color law (applies to every state-bearing element):
//   🔴 bad   = overdue / stuck / past SLA
//   🟠 warn  = needs action
//   🟢 ok    = clean / done
//   🔵 info  = informational
//   🟡 gold  = brand / CTA (never used to signal state)
//   ⚪ neutral = passive numbers, archives
//
// Backend contracts unchanged — only the rendering layer was
// reshuffled and re-prioritised.
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import {
  AlertCircle, Headset, Wallet, Building2, MessageSquare, RefreshCw,
  FileText, Users, CreditCard, Crown, Sparkles, ArrowLeft, ChevronLeft,
  Activity, CheckCircle2, AlertTriangle,
} from "lucide-react";
import {
  BJPageShell, BJPageHeader, BJButton, BJCard, BJBadge,
  BJStatCard, BJAttentionCard, BJEmptyState, BJSectionHeader,
  BJSkeletonStat,
} from "@/components/admin/ui";
import Link from "next/link";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://baytaljazeera-backend.onrender.com";

const BUILD_TAG = "2026-06-02/v4-command-center";

// ─── types ──────────────────────────────────────────────────────
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
}

interface DashboardKpis {
  totalListings: number;
  activeUsers: number;
  pendingListings: number;
}

interface AdvancedStats {
  listings:      { total: number; approved: number; pending: number; new_this_week: number; new_this_month: number };
  elite:         { active_slots: number; pending_approval: number; pending_payment: number; unique_properties: number };
  subscriptions: { total_subscriptions: number; active: number; business: number; premium: number; basic: number };
  revenue:       { total_revenue: number; this_month: number; this_week: number; total_transactions: number };
}

interface ActivityItem { id: string; type: string; text: string; time: string }

// ─── helpers ────────────────────────────────────────────────────
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
};

function fmtSAR(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("ar-SA", {
    style: "currency", currency: "SAR", maximumFractionDigits: 0,
  }).format(n);
}

function fmtNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 0 }).format(n);
}

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

// Platform-area health, derived from raw counts. Thresholds are
// deliberately conservative — operators want early warnings, not
// false comfort.
//   0 items                → ok    (green)
//   1–5 items              → warn  (orange)
//   6+ items OR refund 24h → bad   (red)
type Health = "ok" | "warn" | "bad";

function healthOf(newCount: number, inProgressCount: number = 0, hardCritical = false): Health {
  if (hardCritical) return "bad";
  const total = newCount + inProgressCount;
  if (total === 0) return "ok";
  if (newCount >= 6 || total >= 12) return "bad";
  return "warn";
}

const HEALTH_LABEL: Record<Health, string> = {
  ok:   "طبيعي",
  warn: "يحتاج متابعة",
  bad:  "حرج / متأخر",
};

// ─────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [counts, setCounts] = useState<PendingCounts>(EMPTY_COUNTS);
  const [kpis, setKpis] = useState<DashboardKpis>({ totalListings: 0, activeUsers: 0, pendingListings: 0 });
  const [advanced, setAdvanced] = useState<AdvancedStats | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>("");

  const fetchAll = async () => {
    setLoading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const init: RequestInit = { credentials: "include", headers };

      const [countsRes, listingsRes, usersRes, notificationsRes, advancedRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/pending-counts`, init),
        fetch(`${API_URL}/api/admin/listings/stats`, init),
        fetch(`${API_URL}/api/admin/users/stats`, init),
        fetch(`${API_URL}/api/notifications/recent`, init),
        fetch(`${API_URL}/api/admin/dashboard/advanced-stats`, init),
      ]);

      if (countsRes.ok) {
        const data = await countsRes.json();
        setCounts({ ...EMPTY_COUNTS, ...data });
      }

      let totalListings = 0, pendingListings = 0;
      if (listingsRes.ok) {
        const data = await listingsRes.json();
        totalListings  = Number(data.total)   || 0;
        pendingListings = Number(data.pending) || 0;
      }

      let activeUsers = 0;
      if (usersRes.ok) {
        const data = await usersRes.json();
        activeUsers = Number(data.total) || Number(data.active) || 0;
      }
      setKpis({ totalListings, activeUsers, pendingListings });

      if (advancedRes.ok) setAdvanced(await advancedRes.json());

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
      setLoading(false);
    }
  };

  useEffect(() => { void fetchAll(); }, []);

  // ── Attention items ─────────────────────────────────────────
  type AttnTone = "bad" | "warn" | "info";
  type Attn = {
    count: number;
    label: string;
    reason: string;
    href: string;
    icon: React.ReactNode;
    tone: AttnTone;
  };

  // Refunds get a "bad" tone — finance overdue is the worst kind of
  // backlog (customer waiting on money). Support gets "bad" too if
  // there's any new ticket because first response SLA matters.
  // Listings / executive inbox / reports are "warn" — important but
  // not customer-blocking.
  const attentionItems: Attn[] = [
    counts.supportNew > 0 && {
      count: counts.supportNew,
      label: "تذاكر دعم بانتظار الرد",
      reason: "عملاء بانتظار أول رد من الدعم",
      href: "/add-listing/admin/customer-service",
      icon: <Headset className="w-5 h-5" />,
      tone: "bad" as AttnTone,
    },
    counts.financeInboxNew > 0 && {
      count: counts.financeInboxNew,
      label: "في صندوق المالية",
      reason: "تذاكر محوّلة + معاملات استرداد قيد المراجعة",
      href: "/add-listing/admin/finance-inbox",
      icon: <Wallet className="w-5 h-5" />,
      tone: "bad" as AttnTone,
    },
    counts.refundsNew > 0 && {
      count: counts.refundsNew,
      label: "استرجاعات لم تتم مراجعتها",
      reason: "معاملات استرداد جديدة لم يفتحها أحد بعد",
      href: "/add-listing/admin/finance-inbox",
      icon: <CreditCard className="w-5 h-5" />,
      tone: "bad" as AttnTone,
    },
    counts.complaintsNew > 0 && {
      count: counts.complaintsNew,
      label: "شكاوى جديدة",
      reason: "شكاوى لم يتم مراجعتها بعد",
      href: "/add-listing/admin/customer-service",
      icon: <AlertCircle className="w-5 h-5" />,
      tone: "bad" as AttnTone,
    },
    counts.executiveInboxNew > 0 && {
      count: counts.executiveInboxNew,
      label: "صندوق الإدارة العليا",
      reason: "حالات تم تصعيدها إليك مباشرة",
      href: "/add-listing/admin/executive-inbox",
      icon: <Crown className="w-5 h-5" />,
      tone: "bad" as AttnTone,
    },
    counts.listingsNew > 0 && {
      count: counts.listingsNew,
      label: "إعلانات بانتظار الموافقة",
      reason: "إعلانات جديدة تنتظر اعتمادك",
      href: "/add-listing/admin/listings",
      icon: <Building2 className="w-5 h-5" />,
      tone: "warn" as AttnTone,
    },
    counts.reportsNew > 0 && {
      count: counts.reportsNew,
      label: "بلاغات إعلانات",
      reason: "بلاغات على إعلانات بانتظار المراجعة",
      href: "/add-listing/admin/reports",
      icon: <AlertCircle className="w-5 h-5" />,
      tone: "warn" as AttnTone,
    },
  ].filter(Boolean) as Attn[];

  // Total intervention number — the single most important figure
  // on this page. Anything > 0 means an operator's day starts here.
  const totalIntervention = attentionItems.reduce((s, x) => s + x.count, 0);
  const hasCritical       = attentionItems.some(x => x.tone === "bad");
  const heroTone: "bad" | "warn" | "ok" =
    totalIntervention === 0 ? "ok" : hasCritical ? "bad" : "warn";

  // Platform-area health (4 traffic lights)
  const healthAreas = [
    {
      label: "الدعم",
      icon: <Headset className="w-4 h-4" />,
      health: healthOf(counts.supportNew, counts.supportInProgress),
      detail: `${counts.supportNew} جديد · ${counts.supportInProgress} قيد العمل`,
      href: "/add-listing/admin/customer-service",
    },
    {
      label: "المالية",
      icon: <Wallet className="w-4 h-4" />,
      health: healthOf(counts.financeInboxNew, 0),
      detail: `${counts.financeInboxNew} في الصندوق`,
      href: "/add-listing/admin/finance-inbox",
    },
    {
      label: "الاسترجاعات",
      icon: <CreditCard className="w-4 h-4" />,
      health: healthOf(counts.refundsNew, counts.refundsInProgress, counts.refundsNew >= 3),
      detail: `${counts.refundsNew} جديد · ${counts.refundsInProgress} قيد العمل`,
      href: "/add-listing/admin/finance-inbox",
    },
    {
      label: "الإعلانات",
      icon: <Building2 className="w-4 h-4" />,
      health: healthOf(counts.listingsNew, counts.listingsInProgress),
      detail: `${counts.listingsNew} جديد · ${counts.listingsInProgress} قيد العمل`,
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
                آخر تحديث: {lastUpdate}
              </BJBadge>
            )}
            <BJBadge tone="gold" size="sm">إصدار {BUILD_TAG}</BJBadge>
          </>
        }
        actions={
          <BJButton
            variant="secondary"
            leadingIcon={<RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />}
            onClick={() => void fetchAll()}
            loading={loading}
          >
            تحديث
          </BJButton>
        }
      />

      {/* ═══════════════════════════════════════════════════════════
          1. HERO INTERVENTION BAR
          Single biggest number on the page. Red if any critical,
          orange if any warn, green if everything clean.
          ═══════════════════════════════════════════════════════════ */}
      <section className="mb-6">
        <HeroBar
          total={totalIntervention}
          tone={heroTone}
          items={attentionItems}
          loading={loading}
        />
      </section>

      {/* ═══════════════════════════════════════════════════════════
          2. PLATFORM HEALTH STRIP
          4 traffic-light chips — operator scans this in 1 second.
          ═══════════════════════════════════════════════════════════ */}
      <section className="mb-8">
        <BJSectionHeader
          title="صحة المنصة"
          hint="نظرة عامة بلون واحد لكل قسم — أخضر = طبيعي، برتقالي = متابعة، أحمر = حرج."
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {healthAreas.map((area, i) => (
            <HealthChip key={i} {...area} />
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          3. ATTENTION GRID (drill-in)
          ═══════════════════════════════════════════════════════════ */}
      <section className="mb-8">
        <BJSectionHeader
          title="قوائم التدخل"
          hint="ادخل أي بطاقة لإنجاز الإجراء المطلوب."
        />
        {loading && attentionItems.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
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
              body="لا توجد عناصر بانتظار تدخّلك. تابع النشاط أدناه أو افتح إحدى الصفحات السريعة."
            />
          </BJCard>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {attentionItems.slice(0, 8).map((item, i) => (
              <BJAttentionCard
                key={i}
                count={item.count}
                label={item.label}
                reason={item.reason}
                href={item.href}
                icon={item.icon}
                tone={item.tone}
              />
            ))}
          </div>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════════
          4. RECENT ACTIVITY + QUICK LINKS — promoted UP
          ═══════════════════════════════════════════════════════════ */}
      <section className="mb-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
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
              body="عند حدوث أي نشاط على المنصة (طلب، شكوى، إعلان جديد...) سيظهر هنا."
            />
          ) : (
            <ul className="divide-y divide-brand-line">
              {activities.map(a => (
                <li key={a.id} className="py-3 flex items-start gap-3">
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
          <ul className="space-y-2">
            {[
              { label: "صندوق الدعم",       href: "/add-listing/admin/customer-service", icon: <Headset className="w-4 h-4" /> },
              { label: "صندوق المالية",      href: "/add-listing/admin/finance-inbox",     icon: <Wallet className="w-4 h-4" /> },
              { label: "موافقات الإعلانات",  href: "/add-listing/admin/listings",           icon: <Building2 className="w-4 h-4" /> },
              { label: "التقارير المالية",   href: "/add-listing/admin/finance",            icon: <CreditCard className="w-4 h-4" /> },
              { label: "الإشعارات",         href: "/add-listing/admin/notifications",      icon: <MessageSquare className="w-4 h-4" /> },
            ].map(link => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-bj-md hover:bg-brand-paper-2 transition-colors focus-visible:outline-none focus-visible:shadow-focus-gold"
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

      {/* ═══════════════════════════════════════════════════════════
          5. KPI STRIP — demoted to the bottom (reference, not ops)
          ═══════════════════════════════════════════════════════════ */}
      <section className="mb-8">
        <BJSectionHeader
          title="الأرقام المرجعية"
          hint="إيرادات + اشتراكات + إعلانات — للقراءة بين الإجراءات، ليست عناصر تدخّل."
        />
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <BJStatCard
            label="الإيرادات الكلية"
            value={advanced ? fmtSAR(advanced.revenue.total_revenue) : "—"}
            hint={advanced ? `${fmtNumber(advanced.revenue.total_transactions)} عملية` : ""}
            icon={<Wallet className="w-5 h-5" />}
            loading={loading && !advanced}
          />
          <BJStatCard
            label="إيرادات الشهر"
            value={advanced ? fmtSAR(advanced.revenue.this_month) : "—"}
            hint={advanced ? `الأسبوع: ${fmtSAR(advanced.revenue.this_week)}` : ""}
            icon={<CreditCard className="w-5 h-5" />}
            loading={loading && !advanced}
          />
          <BJStatCard
            label="مستخدمون نشطون"
            value={fmtNumber(kpis.activeUsers)}
            icon={<Users className="w-5 h-5" />}
            href="/add-listing/admin/users"
            loading={loading && kpis.activeUsers === 0}
          />
          <BJStatCard
            label="إعلانات نشطة"
            value={advanced ? fmtNumber(advanced.listings.approved) : fmtNumber(kpis.totalListings)}
            hint={advanced ? `${fmtNumber(advanced.listings.new_this_week)} هذا الأسبوع` : ""}
            icon={<Building2 className="w-5 h-5" />}
            href="/add-listing/admin/listings"
            loading={loading && !advanced}
          />
          <BJStatCard
            label="اشتراكات نشطة"
            value={advanced ? fmtNumber(advanced.subscriptions.active) : "—"}
            hint={advanced ? `أعمال: ${advanced.subscriptions.business} · صفوة: ${advanced.subscriptions.premium}` : ""}
            icon={<Crown className="w-5 h-5" />}
            href="/add-listing/admin/finance"
            loading={loading && !advanced}
          />
          <BJStatCard
            label="مواقع النخبة الفعّالة"
            value={advanced ? fmtNumber(advanced.elite.active_slots) : "—"}
            hint={advanced ? `قيد الموافقة: ${advanced.elite.pending_approval}` : ""}
            icon={<Sparkles className="w-5 h-5" />}
            href="/add-listing/admin/elite-slots"
            loading={loading && !advanced}
          />
        </div>
      </section>
    </BJPageShell>
  );
}

// ─────────────────────────────────────────────────────────────────
// Hero Intervention Bar — the page's center of gravity.
// At 8 AM, this is the only thing an operator needs to see.
// ─────────────────────────────────────────────────────────────────
function HeroBar({
  total,
  tone,
  items,
  loading,
}: {
  total: number;
  tone: "bad" | "warn" | "ok";
  items: { count: number; label: string; href: string; tone: "bad" | "warn" | "info" }[];
  loading: boolean;
}) {
  const palette: Record<"bad" | "warn" | "ok", {
    bg: string; ring: string; text: string; chipBg: string; chipText: string; icon: React.ReactNode; headline: string;
  }> = {
    bad: {
      bg: "bg-bad-soft", ring: "ring-bad/40", text: "text-bad",
      chipBg: "bg-white", chipText: "text-bad",
      icon: <AlertTriangle className="w-7 h-7" />,
      headline: "يحتاج تدخّلك الآن",
    },
    warn: {
      bg: "bg-warn-soft", ring: "ring-warn/40", text: "text-warn",
      chipBg: "bg-white", chipText: "text-warn",
      icon: <AlertCircle className="w-7 h-7" />,
      headline: "بعض القوائم تنتظر إجراء",
    },
    ok: {
      bg: "bg-ok-soft", ring: "ring-ok/30", text: "text-ok",
      chipBg: "bg-white", chipText: "text-ok",
      icon: <CheckCircle2 className="w-7 h-7" />,
      headline: "كل شيء تحت السيطرة",
    },
  };
  const p = palette[tone];

  if (loading && total === 0) {
    return (
      <BJCard padding="lg" className="ring-1 ring-brand-line">
        <div className="h-24 animate-pulse rounded-bj-md bg-brand-paper-2" />
      </BJCard>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-bj-xl ring-1 ${p.ring} ${p.bg} p-5 sm:p-6 shadow-card`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        {/* Left: icon + big number + headline */}
        <div className="flex items-center gap-4 min-w-0">
          <div className={`shrink-0 w-14 h-14 rounded-bj-lg bg-white ${p.text} flex items-center justify-center shadow-card ${tone === "bad" ? "animate-[pulse_2s_ease-in-out_infinite]" : ""}`}>
            {p.icon}
          </div>
          <div className="min-w-0">
            <div className={`text-[12px] font-bold uppercase tracking-wider ${p.text}`}>
              {p.headline}
            </div>
            <div className={`bj-display ${p.text} mt-1 leading-none`}>
              {total}
            </div>
            <div className="bj-meta mt-1">
              {total === 0
                ? "لا توجد عناصر تنتظر تدخّلك في هذه اللحظة."
                : `إجمالي العناصر التي تنتظرك الآن — اضغط أيّ بطاقة للذهاب مباشرة.`}
            </div>
          </div>
        </div>

        {/* Right: per-area chips — operator reads the breakdown without leaving the bar */}
        {items.length > 0 && (
          <div className="flex flex-wrap gap-2 sm:ms-auto sm:justify-end">
            {items.slice(0, 6).map((it, i) => (
              <Link
                key={i}
                href={it.href}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-bj-md ${p.chipBg} ring-1 ring-black/5 shadow-card hover:shadow-pop transition-shadow`}
              >
                <span className={`inline-block w-2 h-2 rounded-full ${it.tone === "bad" ? "bg-bad" : it.tone === "warn" ? "bg-warn" : "bg-info"}`} />
                <span className="text-[12px] font-bold text-brand-royal">{it.count}</span>
                <span className="text-[12px] text-brand-ink">{it.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Health Chip — single traffic-light row per platform area.
// Operator can glance at 4 of these and read overall health
// without parsing a single number.
// ─────────────────────────────────────────────────────────────────
function HealthChip({
  label,
  icon,
  health,
  detail,
  href,
}: {
  label: string;
  icon: React.ReactNode;
  health: Health;
  detail: string;
  href: string;
}) {
  const map: Record<Health, { dot: string; ring: string; bg: string; text: string }> = {
    ok:   { dot: "bg-ok",   ring: "ring-ok/30",   bg: "bg-ok-soft",   text: "text-ok"   },
    warn: { dot: "bg-warn", ring: "ring-warn/40", bg: "bg-warn-soft", text: "text-warn" },
    bad:  { dot: "bg-bad",  ring: "ring-bad/50",  bg: "bg-bad-soft",  text: "text-bad"  },
  };
  const c = map[health];

  return (
    <Link
      href={href}
      className={`group flex items-center gap-3 rounded-bj-lg ${c.bg} ring-1 ${c.ring} px-3 py-3 shadow-card hover:shadow-pop transition-shadow`}
    >
      <span className={`shrink-0 w-9 h-9 rounded-bj-md bg-white ${c.text} flex items-center justify-center ring-1 ring-black/5`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${c.dot} ${health === "bad" ? "animate-[pulse_2s_ease-in-out_infinite]" : ""}`} />
          <span className="text-[14px] font-bold text-brand-royal">{label}</span>
        </div>
        <div className={`text-[12px] mt-0.5 ${c.text}`}>
          {HEALTH_LABEL[health]}
        </div>
        <div className="text-[11px] text-brand-ink-2 mt-0.5 truncate">{detail}</div>
      </div>
      <ArrowLeft className="w-4 h-4 text-brand-ink-2 group-hover:translate-x-[-2px] transition-transform" />
    </Link>
  );
}
