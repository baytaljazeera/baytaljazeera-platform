"use client";

/**
 * Phase 2 of Admin OS — generic inbox renderer.
 *
 * Reads /api/admin/inboxes/[key] for the config (title/icon/roles/etc.)
 * and /api/admin/inboxes/[key]/items for the filtered rows. The same
 * file serves every department inbox — adding a new inbox means INSERT
 * into admin_inboxes, not creating a new React page.
 *
 * The existing finance-inbox + executive-inbox keep their bespoke pages
 * because they have richer features (audit timeline, multi-recipient
 * directives). They can be migrated onto this engine later if desired.
 */

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { API_URL, getAuthHeaders } from "@/lib/api";
import { resolveIcon } from "@/components/admin/iconRegistry";
import {
  RefreshCcw, ExternalLink, Loader2, AlertTriangle, Inbox,
} from "lucide-react";

type InboxConfig = {
  key: string;
  title: string;
  icon_name: string;
  accent_color: string;
  source_kind: string;
  description?: string | null;
  required_roles?: string[] | null;
};

type Item = {
  id: number;
  subject: string;
  details: string;
  priority?: string;
  category?: string;
  status: string;
  user_name?: string;
  user_email?: string;
  invoice_id?: number | null;
  created_at: string;
  sla_due_at?: string | null;
  plan_tier?: string | null;
  auto_assigned_role?: string | null;
};

const PRIORITY_LABEL: Record<string, string> = { urgent: "عاجل", high: "عالٍ", medium: "متوسط", low: "منخفض" };
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
  if (m < 1) return "الآن";
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
  const label = breached ? `تجاوز SLA بـ ${hrs} س` : `متبقي ${hrs} س`;
  const cls = breached
    ? "bg-red-50 text-red-700 border-red-200"
    : remainingMs < 6 * 3600000
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-emerald-50 text-emerald-700 border-emerald-200";
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border ${cls}`}>{label}</span>;
}

export default function GenericInboxPage() {
  const params = useParams<{ key: string }>();
  const key = params?.key;
  const [config, setConfig] = useState<InboxConfig | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    setError(null);
    try {
      // One request returns both the config and the items. Cheaper than two
      // round-trips and keeps the empty state coherent (we can show the
      // config description even when there are zero items).
      const res = await fetch(`${API_URL}/api/admin/inboxes/${key}/items?limit=100`, {
        credentials: "include", headers: getAuthHeaders(),
      });
      if (res.status === 404) throw new Error("هذا الصندوق غير موجود أو لم يُهيَّأ بعد.");
      if (res.status === 403) throw new Error("غير مصرح لك بالوصول لهذا الصندوق.");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setConfig(data.inbox);
      setItems(data.items || []);
    } catch (e: any) {
      setError(e?.message || "خطأ في تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => { load(); }, [load]);

  const Icon = resolveIcon(config?.icon_name);

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#002845] flex items-center gap-2">
              <Icon className={`w-6 h-6 md:w-7 md:h-7 ${config?.accent_color || "text-slate-500"}`} />
              {config?.title || "صندوق"}
            </h1>
            {config?.description && (
              <p className="text-slate-500 text-sm mt-1">{config.description}</p>
            )}
            {items.length > 0 && (
              <p className="text-slate-400 text-xs mt-1">{items.length} عنصر بانتظارك</p>
            )}
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

        {!error && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="divide-y divide-slate-100">
              {loading ? (
                <p className="px-4 py-6 text-sm text-slate-400 text-center">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> جاري التحميل...
                </p>
              ) : items.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">الصندوق فارغ حالياً</p>
                  <p className="text-xs text-slate-400 mt-1">تظهر هنا الحالات حسب فلتر هذا الصندوق فقط.</p>
                </div>
              ) : (
                items.map((it) => (
                  <Link
                    key={it.id}
                    href={`/add-listing/admin/customer-service?tab=complaints&open=${it.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 transition group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className="text-sm font-semibold text-[#002845] truncate">{it.subject}</p>
                        {it.priority && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${PRIORITY_COLOR[it.priority] || PRIORITY_COLOR.medium}`}>
                            {PRIORITY_LABEL[it.priority] || it.priority}
                          </span>
                        )}
                        {it.plan_tier && /royal|ملكي|elite/i.test(it.plan_tier) && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-[#D4AF37]/10 text-[#9a7d28] border-[#D4AF37]/30">
                            ملكي
                          </span>
                        )}
                        {dueBadge(it.sla_due_at)}
                      </div>
                      <p className="text-xs text-slate-500 truncate">
                        {it.user_name || it.user_email || "عميل"} · {timeAgo(it.created_at)}
                        {it.category && <> · {it.category}</>}
                      </p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-[#D4AF37] shrink-0" />
                  </Link>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
