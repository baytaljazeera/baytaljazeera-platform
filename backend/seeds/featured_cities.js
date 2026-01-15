exports.seed = async function(knex) {
  await knex('featured_cities').del();
  
  await knex('featured_cities').insert([
    // العواصم الرئيسية
    { name_ar: 'الرياض', name_en: 'Riyadh', country_code: 'SA', country_name_ar: 'السعودية', is_capital: true, sort_order: 1, is_active: true },
    { name_ar: 'جدة', name_en: 'Jeddah', country_code: 'SA', country_name_ar: 'السعودية', is_capital: false, sort_order: 2, is_active: true },
    { name_ar: 'دبي', name_en: 'Dubai', country_code: 'AE', country_name_ar: 'الإمارات', is_capital: false, sort_order: 3, is_active: true },
    { name_ar: 'أبوظبي', name_en: 'Abu Dhabi', country_code: 'AE', country_name_ar: 'الإمارات', is_capital: true, sort_order: 4, is_active: true },
    { name_ar: 'الدوحة', name_en: 'Doha', country_code: 'QA', country_name_ar: 'قطر', is_capital: true, sort_order: 5, is_active: true },
    { name_ar: 'الكويت', name_en: 'Kuwait City', country_code: 'KW', country_name_ar: 'الكويت', is_capital: true, sort_order: 6, is_active: true },
    { name_ar: 'المنامة', name_en: 'Manama', country_code: 'BH', country_name_ar: 'البحرين', is_capital: true, sort_order: 7, is_active: true },
    { name_ar: 'مسقط', name_en: 'Muscat', country_code: 'OM', country_name_ar: 'عمان', is_capital: true, sort_order: 8, is_active: true },
    { name_ar: 'القاهرة', name_en: 'Cairo', country_code: 'EG', country_name_ar: 'مصر', is_capital: true, sort_order: 9, is_active: true },
    { name_ar: 'إسطنبول', name_en: 'Istanbul', country_code: 'TR', country_name_ar: 'تركيا', is_capital: false, sort_order: 10, is_active: true },
    { name_ar: 'أنقرة', name_en: 'Ankara', country_code: 'TR', country_name_ar: 'تركيا', is_capital: true, sort_order: 11, is_active: true },
    { name_ar: 'بيروت', name_en: 'Beirut', country_code: 'LB', country_name_ar: 'لبنان', is_capital: true, sort_order: 12, is_active: true },
    // مدن سعودية إضافية مهمة
    { name_ar: 'مكة المكرمة', name_en: 'Makkah', country_code: 'SA', country_name_ar: 'السعودية', is_capital: false, sort_order: 13, is_active: true },
    { name_ar: 'المدينة المنورة', name_en: 'Madinah', country_code: 'SA', country_name_ar: 'السعودية', is_capital: false, sort_order: 14, is_active: true },
    { name_ar: 'الدمام', name_en: 'Dammam', country_code: 'SA', country_name_ar: 'السعودية', is_capital: false, sort_order: 15, is_active: true },
  ]);
};
