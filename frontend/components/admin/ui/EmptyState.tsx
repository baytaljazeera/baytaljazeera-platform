"use client";

import { ReactNode } from "react";
import { BJButton, BJButtonVariant } from "./Button";

// Every table, list, board, and tab in the admin uses THIS for empty
// state. No more "0 rows in tbody and the user wonders if it loaded."
//
// Empty states must answer:
//   1. Is this loading or actually empty?  (we assume "empty")
//   2. Why is it empty? (helpful copy)
//   3. What should I do next? (CTA)

export function BJEmptyState({
  icon,
  title,
  body,
  primaryAction,
  secondaryAction,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  primaryAction?: { label: string; onClick?: () => void; href?: string; variant?: BJButtonVariant };
  secondaryAction?: { label: string; onClick?: () => void; href?: string };
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? "py-8" : "py-14"} px-6`}>
      {icon && (
        <div className="mb-4 w-14 h-14 rounded-bj-lg bg-brand-paper-2 text-brand-royal flex items-center justify-center ring-1 ring-brand-royal/10">
          {icon}
        </div>
      )}
      <h3 className="bj-h2">{title}</h3>
      {body && <p className="bj-body mt-2 max-w-md text-brand-ink-2">{body}</p>}
      {(primaryAction || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {primaryAction && (
            primaryAction.href ? (
              <a href={primaryAction.href}>
                <BJButton variant={primaryAction.variant ?? "primary"}>{primaryAction.label}</BJButton>
              </a>
            ) : (
              <BJButton variant={primaryAction.variant ?? "primary"} onClick={primaryAction.onClick}>
                {primaryAction.label}
              </BJButton>
            )
          )}
          {secondaryAction && (
            secondaryAction.href ? (
              <a href={secondaryAction.href}>
                <BJButton variant="ghost">{secondaryAction.label}</BJButton>
              </a>
            ) : (
              <BJButton variant="ghost" onClick={secondaryAction.onClick}>{secondaryAction.label}</BJButton>
            )
          )}
        </div>
      )}
    </div>
  );
}
