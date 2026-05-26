/**
 * Unified visibility for Customer Service: support tickets + account complaints.
 * Full access: super_admin, admin, support_admin.
 * Scoped: own tickets, assignment/review, department/category routing, auto_assigned_role.
 *
 * @param {number} paramStart - First $n index for this fragment (use 2 when $1 is reserved, e.g. ticket id).
 */

const FULL_ACCESS_ROLES = new Set(["super_admin", "admin", "support_admin"]);

function hasFullCustomerServiceAccess(role) {
  return FULL_ACCESS_ROLES.has(role);
}

function getSupportTicketScope(role, userId, paramStart = 1) {
  if (hasFullCustomerServiceAccess(role)) {
    return { clause: null, params: [] };
  }
  if (role === "user") {
    return { clause: `st.user_id = $${paramStart}`, params: [userId] };
  }

  const u = paramStart;
  const parts = [
    `st.user_id = $${u}`,
    `st.assigned_to = $${u}`,
    `st.auto_assigned_role = $${u + 1}`,
  ];
  const params = [userId, role];

  if (role === "finance_admin") {
    parts.push("st.department = 'financial'");
  } else if (role === "content_admin") {
    parts.push("st.department IN ('account', 'technical')");
  } else if (role === "admin_manager") {
    parts.push(`st.department = ANY($${u + 2}::text[])`);
    params.push(["financial", "account", "technical"]);
  }

  return { clause: `(${parts.join(" OR ")})`, params };
}

function getAccountComplaintScope(role, userId, paramStart = 1) {
  if (hasFullCustomerServiceAccess(role)) {
    return { clause: null, params: [] };
  }
  if (role === "user") {
    return { clause: `c.user_id = $${paramStart}`, params: [userId] };
  }

  const u = paramStart;
  const parts = [`c.user_id = $${u}`, `c.reviewed_by = $${u}`];
  const params = [userId];

  if (role === "finance_admin") {
    parts.push("c.category IN ('billing', 'subscription')");
    parts.push("c.complaint_type IN ('billing', 'refund')");
    parts.push("c.invoice_id IS NOT NULL");
  } else if (role === "content_admin") {
    parts.push("c.category IN ('technical', 'account_issue', 'other')");
    parts.push("c.complaint_type IN ('technical', 'service', 'general')");
  } else if (role === "admin_manager") {
    return { clause: null, params: [] };
  }

  return { clause: `(${parts.join(" OR ")})`, params };
}

/**
 * Decide which role should own a fresh account complaint, and how long it has
 * before the SLA breaches. Mirrors the support-ticket smart router so the two
 * surfaces feel consistent to admins.
 *
 * Routing:
 *   - Any signal that it's about money (billing/refund category, billing/refund
 *     complaint_type, or a linked invoice_id) → finance_admin.
 *   - Otherwise → content_admin.
 *
 * SLA bands by priority (the customer picks one on the form):
 *   urgent → 6h, high → 12h, medium → 24h, low → 48h
 */
function getComplaintSmartRouting({ category, complaint_type, invoice_id, priority, plan_tier }) {
  // Triage-first: every new complaint starts in support (content_admin) so a
  // human triages whether it's actually financial before it lands on the
  // accountant's desk. The owner's observation: customers sometimes mark a
  // complaint as "مالية" when it isn't — auto-routing to finance ends up
  // wasting the accountant's time and missing the real issue. A transfer
  // endpoint (PATCH /api/account-complaints/:id/transfer-to-finance) hands
  // the row off after triage.
  const role = "content_admin";

  // Base SLA by user-chosen priority.
  const slaByPriority = { urgent: 6, high: 12, medium: 24, low: 48 };
  let sla_hours = slaByPriority[priority] || 24;

  // Plan-tier boost: premium customers get faster guaranteed response.
  // Tier names match the plan codes used elsewhere ("royal" / "ملكية",
  // "featured" / "مميزة"). We match loosely against the lowercased tier
  // string so either an English code or Arabic name passes.
  const t = String(plan_tier || "").toLowerCase();
  const isRoyal    = /royal|ملكي|elite|enterprise|عمل/.test(t);
  const isFeatured = /featured|مميز|premium|تميز|صفوة/.test(t);
  let multiplier = 1;
  if (isRoyal) multiplier = 0.5;
  else if (isFeatured) multiplier = 0.75;

  if (multiplier !== 1) {
    // Round up so we never accidentally give *less* response time than the
    // base. Minimum of 2 hours so even royal+urgent stays operationally
    // realistic (someone has to actually pick it up).
    sla_hours = Math.max(2, Math.ceil(sla_hours * multiplier));
  }

  return { role, sla_hours };
}

module.exports = {
  FULL_ACCESS_ROLES,
  hasFullCustomerServiceAccess,
  getSupportTicketScope,
  getAccountComplaintScope,
  getComplaintSmartRouting,
};
