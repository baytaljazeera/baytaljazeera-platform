/**
 * Add a customer-set priority to account_complaints.
 * Values: low | medium (default) | high | urgent
 */

exports.up = async function (knex) {
  const hasTable = await knex.schema.hasTable("account_complaints");
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn("account_complaints", "priority");
  if (!hasColumn) {
    await knex.schema.alterTable("account_complaints", (table) => {
      table.string("priority", 16).notNullable().defaultTo("medium");
    });
  }
};

exports.down = async function (knex) {
  const hasTable = await knex.schema.hasTable("account_complaints");
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn("account_complaints", "priority");
  if (hasColumn) {
    await knex.schema.alterTable("account_complaints", (table) => {
      table.dropColumn("priority");
    });
  }
};
