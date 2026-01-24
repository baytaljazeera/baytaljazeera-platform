// backend/scripts/seed-promotional-listings.js
// إنشاء 20 إعلان تجريبي واقعي للمدن الرئيسية في 9 دول
const db = require("../db");

const promotionalListings = [
  // السعودية - 6 إعلانات
  {
    title: "شقة فندقية فاخرة بإطلالة على الحرم المكي",
    description: "شقة فندقية راقية على بُعد خطوات من الحرم المكي الشريف، تشطيب 5 نجوم، خدمة فندقية متكاملة. فرصة استثمارية ذهبية للحجاج والمعتمرين.",
    city: "مكة المكرمة",
    district: "العزيزية",
    country: "SA",
    type: "شقة",
    purpose: "للبيع",
    usage_type: "سكني",
    price: 3500000,
    area: 120,
    bedrooms: 2,
    bathrooms: 2,
    latitude: 21.4225,
    longitude: 39.8262
  },
  {
    title: "فيلا ملكية في حي السفارات - الرياض",
    description: "فيلا فاخرة بتصميم ملكي في أرقى أحياء الرياض، 6 غرف نوم، مسبح داخلي، حديقة واسعة، نظام أمني متكامل. للعائلات الراقية.",
    city: "الرياض",
    district: "حي السفارات",
    country: "SA",
    type: "فيلا",
    purpose: "للبيع",
    usage_type: "سكني",
    price: 8500000,
    area: 800,
    bedrooms: 6,
    bathrooms: 7,
    latitude: 24.7136,
    longitude: 46.6753
  },
  {
    title: "بنتهاوس فاخر على كورنيش جدة",
    description: "بنتهاوس حصري بإطلالة بانورامية على البحر الأحمر، تراس خاص 200م²، تشطيب ألترا لوكس، موقف VIP. حياة الرفاهية المطلقة.",
    city: "جدة",
    district: "الشاطئ",
    country: "SA",
    type: "شقة",
    purpose: "للبيع",
    usage_type: "سكني",
    price: 6200000,
    area: 450,
    bedrooms: 4,
    bathrooms: 5,
    latitude: 21.5433,
    longitude: 39.1728
  },
  {
    title: "أرض تجارية استراتيجية - الدمام",
    description: "أرض تجارية بموقع استثنائي على الطريق الرئيسي، مساحة 5000م²، صك إلكتروني، مناسبة لمجمع تجاري أو فندق. عائد استثماري مضمون.",
    city: "الدمام",
    district: "الفيصلية",
    country: "SA",
    type: "أرض",
    purpose: "للبيع",
    usage_type: "تجاري",
    price: 12000000,
    area: 5000,
    bedrooms: 0,
    bathrooms: 0,
    latitude: 26.4207,
    longitude: 50.0888
  },
  {
    title: "مجمع سكني استثماري - المدينة المنورة",
    description: "مجمع سكني مكون من 12 شقة بالقرب من المسجد النبوي الشريف، دخل إيجاري ثابت، إدارة متكاملة. استثمار آمن ومبارك.",
    city: "المدينة المنورة",
    district: "العزيزية",
    country: "SA",
    type: "عمارة",
    purpose: "للبيع",
    usage_type: "سكني",
    price: 9800000,
    area: 1200,
    bedrooms: 24,
    bathrooms: 24,
    latitude: 24.4672,
    longitude: 39.6024
  },
  {
    title: "قصر فاخر في أبحر الشمالية",
    description: "قصر ملكي على البحر مباشرة، 10 غرف نوم، مسبح أوليمبي، مرسى قارب خاص، حديقة 2000م². للصفوة فقط.",
    city: "جدة",
    district: "أبحر الشمالية",
    country: "SA",
    type: "قصر",
    purpose: "للبيع",
    usage_type: "سكني",
    price: 25000000,
    area: 3000,
    bedrooms: 10,
    bathrooms: 12,
    latitude: 21.7509,
    longitude: 39.1055
  },

  // الإمارات - 3 إعلانات
  {
    title: "شقة فاخرة بإطلالة على برج خليفة - دبي",
    description: "شقة حصرية في داون تاون دبي بإطلالة مباشرة على برج خليفة ونافورة دبي، تشطيب فندقي، خدمات 5 نجوم. عنوان الفخامة.",
    city: "دبي",
    district: "داون تاون",
    country: "AE",
    type: "شقة",
    purpose: "للبيع",
    usage_type: "سكني",
    price: 8500000,
    area: 280,
    bedrooms: 3,
    bathrooms: 4,
    latitude: 25.1972,
    longitude: 55.2744
  },
  {
    title: "فيلا على النخلة جميرا - دبي",
    description: "فيلا فاخرة على شاطئ النخلة مع مسبح خاص وإطلالة على برج العرب، 5 غرف ماستر، حديقة استوائية. الحياة الفاخرة بامتياز.",
    city: "دبي",
    district: "نخلة جميرا",
    country: "AE",
    type: "فيلا",
    purpose: "للبيع",
    usage_type: "سكني",
    price: 35000000,
    area: 1200,
    bedrooms: 5,
    bathrooms: 7,
    latitude: 25.1124,
    longitude: 55.1390
  },
  {
    title: "برج مكتبي في جزيرة الريم - أبوظبي",
    description: "طابق كامل في برج تجاري فاخر، إطلالة بحرية، تجهيزات ذكية، موقف خاص. مثالي للشركات الكبرى والمقرات الإقليمية.",
    city: "أبوظبي",
    district: "جزيرة الريم",
    country: "AE",
    type: "مكتب",
    purpose: "للإيجار",
    usage_type: "تجاري",
    price: 850000,
    area: 500,
    bedrooms: 0,
    bathrooms: 4,
    latitude: 24.4990,
    longitude: 54.4073
  },

  // الكويت - 2 إعلانات
  {
    title: "شقة فاخرة في برج الحمراء - الكويت",
    description: "شقة راقية في أيقونة الكويت المعمارية، إطلالة 360 درجة على المدينة، تشطيب ألماني، خدمات كونسيرج. للنخبة.",
    city: "الكويت العاصمة",
    district: "شرق",
    country: "KW",
    type: "شقة",
    purpose: "للبيع",
    usage_type: "سكني",
    price: 450000,
    area: 200,
    bedrooms: 3,
    bathrooms: 3,
    latitude: 29.3759,
    longitude: 47.9774
  },
  {
    title: "فيلا عصرية في السالمية",
    description: "فيلا بتصميم عصري، 4 غرف نوم، مسبح، قريبة من الأفنيوز مول. موقع مميز وهادئ للعائلات.",
    city: "السالمية",
    district: "السالمية",
    country: "KW",
    type: "فيلا",
    purpose: "للبيع",
    usage_type: "سكني",
    price: 650000,
    area: 400,
    bedrooms: 4,
    bathrooms: 5,
    latitude: 29.3339,
    longitude: 48.0758
  },

  // قطر - 2 إعلانات
  {
    title: "شقة فاخرة في اللؤلؤة - الدوحة",
    description: "شقة حصرية في جزيرة اللؤلؤة، إطلالة بحرية، مارينا خاصة، تشطيب إيطالي. أسلوب حياة البحر المتوسط.",
    city: "الدوحة",
    district: "اللؤلؤة",
    country: "QA",
    type: "شقة",
    purpose: "للبيع",
    usage_type: "سكني",
    price: 3200000,
    area: 250,
    bedrooms: 3,
    bathrooms: 4,
    latitude: 25.3667,
    longitude: 51.5500
  },
  {
    title: "قصر ملكي في الخليج الغربي",
    description: "قصر فاخر بإطلالة على كورنيش الدوحة، 8 غرف نوم، حديقة واسعة، مسبح داخلي وخارجي. للعائلات الملكية.",
    city: "الدوحة",
    district: "الخليج الغربي",
    country: "QA",
    type: "قصر",
    purpose: "للبيع",
    usage_type: "سكني",
    price: 18000000,
    area: 2000,
    bedrooms: 8,
    bathrooms: 10,
    latitude: 25.3263,
    longitude: 51.5310
  },

  // البحرين - 1 إعلان
  {
    title: "فيلا بحرية في أمواج - المنامة",
    description: "فيلا على البحر مباشرة في جزر أمواج، مرسى قارب خاص، 5 غرف، تصميم عصري. جنة استوائية خاصة.",
    city: "المنامة",
    district: "أمواج",
    country: "BH",
    type: "فيلا",
    purpose: "للبيع",
    usage_type: "سكني",
    price: 850000,
    area: 500,
    bedrooms: 5,
    bathrooms: 6,
    latitude: 26.2235,
    longitude: 50.5876
  },

  // عمان - 1 إعلان
  {
    title: "شقة بإطلالة على جامع السلطان قابوس - مسقط",
    description: "شقة فاخرة بإطلالة على أحد أجمل المساجد في العالم، تشطيب عماني أصيل، موقع هادئ. سكن روحاني مميز.",
    city: "مسقط",
    district: "بوشر",
    country: "OM",
    type: "شقة",
    purpose: "للبيع",
    usage_type: "سكني",
    price: 280000,
    area: 180,
    bedrooms: 3,
    bathrooms: 3,
    latitude: 23.5957,
    longitude: 58.4051
  },

  // مصر - 2 إعلانات
  {
    title: "فيلا فاخرة في الساحل الشمالي",
    description: "فيلا على البحر مباشرة في أرقى قرى الساحل، 4 غرف، مسبح خاص، حديقة. صيف لا ينتهي.",
    city: "الساحل الشمالي",
    district: "مراسي",
    country: "EG",
    type: "فيلا",
    purpose: "للبيع",
    usage_type: "سكني",
    price: 15000000,
    area: 350,
    bedrooms: 4,
    bathrooms: 5,
    latitude: 31.0667,
    longitude: 28.0833
  },
  {
    title: "بنتهاوس في القاهرة الجديدة",
    description: "بنتهاوس فاخر بإطلالة على الجولف، تراس واسع، تشطيب سوبر لوكس، كمبوند راقي. حياة الهدوء والرفاهية.",
    city: "القاهرة الجديدة",
    district: "التجمع الخامس",
    country: "EG",
    type: "شقة",
    purpose: "للبيع",
    usage_type: "سكني",
    price: 12000000,
    area: 400,
    bedrooms: 4,
    bathrooms: 5,
    latitude: 30.0084,
    longitude: 31.4913
  },

  // لبنان - 1 إعلان
  {
    title: "شقة فاخرة على مارينا بيروت",
    description: "شقة حصرية بإطلالة على البحر المتوسط ومارينا بيروت، تشطيب فرنسي راقي، موقف خاص. عنوان الأناقة.",
    city: "بيروت",
    district: "الزيتونة باي",
    country: "LB",
    type: "شقة",
    purpose: "للبيع",
    usage_type: "سكني",
    price: 1200000,
    area: 220,
    bedrooms: 3,
    bathrooms: 3,
    latitude: 33.8938,
    longitude: 35.5018
  },

  // تركيا - 2 إعلانات
  {
    title: "شقة بإطلالة على البوسفور - اسطنبول",
    description: "شقة فاخرة بإطلالة ساحرة على مضيق البوسفور، في منطقة بيبك الراقية، تشطيب عثماني عصري. سحر اسطنبول.",
    city: "اسطنبول",
    district: "بيبك",
    country: "TR",
    type: "شقة",
    purpose: "للبيع",
    usage_type: "سكني",
    price: 12000000,
    area: 300,
    bedrooms: 4,
    bathrooms: 4,
    latitude: 41.0766,
    longitude: 29.0440
  },
  {
    title: "فيلا فاخرة في بودروم",
    description: "فيلا على البحر في ريفيرا تركيا، 6 غرف، مسبح إنفينيتي، حديقة زيتون، مرسى قارب. جنة البحر الأبيض.",
    city: "بودروم",
    district: "ياليكافاك",
    country: "TR",
    type: "فيلا",
    purpose: "للبيع",
    usage_type: "سكني",
    price: 18000000,
    area: 600,
    bedrooms: 6,
    bathrooms: 7,
    latitude: 37.1036,
    longitude: 27.2969
  }
];

