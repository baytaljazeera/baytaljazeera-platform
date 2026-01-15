exports.up = async function(knex) {
  const tableExists = async (tableName) => {
    return knex.schema.hasTable(tableName);
  };

  if (!(await tableExists('users'))) {
    await knex.schema.createTable('users', (table) => {
      table.increments('id').primary();
      table.string('email').unique().notNullable();
      table.string('password').notNullable();
      table.string('name').notNullable();
      table.string('phone').unique();
      table.string('role').defaultTo('customer');
      table.string('status').defaultTo('active');
      table.string('avatar_url');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }

  if (!(await tableExists('properties'))) {
    await knex.schema.createTable('properties', (table) => {
      table.increments('id').primary();
      table.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.string('title').notNullable();
      table.text('description');
      table.string('type').notNullable();
      table.string('purpose').notNullable();
      table.string('city').notNullable();
      table.string('district');
      table.decimal('price', 15, 2);
      table.decimal('area', 15, 2);
      table.decimal('land_area', 15, 2);
      table.decimal('building_area', 15, 2);
      table.integer('bedrooms');
      table.integer('bathrooms');
      table.decimal('latitude', 10, 7);
      table.decimal('longitude', 10, 7);
      table.string('status').defaultTo('pending');
      table.string('video_status').defaultTo('none');
      table.string('video_url');
      table.json('images');
      table.json('features');
      table.integer('quota_bucket_id');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }

  if (!(await tableExists('subscription_plans'))) {
    await knex.schema.createTable('subscription_plans', (table) => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.string('name_ar');
      table.text('description');
      table.text('description_ar');
      table.decimal('price', 10, 2).notNullable();
      table.integer('duration_days').notNullable();
      table.integer('listings_limit').notNullable();
      table.json('features');
      table.boolean('is_active').defaultTo(true);
      table.integer('sort_order').defaultTo(0);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }

  if (!(await tableExists('user_subscriptions'))) {
    await knex.schema.createTable('user_subscriptions', (table) => {
      table.increments('id').primary();
      table.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.integer('plan_id').references('id').inTable('subscription_plans');
      table.string('status').defaultTo('active');
      table.timestamp('start_date').defaultTo(knex.fn.now());
      table.timestamp('end_date');
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  if (!(await tableExists('listing_reports'))) {
    await knex.schema.createTable('listing_reports', (table) => {
      table.increments('id').primary();
      table.integer('listing_id');
      table.string('reason').notNullable();
      table.text('details');
      table.string('reporter_name');
      table.string('reporter_phone');
      table.string('status').defaultTo('new');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }

  if (!(await tableExists('account_complaints'))) {
    await knex.schema.createTable('account_complaints', (table) => {
      table.increments('id').primary();
      table.integer('user_id').references('id').inTable('users').onDelete('SET NULL');
      table.string('user_name');
      table.string('user_email');
      table.string('user_phone');
      table.string('category').notNullable();
      table.string('subject').notNullable();
      table.text('details').notNullable();
      table.string('status').defaultTo('new');
      table.text('admin_response');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }

  if (!(await tableExists('news'))) {
    await knex.schema.createTable('news', (table) => {
      table.increments('id').primary();
      table.string('title').notNullable();
      table.text('content').notNullable();
      table.string('type').defaultTo('general');
      table.boolean('active').defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }

  if (!(await tableExists('favorites'))) {
    await knex.schema.createTable('favorites', (table) => {
      table.increments('id').primary();
      table.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.integer('listing_id').references('id').inTable('properties').onDelete('CASCADE');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.unique(['user_id', 'listing_id']);
    });
  }

  if (!(await tableExists('notifications'))) {
    await knex.schema.createTable('notifications', (table) => {
      table.increments('id').primary();
      table.integer('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.string('type').notNullable();
      table.string('title').notNullable();
      table.text('message');
      table.integer('listing_id');
      table.boolean('is_read').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  if (!(await tableExists('messages'))) {
    await knex.schema.createTable('messages', (table) => {
      table.increments('id').primary();
      table.integer('sender_id').references('id').inTable('users').onDelete('CASCADE');
      table.integer('receiver_id').references('id').inTable('users').onDelete('CASCADE');
      table.integer('listing_id');
      table.text('content').notNullable();
      table.boolean('is_read').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  console.log('✅ Initial migration completed - all core tables created');
};

exports.down = async function(knex) {
  const tables = [
    'messages', 'notifications', 'favorites', 'news',
    'account_complaints', 'listing_reports', 'user_subscriptions',
    'subscription_plans', 'properties', 'users'
  ];

  for (const table of tables) {
    if (await knex.schema.hasTable(table)) {
      await knex.schema.dropTable(table);
    }
  }
};
