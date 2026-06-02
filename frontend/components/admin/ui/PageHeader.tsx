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
    <header className="mb-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="mb-2 flex items-center gap-1 text-[12px] text-brand-ink-2" aria-label="مسار التنقل">
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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="bj-display">{title}</h1>
          {subtitle && <p className="bj-body mt-1 text-brand-ink-2">{subtitle}</p>}
          {meta && <div className="mt-3 flex items-center gap-2 flex-wrap">{meta}</div>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
    </header>
  );
}
