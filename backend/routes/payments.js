const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, authMiddlewareWithEmailCheck } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');
const { paymentLimiter } = require('../config/security');
const pricingService = require('../services/pricingService');
const promotionService = require('../services/promotionService');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const IDEMPOTENCY_EXPIRY_MINUTES = 30;

const SUPPORTED_COUNTRIES = {
  SA: { currency_code: 'SAR', currency_symbol: 'ر.س' },
  QA: { currency_code: 'QAR', currency_symbol: 'ر.ق' },
  KW: { currency_code: 'KWD', currency_symbol: 'د.ك' },
  OM: { currency_code: 'OMR', currency_symbol: 'ر.ع' },
  BH: { currency_code: 'BHD', currency_symbol: 'د.ب' },
  EG: { currency_code: 'EGP', currency_symbol: 'جنيه' },
  TR: { currency_code: 'TRY', currency_symbol: 'ليرة' },
  LB: { currency_code: 'LBP', currency_symbol: 'ل.ل' },
  INT: { currency_code: 'USD', currency_symbol: '$' }
};

async function getCountryPricing(planId, countryCode, basePriceSAR = null, queryFn = db) {
  const country = SUPPORTED_COUNTRIES[countryCode] || SUPPORTED_COUNTRIES.SA;
  
  const priceResult = await queryFn.query(
    `SELECT price FROM country_plan_prices WHERE plan_id = $1 AND country_code = $2 AND is_active = true`,
    [planId, countryCode]
  );
  
  const hasCustomPrice = priceResult.rows.length > 0;
  let localPrice = hasCustomPrice ? parseFloat(priceResult.rows[0].price) : null;
  let effectiveCurrency = country.currency_code;
  let isAutoConverted = false;
  
  if (!hasCustomPrice && basePriceSAR !== null) {
    const basePriceNum = parseFloat(basePriceSAR);
    if (countryCode === 'SA' || !countryCode) {
      localPrice = basePriceNum;
      effectiveCurrency = 'SAR';
    } else {
      const convertedPrice = await pricingService.convertPrice(basePriceNum, country.currency_code);
      localPrice = pricingService.roundPrice(convertedPrice, country.currency_code);
      effectiveCurrency = country.currency_code;
      isAutoConverted = true;
    }
  }
  
  return {
    hasCustomPrice,
    localPrice: localPrice !== null ? parseFloat(localPrice) : null,
    currency: effectiveCurrency,
    currencySymbol: hasCustomPrice ? country.currency_symbol : (effectiveCurrency === 'SAR' ? 'ر.س' : country.currency_symbol),
    isAutoConverted
  };
}

async function getApplicablePromotion(planId, userId = null, client = null) {
  const queryFn = client || db;
  const activePromosQuery = `
    SELECT * FROM promotions 
    WHERE status = 'active'
      AND (start_at IS NULL OR start_at <= NOW())
      AND (end_at IS NULL OR end_at > NOW())
      AND (usage_limit_total IS NULL OR current_usage < usage_limit_total)
    ORDER BY priority DESC, discount_value DESC
  `;
  const promosResult = await queryFn.query(activePromosQuery);
  const activePromos = promosResult.rows;

  for (const promo of activePromos) {
    const appliesToPlan = promo.applies_to === 'all_plans' || 
      (promo.applies_to === 'specific_plans' && 
       promo.target_plan_ids && 
       promo.target_plan_ids.includes(planId));

    if (!appliesToPlan) continue;

    if (userId && promo.usage_limit_per_user) {
      const userUsage = await queryFn.query(
        `SELECT COUNT(*) FROM promotion_usage WHERE promotion_id = $1 AND user_id = $2`,
        [promo.id, userId]
      );
      if (parseInt(userUsage.rows[0].count) >= promo.usage_limit_per_user) {
        continue;
      }
    }

    return promo;
  }
  return null;
}

function calculateDiscountedPrice(planPrice, promo) {
  return promotionService.calculateDiscount(planPrice, promo);
}

