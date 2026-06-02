"use client";

import { ReactNode } from "react";

// Pages wrap their content with BJPageShell to get:
//   - paper background
//   - max-w-7xl content rail (keeps things readable on ultrawide)
//   - consistent gutter
//   - rtl direction
//
// Use this INSIDE AdminShell — AdminShell handles the sidebar +
// topbar; this controls the content rail under the topbar.

export function BJPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="w-full max-w-7xl mx-auto" dir="rtl">
      {children}
    </div>
  );
}
