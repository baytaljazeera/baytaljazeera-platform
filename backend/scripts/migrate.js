#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
(function loadEnvFromDotenv() {
  const p = path.join(__dirname, '../../.env');
  if (!fs.existsSync(p)) return;
  const content = fs.readFileSync(p, 'utf8');
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
})();

if (!process.env.DATABASE_URL || String(process.env.DATABASE_URL).trim() === '') {
  console.error('❌ DATABASE_URL is not set in project root .env (required for migrations).');
  process.exit(1);
}

const knex = require('knex');
const config = require('../knexfile');

const environment = process.env.NODE_ENV || 'development';
const db = knex(config[environment]);

async function runMigrations() {
  console.log('🔄 Running database migrations...');
  console.log(`📍 Environment: ${environment}`);
  
  try {
    const [batchNo, log] = await db.migrate.latest();
    
    if (log.length === 0) {
      console.log('✅ Already up to date');
    } else {
      console.log(`✅ Batch ${batchNo} ran: ${log.length} migrations`);
      log.forEach(migration => console.log(`   - ${migration}`));
    }
  } catch (error) {
    const msg =
      error?.message ||
      (error?.errors && error.errors[0]?.message) ||
      String(error);
    console.error('❌ Migration failed:', msg);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

async function rollbackMigration() {
  console.log('🔄 Rolling back last migration batch...');
  
  try {
    const [batchNo, log] = await db.migrate.rollback();
    
    if (log.length === 0) {
      console.log('✅ Nothing to rollback');
    } else {
      console.log(`✅ Batch ${batchNo} rolled back: ${log.length} migrations`);
      log.forEach(migration => console.log(`   - ${migration}`));
    }
  } catch (error) {
    console.error('❌ Rollback failed:', error.message);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

async function migrationStatus() {
  console.log('📋 Migration status:');
  
  try {
    const [completed, pending] = await Promise.all([
      db.migrate.list(),
    ]);
    
    const currentVersion = await db.migrate.currentVersion();
    console.log(`   Current version: ${currentVersion || 'none'}`);
    
  } catch (error) {
    console.error('❌ Status check failed:', error.message);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

const command = process.argv[2] || 'latest';

(async () => {
  switch (command) {
    case 'latest':
    case 'up':
      await runMigrations();
      break;
    case 'rollback':
    case 'down':
      await rollbackMigration();
      break;
    case 'status':
      await migrationStatus();
      break;
    default:
      console.log('Usage: node migrate.js [latest|rollback|status]');
      process.exit(1);
  }
})().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
