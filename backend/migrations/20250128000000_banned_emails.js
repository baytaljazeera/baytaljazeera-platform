exports.up = async function (knex) {
  // users.id is UUID (init.js + initial schema). banned_by was INTEGER
  // which makes the FK incompatible — Postgres rejects with
  // "foreign key constraint cannot be implemented" and the migration
  // fails on every Render deploy. Also guard with hasTable so the
  // migration is idempotent if init.js or a prior run already created it.
  const exists = await knex.schema.hasTable("banned_emails");
  if (exists) return;
  await knex.schema.createTable("banned_emails", (table) => {
    table.increments("id").primary();
    table.string("email").notNullable().unique();
    table.string("google_id").nullable();
    table.string("reason").defaultTo("deleted_by_admin");
    table.timestamp("banned_at").defaultTo(knex.fn.now());
    table.uuid("banned_by").references("id").inTable("users").onDelete("SET NULL");

    table.index("email");
    table.index("google_id");
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('banned_emails');
};
