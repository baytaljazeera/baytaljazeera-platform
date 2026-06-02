"use client";

import { HTMLAttributes, ReactNode } from "react";

// Single card shape with STATE-DRIVEN BACKGROUND TINTS.
// The owner's rule: a card's background color tells the operator
// what state it's in at-a-glance, without reading any text.
//
//   idle       — white. Default. Nothing urgent here.
//   attention  — soft rose. NEW arrival, needs your action.
//   working    — soft amber. Something you've touched, in motion.
//   resolved   — soft emerald. Done. Sit-rep only.
//   critical   — stronger rose with pulse ring. Past SLA. Drop everything.
//
// Apply via state= prop on any BJCard or BJStatCard. The legacy
// `accent` prop (ring color) still works for non-state badges.

export type BJCardState = "idle" | "attention" | "working" | "resolved" | "critical";

interface BJCardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: "none" | "sm" | "md" | "lg";
  accent?: "none" | "gold" | "info" | "warn" | "bad" | "ok";
  state?: BJCardState;
  hoverable?: boolean;
}

const PAD: Record<NonNullable<BJCardProps["padding"]>, string> = {
  none: "p-0",
  sm:   "p-4",
  md:   "p-5",
  lg:   "p-6",
};

const ACCENT: Record<NonNullable<BJCardProps["accent"]>, string> = {
  none: "",
  gold: "ring-1 ring-brand-gold/30",
  info: "ring-1 ring-info/30",
  warn: "ring-1 ring-warn/30",
  bad:  "ring-1 ring-bad/30",
  ok:   "ring-1 ring-ok/30",
};

// Background + border tints per state. Designed to be readable
// in a long list — the operator scans rows and the colour itself
// tells them what's hot.
const STATE: Record<BJCardState, string> = {
  idle:      "bg-white border-brand-royal/10",
  attention: "bg-rose-50/70 border-rose-200",
  working:   "bg-amber-50/70 border-amber-200",
  resolved:  "bg-emerald-50/60 border-emerald-200",
  critical:  "bg-rose-100 border-rose-300 ring-2 ring-rose-300/40",
};

export function BJCard({
  padding = "md",
  accent = "none",
  state = "idle",
  hoverable = false,
  className = "",
  children,
  ...rest
}: BJCardProps) {
  return (
    <div
      className={[
        "rounded-bj-lg border shadow-card",
        STATE[state],
        PAD[padding],
        ACCENT[accent],
        hoverable ? "transition-all duration-200 hover:shadow-pop" : "",
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}

// Card sub-pieces for consistent internal structure
export function BJCardHeader({ title, action, hint }: { title: ReactNode; action?: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="min-w-0">
        <div className="bj-h2">{title}</div>
        {hint && <p className="bj-meta mt-0.5">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
