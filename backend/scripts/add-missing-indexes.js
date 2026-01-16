// backend/scripts/add-missing-indexes.js
// إضافة Indexes ناقصة لتحسين الأداء

const db = require('../db');

async function addMissingIndexes() {
  const client = await db.pool.connect();
  
  try {
    console.log('🔍 فحص وإضافة Indexes ناقصة...');
    
    // Critical indexes for performance
    const indexes = [
      // Properties - Search & Filter Performance
      { 
        name: 'idx_properties_status_approved',
        query: `CREATE INDEX IF NOT EXISTS idx_properties_status_approved ON properties(status) WHERE status = 'approved'`
      },
      { 
        name: 'idx_properties_city_status',
        query: `CREATE INDEX IF NOT EXISTS idx_properties_city_status ON properties(city, status) WHERE status = 'approved'`
      },
      { 
        name: 'idx_properties_created_at_desc',
        query: `CREATE INDEX IF NOT EXISTS idx_properties_created_at_desc ON properties(created_at DESC)`
      },
      { 
        name: 'idx_properties_expires_at',
        query: `CREATE INDEX IF NOT EXISTS idx_properties_expires_at ON properties(expires_at) WHERE expires_at IS NOT NULL`
      },
      
      // Users - Authentication Performance
      { 
        name: 'idx_users_email_lower',
        query: `CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email))`
      },
      { 
        name: 'idx_users_role_status',
        query: `CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status)`
      },
      
      // User Plans - Subscription Performance
      { 
        name: 'idx_user_plans_user_status',
        query: `CREATE INDEX IF NOT EXISTS idx_user_plans_user_status ON user_plans(user_id, status) WHERE status = 'active'`
      },
      { 
        name: 'idx_user_plans_expires_at',
        query: `CREATE INDEX IF NOT EXISTS idx_user_plans_expires_at ON user_plans(expires_at) WHERE expires_at IS NOT NULL`
      },
      
      // Quota Buckets - Quota Management Performance
      { 
        name: 'idx_quota_buckets_user_active_expires',
        query: `CREATE INDEX IF NOT EXISTS idx_quota_buckets_user_active_expires ON quota_buckets(user_id, active, expires_at) WHERE active = true`
      },
      
      // Listing Media - Media Query Performance
      { 
        name: 'idx_listing_media_listing_kind',
        query: `CREATE INDEX IF NOT EXISTS idx_listing_media_listing_kind ON listing_media(listing_id, kind)`
      },
      { 
        name: 'idx_listing_media_sort_order',
        query: `CREATE INDEX IF NOT EXISTS idx_listing_media_sort_order ON listing_media(listing_id, sort_order)`
      },
      
      // Messages - Message Performance
      { 
        name: 'idx_messages_user_unread',
        query: `CREATE INDEX IF NOT EXISTS idx_messages_user_unread ON messages((CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END), is_read) WHERE is_read = false`
      },
      
      // Notifications - Notification Performance
      { 
        name: 'idx_notifications_user_unread',
        query: `CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false`
      },
      { 
        name: 'idx_notifications_created_desc',
        query: `CREATE INDEX IF NOT EXISTS idx_notifications_created_desc ON notifications(user_id, created_at DESC)`
      },
    ];
    
    await client.query('BEGIN');
    
    let added = 0;
    let skipped = 0;
    
    for (const index of indexes) {
      try {
        // Check if index exists
        const checkResult = await client.query(`
          SELECT 1 FROM pg_indexes 
          WHERE indexname = $1
        `, [index.name]);
        
        if (checkResult.rows.length === 0) {
          // Some indexes need special handling
          if (index.name === 'idx_messages_user_unread') {
            // Skip this complex index - needs special query
            console.log(`⏭️  Skipping complex index: ${index.name}`);
            skipped++;
            continue;
          }
          
          await client.query(index.query);
          console.log(`✅ Added index: ${index.name}`);
          added++;
        } else {
          console.log(`ℹ️  Index already exists: ${index.name}`);
          skipped++;
        }
      } catch (err) {
        console.error(`❌ Error adding index ${index.name}:`, err.message);
      }
    }
    
    await client.query('COMMIT');
    
    console.log(`\n✅ Completed: ${added} added, ${skipped} skipped`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error adding indexes:', err);
    throw err;
  } finally {
    client.release();
    db.pool.end();
  }
}

if (require.main === module) {
  addMissingIndexes()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { addMissingIndexes };
