const db = require('../db');

async function seedMissingCities() {
  console.log('🌍 Seeding missing cities for Turkey, Egypt, and Lebanon...');
  
  try {
    // Get country IDs
    const countriesResult = await db.query(`
      SELECT id, code, name_ar FROM countries WHERE code IN ('TR', 'EG', 'LB')
    `);
    
    const countryMap = {};
    for (const country of countriesResult.rows) {
      countryMap[country.code] = { id: country.id, name_ar: country.name_ar };
    }
    
    console.log('Found countries:', countryMap);
    
    // Turkey cities (48 cities)
    const turkeyCities = [
      { name_ar: 'إسطنبول', name_en: 'Istanbul', region_ar: 'منطقة مرمرة', region_en: 'Marmara Region', is_popular: true, lat: 41.0082, lng: 28.9784 },
      { name_ar: 'أنقرة', name_en: 'Ankara', region_ar: 'منطقة وسط الأناضول', region_en: 'Central Anatolia', is_popular: true, lat: 39.9334, lng: 32.8597 },
      { name_ar: 'إزمير', name_en: 'Izmir', region_ar: 'منطقة إيجة', region_en: 'Aegean Region', is_popular: true, lat: 38.4237, lng: 27.1428 },
      { name_ar: 'بورصة', name_en: 'Bursa', region_ar: 'منطقة مرمرة', region_en: 'Marmara Region', is_popular: true, lat: 40.1885, lng: 29.0610 },
      { name_ar: 'أنطاليا', name_en: 'Antalya', region_ar: 'منطقة البحر المتوسط', region_en: 'Mediterranean Region', is_popular: true, lat: 36.8969, lng: 30.7133 },
      { name_ar: 'أضنة', name_en: 'Adana', region_ar: 'منطقة البحر المتوسط', region_en: 'Mediterranean Region', is_popular: false, lat: 36.9914, lng: 35.3308 },
      { name_ar: 'قونية', name_en: 'Konya', region_ar: 'منطقة وسط الأناضول', region_en: 'Central Anatolia', is_popular: false, lat: 37.8746, lng: 32.4932 },
      { name_ar: 'غازي عنتاب', name_en: 'Gaziantep', region_ar: 'منطقة جنوب شرق الأناضول', region_en: 'Southeastern Anatolia', is_popular: false, lat: 37.0662, lng: 37.3833 },
      { name_ar: 'مرسين', name_en: 'Mersin', region_ar: 'منطقة البحر المتوسط', region_en: 'Mediterranean Region', is_popular: false, lat: 36.8121, lng: 34.6415 },
      { name_ar: 'قيصري', name_en: 'Kayseri', region_ar: 'منطقة وسط الأناضول', region_en: 'Central Anatolia', is_popular: false, lat: 38.7312, lng: 35.4787 },
      { name_ar: 'إسكي شهير', name_en: 'Eskisehir', region_ar: 'منطقة وسط الأناضول', region_en: 'Central Anatolia', is_popular: false, lat: 39.7767, lng: 30.5206 },
      { name_ar: 'ديار بكر', name_en: 'Diyarbakir', region_ar: 'منطقة جنوب شرق الأناضول', region_en: 'Southeastern Anatolia', is_popular: false, lat: 37.9144, lng: 40.2306 },
      { name_ar: 'سامسون', name_en: 'Samsun', region_ar: 'منطقة البحر الأسود', region_en: 'Black Sea Region', is_popular: false, lat: 41.2867, lng: 36.3300 },
      { name_ar: 'دنيزلي', name_en: 'Denizli', region_ar: 'منطقة إيجة', region_en: 'Aegean Region', is_popular: false, lat: 37.7765, lng: 29.0864 },
      { name_ar: 'شانلي أورفا', name_en: 'Sanliurfa', region_ar: 'منطقة جنوب شرق الأناضول', region_en: 'Southeastern Anatolia', is_popular: false, lat: 37.1591, lng: 38.7969 },
      { name_ar: 'أدابازاري', name_en: 'Adapazari', region_ar: 'منطقة مرمرة', region_en: 'Marmara Region', is_popular: false, lat: 40.7889, lng: 30.4034 },
      { name_ar: 'ملاطية', name_en: 'Malatya', region_ar: 'منطقة شرق الأناضول', region_en: 'Eastern Anatolia', is_popular: false, lat: 38.3552, lng: 38.3095 },
      { name_ar: 'قهرمان مرعش', name_en: 'Kahramanmaras', region_ar: 'منطقة البحر المتوسط', region_en: 'Mediterranean Region', is_popular: false, lat: 37.5858, lng: 36.9371 },
      { name_ar: 'إيلازيغ', name_en: 'Elazig', region_ar: 'منطقة شرق الأناضول', region_en: 'Eastern Anatolia', is_popular: false, lat: 38.6810, lng: 39.2264 },
      { name_ar: 'فان', name_en: 'Van', region_ar: 'منطقة شرق الأناضول', region_en: 'Eastern Anatolia', is_popular: false, lat: 38.4891, lng: 43.4089 },
      { name_ar: 'طرابزون', name_en: 'Trabzon', region_ar: 'منطقة البحر الأسود', region_en: 'Black Sea Region', is_popular: true, lat: 41.0015, lng: 39.7178 },
      { name_ar: 'مانيسا', name_en: 'Manisa', region_ar: 'منطقة إيجة', region_en: 'Aegean Region', is_popular: false, lat: 38.6191, lng: 27.4289 },
      { name_ar: 'باليكسير', name_en: 'Balikesir', region_ar: 'منطقة مرمرة', region_en: 'Marmara Region', is_popular: false, lat: 39.6484, lng: 27.8826 },
      { name_ar: 'بودروم', name_en: 'Bodrum', region_ar: 'منطقة إيجة', region_en: 'Aegean Region', is_popular: true, lat: 37.0344, lng: 27.4305 },
      { name_ar: 'فتحية', name_en: 'Fethiye', region_ar: 'منطقة إيجة', region_en: 'Aegean Region', is_popular: true, lat: 36.6520, lng: 29.1226 },
      { name_ar: 'ألانيا', name_en: 'Alanya', region_ar: 'منطقة البحر المتوسط', region_en: 'Mediterranean Region', is_popular: true, lat: 36.5437, lng: 31.9994 },
      { name_ar: 'مرماريس', name_en: 'Marmaris', region_ar: 'منطقة إيجة', region_en: 'Aegean Region', is_popular: true, lat: 36.8550, lng: 28.2744 },
      { name_ar: 'كوشاداسي', name_en: 'Kusadasi', region_ar: 'منطقة إيجة', region_en: 'Aegean Region', is_popular: true, lat: 37.8579, lng: 27.2610 },
      { name_ar: 'يالوفا', name_en: 'Yalova', region_ar: 'منطقة مرمرة', region_en: 'Marmara Region', is_popular: false, lat: 40.6500, lng: 29.2667 },
      { name_ar: 'تكيرداغ', name_en: 'Tekirdag', region_ar: 'منطقة مرمرة', region_en: 'Marmara Region', is_popular: false, lat: 40.9833, lng: 27.5167 },
      { name_ar: 'أيدين', name_en: 'Aydin', region_ar: 'منطقة إيجة', region_en: 'Aegean Region', is_popular: false, lat: 37.8560, lng: 27.8416 },
      { name_ar: 'موغلا', name_en: 'Mugla', region_ar: 'منطقة إيجة', region_en: 'Aegean Region', is_popular: false, lat: 37.2153, lng: 28.3636 },
      { name_ar: 'هاتاي', name_en: 'Hatay', region_ar: 'منطقة البحر المتوسط', region_en: 'Mediterranean Region', is_popular: false, lat: 36.2028, lng: 36.1600 },
      { name_ar: 'أرضروم', name_en: 'Erzurum', region_ar: 'منطقة شرق الأناضول', region_en: 'Eastern Anatolia', is_popular: false, lat: 39.9000, lng: 41.2700 },
      { name_ar: 'بولو', name_en: 'Bolu', region_ar: 'منطقة البحر الأسود', region_en: 'Black Sea Region', is_popular: false, lat: 40.7350, lng: 31.6061 },
      { name_ar: 'أفيون', name_en: 'Afyon', region_ar: 'منطقة إيجة', region_en: 'Aegean Region', is_popular: false, lat: 38.7507, lng: 30.5567 },
      { name_ar: 'أوردو', name_en: 'Ordu', region_ar: 'منطقة البحر الأسود', region_en: 'Black Sea Region', is_popular: false, lat: 40.9839, lng: 37.8764 },
      { name_ar: 'ريزة', name_en: 'Rize', region_ar: 'منطقة البحر الأسود', region_en: 'Black Sea Region', is_popular: false, lat: 41.0201, lng: 40.5234 },
      { name_ar: 'جيرسون', name_en: 'Giresun', region_ar: 'منطقة البحر الأسود', region_en: 'Black Sea Region', is_popular: false, lat: 40.9128, lng: 38.3895 },
      { name_ar: 'سيواس', name_en: 'Sivas', region_ar: 'منطقة وسط الأناضول', region_en: 'Central Anatolia', is_popular: false, lat: 39.7477, lng: 37.0179 },
      { name_ar: 'توكات', name_en: 'Tokat', region_ar: 'منطقة البحر الأسود', region_en: 'Black Sea Region', is_popular: false, lat: 40.3167, lng: 36.5500 },
      { name_ar: 'أماسيا', name_en: 'Amasya', region_ar: 'منطقة البحر الأسود', region_en: 'Black Sea Region', is_popular: false, lat: 40.6499, lng: 35.8353 },
      { name_ar: 'نوشهير', name_en: 'Nevsehir', region_ar: 'منطقة وسط الأناضول', region_en: 'Central Anatolia', is_popular: true, lat: 38.6244, lng: 34.7239 },
      { name_ar: 'أورغوب', name_en: 'Urgup', region_ar: 'منطقة وسط الأناضول', region_en: 'Central Anatolia', is_popular: true, lat: 38.6308, lng: 34.9117 },
      { name_ar: 'غوريمة', name_en: 'Goreme', region_ar: 'منطقة وسط الأناضول', region_en: 'Central Anatolia', is_popular: true, lat: 38.6431, lng: 34.8289 },
      { name_ar: 'صفرانبولو', name_en: 'Safranbolu', region_ar: 'منطقة البحر الأسود', region_en: 'Black Sea Region', is_popular: true, lat: 41.2536, lng: 32.6931 },
      { name_ar: 'بامكالي', name_en: 'Pamukkale', region_ar: 'منطقة إيجة', region_en: 'Aegean Region', is_popular: true, lat: 37.9137, lng: 29.1187 },
      { name_ar: 'تشاناكالي', name_en: 'Canakkale', region_ar: 'منطقة مرمرة', region_en: 'Marmara Region', is_popular: false, lat: 40.1553, lng: 26.4142 },
    ];
    
    // Egypt cities (50 cities)
    const egyptCities = [
      { name_ar: 'القاهرة', name_en: 'Cairo', region_ar: 'القاهرة الكبرى', region_en: 'Greater Cairo', is_popular: true, lat: 30.0444, lng: 31.2357 },
      { name_ar: 'الإسكندرية', name_en: 'Alexandria', region_ar: 'الإسكندرية', region_en: 'Alexandria', is_popular: true, lat: 31.2001, lng: 29.9187 },
      { name_ar: 'الجيزة', name_en: 'Giza', region_ar: 'القاهرة الكبرى', region_en: 'Greater Cairo', is_popular: true, lat: 30.0131, lng: 31.2089 },
      { name_ar: 'شرم الشيخ', name_en: 'Sharm El Sheikh', region_ar: 'جنوب سيناء', region_en: 'South Sinai', is_popular: true, lat: 27.9158, lng: 34.3300 },
      { name_ar: 'الغردقة', name_en: 'Hurghada', region_ar: 'البحر الأحمر', region_en: 'Red Sea', is_popular: true, lat: 27.2579, lng: 33.8116 },
      { name_ar: 'الأقصر', name_en: 'Luxor', region_ar: 'الأقصر', region_en: 'Luxor', is_popular: true, lat: 25.6872, lng: 32.6396 },
      { name_ar: 'أسوان', name_en: 'Aswan', region_ar: 'أسوان', region_en: 'Aswan', is_popular: true, lat: 24.0889, lng: 32.8998 },
      { name_ar: 'بورسعيد', name_en: 'Port Said', region_ar: 'بورسعيد', region_en: 'Port Said', is_popular: false, lat: 31.2653, lng: 32.3019 },
      { name_ar: 'السويس', name_en: 'Suez', region_ar: 'السويس', region_en: 'Suez', is_popular: false, lat: 29.9668, lng: 32.5498 },
      { name_ar: 'الإسماعيلية', name_en: 'Ismailia', region_ar: 'الإسماعيلية', region_en: 'Ismailia', is_popular: false, lat: 30.5965, lng: 32.2715 },
      { name_ar: 'طنطا', name_en: 'Tanta', region_ar: 'الغربية', region_en: 'Gharbia', is_popular: false, lat: 30.7865, lng: 31.0004 },
      { name_ar: 'المنصورة', name_en: 'Mansoura', region_ar: 'الدقهلية', region_en: 'Dakahlia', is_popular: false, lat: 31.0409, lng: 31.3785 },
      { name_ar: 'الزقازيق', name_en: 'Zagazig', region_ar: 'الشرقية', region_en: 'Sharqia', is_popular: false, lat: 30.5877, lng: 31.5020 },
      { name_ar: 'أسيوط', name_en: 'Asyut', region_ar: 'أسيوط', region_en: 'Asyut', is_popular: false, lat: 27.1809, lng: 31.1837 },
      { name_ar: 'سوهاج', name_en: 'Sohag', region_ar: 'سوهاج', region_en: 'Sohag', is_popular: false, lat: 26.5591, lng: 31.6957 },
      { name_ar: 'قنا', name_en: 'Qena', region_ar: 'قنا', region_en: 'Qena', is_popular: false, lat: 26.1551, lng: 32.7160 },
      { name_ar: 'المنيا', name_en: 'Minya', region_ar: 'المنيا', region_en: 'Minya', is_popular: false, lat: 28.1099, lng: 30.7503 },
      { name_ar: 'بني سويف', name_en: 'Beni Suef', region_ar: 'بني سويف', region_en: 'Beni Suef', is_popular: false, lat: 29.0661, lng: 31.0994 },
      { name_ar: 'الفيوم', name_en: 'Fayoum', region_ar: 'الفيوم', region_en: 'Fayoum', is_popular: false, lat: 29.3084, lng: 30.8428 },
      { name_ar: 'دمياط', name_en: 'Damietta', region_ar: 'دمياط', region_en: 'Damietta', is_popular: false, lat: 31.4175, lng: 31.8144 },
      { name_ar: 'كفر الشيخ', name_en: 'Kafr El Sheikh', region_ar: 'كفر الشيخ', region_en: 'Kafr El Sheikh', is_popular: false, lat: 31.1107, lng: 30.9388 },
      { name_ar: 'المحلة الكبرى', name_en: 'Mahalla El Kubra', region_ar: 'الغربية', region_en: 'Gharbia', is_popular: false, lat: 30.9716, lng: 31.1656 },
      { name_ar: 'شبين الكوم', name_en: 'Shibin El Kom', region_ar: 'المنوفية', region_en: 'Monufia', is_popular: false, lat: 30.5585, lng: 31.0142 },
      { name_ar: 'بنها', name_en: 'Benha', region_ar: 'القليوبية', region_en: 'Qalyubia', is_popular: false, lat: 30.4667, lng: 31.1833 },
      { name_ar: 'مرسى مطروح', name_en: 'Marsa Matruh', region_ar: 'مطروح', region_en: 'Matruh', is_popular: true, lat: 31.3543, lng: 27.2373 },
      { name_ar: 'العريش', name_en: 'Arish', region_ar: 'شمال سيناء', region_en: 'North Sinai', is_popular: false, lat: 31.1314, lng: 33.7981 },
      { name_ar: 'السادس من أكتوبر', name_en: '6th of October', region_ar: 'القاهرة الكبرى', region_en: 'Greater Cairo', is_popular: true, lat: 29.9285, lng: 30.9188 },
      { name_ar: 'القاهرة الجديدة', name_en: 'New Cairo', region_ar: 'القاهرة الكبرى', region_en: 'Greater Cairo', is_popular: true, lat: 30.0300, lng: 31.4700 },
      { name_ar: 'العاصمة الإدارية', name_en: 'New Administrative Capital', region_ar: 'القاهرة الكبرى', region_en: 'Greater Cairo', is_popular: true, lat: 30.0281, lng: 31.7557 },
      { name_ar: 'الشيخ زايد', name_en: 'Sheikh Zayed', region_ar: 'القاهرة الكبرى', region_en: 'Greater Cairo', is_popular: true, lat: 30.0415, lng: 30.9844 },
      { name_ar: 'مدينة نصر', name_en: 'Nasr City', region_ar: 'القاهرة', region_en: 'Cairo', is_popular: true, lat: 30.0626, lng: 31.3389 },
      { name_ar: 'المعادي', name_en: 'Maadi', region_ar: 'القاهرة', region_en: 'Cairo', is_popular: true, lat: 29.9602, lng: 31.2569 },
      { name_ar: 'الزمالك', name_en: 'Zamalek', region_ar: 'القاهرة', region_en: 'Cairo', is_popular: true, lat: 30.0600, lng: 31.2200 },
      { name_ar: 'مصر الجديدة', name_en: 'Heliopolis', region_ar: 'القاهرة', region_en: 'Cairo', is_popular: true, lat: 30.0866, lng: 31.3233 },
      { name_ar: 'التجمع الخامس', name_en: 'Fifth Settlement', region_ar: 'القاهرة الجديدة', region_en: 'New Cairo', is_popular: true, lat: 30.0074, lng: 31.4913 },
      { name_ar: 'الرحاب', name_en: 'Rehab', region_ar: 'القاهرة الجديدة', region_en: 'New Cairo', is_popular: true, lat: 30.0600, lng: 31.4900 },
      { name_ar: 'مدينتي', name_en: 'Madinaty', region_ar: 'القاهرة الجديدة', region_en: 'New Cairo', is_popular: true, lat: 30.1075, lng: 31.6381 },
      { name_ar: 'العين السخنة', name_en: 'Ain Sokhna', region_ar: 'السويس', region_en: 'Suez', is_popular: true, lat: 29.6009, lng: 32.3486 },
      { name_ar: 'الساحل الشمالي', name_en: 'North Coast', region_ar: 'مطروح', region_en: 'Matruh', is_popular: true, lat: 31.0500, lng: 28.0000 },
      { name_ar: 'العلمين الجديدة', name_en: 'New Alamein', region_ar: 'مطروح', region_en: 'Matruh', is_popular: true, lat: 30.8300, lng: 28.9500 },
      { name_ar: 'دهب', name_en: 'Dahab', region_ar: 'جنوب سيناء', region_en: 'South Sinai', is_popular: true, lat: 28.5000, lng: 34.5167 },
      { name_ar: 'نويبع', name_en: 'Nuweiba', region_ar: 'جنوب سيناء', region_en: 'South Sinai', is_popular: false, lat: 29.0467, lng: 34.6644 },
      { name_ar: 'طابا', name_en: 'Taba', region_ar: 'جنوب سيناء', region_en: 'South Sinai', is_popular: false, lat: 29.4917, lng: 34.8917 },
      { name_ar: 'رأس سدر', name_en: 'Ras Sedr', region_ar: 'جنوب سيناء', region_en: 'South Sinai', is_popular: false, lat: 29.6000, lng: 32.7167 },
      { name_ar: 'القصير', name_en: 'Quseer', region_ar: 'البحر الأحمر', region_en: 'Red Sea', is_popular: false, lat: 26.1000, lng: 34.2833 },
      { name_ar: 'سفاجا', name_en: 'Safaga', region_ar: 'البحر الأحمر', region_en: 'Red Sea', is_popular: false, lat: 26.7333, lng: 33.9333 },
      { name_ar: 'مرسى علم', name_en: 'Marsa Alam', region_ar: 'البحر الأحمر', region_en: 'Red Sea', is_popular: true, lat: 25.0667, lng: 34.8833 },
      { name_ar: 'الجونة', name_en: 'El Gouna', region_ar: 'البحر الأحمر', region_en: 'Red Sea', is_popular: true, lat: 27.3956, lng: 33.6778 },
      { name_ar: 'سهل حشيش', name_en: 'Sahl Hasheesh', region_ar: 'البحر الأحمر', region_en: 'Red Sea', is_popular: true, lat: 27.0500, lng: 33.8667 },
      { name_ar: 'بورفؤاد', name_en: 'Port Fouad', region_ar: 'بورسعيد', region_en: 'Port Said', is_popular: false, lat: 31.2500, lng: 32.3333 },
    ];
    
    // Lebanon cities (22 cities)
    const lebanonCities = [
      { name_ar: 'بيروت', name_en: 'Beirut', region_ar: 'بيروت', region_en: 'Beirut', is_popular: true, lat: 33.8938, lng: 35.5018 },
      { name_ar: 'طرابلس', name_en: 'Tripoli', region_ar: 'الشمال', region_en: 'North', is_popular: true, lat: 34.4332, lng: 35.8316 },
      { name_ar: 'صيدا', name_en: 'Sidon', region_ar: 'الجنوب', region_en: 'South', is_popular: true, lat: 33.5631, lng: 35.3697 },
      { name_ar: 'صور', name_en: 'Tyre', region_ar: 'الجنوب', region_en: 'South', is_popular: true, lat: 33.2705, lng: 35.1939 },
      { name_ar: 'جونيه', name_en: 'Jounieh', region_ar: 'جبل لبنان', region_en: 'Mount Lebanon', is_popular: true, lat: 33.9808, lng: 35.6178 },
      { name_ar: 'زحلة', name_en: 'Zahle', region_ar: 'البقاع', region_en: 'Bekaa', is_popular: true, lat: 33.8463, lng: 35.9042 },
      { name_ar: 'بعلبك', name_en: 'Baalbek', region_ar: 'البقاع', region_en: 'Bekaa', is_popular: true, lat: 34.0047, lng: 36.2108 },
      { name_ar: 'جبيل', name_en: 'Byblos', region_ar: 'جبل لبنان', region_en: 'Mount Lebanon', is_popular: true, lat: 34.1236, lng: 35.6511 },
      { name_ar: 'النبطية', name_en: 'Nabatieh', region_ar: 'الجنوب', region_en: 'South', is_popular: false, lat: 33.3778, lng: 35.4831 },
      { name_ar: 'الأشرفية', name_en: 'Ashrafieh', region_ar: 'بيروت', region_en: 'Beirut', is_popular: true, lat: 33.8883, lng: 35.5233 },
      { name_ar: 'الحمرا', name_en: 'Hamra', region_ar: 'بيروت', region_en: 'Beirut', is_popular: true, lat: 33.8958, lng: 35.4833 },
      { name_ar: 'فردان', name_en: 'Verdun', region_ar: 'بيروت', region_en: 'Beirut', is_popular: true, lat: 33.8833, lng: 35.4833 },
      { name_ar: 'الروشة', name_en: 'Raouche', region_ar: 'بيروت', region_en: 'Beirut', is_popular: true, lat: 33.8889, lng: 35.4742 },
      { name_ar: 'ضبية', name_en: 'Dbayeh', region_ar: 'جبل لبنان', region_en: 'Mount Lebanon', is_popular: true, lat: 33.9100, lng: 35.5667 },
      { name_ar: 'بكفيا', name_en: 'Bikfaya', region_ar: 'جبل لبنان', region_en: 'Mount Lebanon', is_popular: false, lat: 33.9286, lng: 35.6625 },
      { name_ar: 'عاليه', name_en: 'Aley', region_ar: 'جبل لبنان', region_en: 'Mount Lebanon', is_popular: false, lat: 33.8167, lng: 35.6000 },
      { name_ar: 'برمانا', name_en: 'Broumana', region_ar: 'جبل لبنان', region_en: 'Mount Lebanon', is_popular: true, lat: 33.8833, lng: 35.6333 },
      { name_ar: 'بحمدون', name_en: 'Bhamdoun', region_ar: 'جبل لبنان', region_en: 'Mount Lebanon', is_popular: false, lat: 33.8000, lng: 35.6667 },
      { name_ar: 'شتورا', name_en: 'Chtaura', region_ar: 'البقاع', region_en: 'Bekaa', is_popular: false, lat: 33.8167, lng: 35.8500 },
      { name_ar: 'جزين', name_en: 'Jezzine', region_ar: 'الجنوب', region_en: 'South', is_popular: false, lat: 33.5444, lng: 35.5817 },
      { name_ar: 'الأرز', name_en: 'The Cedars', region_ar: 'الشمال', region_en: 'North', is_popular: true, lat: 34.2500, lng: 36.0333 },
      { name_ar: 'فاريا', name_en: 'Faraya', region_ar: 'جبل لبنان', region_en: 'Mount Lebanon', is_popular: true, lat: 33.9875, lng: 35.8167 },
    ];

    // Insert cities for each country
    const insertCity = async (city, countryId, displayOrder) => {
      await db.query(`
        INSERT INTO cities (name_ar, name_en, region_ar, region_en, country_id, is_popular, display_order, is_active, latitude, longitude)
        VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9)
        ON CONFLICT DO NOTHING
      `, [city.name_ar, city.name_en, city.region_ar, city.region_en, countryId, city.is_popular, displayOrder, city.lat, city.lng]);
    };

    // Insert Turkey cities
    if (countryMap.TR) {
      console.log('🇹🇷 Inserting Turkey cities...');
      for (let i = 0; i < turkeyCities.length; i++) {
        await insertCity(turkeyCities[i], countryMap.TR.id, i + 1);
      }
      console.log(`✅ Inserted ${turkeyCities.length} Turkey cities`);
    }

    // Insert Egypt cities
    if (countryMap.EG) {
      console.log('🇪🇬 Inserting Egypt cities...');
      for (let i = 0; i < egyptCities.length; i++) {
        await insertCity(egyptCities[i], countryMap.EG.id, i + 1);
      }
      console.log(`✅ Inserted ${egyptCities.length} Egypt cities`);
    }

    // Insert Lebanon cities
    if (countryMap.LB) {
      console.log('🇱🇧 Inserting Lebanon cities...');
      for (let i = 0; i < lebanonCities.length; i++) {
        await insertCity(lebanonCities[i], countryMap.LB.id, i + 1);
      }
      console.log(`✅ Inserted ${lebanonCities.length} Lebanon cities`);
    }

    // Verify counts
    const countResult = await db.query(`
      SELECT co.code, co.name_ar, COUNT(c.id) as city_count
      FROM countries co
      LEFT JOIN cities c ON c.country_id = co.id
      GROUP BY co.id, co.code, co.name_ar
      ORDER BY co.display_order
    `);
    
    console.log('\n📊 Cities count per country:');
    for (const row of countResult.rows) {
      console.log(`  ${row.name_ar} (${row.code}): ${row.city_count} cities`);
    }

    console.log('\n✅ Missing cities seeding completed!');
    
  } catch (error) {
    console.error('❌ Error seeding cities:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  seedMissingCities()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { seedMissingCities };