async function generateInvoiceNumber(client) {
  const year = new Date().getFullYear();
  const lockId = 1000000 + year;
  
  await client.query(`SELECT pg_advisory_xact_lock($1)`, [lockId]);
  
  const result = await client.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 'INV-\\d{4}-(\\d+)') AS INTEGER)), 0) + 1 as next_num 
     FROM invoices WHERE invoice_number LIKE $1`,
    [`INV-${year}-%`]
  );
  const nextNum = result.rows[0].next_num;
  return `INV-${year}-${String(nextNum).padStart(6, '0')}`;
}

async function generateRefundInvoiceNumber(client) {
  const year = new Date().getFullYear();
  const lockId = 2000000 + year;
  
  await client.query(`SELECT pg_advisory_xact_lock($1)`, [lockId]);
  
  const result = await client.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(refund_invoice_number FROM 'RFD-\\d{4}-(\\d+)') AS INTEGER)), 0) + 1 as next_num 
     FROM refunds WHERE refund_invoice_number LIKE $1`,
    [`RFD-${year}-%`]
  );
  const nextNum = result.rows[0].next_num;
  return `RFD-${year}-${String(nextNum).padStart(6, '0')}`;
}

async function logBillingAudit(client, action, userId, details) {
  try {
    await client.query(`
      INSERT INTO billing_audit_log (action, user_id, details, created_at)
      VALUES ($1, $2, $3, NOW())
    `, [action, userId, JSON.stringify(details)]);
  } catch (err) {
    console.error('Billing audit log error:', err);
  }
}

async function checkIdempotencyKey(client, key) {
  const result = await client.query(`
    SELECT id, response_data, created_at 
    FROM payment_idempotency 
    WHERE idempotency_key = $1 
      AND created_at > NOW() - INTERVAL '${IDEMPOTENCY_EXPIRY_MINUTES} minutes'
  `, [key]);
  return result.rows[0] || null;
}

async function saveIdempotencyKey(client, key, userId, responseData) {
  await client.query(`
    INSERT INTO payment_idempotency (idempotency_key, user_id, response_data, created_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (idempotency_key) DO UPDATE SET response_data = $3, created_at = NOW()
  `, [key, userId, JSON.stringify(responseData)]);
}

router.get('/my-subscription', authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  const result = await db.query(`
    SELECT up.*, p.name_ar, p.name_en, p.price, p.duration_days, p.max_listings,
           p.max_photos_per_listing, p.max_videos_per_listing, p.show_on_map,
           p.ai_support_level, p.highlights_allowed, p.icon, p.logo, p.color, p.badge,
           p.sort_order
    FROM user_plans up
    JOIN plans p ON up.plan_id = p.id
    WHERE up.user_id = $1 AND up.status = 'active'
    ORDER BY up.created_at DESC
    LIMIT 1
  `, [userId]);

  if (result.rows.length === 0) {
    return res.json({ subscription: null });
  }

  res.json({ subscription: result.rows[0] });
}));

