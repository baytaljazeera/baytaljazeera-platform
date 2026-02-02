#!/usr/bin/env node
/**
 * سكربت إصلاح جدول المدن المميزة
 * يشغّل مرة واحدة لإنشاء الجدول وإدراج المدن الافتراضية
 */
try { require('dotenv').config({ path: require('path').join(__dirname, '../../.env') }); } catch (_) {}
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace?.('psql ', '')?.replace?.(/'/g, '') || process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function fix() {
  const client = await pool.connect();
  try {
    console.log('🔧 جاري إصلاح جدول المدن المميزة...');

    // التحقق إن كان الجدول له هيكل خاطئ (مثلاً من init-render-db القديم)
    const cols = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'featured_cities'
    `).catch(() => ({ rows: [] }));
    const hasWrongSchema = cols.rows.some(r => r.column_name === 'city_name');
    if (hasWrongSchema) {
      console.log('⚠️ هيكل قديم - جاري إعادة الإنشاء...');
      await client.query('DROP TABLE IF EXISTS featured_cities');
    }

    // إنشاء الجدول بالهيكل الصحيح
    await client.query(`
      CREATE TABLE IF NOT EXISTS featured_cities (
        id SERIAL PRIMARY KEY,
        name_ar VARCHAR(100) NOT NULL,
        name_en VARCHAR(100),
        country_code VARCHAR(2) NOT NULL,
        country_name_ar VARCHAR(100),
        image_url VARCHAR(500),
        properties_count INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        is_capital BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ الجدول جاهز');

    // التحقق إن كان فارغاً وإدراج المدن الافتراضية
    const count = await client.query('SELECT COUNT(*) as n FROM featured_cities');
    if (parseInt(count.rows[0].n) === 0) {
      await client.query(`
        INSERT INTO featured_cities (name_ar, name_en, country_code, country_name_ar, is_capital, sort_order, is_active)
        VALUES 
          ('الرياض', 'Riyadh', 'SA', 'السعودية', true, 1, true),
          ('جدة', 'Jeddah', 'SA', 'السعودية', false, 2, true),
          ('الطائف', 'Taif', 'SA', 'السعودية', false, 3, true),
          ('المدينة المنورة', 'Madinah', 'SA', 'السعودية', false, 4, true),
          ('مكة المكرمة', 'Makkah', 'SA', 'السعودية', false, 5, true)
      `);
      console.log('✅ تم إدراج 5 مدن افتراضية');
    } else {
      console.log('✅ الجدول يحتوي مدن بالفعل');
    }

    console.log('🎉 تم بنجاح! حدّث صفحة لوحة الإدارة.');
  } catch (err) {
    console.error('❌ خطأ:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

fix();
