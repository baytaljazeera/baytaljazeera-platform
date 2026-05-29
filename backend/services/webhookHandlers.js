const { getStripeSync } = require('./stripeClient');

async function processWebhook(payload, signature) {
  if (!Buffer.isBuffer(payload)) {
    throw new Error(
      'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
      'Received type: ' + typeof payload + '. ' +
      'This usually means express.json() parsed the body before reaching this handler. ' +
      'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
    );
  }

  const sync = await getStripeSync();
  if (!sync) {
    // Stripe sync helper is disabled in this deployment. Acknowledge the
    // webhook without local DB sync — direct stripe handlers (if any)
    // remain available via getUncachableStripeClient.
    console.warn('[stripe webhook] sync disabled (no sync helper); acknowledging only.');
    return;
  }
  await sync.processWebhook(payload, signature);
}

module.exports = { processWebhook };
