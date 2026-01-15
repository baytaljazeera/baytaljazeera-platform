const cron = require('node-cron');
const db = require('../db');

async function checkExpiringEliteReservations() {
  try {
    const expiringReservations = await db.query(`
      SELECT 
        esr.*,
        COALESCE(esr.reservation_ends_at, esp.ends_at) as effective_ends_at,
        p.title as property_title, p.user_id as property_owner_id,
        u.name as user_name, u.email as user_email
      FROM elite_slot_reservations esr
      JOIN elite_slot_periods esp ON esr.period_id = esp.id
      JOIN properties p ON esr.property_id = p.id
      JOIN users u ON esr.user_id = u.id
      WHERE esr.status = 'confirmed'
        AND COALESCE(esr.reservation_ends_at, esp.ends_at) BETWEEN NOW() AND NOW() + INTERVAL '2 days'
        AND NOT EXISTS (
          SELECT 1 FROM notifications n 
          WHERE n.user_id = esr.user_id 
            AND n.type = 'elite_expiry_warning'
            AND n.created_at > NOW() - INTERVAL '24 hours'
        )
    `);

    let notificationsSent = 0;

    for (const resv of expiringReservations.rows) {
      const daysRemaining = Math.ceil((new Date(resv.effective_ends_at) - new Date()) / (1000 * 60 * 60 * 24));
      
      await db.query(`
        INSERT INTO notifications (user_id, title, message, type, link, source, status, created_at)
        VALUES ($1, 'تنبيه: نخبة إعلانك ستنتهي قريباً! ⏰', $2, 'elite_expiry_warning', '/elite-booking/extend?reservation=' || $3, 'app', 'pending', NOW())
      `, [
        resv.property_owner_id,
        'نخبة إعلانك "' + resv.property_title + '" ستنتهي خلال ' + daysRemaining + ' يوم. قم بتمديدها الآن بـ 30 ريال لليوم!',
        resv.id
      ]);
      
      notificationsSent++;
    }

    if (notificationsSent > 0) {
      console.log('⏰ [CRON] تم إرسال ' + notificationsSent + ' إشعار تذكير للحجوزات المنتهية قريباً');
    } else {
      console.log('⏰ [CRON] لا توجد حجوزات تحتاج تذكير حالياً');
    }
    
    return notificationsSent;
  } catch (error) {
    console.error('❌ [CRON] خطأ في فحص الحجوزات:', error);
    throw error;
  }
}

async function fixActiveListings() {
  try {
    const result = await db.query(
      `UPDATE properties SET status = 'approved', updated_at = NOW() WHERE status = 'active' RETURNING id, title`
    );
    if (result.rows.length > 0) {
      console.log(`🔧 تم إصلاح ${result.rows.length} إعلان من 'active' إلى 'approved'`);
      result.rows.forEach(r => console.log(`   - ${r.id}: ${r.title}`));
    }
  } catch (err) {
    console.error("Error fixing active listings:", err.message);
  }
}

async function expireEndedPromotions() {
  try {
    const result = await db.query(`
      UPDATE promotions 
      SET status = 'expired', updated_at = NOW()
      WHERE status = 'active'
        AND end_at IS NOT NULL 
        AND end_at < NOW()
      RETURNING id, name_ar
    `);
    
    if (result.rows.length > 0) {
      console.log('🎁 [CRON] تم إنهاء ' + result.rows.length + ' عرض ترويجي منتهي:');
      result.rows.forEach(p => console.log('   - ' + p.id + ': ' + p.name_ar));
    }
    
    const exhaustedResult = await db.query(`
      UPDATE promotions 
      SET status = 'expired', updated_at = NOW()
      WHERE status = 'active'
        AND usage_limit_total IS NOT NULL 
        AND current_usage >= usage_limit_total
      RETURNING id, name_ar
    `);
    
    if (exhaustedResult.rows.length > 0) {
      console.log('🎁 [CRON] تم إنهاء ' + exhaustedResult.rows.length + ' عرض ترويجي مستنفد:');
      exhaustedResult.rows.forEach(p => console.log('   - ' + p.id + ': ' + p.name_ar));
    }
    
    return result.rows.length + exhaustedResult.rows.length;
  } catch (error) {
    console.error('❌ [CRON] خطأ في فحص العروض المنتهية:', error);
    throw error;
  }
}

