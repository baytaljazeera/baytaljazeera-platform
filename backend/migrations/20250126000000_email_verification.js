exports.up = async function(knex) {
  const hasColumn = async (table, column) => {
    return knex.schema.hasColumn(table, column);
  };

  if (!(await hasColumn('users', 'email_verified'))) {
    await knex.schema.alterTable('users', (table) => {
      table.boolean('email_verified').defaultTo(false);
      table.timestamp('email_verified_at');
    });
  }

  const tableExists = await knex.schema.hasTable('email_verification_tokens');
  if (!tableExists) {
    await knex.schema.createTable('email_verification_tokens', (table) => {
      table.increments('id').primary();
      table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
      table.string('token_hash').notNullable();
      table.timestamp('expires_at').notNullable();
      table.timestamp('used_at');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index('token_hash');
      table.index('user_id');
    });
  }

  console.log('✅ Email verification migration completed');
};

exports.down = async function(knex) {
  if (await knex.schema.hasTable('email_verification_tokens')) {
    await knex.schema.dropTable('email_verification_tokens');
  }

  if (await knex.schema.hasColumn('users', 'email_verified')) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('email_verified');
      table.dropColumn('email_verified_at');
    });
  }
};
