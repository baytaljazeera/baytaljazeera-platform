/**
 * Phase 2 of the Administrative OS — generic Inbox Engine.
 *
 * Each row in admin_inboxes is a self-contained inbox spec:
 *   - title / icon / accent
 *   - source_kind: which dataset feeds it ('complaints' for now)
 *   - source_filter JSONB: e.g. { auto_assigned_role: 'content_admin' }
 *   - required_roles JSONB: who can open it
 *   - count_source: which key from /pending-counts powers the badge
 *
 * A new department inbox = INSERT one row + the corresponding
 * admin_nav_links row pointing to /admin/inbox/<key>.
 */

exports.up = async function (knex) {
  const exists = await knex.schema.hasTable("admin_inboxes");
  if (exists) return;
  await knex.schema.createTable("admin_inboxes", (table) => {
    table.string("key", 64).primary();
    table.string("title", 120).notNullable();
    table.string("icon_name", 64).notNullable().defaultTo("Inbox");
    table.string("accent_color", 32).notNullable().defaultTo("text-slate-500");
    table.string("source_kind", 32).notNullable().defaultTo("complaints");
    table.jsonb("source_filter").nullable();
    table.jsonb("required_roles").nullable();
    table.string("count_source", 64).nullable();
    table.boolean("is_active").notNullable().defaultTo(true);
    table.integer("sort_order").notNullable().defaultTo(0);
    table.text("description").nullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  if (await knex.schema.hasTable("admin_inboxes")) await knex.schema.dropTable("admin_inboxes");
};
