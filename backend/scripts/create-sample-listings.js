// backend/scripts/create-sample-listings.js
// إنشاء 3 إعلانات تحفيزية نموذجية
const db = require("../db");

async function run() {
  try {
    console.log("=== إنشاء إعلانات تحفيزية ===\n");
    
    // الإعلانات النموذجية - عقارات حقيقية تحفيزية
    const sampleListings = [
      {
        title: "فيلا فاخرة في حي الياسمين - الرياض",
        description: "فيلا راقية بتصميم عصري، 5 غرف نوم، مسبح خاص، حديقة، موقف سيارات مزدوج. الموقع مميز قرب جميع الخدمات. أضف إعلانك مجاناً الآن!",
        city: "الرياض",
        district: "حي الياسمين",
        type: "فيلا",
        purpose: "للبيع",
        usage_type: "سكني",
        price: 2500000,
        area: 450,
        bedrooms: 5,
        bathrooms: 4,
        latitude: 24.8221,
        longitude: 46.7194,
        cover_image: "/images/villa-riyadh.jpg",
        is_featured: true,
        featured_order: 1
      },
      {
        title: "شقة مميزة على البحر - جدة",
        description: "شقة بإطلالة بحرية ساحرة، 3 غرف، تشطيب سوبر لوكس، قريبة من الكورنيش. ابدأ رحلتك العقارية معنا - إعلان مجاني!",
        city: "جدة",
        district: "الشاطئ",
        type: "شقة",
        purpose: "للإيجار",
        usage_type: "سكني",
        price: 85000,
        area: 180,
        bedrooms: 3,
        bathrooms: 2,
        latitude: 21.5433,
        longitude: 39.1728,
        cover_image: "/images/apartment-jeddah.jpg",
        is_featured: true,
        featured_order: 2
      },
      {
        title: "مكتب تجاري راقي - مكة المكرمة",
        description: "مكتب في برج تجاري فاخر، مساحة 120م²، تكييف مركزي، موقف VIP، قرب الحرم. فرصة ذهبية للمستثمرين - أعلن مجاناً!",
        city: "مكة المكرمة",
        district: "العزيزية",
        type: "مكتب",
        purpose: "للإيجار",
        usage_type: "تجاري",
        price: 120000,
        area: 120,
        bedrooms: 0,
        bathrooms: 2,
        latitude: 21.4225,
        longitude: 39.8262,
        cover_image: "/images/office-makkah.jpg",
        is_featured: true,
        featured_order: 3
      }
    ];
    
    for (const listing of sampleListings) {
      const result = await db.query(`
        INSERT INTO properties (
          title, description, city, district, type, purpose, usage_type,
          price, area, bedrooms, bathrooms, latitude, longitude,
          cover_image, status, is_featured, featured_at, featured_order,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13,
          $14, 'approved', $15, NOW(), $16,
          NOW(), NOW()
        ) RETURNING id, title
      `, [
        listing.title, listing.description, listing.city, listing.district,
        listing.type, listing.purpose, listing.usage_type,
        listing.price, listing.area, listing.bedrooms, listing.bathrooms,
        listing.latitude, listing.longitude,
        listing.cover_image, listing.is_featured, listing.featured_order
      ]);
      
      console.log(`✓ تم إنشاء: ${result.rows[0].title}`);
    }
    
    console.log("\n=== تم إنشاء 3 إعلانات تحفيزية بنجاح ===");
    
    // التحقق
    const count = await db.query("SELECT COUNT(*) FROM properties WHERE is_featured = true");
    console.log(`العقارات المميزة: ${count.rows[0].count}`);
    
    process.exit(0);
  } catch (error) {
    console.error("خطأ:", error.message);
    process.exit(1);
  }
}

run();
