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
function getComplaintSmartRouting({ category, complaint_type, invoice_id, priority }) {
  const FINANCE_CATEGORIES = new Set(["billing", "subscription", "refund"]);
  const FINANCE_TYPES      = new Set(["billing", "refund"]);
  const isFinance =
    FINANCE_CATEGORIES.has(category) ||
    FINANCE_TYPES.has(complaint_type) ||
    (invoice_id != null && invoice_id !== "");

  const role = isFinance ? "finance_admin" : "content_admin";

  const slaByPriority = { urgent: 6, high: 12, medium: 24, low: 48 };
  const sla_hours = slaByPriority[priority] || 24;

  return { role, sla_hours };
}

module.exports = {
  FULL_ACCESS_ROLES,
  hasFullCustomerServiceAccess,
  getSupportTicketScope,
  getAccountComplaintScope,
  getComplaintSmartRouting,
};
