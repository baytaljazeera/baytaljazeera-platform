// backend/scripts/check-config.js - Check backend configuration
const db = require('../db');

async function checkConfig() {
  console.log('🔍 Checking backend configuration...\n');
  
  const checks = {
    envVars: {},
    database: false,
    adminUsers: []
  };
  
  // Check environment variables
  console.log('📋 Environment Variables:');
  const requiredVars = ['DATABASE_URL', 'JWT_SECRET', 'SESSION_SECRET'];
  const optionalVars = ['UPSTASH_REDIS_URL', 'REDIS_URL', 'PORT'];
  
  for (const varName of requiredVars) {
    const exists = !!process.env[varName];
    checks.envVars[varName] = exists;
    console.log(`   ${exists ? '✅' : '❌'} ${varName}: ${exists ? 'Set' : 'MISSING!'}`);
  }
  
  for (const varName of optionalVars) {
    const exists = !!process.env[varName];
    console.log(`   ${exists ? '✅' : '⚠️'} ${varName}: ${exists ? 'Set' : 'Not set (optional)'}`);
  }
  
  // Check database connection
  console.log('\n🗄️  Database Connection:');
  try {
    const result = await db.query('SELECT NOW() as current_time');
    checks.database = true;
    console.log(`   ✅ Connected successfully`);
    console.log(`   📅 Server time: ${result.rows[0].current_time}`);
  } catch (err) {
    checks.database = false;
    console.log(`   ❌ Connection failed: ${err.message}`);
  }
  
  // Check admin users
  if (checks.database) {
    console.log('\n👤 Admin Users:');
    try {
      const admins = await db.query(`
        SELECT email, role, role_level, 
               locked_until, failed_login_attempts,
               created_at, last_login_at
        FROM users 
        WHERE role IN ('super_admin', 'admin', 'finance_admin', 'support_admin', 'content_admin')
        ORDER BY role_level DESC, email
      `);
      
      if (admins.rows.length === 0) {
        console.log('   ⚠️  No admin users found!');
        console.log('   💡 Run: node backend/scripts/create-admin.js');
      } else {
        checks.adminUsers = admins.rows;
        admins.rows.forEach((admin, index) => {
          const locked = admin.locked_until && new Date(admin.locked_until) > new Date();
          const status = locked ? '🔒 LOCKED' : '✅ Active';
          console.log(`   ${index + 1}. ${admin.email}`);
          console.log(`      Role: ${admin.role} (level: ${admin.role_level})`);
          console.log(`      Status: ${status}`);
          if (admin.failed_login_attempts > 0) {
            console.log(`      Failed attempts: ${admin.failed_login_attempts}`);
          }
          if (admin.last_login_at) {
            console.log(`      Last login: ${admin.last_login_at}`);
          }
        });
      }
    } catch (err) {
      console.log(`   ❌ Error checking admin users: ${err.message}`);
    }
    
    // Check countries and cities
    console.log('\n🌍 Countries & Cities:');
    try {
      const countriesCount = await db.query('SELECT COUNT(*) as cnt FROM countries');
      const citiesCount = await db.query('SELECT COUNT(*) as cnt FROM cities');
      console.log(`   ✅ Countries: ${countriesCount.rows[0].cnt}`);
      console.log(`   ✅ Cities: ${citiesCount.rows[0].cnt}`);
    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
      console.log('   💡 Tables may not exist. Run init.js');
    }
    
    // Check plans
    console.log('\n📦 Plans:');
    try {
      const plansCount = await db.query('SELECT COUNT(*) as cnt FROM plans WHERE visible = true');
      console.log(`   ✅ Visible plans: ${plansCount.rows[0].cnt}`);
      if (parseInt(plansCount.rows[0].cnt) === 0) {
        console.log('   ⚠️  No visible plans found!');
        console.log('   💡 Run: node backend/scripts/ensure-plans.js');
      }
    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
    }
  }
  
  // Summary
  console.log('\n📊 Summary:');
  const missingVars = requiredVars.filter(v => !checks.envVars[v]);
  if (missingVars.length > 0) {
    console.log(`   ❌ Missing required environment variables: ${missingVars.join(', ')}`);
  } else {
    console.log('   ✅ All required environment variables are set');
  }
  
  if (!checks.database) {
    console.log('   ❌ Database connection failed');
  } else {
    console.log('   ✅ Database connection OK');
  }
  
  if (checks.adminUsers.length === 0 && checks.database) {
    console.log('   ⚠️  No admin users found - create them first');
  } else if (checks.adminUsers.length > 0) {
    console.log(`   ✅ Found ${checks.adminUsers.length} admin user(s)`);
  }
  
  process.exit(0);
}

checkConfig().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
