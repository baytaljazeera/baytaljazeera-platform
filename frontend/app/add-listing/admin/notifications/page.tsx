"use client";

/**
 * Notification Center — unified admin view of every event addressed to me.
 *
 * Categories come from backend/services/notificationService.js:
 *   directive | transfer | assignment | escalation | reply | complaint
 *   | mention | system
 *
 * The page is permission-aware via useAdminGate (any admin role works —
 * this is the user's personal feed, not a cross-tenant view).
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell, CheckCheck, Filter, AlertTriangle, Crown, Inbox as InboxIcon,
  ArrowRightLeft, ClipboardList, AtSign, Settings as SettingsIcon,
  MessageSquareReply, Search,
} from "lucide-react";
import { useAdminFetch, adminMutate } from "@/lib/hooks/useAdminFetch";
import { useAdminGate } from "@/lib/hooks/useAdminGate";

type Notification = {
  id: number | string;
  title: string;
  body: string;
  type?: string | null;
  link?: string | null;
  category?: string | null;
  priority?: string | null;
  source_type?: string | null;
  source_id?: number | null;
  actor_user_id?: string | null;
  actor_name_snapshot?: string | null;
  read_at?: string | null;
  created_at: string;
};

type CenterResponse = {
  items: Notification[];
  total: number;
  counts: { byCategory: Record<string, number>; unread: number; urgent: number };
  page: { limit: number; offset: number };
};

const CATEGORY_META: Record<string, { label: string; icon: typeof Bell; tone: string }> = {
  directive:  { label: "توجيهات",   icon: ClipboardList,    tone: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
  assignment: { label: "تكليفات",   icon: ClipboardList,    tone: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  transfer:   { label: "تحويلات",   icon: ArrowRightLeft,   tone: "text-purple-400 bg-purple-500/10 border-purple-500/30" },
  escalation: { label: "تصعيد",     icon: AlertTriangle,    tone: "text-red-400 bg-red-500/10 border-red-500/30" },
  reply:      { label: "ردود",      icon: MessageSquareReply,tone: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  complaint:  { label: "شكاوى جديدة",icon: InboxIcon,       tone: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" },
  mention:    { label: "إشارات",    icon: AtSign,           tone: "text-pink-400 bg-pink-500/10 border-pink-500/30" },
  system:     { label: "النظام",    icon: SettingsIcon,     tone: "text-slate-400 bg-slate-500/10 border-slate-500/30" },
};

const PRIORITY_TONE: Record<string, string> = {
  urgent: "text-red-400 bg-red-500/20 border-red-500/50",
  high:   "text-amber-400 bg-amber-500/20 border-amber-500/50",
  medium: "text-slate-400 bg-slate-500/10 border-slate-500/30",
  low:    "text-slate-500 bg-slate-500/10 border-slate-500/20",
};

export default function NotificationsCenterPage() {
  const { ready, allowed } = useAdminGate({
    anyRole: [
      "super_admin", "admin", "admin_manager",
      "finance_admin", "support_admin", "content_admin",
    ],
  });

  const [category, setCategory] = useState<string>("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [priority, setPriority] = useState<string>("");
  const [search, setSearch] = useState("");

  const qs = useMemo(() => {
    const p = new URLSearchParams({ limit: "100" });
    if (category) p.set("category", category);
    if (priority) p.set("priority", priority);
    if (unreadOnly) p.set("unread", "1");
    if (search.trim()) p.set("q", search.trim());
    return p.toString();
  }, [category, priority, unreadOnly, search]);

  const { data, loading, error, refetch, mutate } = useAdminFetch<CenterResponse>(
    `/api/notifications/center?${qs}`,
    { items: [], total: 0, counts: { byCategory: {}, unread: 0, urgent: 0 }, page: { limit: 100, offset: 0 } },
    [qs]
  );

  if (!ready) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-300">
        <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-300">
        <div className="text-center">
          <Crown className="w-12 h-12 mx-auto text-slate-500 mb-3" />
          <p>غير مصرح بالوصول إلى مركز الإشعارات.</p>
        </div>
      </div>
    );
  }

  const markRead = async (n: Notification) => {
    try {
      await adminMutate(`/api/notifications/${n.id}/read`, "PATCH");
      mutate((prev) => ({
        ...prev,
        items: prev.items.map((x) =>
          x.id === n.id ? { ...x, read_at: x.read_at || new Date().toISOString() } : x
        ),
        counts: { ...prev.counts, unread: Math.max(0, prev.counts.unread - 1) },
      }));
    } catch {
      // best-effort; refetch the center on visible failure
      refetch();
    }
  };

  const markAllRead = async () => {
    try {
      await adminMutate(`/api/notifications/read-all`, "PATCH");
      mutate((prev) => ({
        ...prev,
        items: prev.items.map((x) => ({ ...x, read_at: x.read_at || new Date().toISOString() })),
        counts: { ...prev.counts, unread: 0 },
      }));
    } catch {
      refetch();
    }
  };

  const cats = Object.keys(CATEGORY_META);

  return (
    <div dir="rtl" className="p-4 md:p-6 max-w-7xl mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
            <Bell className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white">مركز الإشعارات</h1>
            <p className="text-xs text-slate-400">
              {data.counts.unread > 0
                ? `لديك ${data.counts.unread} إشعار غير مقروء`
                : "كل الإشعارات مقروءة"}
              {data.counts.urgent > 0 && (
                <span className="mr-2 inline-flex items-center gap-1 text-red-400">
                  · <AlertTriangle className="w-3 h-3" /> {data.counts.urgent} عاجل
                </span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={markAllRead}
          disabled={data.counts.unread === 0}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <CheckCheck className="w-4 h-4" />
          تحديد الكل كمقروء
        </button>
      </header>

      {/* Category tiles — click to filter */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 mb-6">
        <button
          onClick={() => setCategory("")}
          className={`p-3 rounded-xl border text-start transition ${
            category === ""
              ? "bg-amber-500/15 border-amber-500/50 text-amber-300"
              : "bg-slate-900/40 border-slate-700 text-slate-300 hover:border-slate-500"
          }`}
        >
          <div className="text-xs">الكل</div>
          <div className="text-lg font-bold mt-1">{data.total}</div>
        </button>
        {cats.map((cat) => {
          const meta = CATEGORY_META[cat];
          const Icon = meta.icon;
          const n = data.counts.byCategory[cat] || 0;
          return (
            <button
              key={cat}
              onClick={() => setCategory(cat === category ? "" : cat)}
              className={`p-3 rounded-xl border text-start transition ${
                category === cat ? meta.tone + " ring-2 ring-current/40" : "bg-slate-900/40 border-slate-700 text-slate-300 hover:border-slate-500"
              }`}
            >
              <div className="flex items-center gap-1 text-xs">
                <Icon className="w-3 h-3" /> {meta.label}
              </div>
              <div className="text-lg font-bold mt-1">{n}</div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-slate-900/40 border border-slate-700 rounded-xl p-3 mb-4 flex flex-wrap items-center gap-3">
        <Filter className="w-4 h-4 text-slate-400" />
        <label className="inline-flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="rounded border-slate-600 bg-slate-800"
          />
          غير المقروء فقط
        </label>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
        >
          <option value="">كل الأولويات</option>
          <option value="urgent">عاجل</option>
          <option value="high">مرتفع</option>
          <option value="medium">متوسط</option>
          <option value="low">منخفض</option>
        </select>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث في العنوان أو النص..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pr-9 pl-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-500"
          />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="py-12 flex items-center justify-center text-slate-400">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300">
          خطأ: {error}
        </div>
      ) : data.items.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-slate-900/30 border border-dashed border-slate-700 rounded-xl">
          <Bell className="w-10 h-10 mx-auto mb-3 text-slate-600" />
          لا توجد إشعارات تطابق التصفية الحالية.
        </div>
      ) : (
        <div className="space-y-2">
          {data.items.map((n) => {
            const meta = CATEGORY_META[n.category || "system"] || CATEGORY_META.system;
            const Icon = meta.icon;
            const unread = !n.read_at;
            const priTone = PRIORITY_TONE[n.priority || "medium"];
            return (
              <div
                key={n.id}
                className={`group p-4 rounded-xl border transition ${
                  unread
                    ? "bg-slate-900/60 border-amber-500/30"
                    : "bg-slate-900/30 border-slate-800"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 shrink-0 rounded-lg border flex items-center justify-center ${meta.tone}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className={`text-sm font-semibold ${unread ? "text-white" : "text-slate-300"}`}>
                        {n.title}
                      </h3>
                      {n.category && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${meta.tone}`}>
                          {meta.label}
                        </span>
                      )}
                      {n.priority && n.priority !== "medium" && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${priTone}`}>
                          {n.priority === "urgent" ? "عاجل" : n.priority === "high" ? "مرتفع" : n.priority}
                        </span>
                      )}
                      {unread && <span className="w-2 h-2 rounded-full bg-amber-400" />}
                    </div>
                    {n.body && (
                      <p className="text-sm text-slate-400 mt-1 line-clamp-2">{n.body}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-500">
                      {n.actor_name_snapshot && (
                        <span>من: {n.actor_name_snapshot}</span>
                      )}
                      <span>{formatRelative(n.created_at)}</span>
                      {n.link && (
                        <Link
                          href={n.link}
                          onClick={() => unread && markRead(n)}
                          className="text-amber-400 hover:text-amber-300 underline-offset-2 hover:underline"
                        >
                          فتح
                        </Link>
                      )}
                      {unread && (
                        <button
                          onClick={() => markRead(n)}
                          className="text-slate-400 hover:text-slate-200"
                        >
                          تحديد كمقروء
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatRelative(iso: string): string {
  try {
    const t = new Date(iso).getTime();
    const diff = (Date.now() - t) / 1000;
    if (diff < 60) return "قبل لحظات";
    if (diff < 3600) return `قبل ${Math.floor(diff / 60)} دقيقة`;
    if (diff < 86400) return `قبل ${Math.floor(diff / 3600)} ساعة`;
    if (diff < 7 * 86400) return `قبل ${Math.floor(diff / 86400)} يوم`;
    return new Date(iso).toLocaleDateString("ar");
  } catch {
    return iso;
  }
}
