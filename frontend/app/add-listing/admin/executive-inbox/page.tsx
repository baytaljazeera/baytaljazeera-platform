"use client";

/**
 * Executive Inbox — for complaints escalated to "الإدارة العليا"
 * (auto_assigned_role IN admin / super_admin) via the transfer modal.
 *
 * Same queue UI as the finance inbox, but filtered to leadership-routed
 * items. The dashboard already shows generic Action Center cards; this
 * page is the landing spot when an agent transfers something with "تصعيد".
 */

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { API_URL, getAuthHeaders } from "@/lib/api";
import {
  AlertCircle, Crown, RefreshCcw, ExternalLink,
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
  auto_assigned_role?: string | null;
  admin_note?: string | null;
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

// Pull the last transfer note out of admin_note for inline display — the
// audit line format is "— تم التحويل إلى X بواسطة Y (ISO) — note".
function lastTransferReason(adminNote?: string | null): string | null {
  if (!adminNote) return null;
  const lines = adminNote.split("\n").filter((l) => l.includes("تم التحويل"));
  if (lines.length === 0) return null;
  const last = lines[lines.length - 1];
  const match = last.match(/—\s*([^—]+?)\s*$/);
  return match ? match[1].trim() : null;
}

export default function ExecutiveInboxPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // We pull a generous "new + in_review" slice then filter to the
      // executive-assigned subset client-side — the GET endpoint scopes by
      // role automatically so admins/super_admins see everything, and the
      // explicit filter ensures we only display escalated items here.
      const res = await fetch(`${API_URL}/api/account-complaints?limit=100`, {
        credentials: "include", headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const all: Complaint[] = data.complaints || [];
      const escalated = all.filter((c) =>
        (c.auto_assigned_role === "admin" || c.auto_assigned_role === "super_admin")
        && !["closed", "resolved", "dismissed"].includes(c.status)
      );
      setComplaints(escalated);
    } catch (e: any) {
      setError(e?.message || "خطأ في تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#002845] flex items-center gap-2">
              <Crown className="w-6 h-6 md:w-7 md:h-7 text-[#D4AF37]" />
              صندوق الإدارة العليا
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              الشكاوى التي تم تصعيدها للقيادة عبر زر التحويل. {complaints.length > 0 && `(${complaints.length} حالة بانتظارك)`}
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

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {error}
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-gradient-to-l from-[#FFF7E0] to-white">
            <h2 className="font-bold text-[#002845] flex items-center gap-2 text-sm">
              <Inbox className="w-4 h-4 text-[#D4AF37]" />
              الحالات المُصعّدة
            </h2>
            <span className="text-xs text-slate-500">{complaints.length}</span>
          </div>
          <div className="divide-y divide-slate-100">
            {loading ? (
              <p className="px-4 py-6 text-sm text-slate-400 text-center">جاري التحميل...</p>
            ) : complaints.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Crown className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">لا توجد حالات مُصعّدة حالياً</p>
                <p className="text-xs text-slate-400 mt-1">تظهر هنا الشكاوى التي يتم تحويلها للإدارة العليا من فريق الدعم.</p>
              </div>
            ) : (
              complaints.map((c) => {
                const reason = lastTransferReason(c.admin_note);
                return (
                  <Link
                    key={c.id}
                    href={`/add-listing/admin/customer-service?tab=complaints&open=${c.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 transition group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className="text-sm font-semibold text-[#002845] truncate">{c.subject}</p>
                        {c.priority && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${PRIORITY_COLOR[c.priority] || PRIORITY_COLOR.medium}`}>
                            {c.priority === "urgent" ? "عاجل" : c.priority === "high" ? "عالٍ" : c.priority === "medium" ? "متوسط" : "منخفض"}
                          </span>
                        )}
                        {c.plan_tier && /royal|ملكي|elite/i.test(c.plan_tier) && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-[#D4AF37]/10 text-[#9a7d28] border-[#D4AF37]/30">
                            ملكي
                          </span>
                        )}
                        {dueBadge(c.sla_due_at)}
                      </div>
                      <p className="text-xs text-slate-500 truncate">
                        {c.user_name || c.user_email || "عميل"} · {timeAgo(c.created_at)}
                      </p>
                      {reason && (
                        <p className="text-[11px] text-amber-700 mt-1 truncate">
                          <span className="font-bold">سبب التصعيد:</span> {reason}
                        </p>
                      )}
                    </div>
                    <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-[#D4AF37] shrink-0" />
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
