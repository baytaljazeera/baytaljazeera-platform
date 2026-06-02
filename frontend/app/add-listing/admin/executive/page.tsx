"use client";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────
// Executive Summary — the CFO / GM view.
//
// Separated from the Operations Command Center because the two
// audiences ask different questions:
//
//   Operations:  "where is the problem RIGHT NOW?"
//   Executive:   "how are we doing this month?"
//
// This page is intentionally CALM — no red banners, no pulsing
// icons. It's revenue, subscriptions, listings, users, elite
// slots. Read it with coffee.
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import {
  Wallet, Building2, RefreshCw, Users, CreditCard,
  Crown, Sparkles, ArrowLeft,
} from "lucide-react";
import {
  BJPageShell, BJPageHeader, BJButton, BJCard, BJBadge,
  BJStatCard, BJSectionHeader,
} from "@/components/admin/ui";
import Link from "next/link";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://baytaljazeera-backend.onrender.com";

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

export default function ExecutiveSummary() {
  const [kpis, setKpis] = useState<DashboardKpis>({ totalListings: 0, activeUsers: 0, pendingListings: 0 });
  const [advanced, setAdvanced] = useState<AdvancedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>("");

  const fetchAll = async () => {
    setLoading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const init: RequestInit = { credentials: "include", headers };

      const [listingsRes, usersRes, advancedRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/listings/stats`, init),
        fetch(`${API_URL}/api/admin/users/stats`, init),
        fetch(`${API_URL}/api/admin/dashboard/advanced-stats`, init),
      ]);

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

      setLastUpdate(new Date().toLocaleTimeString("ar-SA"));
    } catch (e) {
      console.error("[executive] fetch failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchAll(); }, []);

  return (
    <BJPageShell>
      <BJPageHeader
        title="الملخص التنفيذي"
        subtitle="إيرادات المنصة، الاشتراكات، الإعلانات، ومواقع النخبة — للقراءة، ليس للتدخل."
        meta={
          <>
            {lastUpdate && (
              <BJBadge tone="neutral" size="sm">آخر تحديث: {lastUpdate}</BJBadge>
            )}
            <BJBadge tone="gold" size="sm">CFO View</BJBadge>
          </>
        }
        actions={
          <>
            <Link href="/add-listing/admin/dashboard">
              <BJButton variant="ghost" leadingIcon={<ArrowLeft className="w-4 h-4" />}>
                العودة لمركز التشغيل
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

      {/* ── Revenue strip — primary financial KPIs ───────────────── */}
      <section className="mb-6">
        <BJSectionHeader
          title="الإيرادات"
          hint="إجمالي + هذا الشهر + هذا الأسبوع — معروضة بنفس الوحدة دائماً."
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <BJStatCard
            label="الإيرادات الكلية"
            value={advanced ? fmtSAR(advanced.revenue.total_revenue) : "—"}
            hint={advanced ? `${fmtNumber(advanced.revenue.total_transactions)} عملية إجمالاً` : ""}
            icon={<Wallet className="w-5 h-5" />}
            loading={loading && !advanced}
          />
          <BJStatCard
            label="إيرادات الشهر"
            value={advanced ? fmtSAR(advanced.revenue.this_month) : "—"}
            icon={<CreditCard className="w-5 h-5" />}
            loading={loading && !advanced}
          />
          <BJStatCard
            label="إيرادات الأسبوع"
            value={advanced ? fmtSAR(advanced.revenue.this_week) : "—"}
            icon={<CreditCard className="w-5 h-5" />}
            loading={loading && !advanced}
          />
        </div>
      </section>

      {/* ── Subscriptions + users + listings ─────────────────────── */}
      <section className="mb-6">
        <BJSectionHeader
          title="النمو والتغطية"
          hint="حجم المنصة الحالي عبر المستخدمين والاشتراكات والإعلانات."
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
            label="مواقع النخبة"
            value={advanced ? fmtNumber(advanced.elite.active_slots) : "—"}
            hint={advanced ? `قيد الموافقة: ${advanced.elite.pending_approval}` : ""}
            icon={<Sparkles className="w-5 h-5" />}
            href="/add-listing/admin/elite-slots"
            loading={loading && !advanced}
          />
        </div>
      </section>

      {/* ── Listings funnel breakdown ────────────────────────────── */}
      {advanced && (
        <section className="mb-6">
          <BJSectionHeader
            title="حركة الإعلانات"
            hint="موزّعة بين معتمد، بانتظار الموافقة، جديد هذا الشهر."
          />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <BJStatCard
              label="إجمالي الإعلانات"
              value={fmtNumber(advanced.listings.total)}
              icon={<Building2 className="w-5 h-5" />}
            />
            <BJStatCard
              label="معتمدة"
              value={fmtNumber(advanced.listings.approved)}
              icon={<Building2 className="w-5 h-5" />}
            />
            <BJStatCard
              label="بانتظار الموافقة"
              value={fmtNumber(advanced.listings.pending)}
              icon={<Building2 className="w-5 h-5" />}
              href="/add-listing/admin/listings"
            />
            <BJStatCard
              label="جديدة هذا الشهر"
              value={fmtNumber(advanced.listings.new_this_month)}
              icon={<Building2 className="w-5 h-5" />}
            />
          </div>
        </section>
      )}
    </BJPageShell>
  );
}
