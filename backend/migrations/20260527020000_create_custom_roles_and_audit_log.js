/**
 * Create custom_roles + permission_audit_log as a real Knex migration.
 *
 * Why: these tables were originally defined only in
 *   - backend/migrations/add_audit_and_custom_roles.sql (raw SQL, never auto-applied)
 *   - backend/scripts/run_audit_migration.js (manual, one-off script)
 * Neither runs on deploy (`migrate.js latest` only picks up *.js Knex
 * migrations), so on any env where the manual script was skipped the API
 * blows up with `relation "custom_roles" does not exist` the moment an
 * admin tries to create a role (e.g. "human_resources").
 *
 * Timestamp is placed before 20260527030000_custom_roles_capability_flags
 * so the capability flag columns apply on top of a freshly-created table.
 * Uses hasTable/hasColumn guards so envs where the table already exists
 * (from the legacy raw SQL run) stay intact.
 */

exports.up = async function (knex) {
  const hasAudit = await knex.schema.hasTable("permission_audit_log");
  if (!hasAudit) {
    await knex.schema.createTable("permission_audit_log", (t) => {
      t.increments("id").primary();
      t.string("action_type", 50).notNullable();
      t.string("target_role", 100);
      t.string("target_user_id", 255);
      t.string("target_user_name", 255);
      t.string("changed_by_id", 255).notNullable();
      t.string("changed_by_name", 255);
      t.jsonb("old_value");
      t.jsonb("new_value");
      t.string("ip_address", 100);
      t.text("user_agent");
      t.timestamp("created_at").defaultTo(knex.fn.now());
    });
    await knex.raw(
      `CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON permission_audit_log(created_at DESC)`
    );
    await knex.raw(
      `CREATE INDEX IF NOT EXISTS idx_audit_log_action_type ON permission_audit_log(action_type)`
    );
  }

  const hasRoles = await knex.schema.hasTable("custom_roles");
  if (!hasRoles) {
    await knex.schema.createTable("custom_roles", (t) => {
      t.increments("id").primary();
      t.string("key", 100).notNullable().unique();
      t.string("label", 255).notNullable();
      t.text("description");
      t.string("color", 20).defaultTo("#6B7280");
      t.string("icon", 50).defaultTo("Shield");
      t.boolean("is_active").defaultTo(true);
      t.string("created_by", 255);
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());
    });
    await knex.raw(
      `CREATE INDEX IF NOT EXISTS idx_custom_roles_active ON custom_roles(is_active) WHERE is_active = true`
    );
  }
};

exports.down = async function (knex) {
  // Intentionally do nothing — these tables hold owner-created roles and
  // audit history. A rollback should never silently wipe that data.
};
