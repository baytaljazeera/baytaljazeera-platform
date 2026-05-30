"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  FileText,
  Users,
  AlertCircle,
  Clock,
  RefreshCw,
  Loader2,
  Crown,
  MapPin,
  CreditCard,
  Building2,
  Wallet,
  Calendar,
  ArrowLeft,
  Moon,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { PlatformPulse } from "@/components/admin/PlatformPulse";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://baytaljazeera-backend.onrender.com";

// Stamped per build so the operator can confirm which JS bundle their
// browser actually loaded — helps when CDN/ISP caching makes a deploy
// look like it didnt land. Bumped manually with each visible change.
const BUILD_TAG = "2026-05-30/live-pulse";

// Owner reports stale chunks served by ISP/edge caches on the office
// network. This button is a nuclear option: unregister any lingering
// service workers, wipe every Cache Storage entry the page can see,
// then reload bypassing the HTTP cache.
async function hardRefreshAndReload() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {}
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {}
  try {
    localStorage.removeItem("__dashboard_build_tag");
  } catch {}
  // Cache-busting query so even an aggressive intermediate proxy can't
  // hand back the old HTML.
  const url = new URL(window.location.href);
  url.searchParams.set("_v", String(Date.now()));
  window.location.replace(url.toString());
}

// ─── Brand palette ────────────────────────────────────────────────────────────
// Single accent (gold), navy for text/structure. Status hues are reserved for
// state — they are NOT used to tint category cards.
const GOLD = "#D4AF37";
const GOLD_DEEP = "#9A7D28";
const GOLD_SOFT = "#E6C966";
const NAVY = "#002845";
const NAVY_MID = "#01456D";
const NAVY_SOFT = "#5C7A93";
const PAPER = "#FAF8F4"; // warm off-white
const HAIR = "#EDE6D6"; // subtle border on warm bg

// Chart palettes — tonal, no rainbow. Donut/bar legends inherit from these.
const SUBSCRIPTION_PALETTE = [GOLD, NAVY, NAVY_SOFT];
const CITY_PALETTE = [NAVY, NAVY_MID, GOLD_DEEP, GOLD, NAVY_SOFT, GOLD_SOFT];
const PROPERTY_PALETTE = [GOLD, NAVY, GOLD_DEEP, NAVY_MID, NAVY_SOFT];

interface DashboardStats {
  totalListings: number;
  activeUsers: number;
  newReports: number;
  pendingListings: number;
}

interface AdvancedStats {
  listings: {
    total: number;
    approved: number;
    pending: number;
    new_this_week: number;
    new_this_month: number;
  };
  elite: {
    active_slots: number;
    pending_approval: number;
    pending_payment: number;
    unique_properties: number;
  };
  cities: { city: string; count: number }[];
  subscriptions: {
    total_subscriptions: number;
    active: number;
    business: number;
    premium: number;
    basic: number;
  };
  revenue: {
    total_revenue: number;
    this_month: number;
    this_week: number;
    total_transactions: number;
  };
  weeklyListings: { day: string; count: number }[];
  propertyTypes: { property_type: string; count: number }[];
}

interface ActivityItem {
  id: string;
  type: string;
  text: string;
  time: string;
}

interface AmbassadorStats {
  active_ambassadors: number;
  pending_requests: number;
  consumptions_today: number;
  total_referrals: number;
  total_floors_consumed: number;
}

interface AmbassadorChartData {
  date: string;
  referrals: number;
  consumptions: number;
}

// Owner asked for the Islamic salaam as the standing greeting — not a
// time-of-day phrase. Kept the helper name so the call sites don't move.
function getGreeting() {
  return "السلام عليكم ورحمة الله وبركاته";
}

