exports.up = async function(knex) {
  const hasStripeCustomerId = await knex.schema.hasColumn('users', 'stripe_customer_id');
  const hasStripeSubscriptionId = await knex.schema.hasColumn('users', 'stripe_subscription_id');

  if (!hasStripeCustomerId) {
    await knex.raw('ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255) UNIQUE');
  }

  if (!hasStripeSubscriptionId) {
    await knex.raw('ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255)');
  }

  const hasStripePaymentsTable = await knex.schema.hasTable('stripe_payments');
  if (!hasStripePaymentsTable) {
    await knex.raw(`
      CREATE TABLE IF NOT EXISTS stripe_payments (
        id SERIAL PRIMARY KEY,
        user_id UUID,
        stripe_payment_id VARCHAR(255) UNIQUE NOT NULL,
        stripe_invoice_id VARCHAR(255),
        amount DECIMAL(15, 2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'SAR',
        status VARCHAR(50) DEFAULT 'pending',
        payment_method VARCHAR(100),
        description TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
  }

  const hasStripeWebhooksTable = await knex.schema.hasTable('stripe_webhooks');
  if (!hasStripeWebhooksTable) {
    await knex.raw(`
      CREATE TABLE IF NOT EXISTS stripe_webhooks (
        id SERIAL PRIMARY KEY,
        event_id VARCHAR(255) UNIQUE NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        payload JSONB,
        status VARCHAR(50) DEFAULT 'received',
        error_message TEXT,
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
  }
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('stripe_webhooks');
  await knex.schema.dropTableIfExists('stripe_payments');
  
  await knex.raw('ALTER TABLE users DROP COLUMN IF EXISTS stripe_customer_id');
  await knex.raw('ALTER TABLE users DROP COLUMN IF EXISTS stripe_subscription_id');
};
