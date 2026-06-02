"use client";

import { ReactNode } from "react";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

// KPI strip card. Single ROW of these across the dashboard.
// Each card answers: "what's the number right now + is it moving?"

export function BJStatCard({
  label,
  value,
  hint,
  icon,
  delta,
  href,
  loading,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  delta?: { value: string; direction: "up" | "down" | "flat" };
  href?: string;
  loading?: boolean;
}) {
  const Wrapper = (props: { children: ReactNode }) =>
    href ? (
      <a
        href={href}
        className="group block bg-white rounded-bj-lg border border-brand-royal/10 shadow-card p-5 transition-shadow duration-200 hover:shadow-pop hover:border-brand-royal/20 focus-visible:shadow-focus-gold outline-none"
      >
        {props.children}
      </a>
    ) : (
      <div className="bg-white rounded-bj-lg border border-brand-royal/10 shadow-card p-5">
        {props.children}
      </div>
    );

  return (
    <Wrapper>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="bj-meta uppercase tracking-wide font-bold">{label}</p>
          <div className="mt-2 bj-stat truncate">
            {loading ? <span className="inline-block h-9 w-20 rounded-bj-sm bg-brand-paper-2 animate-pulse" /> : value}
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {delta && (
              <span
                className={[
                  "inline-flex items-center gap-0.5 text-[11px] font-bold rounded-bj-sm px-1.5 py-0.5",
                  delta.direction === "up"   ? "text-ok   bg-ok-soft"   :
                  delta.direction === "down" ? "text-bad  bg-bad-soft"  :
                                               "text-brand-ink-2 bg-brand-paper-2",
                ].join(" ")}
              >
                {delta.direction === "up"   ? <ArrowUpRight className="w-3 h-3" />   :
                 delta.direction === "down" ? <ArrowDownRight className="w-3 h-3" /> :
                                              <Minus className="w-3 h-3" />}
                {delta.value}
              </span>
            )}
            {hint && <p className="bj-meta">{hint}</p>}
          </div>
        </div>
        {icon && (
          <div className="shrink-0 w-10 h-10 rounded-bj-md bg-brand-gold-soft text-brand-gold-dark flex items-center justify-center ring-1 ring-brand-gold/20">
            {icon}
          </div>
        )}
      </div>
    </Wrapper>
  );
}
