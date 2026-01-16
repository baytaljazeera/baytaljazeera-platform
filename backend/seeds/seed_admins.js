const db = require('../db');
const admins = require('./admins_backup.json');

async function seedAdmins() {
  console.log('🌱 Starting admin users seed...');
  
  try {
    for (const admin of admins) {
      const existing = await db.query('SELECT id FROM users WHERE email = $1', [admin.email]);
      
      if (existing.rows.length > 0) {
        await db.query(`
          UPDATE users SET 
            name = $1, phone = $2, role = $3, role_level = $4, password_hash = $5,
            updated_at = NOW()
          WHERE email = $6
        `, [admin.name, admin.phone, admin.role, admin.role_level, admin.password_hash, admin.email]);
        console.log(`✅ Updated: ${admin.email}`);
      } else {
        await db.query(`
          INSERT INTO users (id, email, name, phone, role, role_level, password_hash, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        `, [admin.id, admin.email, admin.name, admin.phone, admin.role, admin.role_level, admin.password_hash]);
        console.log(`✅ Inserted: ${admin.email}`);
      }
    }
    
    console.log('🎉 Admin users seed completed successfully!');
    
  } catch (error) {
    console.error('❌ Error seeding admins:', error.message);
    throw error;
  }
}

if (require.main === module) {
  seedAdmins()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { seedAdmins };
