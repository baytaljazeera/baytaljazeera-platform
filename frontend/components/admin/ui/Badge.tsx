"use client";

import { ReactNode } from "react";

// FOUR tones + neutral. Anything more is a UX bug — operations
// staff don't need to learn ten color codes to triage a queue.

export type BJBadgeTone = "neutral" | "info" | "ok" | "warn" | "bad" | "gold";

const TONE: Record<BJBadgeTone, string> = {
  neutral: "bg-brand-paper-2 text-brand-ink ring-brand-royal/10",
  info:    "bg-info-soft text-info ring-info/30",
  ok:      "bg-ok-soft   text-ok   ring-ok/30",
  warn:    "bg-warn-soft text-warn ring-warn/30",
  bad:     "bg-bad-soft  text-bad  ring-bad/30",
  gold:    "bg-brand-gold-soft text-brand-gold-dark ring-brand-gold/40",
};

export function BJBadge({
  tone = "neutral",
  size = "md",
  dot = false,
  pulse = false,
  children,
}: {
  tone?: BJBadgeTone;
  size?: "sm" | "md";
  dot?: boolean;
  pulse?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 ring-1 font-bold whitespace-nowrap rounded-bj-sm",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]",
        TONE[tone],
      ].join(" ")}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full bg-current ${pulse ? "animate-pulse" : ""}`} />}
      {children}
    </span>
  );
}
