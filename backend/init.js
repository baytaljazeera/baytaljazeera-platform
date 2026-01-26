// backend/init.js - Initialize database schema
const db = require("./db");
const bcrypt = require("bcrypt");

async function initializeDatabase() {
  try {
    // Enable UUID extension
    await db.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    // Create users table with all required fields
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name TEXT,
        phone TEXT UNIQUE,
        whatsapp TEXT,
        email_verified_at TIMESTAMPTZ,
        phone_verified_at TIMESTAMPTZ,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Add missing columns to users if they don't exist
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'whatsapp') THEN
          ALTER TABLE users ADD COLUMN whatsapp TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email_verified_at') THEN
          ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone_verified_at') THEN
          ALTER TABLE users ADD COLUMN phone_verified_at TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email_verification_token') THEN
          ALTER TABLE users ADD COLUMN email_verification_token TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email_verification_expires') THEN
          ALTER TABLE users ADD COLUMN email_verification_expires TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'updated_at') THEN
          ALTER TABLE users ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role_level') THEN
          ALTER TABLE users ADD COLUMN role_level INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'last_login_at') THEN
          ALTER TABLE users ADD COLUMN last_login_at TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'login_count') THEN
          ALTER TABLE users ADD COLUMN login_count INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'failed_login_attempts') THEN
          ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'locked_until') THEN
          ALTER TABLE users ADD COLUMN locked_until TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'stripe_customer_id') THEN
          ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'stripe_subscription_id') THEN
          ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'google_id') THEN
          ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email_verified') THEN
          ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'profile_image') THEN
          ALTER TABLE users ADD COLUMN profile_image TEXT;
        END IF;
      END $$;
    `);
    console.log("✅ Account lockout, Stripe, and OAuth columns added");

    // Create admin sidebar settings table early to avoid being blocked by later errors
    await db.query(`
      CREATE TABLE IF NOT EXISTS admin_sidebar_settings (
        id SERIAL PRIMARY KEY,
        section_key VARCHAR(50) NOT NULL UNIQUE,
        section_label VARCHAR(100) NOT NULL,
        is_visible BOOLEAN DEFAULT true,
        sort_order INTEGER DEFAULT 0,
        updated_by UUID,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    const sidebarSections = [
      { key: 'dashboard', label: 'لوحة التحكم', sort_order: 1 },
      { key: 'listings', label: 'الإعلانات', sort_order: 2 },
      { key: 'reports', label: 'بلاغات الإعلانات', sort_order: 3 },
      { key: 'customer-service', label: 'خدمة العملاء', sort_order: 4 },
      { key: 'customer-conversations', label: 'مراقبة محادثات العملاء', sort_order: 5 },
      { key: 'messages', label: 'المراسلات الداخلية', sort_order: 6 },
      { key: 'news', label: 'شريط الأخبار', sort_order: 7 },
      { key: 'featured-cities', label: 'المدن الأكثر طلبًا', sort_order: 8 },
      { key: 'finance', label: 'المالية والاشتراكات', sort_order: 9 },
      { key: 'membership', label: 'طلبات الترقية الإدارية', sort_order: 10 },
      { key: 'plans', label: 'إدارة الباقات', sort_order: 11 },
      { key: 'marketing', label: 'التسويق والدعاية', sort_order: 12 },
      { key: 'ambassador', label: 'سفراء البيت', sort_order: 13 },
      { key: 'ai-center', label: 'مركز الذكاء الاصطناعي', sort_order: 14 },
      { key: 'users', label: 'إدارة العملاء', sort_order: 15 },
      { key: 'roles', label: 'إدارة الصلاحيات', sort_order: 16 },
      { key: 'settings', label: 'الإعدادات', sort_order: 17 },
    ];
    for (const section of sidebarSections) {
      await db.query(`
        INSERT INTO admin_sidebar_settings (section_key, section_label, sort_order)
        VALUES ($1, $2, $3)
        ON CONFLICT (section_key) DO UPDATE SET section_label = $2, sort_order = $3
      `, [section.key, section.label, section.sort_order]);
    }
    console.log("✅ Admin sidebar settings table created");

    // Create trigger for updated_at
    await db.query(`
      CREATE OR REPLACE FUNCTION trigger_set_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await db.query(`
      DROP TRIGGER IF EXISTS set_timestamp ON users;
      CREATE TRIGGER set_timestamp
      BEFORE UPDATE ON users
      FOR EACH ROW
      EXECUTE PROCEDURE trigger_set_timestamp();
    `);

    // Create plans table
    await db.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id SERIAL PRIMARY KEY,
        name_ar VARCHAR(255) NOT NULL,
        name_en VARCHAR(255) NOT NULL,
        slug TEXT UNIQUE,
        price DECIMAL(10, 2) NOT NULL,
        duration_days INTEGER DEFAULT 30,
        max_listings INTEGER NOT NULL,
        max_photos_per_listing INTEGER NOT NULL,
        max_videos_per_listing INTEGER NOT NULL,
        show_on_map BOOLEAN DEFAULT false,
        ai_support_level INTEGER DEFAULT 0,
        highlights_allowed INTEGER DEFAULT 0,
        description TEXT,
        logo TEXT,
        icon TEXT,
        color TEXT DEFAULT '#D4AF37',
        badge TEXT,
        visible BOOLEAN DEFAULT true,
        features JSONB DEFAULT '[]'::jsonb,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Add new columns to plans if they don't exist
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'logo') THEN
          ALTER TABLE plans ADD COLUMN logo TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'icon') THEN
          ALTER TABLE plans ADD COLUMN icon TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'color') THEN
          ALTER TABLE plans ADD COLUMN color TEXT DEFAULT '#D4AF37';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'badge') THEN
          ALTER TABLE plans ADD COLUMN badge TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'visible') THEN
          ALTER TABLE plans ADD COLUMN visible BOOLEAN DEFAULT true;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'features') THEN
          ALTER TABLE plans ADD COLUMN features JSONB DEFAULT '[]'::jsonb;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'sort_order') THEN
          ALTER TABLE plans ADD COLUMN sort_order INTEGER DEFAULT 0;
        END IF;
        -- حقول جديدة: الدعم الإضافي ومدة الفيديو وأيقونة مخصصة
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'support_level') THEN
          ALTER TABLE plans ADD COLUMN support_level INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'max_video_duration') THEN
          ALTER TABLE plans ADD COLUMN max_video_duration INTEGER DEFAULT 60;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'max_video_seconds') THEN
          ALTER TABLE plans ADD COLUMN max_video_seconds INTEGER DEFAULT 60;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'ai_calls_per_month') THEN
          ALTER TABLE plans ADD COLUMN ai_calls_per_month INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'highlights_allowed') THEN
          ALTER TABLE plans ADD COLUMN highlights_allowed INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'has_extra_support') THEN
          ALTER TABLE plans ADD COLUMN has_extra_support BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'custom_icon') THEN
          ALTER TABLE plans ADD COLUMN custom_icon TEXT;
        END IF;
        -- حقول الشارة الجديدة للتحكم الكامل
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'badge_enabled') THEN
          ALTER TABLE plans ADD COLUMN badge_enabled BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'badge_text') THEN
          ALTER TABLE plans ADD COLUMN badge_text VARCHAR(100);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'badge_position') THEN
          ALTER TABLE plans ADD COLUMN badge_position VARCHAR(20) DEFAULT 'top-right';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'badge_shape') THEN
          ALTER TABLE plans ADD COLUMN badge_shape VARCHAR(20) DEFAULT 'ribbon';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'badge_bg_color') THEN
          ALTER TABLE plans ADD COLUMN badge_bg_color VARCHAR(20) DEFAULT '#D4AF37';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'badge_text_color') THEN
          ALTER TABLE plans ADD COLUMN badge_text_color VARCHAR(20) DEFAULT '#FFFFFF';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'horizontal_badge_enabled') THEN
          ALTER TABLE plans ADD COLUMN horizontal_badge_enabled BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'horizontal_badge_text') THEN
          ALTER TABLE plans ADD COLUMN horizontal_badge_text VARCHAR(100);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'horizontal_badge_bg_color') THEN
          ALTER TABLE plans ADD COLUMN horizontal_badge_bg_color VARCHAR(20) DEFAULT '#D4AF37';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'horizontal_badge_text_color') THEN
          ALTER TABLE plans ADD COLUMN horizontal_badge_text_color VARCHAR(20) DEFAULT '#002845';
        END IF;
        -- حقول ألوان القسم العلوي والسفلي
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'header_bg_color') THEN
          ALTER TABLE plans ADD COLUMN header_bg_color VARCHAR(20);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'header_text_color') THEN
          ALTER TABLE plans ADD COLUMN header_text_color VARCHAR(20);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'body_bg_color') THEN
          ALTER TABLE plans ADD COLUMN body_bg_color VARCHAR(20);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'body_text_color') THEN
          ALTER TABLE plans ADD COLUMN body_text_color VARCHAR(20);
        END IF;
        -- حقل حجم خط الشارة
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'badge_font_size') THEN
          ALTER TABLE plans ADD COLUMN badge_font_size INTEGER DEFAULT 16;
        END IF;
        -- حقول الشفافية للألوان
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'header_bg_opacity') THEN
          ALTER TABLE plans ADD COLUMN header_bg_opacity INTEGER DEFAULT 100;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'body_bg_opacity') THEN
          ALTER TABLE plans ADD COLUMN body_bg_opacity INTEGER DEFAULT 100;
        END IF;
        -- حقل شفافية خلفية الشارة
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'badge_bg_opacity') THEN
          ALTER TABLE plans ADD COLUMN badge_bg_opacity INTEGER DEFAULT 100;
        END IF;
        -- حقول نصوص الميزات المخصصة
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'elite_feature_title') THEN
          ALTER TABLE plans ADD COLUMN elite_feature_title VARCHAR(255) DEFAULT 'الاشتراك في نخبة الإعلانات';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'elite_feature_description') THEN
          ALTER TABLE plans ADD COLUMN elite_feature_description TEXT DEFAULT 'اعرض عقارك في نخبة العقارات المختارة على الصفحة الرئيسية';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'ai_feature_title') THEN
          ALTER TABLE plans ADD COLUMN ai_feature_title VARCHAR(255) DEFAULT 'مركز الذكاء الاصطناعي';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'ai_feature_description') THEN
          ALTER TABLE plans ADD COLUMN ai_feature_description TEXT DEFAULT 'تحليل ذكي للتسعير وتوليد محتوى احترافي';
        END IF;
        -- حقول SEO المدفوعة (ميزة تجارية)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'seo_level') THEN
          ALTER TABLE plans ADD COLUMN seo_level INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'seo_feature_title') THEN
          ALTER TABLE plans ADD COLUMN seo_feature_title VARCHAR(255) DEFAULT 'تحسين محركات البحث SEO';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'seo_feature_description') THEN
          ALTER TABLE plans ADD COLUMN seo_feature_description TEXT DEFAULT 'ظهور أقوى في نتائج البحث وجوجل';
        END IF;
        -- حقل ترتيب عرض الميزات (JSON object مع اسم الميزة والترتيب)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'feature_display_order') THEN
          ALTER TABLE plans ADD COLUMN feature_display_order JSONB DEFAULT '{"listings": 1, "photos": 2, "map": 3, "ai": 4, "video": 5, "elite": 6, "seo": 7}'::jsonb;
        END IF;
      END $$;
    `);
    console.log("✅ SEO level columns added to plans");
    console.log("✅ Feature display order column added to plans");

    // Create user_plans table
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_plans (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_id INTEGER NOT NULL REFERENCES plans(id),
        status TEXT NOT NULL DEFAULT 'active',
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    // Add updated_at column if it doesn't exist (for existing tables)
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_plans' AND column_name = 'updated_at') THEN
          ALTER TABLE user_plans ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        END IF;
      END $$;
    `);

    // Create quota_buckets table for managing ad quotas per package
    await db.query(`
      CREATE TABLE IF NOT EXISTS quota_buckets (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
        source VARCHAR(50) NOT NULL DEFAULT 'subscription',
        total_slots INTEGER NOT NULL DEFAULT 0,
        used_slots INTEGER NOT NULL DEFAULT 0,
        expires_at TIMESTAMPTZ,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Add user_plan_id column to quota_buckets if it doesn't exist
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quota_buckets' AND column_name = 'user_plan_id') THEN
          ALTER TABLE quota_buckets ADD COLUMN user_plan_id BIGINT REFERENCES user_plans(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // Add indexes for quota_buckets
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_quota_buckets_user ON quota_buckets(user_id);
      CREATE INDEX IF NOT EXISTS idx_quota_buckets_plan ON quota_buckets(plan_id);
      CREATE INDEX IF NOT EXISTS idx_quota_buckets_active ON quota_buckets(user_id, active);
      CREATE INDEX IF NOT EXISTS idx_quota_buckets_user_plan ON quota_buckets(user_plan_id);
    `);

    // Create properties table
    await db.query(`
      CREATE TABLE IF NOT EXISTS properties (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        city VARCHAR(255),
        district VARCHAR(255),
        type VARCHAR(100),
        purpose VARCHAR(100),
        price DECIMAL(15, 2),
        area DECIMAL(10, 2),
        bedrooms INTEGER,
        bathrooms INTEGER,
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        status VARCHAR(50) DEFAULT 'pending',
        plan_id INTEGER REFERENCES plans(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMPTZ
      );
    `);

    // Add images and video columns to properties
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'images') THEN
          ALTER TABLE properties ADD COLUMN images JSONB DEFAULT '[]'::jsonb;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'country') THEN
          ALTER TABLE properties ADD COLUMN country VARCHAR(50) DEFAULT 'SA';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'video_url') THEN
          ALTER TABLE properties ADD COLUMN video_url TEXT;
        END IF;
        -- حالة الفيديو (processing/ready/failed)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'video_status') THEN
          ALTER TABLE properties ADD COLUMN video_status VARCHAR(20) DEFAULT NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'rejection_reason') THEN
          ALTER TABLE properties ADD COLUMN rejection_reason TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'reviewed_by') THEN
          ALTER TABLE properties ADD COLUMN reviewed_by UUID REFERENCES users(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'reviewed_at') THEN
          ALTER TABLE properties ADD COLUMN reviewed_at TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'usage_type') THEN
          ALTER TABLE properties ADD COLUMN usage_type VARCHAR(50) DEFAULT 'سكني';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'formatted_address') THEN
          ALTER TABLE properties ADD COLUMN formatted_address TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'cover_image') THEN
          ALTER TABLE properties ADD COLUMN cover_image TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'property_age') THEN
          ALTER TABLE properties ADD COLUMN property_age INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'floor_number') THEN
          ALTER TABLE properties ADD COLUMN floor_number INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'direction') THEN
          ALTER TABLE properties ADD COLUMN direction VARCHAR(50);
        END IF;
        -- حقل ربط الإعلان بمحفظة الرصيد
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'bucket_id') THEN
          ALTER TABLE properties ADD COLUMN bucket_id UUID REFERENCES quota_buckets(id) ON DELETE SET NULL;
        END IF;
        -- حقل مستوى الباقة وقت الإنشاء (للحفاظ على المزايا)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'tier_code') THEN
          ALTER TABLE properties ADD COLUMN tier_code VARCHAR(50);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'tier_label') THEN
          ALTER TABLE properties ADD COLUMN tier_label VARCHAR(100);
        END IF;
        -- حقل مواقف السيارات
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'parking_spaces') THEN
          ALTER TABLE properties ADD COLUMN parking_spaces VARCHAR(10);
        END IF;
        -- حقول المميزات الإضافية (مسبح، مصعد، حديقة)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'has_pool') THEN
          ALTER TABLE properties ADD COLUMN has_pool BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'has_elevator') THEN
          ALTER TABLE properties ADD COLUMN has_elevator BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'has_garden') THEN
          ALTER TABLE properties ADD COLUMN has_garden BOOLEAN DEFAULT false;
        END IF;
        -- حقول المساحة المنفصلة (مساحة الأرض ومساحة البناء)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'land_area') THEN
          ALTER TABLE properties ADD COLUMN land_area DECIMAL(10, 2);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'building_area') THEN
          ALTER TABLE properties ADD COLUMN building_area DECIMAL(10, 2);
        END IF;
        -- حقول SEO المدفوعة (ميزة تجارية حسب الباقة)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'seo_title') THEN
          ALTER TABLE properties ADD COLUMN seo_title VARCHAR(70);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'seo_description') THEN
          ALTER TABLE properties ADD COLUMN seo_description VARCHAR(160);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'seo_keywords') THEN
          ALTER TABLE properties ADD COLUMN seo_keywords TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'seo_schema_enabled') THEN
          ALTER TABLE properties ADD COLUMN seo_schema_enabled BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'seo_images_optimized') THEN
          ALTER TABLE properties ADD COLUMN seo_images_optimized BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'seo_video_enabled') THEN
          ALTER TABLE properties ADD COLUMN seo_video_enabled BOOLEAN DEFAULT false;
        END IF;
        -- حقول نخبة العقارات (Elite/Featured properties)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'is_featured') THEN
          ALTER TABLE properties ADD COLUMN is_featured BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'featured_order') THEN
          ALTER TABLE properties ADD COLUMN featured_order INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'featured_at') THEN
          ALTER TABLE properties ADD COLUMN featured_at TIMESTAMPTZ;
        END IF;
      END $$;
    `);
    console.log("✅ SEO columns added to properties");

    // Create listing_media table for images and videos
    await db.query(`
      CREATE TABLE IF NOT EXISTS listing_media (
        id SERIAL PRIMARY KEY,
        listing_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        kind VARCHAR(20) NOT NULL DEFAULT 'image',
        is_cover BOOLEAN DEFAULT false,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    await db.query(`CREATE INDEX IF NOT EXISTS idx_listing_media_listing ON listing_media(listing_id);`);
    
    // Update default status for properties to pending
    await db.query(`
      ALTER TABLE properties ALTER COLUMN status SET DEFAULT 'pending';
    `);

    // Create favorites table
    await db.query(`
      CREATE TABLE IF NOT EXISTS favorites (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        listing_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT favorites_unique UNIQUE (user_id, listing_id)
      );
    `);

    // Create notifications table with proper structure
    await db.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        type TEXT,
        link TEXT,
        read_at TIMESTAMPTZ,
        listing_id UUID,
        channel TEXT,
        payload JSONB,
        scheduled_at TIMESTAMPTZ,
        sent_at TIMESTAMPTZ,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Add missing columns to notifications
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'title') THEN
          ALTER TABLE notifications ADD COLUMN title TEXT NOT NULL DEFAULT '';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'body') THEN
          ALTER TABLE notifications ADD COLUMN body TEXT NOT NULL DEFAULT '';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'message') THEN
          ALTER TABLE notifications ADD COLUMN message TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'is_read') THEN
          ALTER TABLE notifications ADD COLUMN is_read BOOLEAN DEFAULT FALSE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'data') THEN
          ALTER TABLE notifications ADD COLUMN data JSONB;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'link') THEN
          ALTER TABLE notifications ADD COLUMN link TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'read_at') THEN
          ALTER TABLE notifications ADD COLUMN read_at TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'source') THEN
          ALTER TABLE notifications ADD COLUMN source VARCHAR(50) DEFAULT 'system';
        END IF;
      END $$;
    `);

    // Create listing_messages table for user-to-advertiser messaging
    await db.query(`
      CREATE TABLE IF NOT EXISTS listing_messages (
        id BIGSERIAL PRIMARY KEY,
        listing_id UUID NOT NULL,
        sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sender_name TEXT,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Create index for listing_messages
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_listing_messages_recipient ON listing_messages(recipient_id);
      CREATE INDEX IF NOT EXISTS idx_listing_messages_sender ON listing_messages(sender_id);
      CREATE INDEX IF NOT EXISTS idx_listing_messages_listing ON listing_messages(listing_id);
    `);

    // Create listing_reports table
    await db.query(`
      CREATE TABLE IF NOT EXISTS listing_reports (
        id SERIAL PRIMARY KEY,
        listing_id UUID NOT NULL,
        reason VARCHAR(50) NOT NULL,
        details TEXT,
        reporter_name VARCHAR(100),
        reporter_phone VARCHAR(20),
        status VARCHAR(20) DEFAULT 'new',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create violations_archive table - أرشفة المخالفات والإعلانات المحذوفة
    await db.query(`
      CREATE TABLE IF NOT EXISTS violations_archive (
        id SERIAL PRIMARY KEY,
        original_listing_id UUID,
        listing_title TEXT,
        listing_description TEXT,
        listing_price DECIMAL(15, 2),
        listing_city VARCHAR(100),
        listing_district VARCHAR(100),
        violator_user_id UUID,
        violator_name TEXT,
        violator_email TEXT,
        violator_phone TEXT,
        report_id INTEGER,
        report_reason VARCHAR(100),
        report_details TEXT,
        action_taken VARCHAR(50) DEFAULT 'deleted',
        admin_note TEXT,
        archived_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Add violations_count column to users if not exists
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'violations_count') THEN
          ALTER TABLE users ADD COLUMN violations_count INTEGER DEFAULT 0;
        END IF;
      END $$;
    `);

    // Create index for violations_archive
    await db.query(`CREATE INDEX IF NOT EXISTS idx_violations_violator_id ON violations_archive(violator_user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_violations_archived_at ON violations_archive(archived_at);`);

    // Create account_complaints table for general user complaints
    await db.query(`
      CREATE TABLE IF NOT EXISTS account_complaints (
        id SERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        user_name VARCHAR(100),
        user_email VARCHAR(255),
        user_phone VARCHAR(20),
        category VARCHAR(50) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        details TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'new',
        admin_note TEXT,
        reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create news table for news ticker
    await db.query(`
      CREATE TABLE IF NOT EXISTS news (
        id SERIAL PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        content TEXT,
        type VARCHAR(50) DEFAULT 'general',
        active BOOLEAN DEFAULT true,
        priority INTEGER DEFAULT 0,
        speed INTEGER DEFAULT 25,
        background_color VARCHAR(20),
        text_color VARCHAR(20),
        icon VARCHAR(50),
        cta_label VARCHAR(100),
        cta_url VARCHAR(500),
        start_at TIMESTAMPTZ,
        end_at TIMESTAMPTZ,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add new columns to news table if they don't exist
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'news' AND column_name = 'priority') THEN
          ALTER TABLE news ADD COLUMN priority INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'news' AND column_name = 'speed') THEN
          ALTER TABLE news ADD COLUMN speed INTEGER DEFAULT 25;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'news' AND column_name = 'background_color') THEN
          ALTER TABLE news ADD COLUMN background_color VARCHAR(20);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'news' AND column_name = 'text_color') THEN
          ALTER TABLE news ADD COLUMN text_color VARCHAR(20);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'news' AND column_name = 'icon') THEN
          ALTER TABLE news ADD COLUMN icon VARCHAR(50);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'news' AND column_name = 'cta_label') THEN
          ALTER TABLE news ADD COLUMN cta_label VARCHAR(100);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'news' AND column_name = 'cta_url') THEN
          ALTER TABLE news ADD COLUMN cta_url VARCHAR(500);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'news' AND column_name = 'start_at') THEN
          ALTER TABLE news ADD COLUMN start_at TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'news' AND column_name = 'end_at') THEN
          ALTER TABLE news ADD COLUMN end_at TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'news' AND column_name = 'is_global') THEN
          ALTER TABLE news ADD COLUMN is_global BOOLEAN DEFAULT true;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'news' AND column_name = 'target_countries') THEN
          ALTER TABLE news ADD COLUMN target_countries JSONB;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'news' AND column_name = 'target_cities') THEN
          ALTER TABLE news ADD COLUMN target_cities JSONB;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'news' AND column_name = 'ai_generated') THEN
          ALTER TABLE news ADD COLUMN ai_generated BOOLEAN DEFAULT false;
        END IF;
      END $$;
    `);

    // Create membership_requests table for admin promotion and plan subscription requests
    await db.query(`
      CREATE TABLE IF NOT EXISTS membership_requests (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_id INTEGER REFERENCES plans(id) ON DELETE SET NULL,
        request_type VARCHAR(50) NOT NULL DEFAULT 'plan_subscription',
        reason TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMPTZ,
        admin_note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Add status column to users if it doesn't exist
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'status') THEN
          ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'active';
        END IF;
      END $$;
    `);

    // Add new columns to membership_requests for admin staff applications
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_requests' AND column_name = 'full_name') THEN
          ALTER TABLE membership_requests ADD COLUMN full_name VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_requests' AND column_name = 'age') THEN
          ALTER TABLE membership_requests ADD COLUMN age INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_requests' AND column_name = 'country') THEN
          ALTER TABLE membership_requests ADD COLUMN country VARCHAR(100);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_requests' AND column_name = 'cv_path') THEN
          ALTER TABLE membership_requests ADD COLUMN cv_path VARCHAR(500);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_requests' AND column_name = 'job_title') THEN
          ALTER TABLE membership_requests ADD COLUMN job_title VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_requests' AND column_name = 'cover_letter') THEN
          ALTER TABLE membership_requests ADD COLUMN cover_letter TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_requests' AND column_name = 'email') THEN
          ALTER TABLE membership_requests ADD COLUMN email VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_requests' AND column_name = 'phone') THEN
          ALTER TABLE membership_requests ADD COLUMN phone VARCHAR(50);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'membership_requests' AND column_name = 'assigned_role') THEN
          ALTER TABLE membership_requests ADD COLUMN assigned_role VARCHAR(50);
        END IF;
      END $$;
    `);
    console.log("✅ Membership requests extended with staff application fields");

    // Create user_badge_state table for tracking user's last seen timestamps
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_badge_state (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        listings_seen_at TIMESTAMPTZ DEFAULT NOW(),
        invoices_seen_at TIMESTAMPTZ DEFAULT NOW(),
        complaints_seen_at TIMESTAMPTZ DEFAULT NOW(),
        messages_seen_at TIMESTAMPTZ DEFAULT NOW(),
        refunds_seen_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id)
      );
    `);

    // Add status_changed_at column to properties for tracking status updates
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'status_changed_at') THEN
          ALTER TABLE properties ADD COLUMN status_changed_at TIMESTAMPTZ DEFAULT NOW();
        END IF;
      END $$;
    `);

    // Create support_tickets table for customer support requests
    await db.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ticket_number VARCHAR(50) UNIQUE NOT NULL,
        category VARCHAR(50) NOT NULL DEFAULT 'general',
        priority VARCHAR(20) NOT NULL DEFAULT 'medium',
        subject VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'new',
        assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Create support_ticket_replies table for ticket conversations
    await db.query(`
      CREATE TABLE IF NOT EXISTS support_ticket_replies (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
        sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sender_type VARCHAR(20) NOT NULL DEFAULT 'user',
        message TEXT NOT NULL,
        attachments JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Create indexes for support tickets
    await db.query(`CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned ON support_tickets(assigned_to);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_support_ticket_replies_ticket ON support_ticket_replies(ticket_id);`);

    // Add source column to support_tickets for tracking ticket origin
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'support_tickets' AND column_name = 'source') THEN
          ALTER TABLE support_tickets ADD COLUMN source VARCHAR(50) DEFAULT 'manual';
        END IF;
      END $$;
    `);

    // 🎫 نظام التذاكر الموحد - إضافة حقول القسم والتصنيف الفرعي
    await db.query(`
      DO $$ 
      BEGIN 
        -- حقل القسم: financial (مالية) | account (حسابي/إداري) | technical (تقنية)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'support_tickets' AND column_name = 'department') THEN
          ALTER TABLE support_tickets ADD COLUMN department VARCHAR(30) DEFAULT 'technical';
        END IF;
        -- التصنيف الفرعي داخل كل قسم
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'support_tickets' AND column_name = 'subcategory') THEN
          ALTER TABLE support_tickets ADD COLUMN subcategory VARCHAR(50);
        END IF;
        -- الموظف المختص تلقائياً حسب القسم
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'support_tickets' AND column_name = 'auto_assigned_role') THEN
          ALTER TABLE support_tickets ADD COLUMN auto_assigned_role VARCHAR(30);
        END IF;
        -- SLA: وقت الاستجابة المتوقع بالساعات
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'support_tickets' AND column_name = 'sla_hours') THEN
          ALTER TABLE support_tickets ADD COLUMN sla_hours INTEGER DEFAULT 24;
        END IF;
        -- وقت أول استجابة
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'support_tickets' AND column_name = 'first_response_at') THEN
          ALTER TABLE support_tickets ADD COLUMN first_response_at TIMESTAMPTZ;
        END IF;
      END $$;
    `);
    
    // فهرس للقسم لتسريع الفلترة
    await db.query(`CREATE INDEX IF NOT EXISTS idx_support_tickets_department ON support_tickets(department);`);

    // Add status_changed_at column to account_complaints
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account_complaints' AND column_name = 'status_changed_at') THEN
          ALTER TABLE account_complaints ADD COLUMN status_changed_at TIMESTAMPTZ DEFAULT NOW();
        END IF;
      END $$;
    `);

    // Add status_changed_at column to refunds (only if table exists - it's created later)
    await db.query(`
      DO $$ 
      BEGIN 
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'refunds')
           AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'refunds' AND column_name = 'status_changed_at') THEN
          ALTER TABLE refunds ADD COLUMN status_changed_at TIMESTAMPTZ DEFAULT NOW();
        END IF;
      END $$;
    `);

    // Insert sample news if table is empty
    const newsCount = await db.query(`SELECT COUNT(*) as cnt FROM news`);
    if (parseInt(newsCount.rows[0].cnt) === 0) {
      await db.query(`
        INSERT INTO news (title, content, type, active) VALUES
        ('عروض خاصة على العقارات في الرياض', 'احصل على خصم 10% على جميع العقارات المعروضة هذا الشهر', 'promo', true),
        ('تحديث جديد للمنصة', 'تم إضافة ميزات جديدة لتحسين تجربة البحث عن العقارات', 'announcement', true),
        ('مرحباً بكم في بيت الجزيرة', 'المنصة العقارية الأولى في المملكة العربية السعودية', 'general', true)
      `);
      console.log("✅ Sample news inserted");
    }

    // Fix: Make phone column nullable and add missing columns
    try {
      await db.query(`ALTER TABLE users ALTER COLUMN phone DROP NOT NULL`);
    } catch (e) {
      // Already nullable or column doesn't exist
    }
    
    try {
      await db.query(`ALTER TABLE user_plans ADD COLUMN status TEXT DEFAULT 'active'`);
    } catch (e) {
      // Column already exists
    }

    // Create conversations table for messaging system
    await db.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        department VARCHAR(50) NOT NULL DEFAULT 'support',
        subject VARCHAR(255),
        status VARCHAR(20) DEFAULT 'open',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        last_message_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Create messages table
    await db.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        sender_type VARCHAR(20) NOT NULL,
        sender_id UUID,
        sender_name VARCHAR(100),
        content TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Create admin_conversations table for internal admin messaging
    await db.query(`
      CREATE TABLE IF NOT EXISTS admin_conversations (
        id SERIAL PRIMARY KEY,
        created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        department VARCHAR(50) NOT NULL,
        subject VARCHAR(255),
        status VARCHAR(20) DEFAULT 'open',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        last_message_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Create admin_conversation_participants table
    await db.query(`
      CREATE TABLE IF NOT EXISTS admin_conversation_participants (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES admin_conversations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL,
        joined_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(conversation_id, user_id)
      );
    `);

    // Create admin_messages table
    await db.query(`
      CREATE TABLE IF NOT EXISTS admin_messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES admin_conversations(id) ON DELETE CASCADE,
        sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sender_role VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        read_by JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Create refunds table for tracking payment refunds (invoice_id added later after invoices table exists)
    await db.query(`
      CREATE TABLE IF NOT EXISTS refunds (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_plan_id INTEGER,
        amount DECIMAL(10, 2) NOT NULL,
        reason TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        processed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Create payments table for tracking all payments
    await db.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_plan_id INTEGER,
        plan_id INTEGER,
        amount DECIMAL(10, 2) NOT NULL,
        payment_method VARCHAR(50),
        transaction_id VARCHAR(255),
        status VARCHAR(20) DEFAULT 'completed',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Add additional columns to payments table for better tracking
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'vat_amount') THEN
          ALTER TABLE payments ADD COLUMN vat_amount DECIMAL(10, 2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'subtotal') THEN
          ALTER TABLE payments ADD COLUMN subtotal DECIMAL(10, 2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'currency') THEN
          ALTER TABLE payments ADD COLUMN currency VARCHAR(10) DEFAULT 'SAR';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'description') THEN
          ALTER TABLE payments ADD COLUMN description TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'previous_plan_id') THEN
          ALTER TABLE payments ADD COLUMN previous_plan_id INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'metadata') THEN
          ALTER TABLE payments ADD COLUMN metadata JSONB DEFAULT '{}';
        END IF;
      END $$;
    `);

    // Create invoices table for PDF invoices
    await db.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        invoice_number VARCHAR(50) UNIQUE NOT NULL,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
        plan_id INTEGER REFERENCES plans(id) ON DELETE SET NULL,
        subtotal DECIMAL(10, 2) NOT NULL,
        vat_rate DECIMAL(5, 2) DEFAULT 15.00,
        vat_amount DECIMAL(10, 2) NOT NULL,
        total DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'SAR',
        status VARCHAR(20) DEFAULT 'issued',
        pdf_path TEXT,
        email_sent_at TIMESTAMPTZ,
        issued_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Create index for invoices
    await db.query(`CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_invoices_payment ON invoices(payment_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);`);

    // Add missing columns to refunds table (after invoices table exists)
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'refunds' AND column_name = 'invoice_id') THEN
          ALTER TABLE refunds ADD COLUMN invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'refunds' AND column_name = 'decision_note') THEN
          ALTER TABLE refunds ADD COLUMN decision_note TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'refunds' AND column_name = 'payout_confirmed_at') THEN
          ALTER TABLE refunds ADD COLUMN payout_confirmed_at TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'refunds' AND column_name = 'bank_reference') THEN
          ALTER TABLE refunds ADD COLUMN bank_reference VARCHAR(255);
        END IF;
      END $$;
    `);

    // Create client_ratings table for service satisfaction tracking
    await db.query(`
      CREATE TABLE IF NOT EXISTS client_ratings (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        feedback TEXT,
        rating_type VARCHAR(50) DEFAULT 'service',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Create user_activity_logs for marketing analytics
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_activity_logs (
        id SERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        action_type VARCHAR(50) NOT NULL,
        details JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Add suspended_by column to user_plans for admin suspension tracking
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_plans' AND column_name = 'suspended_by') THEN
          ALTER TABLE user_plans ADD COLUMN suspended_by UUID REFERENCES users(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_plans' AND column_name = 'suspended_at') THEN
          ALTER TABLE user_plans ADD COLUMN suspended_at TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_plans' AND column_name = 'suspension_reason') THEN
          ALTER TABLE user_plans ADD COLUMN suspension_reason TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_plans' AND column_name = 'paid_amount') THEN
          ALTER TABLE user_plans ADD COLUMN paid_amount DECIMAL(10, 2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_plans' AND column_name = 'cancelled_at') THEN
          ALTER TABLE user_plans ADD COLUMN cancelled_at TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_plans' AND column_name = 'cancellation_reason') THEN
          ALTER TABLE user_plans ADD COLUMN cancellation_reason TEXT;
        END IF;
      END $$;
    `);

    // Create indexes for new tables
    await db.query(`CREATE INDEX IF NOT EXISTS idx_refunds_user ON refunds(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_client_ratings_user ON client_ratings(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_user_activity_user ON user_activity_logs(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_user_activity_action ON user_activity_logs(action_type);`);

    // Create indexes
    await db.query(`CREATE INDEX IF NOT EXISTS idx_admin_conversations_created_by ON admin_conversations(created_by);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_admin_conversations_department ON admin_conversations(department);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_admin_conv_participants_conv ON admin_conversation_participants(conversation_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_admin_conv_participants_user ON admin_conversation_participants(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_admin_messages_conversation ON admin_messages(conversation_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_conversations_department ON conversations(department);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_messages_is_read ON messages(is_read);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_reports_listing_id ON listing_reports(listing_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_reports_status ON listing_reports(status);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_favorites_listing ON favorites(listing_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_properties_user ON properties(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_membership_requests_user ON membership_requests(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_membership_requests_status ON membership_requests(status);`);

    // Insert/Update plans from backup data
    try {
      const { seedPlans } = require('./seeds/seed_plans');
      await seedPlans();
    } catch (seedError) {
      console.log("⚠️ Plans seed skipped:", seedError.message);
      const countResult = await db.query(`SELECT COUNT(*) as cnt FROM plans`);
      const planCount = parseInt(countResult.rows[0].cnt) || 0;
      if (planCount === 0) {
        console.log("⚠️ No plans found - please run: node seeds/seed_plans.js");
      } else {
        console.log("✅ Database ready - plans already exist");
      }
    }

    // Insert/Update admin users from backup data
    try {
      const { seedAdmins } = require('./seeds/seed_admins');
      await seedAdmins();
    } catch (seedError) {
      console.log("⚠️ Admin users seed skipped:", seedError.message);
    }

    // ============ Elite Slots System Tables ============
    // جداول نظام نخبة العقارات المختارة (مثل اختيار مقاعد الطائرة)

    // 1. جدول المواقع الثابتة (9 مواقع)
    await db.query(`
      CREATE TABLE IF NOT EXISTS elite_slots (
        id SERIAL PRIMARY KEY,
        row_num INTEGER NOT NULL CHECK (row_num BETWEEN 1 AND 3),
        col_num INTEGER NOT NULL CHECK (col_num BETWEEN 1 AND 3),
        tier VARCHAR(20) NOT NULL CHECK (tier IN ('top', 'middle', 'bottom')),
        base_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
        display_order INTEGER NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(row_num, col_num)
      );
    `);

    // 2. جدول الفترات الزمنية (أسبوعية)
    await db.query(`
      CREATE TABLE IF NOT EXISTS elite_slot_periods (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        starts_at TIMESTAMPTZ NOT NULL,
        ends_at TIMESTAMPTZ NOT NULL,
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('upcoming', 'active', 'ended')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT valid_period CHECK (ends_at > starts_at)
      );
    `);

    // 3. جدول الحجوزات
    await db.query(`
      CREATE TABLE IF NOT EXISTS elite_slot_reservations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        slot_id INTEGER NOT NULL REFERENCES elite_slots(id) ON DELETE CASCADE,
        period_id UUID NOT NULL REFERENCES elite_slot_periods(id) ON DELETE CASCADE,
        property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(30) NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'confirmed', 'cancelled', 'expired', 'pending_approval')),
        price_amount DECIMAL(10, 2) NOT NULL,
        vat_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
        total_amount DECIMAL(10, 2) NOT NULL,
        payment_id INTEGER REFERENCES payments(id),
        invoice_id INTEGER REFERENCES invoices(id),
        hold_expires_at TIMESTAMPTZ,
        confirmed_at TIMESTAMPTZ,
        cancelled_at TIMESTAMPTZ,
        cancellation_reason TEXT,
        reservation_ends_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(slot_id, period_id, status) -- منع تكرار الحجز المؤكد لنفس الموقع في نفس الفترة
      );
    `);
    
    // إضافة حقل reservation_ends_at إذا لم يكن موجوداً
    await db.query(`
      ALTER TABLE elite_slot_reservations 
      ADD COLUMN IF NOT EXISTS reservation_ends_at TIMESTAMPTZ;
    `);
    
    // إضافة حقل admin_notes إذا لم يكن موجوداً
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'elite_slot_reservations' AND column_name = 'admin_notes') THEN
          ALTER TABLE elite_slot_reservations ADD COLUMN admin_notes TEXT;
        END IF;
      END $$;
    `);

    // 4. جدول قائمة الانتظار
    await db.query(`
      CREATE TABLE IF NOT EXISTS elite_slot_waitlist (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        slot_id INTEGER REFERENCES elite_slots(id) ON DELETE CASCADE,
        period_id UUID NOT NULL REFERENCES elite_slot_periods(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        tier_preference VARCHAR(20) CHECK (tier_preference IN ('top', 'middle', 'bottom', 'any')),
        priority INTEGER DEFAULT 0,
        notified_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'offered', 'accepted', 'declined', 'expired')),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 5. جدول طلبات تمديد النخبة
    await db.query(`
      CREATE TABLE IF NOT EXISTS elite_extension_requests (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        reservation_id UUID NOT NULL REFERENCES elite_slot_reservations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        requested_days INTEGER NOT NULL CHECK (requested_days >= 1),
        price_per_day DECIMAL(10, 2) NOT NULL DEFAULT 30.00,
        price_amount DECIMAL(10, 2) NOT NULL,
        vat_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
        total_amount DECIMAL(10, 2) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'pending_admin', 'approved', 'rejected', 'cancelled', 'expired')),
        payment_id INTEGER REFERENCES payments(id),
        invoice_id INTEGER REFERENCES invoices(id),
        admin_note TEXT,
        customer_note TEXT,
        processed_by UUID REFERENCES users(id),
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    // فهرس لتسريع البحث عن طلبات التمديد
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_extension_requests_reservation ON elite_extension_requests(reservation_id);
      CREATE INDEX IF NOT EXISTS idx_extension_requests_user ON elite_extension_requests(user_id);
      CREATE INDEX IF NOT EXISTS idx_extension_requests_status ON elite_extension_requests(status);
    `);

    // إنشاء فهارس للأداء
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_elite_reservations_period ON elite_slot_reservations(period_id);
      CREATE INDEX IF NOT EXISTS idx_elite_reservations_user ON elite_slot_reservations(user_id);
      CREATE INDEX IF NOT EXISTS idx_elite_reservations_status ON elite_slot_reservations(status);
      CREATE INDEX IF NOT EXISTS idx_elite_waitlist_period ON elite_slot_waitlist(period_id);
      CREATE INDEX IF NOT EXISTS idx_elite_periods_status ON elite_slot_periods(status);
    `);

    // تحديث constraint للسماح بحالة pending_approval
    await db.query(`
      DO $$
      BEGIN
        ALTER TABLE elite_slot_reservations DROP CONSTRAINT IF EXISTS elite_slot_reservations_status_check;
        ALTER TABLE elite_slot_reservations ADD CONSTRAINT elite_slot_reservations_status_check 
          CHECK (status IN ('held', 'confirmed', 'cancelled', 'expired', 'pending_approval'));
      EXCEPTION WHEN others THEN
        NULL;
      END $$;
    `);

    // إدراج المواقع التسعة إذا لم تكن موجودة
    const slotsExist = await db.query("SELECT COUNT(*) as count FROM elite_slots");
    if (parseInt(slotsExist.rows[0].count) === 0) {
      await db.query(`
        INSERT INTO elite_slots (row_num, col_num, tier, base_price, display_order) VALUES
        (1, 1, 'top', 150, 1),
        (1, 2, 'top', 150, 2),
        (1, 3, 'top', 150, 3),
        (2, 1, 'middle', 100, 4),
        (2, 2, 'middle', 100, 5),
        (2, 3, 'middle', 100, 6),
        (3, 1, 'bottom', 50, 7),
        (3, 2, 'bottom', 50, 8),
        (3, 3, 'bottom', 50, 9)
      `);
      console.log("✅ Elite slots (9 positions) created");

      // إنشاء أول فترة زمنية (أسبوع من الآن)
      await db.query(`
        INSERT INTO elite_slot_periods (starts_at, ends_at, status)
        VALUES (NOW(), NOW() + INTERVAL '7 days', 'active')
      `);
      console.log("✅ First elite period (7 days) created");
    }

    // تنظيف حجوزات النخبة المرتبطة بإعلانات مرفوضة
    const cleanupResult = await db.query(`
      UPDATE elite_slot_reservations 
      SET status = 'cancelled', 
          cancelled_at = NOW(), 
          cancellation_reason = 'تم إلغاء الحجز تلقائياً بسبب رفض الإعلان'
      WHERE property_id IN (
        SELECT id FROM properties WHERE status = 'rejected'
      ) AND status IN ('confirmed', 'held', 'pending_approval')
      RETURNING id
    `);
    if (cleanupResult.rows.length > 0) {
      console.log(`✅ Cleaned up ${cleanupResult.rows.length} elite reservations for rejected listings`);
    }

    // Create WhatsApp messaging tables
    await db.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        total_recipients INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'pending',
        sent_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id SERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        phone VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        twilio_sid VARCHAR(100),
        error_message TEXT,
        campaign_id INTEGER REFERENCES whatsapp_campaigns(id) ON DELETE SET NULL,
        sent_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        category VARCHAR(50) DEFAULT 'general',
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_user ON whatsapp_messages(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_campaign ON whatsapp_messages(campaign_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status ON whatsapp_messages(status);`);

    await db.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    // Ensure maintenance mode is disabled by default
    await db.query(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ('maintenance_mode', 'false', NOW())
      ON CONFLICT (key) DO UPDATE SET value = 'false', updated_at = NOW()
    `);
    console.log("✅ Maintenance mode disabled by default");

    await db.query(`
      INSERT INTO app_settings (key, value) VALUES ('ai_support_enabled', 'true')
      ON CONFLICT (key) DO NOTHING;
    `);

    await db.query(`
      INSERT INTO app_settings (key, value) VALUES 
        ('promo_banner_enabled', 'true'),
        ('promo_banner_title', 'عرض الإطلاق الخاص'),
        ('promo_banner_text', 'استمتع بجميع الباقات مجاناً حتى ألف عميل!'),
        ('promo_banner_badge', 'عرض محدود'),
        ('free_mode_enabled', 'true')
      ON CONFLICT (key) DO NOTHING;
    `);
    console.log("✅ Promo banner settings initialized");

    await db.query(`
      CREATE TABLE IF NOT EXISTS ai_chat_logs (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(100),
        user_message TEXT,
        ai_response TEXT,
        escalated BOOLEAN DEFAULT FALSE,
        escalate_reason TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_ai_chat_logs_session ON ai_chat_logs(session_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ai_chat_logs_escalated ON ai_chat_logs(escalated);`);

    // جدول وسم المحادثات المشبوهة
    await db.query(`
      CREATE TABLE IF NOT EXISTS flagged_conversations (
        id SERIAL PRIMARY KEY,
        user1_id UUID REFERENCES users(id) ON DELETE CASCADE,
        user2_id UUID REFERENCES users(id) ON DELETE CASCADE,
        listing_id UUID REFERENCES properties(id) ON DELETE SET NULL,
        flag_type VARCHAR(50) NOT NULL DEFAULT 'suspicious',
        flag_reason TEXT,
        ai_analysis TEXT,
        ai_risk_score INTEGER DEFAULT 0,
        flagged_by UUID REFERENCES users(id) ON DELETE SET NULL,
        status VARCHAR(20) DEFAULT 'pending',
        admin_note TEXT,
        reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_flagged_conv_status ON flagged_conversations(status);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_flagged_conv_user1 ON flagged_conversations(user1_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_flagged_conv_user2 ON flagged_conversations(user2_id);`);

    // ========== MARKETING SYSTEM TABLES ==========
    
    // Email campaigns table
    await db.query(`
      CREATE TABLE IF NOT EXISTS email_campaigns (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        subject VARCHAR(500) NOT NULL,
        content TEXT NOT NULL,
        template_id INTEGER,
        segment_filter JSONB DEFAULT '{}',
        total_recipients INTEGER DEFAULT 0,
        sent_count INTEGER DEFAULT 0,
        opened_count INTEGER DEFAULT 0,
        clicked_count INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'draft',
        scheduled_at TIMESTAMPTZ,
        sent_at TIMESTAMPTZ,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Email templates table
    await db.query(`
      CREATE TABLE IF NOT EXISTS email_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        subject VARCHAR(500) NOT NULL,
        content TEXT NOT NULL,
        category VARCHAR(50) DEFAULT 'general',
        variables JSONB DEFAULT '[]',
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Email logs table
    await db.query(`
      CREATE TABLE IF NOT EXISTS email_logs (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER REFERENCES email_campaigns(id) ON DELETE SET NULL,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        email VARCHAR(255) NOT NULL,
        subject VARCHAR(500),
        status VARCHAR(20) DEFAULT 'pending',
        sent_at TIMESTAMPTZ,
        opened_at TIMESTAMPTZ,
        clicked_at TIMESTAMPTZ,
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Customer segments table
    await db.query(`
      CREATE TABLE IF NOT EXISTS customer_segments (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        name_ar VARCHAR(255) NOT NULL,
        description TEXT,
        criteria JSONB DEFAULT '{}',
        color VARCHAR(20) DEFAULT '#6B7280',
        icon VARCHAR(50) DEFAULT 'users',
        auto_assign BOOLEAN DEFAULT false,
        priority INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // User segments mapping
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_segments (
        id SERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        segment_id INTEGER REFERENCES customer_segments(id) ON DELETE CASCADE,
        assigned_at TIMESTAMPTZ DEFAULT NOW(),
        assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE(user_id, segment_id)
      );
    `);

    // Google review requests tracking
    await db.query(`
      CREATE TABLE IF NOT EXISTS google_review_requests (
        id SERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        sent_via VARCHAR(20) DEFAULT 'email',
        sent_at TIMESTAMPTZ DEFAULT NOW(),
        clicked_at TIMESTAMPTZ,
        reviewed BOOLEAN DEFAULT false,
        reviewed_at TIMESTAMPTZ
      );
    `);

    // Marketing settings (Google review link, etc)
    await db.query(`
      INSERT INTO app_settings (key, value) VALUES 
        ('google_review_link', ''),
        ('google_place_id', ''),
        ('email_sender_name', 'بيت الجزيرة'),
        ('email_sender_address', 'noreply@aqar.sa')
      ON CONFLICT (key) DO NOTHING;
    `);

    // Insert default customer segments
    await db.query(`
      INSERT INTO customer_segments (name, name_ar, description, criteria, color, icon, priority)
      VALUES 
        ('vip', 'عملاء VIP', 'عملاء مميزون مع باقات مدفوعة', '{"has_paid_plan": true, "min_listings": 3}', '#D4AF37', 'crown', 100),
        ('active', 'عملاء نشطون', 'لديهم إعلانات نشطة', '{"has_active_listings": true}', '#10B981', 'activity', 80),
        ('new', 'عملاء جدد', 'مسجلون خلال آخر 30 يوم', '{"registered_within_days": 30}', '#3B82F6', 'user-plus', 60),
        ('inactive', 'عملاء غير نشطين', 'لم ينشروا إعلان منذ 30 يوم', '{"no_listings_since_days": 30}', '#F59E0B', 'clock', 40),
        ('churned', 'عملاء متوقفون', 'انتهت اشتراكاتهم ولم يجددوا', '{"subscription_expired": true}', '#EF4444', 'user-x', 20)
      ON CONFLICT DO NOTHING;
    `);

    // Indexes for marketing tables
    await db.query(`CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_email_logs_campaign ON email_logs(campaign_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_email_logs_user ON email_logs(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_user_segments_user ON user_segments(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_user_segments_segment ON user_segments(segment_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_google_review_requests_user ON google_review_requests(user_id);`);

    console.log("✅ Marketing system tables created");

    // 🔒 Security: Admin audit logs table for tracking admin actions
    await db.query(`
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id BIGSERIAL PRIMARY KEY,
        admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
        admin_email TEXT,
        action VARCHAR(100) NOT NULL,
        resource_type VARCHAR(50),
        resource_id TEXT,
        details JSONB,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    
    await db.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_admin ON admin_audit_logs(admin_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON admin_audit_logs(action);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON admin_audit_logs(resource_type, resource_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON admin_audit_logs(created_at DESC);`);
    console.log("✅ Admin audit logs table created");

    // 🎁 Promotions system - العروض الترويجية المتقدمة
    await db.query(`
      CREATE TABLE IF NOT EXISTS promotions (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        name_ar VARCHAR(255) NOT NULL,
        slug VARCHAR(100) UNIQUE,
        description TEXT,
        description_ar TEXT,
        status VARCHAR(20) DEFAULT 'draft',
        promotion_type VARCHAR(50) NOT NULL DEFAULT 'free_trial',
        discount_type VARCHAR(20) DEFAULT 'percentage',
        discount_value DECIMAL(10, 2) DEFAULT 0,
        skip_payment BOOLEAN DEFAULT false,
        applies_to VARCHAR(20) DEFAULT 'specific_plans',
        target_plan_ids JSONB DEFAULT '[]',
        start_at TIMESTAMPTZ,
        end_at TIMESTAMPTZ,
        seasonal_tag VARCHAR(50),
        duration_value INTEGER DEFAULT 7,
        duration_unit VARCHAR(20) DEFAULT 'days',
        usage_limit_total INTEGER,
        usage_limit_per_user INTEGER DEFAULT 1,
        current_usage INTEGER DEFAULT 0,
        badge_text VARCHAR(100),
        badge_color VARCHAR(20) DEFAULT '#D4AF37',
        banner_enabled BOOLEAN DEFAULT true,
        banner_text TEXT,
        display_position VARCHAR(30) DEFAULT 'top_banner',
        background_color VARCHAR(20) DEFAULT '#002845',
        dismiss_type VARCHAR(20) DEFAULT 'click',
        auto_dismiss_seconds INTEGER DEFAULT 0,
        animation_type VARCHAR(20) DEFAULT 'fade',
        target_pages JSONB DEFAULT '[]',
        priority INTEGER DEFAULT 0,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // إضافة الأعمدة الجديدة للـ promotions إذا لم تكن موجودة
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'promotions' AND column_name = 'display_position') THEN
          ALTER TABLE promotions ADD COLUMN display_position VARCHAR(30) DEFAULT 'top_banner';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'promotions' AND column_name = 'background_color') THEN
          ALTER TABLE promotions ADD COLUMN background_color VARCHAR(20) DEFAULT '#002845';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'promotions' AND column_name = 'dismiss_type') THEN
          ALTER TABLE promotions ADD COLUMN dismiss_type VARCHAR(20) DEFAULT 'click';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'promotions' AND column_name = 'auto_dismiss_seconds') THEN
          ALTER TABLE promotions ADD COLUMN auto_dismiss_seconds INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'promotions' AND column_name = 'animation_type') THEN
          ALTER TABLE promotions ADD COLUMN animation_type VARCHAR(20) DEFAULT 'fade';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'promotions' AND column_name = 'target_pages') THEN
          ALTER TABLE promotions ADD COLUMN target_pages JSONB DEFAULT '[]';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'promotions' AND column_name = 'display_mode') THEN
          ALTER TABLE promotions ADD COLUMN display_mode VARCHAR(20) DEFAULT 'banner';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'promotions' AND column_name = 'overlay_title') THEN
          ALTER TABLE promotions ADD COLUMN overlay_title TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'promotions' AND column_name = 'overlay_description') THEN
          ALTER TABLE promotions ADD COLUMN overlay_description TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'promotions' AND column_name = 'overlay_cta_text') THEN
          ALTER TABLE promotions ADD COLUMN overlay_cta_text VARCHAR(100);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'promotions' AND column_name = 'overlay_cta_url') THEN
          ALTER TABLE promotions ADD COLUMN overlay_cta_url VARCHAR(255);
        END IF;
      END $$;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS promotion_usage (
        id SERIAL PRIMARY KEY,
        promotion_id INTEGER NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_id INTEGER REFERENCES plans(id) ON DELETE SET NULL,
        user_plan_id BIGINT REFERENCES user_plans(id) ON DELETE SET NULL,
        amount_original DECIMAL(10, 2),
        amount_discounted DECIMAL(10, 2),
        used_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(promotion_id, user_id, plan_id)
      );
    `);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_promotions_status ON promotions(status);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_promotions_dates ON promotions(start_at, end_at);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(status, start_at, end_at) WHERE status = 'active';`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_promotion_usage_promo ON promotion_usage(promotion_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_promotion_usage_user ON promotion_usage(user_id);`);
    
    console.log("✅ Promotions system tables created");

    // 💰 Billing & Payment Security Tables
    await db.query(`
      CREATE TABLE IF NOT EXISTS billing_audit_log (
        id SERIAL PRIMARY KEY,
        action VARCHAR(100) NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
        details JSONB DEFAULT '{}',
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    await db.query(`CREATE INDEX IF NOT EXISTS idx_billing_audit_user ON billing_audit_log(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_billing_audit_action ON billing_audit_log(action);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_billing_audit_created ON billing_audit_log(created_at DESC);`);

    await db.query(`
      CREATE TABLE IF NOT EXISTS payment_idempotency (
        id SERIAL PRIMARY KEY,
        idempotency_key VARCHAR(255) UNIQUE NOT NULL,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        response_data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    await db.query(`CREATE INDEX IF NOT EXISTS idx_payment_idempotency_key ON payment_idempotency(idempotency_key);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_payment_idempotency_user ON payment_idempotency(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_payment_idempotency_created ON payment_idempotency(created_at);`);

    // Add UNIQUE constraint on refund_invoice_number if not exists
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'refunds' AND column_name = 'refund_invoice_number') THEN
          ALTER TABLE refunds ADD COLUMN refund_invoice_number VARCHAR(50) UNIQUE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'refunds' AND column_name = 'refund_invoice_issued_at') THEN
          ALTER TABLE refunds ADD COLUMN refund_invoice_issued_at TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'refunds' AND column_name = 'refund_type') THEN
          ALTER TABLE refunds ADD COLUMN refund_type VARCHAR(20) DEFAULT 'full';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'refunds' AND column_name = 'original_amount') THEN
          ALTER TABLE refunds ADD COLUMN original_amount DECIMAL(10, 2);
        END IF;
      END $$;
    `);

    // Add invoice_id column to account_complaints for linking complaints to invoices
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account_complaints' AND column_name = 'invoice_id') THEN
          ALTER TABLE account_complaints ADD COLUMN invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account_complaints' AND column_name = 'refund_id') THEN
          ALTER TABLE account_complaints ADD COLUMN refund_id INTEGER REFERENCES refunds(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account_complaints' AND column_name = 'complaint_type') THEN
          ALTER TABLE account_complaints ADD COLUMN complaint_type VARCHAR(30) DEFAULT 'general';
        END IF;
      END $$;
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_complaints_invoice ON account_complaints(invoice_id) WHERE invoice_id IS NOT NULL;`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_complaints_type ON account_complaints(complaint_type);`);

    // Create chargebacks table for bank dispute handling
    await db.query(`
      CREATE TABLE IF NOT EXISTS chargebacks (
        id SERIAL PRIMARY KEY,
        payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
        invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount DECIMAL(10, 2) NOT NULL,
        reason VARCHAR(100),
        bank_reference VARCHAR(255),
        bank_reason_code VARCHAR(50),
        status VARCHAR(30) DEFAULT 'received',
        evidence_submitted BOOLEAN DEFAULT FALSE,
        evidence_details JSONB DEFAULT '{}',
        outcome VARCHAR(30),
        outcome_date TIMESTAMPTZ,
        processed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_chargebacks_payment ON chargebacks(payment_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_chargebacks_user ON chargebacks(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_chargebacks_status ON chargebacks(status);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_chargebacks_created ON chargebacks(created_at DESC);`);

    console.log("✅ Billing security tables created");
    console.log("✅ Chargebacks & enhanced complaints tables created");

    // 🌍 Country-based pricing table
    await db.query(`
      CREATE TABLE IF NOT EXISTS country_plan_prices (
        id SERIAL PRIMARY KEY,
        plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
        country_code VARCHAR(2) NOT NULL,
        country_name_ar VARCHAR(100) NOT NULL,
        currency_code VARCHAR(3) NOT NULL,
        currency_symbol VARCHAR(10) NOT NULL,
        price DECIMAL(12, 2) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(plan_id, country_code)
      );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_country_plan_prices_plan ON country_plan_prices(plan_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_country_plan_prices_country ON country_plan_prices(country_code);`);
    // Create index on is_active only if column exists
    try {
      await db.query(`CREATE INDEX IF NOT EXISTS idx_country_plan_prices_active ON country_plan_prices(is_active) WHERE is_active = true;`);
    } catch (idxErr) {
      // Column might not exist yet, skip index creation
      console.log("⚠️ Skipping is_active index (column may not exist):", idxErr.message);
    }
    
    // Insert default country prices (converted from SAR base prices)
    // Base prices in SAR: Starter=0, Premium=50, VIP=150, Enterprise=450
    const countryPrices = [
      // الإمارات (AED) - rate: 0.98
      { country: 'AE', name: 'الإمارات', currency: 'AED', symbol: 'درهم', prices: [0, 49, 147, 441] },
      // الكويت (KWD) - rate: 0.082
      { country: 'KW', name: 'الكويت', currency: 'KWD', symbol: 'د.ك', prices: [0, 4, 12, 37] },
      // قطر (QAR) - rate: 0.97
      { country: 'QA', name: 'قطر', currency: 'QAR', symbol: 'ر.ق', prices: [0, 49, 146, 437] },
      // البحرين (BHD) - rate: 0.1
      { country: 'BH', name: 'البحرين', currency: 'BHD', symbol: 'د.ب', prices: [0, 5, 15, 45] },
      // عمان (OMR) - rate: 0.103
      { country: 'OM', name: 'عمان', currency: 'OMR', symbol: 'ر.ع', prices: [0, 5, 15, 46] },
      // مصر (EGP) - rate: 13.07
      { country: 'EG', name: 'مصر', currency: 'EGP', symbol: 'جنيه', prices: [0, 654, 1961, 5882] },
      // لبنان (LBP) - rate: 23,867
      { country: 'LB', name: 'لبنان', currency: 'LBP', symbol: 'ل.ل', prices: [0, 1193350, 3580050, 10740150] },
      // تركيا (TRY) - rate: 9.33
      { country: 'TR', name: 'تركيا', currency: 'TRY', symbol: 'ليرة', prices: [0, 467, 1400, 4199] }
    ];
    
    // Get plan IDs
    const plansResult = await db.query('SELECT id FROM plans ORDER BY sort_order ASC LIMIT 4');
    const planIds = plansResult.rows.map(p => p.id);
    
    if (planIds.length >= 4) {
      for (const cp of countryPrices) {
        for (let i = 0; i < 4; i++) {
          await db.query(`
            INSERT INTO country_plan_prices (plan_id, country_code, country_name_ar, currency_code, currency_symbol, price)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (plan_id, country_code) DO NOTHING
          `, [planIds[i], cp.country, cp.name, cp.currency, cp.symbol, cp.prices[i]]);
        }
      }
      console.log("✅ Country-based pricing data inserted");
    }
    
    console.log("✅ Country-based pricing table created");

    // 🏆 Elite slots country pricing table
    await db.query(`
      CREATE TABLE IF NOT EXISTS elite_slot_country_prices (
        id SERIAL PRIMARY KEY,
        slot_id INTEGER NOT NULL REFERENCES elite_slots(id) ON DELETE CASCADE,
        country_code VARCHAR(2) NOT NULL,
        country_name_ar VARCHAR(100) NOT NULL,
        currency_code VARCHAR(3) NOT NULL,
        currency_symbol VARCHAR(10) NOT NULL,
        price DECIMAL(12, 2) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        needs_review BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(slot_id, country_code)
      );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_elite_slot_country_prices_slot ON elite_slot_country_prices(slot_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_elite_slot_country_prices_country ON elite_slot_country_prices(country_code);`);
    console.log("✅ Elite slot country pricing table created");

    // 💱 Exchange rates table for property price conversion
    await db.query(`
      CREATE TABLE IF NOT EXISTS exchange_rates (
        currency_code VARCHAR(3) PRIMARY KEY,
        currency_name_ar VARCHAR(50) NOT NULL,
        rate_to_usd DECIMAL(18, 8) NOT NULL,
        rate_from_usd DECIMAL(18, 8) NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    // Insert default exchange rates (approximate values - will be updated by cron job)
    await db.query(`
      INSERT INTO exchange_rates (currency_code, currency_name_ar, rate_to_usd, rate_from_usd) VALUES
        ('SAR', 'ريال سعودي', 0.2666, 3.75),
        ('AED', 'درهم إماراتي', 0.2723, 3.6725),
        ('KWD', 'دينار كويتي', 3.2520, 0.3075),
        ('QAR', 'ريال قطري', 0.2747, 3.64),
        ('BHD', 'دينار بحريني', 2.6525, 0.377),
        ('OMR', 'ريال عماني', 2.5974, 0.385),
        ('EGP', 'جنيه مصري', 0.0204, 49.0),
        ('LBP', 'ليرة لبنانية', 0.0000111, 89500),
        ('TRY', 'ليرة تركية', 0.0286, 35.0),
        ('USD', 'دولار أمريكي', 1.0, 1.0)
      ON CONFLICT (currency_code) DO NOTHING;
    `);
    console.log("✅ Exchange rates table created with default values");

    // ⭐ Advertiser ratings and reputation system
    // Note: listing_id FK added separately to avoid init order issues
    await db.query(`
      CREATE TABLE IF NOT EXISTS advertiser_ratings (
        id SERIAL PRIMARY KEY,
        advertiser_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rater_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        listing_id INTEGER,
        conversation_id VARCHAR(255),
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        quick_rating VARCHAR(20) CHECK (quick_rating IN ('positive', 'neutral', 'negative')),
        comment TEXT,
        advertiser_reply TEXT,
        advertiser_reply_at TIMESTAMPTZ,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'hidden')),
        admin_notes TEXT,
        reviewed_by UUID REFERENCES users(id),
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(rater_id, advertiser_id, listing_id)
      );
    `);
    
    // Add FK constraint separately (allows table to exist even if properties table has issues)
    await db.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'advertiser_ratings_listing_id_fkey'
        ) THEN
          ALTER TABLE advertiser_ratings 
            ADD CONSTRAINT advertiser_ratings_listing_id_fkey 
            FOREIGN KEY (listing_id) REFERENCES properties(id) ON DELETE SET NULL;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'FK constraint skipped: %', SQLERRM;
      END $$;
    `);
    console.log("✅ Advertiser ratings table created");

    // 👤 Advertiser reputation summary (cached for performance)
    await db.query(`
      CREATE TABLE IF NOT EXISTS advertiser_reputation (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        total_ratings INTEGER DEFAULT 0,
        average_rating DECIMAL(2,1) DEFAULT 0,
        positive_count INTEGER DEFAULT 0,
        neutral_count INTEGER DEFAULT 0,
        negative_count INTEGER DEFAULT 0,
        response_rate DECIMAL(5,2) DEFAULT 0,
        avg_response_time_hours DECIMAL(6,2),
        total_conversations INTEGER DEFAULT 0,
        verified_advertiser BOOLEAN DEFAULT false,
        trusted_badge BOOLEAN DEFAULT false,
        trusted_badge_at TIMESTAMPTZ,
        last_calculated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log("✅ Advertiser reputation table created");

    // 🎁 Rating rewards and points system
    await db.query(`
      CREATE TABLE IF NOT EXISTS rating_rewards (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        points INTEGER NOT NULL,
        reason VARCHAR(100) NOT NULL,
        rating_id INTEGER REFERENCES advertiser_ratings(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Add reward points column to users if not exists
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'reward_points') THEN
          ALTER TABLE users ADD COLUMN reward_points INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'active_rater_badge') THEN
          ALTER TABLE users ADD COLUMN active_rater_badge BOOLEAN DEFAULT false;
        END IF;
      END $$;
    `);
    console.log("✅ Rating rewards system created");

    // 🎁 Referral System - نظام الإحالة
    await db.query(`
      CREATE TABLE IF NOT EXISTS referrals (
        id BIGSERIAL PRIMARY KEY,
        referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        referred_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        referral_code VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        reward_granted BOOLEAN DEFAULT false,
        reward_granted_at TIMESTAMPTZ,
        collapse_reason TEXT,
        collapsed_at TIMESTAMPTZ,
        flag_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(referred_id)
      );
    `);
    
    // إضافة الأعمدة إذا لم تكن موجودة (للتحديثات التلقائية)
    await db.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'referrals' AND column_name = 'collapse_reason') THEN
          ALTER TABLE referrals ADD COLUMN collapse_reason TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'referrals' AND column_name = 'collapsed_at') THEN
          ALTER TABLE referrals ADD COLUMN collapsed_at TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'referrals' AND column_name = 'flag_reason') THEN
          ALTER TABLE referrals ADD COLUMN flag_reason TEXT;
        END IF;
      END $$;
    `);
    
    // Fraud Detection Tables - جداول اكتشاف الاحتيال
    await db.query(`
      CREATE TABLE IF NOT EXISTS referral_risk_scores (
        id SERIAL PRIMARY KEY,
        referral_id BIGINT REFERENCES referrals(id) ON DELETE CASCADE,
        ambassador_id UUID,
        risk_score DECIMAL(5,2) DEFAULT 0,
        risk_level VARCHAR(20) DEFAULT 'low',
        triggered_rules JSONB DEFAULT '[]',
        ai_analysis TEXT,
        ai_explanation TEXT,
        recommended_action VARCHAR(50),
        assessed_at TIMESTAMPTZ DEFAULT NOW(),
        assessed_by VARCHAR(50) DEFAULT 'system',
        UNIQUE(referral_id)
      );
    `);
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS ai_fraud_scans (
        id SERIAL PRIMARY KEY,
        ambassador_id UUID,
        building_number INTEGER,
        scan_type VARCHAR(20) DEFAULT 'manual',
        status VARCHAR(20) DEFAULT 'pending',
        total_referrals INTEGER DEFAULT 0,
        flagged_count INTEGER DEFAULT 0,
        high_risk_count INTEGER DEFAULT 0,
        medium_risk_count INTEGER DEFAULT 0,
        low_risk_count INTEGER DEFAULT 0,
        summary TEXT,
        ai_report JSONB,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        triggered_by UUID
      );
    `);
    
    // Add indexes for fraud detection tables
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_risk_scores_referral ON referral_risk_scores(referral_id);
      CREATE INDEX IF NOT EXISTS idx_risk_scores_level ON referral_risk_scores(risk_level);
      CREATE INDEX IF NOT EXISTS idx_risk_scores_ambassador ON referral_risk_scores(ambassador_id);
    `);
    
    console.log("✅ Fraud detection tables created");

    // Add referral_code column to users if not exists
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'referral_code') THEN
          ALTER TABLE users ADD COLUMN referral_code VARCHAR(20) UNIQUE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'referred_by') THEN
          ALTER TABLE users ADD COLUMN referred_by UUID REFERENCES users(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'referral_count') THEN
          ALTER TABLE users ADD COLUMN referral_count INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'referral_reward_claimed') THEN
          ALTER TABLE users ADD COLUMN referral_reward_claimed BOOLEAN DEFAULT false;
        END IF;
      END $$;
    `);

    // Create referral rewards table for tracking rewards
    await db.query(`
      CREATE TABLE IF NOT EXISTS referral_rewards (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reward_type VARCHAR(50) NOT NULL DEFAULT 'free_subscription',
        plan_id INTEGER REFERENCES plans(id),
        user_plan_id BIGINT,
        referral_count INTEGER NOT NULL DEFAULT 10,
        granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        notes TEXT
      );
    `);

    // Indexes for referral system
    await db.query(`CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);`);
    console.log("✅ Referral system tables created");

    // 🏠 Ambassador System - سفراء البيت
    // Settings table for admin configuration
    await db.query(`
      CREATE TABLE IF NOT EXISTS ambassador_settings (
        id SERIAL PRIMARY KEY,
        max_floors INTEGER NOT NULL DEFAULT 20,
        floors_per_reward JSONB NOT NULL DEFAULT '[
          {"floors": 5, "plan_id": null, "plan_months": 1, "plan_tier": "صفوة", "description": "شهر صفوة"},
          {"floors": 10, "plan_id": null, "plan_months": 2, "plan_tier": "صفوة", "description": "شهرين صفوة"},
          {"floors": 15, "plan_id": null, "plan_months": 1, "plan_tier": "تميز", "description": "شهر صفوة + شهر تميز", "bonus_tier": "صفوة", "bonus_months": 1},
          {"floors": 20, "plan_id": null, "plan_months": 2, "plan_tier": "رجال أعمال", "description": "رجال أعمال شهرين"}
        ]'::jsonb,
        require_email_verified BOOLEAN DEFAULT true,
        require_phone_verified BOOLEAN DEFAULT false,
        require_first_listing BOOLEAN DEFAULT true,
        min_days_active INTEGER DEFAULT 0,
        consumption_enabled BOOLEAN DEFAULT true,
        motivational_messages JSONB DEFAULT '[
          "تم بناء طابق جديد 🏗️",
          "أنت على بعد {remaining} طوابق من المكافأة 🎁",
          "تم استهلاك رصيدك بنجاح وبدأت عمارة جديدة 🏢",
          "تهانينا! أنت الآن من كبار سفراء البيت 🏆"
        ]'::jsonb,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        updated_by UUID REFERENCES users(id)
      );
    `);

    // Insert default settings if not exists
    await db.query(`
      INSERT INTO ambassador_settings (id, max_floors)
      SELECT 1, 20
      WHERE NOT EXISTS (SELECT 1 FROM ambassador_settings WHERE id = 1);
    `);
    
    // Add financial settings to ambassador_settings (must be before UPDATE query)
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ambassador_settings' AND column_name = 'buildings_per_dollar') THEN
          ALTER TABLE ambassador_settings ADD COLUMN buildings_per_dollar INTEGER DEFAULT 5;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ambassador_settings' AND column_name = 'min_withdrawal_cents') THEN
          ALTER TABLE ambassador_settings ADD COLUMN min_withdrawal_cents INTEGER DEFAULT 100;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ambassador_settings' AND column_name = 'financial_rewards_enabled') THEN
          ALTER TABLE ambassador_settings ADD COLUMN financial_rewards_enabled BOOLEAN DEFAULT true;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ambassador_settings' AND column_name = 'ambassador_enabled') THEN
          ALTER TABLE ambassador_settings ADD COLUMN ambassador_enabled BOOLEAN DEFAULT true;
        END IF;
      END $$;
    `);
    
    // Ensure financial_rewards_enabled is true (activate financial rewards)
    // Only update if columns exist (they were added in the previous DO block)
    try {
      await db.query(`
        UPDATE ambassador_settings 
        SET financial_rewards_enabled = true,
            buildings_per_dollar = COALESCE(buildings_per_dollar, 5),
            min_withdrawal_cents = COALESCE(min_withdrawal_cents, 100)
        WHERE id = 1;
      `);
    } catch (updateErr) {
      // If columns don't exist yet, skip update (they'll be added in next run)
      if (updateErr.code === '42703' || updateErr.message.includes('does not exist')) {
        console.log("⚠️ Skipping ambassador_settings update (columns may not exist yet):", updateErr.message);
      } else {
        throw updateErr; // Re-throw if it's a different error
      }
    }

    // Ambassador reward requests (user requests to admin)
    await db.query(`
      CREATE TABLE IF NOT EXISTS ambassador_requests (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        floors_at_request INTEGER NOT NULL,
        reward_tier VARCHAR(50) NOT NULL,
        reward_description TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        admin_notes TEXT,
        reviewed_by UUID REFERENCES users(id),
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Ambassador consumptions (track building resets)
    await db.query(`
      CREATE TABLE IF NOT EXISTS ambassador_consumptions (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        floors_consumed INTEGER NOT NULL,
        reward_plan_id INTEGER REFERENCES plans(id),
        reward_months INTEGER,
        user_plan_id BIGINT REFERENCES user_plans(id),
        consumed_at TIMESTAMPTZ DEFAULT NOW(),
        notes TEXT
      );
    `);

    // Add ambassador columns to users if not exists
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'ambassador_floors') THEN
          ALTER TABLE users ADD COLUMN ambassador_floors INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'total_floors_earned') THEN
          ALTER TABLE users ADD COLUMN total_floors_earned INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'ambassador_code') THEN
          ALTER TABLE users ADD COLUMN ambassador_code VARCHAR(20) UNIQUE;
        END IF;
      END $$;
    `);

    // Migrate referral_code to ambassador_code if needed
    await db.query(`
      UPDATE users SET ambassador_code = REPLACE(referral_code, 'AQR', 'BAYT-')
      WHERE referral_code IS NOT NULL AND ambassador_code IS NULL;
    `);

    // Add AI analysis columns to ambassador_requests
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ambassador_requests' AND column_name = 'risk_score') THEN
          ALTER TABLE ambassador_requests ADD COLUMN risk_score INTEGER DEFAULT NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ambassador_requests' AND column_name = 'risk_notes') THEN
          ALTER TABLE ambassador_requests ADD COLUMN risk_notes JSONB DEFAULT NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ambassador_requests' AND column_name = 'ai_analyzed_at') THEN
          ALTER TABLE ambassador_requests ADD COLUMN ai_analyzed_at TIMESTAMPTZ DEFAULT NULL;
        END IF;
      END $$;
    `);

    // Indexes for ambassador system
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ambassador_requests_user ON ambassador_requests(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ambassador_requests_status ON ambassador_requests(status);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ambassador_consumptions_user ON ambassador_consumptions(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_users_ambassador_code ON users(ambassador_code);`);
    console.log("✅ Ambassador system tables created");

    // 💰 Ambassador Wallet System - نظام المحفظة المالية للسفراء
    await db.query(`
      CREATE TABLE IF NOT EXISTS ambassador_wallet (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        balance_cents INTEGER NOT NULL DEFAULT 0,
        total_buildings_completed INTEGER NOT NULL DEFAULT 0,
        total_earned_cents INTEGER NOT NULL DEFAULT 0,
        total_withdrawn_cents INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        amount_cents INTEGER NOT NULL,
        balance_after_cents INTEGER NOT NULL,
        buildings_count INTEGER,
        description TEXT,
        related_request_id BIGINT,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS ambassador_withdrawal_requests (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount_cents INTEGER NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        risk_score INTEGER,
        risk_notes JSONB,
        ai_analyzed_at TIMESTAMPTZ,
        ambassador_admin_notes TEXT,
        ambassador_reviewed_by UUID REFERENCES users(id),
        ambassador_reviewed_at TIMESTAMPTZ,
        finance_notes TEXT,
        finance_reviewed_by UUID REFERENCES users(id),
        finance_reviewed_at TIMESTAMPTZ,
        payment_reference TEXT,
        payment_method VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Add building tracking columns to users
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'completed_buildings') THEN
          ALTER TABLE users ADD COLUMN completed_buildings INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'clean_buildings') THEN
          ALTER TABLE users ADD COLUMN clean_buildings INTEGER DEFAULT 0;
        END IF;
      END $$;
    `);

    // Add terms acceptance column to ambassador_wallet
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ambassador_wallet' AND column_name = 'terms_accepted_at') THEN
          ALTER TABLE ambassador_wallet ADD COLUMN terms_accepted_at TIMESTAMPTZ DEFAULT NULL;
        END IF;
      END $$;
    `);

    // Indexes for wallet system
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ambassador_wallet_user ON ambassador_wallet(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user ON wallet_transactions(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type ON wallet_transactions(type);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user ON ambassador_withdrawal_requests(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON ambassador_withdrawal_requests(status);`);
    console.log("✅ Ambassador wallet system tables created");

    // 📋 Listing Workflow System - تتبع مسار الإعلان
    await db.query(`
      CREATE TABLE IF NOT EXISTS listing_workflows (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        status VARCHAR(50) NOT NULL DEFAULT 'draft',
        previous_status VARCHAR(50),
        country_code VARCHAR(5) NOT NULL DEFAULT 'SA',
        currency_code VARCHAR(5) NOT NULL DEFAULT 'SAR',
        currency_symbol VARCHAR(10) NOT NULL DEFAULT 'ر.س',
        base_price DECIMAL(15,2),
        local_price DECIMAL(15,2),
        tax_amount DECIMAL(15,2) DEFAULT 0,
        tax_rate DECIMAL(5,2) DEFAULT 0,
        total_amount DECIMAL(15,2),
        is_tax_exempt BOOLEAN DEFAULT false,
        tax_exempt_reason VARCHAR(100),
        invoice_id UUID,
        reviewed_by UUID REFERENCES users(id),
        reviewed_at TIMESTAMPTZ,
        review_notes TEXT,
        published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 📊 Listing Audit Events - سجل تدقيق الإعلانات
    await db.query(`
      CREATE TABLE IF NOT EXISTS listing_audit_events (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        workflow_id UUID REFERENCES listing_workflows(id),
        event_type VARCHAR(50) NOT NULL,
        event_data JSONB DEFAULT '{}',
        actor_id UUID REFERENCES users(id),
        actor_type VARCHAR(20) DEFAULT 'user',
        ip_address VARCHAR(50),
        user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 💰 Country Tax Rules - قواعد الضرائب حسب البلد
    await db.query(`
      CREATE TABLE IF NOT EXISTS country_tax_rules (
        id SERIAL PRIMARY KEY,
        country_code VARCHAR(5) NOT NULL UNIQUE,
        country_name_ar VARCHAR(100) NOT NULL,
        tax_name VARCHAR(50) NOT NULL DEFAULT 'VAT',
        tax_name_ar VARCHAR(50) NOT NULL DEFAULT 'ضريبة القيمة المضافة',
        tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Insert default tax rules for GCC countries
    const taxRules = [
      { code: 'SA', name: 'السعودية', rate: 15.00 },
      { code: 'AE', name: 'الإمارات', rate: 5.00 },
      { code: 'KW', name: 'الكويت', rate: 0.00 },
      { code: 'QA', name: 'قطر', rate: 0.00 },
      { code: 'BH', name: 'البحرين', rate: 10.00 },
      { code: 'OM', name: 'عمان', rate: 5.00 },
      { code: 'EG', name: 'مصر', rate: 14.00 },
      { code: 'LB', name: 'لبنان', rate: 11.00 },
      { code: 'TR', name: 'تركيا', rate: 18.00 }
    ];
    for (const rule of taxRules) {
      await db.query(`
        INSERT INTO country_tax_rules (country_code, country_name_ar, tax_rate)
        VALUES ($1, $2, $3)
        ON CONFLICT (country_code) DO UPDATE SET tax_rate = $3
      `, [rule.code, rule.name, rule.rate]);
    }

    // 🧾 Enhanced Invoices - Add listing workflow fields
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'workflow_id') THEN
          ALTER TABLE invoices ADD COLUMN workflow_id UUID REFERENCES listing_workflows(id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'country_code') THEN
          ALTER TABLE invoices ADD COLUMN country_code VARCHAR(5) DEFAULT 'SA';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'currency_code') THEN
          ALTER TABLE invoices ADD COLUMN currency_code VARCHAR(5) DEFAULT 'SAR';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'currency_symbol') THEN
          ALTER TABLE invoices ADD COLUMN currency_symbol VARCHAR(10) DEFAULT 'ر.س';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'tax_rate') THEN
          ALTER TABLE invoices ADD COLUMN tax_rate DECIMAL(5,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'tax_amount') THEN
          ALTER TABLE invoices ADD COLUMN tax_amount DECIMAL(15,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'subtotal') THEN
          ALTER TABLE invoices ADD COLUMN subtotal DECIMAL(15,2) DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'invoice_type') THEN
          ALTER TABLE invoices ADD COLUMN invoice_type VARCHAR(30) DEFAULT 'subscription';
        END IF;
      END $$;
    `);

    // Add is_tax_exempt column to listing_workflows
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listing_workflows' AND column_name = 'is_tax_exempt') THEN
          ALTER TABLE listing_workflows ADD COLUMN is_tax_exempt BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'listing_workflows' AND column_name = 'tax_exempt_reason') THEN
          ALTER TABLE listing_workflows ADD COLUMN tax_exempt_reason VARCHAR(100);
        END IF;
      END $$;
    `);

    // Indexes for workflow system
    await db.query(`CREATE INDEX IF NOT EXISTS idx_listing_workflows_property ON listing_workflows(property_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_listing_workflows_status ON listing_workflows(status);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_listing_workflows_country ON listing_workflows(country_code);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_listing_audit_property ON listing_audit_events(property_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_listing_audit_type ON listing_audit_events(event_type);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_invoices_workflow ON invoices(workflow_id);`);
    console.log("✅ Listing workflow and audit system tables created");

    // 📊 Indexes for ratings
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ratings_advertiser ON advertiser_ratings(advertiser_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ratings_rater ON advertiser_ratings(rater_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ratings_status ON advertiser_ratings(status);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ratings_pending ON advertiser_ratings(status, created_at DESC) WHERE status = 'pending';`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_reputation_trusted ON advertiser_reputation(trusted_badge) WHERE trusted_badge = true;`);

    // 🔒 Performance indexes for hot queries
    await db.query(`CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_properties_city ON properties(city);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_properties_user_id ON properties(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_properties_expires_at ON properties(expires_at);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_properties_featured ON properties(is_featured) WHERE is_featured = true;`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_properties_created_at ON properties(created_at DESC);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_user_plans_user_id ON user_plans(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_user_plans_status ON user_plans(status);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_quota_buckets_user_id ON quota_buckets(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_quota_buckets_active ON quota_buckets(active);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);`);

    // 🚀 Composite indexes for advanced search queries
    await db.query(`CREATE INDEX IF NOT EXISTS idx_properties_search_composite ON properties(city, type, purpose, status);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_properties_price_range ON properties(price, status) WHERE status = 'approved';`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_properties_location ON properties(country, city, status);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_properties_pending ON properties(status, created_at DESC) WHERE status = 'pending';`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_properties_in_review ON properties(status, created_at DESC) WHERE status = 'in_review';`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_properties_approved ON properties(status, created_at DESC) WHERE status = 'approved';`);
    
    // 🔄 Promotion usage composite indexes
    await db.query(`CREATE INDEX IF NOT EXISTS idx_promotion_usage_composite ON promotion_usage(promotion_id, user_id, used_at);`);
    
    // 📊 Dashboard statistics indexes
    await db.query(`CREATE INDEX IF NOT EXISTS idx_payments_status_date ON payments(status, created_at DESC);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_user_plans_active ON user_plans(status, expires_at) WHERE status = 'active';`);
    
    // 💬 Messages optimization
    await db.query(`CREATE INDEX IF NOT EXISTS idx_listing_messages_unread ON listing_messages(recipient_id, is_read) WHERE is_read = false;`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = false;`);

    // ⚡ Elite listings and homepage performance indexes
    await db.query(`CREATE INDEX IF NOT EXISTS idx_properties_elite_active ON properties(is_featured, featured_order, featured_at DESC) WHERE is_featured = true AND status = 'approved';`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_properties_homepage ON properties(status, expires_at, created_at DESC) WHERE status = 'approved';`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_listing_media_cover ON listing_media(listing_id, is_cover DESC, sort_order ASC);`);

    // 🚀 Launch Trial System - باقة الانطلاق المجانية
    await db.query(`
      CREATE TABLE IF NOT EXISTS launch_trials (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        max_listings INTEGER NOT NULL DEFAULT 3,
        used_listings INTEGER NOT NULL DEFAULT 0,
        duration_days INTEGER NOT NULL DEFAULT 45,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '45 days'),
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        converted_to_paid BOOLEAN DEFAULT false,
        conversion_date TIMESTAMPTZ,
        converted_plan_id INTEGER REFERENCES plans(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_launch_trials_user ON launch_trials(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_launch_trials_status ON launch_trials(status);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_launch_trials_expires ON launch_trials(expires_at);`);
    console.log("✅ Launch trials table created");

    // 🏠 Property deal status - حالة الصفقة
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'deal_status') THEN
          ALTER TABLE properties ADD COLUMN deal_status VARCHAR(30) DEFAULT 'active';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'deal_status_updated_at') THEN
          ALTER TABLE properties ADD COLUMN deal_status_updated_at TIMESTAMPTZ;
        END IF;
      END $$;
    `);
    console.log("✅ Property deal status columns added");

    // 📧 Property status update reminders
    await db.query(`
      CREATE TABLE IF NOT EXISTS property_status_reminders (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reminder_type VARCHAR(30) NOT NULL DEFAULT 'status_check',
        scheduled_at TIMESTAMPTZ NOT NULL,
        sent_at TIMESTAMPTZ,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_status_reminders_property ON property_status_reminders(property_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_status_reminders_scheduled ON property_status_reminders(scheduled_at, status);`);
    console.log("✅ Property status reminders table created");

    // 🎁 Launch trial settings (admin configurable)
    await db.query(`
      INSERT INTO app_settings (key, value) 
      VALUES 
        ('launch_trial_enabled', 'true'),
        ('launch_trial_max_listings', '3'),
        ('launch_trial_duration_days', '45'),
        ('launch_trial_plan_features', 'business')
      ON CONFLICT (key) DO NOTHING
    `);
    console.log("✅ Launch trial settings initialized");

    // Create countries and cities tables
    await db.query(`
      CREATE TABLE IF NOT EXISTS countries (
        id SERIAL PRIMARY KEY,
        code VARCHAR(3) UNIQUE NOT NULL,
        name_ar VARCHAR(100) NOT NULL,
        name_en VARCHAR(100) NOT NULL,
        flag_emoji VARCHAR(10),
        region VARCHAR(50),
        display_order INTEGER DEFAULT 0,
        latitude DECIMAL(10, 7),
        longitude DECIMAL(10, 7),
        default_zoom INTEGER DEFAULT 6,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS cities (
        id SERIAL PRIMARY KEY,
        country_id INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
        name_ar VARCHAR(100) NOT NULL,
        name_en VARCHAR(100) NOT NULL,
        region_ar VARCHAR(100),
        region_en VARCHAR(100),
        is_popular BOOLEAN DEFAULT false,
        display_order INTEGER DEFAULT 0,
        latitude DECIMAL(10, 7),
        longitude DECIMAL(10, 7),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Ensure all required columns exist (for existing tables)
    try {
      await db.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cities' AND column_name = 'region_ar') THEN
            ALTER TABLE cities ADD COLUMN region_ar VARCHAR(100);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cities' AND column_name = 'region_en') THEN
            ALTER TABLE cities ADD COLUMN region_en VARCHAR(100);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cities' AND column_name = 'is_active') THEN
            ALTER TABLE cities ADD COLUMN is_active BOOLEAN DEFAULT true;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cities' AND column_name = 'is_popular') THEN
            ALTER TABLE cities ADD COLUMN is_popular BOOLEAN DEFAULT false;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cities' AND column_name = 'display_order') THEN
            ALTER TABLE cities ADD COLUMN display_order INTEGER DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cities' AND column_name = 'latitude') THEN
            ALTER TABLE cities ADD COLUMN latitude DECIMAL(10, 7);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cities' AND column_name = 'longitude') THEN
            ALTER TABLE cities ADD COLUMN longitude DECIMAL(10, 7);
          END IF;
        END $$;
      `);
      console.log("✅ Cities table columns verified/added");
    } catch (colErr) {
      console.error("⚠️ Error adding cities columns:", colErr.message);
      // Continue anyway - columns might already exist
    }

    await db.query(`CREATE INDEX IF NOT EXISTS idx_cities_country ON cities(country_id);`);
    // Create index on is_active only if column exists
    try {
      await db.query(`CREATE INDEX IF NOT EXISTS idx_cities_active ON cities(is_active);`);
    } catch (idxErr) {
      // Column might not exist yet, skip index creation
      console.log("⚠️ Skipping is_active index (column may not exist):", idxErr.message);
    }

    // Ensure all required columns exist in countries table (for existing tables)
    try {
      await db.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'countries' AND column_name = 'flag_emoji') THEN
            ALTER TABLE countries ADD COLUMN flag_emoji VARCHAR(10);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'countries' AND column_name = 'region') THEN
            ALTER TABLE countries ADD COLUMN region VARCHAR(50);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'countries' AND column_name = 'display_order') THEN
            ALTER TABLE countries ADD COLUMN display_order INTEGER DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'countries' AND column_name = 'latitude') THEN
            ALTER TABLE countries ADD COLUMN latitude DECIMAL(10, 7);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'countries' AND column_name = 'longitude') THEN
            ALTER TABLE countries ADD COLUMN longitude DECIMAL(10, 7);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'countries' AND column_name = 'default_zoom') THEN
            ALTER TABLE countries ADD COLUMN default_zoom INTEGER DEFAULT 6;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'countries' AND column_name = 'is_active') THEN
            ALTER TABLE countries ADD COLUMN is_active BOOLEAN DEFAULT true;
          END IF;
        END $$;
      `);
      console.log("✅ Countries table columns verified/added");
    } catch (colErr) {
      console.error("⚠️ Error adding countries columns:", colErr.message);
      // Continue anyway - columns might already exist
    }

    // Insert default GCC countries if not exist
    const countriesCheck = await db.query(`SELECT COUNT(*) as cnt FROM countries`);
    if (parseInt(countriesCheck.rows[0].cnt) === 0) {
      await db.query(`
        INSERT INTO countries (code, name_ar, name_en, flag_emoji, region, display_order, latitude, longitude, default_zoom, is_active)
        VALUES 
          ('SA', 'السعودية', 'Saudi Arabia', '🇸🇦', 'GCC', 1, 24.7136, 46.6753, 6, true),
          ('AE', 'الإمارات', 'UAE', '🇦🇪', 'GCC', 2, 24.4539, 54.3773, 7, true),
          ('QA', 'قطر', 'Qatar', '🇶🇦', 'GCC', 3, 25.3548, 51.1839, 8, true),
          ('KW', 'الكويت', 'Kuwait', '🇰🇼', 'GCC', 4, 29.3759, 47.9774, 8, true),
          ('BH', 'البحرين', 'Bahrain', '🇧🇭', 'GCC', 5, 26.0667, 50.5577, 9, true),
          ('OM', 'عمان', 'Oman', '🇴🇲', 'GCC', 6, 23.6100, 58.5400, 7, true),
          ('EG', 'مصر', 'Egypt', '🇪🇬', 'Middle East', 7, 30.0444, 31.2357, 6, true),
          ('TR', 'تركيا', 'Turkey', '🇹🇷', 'Middle East', 8, 39.9334, 32.8597, 6, true),
          ('LB', 'لبنان', 'Lebanon', '🇱🇧', 'Middle East', 9, 33.8938, 35.5018, 8, true)
        ON CONFLICT (code) DO NOTHING
      `);
      console.log("✅ Default countries inserted");
    }

    // Insert default cities for each country
    const citiesCheck = await db.query(`SELECT COUNT(*) as cnt FROM cities`);
    if (parseInt(citiesCheck.rows[0].cnt) === 0) {
      // Get country IDs
      const saCountry = await db.query(`SELECT id FROM countries WHERE code = 'SA'`);
      const aeCountry = await db.query(`SELECT id FROM countries WHERE code = 'AE'`);
      const qaCountry = await db.query(`SELECT id FROM countries WHERE code = 'QA'`);
      const kwCountry = await db.query(`SELECT id FROM countries WHERE code = 'KW'`);
      const bhCountry = await db.query(`SELECT id FROM countries WHERE code = 'BH'`);
      const omCountry = await db.query(`SELECT id FROM countries WHERE code = 'OM'`);
      
      if (saCountry.rows.length > 0) {
        const saId = saCountry.rows[0].id;
        await db.query(`
          INSERT INTO cities (country_id, name_ar, name_en, region_ar, region_en, is_popular, display_order, latitude, longitude, is_active)
          VALUES 
            ($1, 'الرياض', 'Riyadh', 'منطقة الرياض', 'Riyadh Region', true, 1, 24.7136, 46.6753, true),
            ($1, 'جدة', 'Jeddah', 'منطقة مكة المكرمة', 'Makkah Region', true, 2, 21.4858, 39.1925, true),
            ($1, 'الدمام', 'Dammam', 'المنطقة الشرقية', 'Eastern Province', true, 3, 26.4207, 50.0888, true),
            ($1, 'المدينة المنورة', 'Medina', 'منطقة المدينة المنورة', 'Medina Region', true, 4, 24.5247, 39.5692, true),
            ($1, 'مكة المكرمة', 'Makkah', 'منطقة مكة المكرمة', 'Makkah Region', true, 5, 21.3891, 39.8579, true),
            ($1, 'الطائف', 'Taif', 'منطقة مكة المكرمة', 'Makkah Region', false, 6, 21.2703, 40.4158, true),
            ($1, 'أبها', 'Abha', 'منطقة عسير', 'Asir Region', true, 7, 18.2164, 42.5042, true),
            ($1, 'تبوك', 'Tabuk', 'منطقة تبوك', 'Tabuk Region', false, 8, 28.3998, 36.5700, true),
            ($1, 'بريدة', 'Buraydah', 'منطقة القصيم', 'Qassim Region', false, 9, 26.3260, 43.9750, true),
            ($1, 'خميس مشيط', 'Khamis Mushait', 'منطقة عسير', 'Asir Region', false, 10, 18.3000, 42.7333, true)
        `, [saId]);
      }

      if (aeCountry.rows.length > 0) {
        const aeId = aeCountry.rows[0].id;
        await db.query(`
          INSERT INTO cities (country_id, name_ar, name_en, region_ar, region_en, is_popular, display_order, latitude, longitude, is_active)
          VALUES 
            ($1, 'دبي', 'Dubai', 'إمارة دبي', 'Dubai Emirate', true, 1, 25.2048, 55.2708, true),
            ($1, 'أبوظبي', 'Abu Dhabi', 'إمارة أبوظبي', 'Abu Dhabi Emirate', true, 2, 24.4539, 54.3773, true),
            ($1, 'الشارقة', 'Sharjah', 'إمارة الشارقة', 'Sharjah Emirate', false, 3, 25.3573, 55.4033, true),
            ($1, 'العين', 'Al Ain', 'إمارة أبوظبي', 'Abu Dhabi Emirate', false, 4, 24.2075, 55.7447, true)
        `, [aeId]);
      }

      if (qaCountry.rows.length > 0) {
        const qaId = qaCountry.rows[0].id;
        await db.query(`
          INSERT INTO cities (country_id, name_ar, name_en, region_ar, region_en, is_popular, display_order, latitude, longitude, is_active)
          VALUES 
            ($1, 'الدوحة', 'Doha', 'الدوحة', 'Doha', true, 1, 25.2854, 51.5310, true)
        `, [qaId]);
      }

      if (kwCountry.rows.length > 0) {
        const kwId = kwCountry.rows[0].id;
        await db.query(`
          INSERT INTO cities (country_id, name_ar, name_en, region_ar, region_en, is_popular, display_order, latitude, longitude, is_active)
          VALUES 
            ($1, 'الكويت', 'Kuwait City', 'محافظة الكويت', 'Kuwait Governorate', true, 1, 29.3759, 47.9774, true)
        `, [kwId]);
      }

      if (bhCountry.rows.length > 0) {
        const bhId = bhCountry.rows[0].id;
        await db.query(`
          INSERT INTO cities (country_id, name_ar, name_en, region_ar, region_en, is_popular, display_order, latitude, longitude, is_active)
          VALUES 
            ($1, 'المنامة', 'Manama', 'محافظة العاصمة', 'Capital Governorate', true, 1, 26.0667, 50.5577, true)
        `, [bhId]);
      }

      if (omCountry.rows.length > 0) {
        const omId = omCountry.rows[0].id;
        await db.query(`
          INSERT INTO cities (country_id, name_ar, name_en, region_ar, region_en, is_popular, display_order, latitude, longitude, is_active)
          VALUES 
            ($1, 'مسقط', 'Muscat', 'محافظة مسقط', 'Muscat Governorate', true, 1, 23.6100, 58.5400, true)
        `, [omId]);
      }

      console.log("✅ Default cities inserted");
    }

    console.log("✅ All tables and indexes created successfully");
    
    // Create admin users with different roles if not exists
    const adminRoles = [
      { email: 'super@aqar.sa', name: 'المدير العام', role: 'super_admin', role_level: 100 },
      { email: 'admin@aqar.sa', name: 'المدير العام', role: 'super_admin', role_level: 100 },
      { email: 'finance@aqar.sa', name: 'إدارة المالية', role: 'finance_admin', role_level: 70 },
      { email: 'support@aqar.sa', name: 'الدعم الفني', role: 'support_admin', role_level: 60 },
      { email: 'content@aqar.sa', name: 'إدارة المحتوى', role: 'content_admin', role_level: 60 },
    ];

    const adminPassword = process.env.ADMIN_PASSWORD || "Admin@123456";
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    console.log("🔐 Creating/updating admin users...");
    for (const admin of adminRoles) {
      try {
        const check = await db.query("SELECT id, role, role_level FROM users WHERE email = $1", [admin.email]);
        if (check.rows.length === 0) {
          await db.query(
            `INSERT INTO users (email, password_hash, name, role, role_level, created_at, updated_at) 
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
            [admin.email.toLowerCase().trim(), hashedPassword, admin.name, admin.role, admin.role_level]
          );
          console.log(`✅ Admin created: ${admin.email} (${admin.role})`);
        } else {
          const existing = check.rows[0];
          await db.query(
            `UPDATE users 
             SET password_hash = $1, 
                 role = $2, 
                 role_level = $3,
                 name = COALESCE($4, name),
                 locked_until = NULL,
                 failed_login_attempts = 0,
                 updated_at = NOW()
             WHERE email = $5`,
            [hashedPassword, admin.role, admin.role_level, admin.name, admin.email.toLowerCase().trim()]
          );
          console.log(`🔄 Admin updated: ${admin.email} (${admin.role}) - password reset, account unlocked`);
        }
      } catch (adminErr) {
        console.error(`❌ Error creating/updating admin ${admin.email}:`, adminErr.message);
        // Continue with other admins even if one fails
      }
    }
    console.log("✅ All admin users configured");
    
    // 🔍 إضافة Indexes ناقصة لتحسين الأداء (تلقائياً عند كل نشر)
    try {
      const { addMissingIndexes } = require('./scripts/add-missing-indexes');
      await addMissingIndexes();
      console.log("✅ Performance indexes added");
    } catch (indexErr) {
      console.warn("⚠️ Warning: Could not add performance indexes:", indexErr.message);
      // Continue anyway - not critical
    }
  } catch (err) {
    console.error("❌ Database initialization error:", err.message);
    // Re-throw critical errors that prevent table creation
    // This ensures runDatabaseInit() knows initialization failed
    if (err.message.includes('relation') || err.message.includes('does not exist')) {
      // These are usually non-critical column errors, log and continue
      console.warn("⚠️ Non-critical error during initialization, continuing...");
    } else {
      // For other errors, log but don't throw (allow server to start)
      console.warn("⚠️ Error during initialization, but continuing to allow server to start");
    }
  }
  
  // Final verification: ensure critical tables exist
  try {
    const criticalTables = ['users', 'countries', 'cities'];
    for (const tableName of criticalTables) {
      const check = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        ) as exists
      `, [tableName]);
      
      if (!check.rows[0]?.exists) {
        console.error(`❌ CRITICAL: Table '${tableName}' was not created during initialization!`);
        // Try to create it now
        if (tableName === 'countries') {
          await db.query(`
            CREATE TABLE IF NOT EXISTS countries (
              id SERIAL PRIMARY KEY,
              code VARCHAR(3) UNIQUE NOT NULL,
              name_ar VARCHAR(100) NOT NULL,
              name_en VARCHAR(100) NOT NULL,
              flag_emoji VARCHAR(10),
              region VARCHAR(50),
              display_order INTEGER DEFAULT 0,
              latitude DECIMAL(10, 7),
              longitude DECIMAL(10, 7),
              default_zoom INTEGER DEFAULT 6,
              is_active BOOLEAN DEFAULT true,
              created_at TIMESTAMPTZ DEFAULT NOW(),
              updated_at TIMESTAMPTZ DEFAULT NOW()
            );
          `);
          console.log("✅ Created countries table as fallback");
        } else if (tableName === 'cities') {
          await db.query(`
            CREATE TABLE IF NOT EXISTS cities (
              id SERIAL PRIMARY KEY,
              country_id INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
              name_ar VARCHAR(100) NOT NULL,
              name_en VARCHAR(100) NOT NULL,
              region_ar VARCHAR(100),
              region_en VARCHAR(100),
              is_popular BOOLEAN DEFAULT false,
              display_order INTEGER DEFAULT 0,
              latitude DECIMAL(10, 7),
              longitude DECIMAL(10, 7),
              is_active BOOLEAN DEFAULT true,
              created_at TIMESTAMPTZ DEFAULT NOW(),
              updated_at TIMESTAMPTZ DEFAULT NOW()
            );
          `);
          console.log("✅ Created cities table as fallback");
        }
      }
    }
  } catch (verifyErr) {
    console.error("⚠️ Error during table verification:", verifyErr.message);
  }
}

module.exports = { initializeDatabase };

// Add share_text_config column
db.query(`
  ALTER TABLE ambassador_settings 
  ADD COLUMN IF NOT EXISTS share_text_config JSONB DEFAULT '{"main_title": "🏠 انضم لعالم العقارات مع بيت الجزيرة!", "code_line": "✨ استخدم كود السفير: {CODE}", "benefit_line": "🎁 احصل على مميزات حصرية", "cta_line": "سجل الآن:"}'::jsonb
`).then(() => console.log('✅ share_text_config column added')).catch(() => {});

// Create password_reset_tokens table
db.query(`
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);
  CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens(token_hash);
`).then(() => console.log('✅ password_reset_tokens table created')).catch((err) => console.warn('⚠️ password_reset_tokens:', err.message));
