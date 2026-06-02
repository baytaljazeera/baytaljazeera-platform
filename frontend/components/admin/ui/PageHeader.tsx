"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

// Same shape on every admin page. Breadcrumb (optional), display
// title, optional subtitle, and a slot for top-right actions.
// Helps the operator know "where am I + what can I do here".

export function BJPageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  meta,
}: {
  title: string;
  subtitle?: string;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="mb-5 sm:mb-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="mb-1.5 flex items-center gap-1 text-[11px] sm:text-[12px] text-brand-ink-2" aria-label="مسار التنقل">
          {breadcrumbs.map((b, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              {b.href ? (
                <Link href={b.href} className="hover:text-brand-royal transition-colors font-semibold">
                  {b.label}
                </Link>
              ) : (
                <span className="font-semibold text-brand-royal">{b.label}</span>
              )}
              {i < breadcrumbs.length - 1 && <ChevronLeft className="w-3 h-3 opacity-60" />}
            </span>
          ))}
        </nav>
      )}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h1 className="bj-display leading-tight">{title}</h1>
          {subtitle && <p className="bj-body mt-1 text-brand-ink-2 leading-snug">{subtitle}</p>}
          {meta && <div className="mt-2 sm:mt-3 flex items-center gap-1.5 flex-wrap">{meta}</div>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
      </div>
    </header>
  );
}
