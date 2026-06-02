// ─────────────────────────────────────────────────────────────────
// Shared rules for converting domain status → card visual state.
// Used wherever we render a list of tickets, refunds, or other
// stateful rows so the colour vocabulary stays identical.
//
//   attention  — needs operator's first/next action
//   working    — operator already acted, waiting on customer / process
//   resolved   — done, no further action
//   critical   — past SLA / very old → screams for attention
//   idle       — nothing to flag
// ─────────────────────────────────────────────────────────────────

import type { BJCardState } from "./Card";

/**
 * Pick a card state for a support ticket. Inputs:
 *   status                — 'new' | 'open' | 'in_progress' | 'resolved' | 'closed'
 *   lastReplyFrom        — 'customer' | 'staff' | null
 *   ageHoursSinceLastMsg — number | null  (used to escalate to critical)
 */
export function ticketCardState(args: {
  status: string;
  lastReplyFrom?: "customer" | "staff" | null;
  ageHoursSinceLastMsg?: number | null;
}): BJCardState {
  const { status, lastReplyFrom, ageHoursSinceLastMsg } = args;

  if (status === "resolved" || status === "closed") return "resolved";

  // Customer is waiting on us OR it's brand new — rose.
  if (status === "new" || status === "open" || lastReplyFrom === "customer") {
    if ((ageHoursSinceLastMsg ?? 0) >= 24) return "critical";
    return "attention";
  }
  // We already replied; ticket is open but not on us right now.
  if (status === "in_progress" && lastReplyFrom === "staff") return "working";
  return "idle";
}

/**
 * Pick a card state for a refund transaction.
 *   pending_customer_confirmation → working (waiting on customer)
 *   awaiting_bank_transfer        → attention (accountant must act)
 *   proof_uploaded                → working (waiting on final confirm)
 *   completed                     → resolved
 *   rejected                      → idle
 *   pending_review                → attention
 *   waiting_customer_info         → working
 */
export function refundCardState(status: string): BJCardState {
  switch (status) {
    case "pending_review":               return "attention";
    case "awaiting_bank_transfer":       return "critical";
    case "pending_customer_confirmation": return "working";
    case "waiting_customer_info":        return "working";
    case "proof_uploaded":               return "working";
    case "completed":                    return "resolved";
    case "rejected":                     return "idle";
    default:                             return "idle";
  }
}
