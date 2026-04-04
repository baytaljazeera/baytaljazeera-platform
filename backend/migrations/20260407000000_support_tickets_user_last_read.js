/**
 * Track when the customer last viewed a support ticket (for unread admin-reply badge).
 */

exports.up = async function (knex) {
  const hasTable = await knex.schema.hasTable("support_tickets");
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn("support_tickets", "user_last_read_at");
  if (!hasColumn) {
    await knex.schema.alterTable("support_tickets", (table) => {
      table.timestamp("user_last_read_at", { useTz: true }).nullable();
    });
  }
};

exports.down = async function (knex) {
  const hasTable = await knex.schema.hasTable("support_tickets");
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn("support_tickets", "user_last_read_at");
  if (hasColumn) {
    await knex.schema.alterTable("support_tickets", (table) => {
      table.dropColumn("user_last_read_at");
    });
  }
};
