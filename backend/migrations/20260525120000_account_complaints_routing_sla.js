/**
 * Add auto-routing + SLA tracking to account_complaints.
 *
 *   auto_assigned_role  — role that should pick up the complaint
 *                         ("finance_admin" for billing/refund/invoice-linked,
 *                         "content_admin" otherwise). Mirrors the same column
 *                         on support_tickets so scope helpers can share logic.
 *   sla_hours           — total hours allowed before breach (8 / 24 / 48 etc.,
 *                         derived from priority + category at creation time).
 *   sla_due_at          — absolute timestamp the SLA expires (computed once
 *                         at insert so changes to priority later don't slide
 *                         the goalpost silently).
 *   breach_notified_at  — set the first time the SLA cron escalates this
 *                         complaint; prevents repeat-spam to admins.
 */

exports.up = async function (knex) {
  const hasTable = await knex.schema.hasTable("account_complaints");
  if (!hasTable) return;

  const cols = await Promise.all([
    knex.schema.hasColumn("account_complaints", "auto_assigned_role"),
    knex.schema.hasColumn("account_complaints", "sla_hours"),
    knex.schema.hasColumn("account_complaints", "sla_due_at"),
    knex.schema.hasColumn("account_complaints", "breach_notified_at"),
  ]);

  await knex.schema.alterTable("account_complaints", (table) => {
    if (!cols[0]) table.string("auto_assigned_role", 32).nullable();
    if (!cols[1]) table.integer("sla_hours").nullable();
    if (!cols[2]) table.timestamp("sla_due_at", { useTz: true }).nullable();
    if (!cols[3]) table.timestamp("breach_notified_at", { useTz: true }).nullable();
  });
};

exports.down = async function (knex) {
  const hasTable = await knex.schema.hasTable("account_complaints");
  if (!hasTable) return;

  const cols = await Promise.all([
    knex.schema.hasColumn("account_complaints", "auto_assigned_role"),
    knex.schema.hasColumn("account_complaints", "sla_hours"),
    knex.schema.hasColumn("account_complaints", "sla_due_at"),
    knex.schema.hasColumn("account_complaints", "breach_notified_at"),
  ]);

  await knex.schema.alterTable("account_complaints", (table) => {
    if (cols[0]) table.dropColumn("auto_assigned_role");
    if (cols[1]) table.dropColumn("sla_hours");
    if (cols[2]) table.dropColumn("sla_due_at");
    if (cols[3]) table.dropColumn("breach_notified_at");
  });
};
