exports.up = async function(knex) {
  // Create replit_users table for OAuth users
  await knex.schema.createTable('replit_users', (table) => {
    table.string('id').primary(); // Replit user ID (sub claim)
    table.string('email').unique();
    table.string('first_name');
    table.string('last_name');
    table.string('profile_image_url');
    table.integer('local_user_id').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // Create replit_sessions table for session storage
  await knex.schema.createTable('replit_sessions', (table) => {
    table.string('sid').primary();
    table.jsonb('sess').notNullable();
    table.timestamp('expire').notNullable();
    table.index('expire', 'IDX_replit_session_expire');
  });

  // Add oauth_provider column to existing users table if not exists
  const hasOauthProvider = await knex.schema.hasColumn('users', 'oauth_provider');
  if (!hasOauthProvider) {
    await knex.schema.alterTable('users', (table) => {
      table.string('oauth_provider'); // 'replit', 'google', 'apple', etc.
      table.string('oauth_id'); // ID from OAuth provider
    });
  }

  console.log('✅ Replit Auth tables created successfully');
};

exports.down = async function(knex) {
  // Remove oauth columns from users
  const hasOauthProvider = await knex.schema.hasColumn('users', 'oauth_provider');
  if (hasOauthProvider) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('oauth_provider');
      table.dropColumn('oauth_id');
    });
  }

  // Drop tables
  await knex.schema.dropTableIfExists('replit_sessions');
  await knex.schema.dropTableIfExists('replit_users');

  console.log('✅ Replit Auth tables dropped');
};
