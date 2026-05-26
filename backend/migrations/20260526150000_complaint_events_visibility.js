/**
 * Split the complaint audit timeline into two streams by visibility:
 *   - internal:        seen by staff only (toggle this on "توجيه داخلي")
 *   - customer_visible: seen by the customer in /my-complaints AND staff
 *
 * Defaults to 'internal' so existing rows (created/status_changed/transferred)
 * don't accidentally leak to the customer's view.
 */

exports.up = async function (knex) {
  const exists = await knex.schema.hasTable("complaint_events");
  if (!exists) return;
  const has = await knex.schema.hasColumn("complaint_events", "visibility");
  if (!has) {
    await knex.schema.alterTable("complaint_events", (table) => {
      table.string("visibility", 16).notNullable().defaultTo("internal");
    });
  }
};

exports.down = async function (knex) {
  const exists = await knex.schema.hasTable("complaint_events");
  if (!exists) return;
  const has = await knex.schema.hasColumn("complaint_events", "visibility");
  if (has) {
    await knex.schema.alterTable("complaint_events", (table) => {
      table.dropColumn("visibility");
    });
  }
};
