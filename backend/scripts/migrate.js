#!/usr/bin/env node

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
    console.error('❌ Migration failed:', error.message);
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

switch (command) {
  case 'latest':
  case 'up':
    runMigrations();
    break;
  case 'rollback':
  case 'down':
    rollbackMigration();
    break;
  case 'status':
    migrationStatus();
    break;
  default:
    console.log('Usage: node migrate.js [latest|rollback|status]');
    process.exit(1);
}
