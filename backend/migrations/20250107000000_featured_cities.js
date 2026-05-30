exports.up = async function (knex) {
  // backend/init.js already creates featured_cities at boot, so this
  // migration kept failing on every Render deploy with
  // 'relation "featured_cities" already exists'. Guard with hasTable
  // so the migration is idempotent on fresh DBs and a no-op everywhere
  // init.js has already run.
  const exists = await knex.schema.hasTable("featured_cities");
  if (exists) return;
  await knex.schema.createTable("featured_cities", (table) => {
    table.increments("id").primary();
    table.string("name_ar", 100).notNullable();
    table.string("name_en", 100);
    table.string("country_code", 2).notNullable();
    table.string("country_name_ar", 100);
    table.string("image_url", 500);
    table.integer("properties_count").defaultTo(0);
    table.integer("sort_order").defaultTo(0);
    table.boolean("is_active").defaultTo(true);
    table.boolean("is_capital").defaultTo(false);
    table.timestamps(true, true);

    table.index(["is_active", "sort_order"]);
    table.index("country_code");
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('featured_cities');
};