router.get('/available-upgrades', authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const countryCode = req.query.country || 'SA';
  const country = SUPPORTED_COUNTRIES[countryCode] || SUPPORTED_COUNTRIES.SA;
  
  const currentPlan = await db.query(`
    SELECT up.plan_id, p.sort_order, p.price
    FROM user_plans up
    JOIN plans p ON up.plan_id = p.id
    WHERE up.user_id = $1 AND up.status = 'active'
    ORDER BY up.created_at DESC
    LIMIT 1
  `, [userId]);

  const currentSortOrder = currentPlan.rows[0]?.sort_order ?? -1;
  
  const upgrades = await db.query(`
    SELECT p.id, p.name_ar, p.name_en, p.price, p.duration_days, p.max_listings, 
           p.max_photos_per_listing, p.max_videos_per_listing, p.show_on_map,
           p.ai_support_level, p.highlights_allowed, p.description, p.icon, p.logo, p.color, p.badge, p.sort_order,
           p.custom_icon, p.badge_enabled, p.badge_text, p.badge_position, p.badge_shape, 
           p.badge_bg_color, p.badge_text_color, p.badge_font_size, p.badge_bg_opacity,
           p.horizontal_badge_enabled, p.horizontal_badge_text, p.horizontal_badge_bg_color, p.horizontal_badge_text_color,
           p.header_bg_color, p.header_text_color, p.header_bg_opacity,
           p.body_bg_color, p.body_text_color, p.body_bg_opacity,
           p.features,
           cpp.price as local_price
    FROM plans p
    LEFT JOIN country_plan_prices cpp ON p.id = cpp.plan_id AND cpp.country_code = $2 AND cpp.is_active = true
    WHERE p.visible = true AND p.sort_order > $1
    ORDER BY p.sort_order ASC
  `, [currentSortOrder, countryCode]);

  const upgradesWithLocalPrice = await Promise.all(upgrades.rows.map(async (plan) => {
    const basePriceSAR = parseFloat(plan.price);
    const pricing = await getCountryPricing(plan.id, countryCode, basePriceSAR);
    
    return {
      ...plan,
      price: pricing.localPrice,
      currency: pricing.currency,
      currencySymbol: pricing.currencySymbol,
      isAutoConverted: pricing.isAutoConverted
    };
  }));

  const effectiveCountry = country;

  res.json({ 
    currentPlan: currentPlan.rows[0] || null,
    availableUpgrades: upgradesWithLocalPrice,
    country: {
      code: countryCode,
      currency_code: effectiveCountry.currency_code,
      currency_symbol: effectiveCountry.currency_symbol
    }
  });
}));

router.post('/initiate-upgrade', paymentLimiter, authMiddlewareWithEmailCheck, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { planId, countryCode = 'SA' } = req.body;
  const country = SUPPORTED_COUNTRIES[countryCode] || SUPPORTED_COUNTRIES.SA;

  if (!planId) {
    return res.status(400).json({ error: 'يرجى تحديد الباقة المطلوبة' });
  }

  const newPlan = await db.query(`
    SELECT p.*, cpp.price as local_price
    FROM plans p
    LEFT JOIN country_plan_prices cpp ON p.id = cpp.plan_id AND cpp.country_code = $2 AND cpp.is_active = true
    WHERE p.id = $1 AND p.visible = true
  `, [planId, countryCode]);
  
  if (newPlan.rows.length === 0) {
    return res.status(404).json({ error: 'الباقة غير موجودة' });
  }

  const currentPlan = await db.query(`
    SELECT up.*, p.name_ar as current_plan_name, p.price as current_price, p.sort_order
    FROM user_plans up
    JOIN plans p ON up.plan_id = p.id
    WHERE up.user_id = $1 AND up.status = 'active'
    ORDER BY up.created_at DESC
    LIMIT 1
  `, [userId]);

  const plan = newPlan.rows[0];
  const current = currentPlan.rows[0];

  if (current && plan.sort_order <= current.sort_order) {
    return res.status(400).json({ error: 'لا يمكن الترقية لباقة أقل أو مساوية' });
  }

  const basePriceSAR = parseFloat(plan.price);
  const pricing = await getCountryPricing(plan.id, countryCode, basePriceSAR);
  const basePrice = pricing.localPrice;
  const effectiveCurrency = { currency_code: pricing.currency, currency_symbol: pricing.currencySymbol };
  const promo = await getApplicablePromotion(plan.id, userId);
  const { discountedPrice, discountAmount, discountPercentage, skipPayment } = calculateDiscountedPrice(basePrice, promo);
  
  const isPricePendingReview = pricing.isAutoConverted && basePriceSAR > 0;
  
  const originalPrice = basePrice;
  const finalPrice = discountedPrice !== null ? discountedPrice : originalPrice;
  const total = finalPrice;

  let promoDurationDays = plan.duration_days;
  if (promo && promo.duration_value && promo.duration_unit) {
    if (promo.duration_unit === 'months') {
      promoDurationDays = promo.duration_value * 30;
    } else if (promo.duration_unit === 'days') {
      promoDurationDays = promo.duration_value;
    } else if (promo.duration_unit === 'years') {
      promoDurationDays = promo.duration_value * 365;
    }
  }

  res.json({
    upgrade: {
      currentPlan: current ? {
        id: current.plan_id,
        name: current.current_plan_name,
        price: current.current_price
      } : null,
      newPlan: {
        id: plan.id,
        name: plan.name_ar,
        price: finalPrice,
        original_price: discountedPrice !== null ? originalPrice : null,
        discounted_price: discountedPrice,
        discount_percentage: discountPercentage,
        duration_days: promoDurationDays,
        max_listings: plan.max_listings,
        max_photos_per_listing: plan.max_photos_per_listing,
        max_videos_per_listing: plan.max_videos_per_listing,
        show_on_map: plan.show_on_map,
        highlights_allowed: plan.highlights_allowed,
        icon: plan.icon,
        logo: plan.logo,
        color: plan.color,
        badge: plan.badge
      },
      pricing: {
        originalSubtotal: discountedPrice !== null ? originalPrice.toFixed(2) : null,
        discountAmount: discountAmount ? discountAmount.toFixed(2) : null,
        discountPercentage: discountPercentage,
        total: total.toFixed(2),
        currency: effectiveCurrency.currency_code,
        currencySymbol: effectiveCurrency.currency_symbol,
        skipPayment: skipPayment,
        isPendingReview: isPricePendingReview,
        pendingReviewMessage: isPricePendingReview ? 'أسعار هذه الدولة قيد المراجعة - لا يمكن إتمام الدفع حالياً' : null
      },
      appliedPromotion: promo ? {
        id: promo.id,
        name_ar: promo.name_ar,
        type: promo.promotion_type,
        duration_value: promo.duration_value,
        duration_unit: promo.duration_unit
      } : null
    }
  });
}));

