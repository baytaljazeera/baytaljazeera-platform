exports.up = async function(knex) {
  await knex.schema.alterTable('plans', (table) => {
    table.jsonb('video_config').defaultTo(JSON.stringify({
      enabled: false,
      tier: 'tier1_safwa',
      ambience: 'none'
    }));
  });
};

exports.down = async function(knex) {
  await knex.schema.alterTable('plans', (table) => {
    table.dropColumn('video_config');
  });
};
