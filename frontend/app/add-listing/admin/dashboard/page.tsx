"use client";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────
// Operations Dashboard — Phase 1 redesign.
//
// Optimised for one question: "Right now, where do I need to act?"
// The page is laid out top-to-bottom by decreasing urgency:
//
//   1. PageHeader      — where am I + last-updated + refresh
//   2. ATTENTION STRIP — only the things that NEED a decision now,
//                        sized so 4 fit above the fold on a laptop.
//                        Each card is a one-click jump to its queue.
//   3. KPI STRIP       — read-only numbers the operator glances at
//                        between actions (revenue, listings, etc).
//   4. Activity + Quick links — context + jump-points for the
//                        less-urgent destinations.
//
// All data calls are unchanged from the previous dashboard so backend
// contracts stay intact. Only the rendering layer was rewritten.
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import {
  AlertCircle, Headset, Wallet, Building2, MessageSquare, RefreshCw,
  FileText, Users, CreditCard, Crown, Sparkles, ArrowLeft, ChevronLeft,
} from "lucide-react";
import {
  BJPageShell, BJPageHeader, BJButton, BJCard, BJBadge,
  BJStatCard, BJAttentionCard, BJEmptyState, BJSectionHeader,
  BJSkeletonStat,
} from "@/components/admin/ui";
import Link from "next/link";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://baytaljazeera-backend.onrender.com";

const BUILD_TAG = "2026-06-02/v3-redesign";

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

  // ── Attention items — surfaced only when count > 0 ────────────
  type Attn = {
    count: number;
    label: string;
    reason: string;
    href: string;
    icon: React.ReactNode;
  };

  const attentionItems: Attn[] = [
    counts.supportNew > 0 && {
      count: counts.supportNew,
      label: "تذاكر دعم بانتظار الرد",
      reason: "عملاء بانتظار أول رد من الدعم",
      href: "/add-listing/admin/customer-service",
      icon: <Headset className="w-5 h-5" />,
    },
    counts.financeInboxNew > 0 && {
      count: counts.financeInboxNew,
      label: "في صندوق المالية",
      reason: "تذاكر محوّلة + معاملات استرداد قيد المراجعة",
      href: "/add-listing/admin/finance-inbox",
      icon: <Wallet className="w-5 h-5" />,
    },
    counts.listingsNew > 0 && {
      count: counts.listingsNew,
      label: "إعلانات بانتظار الموافقة",
      reason: "إعلانات جديدة تنتظر اعتمادك",
      href: "/add-listing/admin/listings",
      icon: <Building2 className="w-5 h-5" />,
    },
    counts.complaintsNew > 0 && {
      count: counts.complaintsNew,
      label: "شكاوى جديدة",
      reason: "شكاوى لم يتم مراجعتها بعد",
      href: "/add-listing/admin/customer-service",
      icon: <AlertCircle className="w-5 h-5" />,
    },
    counts.executiveInboxNew > 0 && {
      count: counts.executiveInboxNew,
      label: "صندوق الإدارة العليا",
      reason: "حالات تم تصعيدها إليك مباشرة",
      href: "/add-listing/admin/executive-inbox",
      icon: <Crown className="w-5 h-5" />,
    },
    counts.reportsNew > 0 && {
      count: counts.reportsNew,
      label: "بلاغات إعلانات",
      reason: "بلاغات على إعلانات بانتظار المراجعة",
      href: "/add-listing/admin/reports",
      icon: <AlertCircle className="w-5 h-5" />,
    },
  ].filter(Boolean) as Attn[];

  return (
    <BJPageShell>
      <BJPageHeader
        title="لوحة التحكم"
        subtitle="نظرة سريعة على ما يحتاج تدخّلك الآن + أرقام اليوم."
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

      {/* ── ATTENTION STRIP — only renders if there's actually work ── */}
      <section className="mb-8">
        <BJSectionHeader
          title="يحتاج تدخّلك الآن"
          hint="مرتبة حسب الأقدم — البطاقة الحمراء النابضة هي الأعجل."
        />
        {loading && attentionItems.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[0,1,2,3].map(i => (
              <BJCard key={i} padding="md"><BJSkeletonStat /></BJCard>
            ))}
          </div>
        ) : attentionItems.length === 0 ? (
          <BJCard padding="lg">
            <BJEmptyState
              compact
              icon={<Sparkles className="w-6 h-6 text-brand-gold" />}
              title="لا توجد عناصر بانتظار تدخّلك"
              body="كل القوائم نظيفة الآن. تابع الأرقام أدناه أو افتح إحدى الصفحات السريعة."
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
                tone="warn"
              />
            ))}
          </div>
        )}
      </section>

      {/* ── KPI STRIP — read-only numbers ──────────────────────── */}
      <section className="mb-8">
        <BJSectionHeader
          title="الأرقام الأساسية"
          hint="مؤشرات يومية + شهرية للقراءة السريعة."
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

      {/* ── TWO-COLUMN: Activity + Quick Links ───────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                  <div className="shrink-0 w-8 h-8 rounded-bj-md bg-brand-gold-soft text-brand-gold-dark flex items-center justify-center ring-1 ring-brand-gold/20">
                    <MessageSquare className="w-4 h-4" />
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
    </BJPageShell>
  );
}
