const db = require('../db');

async function run() {
  try {
    const result = await db.query('DELETE FROM properties WHERE is_promotional = true');
    console.log('Deleted promotional:', result.rowCount);
    
    const count = await db.query('SELECT COUNT(*) as count FROM properties');
    console.log('Remaining properties:', count.rows[0].count);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

run();
