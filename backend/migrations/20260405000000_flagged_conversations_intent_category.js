/**
 * Add intent_category for AI intent classification on flagged conversations.
 */

exports.up = async function (knex) {
  const hasTable = await knex.schema.hasTable('flagged_conversations');
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn('flagged_conversations', 'intent_category');
  if (!hasColumn) {
    await knex.schema.alterTable('flagged_conversations', (table) => {
      table.string('intent_category', 100).nullable();
    });
  }
};

exports.down = async function (knex) {
  const hasTable = await knex.schema.hasTable('flagged_conversations');
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn('flagged_conversations', 'intent_category');
  if (hasColumn) {
    await knex.schema.alterTable('flagged_conversations', (table) => {
      table.dropColumn('intent_category');
    });
  }
};
