const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Creating database tables...');
    
    await client.query(`
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) UNIQUE,
        role VARCHAR(50) DEFAULT 'customer',
        status VARCHAR(50) DEFAULT 'active',
        avatar_url TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- Countries table
      CREATE TABLE IF NOT EXISTS countries (
        id SERIAL PRIMARY KEY,
        code VARCHAR(10) UNIQUE NOT NULL,
        name_en VARCHAR(100) NOT NULL,
        name_ar VARCHAR(100) NOT NULL,
        currency VARCHAR(10),
        flag VARCHAR(10),
        is_active BOOLEAN DEFAULT true
      );

      -- Cities table
      CREATE TABLE IF NOT EXISTS cities (
        id SERIAL PRIMARY KEY,
        country_id INTEGER REFERENCES countries(id),
        name_en VARCHAR(100) NOT NULL,
        name_ar VARCHAR(100) NOT NULL,
        latitude DECIMAL(10, 7),
        longitude DECIMAL(10, 7),
        is_featured BOOLEAN DEFAULT false,
        sort_order INTEGER DEFAULT 0
      );

      -- Subscription plans table
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        name_ar VARCHAR(255),
        description TEXT,
        description_ar TEXT,
        price DECIMAL(10, 2) NOT NULL,
        duration_days INTEGER NOT NULL,
        listings_limit INTEGER NOT NULL,
        features JSONB,
        is_active BOOLEAN DEFAULT true,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- Properties table
      CREATE TABLE IF NOT EXISTS properties (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        type VARCHAR(100) NOT NULL,
        purpose VARCHAR(50) NOT NULL,
        city VARCHAR(100) NOT NULL,
        district VARCHAR(100),
        price DECIMAL(15, 2),
        area DECIMAL(15, 2),
        land_area DECIMAL(15, 2),
        building_area DECIMAL(15, 2),
        bedrooms INTEGER,
        bathrooms INTEGER,
        latitude DECIMAL(10, 7),
        longitude DECIMAL(10, 7),
        status VARCHAR(50) DEFAULT 'pending',
        video_status VARCHAR(50) DEFAULT 'none',
        video_url TEXT,
        images JSONB,
        features JSONB,
        quota_bucket_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- User subscriptions table
      CREATE TABLE IF NOT EXISTS user_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        plan_id INTEGER REFERENCES subscription_plans(id),
        status VARCHAR(50) DEFAULT 'active',
        start_date TIMESTAMP DEFAULT NOW(),
        end_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Messages table
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        receiver_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        listing_id INTEGER,
        content TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Favorites table
      CREATE TABLE IF NOT EXISTS favorites (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        listing_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, listing_id)
      );

      -- Notifications table
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT,
        listing_id INTEGER,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Listing reports table
      CREATE TABLE IF NOT EXISTS listing_reports (
        id SERIAL PRIMARY KEY,
        listing_id INTEGER,
        reason VARCHAR(255) NOT NULL,
        details TEXT,
        reporter_name VARCHAR(255),
        reporter_phone VARCHAR(50),
        status VARCHAR(50) DEFAULT 'new',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- Account complaints table
      CREATE TABLE IF NOT EXISTS account_complaints (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        user_name VARCHAR(255),
        user_email VARCHAR(255),
        user_phone VARCHAR(50),
        category VARCHAR(100) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        details TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'new',
        admin_response TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- News table
      CREATE TABLE IF NOT EXISTS news (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'general',
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- Featured cities table
      CREATE TABLE IF NOT EXISTS featured_cities (
        id SERIAL PRIMARY KEY,
        city_name VARCHAR(255) NOT NULL,
        city_name_ar VARCHAR(255),
        country VARCHAR(100),
        display_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log('✅ Core tables created!');

    // Insert default countries
    await client.query(`
      INSERT INTO countries (code, name_en, name_ar, currency, flag, is_active)
      VALUES 
        ('SA', 'Saudi Arabia', 'المملكة العربية السعودية', 'SAR', '🇸🇦', true),
        ('AE', 'United Arab Emirates', 'الإمارات العربية المتحدة', 'AED', '🇦🇪', true),
        ('KW', 'Kuwait', 'الكويت', 'KWD', '🇰🇼', true),
        ('QA', 'Qatar', 'قطر', 'QAR', '🇶🇦', true),
        ('BH', 'Bahrain', 'البحرين', 'BHD', '🇧🇭', true),
        ('OM', 'Oman', 'عمان', 'OMR', '🇴🇲', true),
        ('EG', 'Egypt', 'مصر', 'EGP', '🇪🇬', true),
        ('TR', 'Turkey', 'تركيا', 'TRY', '🇹🇷', true),
        ('LB', 'Lebanon', 'لبنان', 'LBP', '🇱🇧', true)
      ON CONFLICT (code) DO NOTHING;
    `);

    console.log('✅ Countries inserted!');
    console.log('🎉 Database initialization complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

initDatabase();