function formatTodayAr() {
  try {
    return new Date().toLocaleDateString("ar-SA-u-ca-gregory", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return new Date().toLocaleDateString("ar", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalListings: 0,
    activeUsers: 0,
    newReports: 0,
    pendingListings: 0,
  });
  const [advancedStats, setAdvancedStats] = useState<AdvancedStats | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [ambassadorStats, setAmbassadorStats] = useState<AmbassadorStats | null>(
    null
  );
  const [ambassadorChartData, setAmbassadorChartData] = useState<
    AmbassadorChartData[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>("جاري التحميل...");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const [
        listingsRes,
        usersRes,
        complaintsRes,
        notificationsRes,
        advancedRes,
        ambassadorRes,
        ambassadorChartRes,
      ] = await Promise.all([
        fetch(`${API_URL}/api/admin/listings/stats`, { credentials: "include", headers }),
        fetch(`${API_URL}/api/admin/users/stats`, { credentials: "include", headers }),
        fetch(`${API_URL}/api/admin/complaints/stats`, { credentials: "include", headers }),
        fetch(`${API_URL}/api/notifications/recent`, { credentials: "include", headers }),
        fetch(`${API_URL}/api/admin/dashboard/advanced-stats`, { credentials: "include", headers }),
        fetch(`${API_URL}/api/ambassador/admin/stats`, { credentials: "include", headers }),
        fetch(`${API_URL}/api/ambassador/admin/chart-data?days=14`, { credentials: "include", headers }),
      ]);

      let totalListings = 0,
        pendingListings = 0;
      if (listingsRes.ok) {
        const data = await listingsRes.json();
        totalListings = data.total || 0;
        pendingListings = data.pending || 0;
      }

      let activeUsers = 0;
      if (usersRes.ok) {
        const data = await usersRes.json();
        activeUsers = data.total || data.active || 0;
      }

      let newReports = 0;
      if (complaintsRes.ok) {
        const data = await complaintsRes.json();
        newReports = data.new || data.pending || 0;
      }

      let recentActivities: ActivityItem[] = [];
      if (notificationsRes.ok) {
        const data = await notificationsRes.json();
        recentActivities = (data.notifications || [])
          .slice(0, 5)
          .map((n: { id?: string | number; type?: string; title?: string; body?: string; created_at?: string }, i: number) => ({
            id: String(n.id ?? i),
            type: n.type || "general",
            text: n.title || n.body || "نشاط جديد",
            time: formatTimeAgo(n.created_at || ""),
          }));
      }

      if (advancedRes.ok) {
        const data = await advancedRes.json();
        setAdvancedStats(data);
      }

      if (ambassadorRes.ok) {
        const data = await ambassadorRes.json();
        setAmbassadorStats(data.stats);
      }

      if (ambassadorChartRes.ok) {
        const data = await ambassadorChartRes.json();
        setAmbassadorChartData(data);
      }

      setStats({ totalListings, activeUsers, newReports, pendingListings });
      setActivities(recentActivities);
      setLastUpdate(new Date().toLocaleTimeString("ar-SA"));
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    if (!dateStr) return "الآن";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return "الآن";
    if (diffMins < 60) return `منذ ${diffMins} د`;
    if (diffHours < 24) return `منذ ${diffHours} س`;
    return `منذ ${diffDays} يوم`;
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)} مليون`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)} ألف`;
    return amount.toLocaleString("en-US");
  };

  const formatDay = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const days = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    return days[date.getDay()];
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // ─── Derived data ────────────────────────────────────────────────────────────
  const subscriptionChartData = useMemo(
    () =>
      [
        { name: "بزنس", value: advancedStats?.subscriptions?.business || 0 },
        { name: "بريميوم", value: advancedStats?.subscriptions?.premium || 0 },
        { name: "أساسي", value: advancedStats?.subscriptions?.basic || 0 },
      ].filter((d) => d.value > 0),
    [advancedStats]
  );

  const weeklyChartData = useMemo(
    () =>
      (advancedStats?.weeklyListings || []).map((item) => ({
        name: formatDay(item.day),
        count: item.count,
      })),
    [advancedStats]
  );

  const cityChartData = useMemo(
    () =>
      (advancedStats?.cities || []).map((city) => ({
        name: city.city,
        count: city.count,
      })),
    [advancedStats]
  );

  const propertyTypeChartData = useMemo(
    () =>
      (advancedStats?.propertyTypes || []).map((type) => ({
        name: type.property_type,
        value: type.count,
      })),
    [advancedStats]
  );

  // What needs attention right now. Empty array → reassurance state.
  const attentionItems = useMemo(() => {
    const items: { count: number; label: string; href: string; tone: "urgent" | "warn" }[] = [];
    if (stats.newReports > 0)
      items.push({
        count: stats.newReports,
        label: stats.newReports === 1 ? "شكوى تنتظر المراجعة" : "شكاوى تنتظر المراجعة",
        href: "/add-listing/admin/customer-service?tab=complaints",
        tone: "urgent",
      });
    if (stats.pendingListings > 0)
      items.push({
        count: stats.pendingListings,
        label: stats.pendingListings === 1 ? "إعلان بانتظار الموافقة" : "إعلانات بانتظار الموافقة",
        href: "/add-listing/admin/listings?status=pending",
        tone: "warn",
      });
    if ((advancedStats?.elite?.pending_approval || 0) > 0)
      items.push({
        count: advancedStats!.elite.pending_approval,
        label: "حجز نخبة بانتظار الموافقة",
        href: "/add-listing/admin/elite-slots",
        tone: "warn",
      });
    if ((ambassadorStats?.pending_requests || 0) > 0)
      items.push({
        count: ambassadorStats!.pending_requests,
        label: "طلب سفير بانتظار المراجعة",
        href: "/add-listing/admin/ambassador",
        tone: "warn",
      });
    return items;
  }, [stats, advancedStats, ambassadorStats]);

  // The four "نبض المنصة" KPIs — one source of truth per metric.
  // No "live" badge, no category coloring. Single gold rule on the side.
  const pulseKpis = useMemo(
    () => [
      {
        label: "إعلانات نشطة",
        value: advancedStats?.listings?.approved ?? stats.totalListings,
        sub: `${advancedStats?.listings?.new_this_month || 0} جديد هذا الشهر`,
        href: "/add-listing/admin/listings",
        icon: FileText,
      },
      {
        label: "المستخدمون",
        value: stats.activeUsers,
        sub: "إجمالي حسابات العملاء",
        href: "/add-listing/admin/users",
        icon: Users,
      },
      {
        label: "إيرادات الشهر",
        value: formatCurrency(Number(advancedStats?.revenue?.this_month) || 0),
        sub: "ر.س",
        href: "/add-listing/admin/finance",
        icon: Wallet,
      },
      {
        label: "إعلانات النخبة",
        value: advancedStats?.elite?.active_slots || 0,
        sub: `${advancedStats?.elite?.unique_properties || 0} عقار مميّز`,
        href: "/add-listing/admin/elite-slots",
        icon: Crown,
      },
    ],
    [stats, advancedStats]
  );

  return (
    <div className="space-y-10 md:space-y-14" dir="rtl">
      {/* ─── Hero header ─────────────────────────────────────────────── */}
      <header className="relative overflow-hidden rounded-3xl border border-[#EDE6D6] bg-gradient-to-l from-white via-[#FAF8F4] to-white">
        {/* Subtle Islamic-inspired dot grid + corner glows */}
        <div className="pointer-events-none absolute -left-12 -top-12 w-48 h-48 rounded-full bg-[#D4AF37]/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 -bottom-12 w-56 h-56 rounded-full bg-[#002845]/5 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #002845 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
          aria-hidden
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4 px-6 md:px-8 py-7 md:py-9">
          <div className="min-w-0">
            <p className="text-xs font-medium text-[#9A7D28] tracking-[0.2em] uppercase mb-2 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" />
              {formatTodayAr()}
            </p>
            <h1 className="text-2xl md:text-3xl font-black text-[#002845] leading-tight">
              {getGreeting()}
            </h1>
            <p className="text-base md:text-lg text-slate-500 font-normal mt-1.5">
              نظرة على المنصة
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="flex flex-col items-end text-[10px] text-slate-400 font-mono leading-tight">
              <span className="text-[#9A7D28]">v.{BUILD_TAG}</span>
              <span>آخر تحديث: {lastUpdate}</span>
            </div>
            <button
              onClick={fetchDashboardData}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#D4AF37]/40 text-[#9A7D28] bg-white hover:bg-[#FFFCEE] active:scale-95 transition disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              تحديث
            </button>
            <button
              type="button"
              onClick={() => void hardRefreshAndReload()}
              title="مسح كاش المتصفح وإعادة التحميل القاسي"
              className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-slate-200 text-slate-500 bg-white hover:bg-slate-50 hover:text-[#9A7D28] hover:border-[#D4AF37]/40 active:scale-95 transition"
              aria-label="تحديث قاسي"
            >
              <Sparkles className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ─── 1. يحتاج اهتمامك — or reassurance ─────────────────────────── */}
      {attentionItems.length === 0 ? (
        <section
          className="relative overflow-hidden rounded-3xl border border-[#EDE6D6] bg-gradient-to-l from-[#FAF8F4] via-white to-[#FAF8F4] p-6 md:p-8"
          aria-label="حالة هادئة"
        >
          <div className="absolute -left-8 -top-8 w-32 h-32 rounded-full bg-[#D4AF37]/10 blur-2xl" />
          <div className="relative flex items-center gap-4">
            <div className="shrink-0 w-12 h-12 rounded-full bg-white border border-[#EDE6D6] flex items-center justify-center shadow-sm">
              <Moon className="w-5 h-5 text-[#D4AF37]" />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-bold text-[#002845]">
                كل شيء يسير بسلاسة اليوم
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                لا شيء يحتاج تدخّلك الآن — وقت مناسب لمراجعة النمو في الأسفل
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section
          className="rounded-3xl border border-[#EDE6D6] bg-white p-5 md:p-6"
          aria-label="يحتاج اهتمامك الآن"
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1.5 h-5 rounded-full bg-[#D4AF37]" />
            <h2 className="text-base md:text-lg font-bold text-[#002845]">
              يحتاج اهتمامك
            </h2>
            <span className="text-xs text-slate-400 mr-1">
              · {attentionItems.length} بند
            </span>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {attentionItems.map((a, i) => (
              <li key={i}>
                <Link
                  href={a.href}
                  className="group flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-slate-100 hover:border-[#D4AF37]/50 hover:bg-[#FFFCEE] transition"
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        a.tone === "urgent" ? "bg-rose-500" : "bg-amber-400"
                      }`}
                      aria-hidden
                    />
                    <span className="text-sm text-slate-600">
                      <span className="text-[#002845] font-black text-lg">
                        {a.count.toLocaleString("en-US")}
                      </span>{" "}
                      {a.label}
                    </span>
                  </span>
                  <ArrowLeft className="w-4 h-4 text-slate-300 group-hover:text-[#D4AF37] transition" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ─── 2. نبض المنصة (4 KPI) ─────────────────────────────────────── */}
      <section aria-label="نبض المنصة">
        <SectionHeader title="نبض المنصة" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {pulseKpis.map((k, i) => {
            const Icon = k.icon;
            const inner = (
              <div className="group h-full rounded-3xl border border-[#EDE6D6] bg-white p-5 md:p-6 transition hover:border-[#D4AF37]/50 hover:shadow-[0_1px_24px_-12px_rgba(212,175,55,0.4)]">
                <div className="flex items-start justify-between mb-4">
                  <Icon className="w-5 h-5 text-[#D4AF37]" />
                  <ArrowLeft className="w-4 h-4 text-slate-300 group-hover:text-[#D4AF37] transition" />
                </div>
                <p className="text-3xl md:text-4xl font-black text-[#002845] leading-none tabular-nums">
                  {loading ? (
                    <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
                  ) : typeof k.value === "number" ? (
                    k.value.toLocaleString("en-US")
                  ) : (
                    k.value
                  )}
                </p>
                <p className="text-sm font-semibold text-[#002845] mt-3">
                  {k.label}
                </p>
                <p className="text-xs text-slate-400 mt-1">{k.sub}</p>
              </div>
            );
            return k.href ? (
              <Link key={i} href={k.href} className="block">
                {inner}
              </Link>
            ) : (
              <div key={i}>{inner}</div>
            );
          })}
        </div>
      </section>

      {/* ─── Platform Pulse component (heartbeat) ────────────────────────── */}
      <div>
        <PlatformPulse />
      </div>

      {/* ─── 3. المالية ──────────────────────────────────────────────────── */}
      <section aria-label="المالية">
        <SectionHeader title="المالية" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
          {/* Revenue summary */}
          <div className="lg:col-span-2 rounded-3xl border border-[#EDE6D6] bg-white p-5 md:p-6">
            <div className="flex items-baseline justify-between mb-5">
              <h3 className="text-base font-bold text-[#002845] flex items-center gap-2">
                <Wallet className="w-4 h-4 text-[#D4AF37]" />
                الإيرادات
              </h3>
              <span className="text-xs text-slate-400">ر.س</span>
            </div>
            <div className="grid grid-cols-3 gap-3 md:gap-4">
              <RevenueCell
                label="إجمالي"
                value={formatCurrency(
                  Number(advancedStats?.revenue?.total_revenue) || 0
                )}
                emphasis
              />
              <RevenueCell
                label="هذا الشهر"
                value={formatCurrency(
                  Number(advancedStats?.revenue?.this_month) || 0
                )}
              />
              <RevenueCell
                label="هذا الأسبوع"
                value={formatCurrency(
                  Number(advancedStats?.revenue?.this_week) || 0
                )}
              />
            </div>
            <div className="mt-5 pt-5 border-t border-[#EDE6D6] flex items-center justify-between text-sm">
              <span className="text-slate-500">عدد المعاملات</span>
              <span className="font-bold text-[#002845] tabular-nums">
                {(advancedStats?.revenue?.total_transactions || 0).toLocaleString(
                  "en-US"
                )}
              </span>
            </div>
          </div>

          {/* Subscriptions donut */}
          <div className="rounded-3xl border border-[#EDE6D6] bg-white p-5 md:p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-[#002845] flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#D4AF37]" />
                الاشتراكات
              </h3>
              <span className="text-xs text-slate-400 tabular-nums">
                {advancedStats?.subscriptions?.active || 0} نشط
              </span>
            </div>
            {mounted && subscriptionChartData.length > 0 ? (
              <>
                <div className="h-44 -mx-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={subscriptionChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={72}
                        paddingAngle={3}
                        dataKey="value"
                        stroke="none"
                      >
                        {subscriptionChartData.map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={
                              SUBSCRIPTION_PALETTE[
                                index % SUBSCRIPTION_PALETTE.length
                              ]
                            }
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => [`${value} اشتراك`, ""]}
                        contentStyle={tooltipStyle}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <Legend2 items={subscriptionChartData.map((s, i) => ({ label: s.name, color: SUBSCRIPTION_PALETTE[i % SUBSCRIPTION_PALETTE.length] }))} />
              </>
            ) : (
              <EmptyChart icon={CreditCard} text="لا توجد اشتراكات" />
            )}
          </div>
        </div>
      </section>

      {/* ─── 4. النمو ────────────────────────────────────────────────────── */}
      <section aria-label="النمو">
        <SectionHeader title="النمو" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
          {/* Weekly listings */}
          <div className="rounded-3xl border border-[#EDE6D6] bg-white p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-[#002845] flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#D4AF37]" />
                الإعلانات خلال الأسبوع
              </h3>
              <span className="text-xs text-slate-400 tabular-nums">
                {(advancedStats?.listings?.new_this_week || 0).toLocaleString(
                  "en-US"
                )}{" "}
                إعلان
              </span>
            </div>
            {mounted && weeklyChartData.length > 0 ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={weeklyChartData}
                    margin={{ top: 5, right: 8, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="goldFill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="5%" stopColor={GOLD} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={GOLD} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "#94A3B8" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#94A3B8" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(value) => [`${value} إعلان`, "الإعلانات"]}
                      contentStyle={tooltipStyle}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke={GOLD}
                      strokeWidth={2}
                      fill="url(#goldFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart icon={Calendar} text="لا توجد إعلانات هذا الأسبوع" />
            )}
          </div>

          {/* Cities */}
          <div className="rounded-3xl border border-[#EDE6D6] bg-white p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-[#002845] flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#D4AF37]" />
                التوزيع حسب المدينة
              </h3>
              <span className="text-xs text-slate-400 tabular-nums">
                {cityChartData.length} مدينة
              </span>
            </div>
            {mounted && cityChartData.length > 0 ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={cityChartData}
                    layout="vertical"
                    margin={{ top: 5, right: 16, left: 4, bottom: 5 }}
                  >
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: "#94A3B8" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      tick={{ fontSize: 11, fill: "#475569" }}
                      width={70}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(value) => [`${value} إعلان`, "العدد"]}
                      contentStyle={tooltipStyle}
                    />
                    <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                      {cityChartData.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={CITY_PALETTE[index % CITY_PALETTE.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart icon={MapPin} text="لا توجد بيانات" />
            )}
          </div>

          {/* Ambassadors */}
          <div className="rounded-3xl border border-[#EDE6D6] bg-white p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-[#002845] flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#D4AF37]" />
                سفراء البيت
              </h3>
              <Link
                href="/add-listing/admin/ambassador"
                className="text-xs text-[#9A7D28] hover:underline"
              >
                عرض الكل
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <MiniKpi
                label="نشط"
                value={ambassadorStats?.active_ambassadors || 0}
              />
              <MiniKpi
                label="إحالات"
                value={ambassadorStats?.total_referrals || 0}
              />
              <MiniKpi
                label="استهلاك اليوم"
                value={ambassadorStats?.consumptions_today || 0}
              />
            </div>
            {mounted && ambassadorChartData.length > 0 ? (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={ambassadorChartData}
                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                  >
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#94A3B8" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(value: string) =>
                        new Date(value).toLocaleDateString("ar-SA", {
                          day: "numeric",
                          month: "short",
                        })
                      }
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#94A3B8" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={(value: string | number) =>
                        new Date(String(value)).toLocaleDateString("ar-SA")
                      }
                    />
                    <Legend
                      formatter={(value: string) =>
                        value === "referrals" ? "الإحالات" : "الاستهلاكات"
                      }
                      wrapperStyle={{ fontSize: 11 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="referrals"
                      stroke={GOLD}
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="consumptions"
                      stroke={NAVY}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart icon={Building2} text="لا توجد بيانات للرسم" small />
            )}
          </div>

          {/* Property types */}
          <div className="rounded-3xl border border-[#EDE6D6] bg-white p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-[#002845] flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#D4AF37]" />
                أنواع العقارات
              </h3>
              <span className="text-xs text-slate-400 tabular-nums">
                {propertyTypeChartData.reduce((s, p) => s + p.value, 0)} عقار
              </span>
            </div>
            {mounted && propertyTypeChartData.length > 0 ? (
              <>
                <div className="h-48 -mx-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={propertyTypeChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={42}
                        outerRadius={74}
                        paddingAngle={3}
                        dataKey="value"
                        stroke="none"
                      >
                        {propertyTypeChartData.map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={
                              PROPERTY_PALETTE[
                                index % PROPERTY_PALETTE.length
                              ]
                            }
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => [`${value} عقار`, ""]}
                        contentStyle={tooltipStyle}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <Legend2 items={propertyTypeChartData.map((p, i) => ({ label: p.name, color: PROPERTY_PALETTE[i % PROPERTY_PALETTE.length] }))} />
              </>
            ) : (
              <EmptyChart icon={Building2} text="لا توجد بيانات" />
            )}
          </div>
        </div>
      </section>

      {/* ─── 5. النشاط الأخير ────────────────────────────────────────────── */}
      <section aria-label="النشاط الأخير">
        <SectionHeader title="النشاط الأخير" />
        <div className="rounded-3xl border border-[#EDE6D6] bg-white p-5 md:p-6">
          {activities.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <Clock className="w-9 h-9 mx-auto mb-2 opacity-30" />
              <p className="text-sm">لا يوجد نشاط حديث</p>
              <p className="text-xs mt-1 text-slate-300">
                ستظهر الإشعارات الجديدة هنا
              </p>
            </div>
          ) : (
            <ol className="relative space-y-4 pr-6">
              <span
                className="absolute right-2 top-2 bottom-2 w-px bg-[#EDE6D6]"
                aria-hidden
              />
              {activities.map((activity) => (
                <li key={activity.id} className="relative">
                  <span
                    className="absolute right-[-1.05rem] top-1.5 w-2.5 h-2.5 rounded-full bg-[#D4AF37] ring-4 ring-white"
                    aria-hidden
                  />
                  <p className="text-sm font-medium text-[#002845] leading-snug">
                    {activity.text}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {activity.time}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}

// ─── Helpers (visual primitives) ─────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 mb-5 md:mb-6">
      <div className="w-1.5 h-6 rounded-full bg-[#D4AF37]" />
      <h2 className="text-base md:text-lg font-bold text-[#002845]">{title}</h2>
      <div className="flex-1 h-px bg-[#EDE6D6]" />
    </div>
  );
}

function RevenueCell({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-4 ${
        emphasis ? "bg-[#FAF8F4] border border-[#EDE6D6]" : "bg-white"
      }`}
    >
      <p
        className={`tabular-nums leading-none ${
          emphasis
            ? "text-2xl md:text-3xl font-black text-[#9A7D28]"
            : "text-xl md:text-2xl font-bold text-[#002845]"
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-slate-500 mt-2">{label}</p>
    </div>
  );
}

function MiniKpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-[#FAF8F4] border border-[#EDE6D6] p-3 text-center">
      <p className="text-xl font-black text-[#002845] tabular-nums leading-none">
        {value.toLocaleString("en-US")}
      </p>
      <p className="text-[11px] text-slate-500 mt-1.5">{label}</p>
    </div>
  );
}

function Legend2({
  items,
}: {
  items: { label: string; color: string }[];
}) {
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-2">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5 text-xs text-slate-500">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: it.color }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function EmptyChart({
  icon: Icon,
  text,
  small,
}: {
  icon: typeof Calendar;
  text: string;
  small?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-center text-slate-300 ${
        small ? "h-44" : "h-56"
      }`}
    >
      <div className="text-center">
        <Icon className="w-10 h-10 mx-auto mb-2 opacity-50" />
        <p className="text-sm text-slate-400">{text}</p>
      </div>
    </div>
  );
}

const tooltipStyle = {
  background: "white",
  border: "1px solid #EDE6D6",
  borderRadius: 12,
  fontSize: 12,
  padding: "8px 12px",
  boxShadow: "0 1px 24px -8px rgba(0, 40, 69, 0.15)",
} as const;
