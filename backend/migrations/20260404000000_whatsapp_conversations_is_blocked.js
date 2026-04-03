/**
 * Block flag for WhatsApp CRM — ignore inbound from blocked customers at webhook.
 */

exports.up = async function (knex) {
  const hasTable = await knex.schema.hasTable('whatsapp_conversations');
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn(
    'whatsapp_conversations',
    'is_blocked'
  );
  if (!hasColumn) {
    await knex.schema.alterTable('whatsapp_conversations', (table) => {
      table.boolean('is_blocked').notNullable().defaultTo(false);
    });
  }
};

exports.down = async function (knex) {
  const hasTable = await knex.schema.hasTable('whatsapp_conversations');
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn(
    'whatsapp_conversations',
    'is_blocked'
  );
  if (hasColumn) {
    await knex.schema.alterTable('whatsapp_conversations', (table) => {
      table.dropColumn('is_blocked');
    });
  }
};
