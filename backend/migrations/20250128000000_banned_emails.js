exports.up = function(knex) {
  return knex.schema.createTable('banned_emails', (table) => {
    table.increments('id').primary();
    table.string('email').notNullable().unique();
    table.string('reason').defaultTo('deleted_by_admin');
    table.timestamp('banned_at').defaultTo(knex.fn.now());
    table.integer('banned_by').references('id').inTable('users').onDelete('SET NULL');
    
    table.index('email');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('banned_emails');
};
