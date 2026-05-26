/**
 * Phase 3.5 — capability flags on custom_roles. From the owner's spec
 * section 2: a role should declare whether it
 *   - can receive complaint transfers
 *   - can be the target of assignments/directives
 *   - can reply directly to customers
 *   - can see sensitive financial data
 *   - can close complaints
 *
 * Booleans on the row so we can filter "transferable roles", "assignable
 * roles" etc. without a join. Defaults match the owner's mental model:
 *   transfers = true     (most roles should be a valid transfer target)
 *   assignments = true   (most roles should be an assignment target)
 *   reply = false        (granted explicitly per role — customers shouldn't
 *                         hear from ops/QA by default)
 *   sensitive_finance = false (granted explicitly)
 *   close = false        (granted explicitly — typically support / admin)
 */

exports.up = async function (knex) {
  const exists = await knex.schema.hasTable("custom_roles");
  if (!exists) return;
  const cols = await Promise.all([
    knex.schema.hasColumn("custom_roles", "can_receive_transfers"),
    knex.schema.hasColumn("custom_roles", "can_be_assigned"),
    knex.schema.hasColumn("custom_roles", "can_reply_to_customers"),
    knex.schema.hasColumn("custom_roles", "can_see_sensitive_finance"),
    knex.schema.hasColumn("custom_roles", "can_close_complaints"),
  ]);
  await knex.schema.alterTable("custom_roles", (table) => {
    if (!cols[0]) table.boolean("can_receive_transfers").notNullable().defaultTo(true);
    if (!cols[1]) table.boolean("can_be_assigned").notNullable().defaultTo(true);
    if (!cols[2]) table.boolean("can_reply_to_customers").notNullable().defaultTo(false);
    if (!cols[3]) table.boolean("can_see_sensitive_finance").notNullable().defaultTo(false);
    if (!cols[4]) table.boolean("can_close_complaints").notNullable().defaultTo(false);
  });
};

exports.down = async function (knex) {
  const exists = await knex.schema.hasTable("custom_roles");
  if (!exists) return;
  for (const c of ["can_receive_transfers","can_be_assigned","can_reply_to_customers","can_see_sensitive_finance","can_close_complaints"]) {
    const has = await knex.schema.hasColumn("custom_roles", c);
    if (has) await knex.schema.alterTable("custom_roles", (t) => t.dropColumn(c));
  }
};
