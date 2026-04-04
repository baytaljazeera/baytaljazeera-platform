const path = require('path');

function pgConnection() {
  const url = process.env.DATABASE_URL;
  if (!url) return url;
  if (url.includes('render.com') || url.includes('neon.tech') || url.includes('supabase.co')) {
    return { connectionString: url, ssl: { rejectUnauthorized: false } };
  }
  return url;
}

module.exports = {
  development: {
    client: 'pg',
    connection: pgConnection(),
    pool: {
      min: 2,
      max: 20,
      idleTimeoutMillis: 30000,
      createTimeoutMillis: 5000,
      acquireTimeoutMillis: 30000,
    },
    migrations: {
      directory: path.join(__dirname, 'migrations'),
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: path.join(__dirname, 'seeds'),
    },
  },

  production: {
    client: 'pg',
    connection: pgConnection(),
    pool: {
      min: 2,
      max: 20,
      idleTimeoutMillis: 30000,
    },
    migrations: {
      directory: path.join(__dirname, 'migrations'),
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: path.join(__dirname, 'seeds'),
    },
  },
};
