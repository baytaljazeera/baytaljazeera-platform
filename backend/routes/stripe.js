const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../utils/queryHelpers');
const stripeService = require('../services/stripeService');
const { getStripePublishableKey } = require('../services/stripeClient');
const db = require('../db');

router.get('/publishable-key', asyncHandler(async (req, res) => {
  const key = await getStripePublishableKey();
  res.json({ publishableKey: key });
}));

router.get('/products', asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;
  const products = await stripeService.listProducts(true, limit, offset);
  res.json({ products });
}));

router.get('/products-with-prices', asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;
  const rows = await stripeService.listProductsWithPrices(true, limit, offset);

  const productsMap = new Map();
  for (const row of rows) {
    if (!productsMap.has(row.product_id)) {
      productsMap.set(row.product_id, {
        id: row.product_id,
        name: row.product_name,
        description: row.product_description,
        active: row.product_active,
        metadata: row.product_metadata,
        prices: []
      });
    }
    if (row.price_id) {
      productsMap.get(row.product_id).prices.push({
        id: row.price_id,
        unit_amount: row.unit_amount,
        currency: row.currency,
        recurring: row.recurring,
        active: row.price_active,
        metadata: row.price_metadata
      });
    }
  }

  res.json({ products: Array.from(productsMap.values()) });
}));

router.get('/prices', asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;
  const prices = await stripeService.listPrices(true, limit, offset);
  res.json({ prices });
}));

router.get('/products/:productId/prices', asyncHandler(async (req, res) => {
  const { productId } = req.params;
  
  const product = await stripeService.getProduct(productId);
  if (!product) {
    return res.status(404).json({ error: 'المنتج غير موجود' });
  }

  const prices = await stripeService.getPricesForProduct(productId);
  res.json({ prices });
}));

router.get('/subscription', authMiddleware, asyncHandler(async (req, res) => {
  const userResult = await db.query(
    'SELECT stripe_subscription_id FROM users WHERE id = $1',
    [req.user.id]
  );

  if (!userResult.rows[0]?.stripe_subscription_id) {
    return res.json({ subscription: null });
  }

  const subscription = await stripeService.getSubscription(userResult.rows[0].stripe_subscription_id);
  res.json({ subscription });
}));

router.post('/create-checkout', authMiddleware, asyncHandler(async (req, res) => {
  const { priceId, planId, successUrl, cancelUrl } = req.body;

  if (!priceId) {
    return res.status(400).json({ error: 'معرف السعر مطلوب' });
  }

  const userResult = await db.query(
    'SELECT id, email, name, stripe_customer_id FROM users WHERE id = $1',
    [req.user.id]
  );

  if (!userResult.rows[0]) {
    return res.status(404).json({ error: 'المستخدم غير موجود' });
  }

  const user = userResult.rows[0];
  let customerId = user.stripe_customer_id;

  if (!customerId) {
    const customer = await stripeService.createCustomer(user.email, user.id, user.name);
    await stripeService.updateUserStripeInfo(user.id, { stripeCustomerId: customer.id });
    customerId = customer.id;
  }

  const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
  const session = await stripeService.createCheckoutSession(
    customerId,
    priceId,
    successUrl || `${baseUrl}/payment/success`,
    cancelUrl || `${baseUrl}/payment/cancel`,
    { userId: user.id, planId: planId || '' }
  );

  res.json({ url: session.url, sessionId: session.id });
}));

router.post('/create-portal', authMiddleware, asyncHandler(async (req, res) => {
  const { returnUrl } = req.body;

  const userResult = await db.query(
    'SELECT stripe_customer_id FROM users WHERE id = $1',
    [req.user.id]
  );

  if (!userResult.rows[0]?.stripe_customer_id) {
    return res.status(400).json({ error: 'لا يوجد حساب Stripe للمستخدم' });
  }

  const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
  const session = await stripeService.createCustomerPortalSession(
    userResult.rows[0].stripe_customer_id,
    returnUrl || `${baseUrl}/account`
  );

  res.json({ url: session.url });
}));

module.exports = router;
