/**
 * Feedback system: responses, settings, and questions tables.
 * Bayt Al Jazeera - User Feedback
 */

exports.up = function (knex) {
  return knex.schema
    .createTable('feedback_responses', (table) => {
      table.increments('id').primary();
      table.integer('rating').unsigned().nullable();
      table.boolean('had_issue').nullable();
      table.text('comment').nullable();
      table.string('page_url', 2048).nullable();
      table.string('page_type', 50).nullable(); // home, search, search_map, listing
      table.string('device_type', 100).nullable();
      table.uuid('user_id').nullable(); // optional FK to users.id
      table.jsonb('answers').nullable(); // custom question answers for Questions Manager
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index(['page_type', 'created_at']);
      table.index('created_at');
    })
    .then(() =>
      knex.schema.createTable('feedback_settings', (table) => {
        table.string('key', 100).primary();
        table.text('value').nullable(); // JSON string for complex values
        table.timestamp('updated_at').defaultTo(knex.fn.now());
      })
    )
    .then(() =>
      knex.schema.createTable('feedback_questions', (table) => {
        table.increments('id').primary();
        table.string('question_text_ar', 500).notNullable();
        table.string('question_type', 50).notNullable(); // rating, yes_no, short_text, multiple_choice
        table.jsonb('options').nullable(); // for multiple_choice: array of { value, label }
        table.boolean('is_required').defaultTo(false);
        table.integer('sort_order').defaultTo(0);
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
        table.index('sort_order');
      })
    );
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('feedback_questions')
    .then(() => knex.schema.dropTableIfExists('feedback_settings'))
    .then(() => knex.schema.dropTableIfExists('feedback_responses'));
};
