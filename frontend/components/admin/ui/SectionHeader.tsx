"use client";

import { ReactNode } from "react";

// Use inside a card or page section to label a sub-grouping.
// Same shape everywhere → operator's eye learns the pattern fast.

export function BJSectionHeader({
  title,
  hint,
  action,
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3">
      <div className="min-w-0">
        <h2 className="bj-h2">{title}</h2>
        {hint && <p className="bj-meta mt-0.5">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
