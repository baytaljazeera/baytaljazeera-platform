"use client";

/**
 * Finance Inbox — the single queue a finance_admin should open every
 * morning. Combines three streams that previously lived on three different
 * pages or hidden tabs:
 *
 *   1) Pending billing complaints     (account_complaints, category=billing)
 *   2) Open finance-dept tickets       (support_tickets, department=financial)
 *   3) Pending refund requests         (refunds, status=pending)
 *
 * The page does not duplicate the detail UIs — each row links to the
 * existing detail view in /admin/customer-service or /admin/finance so
 * the rest of the platform stays a single source of truth.
 */

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { API_URL, getAuthHeaders } from "@/lib/api";
import {
  AlertCircle, Headset, Coins, RefreshCcw, ExternalLink,
  Loader2, Inbox, AlertTriangle,
} from "lucide-react";

type Complaint = {
  id: number;
  subject: string;
  details: string;
  priority?: string;
  category?: string;
  complaint_type?: string;
  status: string;
  user_name?: string;
  user_email?: string;
  invoice_id?: number | null;
  created_at: string;
  sla_due_at?: string | null;
  plan_tier?: string | null;
};

type Ticket = {
  id: number;
  ticket_number: string;
  subject: string;
  status: string;
  department: string;
  priority?: string;
  user_name?: string;
  user_email?: string;
  created_at: string;
  sla_due_at?: string | null;
};

type Refund = {
  id: number;
  invoice_id?: number;
  user_name?: string;
  user_email?: string;
  amount: number;
  status: string;
  created_at: string;
  reason?: string;
};

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-slate-100 text-slate-600 border-slate-200",
};

function timeAgo(iso?: string) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `قبل ${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${h} س`;
  const d = Math.floor(h / 24);
  return `قبل ${d} يوم`;
}

