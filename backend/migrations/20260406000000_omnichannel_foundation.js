/**
 * Omnichannel foundation: omni_conversations, omni_messages, support_tickets.source_ref
 */

exports.up = async function (knex) {
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE omni_message_visibility AS ENUM ('public', 'internal_note');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  const hasConv = await knex.schema.hasTable('omni_conversations');
  if (!hasConv) {
    await knex.schema.createTable('omni_conversations', (table) => {
      table.increments('id').primary();
      table.string('source_type', 50).notNullable();
      table.integer('source_id').nullable();
      table.string('status', 40).notNullable().defaultTo('open');
      table.timestamps(true, true);
    });
    await knex.raw(
      `CREATE INDEX IF NOT EXISTS idx_omni_conv_source ON omni_conversations (source_type, source_id)`
    );
  }

  const hasMsg = await knex.schema.hasTable('omni_messages');
  if (!hasMsg) {
    await knex.schema.createTable('omni_messages', (table) => {
      table.increments('id').primary();
      table
        .integer('conversation_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('omni_conversations')
        .onDelete('CASCADE');
      table.string('sender_type', 20).notNullable();
      table.uuid('sender_id').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.text('content').notNullable();
      table.specificType('visibility', 'omni_message_visibility').notNullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    });
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_omni_messages_conv ON omni_messages (conversation_id)`);
  }

  const hasRef = await knex.schema.hasColumn('support_tickets', 'source_ref');
  if (!hasRef) {
    await knex.schema.alterTable('support_tickets', (table) => {
      table.string('source_ref', 255).nullable();
    });
    await knex.raw(
      `CREATE INDEX IF NOT EXISTS idx_support_tickets_source_ref ON support_tickets (source_ref) WHERE source_ref IS NOT NULL`
    );
  }
};

exports.down = async function (knex) {
  await knex.raw(`DROP INDEX IF EXISTS idx_support_tickets_source_ref`);
  const hasMsg = await knex.schema.hasTable('omni_messages');
  if (hasMsg) {
    await knex.schema.dropTableIfExists('omni_messages');
  }
  const hasConv = await knex.schema.hasTable('omni_conversations');
  if (hasConv) {
    await knex.schema.dropTableIfExists('omni_conversations');
  }
  await knex.raw(`DROP TYPE IF EXISTS omni_message_visibility`);

  const hasRef = await knex.schema.hasColumn('support_tickets', 'source_ref');
  if (hasRef) {
    await knex.schema.alterTable('support_tickets', (table) => {
      table.dropColumn('source_ref');
    });
  }
};
