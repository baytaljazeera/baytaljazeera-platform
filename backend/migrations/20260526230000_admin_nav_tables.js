/**
 * Phase 1 of the Administrative OS refactor — make the admin sidebar
 * config a database citizen instead of a frozen TS array.
 *
 * Two tables:
 *   admin_nav_sections — the top-level groups (executive / finance / ...)
 *   admin_nav_links    — the rows inside each section, with permission
 *                        gates, count-badge bindings, and role-restricted
 *                        access encoded as data.
 *
 * After this lands, a new role (e.g., "quality_control") can be given
 * a sidebar entry by inserting one row, without touching code. The
 * Admin Sidebar fetches its config from /api/admin/sidebar-config.
 */

exports.up = async function (knex) {
  const hasSec = await knex.schema.hasTable("admin_nav_sections");
  if (!hasSec) {
    await knex.schema.createTable("admin_nav_sections", (table) => {
      table.string("key", 64).primary();
      table.string("label", 120).notNullable();
      table.string("icon_name", 64).notNullable();
      table.string("color_class", 64).notNullable().defaultTo("text-slate-400");
      table.integer("sort_order").notNullable().defaultTo(0);
      table.boolean("is_active").notNullable().defaultTo(true);
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }
  const hasLinks = await knex.schema.hasTable("admin_nav_links");
  if (!hasLinks) {
    await knex.schema.createTable("admin_nav_links", (table) => {
      table.bigIncrements("id").primary();
      table.string("section_key", 64).notNullable()
        .references("key").inTable("admin_nav_sections").onDelete("CASCADE");
      table.string("href", 255).notNullable();
      table.string("label", 120).notNullable();
      table.string("icon_name", 64).notNullable();
      table.string("permission_key", 64).notNullable().defaultTo("dashboard");
      table.jsonb("required_roles").nullable();   // array of role keys, ANY match grants access
      table.string("count_source", 64).nullable(); // key into /pending-counts response
      table.boolean("is_inbox").notNullable().defaultTo(false);
      table.boolean("is_report").notNullable().defaultTo(false);
      table.jsonb("child_routes").nullable();      // array of strings for active-state matching
      table.integer("sort_order").notNullable().defaultTo(0);
      table.boolean("is_active").notNullable().defaultTo(true);
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.index(["section_key", "sort_order"], "idx_admin_nav_links_section_sort");
    });
  }
};

exports.down = async function (knex) {
  if (await knex.schema.hasTable("admin_nav_links"))    await knex.schema.dropTable("admin_nav_links");
  if (await knex.schema.hasTable("admin_nav_sections")) await knex.schema.dropTable("admin_nav_sections");
};
