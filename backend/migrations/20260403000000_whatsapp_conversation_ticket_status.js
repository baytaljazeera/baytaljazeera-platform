/**
 * Ticket workflow for WhatsApp Command Center: open / pending / resolved per phone.
 * Separate from whatsapp_messages.status (Twilio delivery: sent, received, …).
 */

exports.up = async function (knex) {
  const exists = await knex.schema.hasTable('whatsapp_conversations');
  if (!exists) {
    await knex.schema.createTable('whatsapp_conversations', (table) => {
      table.string('phone', 50).primary();
      table.string('status', 20).notNullable().defaultTo('open');
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
    await knex.raw(`
      ALTER TABLE whatsapp_conversations
      ADD CONSTRAINT whatsapp_conversations_ticket_status_check
      CHECK (status IN ('open', 'pending', 'resolved'))
    `);
  }

  await knex.raw(`
    INSERT INTO whatsapp_conversations (phone, status, updated_at)
    SELECT DISTINCT phone, 'open', NOW()
    FROM whatsapp_messages
    ON CONFLICT (phone) DO NOTHING
  `);
};

exports.down = async function (knex) {
  const exists = await knex.schema.hasTable('whatsapp_conversations');
  if (exists) {
    await knex.schema.dropTable('whatsapp_conversations');
  }
};
