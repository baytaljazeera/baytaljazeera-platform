const express = require("express");
const router = express.Router();
const db = require("../db");
const { authMiddleware, requireRoles } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");

const GENERAL_SETTINGS_KEYS = [
  'site_name',
  'site_email',
  'site_phone',
  'site_address',
  'footer_cities',
  'quick_links_title',
  'quick_links',
  'account_links_title',
  'account_links',
  'maintenance_mode',
  'allow_registration',
  'email_notifications',
  'sms_notifications',
  'auto_approve_listings',
  'max_images_per_listing',
  'listing_duration_days'
];

const DEFAULT_SETTINGS = {
  site_name: 'بيت الجزيرة',
  site_email: 'info@aqar.sa',
  site_phone: '920000000',
  site_address: 'المملكة العربية السعودية',
  footer_cities: 'الرياض,جدة,مكة المكرمة,المدينة المنورة,الدمام,الخبر,تبوك,أبها',
  quick_links_title: 'روابط سريعة',
  quick_links: JSON.stringify([
    { href: "/search", label: "البحث عن عقار" },
    { href: "/listings/new", label: "إضافة إعلان" },
    { href: "/plans", label: "الباقات والأسعار" }
  ]),
  account_links_title: 'الحساب',
  account_links: JSON.stringify([
    { href: "/login", label: "تسجيل الدخول" },
    { href: "/register", label: "إنشاء حساب" },
    { href: "/complaint", label: "تقديم شكوى" }
  ]),
  maintenance_mode: 'false',
  allow_registration: 'true',
  email_notifications: 'true',
  sms_notifications: 'false',
  auto_approve_listings: 'false',
  max_images_per_listing: '10',
  listing_duration_days: '30'
};

router.get("/maintenance-status", asyncHandler(async (req, res) => {
  try {
    const result = await db.query(
      `SELECT value FROM app_settings WHERE key = 'maintenance_mode'`
    );
    const maintenanceMode = result.rows.length > 0 && result.rows[0].value === 'true';
    res.json({ maintenanceMode });
  } catch (err) {
    res.json({ maintenanceMode: false });
  }
}));

router.post("/maintenance-toggle", authMiddleware, requireRoles(['super_admin', 'admin']), asyncHandler(async (req, res) => {
  const { maintenanceMode } = req.body;
  const value = maintenanceMode === true ? 'true' : 'false';
  
  await db.query(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('maintenance_mode', $1, NOW())
    ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
  `, [value]);
  
  res.json({ ok: true, maintenanceMode: maintenanceMode === true });
}));

router.get("/public", asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT key, value FROM app_settings 
    WHERE key IN ('site_name', 'site_email', 'site_phone', 'site_address', 'footer_cities', 'quick_links_title', 'quick_links', 'account_links_title', 'account_links')
  `);
  
  const settingsMap = {};
  result.rows.forEach(row => {
    settingsMap[row.key] = row.value;
  });
  
  const footerCitiesStr = settingsMap.footer_cities || DEFAULT_SETTINGS.footer_cities;
  
  let quickLinks = [];
  let accountLinks = [];
  
  try {
    quickLinks = JSON.parse(settingsMap.quick_links || DEFAULT_SETTINGS.quick_links);
  } catch (e) {
    quickLinks = JSON.parse(DEFAULT_SETTINGS.quick_links);
  }
  
  try {
    accountLinks = JSON.parse(settingsMap.account_links || DEFAULT_SETTINGS.account_links);
  } catch (e) {
    accountLinks = JSON.parse(DEFAULT_SETTINGS.account_links);
  }
  
  res.json({
    siteName: settingsMap.site_name || DEFAULT_SETTINGS.site_name,
    siteEmail: settingsMap.site_email || DEFAULT_SETTINGS.site_email,
    sitePhone: settingsMap.site_phone || DEFAULT_SETTINGS.site_phone,
    siteAddress: settingsMap.site_address || DEFAULT_SETTINGS.site_address,
    footerCities: footerCitiesStr.split(',').map(c => c.trim()).filter(c => c),
    quickLinksTitle: settingsMap.quick_links_title || DEFAULT_SETTINGS.quick_links_title,
    quickLinks,
    accountLinksTitle: settingsMap.account_links_title || DEFAULT_SETTINGS.account_links_title,
    accountLinks,
  });
}));

