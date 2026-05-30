"use client";

import { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  Banknote,
  Bot,
  Crown,
  Headset,
  ShieldCheck,
  Zap,
  Moon,
  Bell,
} from "lucide-react";

export type PulseSeverity = "critical" | "high" | "normal" | "low";

export type PlatformPulseEvent = {
  id: string;
  severity: PulseSeverity;
  title: string;
  subtitle: string;
  timeLabel: string;
  icon: "finance" | "ticket" | "listing" | "ai" | "payment" | "security" | "system";
};

const ICON_MAP = {
  finance: Banknote,
  ticket: Headset,
  listing: Crown,
  ai: Bot,
  payment: Zap,
  security: ShieldCheck,
  system: Bell,
} as const;

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://baytaljazeera-backend.onrender.com";

type RawNotification = {
  id: number | string;
  title?: string;
  body?: string;
  type?: string | null;
  category?: string | null;
  priority?: string | null;
  created_at: string;
};

// Map a backend notification onto a pulse event. Keeps the dashboard
// honest: a reset on /reset-data leaves /notifications empty, which
// leaves this list empty, which leaves "كل شيء هادئ الآن" on screen.
function notificationToPulse(n: RawNotification): PlatformPulseEvent {
  const sev: PulseSeverity =
    n.priority === "urgent"
      ? "critical"
      : n.priority === "high"
        ? "high"
        : n.priority === "low"
          ? "low"
          : "normal";
  const icon: PlatformPulseEvent["icon"] =
    n.category === "escalation"
      ? "ticket"
      : n.category === "reply" || n.category === "directive"
        ? "ticket"
        : n.category === "complaint"
          ? "ticket"
          : /payment|invoice|refund|finance/i.test(`${n.type || ""} ${n.title || ""}`)
            ? "finance"
            : /listing|elite|نخبة|إعلان/i.test(`${n.title || ""}`)
              ? "listing"
              : /ai|ذكاء/i.test(`${n.title || ""}`)
                ? "ai"
                : "system";
  return {
    id: String(n.id),
    severity: sev,
    title: (n.title || "حدث جديد").slice(0, 80),
    subtitle: (n.body || "").slice(0, 110),
    timeLabel: relativeTime(n.created_at),
    icon,
  };
}

function relativeTime(iso: string): string {
  try {
    const t = new Date(iso).getTime();
    const diff = (Date.now() - t) / 1000;
    if (diff < 60) return "الآن";
    if (diff < 3600) return `قبل ${Math.floor(diff / 60)} د`;
    if (diff < 86400) return `قبل ${Math.floor(diff / 3600)} س`;
    return `قبل ${Math.floor(diff / 86400)} يوم`;
  } catch {
    return "";
  }
}

function severityDot(s: PulseSeverity) {
  switch (s) {
    case "critical":
      return "bg-rose-500";
    case "high":
      return "bg-amber-500";
    case "normal":
      return "bg-emerald-500";
    default:
      return "bg-slate-300";
  }
}

function severityLabel(s: PulseSeverity) {
  switch (s) {
    case "critical":
      return "حرج";
    case "high":
      return "مهم";
    case "normal":
      return "اعتيادي";
    default:
      return "منخفض";
  }
}

export function PlatformPulse() {
  const [events, setEvents] = useState<PlatformPulseEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);

  // Pull real notifications and refresh every minute. Auth cookie /
  // bearer is needed; if the page is on the admin shell that already
  // hydrated the token, this works without any extra wiring.
  useEffect(() => {
    let cancelled = false;
    const fetchPulse = async () => {
      try {
        const token =
          typeof window !== "undefined"
            ? localStorage.getItem("token")
            : null;
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`${API_URL}/api/notifications/recent`, {
          credentials: "include",
          headers,
        });
        if (!res.ok) {
          if (!cancelled) {
            setEvents([]);
            setLoaded(true);
          }
          return;
        }
        const data = await res.json();
        const raw: RawNotification[] = data.notifications || [];
        if (!cancelled) {
          setEvents(raw.slice(0, 8).map(notificationToPulse));
          setLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setEvents([]);
          setLoaded(true);
        }
      }
    };
    fetchPulse();
    const id = window.setInterval(fetchPulse, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const liveLabel = useMemo(() => {
    const d = new Date();
    return d.toLocaleTimeString("ar-SA", {
      hour: "2-digit",
      minute: "2-digit",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-[#EDE6D6] bg-white"
      dir="rtl"
    >
      <div className="pointer-events-none absolute -left-12 -top-12 w-44 h-44 rounded-full bg-[#D4AF37]/10 blur-3xl" />

      <div className="relative flex items-start justify-between gap-4 px-6 py-5 border-b border-[#EDE6D6]">
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0 mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FAF8F4] border border-[#EDE6D6]">
            <Activity className="h-5 w-5 text-[#D4AF37]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg md:text-xl font-bold text-[#002845]">
              نبض المنصة
            </h2>
            <p className="text-xs md:text-sm text-slate-500 mt-0.5">
              آخر العمليات الحرجة على المنصة
            </p>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2 text-xs">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#D4AF37] opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#D4AF37]" />
          </span>
          <span className="text-slate-400 tabular-nums">{liveLabel}</span>
        </div>
      </div>

      <div className="relative max-h-[420px] overflow-y-auto">
        {!loaded ? (
          <div className="py-14 text-center text-slate-400 text-sm">
            جاري تحميل النبض...
          </div>
        ) : events.length === 0 ? (
          <div className="py-14 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#FAF8F4] border border-[#EDE6D6] flex items-center justify-center">
              <Moon className="w-5 h-5 text-[#D4AF37]" />
            </div>
            <p className="text-sm font-semibold text-[#002845]">
              كل شيء هادئ الآن
            </p>
            <p className="text-xs text-slate-400 mt-1.5">
              ستظهر هنا كل العمليات الحرجة فور حدوثها
            </p>
          </div>
        ) : (
          <ol className="relative py-2 pr-5 pl-3 md:pr-7 md:pl-5">
            <span
              className="absolute right-[1.6rem] md:right-[2.1rem] top-3 bottom-3 w-px bg-[#EDE6D6]"
              aria-hidden
            />
            <AnimatePresence initial={false}>
              {events.map((ev, i) => {
                const Icon = ICON_MAP[ev.icon] || Bell;
                return (
                  <motion.li
                    key={ev.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.3,
                      delay: i * 0.04,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="group relative"
                  >
                    <div className="flex items-start gap-3 rounded-2xl px-3 py-3 transition hover:bg-[#FAF8F4]">
                      <div className="relative shrink-0 mt-1.5">
                        <span
                          className={`block h-2.5 w-2.5 rounded-full ${severityDot(
                            ev.severity
                          )} ring-4 ring-white shadow-sm`}
                          aria-label={severityLabel(ev.severity)}
                        />
                      </div>

                      <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-[#FAF8F4] border border-[#EDE6D6] transition group-hover:border-[#D4AF37]/40">
                        <Icon className="h-4 w-4 text-[#9A7D28]" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-semibold text-[#002845] leading-snug">
                            {ev.title}
                          </p>
                          <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                            {ev.timeLabel}
                          </span>
                        </div>
                        {ev.subtitle && (
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                            {ev.subtitle}
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ol>
        )}
      </div>
    </section>
  );
}
