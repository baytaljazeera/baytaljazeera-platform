"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Clock } from "lucide-react";
import { BJBadge, BJBadgeTone } from "./Badge";

// ─────────────────────────────────────────────────────────────────
// The MOST IMPORTANT component on the dashboard. Each card answers:
//   "Right now, X things are stuck on YOU. Click here to handle them."
//
// Designed so an operator can see 4-6 of these side by side and know
// within 2 seconds where the bottleneck is. No decoration, no
// charts, no marketing copy. Just count + reason + go button.
// ─────────────────────────────────────────────────────────────────

export function BJAttentionCard({
  count,
  label,
  reason,
  href,
  ctaLabel = "افتح القائمة",
  tone = "warn",
  icon,
  oldestAgeHours,
}: {
  count: number;
  label: string;
  reason: string;
  href: string;
  ctaLabel?: string;
  tone?: BJBadgeTone;
  icon?: ReactNode;
  oldestAgeHours?: number | null;
}) {
  const isUrgent = (oldestAgeHours ?? 0) >= 24;
  const isStale  = (oldestAgeHours ?? 0) >= 6 && !isUrgent;

  // Tone overrides — older = louder
  const effectiveTone: BJBadgeTone = isUrgent ? "bad" : isStale ? "warn" : tone;

  const RING: Record<BJBadgeTone, string> = {
    neutral: "border-brand-royal/10",
    info:    "border-info/30",
    ok:      "border-ok/30",
    warn:    "border-warn/40",
    bad:     "border-bad/50",
    gold:    "border-brand-gold/40",
  };

  const ACCENT: Record<BJBadgeTone, string> = {
    neutral: "bg-brand-paper-2 text-brand-ink",
    info:    "bg-info-soft     text-info",
    ok:      "bg-ok-soft       text-ok",
    warn:    "bg-warn-soft     text-warn",
    bad:     "bg-bad-soft      text-bad",
    gold:    "bg-brand-gold-soft text-brand-gold-dark",
  };

  return (
    <Link
      href={href}
      className={[
        "group flex flex-col bg-white rounded-bj-lg shadow-card border",
        "transition-all duration-200 hover:shadow-pop active:scale-[0.99]",
        "focus-visible:outline-none focus-visible:shadow-focus-gold",
        "p-4 sm:p-5 min-h-[150px]",
        RING[effectiveTone],
      ].join(" ")}
    >
      {/* Top row: icon (small) + urgency badge */}
      <div className="flex items-center justify-between gap-2">
        <div className={`w-9 h-9 rounded-bj-md flex items-center justify-center ${ACCENT[effectiveTone]}`}>
          {icon}
        </div>
        {isUrgent && <BJBadge tone="bad" size="sm" dot pulse>عاجل</BJBadge>}
        {isStale && !isUrgent && <BJBadge tone="warn" size="sm" dot>متأخر</BJBadge>}
      </div>

      {/* Count + label — count is the hero, label is secondary */}
      <div className="mt-3">
        <div className="bj-stat leading-none">{count}</div>
        <div className="mt-1 text-[13px] sm:text-[14px] font-bold text-brand-ink leading-snug line-clamp-2">
          {label}
        </div>
      </div>

      {/* Reason + clock — compact one-liner on mobile */}
      <p className="bj-meta mt-2 line-clamp-2">{reason}</p>
      {oldestAgeHours != null && oldestAgeHours > 0 && (
        <p className="mt-1 inline-flex items-center gap-1 bj-meta">
          <Clock className="w-3 h-3" />
          أقدم منذ {oldestAgeHours < 24
            ? `${oldestAgeHours} ساعة`
            : `${Math.floor(oldestAgeHours / 24)} يوم`}
        </p>
      )}

      {/* CTA pinned to the bottom */}
      <div className="mt-auto pt-3 flex items-center justify-between text-brand-gold-dark font-bold text-[12px]">
        <span>{ctaLabel}</span>
        <ArrowLeft className="w-3.5 h-3.5 group-hover:translate-x-[-3px] transition-transform" />
      </div>
    </Link>
  );
}