router.post('/process-payment', paymentLimiter, authMiddlewareWithEmailCheck, asyncHandler(async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    const userId = req.user.id;
    const { planId, paymentMethod, idempotencyKey, countryCode = 'SA' } = req.body;
    const country = SUPPORTED_COUNTRIES[countryCode] || SUPPORTED_COUNTRIES.SA;

    if (!planId) {
      client.release();
      return res.status(400).json({ error: 'يرجى تحديد الباقة المطلوبة' });
    }

    const effectiveIdempotencyKey = idempotencyKey || `${userId}-${planId}-${Date.now()}`;
    
    await client.query('BEGIN');

    const existingPayment = await checkIdempotencyKey(client, effectiveIdempotencyKey);
    if (existingPayment) {
      await client.query('COMMIT');
      client.release();
      return res.json(JSON.parse(existingPayment.response_data));
    }

    const newPlan = await client.query(`
      SELECT p.*, cpp.price as local_price
      FROM plans p
      LEFT JOIN country_plan_prices cpp ON p.id = cpp.plan_id AND cpp.country_code = $2 AND cpp.is_active = true
      WHERE p.id = $1 FOR SHARE
    `, [planId, countryCode]);
    
    if (newPlan.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ error: 'الباقة غير موجودة' });
    }

    const plan = newPlan.rows[0];
    const basePriceSAR = parseFloat(plan.price);
    const pricing = await getCountryPricing(plan.id, countryCode, basePriceSAR, client);
    
    if (pricing.isAutoConverted && basePriceSAR > 0) {
      await client.query(`
        INSERT INTO notifications (user_id, title, body, type, channel, status, payload, created_at)
        SELECT id, 'طلب تسعير دولة جديدة', $1, 'admin_alert', 'in_app', 'pending', $2, NOW()
        FROM users WHERE role IN ('super_admin', 'financial_admin')
        ON CONFLICT DO NOTHING
      `, [
        `مستخدم يحاول شراء باقة "${plan.name_ar}" من ${countryCode} - يرجى إضافة سعر مخصص`,
        JSON.stringify({ planId: plan.id, countryCode, userId, basePriceSAR, convertedPrice: pricing.localPrice })
      ]);
      
      await client.query('COMMIT');
      client.release();
      return res.status(409).json({ 
        error: 'أسعار هذه الدولة قيد المراجعة',
        errorCode: 'PRICE_PENDING_REVIEW',
        message: 'تم إرسال طلب للإدارة لإضافة أسعار دولتك. يرجى المحاولة لاحقاً أو التواصل مع الدعم.',
        isAutoConverted: true,
        suggestedPrice: pricing.localPrice,
        currency: pricing.currency
      });
    }
    
    const basePrice = pricing.localPrice;
    const effectiveCurrency = { currency_code: pricing.currency, currency_symbol: pricing.currencySymbol };

    const currentPlanResult = await client.query(`
      SELECT up.id as user_plan_id, up.plan_id, p.name_ar, p.price, p.sort_order
      FROM user_plans up
      JOIN plans p ON up.plan_id = p.id
      WHERE up.user_id = $1 AND up.status = 'active'
      ORDER BY up.created_at DESC
      LIMIT 1
      FOR UPDATE
    `, [userId]);

    const previousPlan = currentPlanResult.rows[0];
    const previousPlanId = previousPlan?.plan_id || null;

    if (previousPlan && plan.sort_order <= previousPlan.sort_order) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({ error: 'لا يمكن الترقية لباقة أقل أو مساوية' });
    }

    const promo = await getApplicablePromotion(plan.id, userId, client);
    
    if (promo) {
      await client.query(
        `SELECT * FROM promotions WHERE id = $1 FOR UPDATE`,
        [promo.id]
      );
      
      const freshPromoCheck = await client.query(`
        SELECT current_usage, usage_limit_total FROM promotions WHERE id = $1
      `, [promo.id]);
      
      if (freshPromoCheck.rows[0]?.usage_limit_total && 
          freshPromoCheck.rows[0].current_usage >= freshPromoCheck.rows[0].usage_limit_total) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({ error: 'انتهت صلاحية العرض الترويجي' });
      }
    }

    const { discountedPrice, discountAmount, skipPayment } = calculateDiscountedPrice(basePrice, promo);
    
    const originalPrice = basePrice;
    const finalPrice = discountedPrice !== null ? discountedPrice : originalPrice;
    const total = Math.round(finalPrice * 100) / 100;

    const transactionId = `TXN-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    let durationDays = plan.duration_days || 30;
    if (promo && promo.duration_value && promo.duration_unit) {
      if (promo.duration_unit === 'months') {
        durationDays = promo.duration_value * 30;
      } else if (promo.duration_unit === 'days') {
        durationDays = promo.duration_value;
      } else if (promo.duration_unit === 'years') {
        durationDays = promo.duration_value * 365;
      }
    }

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + durationDays);

    let userPlanId;

    if (previousPlan?.user_plan_id) {
      const updateResult = await client.query(`
        UPDATE user_plans 
        SET plan_id = $1, 
            status = 'active',
            started_at = NOW(),
            expires_at = $2,
            paid_amount = $3,
            updated_at = NOW()
        WHERE id = $4
        RETURNING id
      `, [planId, endDate, total, previousPlan.user_plan_id]);
      userPlanId = updateResult.rows[0].id;
    } else {
      const insertResult = await client.query(`
        INSERT INTO user_plans (user_id, plan_id, status, started_at, expires_at, paid_amount, created_at, updated_at)
        VALUES ($1, $2, 'active', NOW(), $3, $4, NOW(), NOW())
        RETURNING id
      `, [userId, planId, endDate, total]);
      userPlanId = insertResult.rows[0].id;
    }

    const paymentResult = await client.query(`
      INSERT INTO payments (user_id, user_plan_id, plan_id, amount, subtotal, vat_amount, 
                           payment_method, transaction_id, status, previous_plan_id, description, currency, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'completed', $9, $10, $11, $12)
      RETURNING id
    `, [
      userId, 
      userPlanId, 
      planId, 
      total, 
      total, 
      0,
      paymentMethod || 'credit_card',
      transactionId,
      previousPlanId,
      `ترقية إلى باقة ${plan.name_ar}`,
      effectiveCurrency.currency_code,
      JSON.stringify({ 
        previousPlanName: previousPlan?.name_ar || null,
        promotionApplied: promo ? promo.id : null,
        discountAmount: discountAmount || 0,
        countryCode: countryCode
      })
    ]);

    const paymentId = paymentResult.rows[0].id;

    const invoiceNumber = await generateInvoiceNumber(client);
    
    const invoiceResult = await client.query(`
      INSERT INTO invoices (invoice_number, user_id, payment_id, plan_id, subtotal, vat_rate, vat_amount, total, currency, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'issued')
      RETURNING *
    `, [invoiceNumber, userId, paymentId, planId, total, 0, 0, total, effectiveCurrency.currency_code]);

    const invoice = invoiceResult.rows[0];

    await client.query(`
      INSERT INTO quota_buckets (user_id, plan_id, user_plan_id, source, total_slots, used_slots, expires_at, active)
      VALUES ($1, $2, $3, 'upgrade', $4, 0, $5, true)
    `, [userId, planId, userPlanId, plan.max_listings, endDate]);

    if (promo) {
      await client.query(`
        INSERT INTO promotion_usage (promotion_id, user_id, plan_id, user_plan_id, amount_original, amount_discounted, used_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [promo.id, userId, planId, userPlanId, originalPrice, finalPrice]);
      
      await client.query(`
        UPDATE promotions SET current_usage = current_usage + 1, updated_at = NOW() WHERE id = $1
      `, [promo.id]);
    }

    await logBillingAudit(client, 'PAYMENT_COMPLETED', userId, {
      paymentId,
      invoiceNumber,
      transactionId,
      planId,
      previousPlanId,
      amount: total,
      promotionId: promo?.id || null,
      discountAmount: discountAmount || 0
    });

    const userResult = await client.query(`SELECT name, email FROM users WHERE id = $1`, [userId]);
    const user = userResult.rows[0];

    await client.query(`
      INSERT INTO notifications (user_id, title, body, type, link, channel, status, payload, scheduled_at)
      VALUES ($1, $2, $3, 'payment', $4, 'app', 'pending', $5, NOW())
    `, [
      userId,
      'تمت الترقية بنجاح! 🎉',
      `تم ترقية اشتراكك إلى باقة ${plan.name_ar}. رقم الفاتورة: ${invoiceNumber}`,
      `/invoices/${invoice.id}`,
      JSON.stringify({ invoiceId: invoice.id, planId: planId, type: 'upgrade' })
    ]);

    const responseData = {
      success: true,
      message: 'تمت الترقية بنجاح!',
      payment: {
        id: paymentId,
        transactionId,
        amount: total.toFixed(2),
        status: 'completed'
      },
      invoice: {
        id: invoice.id,
        number: invoiceNumber,
        total: total.toFixed(2),
        currency: effectiveCurrency.currency_code,
        currencySymbol: effectiveCurrency.currency_symbol
      },
      newPlan: {
        id: plan.id,
        name: plan.name_ar,
        endDate: endDate.toISOString()
      },
      currency: effectiveCurrency.currency_code,
      currencySymbol: effectiveCurrency.currency_symbol,
      emailSent: true,
      emailTo: user.email,
      promotionApplied: promo ? {
        id: promo.id,
        name: promo.name_ar,
        discountAmount: discountAmount?.toFixed(2) || '0.00'
      } : null
    };

    await saveIdempotencyKey(client, effectiveIdempotencyKey, userId, responseData);

    await client.query('COMMIT');

    const currencyDisplay = `${effectiveCurrency.currency_symbol} (${effectiveCurrency.currency_code})`;
    const emailLog = {
      to: user.email,
      subject: `فاتورة اشتراك - ${invoiceNumber}`,
      body: `
        مرحباً ${user.name}،
        
        تم ترقية اشتراكك بنجاح إلى باقة "${plan.name_ar}".
        
        تفاصيل الفاتورة:
        - رقم الفاتورة: ${invoiceNumber}
        - الإجمالي: ${total.toFixed(2)} ${currencyDisplay}
        ${promo ? `- الخصم المطبق: ${discountAmount?.toFixed(2)} ${currencyDisplay} (${promo.name_ar})` : ''}
        
        رقم العملية: ${transactionId}
        
        شكراً لاختياركم بيت الجزيرة!
      `,
      sentAt: new Date().toISOString()
    };

    const emailLogPath = path.join(__dirname, '../../public/emails');
    if (!fs.existsSync(emailLogPath)) {
      fs.mkdirSync(emailLogPath, { recursive: true });
    }
    fs.writeFileSync(
      path.join(emailLogPath, `${invoiceNumber}.json`),
      JSON.stringify(emailLog, null, 2)
    );

    await db.query(`UPDATE invoices SET email_sent_at = NOW() WHERE id = $1`, [invoice.id]);

    client.release();
    res.json(responseData);
  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    throw error;
  }
}));

