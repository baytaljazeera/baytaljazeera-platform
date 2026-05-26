/**
 * Bring support_tickets up to parity with account_complaints:
 *   - sla_due_at, breach_notified_at  for SLA-breach escalation cron
 *   - plan_tier + customer locale snapshot for premium SLA boost & UI
 *
 * support_tickets already had auto_assigned_role and sla_hours. This adds
 * the missing pieces so the SLA breach cron can sweep tickets the same way
 * it sweeps complaints, and so premium customers get faster guaranteed
 * response on tickets too.
 */

exports.up = async function (knex) {
  const hasTable = await knex.schema.hasTable("support_tickets");
  if (!hasTable) return;

  const cols = await Promise.all([
    knex.schema.hasColumn("support_tickets", "sla_due_at"),
    knex.schema.hasColumn("support_tickets", "breach_notified_at"),
    knex.schema.hasColumn("support_tickets", "plan_tier"),
    knex.schema.hasColumn("support_tickets", "customer_country"),
    knex.schema.hasColumn("support_tickets", "customer_timezone"),
    knex.schema.hasColumn("support_tickets", "customer_language"),
  ]);

  await knex.schema.alterTable("support_tickets", (table) => {
    if (!cols[0]) table.timestamp("sla_due_at", { useTz: true }).nullable();
    if (!cols[1]) table.timestamp("breach_notified_at", { useTz: true }).nullable();
    if (!cols[2]) table.string("plan_tier", 32).nullable();
    if (!cols[3]) table.string("customer_country", 2).nullable();
    if (!cols[4]) table.string("customer_timezone", 64).nullable();
    if (!cols[5]) table.string("customer_language", 16).nullable();
  });
};

exports.down = async function (knex) {
  const hasTable = await knex.schema.hasTable("support_tickets");
  if (!hasTable) return;

  const cols = await Promise.all([
    knex.schema.hasColumn("support_tickets", "sla_due_at"),
    knex.schema.hasColumn("support_tickets", "breach_notified_at"),
    knex.schema.hasColumn("support_tickets", "plan_tier"),
    knex.schema.hasColumn("support_tickets", "customer_country"),
    knex.schema.hasColumn("support_tickets", "customer_timezone"),
    knex.schema.hasColumn("support_tickets", "customer_language"),
  ]);

  await knex.schema.alterTable("support_tickets", (table) => {
    if (cols[0]) table.dropColumn("sla_due_at");
    if (cols[1]) table.dropColumn("breach_notified_at");
    if (cols[2]) table.dropColumn("plan_tier");
    if (cols[3]) table.dropColumn("customer_country");
    if (cols[4]) table.dropColumn("customer_timezone");
    if (cols[5]) table.dropColumn("customer_language");
  });
};
