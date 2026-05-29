const Stripe = require('stripe');

function readSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  return key;
}

function readPublishableKey() {
  const key = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!key) throw new Error('STRIPE_PUBLISHABLE_KEY is not set');
  return key;
}

async function getStripeSecretKey() {
  return readSecretKey();
}

async function getStripePublishableKey() {
  return readPublishableKey();
}

async function getUncachableStripeClient() {
  return new Stripe(readSecretKey());
}

async function getStripeSync() {
  // Stripe sync helper is disabled in this deployment. Callers should
  // fall back to direct webhook handling. Returning null lets
  // webhookHandlers detect the disabled path and skip without crashing.
  return null;
}

module.exports = {
  getUncachableStripeClient,
  getStripePublishableKey,
  getStripeSecretKey,
  getStripeSync,
};