router.get("/", asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT key, value FROM app_settings 
    WHERE key = ANY($1)
  `, [GENERAL_SETTINGS_KEYS]);
  
  const settingsMap = {};
  result.rows.forEach(row => {
    settingsMap[row.key] = row.value;
  });
  
  const settings = {
    siteName: settingsMap.site_name || DEFAULT_SETTINGS.site_name,
    siteEmail: settingsMap.site_email || DEFAULT_SETTINGS.site_email,
    sitePhone: settingsMap.site_phone || DEFAULT_SETTINGS.site_phone,
    siteAddress: settingsMap.site_address || DEFAULT_SETTINGS.site_address,
    footerCities: settingsMap.footer_cities || DEFAULT_SETTINGS.footer_cities,
    quickLinksTitle: settingsMap.quick_links_title || DEFAULT_SETTINGS.quick_links_title,
    quickLinks: settingsMap.quick_links || DEFAULT_SETTINGS.quick_links,
    accountLinksTitle: settingsMap.account_links_title || DEFAULT_SETTINGS.account_links_title,
    accountLinks: settingsMap.account_links || DEFAULT_SETTINGS.account_links,
    maintenanceMode: (settingsMap.maintenance_mode || DEFAULT_SETTINGS.maintenance_mode) === 'true',
    allowRegistration: (settingsMap.allow_registration || DEFAULT_SETTINGS.allow_registration) === 'true',
    emailNotifications: (settingsMap.email_notifications || DEFAULT_SETTINGS.email_notifications) === 'true',
    smsNotifications: (settingsMap.sms_notifications || DEFAULT_SETTINGS.sms_notifications) === 'true',
    autoApproveListings: (settingsMap.auto_approve_listings || DEFAULT_SETTINGS.auto_approve_listings) === 'true',
    maxImagesPerListing: parseInt(settingsMap.max_images_per_listing || DEFAULT_SETTINGS.max_images_per_listing),
    listingDuration: parseInt(settingsMap.listing_duration_days || DEFAULT_SETTINGS.listing_duration_days)
  };
  
  res.json({ ok: true, settings });
}));

router.put("/", authMiddleware, requireRoles(['super_admin', 'admin']), asyncHandler(async (req, res) => {
  const {
    siteName,
    siteEmail,
    sitePhone,
    siteAddress,
    footerCities,
    quickLinksTitle,
    quickLinks,
    accountLinksTitle,
    accountLinks,
    maintenanceMode,
    allowRegistration,
    emailNotifications,
    smsNotifications,
    autoApproveListings,
    maxImagesPerListing,
    listingDuration
  } = req.body;
  
  const updates = [
    { key: 'site_name', value: siteName || DEFAULT_SETTINGS.site_name },
    { key: 'site_email', value: siteEmail || DEFAULT_SETTINGS.site_email },
    { key: 'site_phone', value: sitePhone || DEFAULT_SETTINGS.site_phone },
    { key: 'site_address', value: siteAddress || DEFAULT_SETTINGS.site_address },
    { key: 'footer_cities', value: footerCities || DEFAULT_SETTINGS.footer_cities },
    { key: 'quick_links_title', value: quickLinksTitle || DEFAULT_SETTINGS.quick_links_title },
    { key: 'quick_links', value: quickLinks || DEFAULT_SETTINGS.quick_links },
    { key: 'account_links_title', value: accountLinksTitle || DEFAULT_SETTINGS.account_links_title },
    { key: 'account_links', value: accountLinks || DEFAULT_SETTINGS.account_links },
    { key: 'maintenance_mode', value: String(maintenanceMode ?? false) },
    { key: 'allow_registration', value: String(allowRegistration ?? true) },
    { key: 'email_notifications', value: String(emailNotifications ?? true) },
    { key: 'sms_notifications', value: String(smsNotifications ?? false) },
    { key: 'auto_approve_listings', value: String(autoApproveListings ?? false) },
    { key: 'max_images_per_listing', value: String(maxImagesPerListing || 10) },
    { key: 'listing_duration_days', value: String(listingDuration || 30) }
  ];
  
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    
    for (const update of updates) {
      await client.query(`
        INSERT INTO app_settings (key, value, updated_at) 
        VALUES ($1, $2, NOW())
        ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
      `, [update.key, update.value]);
    }
    
    await client.query('COMMIT');
    res.json({ ok: true, message: "تم حفظ الإعدادات بنجاح" });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.get("/promo-banner", asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT key, value FROM app_settings 
    WHERE key IN ('promo_banner_enabled', 'promo_banner_title', 'promo_banner_text', 'promo_banner_badge', 'free_mode_enabled')
  `);
  
  const settings = {};
  result.rows.forEach(row => {
    if (row.key === 'promo_banner_enabled' || row.key === 'free_mode_enabled') {
      settings[row.key] = row.value === 'true';
    } else {
      settings[row.key] = row.value;
    }
  });
  
  res.json({ 
    ok: true, 
    settings: {
      enabled: settings.promo_banner_enabled ?? true,
      title: settings.promo_banner_title || 'عرض الإطلاق الخاص',
      text: settings.promo_banner_text || 'استمتع بجميع الباقات مجاناً حتى ألف عميل!',
      badge: settings.promo_banner_badge || 'عرض محدود',
      freeMode: settings.free_mode_enabled ?? true
    }
  });
}));

router.put("/promo-banner", authMiddleware, requireRoles(['super_admin', 'admin']), asyncHandler(async (req, res) => {
  const { enabled, title, text, badge, freeMode } = req.body;
  
  const updates = [
    { key: 'promo_banner_enabled', value: String(enabled ?? true) },
    { key: 'promo_banner_title', value: title || 'عرض الإطلاق الخاص' },
    { key: 'promo_banner_text', value: text || 'استمتع بجميع الباقات مجاناً حتى ألف عميل!' },
    { key: 'promo_banner_badge', value: badge || 'عرض محدود' },
    { key: 'free_mode_enabled', value: String(freeMode ?? true) }
  ];
  
  for (const update of updates) {
    await db.query(`
      INSERT INTO app_settings (key, value, updated_at) 
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
    `, [update.key, update.value]);
  }
  
  res.json({ ok: true, message: "تم تحديث إعدادات البانر بنجاح" });
}));

module.exports = router;
