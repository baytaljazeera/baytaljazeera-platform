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
        className="group block bg-white rounded-bj-lg border border-brand-royal/10 shadow-card p-3 sm:p-4 transition-shadow duration-200 hover:shadow-pop hover:border-brand-royal/20 focus-visible:shadow-focus-gold outline-none"
      >
        {props.children}
      </a>
    ) : (
      <div className="bg-white rounded-bj-lg border border-brand-royal/10 shadow-card p-3 sm:p-4">
        {props.children}
      </div>
    );

  return (
    <Wrapper>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] sm:text-[11px] uppercase tracking-wide font-bold text-brand-ink-2 leading-tight">{label}</p>
          <div className="mt-1.5 bj-stat leading-none truncate">
            {loading ? <span className="inline-block h-7 w-16 rounded-bj-sm bg-brand-paper-2 animate-pulse" /> : value}
          </div>
          {(delta || hint) && (
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
              {delta && (
                <span
                  className={[
                    "inline-flex items-center gap-0.5 text-[10px] font-bold rounded-bj-sm px-1.5 py-0.5",
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
              {hint && <p className="text-[10px] text-brand-ink-2 leading-tight line-clamp-1">{hint}</p>}
            </div>
          )}
        </div>
        {icon && (
          <div className="shrink-0 w-8 h-8 rounded-bj-md bg-brand-gold-soft text-brand-gold-dark flex items-center justify-center ring-1 ring-brand-gold/20">
            {icon}
          </div>
        )}
      </div>
    </Wrapper>
  );
}
