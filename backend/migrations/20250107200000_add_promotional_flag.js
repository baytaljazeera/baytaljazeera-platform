exports.up = async function(knex) {
  const hasColumn = await knex.schema.hasColumn('properties', 'is_promotional');
  
  if (!hasColumn) {
    await knex.schema.alterTable('properties', (table) => {
      table.boolean('is_promotional').defaultTo(false);
    });
    console.log('✅ Added is_promotional column to properties table');
  }
};

exports.down = async function(knex) {
  const hasColumn = await knex.schema.hasColumn('properties', 'is_promotional');
  
  if (hasColumn) {
    await knex.schema.alterTable('properties', (table) => {
      table.dropColumn('is_promotional');
    });
  }
};
