/**
 * International scale foundation: store country, timezone, and preferred
 * language on each user. This is the unlock for:
 *   - SLA breach calculated in the customer's local time (not Asia/Riyadh)
 *   - Future regional queues / on-call rotation
 *   - Routing inquiries to Arabic vs English speaking staff
 *
 * All columns are nullable — no data migration needed. Code that wants the
 * value can default to 'SA' / 'Asia/Riyadh' / 'ar' when null.
 */

exports.up = async function (knex) {
  const hasTable = await knex.schema.hasTable("users");
  if (!hasTable) return;

  const [hasCountry, hasTz, hasLang] = await Promise.all([
    knex.schema.hasColumn("users", "country"),
    knex.schema.hasColumn("users", "timezone"),
    knex.schema.hasColumn("users", "preferred_language"),
  ]);

  await knex.schema.alterTable("users", (table) => {
    // ISO 3166-1 alpha-2 country code (e.g., SA, AE, EG). Two chars covers
    // every UN member state — bumping to 3 only matters for ISO 3166-1 alpha-3.
    if (!hasCountry) table.string("country", 2).nullable();
    // IANA timezone, e.g., "Asia/Riyadh", "Asia/Dubai", "Africa/Cairo".
    // Longest IANA name today is ~32 chars; 64 leaves room for new zones.
    if (!hasTz) table.string("timezone", 64).nullable();
    // BCP 47 language tag (ar, en, ar-SA, en-US). 16 chars is comfortable.
    if (!hasLang) table.string("preferred_language", 16).nullable();
  });
};

exports.down = async function (knex) {
  const hasTable = await knex.schema.hasTable("users");
  if (!hasTable) return;

  const [hasCountry, hasTz, hasLang] = await Promise.all([
    knex.schema.hasColumn("users", "country"),
    knex.schema.hasColumn("users", "timezone"),
    knex.schema.hasColumn("users", "preferred_language"),
  ]);

  await knex.schema.alterTable("users", (table) => {
    if (hasCountry) table.dropColumn("country");
    if (hasTz) table.dropColumn("timezone");
    if (hasLang) table.dropColumn("preferred_language");
  });
};