function dueBadge(due?: string | null) {
  if (!due) return null;
  const remainingMs = new Date(due).getTime() - Date.now();
  const breached = remainingMs < 0;
  const hrs = Math.abs(Math.round(remainingMs / 3600000));
  const label = breached ? `تجاوز ${hrs} س` : `متبقي ${hrs} س`;
  const cls = breached
    ? "bg-red-50 text-red-700 border-red-200"
    : remainingMs < 6 * 3600000
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-emerald-50 text-emerald-700 border-emerald-200";
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${cls}`}>
      {label}
    </span>
  );
}

export default function FinanceInboxPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cRes, tRes, rRes] = await Promise.all([
        fetch(`${API_URL}/api/account-complaints?status=new&limit=50`, {
          credentials: "include", headers: getAuthHeaders(),
        }),
        fetch(`${API_URL}/api/support?status=new`, {
          credentials: "include", headers: getAuthHeaders(),
        }),
        fetch(`${API_URL}/api/finance/refunds?status=pending`, {
          credentials: "include", headers: getAuthHeaders(),
        }),
      ]);

      const cData = cRes.ok ? await cRes.json() : { complaints: [] };
      const tData = tRes.ok ? await tRes.json() : { tickets: [] };
      const rData = rRes.ok ? await rRes.json() : { refunds: [] };

      const allComplaints: Complaint[] = cData.complaints || [];
      // Keep only the ones that should land on a finance_admin's desk —
      // category=billing OR complaint_type IN (billing,refund) OR an
      // invoice was attached. Same predicate as the backend scope rule.
      const financialComplaints = allComplaints.filter((c) =>
        (c.category && ["billing", "subscription", "refund"].includes(c.category)) ||
        (c.complaint_type && ["billing", "refund"].includes(c.complaint_type)) ||
        c.invoice_id != null
      );

      const allTickets: Ticket[] = tData.tickets || [];
      const financialTickets = allTickets.filter((t) => t.department === "financial");

      setComplaints(financialComplaints);
      setTickets(financialTickets);
      setRefunds(rData.refunds || rData || []);
    } catch (e: any) {
      setError(e?.message || "خطأ في تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalPending = complaints.length + tickets.length + refunds.length;

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#002845] flex items-center gap-2">
              <Inbox className="w-6 h-6 md:w-7 md:h-7 text-[#D4AF37]" />
              صندوق الوصول المالي
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              كل الشكاوى المالية وتذاكر المالية وطلبات الاسترداد في مكان واحد. {totalPending > 0 && `(${totalPending} عنصر بانتظارك)`}
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

        {/* Tri-counter cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">شكاوى مالية</p>
              <p className="text-xl font-bold text-[#002845]">{complaints.length}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center">
              <Headset className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">تذاكر دعم مالية</p>
              <p className="text-xl font-bold text-[#002845]">{tickets.length}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center">
              <Coins className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">طلبات استرداد معلّقة</p>
              <p className="text-xl font-bold text-[#002845]">{refunds.length}</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {error}
          </div>
        )}

        {/* Three lists, one queue */}
        <Section
          title="الشكاوى المالية"
          icon={<AlertCircle className="w-4 h-4 text-rose-600" />}
          emptyText="لا توجد شكاوى مالية مفتوحة"
          items={complaints}
          renderItem={(c) => (
            <ItemRow
              key={`c-${c.id}`}
              subject={c.subject}
              meta={`${c.user_name || c.user_email || "عميل"} · ${timeAgo(c.created_at)}`}
              priority={c.priority}
              tierBadge={c.plan_tier}
              due={c.sla_due_at}
              href={`/add-listing/admin/customer-service?tab=complaints&open=${c.id}`}
            />
          )}
        />

        <Section
          title="تذاكر الدعم المالية"
          icon={<Headset className="w-4 h-4 text-blue-600" />}
          emptyText="لا توجد تذاكر مالية مفتوحة"
          items={tickets}
          renderItem={(t) => (
            <ItemRow
              key={`t-${t.id}`}
              subject={`${t.ticket_number} — ${t.subject}`}
              meta={`${t.user_name || t.user_email || "عميل"} · ${timeAgo(t.created_at)}`}
              priority={t.priority}
              due={t.sla_due_at}
              href={`/add-listing/admin/customer-service?tab=support&open=${t.id}`}
            />
          )}
        />

        <Section
          title="طلبات الاسترداد المعلّقة"
          icon={<Coins className="w-4 h-4 text-emerald-600" />}
          emptyText="لا توجد طلبات استرداد بانتظار المراجعة"
          items={refunds}
          renderItem={(r) => (
            <ItemRow
              key={`r-${r.id}`}
              subject={`استرداد بمبلغ ${Number(r.amount || 0).toLocaleString("en-US")} ر.س`}
              meta={`${r.user_name || r.user_email || "عميل"} · ${timeAgo(r.created_at)}${r.reason ? ` · ${r.reason}` : ""}`}
              href={`/add-listing/admin/finance?tab=refunds&open=${r.id}`}
            />
          )}
        />
      </div>
    </div>
  );
}

function Section<T>({
  title, icon, items, emptyText, renderItem,
}: {
  title: string;
  icon: React.ReactNode;
  items: T[];
  emptyText: string;
  renderItem: (item: T) => React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
        <h2 className="font-bold text-[#002845] flex items-center gap-2 text-sm">
          {icon}
          {title}
        </h2>
        <span className="text-xs text-slate-500">{items.length}</span>
      </div>
      <div className="divide-y divide-slate-100">
        {items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-400 text-center">{emptyText}</p>
        ) : (
          items.map(renderItem)
        )}
      </div>
    </div>
  );
}

function ItemRow({
  subject, meta, priority, tierBadge, due, href,
}: {
  subject: string;
  meta: string;
  priority?: string;
  tierBadge?: string | null;
  due?: string | null;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 transition group"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <p className="text-sm font-semibold text-[#002845] truncate">{subject}</p>
          {priority && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${PRIORITY_COLOR[priority] || PRIORITY_COLOR.medium}`}>
              {priority === "urgent" ? "عاجل" : priority === "high" ? "عالٍ" : priority === "medium" ? "متوسط" : "منخفض"}
            </span>
          )}
          {tierBadge && /royal|ملكي|elite/i.test(tierBadge) && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border bg-[#D4AF37]/10 text-[#9a7d28] border-[#D4AF37]/30">
              ملكي
            </span>
          )}
          {dueBadge(due)}
        </div>
        <p className="text-xs text-slate-500 truncate">{meta}</p>
      </div>
      <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-[#D4AF37] shrink-0" />
    </Link>
  );
}
