/**
 * Add is_read flag for feedback responses.
 */

exports.up = async function (knex) {
  const hasTable = await knex.schema.hasTable('feedback_responses');
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn('feedback_responses', 'is_read');
  if (!hasColumn) {
    await knex.schema.alterTable('feedback_responses', (table) => {
      table.boolean('is_read').defaultTo(false);
    });
  }

  await knex.raw(`UPDATE feedback_responses SET is_read = false WHERE is_read IS NULL`);
};

exports.down = async function (knex) {
  const hasTable = await knex.schema.hasTable('feedback_responses');
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn('feedback_responses', 'is_read');
  if (hasColumn) {
    await knex.schema.alterTable('feedback_responses', (table) => {
      table.dropColumn('is_read');
    });
  }
};

