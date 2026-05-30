"use client";

/**
 * Notification Center — unified admin view of every event addressed to me.
 *
 * Categories come from backend/services/notificationService.js:
 *   directive | transfer | assignment | escalation | reply | complaint
 *   | mention | system
 *
 * Permission-aware via useAdminGate. Status (urgent / high) drives a
 * loud left rail + tinted card so a screenful of normal items still
 * makes the dangerous ones pop.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CheckCheck,
  Filter,
  AlertTriangle,
  Crown,
  Inbox as InboxIcon,
  ArrowRightLeft,
  ClipboardList,
  AtSign,
  Settings as SettingsIcon,
  MessageSquareReply,
  Search,
  Loader2,
  Sparkles,
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
  counts: {
    byCategory: Record<string, number>;
    unread: number;
    urgent: number;
  };
  page: { limit: number; offset: number };
};

const CATEGORY_META: Record<
  string,
  { label: string; icon: typeof Bell }
> = {
  directive: { label: "توجيهات", icon: ClipboardList },
  assignment: { label: "تكليفات", icon: ClipboardList },
  transfer: { label: "تحويلات", icon: ArrowRightLeft },
  escalation: { label: "تصعيد", icon: AlertTriangle },
  reply: { label: "ردود", icon: MessageSquareReply },
  complaint: { label: "شكاوى جديدة", icon: InboxIcon },
  mention: { label: "إشارات", icon: AtSign },
  system: { label: "النظام", icon: SettingsIcon },
};

// Priority → visual urgency. ONE pill style per priority, used everywhere.
const PRIORITY_LABEL: Record<string, string> = {
  urgent: "عاجل",
  high: "مرتفع",
  medium: "متوسط",
  low: "منخفض",
};

function priorityPill(p?: string | null) {
  switch (p) {
    case "urgent":
      return "bg-rose-100 text-rose-700 border-rose-300";
    case "high":
      return "bg-amber-100 text-amber-800 border-amber-300";
    case "low":
      return "bg-slate-50 text-slate-500 border-slate-200";
    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

// Card chrome per priority. Urgent / high get a loud left rail + tinted bg
// so they pull the eye in a feed of normal items.
function cardChrome(p: string | null | undefined, unread: boolean): string {
  if (p === "urgent") {
    return "border-rose-200 bg-rose-50/60 ring-1 ring-rose-200 shadow-[0_0_0_4px_rgba(244,63,94,0.05)]";
  }
  if (p === "high") {
    return "border-amber-200 bg-amber-50/50";
  }
  if (unread) {
    return "border-[#EDE6D6] bg-[#FFFCEE]";
  }
  return "border-[#EDE6D6] bg-white";
}

function railColor(p: string | null | undefined): string {
  if (p === "urgent") return "bg-rose-500";
  if (p === "high") return "bg-amber-500";
  return "bg-[#D4AF37]";
}

export default function NotificationsCenterPage() {
  const { ready, allowed } = useAdminGate({
    anyRole: [
      "super_admin",
      "admin",
      "admin_manager",
      "finance_admin",
      "support_admin",
      "content_admin",
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

  const { data, loading, error, refetch, mutate } =
    useAdminFetch<CenterResponse>(
      `/api/notifications/center?${qs}`,
      {
        items: [],
        total: 0,
        counts: { byCategory: {}, unread: 0, urgent: 0 },
        page: { limit: 100, offset: 0 },
      },
      [qs]
    );

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
          <p className="text-slate-500">غير مصرح بالوصول إلى مركز الإشعارات</p>
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
          x.id === n.id
            ? { ...x, read_at: x.read_at || new Date().toISOString() }
            : x
        ),
        counts: { ...prev.counts, unread: Math.max(0, prev.counts.unread - 1) },
      }));
    } catch {
      refetch();
    }
  };

  const markAllRead = async () => {
    try {
      await adminMutate(`/api/notifications/read-all`, "PATCH");
      mutate((prev) => ({
        ...prev,
        items: prev.items.map((x) => ({
          ...x,
          read_at: x.read_at || new Date().toISOString(),
        })),
        counts: { ...prev.counts, unread: 0 },
      }));
    } catch {
      refetch();
    }
  };

  const cats = Object.keys(CATEGORY_META);
  const hasUrgent = data.counts.urgent > 0;

  return (
    <div dir="rtl" className="space-y-8">
      {/* ── Hero header ─────────────────────────────────────────────── */}
      <header className="relative overflow-hidden rounded-3xl border border-[#EDE6D6] bg-gradient-to-l from-white via-[#FAF8F4] to-white">
        <div className="pointer-events-none absolute -left-12 -top-12 w-48 h-48 rounded-full bg-[#D4AF37]/15 blur-3xl" />
        {hasUrgent && (
          <div className="pointer-events-none absolute -right-12 -top-12 w-48 h-48 rounded-full bg-rose-400/20 blur-3xl animate-pulse" />
        )}
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
          <div className="flex items-start gap-4 min-w-0">
            <div className="shrink-0 w-14 h-14 rounded-2xl bg-white border border-[#EDE6D6] shadow-sm flex items-center justify-center relative">
              <Bell className="w-7 h-7 text-[#D4AF37]" />
              {data.counts.unread > 0 && (
                <span className="absolute -top-1 -left-1 min-w-[20px] h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                  {data.counts.unread > 99 ? "99+" : data.counts.unread}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-[#9A7D28] tracking-[0.2em] uppercase mb-1 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" />
                Inbox
              </p>
              <h1 className="text-2xl md:text-3xl font-black text-[#002845] leading-tight">
                مركز الإشعارات
              </h1>
              <p className="text-sm text-slate-500 mt-1.5">
                {data.counts.unread > 0
                  ? `لديك ${data.counts.unread} إشعار غير مقروء`
                  : "كل الإشعارات مقروءة"}
                {hasUrgent && (
                  <span className="mr-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold mt-2">
                    <AlertTriangle className="w-3 h-3" />
                    {data.counts.urgent} عاجل
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={markAllRead}
            disabled={data.counts.unread === 0}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#D4AF37]/40 text-[#9A7D28] bg-white hover:bg-[#FFFCEE] active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CheckCheck className="w-4 h-4" />
            تحديد الكل كمقروء
          </button>
        </div>
      </header>

      {/* ── Category tiles ─────────────────────────────────────────── */}
      <section>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-9 gap-2.5">
          <CategoryTile
            label="الكل"
            icon={InboxIcon}
            count={data.total}
            active={category === ""}
            onClick={() => setCategory("")}
          />
          {cats.map((cat) => {
            const meta = CATEGORY_META[cat];
            const n = data.counts.byCategory[cat] || 0;
            const isEscalation = cat === "escalation" && n > 0;
            return (
              <CategoryTile
                key={cat}
                label={meta.label}
                icon={meta.icon}
                count={n}
                active={category === cat}
                onClick={() => setCategory(cat === category ? "" : cat)}
                attention={isEscalation}
              />
            );
          })}
        </div>
      </section>

      {/* ── Filters ───────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-[#EDE6D6] bg-white p-3 md:p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-500 shrink-0">
          <Filter className="w-3.5 h-3.5" />
          تصفية
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-[#002845] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="rounded border-slate-300 text-[#D4AF37] focus:ring-[#D4AF37]/30"
          />
          غير المقروء فقط
        </label>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-[#002845] focus:outline-none focus:border-[#D4AF37]/50"
        >
          <option value="">كل الأولويات</option>
          <option value="urgent">عاجل</option>
          <option value="high">مرتفع</option>
          <option value="medium">متوسط</option>
          <option value="low">منخفض</option>
        </select>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث في العنوان أو النص..."
            className="w-full bg-white border border-slate-200 rounded-lg pr-9 pl-3 py-1.5 text-sm text-[#002845] placeholder:text-slate-400 focus:outline-none focus:border-[#D4AF37]/50"
          />
        </div>
      </section>

      {/* ── List ──────────────────────────────────────────────────── */}
      <section>
        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
            خطأ: {error}
          </div>
        ) : data.items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[#EDE6D6] bg-white p-16 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#FAF8F4] border border-[#EDE6D6] flex items-center justify-center">
              <Bell className="w-6 h-6 text-[#D4AF37]" />
            </div>
            <p className="text-sm text-slate-500">
              لا توجد إشعارات تطابق التصفية الحالية
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {data.items.map((n) => {
              const meta =
                CATEGORY_META[n.category || "system"] || CATEGORY_META.system;
              const Icon = meta.icon;
              const unread = !n.read_at;
              const pri = n.priority;
              return (
                <li key={n.id}>
                  <div
                    className={`relative overflow-hidden rounded-2xl border transition group ${cardChrome(
                      pri,
                      unread
                    )}`}
                  >
                    {/* Loud left rail when priority is urgent/high */}
                    <span
                      className={`absolute right-0 top-0 bottom-0 w-1 ${railColor(
                        pri
                      )} ${pri === "urgent" || pri === "high" ? "opacity-100" : unread ? "opacity-60" : "opacity-0"}`}
                      aria-hidden
                    />
                    <div className="flex items-start gap-3 p-4 md:p-5 pr-5 md:pr-6">
                      <div
                        className={`w-10 h-10 shrink-0 rounded-xl border flex items-center justify-center transition ${
                          pri === "urgent"
                            ? "border-rose-300 bg-rose-100 text-rose-700"
                            : pri === "high"
                              ? "border-amber-300 bg-amber-100 text-amber-700"
                              : "border-[#EDE6D6] bg-[#FAF8F4] text-[#9A7D28]"
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3
                            className={`text-sm md:text-base font-bold ${
                              unread ? "text-[#002845]" : "text-slate-600"
                            }`}
                          >
                            {n.title}
                          </h3>
                          {n.category && (
                            <span className="text-[11px] px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-600">
                              {meta.label}
                            </span>
                          )}
                          {pri && pri !== "medium" && (
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${priorityPill(
                                pri
                              )}`}
                            >
                              {pri === "urgent" && (
                                <AlertTriangle className="inline w-3 h-3 ml-0.5" />
                              )}
                              {PRIORITY_LABEL[pri] || pri}
                            </span>
                          )}
                          {unread && (
                            <span
                              className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse"
                              aria-label="غير مقروء"
                            />
                          )}
                        </div>
                        {n.body && (
                          <p
                            className={`text-sm mt-1 leading-relaxed ${
                              unread ? "text-slate-600" : "text-slate-500"
                            } line-clamp-2`}
                          >
                            {n.body}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-500">
                          {n.actor_name_snapshot && (
                            <span className="flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-slate-300" />
                              من: <span className="text-[#002845]">{n.actor_name_snapshot}</span>
                            </span>
                          )}
                          <span className="tabular-nums">
                            {formatRelative(n.created_at)}
                          </span>
                          <div className="mr-auto flex items-center gap-3">
                            {n.link && (
                              <Link
                                href={n.link}
                                onClick={() => unread && markRead(n)}
                                className="text-[#9A7D28] hover:underline font-semibold"
                              >
                                فتح ←
                              </Link>
                            )}
                            {unread && (
                              <button
                                onClick={() => markRead(n)}
                                className="text-slate-400 hover:text-[#9A7D28] transition"
                              >
                                تحديد كمقروء
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─── Visual primitives ─────────────────────────────────────────────────────
function CategoryTile({
  label,
  icon: Icon,
  count,
  active,
  attention,
  onClick,
}: {
  label: string;
  icon: typeof Bell;
  count: number;
  active: boolean;
  attention?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group rounded-2xl border p-3 text-right transition ${
        active
          ? "border-[#D4AF37] bg-[#FFFCEE] ring-2 ring-[#D4AF37]/30"
          : attention
            ? "border-rose-200 bg-rose-50/50 hover:border-rose-300"
            : "border-[#EDE6D6] bg-white hover:border-[#D4AF37]/50"
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <Icon
          className={`w-4 h-4 ${
            attention ? "text-rose-500" : "text-[#D4AF37]"
          }`}
        />
        {count > 0 && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold tabular-nums ${
              attention
                ? "bg-rose-500 text-white"
                : active
                  ? "bg-[#D4AF37] text-white"
                  : "bg-[#FAF8F4] text-[#9A7D28] border border-[#EDE6D6]"
            }`}
          >
            {count}
          </span>
        )}
      </div>
      <p
        className={`text-xs font-semibold ${
          active ? "text-[#9A7D28]" : "text-[#002845]"
        }`}
      >
        {label}
      </p>
    </button>
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
