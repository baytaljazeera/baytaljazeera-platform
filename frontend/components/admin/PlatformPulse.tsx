"use client";

import { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  ArrowRightLeft,
  Banknote,
  Bot,
  Crown,
  Headset,
  Radio,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

export type PulseSeverity = "critical" | "high" | "normal" | "low";

export type PlatformPulseEvent = {
  id: string;
  severity: PulseSeverity;
  title: string;
  subtitle: string;
  timeLabel: string;
  icon: "finance" | "ticket" | "listing" | "ai" | "payment" | "security";
};

const ICON_MAP = {
  finance: Banknote,
  ticket: Headset,
  listing: Crown,
  ai: Bot,
  payment: Zap,
  security: ShieldCheck,
} as const;

/** Seed data — replace with GET /api/admin/platform-pulse when backend is ready */
const SEED_EVENTS: PlatformPulseEvent[] = [
  {
    id: "1",
    severity: "critical",
    title: "تصعيد تذكرة → المالية",
    subtitle: "Ticket #4821 · تحويل يدوي من البريد الموحد",
    timeLabel: "منذ ٢ دقيقة",
    icon: "finance",
  },
  {
    id: "2",
    severity: "high",
    title: "فاتورة مدفوعة",
    subtitle: "اشتراك بريميوم · ٤٬٨٠٠ ر.س · بوابة مدى",
    timeLabel: "منذ ٦ دقائق",
    icon: "payment",
  },
  {
    id: "3",
    severity: "normal",
    title: "إعلان نخبة جديد (VIP)",
    subtitle: "الرياض · حي النرجس · بانتظار المراجعة المالية",
    timeLabel: "منذ ١٢ دقيقة",
    icon: "listing",
  },
  {
    id: "4",
    severity: "normal",
    title: "تصعيد ذكاء اصطناعي",
    subtitle: "جلسة AI · سبب: طلب تعقيد اشتراك متعدد الباقات",
    timeLabel: "منذ ١٨ دقيقة",
    icon: "ai",
  },
  {
    id: "5",
    severity: "low",
    title: "مزامنة صندوق الوارد",
    subtitle: "Omni-Inbox · محادثة موحّدة مع تذكرة دعم",
    timeLabel: "منذ ٢٤ دقيقة",
    icon: "ticket",
  },
  {
    id: "6",
    severity: "high",
    title: "تحقق أمني ناجح",
    subtitle: "تسجيل دخول مسؤول · IP مسموح · جلسة موثّقة",
    timeLabel: "منذ ٣١ دقيقة",
    icon: "security",
  },
];

function severityStyles(s: PulseSeverity) {
  switch (s) {
    case "critical":
      return {
        bar: "from-rose-500 via-orange-500 to-amber-400",
        glow: "shadow-[0_0_24px_rgba(244,63,94,0.35)]",
        ring: "ring-rose-500/40",
        dot: "bg-rose-400",
      };
    case "high":
      return {
        bar: "from-amber-400 to-yellow-300",
        glow: "shadow-[0_0_20px_rgba(251,191,36,0.3)]",
        ring: "ring-amber-400/35",
        dot: "bg-amber-400",
      };
    case "normal":
      return {
        bar: "from-cyan-400 to-emerald-400",
        glow: "shadow-[0_0_16px_rgba(34,211,238,0.22)]",
        ring: "ring-cyan-400/25",
        dot: "bg-cyan-400",
      };
    default:
      return {
        bar: "from-slate-400 to-slate-500",
        glow: "shadow-[0_0_12px_rgba(148,163,184,0.2)]",
        ring: "ring-slate-400/20",
        dot: "bg-slate-400",
      };
  }
}

export function PlatformPulse() {
  const events = useMemo(() => SEED_EVENTS, []);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 8000);
    return () => window.clearInterval(id);
  }, []);

  const liveLabel = useMemo(() => {
    const d = new Date();
    return d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }, [tick]);

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-950/95 via-[#0a1628] to-[#061018] text-white shadow-2xl"
      dir="rtl"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(212,175,55,0.12),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,transparent_40%,rgba(255,255,255,0.03)_50%,transparent_60%)] animate-platform-pulse-shimmer" />

      <div className="relative flex flex-col md:flex-row md:items-stretch gap-0 border-b border-white/10">
        <div className="flex-1 p-5 md:p-6 flex flex-col justify-center gap-3 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 ring-1 ring-white/10 backdrop-blur-md">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]" />
              </span>
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-300/90">
                Live
              </span>
              <Radio className="w-3.5 h-3.5 text-emerald-400/80" />
            </div>
            <span className="text-[10px] text-white/40 font-mono tabular-nums">{liveLabel}</span>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#D4AF37] to-amber-700 shadow-lg shadow-amber-900/40 ring-1 ring-amber-300/30">
              <Activity className="h-6 w-6 text-[#0a1628]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl md:text-2xl font-black tracking-tight bg-gradient-to-l from-white via-white to-white/70 bg-clip-text text-transparent">
                نبض المنصة
              </h2>
              <p className="text-sm text-white/55 mt-1 max-w-xl leading-relaxed">
                تدفق عمليات حرجة شبيه بمركز NOC — جاهز للربط مع سجل التدقيق الموحد عبر API لاحقاً.
              </p>
            </div>
          </div>
        </div>
        <div className="md:w-[200px] shrink-0 border-t md:border-t-0 md:border-r border-white/10 p-4 flex flex-col justify-center items-center gap-2 bg-white/[0.03] backdrop-blur-sm">
          <Sparkles className="w-8 h-8 text-[#D4AF37]/90" />
          <p className="text-[10px] text-center text-white/45 leading-snug px-2">
            بيانات تجريبية للعرض — استبدل بـ <code className="text-cyan-300/90">/api/admin/platform-pulse</code>
          </p>
        </div>
      </div>

      <div className="relative max-h-[340px] overflow-y-auto overscroll-contain scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        <div className="absolute left-8 top-0 bottom-0 w-px bg-gradient-to-b from-emerald-500/50 via-cyan-500/30 to-transparent md:left-12" aria-hidden />
        <ul className="relative py-3 pr-4 pl-3 md:pr-8 md:pl-6 space-y-1">
          <AnimatePresence initial={false}>
            {events.map((ev, i) => {
              const Icon = ICON_MAP[ev.icon];
              const st = severityStyles(ev.severity);
              return (
                <motion.li
                  key={ev.id}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                  className="group relative"
                >
                  <div
                    className={`flex gap-3 rounded-xl px-3 py-2.5 transition-all duration-300 ease-out hover:bg-white/[0.06] ${st.glow} hover:ring-1 ${st.ring}`}
                  >
                    <div className="relative flex w-8 shrink-0 flex-col items-center pt-1">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${st.dot} ring-4 ring-white/5 shadow-lg`}
                      />
                      {i < events.length - 1 ? (
                        <span className="mt-1 h-full min-h-[28px] w-px bg-gradient-to-b from-white/25 to-transparent" />
                      ) : null}
                    </div>
                    <div
                      className={`absolute right-[2.15rem] top-3 bottom-3 w-[3px] rounded-full bg-gradient-to-b ${st.bar} opacity-80 md:right-[2.75rem]`}
                    />
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10 backdrop-blur-md transition-transform duration-300 group-hover:scale-105">
                        <Icon className="h-5 w-5 text-[#D4AF37]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-bold text-white/95 leading-snug">{ev.title}</p>
                          <span className="text-[10px] font-mono text-white/35 tabular-nums shrink-0">
                            {ev.timeLabel}
                          </span>
                        </div>
                        <p className="text-xs text-white/50 mt-0.5 leading-relaxed">{ev.subtitle}</p>
                      </div>
                      <ArrowRightLeft className="h-4 w-4 shrink-0 text-white/15 opacity-0 transition-all duration-300 group-hover:opacity-100 group-hover:text-[#D4AF37]/80" />
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      </div>

    </section>
  );
}
