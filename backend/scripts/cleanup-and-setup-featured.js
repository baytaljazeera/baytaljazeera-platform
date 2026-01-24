// backend/scripts/cleanup-and-setup-featured.js
// Script to clean up users/listings and setup featured properties system
const db = require("../db");
const bcrypt = require("bcrypt");

async function run() {
  try {
    console.log("=== بدء عملية التنظيف والإعداد ===\n");
    
    // 1. Add is_featured column to properties if not exists
    console.log("1. إضافة عمود is_featured للعقارات...");
    await db.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'is_featured') THEN
          ALTER TABLE properties ADD COLUMN is_featured BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'featured_at') THEN
          ALTER TABLE properties ADD COLUMN featured_at TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'featured_order') THEN
          ALTER TABLE properties ADD COLUMN featured_order INTEGER DEFAULT 0;
        END IF;
      END $$;
    `);
    console.log("   ✓ تم إضافة عمود is_featured\n");
    
    // 2. Get admin users before cleanup
    const admins = await db.query("SELECT id, email, name, role FROM users WHERE role != 'user'");
    console.log(`2. المستخدمين الإداريين (${admins.rows.length}):`);
    admins.rows.forEach(a => console.log(`   - ${a.name} (${a.role})`));
    console.log();
    
    // 3. Delete all related data first (cascade)
    console.log("3. حذف البيانات المرتبطة...");
    
    // Delete listing_media
    await db.query("DELETE FROM listing_media");
    console.log("   ✓ حذف وسائط الإعلانات");
    
    // Delete favorites
    await db.query("DELETE FROM favorites");
    console.log("   ✓ حذف المفضلة");
    
    // Delete notifications for regular users
    await db.query("DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE role = 'user')");
    console.log("   ✓ حذف إشعارات المستخدمين العاديين");
    
    // Delete properties (all)
    const deletedProps = await db.query("DELETE FROM properties RETURNING id");
    console.log(`   ✓ حذف ${deletedProps.rowCount} إعلان`);
    
    // Delete quota_buckets for regular users
    await db.query("DELETE FROM quota_buckets WHERE user_id IN (SELECT id FROM users WHERE role = 'user')");
    console.log("   ✓ حذف حصص المستخدمين العاديين");
    
    // Delete user_plans for regular users
    await db.query("DELETE FROM user_plans WHERE user_id IN (SELECT id FROM users WHERE role = 'user')");
    console.log("   ✓ حذف اشتراكات المستخدمين العاديين");
    
    // Delete refunds for regular users first (has FK to invoices)
    await db.query("DELETE FROM refunds WHERE user_id IN (SELECT id FROM users WHERE role = 'user')");
    console.log("   ✓ حذف طلبات الاسترداد للمستخدمين العاديين");
    
    // Delete invoices for regular users
    await db.query("DELETE FROM invoices WHERE user_id IN (SELECT id FROM users WHERE role = 'user')");
    console.log("   ✓ حذف فواتير المستخدمين العاديين");
    
    // Delete transactions for regular users (if table exists)
    try {
      await db.query("DELETE FROM transactions WHERE user_id IN (SELECT id FROM users WHERE role = 'user')");
      console.log("   ✓ حذف معاملات المستخدمين العاديين");
    } catch (e) {
      console.log("   - جدول المعاملات غير موجود");
    }
    
    // Delete regular users
    const deletedUsers = await db.query("DELETE FROM users WHERE role = 'user' RETURNING id");
    console.log(`   ✓ حذف ${deletedUsers.rowCount} مستخدم عادي\n`);
    
    // 4. Verify cleanup
    const usersCount = await db.query("SELECT COUNT(*) FROM users");
    const propsCount = await db.query("SELECT COUNT(*) FROM properties");
    console.log("4. التحقق من التنظيف:");
    console.log(`   - المستخدمين المتبقين: ${usersCount.rows[0].count}`);
    console.log(`   - الإعلانات المتبقية: ${propsCount.rows[0].count}`);
    
    console.log("\n=== اكتملت عملية التنظيف بنجاح ===");
    
    process.exit(0);
  } catch (error) {
    console.error("خطأ:", error.message);
    process.exit(1);
  }
}

run();
