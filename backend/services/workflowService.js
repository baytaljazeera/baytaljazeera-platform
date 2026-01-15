const db = require('../db');

const WORKFLOW_STATUSES = {
  DRAFT: 'draft',
  PENDING_PAYMENT: 'pending_payment',
  PENDING_REVIEW: 'pending_review',
  IN_REVIEW: 'in_review',
  APPROVED: 'approved',
  PUBLISHED: 'published',
  REJECTED: 'rejected',
  ARCHIVED: 'archived'
};

const STATUS_TRANSITIONS = {
  draft: ['pending_payment', 'pending_review', 'archived'],
  pending_payment: ['pending_review', 'draft', 'archived'],
  pending_review: ['in_review', 'approved', 'rejected', 'draft', 'archived'],
  in_review: ['approved', 'rejected', 'pending_review', 'archived'],
  approved: ['published', 'archived'],
  published: ['archived'],
  rejected: ['draft', 'pending_review', 'archived'],
  archived: ['draft']
};

async function createWorkflow(propertyId, countryCode = 'SA', currencyCode = 'SAR', currencySymbol = 'ر.س') {
  const result = await db.query(`
    INSERT INTO listing_workflows (property_id, country_code, currency_code, currency_symbol, status)
    VALUES ($1, $2, $3, $4, 'draft')
    RETURNING *
  `, [propertyId, countryCode, currencyCode, currencySymbol]);
  
  await logAuditEvent(propertyId, result.rows[0].id, 'workflow_created', { 
    country_code: countryCode,
    currency_code: currencyCode 
  });
  
  return result.rows[0];
}

async function getWorkflow(propertyId) {
  const result = await db.query(`
    SELECT lw.*, p.title, p.price as property_price, u.name as owner_name, u.email as owner_email
    FROM listing_workflows lw
    JOIN properties p ON p.id = lw.property_id
    JOIN users u ON u.id = p.user_id
    WHERE lw.property_id = $1
    ORDER BY lw.created_at DESC
    LIMIT 1
  `, [propertyId]);
  return result.rows[0];
}

async function updateWorkflowStatus(workflowId, newStatus, actorId, notes = null) {
  const current = await db.query('SELECT * FROM listing_workflows WHERE id = $1', [workflowId]);
  if (!current.rows[0]) throw new Error('Workflow not found');
  
  const currentStatus = current.rows[0].status;
  const allowedTransitions = STATUS_TRANSITIONS[currentStatus] || [];
  
  if (!allowedTransitions.includes(newStatus)) {
    throw new Error(`Cannot transition from ${currentStatus} to ${newStatus}`);
  }
  
  const result = await db.query(`
    UPDATE listing_workflows 
    SET status = $1, previous_status = $2, reviewed_by = $3, reviewed_at = NOW(), review_notes = $4, updated_at = NOW()
    WHERE id = $5
    RETURNING *
  `, [newStatus, currentStatus, actorId, notes, workflowId]);
  
  await logAuditEvent(current.rows[0].property_id, workflowId, 'status_changed', {
    from: currentStatus,
    to: newStatus,
    notes
  }, actorId);
  
  if (newStatus === 'published') {
    await db.query(`
      UPDATE listing_workflows SET published_at = NOW() WHERE id = $1
    `, [workflowId]);
    
    await db.query(`
      UPDATE properties SET status = 'approved' WHERE id = $1
    `, [current.rows[0].property_id]);
  }
  
  return result.rows[0];
}

async function updateWorkflowPricing(workflowId, pricing) {
  const { basePrice, localPrice, taxAmount, taxRate, totalAmount } = pricing;
  
  const result = await db.query(`
    UPDATE listing_workflows 
    SET base_price = $1, local_price = $2, tax_amount = $3, tax_rate = $4, total_amount = $5, updated_at = NOW()
    WHERE id = $6
    RETURNING *
  `, [basePrice, localPrice, taxAmount, taxRate, totalAmount, workflowId]);
  
  return result.rows[0];
}

async function linkInvoice(workflowId, invoiceId) {
  await db.query(`
    UPDATE listing_workflows SET invoice_id = $1, updated_at = NOW() WHERE id = $2
  `, [invoiceId, workflowId]);
}

async function logAuditEvent(propertyId, workflowId, eventType, eventData = {}, actorId = null, ipAddress = null, userAgent = null) {
  await db.query(`
    INSERT INTO listing_audit_events (property_id, workflow_id, event_type, event_data, actor_id, ip_address, user_agent)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [propertyId, workflowId, eventType, JSON.stringify(eventData), actorId, ipAddress, userAgent]);
}

async function getAuditLog(propertyId, limit = 50) {
  const result = await db.query(`
    SELECT lae.*, u.name as actor_name, u.email as actor_email
    FROM listing_audit_events lae
    LEFT JOIN users u ON u.id = lae.actor_id
    WHERE lae.property_id = $1
    ORDER BY lae.created_at DESC
    LIMIT $2
  `, [propertyId, limit]);
  return result.rows;
}

async function getPendingReviews(page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  
  const result = await db.query(`
    SELECT lw.*, p.title, p.price, p.city, p.country, p.type, u.name as owner_name, u.email as owner_email
    FROM listing_workflows lw
    JOIN properties p ON p.id = lw.property_id
    JOIN users u ON u.id = p.user_id
    WHERE lw.status IN ('pending_review', 'in_review')
    ORDER BY lw.created_at ASC
    LIMIT $1 OFFSET $2
  `, [limit, offset]);
  
  const countResult = await db.query(`
    SELECT COUNT(*) FROM listing_workflows WHERE status IN ('pending_review', 'in_review')
  `);
  
  return {
    items: result.rows,
    total: parseInt(countResult.rows[0].count),
    page,
    limit
  };
}

module.exports = {
  WORKFLOW_STATUSES,
  STATUS_TRANSITIONS,
  createWorkflow,
  getWorkflow,
  updateWorkflowStatus,
  updateWorkflowPricing,
  linkInvoice,
  logAuditEvent,
  getAuditLog,
  getPendingReviews
};