async function activateScheduledPromotions() {
  try {
    const result = await db.query(`
      UPDATE promotions 
      SET status = 'active', updated_at = NOW()
      WHERE status = 'draft'
        AND start_at IS NOT NULL 
        AND start_at <= NOW()
        AND (end_at IS NULL OR end_at > NOW())
      RETURNING id, name_ar
    `);
    
    if (result.rows.length > 0) {
      console.log('🎁 [CRON] تم تفعيل ' + result.rows.length + ' عرض ترويجي مجدول:');
      result.rows.forEach(p => console.log('   - ' + p.id + ': ' + p.name_ar));
    }
    
    return result.rows.length;
  } catch (error) {
    console.error('❌ [CRON] خطأ في تفعيل العروض المجدولة:', error);
    throw error;
  }
}

async function updateExchangeRates() {
  const currencies = ['SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'EGP', 'LBP', 'TRY'];
  const apiUrl = process.env.EXCHANGE_RATE_API_URL || 'https://api.exchangerate-api.com/v4/latest/USD';
  
  try {
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      console.warn('💱 [CRON] فشل جلب أسعار الصرف من API - سيتم استخدام القيم المحفوظة');
      return 0;
    }
    
    const data = await response.json();
    let updatedCount = 0;
    
    for (const currency of currencies) {
      if (data.rates[currency]) {
        const rateFromUsd = data.rates[currency];
        const rateToUsd = 1 / rateFromUsd;
        
        await db.query(`
          UPDATE exchange_rates 
          SET rate_to_usd = $1, rate_from_usd = $2, updated_at = NOW()
          WHERE currency_code = $3
        `, [rateToUsd, rateFromUsd, currency]);
        
        updatedCount++;
      }
    }
    
    console.log('💱 [CRON] تم تحديث ' + updatedCount + ' سعر صرف من API');
    return updatedCount;
  } catch (error) {
    console.error('❌ [CRON] خطأ في تحديث أسعار الصرف:', error.message);
    return 0;
  }
}

function startScheduledTasks() {
  console.log('⏰ جاري تفعيل المهام المجدولة...');
  
  cron.schedule('0 9 * * *', async () => {
    console.log('⏰ [CRON] بدء فحص حجوزات النخبة المنتهية قريباً...');
    try {
      await checkExpiringEliteReservations();
    } catch (error) {
      console.error('❌ [CRON] خطأ في فحص الحجوزات المنتهية:', error);
    }
  }, {
    timezone: 'Asia/Riyadh'
  });
  
  cron.schedule('*/15 * * * *', async () => {
    console.log('🎁 [CRON] فحص العروض الترويجية...');
    try {
      await expireEndedPromotions();
      await activateScheduledPromotions();
    } catch (error) {
      console.error('❌ [CRON] خطأ في فحص العروض:', error);
    }
  }, {
    timezone: 'Asia/Riyadh'
  });
  
  cron.schedule('0 6 * * *', async () => {
    console.log('💱 [CRON] تحديث أسعار الصرف اليومي...');
    try {
      await updateExchangeRates();
    } catch (error) {
      console.error('❌ [CRON] خطأ في تحديث أسعار الصرف:', error);
    }
  }, {
    timezone: 'Asia/Riyadh'
  });
  
  setTimeout(async () => {
    console.log('⏰ [STARTUP] فحص أولي للحجوزات المنتهية قريباً...');
    try {
      await checkExpiringEliteReservations();
    } catch (error) {
      console.error('❌ [STARTUP] خطأ في الفحص الأولي:', error);
    }
    
    console.log('🎁 [STARTUP] فحص أولي للعروض الترويجية...');
    try {
      await expireEndedPromotions();
      await activateScheduledPromotions();
    } catch (error) {
      console.error('❌ [STARTUP] خطأ في فحص العروض:', error);
    }
  }, 5000);
  
  console.log('✅ تم تفعيل المهام المجدولة بنجاح');
}

module.exports = {
  startScheduledTasks,
  fixActiveListings,
  checkExpiringEliteReservations,
  expireEndedPromotions,
  activateScheduledPromotions,
  updateExchangeRates,
};
