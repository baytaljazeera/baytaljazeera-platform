// Disable Maintenance Mode
const db = require('../db');

async function disableMaintenance() {
  try {
    console.log('🔧 Disabling maintenance mode...');
    
    await db.query(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ('maintenance_mode', 'false', NOW())
      ON CONFLICT (key) DO UPDATE SET value = 'false', updated_at = NOW()
    `);
    
    console.log('✅ Maintenance mode disabled!');
    console.log('🌐 Site should be accessible now.');
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

disableMaintenance();
