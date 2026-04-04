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

module.exports = {
  FULL_ACCESS_ROLES,
  hasFullCustomerServiceAccess,
  getSupportTicketScope,
  getAccountComplaintScope,
};