router.get('/invoices', authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const result = await db.query(`
    SELECT i.*, p.name_ar as plan_name, u.name as user_name, u.email as user_email
    FROM invoices i
    LEFT JOIN plans p ON i.plan_id = p.id
    LEFT JOIN users u ON i.user_id = u.id
    WHERE i.user_id = $1
    ORDER BY i.created_at DESC
  `, [userId]);

  res.json({ invoices: result.rows });
}));

router.get('/invoices/:id', authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  if (isNaN(parseInt(id))) {
    return res.status(400).json({ error: 'معرف الفاتورة غير صالح' });
  }

  const result = await db.query(`
    SELECT i.*, p.name_ar as plan_name, p.name_en as plan_name_en, p.duration_days,
           u.name as user_name, u.email as user_email, u.phone as user_phone,
           pay.transaction_id, pay.payment_method,
           prev_plan.name_ar as previous_plan_name,
           CASE WHEN pay.previous_plan_id IS NOT NULL THEN 'upgrade' ELSE 'subscription' END as invoice_type
    FROM invoices i
    LEFT JOIN plans p ON i.plan_id = p.id
    LEFT JOIN users u ON i.user_id = u.id
    LEFT JOIN payments pay ON i.payment_id = pay.id
    LEFT JOIN plans prev_plan ON pay.previous_plan_id = prev_plan.id
    WHERE i.id = $1 AND i.user_id = $2
  `, [id, userId]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'الفاتورة غير موجودة' });
  }

  res.json({ invoice: result.rows[0] });
}));

