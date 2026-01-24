const db = require('../db');

async function logAdminAction(req, action, resourceType, resourceId, details = {}) {
  try {
    const adminId = req.user?.id;
    const adminEmail = req.user?.email || 'unknown';
    const ipAddress = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    await db.query(`
      INSERT INTO admin_audit_logs (admin_id, admin_email, action, resource_type, resource_id, details, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [adminId, adminEmail, action, resourceType, resourceId, JSON.stringify(details), ipAddress, userAgent]);

  } catch (err) {
    console.error('[AuditService] Error logging action:', err.message);
  }
}

async function getAuditLogs(filters = {}) {
  try {
    let query = `
      SELECT al.*, u.name as admin_name
      FROM admin_audit_logs al
      LEFT JOIN users u ON al.admin_id = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (filters.adminId) {
      query += ` AND al.admin_id = $${paramIndex++}`;
      params.push(filters.adminId);
    }

    if (filters.action) {
      query += ` AND al.action = $${paramIndex++}`;
      params.push(filters.action);
    }

    if (filters.resourceType) {
      query += ` AND al.resource_type = $${paramIndex++}`;
      params.push(filters.resourceType);
    }

    if (filters.startDate) {
      query += ` AND al.created_at >= $${paramIndex++}`;
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      query += ` AND al.created_at <= $${paramIndex++}`;
      params.push(filters.endDate);
    }

    query += ` ORDER BY al.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(filters.limit || 50, filters.offset || 0);

    const result = await db.query(query, params);
    return result.rows;
  } catch (err) {
    console.error('[AuditService] Error fetching logs:', err.message);
    return [];
  }
}

const AUDIT_ACTIONS = {
  LISTING_APPROVE: 'listing.approve',
  LISTING_REJECT: 'listing.reject',
  LISTING_DELETE: 'listing.delete',
  USER_BAN: 'user.ban',
  USER_UNBAN: 'user.unban',
  USER_ROLE_CHANGE: 'user.role_change',
  USER_DELETE: 'user.delete',
  PLAN_CREATE: 'plan.create',
  PLAN_UPDATE: 'plan.update',
  PLAN_DELETE: 'plan.delete',
  REFUND_APPROVE: 'refund.approve',
  REFUND_REJECT: 'refund.reject',
  REPORT_RESOLVE: 'report.resolve',
  REPORT_DISMISS: 'report.dismiss',
  SETTINGS_UPDATE: 'settings.update',
  MEMBERSHIP_APPROVE: 'membership.approve',
  MEMBERSHIP_REJECT: 'membership.reject',
  ELITE_SLOT_APPROVE: 'elite_slot.approve',
  ELITE_SLOT_REJECT: 'elite_slot.reject',
  CONVERSATION_FLAG: 'conversation.flag',
  USER_WARNING: 'user.warning',
  UPDATE_SIDEBAR_SETTINGS: 'sidebar.update',
};

module.exports = {
  logAdminAction,
  getAuditLogs,
  AUDIT_ACTIONS,
};
