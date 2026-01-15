const { getUncachableStripeClient } = require('./stripeClient');
const db = require('../db');

async function createCustomer(email, userId, name = null) {
  const stripe = await getUncachableStripeClient();
  return await stripe.customers.create({
    email,
    name,
    metadata: { userId },
  });
}

async function createCheckoutSession(customerId, priceId, successUrl, cancelUrl, metadata = {}) {
  const stripe = await getUncachableStripeClient();
  return await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
  });
}

async function createOneTimeCheckoutSession(customerId, priceId, successUrl, cancelUrl, metadata = {}) {
  const stripe = await getUncachableStripeClient();
  return await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
  });
}

async function createCustomerPortalSession(customerId, returnUrl) {
  const stripe = await getUncachableStripeClient();
  return await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

async function getProduct(productId) {
  const result = await db.query(
    `SELECT * FROM stripe.products WHERE id = $1`,
    [productId]
  );
  return result.rows[0] || null;
}

async function listProducts(active = true, limit = 20, offset = 0) {
  const result = await db.query(
    `SELECT * FROM stripe.products WHERE active = $1 LIMIT $2 OFFSET $3`,
    [active, limit, offset]
  );
  return result.rows;
}

async function listProductsWithPrices(active = true, limit = 20, offset = 0) {
  const result = await db.query(`
    WITH paginated_products AS (
      SELECT id, name, description, metadata, active
      FROM stripe.products
      WHERE active = $1
      ORDER BY id
      LIMIT $2 OFFSET $3
    )
    SELECT 
      p.id as product_id,
      p.name as product_name,
      p.description as product_description,
      p.active as product_active,
      p.metadata as product_metadata,
      pr.id as price_id,
      pr.unit_amount,
      pr.currency,
      pr.recurring,
      pr.active as price_active,
      pr.metadata as price_metadata
    FROM paginated_products p
    LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
    ORDER BY p.id, pr.unit_amount
  `, [active, limit, offset]);
  return result.rows;
}

async function getPrice(priceId) {
  const result = await db.query(
    `SELECT * FROM stripe.prices WHERE id = $1`,
    [priceId]
  );
  return result.rows[0] || null;
}

async function listPrices(active = true, limit = 20, offset = 0) {
  const result = await db.query(
    `SELECT * FROM stripe.prices WHERE active = $1 LIMIT $2 OFFSET $3`,
    [active, limit, offset]
  );
  return result.rows;
}

async function getPricesForProduct(productId) {
  const result = await db.query(
    `SELECT * FROM stripe.prices WHERE product = $1 AND active = true`,
    [productId]
  );
  return result.rows;
}

async function getSubscription(subscriptionId) {
  const result = await db.query(
    `SELECT * FROM stripe.subscriptions WHERE id = $1`,
    [subscriptionId]
  );
  return result.rows[0] || null;
}

async function updateUserStripeInfo(userId, stripeInfo) {
  const updates = [];
  const values = [];
  let paramIndex = 1;

  if (stripeInfo.stripeCustomerId !== undefined) {
    updates.push(`stripe_customer_id = $${paramIndex++}`);
    values.push(stripeInfo.stripeCustomerId);
  }
  if (stripeInfo.stripeSubscriptionId !== undefined) {
    updates.push(`stripe_subscription_id = $${paramIndex++}`);
    values.push(stripeInfo.stripeSubscriptionId);
  }

  if (updates.length === 0) return null;

  values.push(userId);
  const result = await db.query(
    `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() 
     WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return result.rows[0];
}

module.exports = {
  createCustomer,
  createCheckoutSession,
  createOneTimeCheckoutSession,
  createCustomerPortalSession,
  getProduct,
  listProducts,
  listProductsWithPrices,
  getPrice,
  listPrices,
  getPricesForProduct,
  getSubscription,
  updateUserStripeInfo
};