router.get('/history', authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const result = await db.query(`
    SELECT pay.*, p.name_ar as plan_name, prev.name_ar as previous_plan_name
    FROM payments pay
    LEFT JOIN plans p ON pay.plan_id = p.id
    LEFT JOIN plans prev ON pay.previous_plan_id = prev.id
    WHERE pay.user_id = $1
    ORDER BY pay.created_at DESC
  `, [userId]);

  res.json({ payments: result.rows });
}));

router.get('/refund-invoices/:id', authMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  if (isNaN(parseInt(id))) {
    return res.status(400).json({ error: 'معرف الاسترداد غير صالح' });
  }
  
  const result = await db.query(`
    SELECT r.*, 
           u.name as user_name, u.email as user_email, u.phone as user_phone,
           i.invoice_number as original_invoice_number,
           p.name_ar as plan_name, p.name_en as plan_name_en, p.duration_days
    FROM refunds r
    JOIN users u ON r.user_id = u.id
    LEFT JOIN invoices i ON i.id = r.invoice_id
    LEFT JOIN plans p ON p.id = i.plan_id
    WHERE r.id = $1 AND r.user_id = $2 AND r.refund_invoice_number IS NOT NULL
  `, [id, userId]);
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'فاتورة الاسترداد غير موجودة' });
  }
  
  res.json({ refund: result.rows[0] });
}));

module.exports = router;
module.exports.generateRefundInvoiceNumber = generateRefundInvoiceNumber;