async function run() {
  try {
    console.log("=== مسح الإعلانات الحالية وإنشاء إعلانات ترويجية ===\n");
    
    // مسح البيانات المرتبطة أولاً (مع تجاهل الأخطاء)
    const cleanupQueries = [
      "DELETE FROM notifications WHERE listing_id IS NOT NULL",
      "DELETE FROM favorites",
      "DELETE FROM listing_reports",
      "DELETE FROM elite_slot_requests",
      "DELETE FROM elite_slot_history",
      "UPDATE elite_slots SET property_id = NULL"
    ];
    
    for (const query of cleanupQueries) {
      try {
        await db.query(query);
      } catch (e) {
        // تجاهل الأخطاء للجداول غير الموجودة
      }
    }
    console.log("✓ تم مسح البيانات المرتبطة");
    
    // مسح جميع الإعلانات الحالية
    const deleteResult = await db.query("DELETE FROM properties");
    console.log(`✓ تم مسح ${deleteResult.rowCount} إعلان\n`);
    
    // إنشاء الإعلانات الترويجية
    let created = 0;
    for (const listing of promotionalListings) {
      const result = await db.query(`
        INSERT INTO properties (
          title, description, city, district, type, purpose, usage_type,
          price, area, bedrooms, bathrooms, latitude, longitude,
          country, status, is_promotional, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13,
          $14, 'approved', true, NOW(), NOW()
        ) RETURNING id, title
      `, [
        listing.title, listing.description, listing.city, listing.district,
        listing.type, listing.purpose, listing.usage_type,
        listing.price, listing.area, listing.bedrooms, listing.bathrooms,
        listing.latitude, listing.longitude, listing.country
      ]);
      
      console.log(`✓ ${listing.country}: ${result.rows[0].title.substring(0, 40)}...`);
      created++;
    }
    
    console.log(`\n=== تم إنشاء ${created} إعلان ترويجي بنجاح ===`);
    
    // التحقق
    const count = await db.query("SELECT COUNT(*) FROM properties WHERE is_promotional = true");
    console.log(`إجمالي الإعلانات الترويجية: ${count.rows[0].count}`);
    
    process.exit(0);
  } catch (error) {
    console.error("خطأ:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

run();
