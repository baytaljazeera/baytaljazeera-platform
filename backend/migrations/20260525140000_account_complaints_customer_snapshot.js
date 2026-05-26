/**
 * Snapshot customer locale + plan tier onto each complaint at submit time.
 *
 *   plan_tier          — name of the customer's active plan when the complaint
 *                        was filed (basic / featured / royal / entry / ...).
 *                        Used to apply SLA boosts for premium customers and
 *                        to surface "tier badge" in the admin queue.
 *   customer_country   — snapshot of users.country at submit (so changing
 *                        country later doesn't rewrite history).
 *   customer_timezone  — same idea for IANA tz, used to render due-by time
 *                        in the customer's local time on the admin UI.
 *   customer_language  — what language the customer prefers to be answered
 *                        in. Helpful for routing to an Arabic vs English
 *                        speaking agent in future.
 *
 * All nullable so a complaint without a logged-in user still inserts.
 */

exports.up = async function (knex) {
  const hasTable = await knex.schema.hasTable("account_complaints");
  if (!hasTable) return;

  const [hasTier, hasCountry, hasTz, hasLang] = await Promise.all([
    knex.schema.hasColumn("account_complaints", "plan_tier"),
    knex.schema.hasColumn("account_complaints", "customer_country"),
    knex.schema.hasColumn("account_complaints", "customer_timezone"),
    knex.schema.hasColumn("account_complaints", "customer_language"),
  ]);

  await knex.schema.alterTable("account_complaints", (table) => {
    if (!hasTier) table.string("plan_tier", 32).nullable();
    if (!hasCountry) table.string("customer_country", 2).nullable();
    if (!hasTz) table.string("customer_timezone", 64).nullable();
    if (!hasLang) table.string("customer_language", 16).nullable();
  });
};

exports.down = async function (knex) {
  const hasTable = await knex.schema.hasTable("account_complaints");
  if (!hasTable) return;

  const [hasTier, hasCountry, hasTz, hasLang] = await Promise.all([
    knex.schema.hasColumn("account_complaints", "plan_tier"),
    knex.schema.hasColumn("account_complaints", "customer_country"),
    knex.schema.hasColumn("account_complaints", "customer_timezone"),
    knex.schema.hasColumn("account_complaints", "customer_language"),
  ]);

  await knex.schema.alterTable("account_complaints", (table) => {
    if (hasTier) table.dropColumn("plan_tier");
    if (hasCountry) table.dropColumn("customer_country");
    if (hasTz) table.dropColumn("customer_timezone");
    if (hasLang) table.dropColumn("customer_language");
  });
};
