// ─────────────────────────────────────────────────────────────────
// /admin/finance-inbox — DEAD PAGE.
//
// This page used to combine three streams (account_complaints,
// support_tickets where department='financial', and pending refunds)
// into one "finance inbox". That was the architectural leak the owner
// has been complaining about: customer support tickets surfaced
// directly in front of finance, with click-through to
// /admin/customer-service (a support surface).
//
// Owner rule reset (10 rules):
//   - Finance never sees support tickets, regardless of role.
//   - Finance only sees Refund Request objects.
//
// The page is now a hard server-side redirect to the new finance
// dashboard, which surfaces refund-requests via /api/finance/refund-requests
// (summary-only, no ticket data). All inbound links from the sidebar
// or bookmarks land on the correct surface.
// ─────────────────────────────────────────────────────────────────

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function FinanceInboxRetiredRedirect() {
  redirect("/add-listing/admin/finance?tab=messages");
}
