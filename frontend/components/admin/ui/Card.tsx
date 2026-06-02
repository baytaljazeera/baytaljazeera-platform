"use client";

import { HTMLAttributes, ReactNode } from "react";

// Single card shape. rounded-bj-lg (16px), shadow-card, paper-bg.
// Every admin card uses this. No exceptions.

interface BJCardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: "none" | "sm" | "md" | "lg";
  accent?: "none" | "gold" | "info" | "warn" | "bad" | "ok";
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

export function BJCard({
  padding = "md",
  accent = "none",
  hoverable = false,
  className = "",
  children,
  ...rest
}: BJCardProps) {
  return (
    <div
      className={[
        "bg-white rounded-bj-lg border border-brand-royal/10 shadow-card",
        PAD[padding],
        ACCENT[accent],
        hoverable ? "transition-shadow duration-200 hover:shadow-pop hover:border-brand-royal/20" : "",
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
