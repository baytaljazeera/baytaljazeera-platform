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

// Status → one dot color. No barred gradients, no glow. Status hues
// reserved for actual meaning, not decoration.
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
  const events = useMemo(() => SEED_EVENTS, []);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 8000);
    return () => window.clearInterval(id);
  }, []);

  const liveLabel = useMemo(() => {
    const d = new Date();
    return d.toLocaleTimeString("ar-SA", {
      hour: "2-digit",
      minute: "2-digit",
    });
    // tick intentionally referenced for re-render on interval
  }, [tick]);

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-[#EDE6D6] bg-white"
      dir="rtl"
    >
      {/* Soft gold corner glow — calm, not loud */}
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
        <ol className="relative py-2 pr-5 pl-3 md:pr-7 md:pl-5">
          {/* Vertical hairline behind the dots */}
          <span
            className="absolute right-[1.6rem] md:right-[2.1rem] top-3 bottom-3 w-px bg-[#EDE6D6]"
            aria-hidden
          />
          <AnimatePresence initial={false}>
            {events.map((ev, i) => {
              const Icon = ICON_MAP[ev.icon];
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
                    {/* Status dot (only color cue) */}
                    <div className="relative shrink-0 mt-1.5">
                      <span
                        className={`block h-2.5 w-2.5 rounded-full ${severityDot(
                          ev.severity
                        )} ring-4 ring-white shadow-sm`}
                        aria-label={severityLabel(ev.severity)}
                      />
                    </div>

                    {/* Icon tile — neutral, no per-event coloring */}
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
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        {ev.subtitle}
                      </p>
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      </div>
    </section>
  );
}
