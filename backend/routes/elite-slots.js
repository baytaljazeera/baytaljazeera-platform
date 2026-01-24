const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');
const path = require('path');
const fs = require('fs');

const HOLD_DURATION_MINUTES = 15;
const BUSINESS_SUPPORT_LEVEL = 3;
const EXTENSION_PRICE_PER_DAY = 30.00;

async function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  const lockId = 1000000 + year;
  
  const client = await db.connect();
  
  try {
    await client.query(`SELECT pg_advisory_lock($1)`, [lockId]);
    
    const result = await client.query(
      `SELECT COUNT(*) as count FROM invoices WHERE EXTRACT(YEAR FROM created_at) = $1`,
      [year]
    );
    const count = parseInt(result.rows[0].count) + 1;
    return `INV-${year}-${String(count).padStart(6, '0')}`;
  } finally {
    await client.query(`SELECT pg_advisory_unlock($1)`, [lockId]);
    client.release();
  }
}

async function checkBusinessPlan(userId) {
  const result = await db.query(`
    SELECT p.support_level, p.name_ar
    FROM user_plans up
    JOIN plans p ON up.plan_id = p.id
    WHERE up.user_id = $1 AND up.status = 'active'
      AND (up.expires_at IS NULL OR up.expires_at > NOW())
    ORDER BY p.support_level DESC
    LIMIT 1
  `, [userId]);
  
  if (result.rows.length === 0) return { allowed: false, plan: null };
  
  const plan = result.rows[0];
  return {
    allowed: plan.support_level >= BUSINESS_SUPPORT_LEVEL,
    plan: plan.name_ar,
    supportLevel: plan.support_level
  };
}

router.get('/check-eligibility', authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const eligibility = await checkBusinessPlan(userId);
  res.json(eligibility);
}));

router.get('/pending-count', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT COUNT(*) as count FROM elite_slot_reservations 
    WHERE status = 'pending_approval'
  `);
  res.json({ count: parseInt(result.rows[0].count) || 0 });
}));

router.get('/current-period', asyncHandler(async (req, res) => {
  let period = await db.query(`
    SELECT * FROM elite_slot_periods 
    WHERE status = 'active' AND ends_at > NOW()
    ORDER BY starts_at ASC
    LIMIT 1
  `);

  if (period.rows.length === 0) {
    const newPeriod = await db.query(`
      INSERT INTO elite_slot_periods (starts_at, ends_at, status)
      VALUES (NOW(), NOW() + INTERVAL '7 days', 'active')
      RETURNING *
    `);
    period = { rows: newPeriod.rows };
  }

  res.json({ period: period.rows[0] });
}));

router.get('/availability', asyncHandler(async (req, res) => {
  const periodResult = await db.query(`
    SELECT id FROM elite_slot_periods 
    WHERE status = 'active' AND ends_at > NOW()
    ORDER BY starts_at ASC LIMIT 1
  `);

  if (periodResult.rows.length === 0) {
    return res.json({ slots: [], period: null });
  }

  const periodId = periodResult.rows[0].id;

  await db.query(`
    UPDATE elite_slot_reservations 
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'held' AND hold_expires_at < NOW()
  `);

  const slots = await db.query(`
    SELECT 
      es.id,
      es.row_num,
      es.col_num,
      es.tier,
      es.base_price,
      es.display_order,
      CASE 
        WHEN esr.id IS NOT NULL AND esr.status IN ('held', 'confirmed', 'pending_approval') THEN 'booked'
        ELSE 'available'
      END as status,
      CASE 
        WHEN esr.status = 'held' THEN esr.hold_expires_at
        ELSE NULL
      END as hold_expires_at,
      CASE 
        WHEN esr.status = 'confirmed' THEN json_build_object(
          'id', p.id,
          'title', p.title,
          'cover_image', p.cover_image,
          'city', p.city,
          'price', p.price
        )
        WHEN esr.status = 'pending_approval' THEN json_build_object(
          'id', p.id,
          'title', p.title,
          'pending', true
        )
        ELSE NULL
      END as property
    FROM elite_slots es
    LEFT JOIN elite_slot_reservations esr ON es.id = esr.slot_id 
      AND esr.period_id = $1 
      AND esr.status IN ('held', 'confirmed', 'pending_approval')
    LEFT JOIN properties p ON esr.property_id = p.id
    WHERE es.is_active = true
    ORDER BY es.display_order
  `, [periodId]);

  res.json({ 
    slots: slots.rows,
    period: periodResult.rows[0]
  });
}));

router.get('/my-properties', authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const businessCheck = await checkBusinessPlan(userId);
  if (!businessCheck.allowed) {
    return res.status(403).json({ 
      error: 'هذه الميزة متاحة فقط لمشتركي باقة رجال الأعمال أو أعلى',
      currentPlan: businessCheck.plan
    });
  }

  const properties = await db.query(`
    SELECT id, title, cover_image, city, district, price, type, status
    FROM properties
    WHERE user_id = $1 AND status = 'approved'
    ORDER BY created_at DESC
  `, [userId]);

  res.json({ properties: properties.rows });
}));

router.post('/hold', authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { slotId, propertyId } = req.body;

  console.log(`[ELITE-HOLD] Received request - slotId: ${slotId}, propertyId: ${propertyId}, userId: ${userId}`);

  if (!slotId || !propertyId) {
    return res.status(400).json({ error: 'يرجى تحديد الموقع والعقار' });
  }

  const businessCheck = await checkBusinessPlan(userId);
  if (!businessCheck.allowed) {
    return res.status(403).json({ 
      error: 'هذه الميزة متاحة فقط لمشتركي باقة رجال الأعمال أو أعلى'
    });
  }

  const propertyCheck = await db.query(
    `SELECT id, status FROM properties WHERE id = $1 AND user_id = $2 AND status IN ('approved', 'pending')`,
    [propertyId, userId]
  );
  if (propertyCheck.rows.length === 0) {
    return res.status(400).json({ error: 'العقار غير موجود أو مرفوض' });
  }
  const propertyStatus = propertyCheck.rows[0].status;

  const periodResult = await db.query(`
    SELECT id FROM elite_slot_periods 
    WHERE status = 'active' AND ends_at > NOW()
    ORDER BY starts_at ASC LIMIT 1
  `);
  if (periodResult.rows.length === 0) {
    return res.status(400).json({ error: 'لا توجد فترة نشطة حالياً' });
  }
  const periodId = periodResult.rows[0].id;

  await db.query(`
    UPDATE elite_slot_reservations 
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'held' AND hold_expires_at < NOW()
  `);

  const slotCheck = await db.query(`
    SELECT esr.id FROM elite_slot_reservations esr
    WHERE esr.slot_id = $1 AND esr.period_id = $2 AND esr.status IN ('held', 'confirmed')
  `, [slotId, periodId]);
  
  if (slotCheck.rows.length > 0) {
    return res.status(400).json({ error: 'هذا الموقع محجوز بالفعل' });
  }

  await db.query(`
    DELETE FROM elite_slot_reservations
    WHERE user_id = $1 AND period_id = $2 AND status = 'held'
  `, [userId, periodId]);

  const slotInfo = await db.query(`SELECT * FROM elite_slots WHERE id = $1`, [slotId]);
  if (slotInfo.rows.length === 0) {
    return res.status(404).json({ error: 'الموقع غير موجود' });
  }

  const slot = slotInfo.rows[0];
  const priceAmount = parseFloat(slot.base_price);
  const totalAmount = priceAmount;

  const holdExpiresAt = new Date();
  holdExpiresAt.setMinutes(holdExpiresAt.getMinutes() + HOLD_DURATION_MINUTES);

  const reservation = await db.query(`
    INSERT INTO elite_slot_reservations 
      (slot_id, period_id, property_id, user_id, status, price_amount, vat_amount, total_amount, hold_expires_at)
    VALUES ($1, $2, $3, $4, 'held', $5, $6, $7, $8)
    RETURNING *
  `, [slotId, periodId, propertyId, userId, priceAmount, 0, totalAmount, holdExpiresAt]);

  res.json({
    success: true,
    reservation: reservation.rows[0],
    slot: slot,
    propertyStatus: propertyStatus,
    pricing: {
      total: totalAmount.toFixed(2),
      currency: 'SAR'
    },
    holdExpiresAt: holdExpiresAt,
    message: propertyStatus === 'pending' 
      ? 'تم حجز الموقع مؤقتاً - يتطلب موافقة مالية وإعلانية'
      : `تم حجز الموقع مؤقتاً لمدة ${HOLD_DURATION_MINUTES} دقيقة`
  });
}));

router.post('/reserve-with-listing', authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { slotId, propertyId, paymentMethod, cardNumber, cardExpiry, cardCvv, isPreliminary } = req.body;

  if (!slotId) {
    return res.status(400).json({ error: 'يرجى تحديد الموقع' });
  }

  const businessCheck = await checkBusinessPlan(userId);
  if (!businessCheck.allowed) {
    return res.status(403).json({ 
      error: 'هذه الميزة متاحة فقط لمشتركي باقة رجال الأعمال أو أعلى'
    });
  }

  const periodResult = await db.query(`
    SELECT id FROM elite_slot_periods 
    WHERE status = 'active' AND ends_at > NOW()
    ORDER BY starts_at ASC LIMIT 1
  `);
  if (periodResult.rows.length === 0) {
    return res.status(400).json({ error: 'لا توجد فترة نشطة حالياً' });
  }
  const periodId = periodResult.rows[0].id;

  let propertyStatus = null;
  if (propertyId) {
    const propertyCheck = await db.query(
      `SELECT id, status FROM properties WHERE id = $1 AND user_id = $2`,
      [propertyId, userId]
    );
    if (propertyCheck.rows.length === 0) {
      return res.status(400).json({ error: 'الإعلان غير موجود أو لا تملكه' });
    }
    propertyStatus = propertyCheck.rows[0].status;

    await db.query(`
      DELETE FROM elite_slot_reservations 
      WHERE property_id = $1 AND user_id = $2 AND status IN ('held', 'pending_approval')
    `, [propertyId, userId]);
  }

  const slotCheck = await db.query(`
    SELECT es.*, 
      CASE WHEN esr.id IS NOT NULL THEN true ELSE false END as is_booked
    FROM elite_slots es
    LEFT JOIN elite_slot_reservations esr ON es.id = esr.slot_id 
      AND esr.period_id = $1 
      AND esr.status IN ('held', 'confirmed', 'pending_approval')
    WHERE es.id = $2
  `, [periodId, slotId]);

  if (slotCheck.rows.length === 0) {
    return res.status(404).json({ error: 'الموقع غير موجود' });
  }

  const slot = slotCheck.rows[0];
  if (slot.is_booked) {
    return res.status(400).json({ error: 'هذا الموقع محجوز مسبقاً' });
  }

  const priceAmount = parseFloat(slot.base_price);
  const vatAmount = 0;
  const totalAmount = priceAmount;

  if (isPreliminary && propertyStatus === 'pending') {
    const reservationResult = await db.query(`
      INSERT INTO elite_slot_reservations 
        (slot_id, period_id, property_id, user_id, status, price_amount, vat_amount, total_amount)
      VALUES ($1, $2, $3, $4, 'pending_approval', $5, $6, $7)
      RETURNING *
    `, [slotId, periodId, propertyId, userId, priceAmount, vatAmount, totalAmount]);
    
    const reservation = reservationResult.rows[0];

    await db.query(`
      INSERT INTO notifications (user_id, title, body, type, link, channel, status, payload, scheduled_at)
      VALUES ($1, 'حجز أولي في نخبة العقارات', 'تم تسجيل حجزك الأولي وينتظر موافقة إدارة المالية وإدارة الإعلانات', 'elite_slot', '/my-listings', 'app', 'pending', $2, NOW())
    `, [userId, JSON.stringify({ reservationId: reservation.id, propertyId })]);

    await db.query(`
      INSERT INTO notifications (user_id, title, body, type, link, channel, status, payload, scheduled_at)
      SELECT id, 'طلب حجز نخبة جديد', 'يوجد طلب حجز موقع نخبة جديد يحتاج موافقة مالية', 'admin_elite_finance', '/admin/elite-slots', 'app', 'pending', $1, NOW()
      FROM users WHERE role IN ('admin', 'super_admin', 'finance_admin')
    `, [JSON.stringify({ reservationId: reservation.id, propertyId, userId })]);

    await db.query(`
      INSERT INTO notifications (user_id, title, body, type, link, channel, status, payload, scheduled_at)
      SELECT id, 'طلب حجز نخبة جديد', 'يوجد طلب حجز موقع نخبة مرتبط بإعلان معلق يحتاج مراجعة', 'admin_elite_content', '/admin/listings', 'app', 'pending', $1, NOW()
      FROM users WHERE role IN ('admin', 'super_admin', 'content_admin')
    `, [JSON.stringify({ reservationId: reservation.id, propertyId, userId })]);

    return res.json({
      success: true,
      isPreliminary: true,
      reservationId: reservation.id,
      reservation: reservation,
      pricing: {
        subtotal: priceAmount.toFixed(2),
        vatAmount: vatAmount.toFixed(2),
        total: totalAmount.toFixed(2),
        currency: 'SAR'
      },
      message: 'تم الحجز الأولي بنجاح - ينتظر الموافقة المزدوجة'
    });
  }

  const transactionId = `TXN-ELITE-PENDING-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  const paymentResult = await db.query(`
    INSERT INTO payments (user_id, amount, subtotal, vat_amount, payment_method, transaction_id, status, description, currency, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7, 'SAR', $8)
    RETURNING id
  `, [
    userId,
    totalAmount,
    priceAmount,
    vatAmount,
    paymentMethod || 'credit_card',
    transactionId,
    `حجز موقع نخبة العقارات (معلق للموافقة)`,
    JSON.stringify({
      type: 'elite_slot_pending',
      slotId: slot.id,
      tier: slot.tier,
      position: `${slot.row_num}-${slot.col_num}`,
      cardLast4: cardNumber ? cardNumber.slice(-4) : null
    })
  ]);

  const paymentId = paymentResult.rows[0].id;

  const invoiceNumber = await generateInvoiceNumber();
  
  const invoiceResult = await db.query(`
    INSERT INTO invoices (invoice_number, user_id, payment_id, subtotal, vat_rate, vat_amount, total, currency, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'SAR', 'issued')
    RETURNING *
  `, [invoiceNumber, userId, paymentId, priceAmount, 0, vatAmount, totalAmount]);

  const invoice = invoiceResult.rows[0];

  let reservation = null;
  if (propertyId) {
    const reservationResult = await db.query(`
      INSERT INTO elite_slot_reservations 
        (slot_id, period_id, property_id, user_id, status, price_amount, vat_amount, total_amount, payment_id, invoice_id)
      VALUES ($1, $2, $3, $4, 'pending_approval', $5, $6, $7, $8, $9)
      RETURNING *
    `, [slotId, periodId, propertyId, userId, priceAmount, vatAmount, totalAmount, paymentId, invoice.id]);
    
    reservation = reservationResult.rows[0];

    await db.query(`
      INSERT INTO notifications (user_id, title, body, type, link, channel, status, payload, scheduled_at)
      VALUES ($1, 'حجز موقع نخبة العقارات', 'تم حجز موقعك في نخبة العقارات وسيتم تفعيله عند الموافقة على إعلانك', 'elite_slot', '/my-listings', 'app', 'pending', $2, NOW())
    `, [userId, JSON.stringify({ reservationId: reservation.id, propertyId })]);
  }

  res.json({
    success: true,
    paymentId: paymentId,
    invoiceId: invoice.id,
    invoiceNumber: invoiceNumber,
    slotId: slotId,
    periodId: periodId,
    reservationId: reservation?.id,
    reservation: reservation,
    pricing: {
      subtotal: priceAmount.toFixed(2),
      vatAmount: vatAmount.toFixed(2),
      total: totalAmount.toFixed(2),
      currency: 'SAR'
    },
    message: propertyId 
      ? 'تم الدفع بنجاح! سيتم تفعيل الموقع بعد الموافقة على إعلانك'
      : 'تم الدفع بنجاح! سيتم تفعيل الموقع بعد الموافقة على إعلانك'
  });
}));

router.post('/complete-reservation', authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { propertyId, slotId, periodId, paymentId, invoiceId } = req.body;

  if (!propertyId || !slotId || !periodId || !paymentId) {
    return res.status(400).json({ error: 'بيانات ناقصة' });
  }

  const propertyCheck = await db.query(
    `SELECT id, status FROM properties WHERE id = $1 AND user_id = $2`,
    [propertyId, userId]
  );
  if (propertyCheck.rows.length === 0) {
    return res.status(400).json({ error: 'الإعلان غير موجود' });
  }

  const slotResult = await db.query(`SELECT * FROM elite_slots WHERE id = $1`, [slotId]);
  if (slotResult.rows.length === 0) {
    return res.status(400).json({ error: 'الموقع غير موجود' });
  }
  const slot = slotResult.rows[0];

  const priceAmount = parseFloat(slot.base_price);
  const vatAmount = 0;
  const totalAmount = priceAmount;

  const reservation = await db.query(`
    INSERT INTO elite_slot_reservations 
      (slot_id, period_id, property_id, user_id, status, price_amount, vat_amount, total_amount, payment_id, invoice_id)
    VALUES ($1, $2, $3, $4, 'pending_approval', $5, $6, $7, $8, $9)
    RETURNING *
  `, [slotId, periodId, propertyId, userId, priceAmount, vatAmount, totalAmount, paymentId, invoiceId]);

  await db.query(`
    INSERT INTO notifications (user_id, title, body, type, link, channel, status, payload, scheduled_at)
    VALUES ($1, $2, $3, 'info', $4, 'app', 'pending', $5, NOW())
  `, [
    userId,
    'تم حجز موقع النخبة مؤقتاً 📍',
    'سيتم تفعيل إعلانك في قسم نخبة العقارات فور الموافقة عليه من الإدارة',
    '/my-listings',
    JSON.stringify({ slotId, propertyId, reservationId: reservation.rows[0].id })
  ]);

  res.json({
    success: true,
    reservation: reservation.rows[0],
    message: 'تم الحجز بنجاح! سيتم تفعيله بعد الموافقة على إعلانك'
  });
}));

router.post('/confirm-payment', authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { reservationId, paymentMethod, cardNumber, cardExpiry, cardCvv } = req.body;

  if (!reservationId) {
    return res.status(400).json({ error: 'يرجى تحديد الحجز' });
  }

  const reservationResult = await db.query(`
    SELECT esr.*, es.tier, es.row_num, es.col_num, p.title as property_title
    FROM elite_slot_reservations esr
    JOIN elite_slots es ON esr.slot_id = es.id
    JOIN properties p ON esr.property_id = p.id
    WHERE esr.id = $1 AND esr.user_id = $2 AND esr.status = 'held'
  `, [reservationId, userId]);

  if (reservationResult.rows.length === 0) {
    return res.status(404).json({ error: 'الحجز غير موجود أو منتهي الصلاحية' });
  }

  const reservation = reservationResult.rows[0];

  if (new Date(reservation.hold_expires_at) < new Date()) {
    await db.query(`
      UPDATE elite_slot_reservations SET status = 'expired', updated_at = NOW()
      WHERE id = $1
    `, [reservationId]);
    return res.status(400).json({ error: 'انتهت مهلة الحجز المؤقت' });
  }

  const transactionId = `TXN-ELITE-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  const paymentResult = await db.query(`
    INSERT INTO payments (user_id, amount, subtotal, vat_amount, payment_method, transaction_id, status, description, currency, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7, 'SAR', $8)
    RETURNING id
  `, [
    userId,
    reservation.total_amount,
    reservation.price_amount,
    reservation.vat_amount,
    paymentMethod || 'credit_card',
    transactionId,
    `حجز موقع نخبة العقارات - ${reservation.property_title}`,
    JSON.stringify({
      type: 'elite_slot',
      slotId: reservation.slot_id,
      tier: reservation.tier,
      position: `${reservation.row_num}-${reservation.col_num}`,
      cardLast4: cardNumber ? cardNumber.slice(-4) : null
    })
  ]);

  const paymentId = paymentResult.rows[0].id;

  const invoiceNumber = await generateInvoiceNumber();
  
  const invoiceResult = await db.query(`
    INSERT INTO invoices (invoice_number, user_id, payment_id, subtotal, vat_rate, vat_amount, total, currency, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'SAR', 'issued')
    RETURNING *
  `, [invoiceNumber, userId, paymentId, reservation.price_amount, 0, reservation.vat_amount, reservation.total_amount]);

  const invoice = invoiceResult.rows[0];

  await db.query(`
    UPDATE elite_slot_reservations 
    SET status = 'confirmed', 
        payment_id = $1, 
        invoice_id = $2, 
        confirmed_at = NOW(),
        hold_expires_at = NULL,
        updated_at = NOW()
    WHERE id = $3
  `, [paymentId, invoice.id, reservationId]);

  const userResult = await db.query(`SELECT name, email FROM users WHERE id = $1`, [userId]);
  const user = userResult.rows[0];

  await db.query(`
    INSERT INTO notifications (user_id, title, body, type, link, channel, status, payload, scheduled_at)
    VALUES ($1, $2, $3, 'payment', $4, 'app', 'pending', $5, NOW())
  `, [
    userId,
    'تم تأكيد حجز موقع النخبة! 🌟',
    `تم تأكيد حجز عقارك "${reservation.property_title}" في قسم نخبة العقارات. رقم الفاتورة: ${invoiceNumber}`,
    `/invoices/${invoice.id}`,
    JSON.stringify({ invoiceId: invoice.id, reservationId: reservationId, type: 'elite_slot' })
  ]);

  const tierNames = { top: 'العلوي', middle: 'الأوسط', bottom: 'السفلي' };
  const emailLog = {
    to: user.email,
    subject: `فاتورة حجز نخبة العقارات - ${invoiceNumber}`,
    body: `
      مرحباً ${user.name}،
      
      تم تأكيد حجز عقارك في قسم نخبة العقارات بنجاح!
      
      تفاصيل الحجز:
      - العقار: ${reservation.property_title}
      - الموقع: الصف ${tierNames[reservation.tier]} (${reservation.row_num}-${reservation.col_num})
      
      تفاصيل الفاتورة:
      - رقم الفاتورة: ${invoiceNumber}
      - المبلغ قبل الضريبة: ${parseFloat(reservation.price_amount).toFixed(2)} ريال
      - ضريبة القيمة المضافة (15%): ${parseFloat(reservation.vat_amount).toFixed(2)} ريال
      - الإجمالي: ${parseFloat(reservation.total_amount).toFixed(2)} ريال
      
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

  res.json({
    success: true,
    message: 'تم تأكيد الحجز ومعالجة الدفع بنجاح',
    invoice: {
      id: invoice.id,
      number: invoiceNumber,
      total: reservation.total_amount
    },
    transactionId: transactionId
  });
}));

router.post('/cancel', authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { reservationId, reason } = req.body;

  const result = await db.query(`
    UPDATE elite_slot_reservations 
    SET status = 'cancelled', 
        cancellation_reason = $1,
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE id = $2 AND user_id = $3 AND status = 'held'
    RETURNING *
  `, [reason || 'إلغاء بواسطة المستخدم', reservationId, userId]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'الحجز غير موجود أو لا يمكن إلغاؤه' });
  }

  res.json({ success: true, message: 'تم إلغاء الحجز بنجاح' });
}));

router.post('/waitlist/join', authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { propertyId, tierPreference, slotId } = req.body;

  const businessCheck = await checkBusinessPlan(userId);
  if (!businessCheck.allowed) {
    return res.status(403).json({ error: 'هذه الميزة متاحة فقط لمشتركي باقة رجال الأعمال أو أعلى' });
  }

  const periodResult = await db.query(`
    SELECT id FROM elite_slot_periods 
    WHERE status = 'active' AND ends_at > NOW()
    ORDER BY starts_at ASC LIMIT 1
  `);
  if (periodResult.rows.length === 0) {
    return res.status(400).json({ error: 'لا توجد فترة نشطة حالياً' });
  }
  const periodId = periodResult.rows[0].id;

  const existing = await db.query(`
    SELECT id FROM elite_slot_waitlist
    WHERE user_id = $1 AND period_id = $2 AND status = 'waiting'
  `, [userId, periodId]);

  if (existing.rows.length > 0) {
    return res.status(400).json({ error: 'أنت مسجل بالفعل في قائمة الانتظار' });
  }

  const waitlist = await db.query(`
    INSERT INTO elite_slot_waitlist (slot_id, period_id, user_id, property_id, tier_preference, status)
    VALUES ($1, $2, $3, $4, $5, 'waiting')
    RETURNING *
  `, [slotId || null, periodId, userId, propertyId, tierPreference || 'any']);

  res.json({
    success: true,
    waitlist: waitlist.rows[0],
    message: 'تمت إضافتك إلى قائمة الانتظار بنجاح'
  });
}));

router.post('/rotate-period', asyncHandler(async (req, res) => {
  const currentPeriod = await db.query(`
    SELECT * FROM elite_slot_periods 
    WHERE status = 'active' AND ends_at < NOW()
    ORDER BY ends_at DESC LIMIT 1
  `);

  if (currentPeriod.rows.length === 0) {
    return res.json({ message: 'لا توجد فترة منتهية للتدوير', rotated: false });
  }

  const expiredPeriod = currentPeriod.rows[0];

  await db.query(`
    UPDATE elite_slot_periods SET status = 'ended' WHERE id = $1
  `, [expiredPeriod.id]);

  await db.query(`
    UPDATE elite_slot_reservations 
    SET status = 'expired', updated_at = NOW()
    WHERE period_id = $1 AND status = 'confirmed'
  `, [expiredPeriod.id]);

  const newPeriod = await db.query(`
    INSERT INTO elite_slot_periods (starts_at, ends_at, status)
    VALUES (NOW(), NOW() + INTERVAL '7 days', 'active')
    RETURNING *
  `);

  const waitlistUsers = await db.query(`
    SELECT DISTINCT user_id FROM elite_slot_waitlist
    WHERE period_id = $1 AND status = 'waiting'
  `, [expiredPeriod.id]);

  for (const user of waitlistUsers.rows) {
    await db.query(`
      INSERT INTO notifications (user_id, title, body, type, link, channel, status, scheduled_at)
      VALUES ($1, 'فترة جديدة متاحة للحجز! 🌟', 'فترة جديدة لنخبة العقارات متاحة الآن. سارع بالحجز!', 'promo', '/elite-booking', 'app', 'pending', NOW())
    `, [user.user_id]);
  }

  await db.query(`
    UPDATE elite_slot_waitlist 
    SET status = 'notified', notified_at = NOW()
    WHERE period_id = $1 AND status = 'waiting'
  `, [expiredPeriod.id]);

  res.json({
    success: true,
    message: 'تم تدوير الفترة بنجاح',
    rotated: true,
    expiredPeriodId: expiredPeriod.id,
    newPeriod: newPeriod.rows[0],
    notifiedUsers: waitlistUsers.rows.length
  });
}));

router.get('/admin/stats', authMiddleware, asyncHandler(async (req, res) => {
  const periodResult = await db.query(`
    SELECT * FROM elite_slot_periods 
    WHERE status = 'active' AND ends_at > NOW()
    ORDER BY starts_at ASC LIMIT 1
  `);

  const period = periodResult.rows[0] || null;

  const stats = await db.query(`
    SELECT 
      COUNT(CASE WHEN esr.status = 'confirmed' THEN 1 END) as booked_slots,
      COUNT(CASE WHEN esr.status = 'held' THEN 1 END) as held_slots,
      COUNT(CASE WHEN esr.status = 'pending_approval' THEN 1 END) as pending_slots,
      COALESCE(SUM(CASE WHEN esr.status = 'confirmed' THEN esr.total_amount ELSE 0 END), 0) as total_revenue,
      (SELECT COUNT(*) FROM elite_slot_waitlist WHERE period_id = $1 AND status = 'waiting') as waitlist_count
    FROM elite_slots es
    LEFT JOIN elite_slot_reservations esr ON es.id = esr.slot_id 
      AND esr.period_id = $1 
      AND esr.status IN ('held', 'confirmed', 'pending_approval')
    WHERE es.is_active = true
  `, [period?.id || 0]);

  const reservations = await db.query(`
    SELECT 
      esr.*,
      es.tier, es.row_num, es.col_num,
      p.id as property_id, p.title as property_title, p.cover_image as property_image,
      u.name as user_name, u.email as user_email,
      esp.ends_at as period_ends_at
    FROM elite_slot_reservations esr
    JOIN elite_slots es ON esr.slot_id = es.id
    JOIN properties p ON esr.property_id = p.id
    JOIN users u ON esr.user_id = u.id
    LEFT JOIN elite_slot_periods esp ON esr.period_id = esp.id
    WHERE esr.period_id = $1 AND esr.status IN ('held', 'confirmed', 'pending_approval')
    ORDER BY esr.created_at DESC
  `, [period?.id || 0]);

  res.json({
    period,
    stats: stats.rows[0],
    reservations: reservations.rows
  });
}));

router.get('/admin/reservations', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { status } = req.query;
  
  let whereClause = 'WHERE 1=1';
  const params = [];
  
  if (status && status !== 'all') {
    params.push(status);
    whereClause += ` AND esr.status = $${params.length}`;
  }

  const reservations = await db.query(`
    SELECT 
      esr.*,
      es.tier, es.row_num, es.col_num,
      p.id as property_id, p.title as property_title, p.cover_image as property_image, p.status as property_status,
      u.id as user_id, u.name as user_name, u.email as user_email,
      esp.starts_at as period_starts_at, esp.ends_at as period_ends_at
    FROM elite_slot_reservations esr
    JOIN elite_slots es ON esr.slot_id = es.id
    JOIN properties p ON esr.property_id = p.id
    JOIN users u ON esr.user_id = u.id
    LEFT JOIN elite_slot_periods esp ON esr.period_id = esp.id
    ${whereClause}
    ORDER BY 
      CASE WHEN esr.status = 'pending_approval' THEN 0 ELSE 1 END,
      esr.created_at DESC
  `, params);

  res.json({ reservations: reservations.rows });
}));

// Alias for frontend compatibility
router.post('/admin/approve-reservation', authMiddleware, asyncHandler(async (req, res) => {
  const { reservationId } = req.body;
  
  if (!reservationId) {
    return res.status(400).json({ error: 'معرف الحجز مطلوب' });
  }

  const reservation = await db.query(`
    SELECT esr.*, p.title as property_title, p.user_id as property_owner_id, p.status as property_status
    FROM elite_slot_reservations esr
    JOIN properties p ON esr.property_id = p.id
    WHERE esr.id = $1 AND esr.status = 'pending_approval'
  `, [reservationId]);

  if (reservation.rows.length === 0) {
    return res.status(404).json({ error: 'الحجز غير موجود أو تمت معالجته' });
  }

  const resv = reservation.rows[0];

  if (resv.property_status !== 'approved') {
    return res.status(400).json({ error: 'لا يمكن تأكيد الحجز: الإعلان لم تتم الموافقة عليه بعد' });
  }

  await db.query(`
    UPDATE elite_slot_reservations 
    SET status = 'confirmed', confirmed_at = NOW(), updated_at = NOW()
    WHERE id = $1
  `, [reservationId]);

  await db.query(`
    INSERT INTO notifications (user_id, title, body, type, link, channel, status, payload, scheduled_at)
    VALUES ($1, 'تم تأكيد حجز النخبة! 🎉', $2, 'elite_confirmed', '/', 'app', 'pending', $3, NOW())
  `, [
    resv.property_owner_id,
    `تم تأكيد حجز النخبة لإعلانك "${resv.property_title}"! إعلانك الآن يظهر في قسم نخبة العقارات.`,
    JSON.stringify({ reservationId, propertyId: resv.property_id })
  ]);

  res.json({ 
    success: true, 
    message: 'تم تأكيد الحجز بنجاح' 
  });
}));

router.post('/admin/approve', authMiddleware, asyncHandler(async (req, res) => {
  const { reservationId } = req.body;
  
  if (!reservationId) {
    return res.status(400).json({ error: 'معرف الحجز مطلوب' });
  }

  const reservation = await db.query(`
    SELECT esr.*, p.title as property_title, p.user_id as property_owner_id, p.status as property_status
    FROM elite_slot_reservations esr
    JOIN properties p ON esr.property_id = p.id
    WHERE esr.id = $1 AND esr.status = 'pending_approval'
  `, [reservationId]);

  if (reservation.rows.length === 0) {
    return res.status(404).json({ error: 'الحجز غير موجود أو تمت معالجته' });
  }

  const resv = reservation.rows[0];

  if (resv.property_status !== 'approved') {
    return res.status(400).json({ error: 'لا يمكن تأكيد الحجز: الإعلان لم تتم الموافقة عليه بعد' });
  }

  await db.query(`
    UPDATE elite_slot_reservations 
    SET status = 'confirmed', confirmed_at = NOW(), updated_at = NOW()
    WHERE id = $1
  `, [reservationId]);

  await db.query(`
    INSERT INTO notifications (user_id, title, body, type, link, channel, status, payload, scheduled_at)
    VALUES ($1, 'تم تأكيد حجز النخبة! 🎉', $2, 'elite_confirmed', '/', 'app', 'pending', $3, NOW())
  `, [
    resv.property_owner_id,
    `تم تأكيد حجز النخبة لإعلانك "${resv.property_title}"! إعلانك الآن يظهر في قسم نخبة العقارات.`,
    JSON.stringify({ reservationId, propertyId: resv.property_id })
  ]);

  res.json({ 
    success: true, 
    message: 'تم تأكيد الحجز بنجاح' 
  });
}));

router.post('/admin/reject', authMiddleware, asyncHandler(async (req, res) => {
  const { reservationId, reason } = req.body;
  
  if (!reservationId) {
    return res.status(400).json({ error: 'معرف الحجز مطلوب' });
  }

  const reservation = await db.query(`
    SELECT esr.*, p.title as property_title, p.user_id as property_owner_id
    FROM elite_slot_reservations esr
    JOIN properties p ON esr.property_id = p.id
    WHERE esr.id = $1 AND esr.status = 'pending_approval'
  `, [reservationId]);

  if (reservation.rows.length === 0) {
    return res.status(404).json({ error: 'الحجز غير موجود أو تمت معالجته' });
  }

  const resv = reservation.rows[0];

  await db.query(`
    UPDATE elite_slot_reservations 
    SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
    WHERE id = $1
  `, [reservationId]);

  await db.query(`
    INSERT INTO notifications (user_id, title, body, type, link, channel, status, payload, scheduled_at)
    VALUES ($1, 'تم رفض حجز النخبة', $2, 'elite_rejected', '/my-listings', 'app', 'pending', $3, NOW())
  `, [
    resv.property_owner_id,
    reason || `تم رفض طلب حجز النخبة لإعلانك "${resv.property_title}". يمكنك المحاولة مرة أخرى.`,
    JSON.stringify({ reservationId, propertyId: resv.property_id, reason })
  ]);

  res.json({ 
    success: true, 
    message: 'تم رفض الحجز' 
  });
}));

router.post('/admin/cancel-reservation', authMiddleware, asyncHandler(async (req, res) => {
  const { reservationId, reason } = req.body;
  
  if (!reservationId) {
    return res.status(400).json({ error: 'معرف الحجز مطلوب' });
  }

  const reservation = await db.query(`
    SELECT esr.*, p.title as property_title, p.user_id as property_owner_id
    FROM elite_slot_reservations esr
    JOIN properties p ON esr.property_id = p.id
    WHERE esr.id = $1 AND esr.status = 'confirmed'
  `, [reservationId]);

  if (reservation.rows.length === 0) {
    return res.status(404).json({ error: 'الحجز غير موجود أو ليس مؤكداً' });
  }

  const resv = reservation.rows[0];

  await db.query(`
    UPDATE elite_slot_reservations 
    SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = $2, updated_at = NOW()
    WHERE id = $1
  `, [reservationId, reason || 'إلغاء بواسطة الإدارة']);

  await db.query(`
    INSERT INTO notifications (user_id, title, body, type, link, channel, status, payload, scheduled_at)
    VALUES ($1, 'تم إلغاء حجز النخبة', $2, 'elite_cancelled', '/my-listings', 'app', 'pending', $3, NOW())
  `, [
    resv.property_owner_id,
    reason || `تم إلغاء حجز النخبة لإعلانك "${resv.property_title}" من قبل الإدارة.`,
    JSON.stringify({ reservationId, propertyId: resv.property_id, reason })
  ]);

  res.json({ 
    success: true, 
    message: 'تم إلغاء الحجز بنجاح' 
  });
}));

router.post('/admin/extend-reservation', authMiddleware, asyncHandler(async (req, res) => {
  const { reservationId, days } = req.body;
  
  if (!reservationId || !days) {
    return res.status(400).json({ error: 'معرف الحجز وعدد الأيام مطلوبان' });
  }

  const reservation = await db.query(`
    SELECT esr.*, esp.ends_at as period_ends_at, p.title as property_title, p.user_id as property_owner_id
    FROM elite_slot_reservations esr
    JOIN elite_slot_periods esp ON esr.period_id = esp.id
    JOIN properties p ON esr.property_id = p.id
    WHERE esr.id = $1 AND esr.status = 'confirmed'
  `, [reservationId]);

  if (reservation.rows.length === 0) {
    return res.status(404).json({ error: 'الحجز غير موجود أو ليس مؤكداً' });
  }

  const resv = reservation.rows[0];

  await db.query(`
    UPDATE elite_slot_reservations 
    SET reservation_ends_at = COALESCE(reservation_ends_at, $2) + INTERVAL '1 day' * $3,
        updated_at = NOW()
    WHERE id = $1
  `, [reservationId, resv.period_ends_at, days]);

  await db.query(`
    INSERT INTO notifications (user_id, title, body, type, link, channel, status, payload, scheduled_at)
    VALUES ($1, 'تم تمديد حجز النخبة! 🎉', $2, 'elite_extended', '/', 'app', 'pending', $3, NOW())
  `, [
    resv.property_owner_id,
    `تم تمديد حجز النخبة لإعلانك "${resv.property_title}" بـ ${days} يوم إضافي.`,
    JSON.stringify({ reservationId, propertyId: resv.property_id, days })
  ]);

  res.json({ 
    success: true, 
    message: `تم تمديد الحجز بـ ${days} يوم` 
  });
}));

router.get('/admin/waitlist', authMiddleware, asyncHandler(async (req, res) => {
  const periodResult = await db.query(`
    SELECT id FROM elite_slot_periods 
    WHERE status = 'active' AND ends_at > NOW()
    ORDER BY starts_at ASC LIMIT 1
  `);

  if (periodResult.rows.length === 0) {
    return res.json({ waitlist: [], period: null });
  }

  const periodId = periodResult.rows[0].id;

  const waitlist = await db.query(`
    SELECT 
      w.*,
      es.tier, es.row_num, es.col_num, es.display_order,
      p.title as property_title, p.city as property_city,
      u.name as user_name, u.email as user_email
    FROM elite_slot_waitlist w
    LEFT JOIN elite_slots es ON w.slot_id = es.id
    JOIN properties p ON w.property_id = p.id
    JOIN users u ON w.user_id = u.id
    WHERE w.period_id = $1 AND w.status = 'waiting'
    ORDER BY w.created_at ASC
  `, [periodId]);

  res.json({
    waitlist: waitlist.rows,
    period: periodResult.rows[0]
  });
}));

router.post('/admin/notify-waitlist', authMiddleware, asyncHandler(async (req, res) => {
  const { waitlistId, message } = req.body;

  const waitlistEntry = await db.query(`
    SELECT w.*, u.name, u.email
    FROM elite_slot_waitlist w
    JOIN users u ON w.user_id = u.id
    WHERE w.id = $1
  `, [waitlistId]);

  if (waitlistEntry.rows.length === 0) {
    return res.status(404).json({ error: 'السجل غير موجود' });
  }

  const entry = waitlistEntry.rows[0];

  await db.query(`
    INSERT INTO notifications (user_id, title, body, type, link, channel, status, scheduled_at)
    VALUES ($1, 'إشعار من قائمة الانتظار', $2, 'promo', '/elite-booking', 'app', 'pending', NOW())
  `, [entry.user_id, message || 'موقع جديد متاح في نخبة العقارات!']);

  await db.query(`
    UPDATE elite_slot_waitlist 
    SET status = 'notified', notified_at = NOW()
    WHERE id = $1
  `, [waitlistId]);

  res.json({ success: true, message: 'تم إرسال الإشعار بنجاح' });
}));

// Admin: Move reservation to different slot
router.post('/admin/move-reservation', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { reservationId, newSlotId } = req.body;
  
  if (!reservationId || !newSlotId) {
    return res.status(400).json({ error: 'معرف الحجز والخانة الجديدة مطلوبان' });
  }
  
  // Check if new slot is available
  const reservation = await db.query(`SELECT * FROM elite_slot_reservations WHERE id = $1`, [reservationId]);
  if (reservation.rows.length === 0) {
    return res.status(404).json({ error: 'الحجز غير موجود' });
  }
  
  const periodId = reservation.rows[0].period_id;
  
  const existingReservation = await db.query(`
    SELECT id FROM elite_slot_reservations 
    WHERE slot_id = $1 AND period_id = $2 AND status = 'confirmed' AND id != $3
  `, [newSlotId, periodId, reservationId]);
  
  if (existingReservation.rows.length > 0) {
    return res.status(400).json({ error: 'هذه الخانة محجوزة بالفعل' });
  }
  
  await db.query(`UPDATE elite_slot_reservations SET slot_id = $1 WHERE id = $2`, [newSlotId, reservationId]);
  
  res.json({ success: true, message: 'تم نقل الحجز بنجاح' });
}));

// Debug endpoint to check elite slots status
router.get('/debug-status', asyncHandler(async (req, res) => {
  const periods = await db.query(`SELECT id, status, starts_at, ends_at FROM elite_slot_periods ORDER BY created_at DESC LIMIT 3`);
  const reservations = await db.query(`SELECT id, status, slot_id, property_id, period_id FROM elite_slot_reservations ORDER BY created_at DESC LIMIT 5`);
  const properties = await db.query(`SELECT id, title, status FROM properties WHERE id IN (SELECT property_id FROM elite_slot_reservations) LIMIT 5`);
  
  res.json({
    periods: periods.rows,
    reservations: reservations.rows,
    properties: properties.rows,
    now: new Date().toISOString()
  });
}));

router.get('/featured-properties', asyncHandler(async (req, res) => {
  const periodResult = await db.query(`
    SELECT id FROM elite_slot_periods 
    WHERE status = 'active' AND ends_at > NOW()
    ORDER BY starts_at ASC LIMIT 1
  `);

  if (periodResult.rows.length === 0) {
    console.log('[Elite] No active period found');
    return res.json({ properties: [], period: null });
  }

  const periodId = periodResult.rows[0].id;

  const properties = await db.query(`
    SELECT 
      es.id as slot_id,
      es.row_num,
      es.col_num,
      es.tier,
      es.display_order,
      p.id as property_id,
      p.title,
      p.cover_image,
      p.city,
      p.district,
      p.price,
      p.type,
      p.bedrooms,
      p.bathrooms,
      p.area,
      u.name as owner_name
    FROM elite_slots es
    INNER JOIN elite_slot_reservations esr ON es.id = esr.slot_id 
      AND esr.period_id = $1 
      AND esr.status = 'confirmed'
    INNER JOIN properties p ON esr.property_id = p.id AND p.status = 'approved'
    LEFT JOIN users u ON p.user_id = u.id
    WHERE es.is_active = true
    ORDER BY es.display_order
  `, [periodId]);

  res.json({ 
    properties: properties.rows,
    period: periodResult.rows[0]
  });
}));

router.get('/my-reservations', authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  const reservations = await db.query(`
    SELECT 
      esr.*,
      es.tier, es.row_num, es.col_num,
      p.id as property_id, p.title as property_title, p.cover_image as property_image, p.city,
      esp.starts_at as period_starts_at, esp.ends_at as period_ends_at,
      COALESCE(esr.reservation_ends_at, esp.ends_at) as effective_ends_at,
      EXTRACT(EPOCH FROM (COALESCE(esr.reservation_ends_at, esp.ends_at) - NOW())) / 86400 as days_remaining,
      (SELECT COUNT(*) FROM elite_extension_requests WHERE reservation_id = esr.id AND status IN ('pending_payment', 'pending_admin')) as pending_extension_count
    FROM elite_slot_reservations esr
    JOIN elite_slots es ON esr.slot_id = es.id
    JOIN properties p ON esr.property_id = p.id
    JOIN elite_slot_periods esp ON esr.period_id = esp.id
    WHERE esr.user_id = $1 AND esr.status IN ('confirmed', 'pending_approval')
    ORDER BY esr.created_at DESC
  `, [userId]);

  res.json({ reservations: reservations.rows });
}));

router.post('/reservations/:id/extension', authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const reservationId = req.params.id;
  const { days, customerNote } = req.body;
  
  if (!days || days < 1 || days > 30) {
    return res.status(400).json({ error: 'عدد الأيام يجب أن يكون بين 1 و 30' });
  }

  const reservation = await db.query(`
    SELECT esr.*, esp.ends_at as period_ends_at
    FROM elite_slot_reservations esr
    JOIN elite_slot_periods esp ON esr.period_id = esp.id
    WHERE esr.id = $1 AND esr.user_id = $2 AND esr.status = 'confirmed'
  `, [reservationId, userId]);

  if (reservation.rows.length === 0) {
    return res.status(404).json({ error: 'الحجز غير موجود أو غير مؤكد' });
  }

  const pendingExtension = await db.query(`
    SELECT id FROM elite_extension_requests 
    WHERE reservation_id = $1 AND status IN ('pending_payment', 'pending_admin')
  `, [reservationId]);

  if (pendingExtension.rows.length > 0) {
    return res.status(400).json({ error: 'لديك طلب تمديد معلق بالفعل' });
  }

  const priceAmount = EXTENSION_PRICE_PER_DAY * days;
  const vatAmount = 0;
  const totalAmount = priceAmount;

  const extensionResult = await db.query(`
    INSERT INTO elite_extension_requests 
      (reservation_id, user_id, requested_days, price_per_day, price_amount, vat_amount, total_amount, customer_note, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending_payment')
    RETURNING *
  `, [reservationId, userId, days, EXTENSION_PRICE_PER_DAY, priceAmount, vatAmount, totalAmount, customerNote || null]);

  await db.query(`
    INSERT INTO notifications (user_id, title, message, type, link, source, status, created_at)
    VALUES ($1, 'تم إنشاء طلب التمديد 📋', $2, 'elite_extension_created', '/elite-booking/extend?id=' || $3, 'app', 'pending', NOW())
  `, [userId, `تم إنشاء طلب تمديد لـ ${days} أيام بإجمالي ${totalAmount} ريال. يرجى إتمام الدفع.`, extensionResult.rows[0].id]);

  res.json({ 
    success: true,
    extension: extensionResult.rows[0],
    message: `تم إنشاء طلب تمديد لـ ${days} أيام بإجمالي ${totalAmount} ريال`
  });
}));

router.post('/extensions/:id/pay', authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const extensionId = req.params.id;

  const extension = await db.query(`
    SELECT eer.*, esr.id as reservation_id, p.title as property_title, p.user_id as property_owner_id
    FROM elite_extension_requests eer
    JOIN elite_slot_reservations esr ON eer.reservation_id = esr.id
    JOIN properties p ON esr.property_id = p.id
    WHERE eer.id = $1 AND eer.user_id = $2 AND eer.status = 'pending_payment'
  `, [extensionId, userId]);

  if (extension.rows.length === 0) {
    return res.status(404).json({ error: 'طلب التمديد غير موجود أو تم دفعه' });
  }

  const ext = extension.rows[0];

  const paymentResult = await db.query(`
    INSERT INTO payments (user_id, amount, vat_amount, total_amount, payment_type, status, payment_method, description)
    VALUES ($1, $2, $3, $4, 'elite_extension', 'completed', 'credit_card', $5)
    RETURNING id
  `, [userId, ext.price_amount, ext.vat_amount, ext.total_amount, `تمديد نخبة ${ext.requested_days} أيام`]);

  const invoiceNumber = await generateInvoiceNumber();
  const invoiceResult = await db.query(`
    INSERT INTO invoices (user_id, invoice_number, amount, vat_amount, total_amount, invoice_type, status, description)
    VALUES ($1, $2, $3, $4, $5, 'elite_extension', 'paid', $6)
    RETURNING id
  `, [userId, invoiceNumber, ext.price_amount, ext.vat_amount, ext.total_amount, `تمديد حجز النخبة ${ext.requested_days} أيام`]);

  await db.query(`
    UPDATE elite_extension_requests 
    SET status = 'pending_admin', payment_id = $2, invoice_id = $3, updated_at = NOW()
    WHERE id = $1
  `, [extensionId, paymentResult.rows[0].id, invoiceResult.rows[0].id]);

  await db.query(`
    INSERT INTO notifications (user_id, title, message, type, link, source, status, created_at)
    VALUES ($1, 'تم الدفع بنجاح! 💳', $2, 'elite_extension_paid', '/my-listings', 'app', 'pending', NOW())
  `, [userId, `تم استلام دفعتك بقيمة ${ext.total_amount} ريال لتمديد النخبة. طلبك قيد المراجعة من الإدارة.`]);

  const admins = await db.query(`SELECT id FROM users WHERE role IN ('admin', 'super_admin')`);
  for (const admin of admins.rows) {
    await db.query(`
      INSERT INTO notifications (user_id, title, body, type, link, channel, status, scheduled_at)
      VALUES ($1, 'طلب تمديد نخبة جديد 🔔', $2, 'elite_extension_request', '/admin/elite-slots', 'app', 'pending', NOW())
    `, [admin.id, `طلب تمديد ${ext.requested_days} أيام للإعلان "${ext.property_title}" بقيمة ${ext.total_amount} ريال`]);
  }

  res.json({ 
    success: true,
    message: 'تم الدفع بنجاح! طلبك قيد المراجعة',
    invoiceNumber
  });
}));

router.get('/extensions/:id', authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const extensionId = req.params.id;

  const extension = await db.query(`
    SELECT eer.*, 
      esr.id as reservation_id,
      p.title as property_title, p.cover_image as property_image,
      es.tier, es.row_num, es.col_num
    FROM elite_extension_requests eer
    JOIN elite_slot_reservations esr ON eer.reservation_id = esr.id
    JOIN properties p ON esr.property_id = p.id
    JOIN elite_slots es ON esr.slot_id = es.id
    WHERE eer.id = $1 AND eer.user_id = $2
  `, [extensionId, userId]);

  if (extension.rows.length === 0) {
    return res.status(404).json({ error: 'طلب التمديد غير موجود' });
  }

  res.json({ extension: extension.rows[0] });
}));

router.get('/admin/extensions', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { status } = req.query;
  
  let whereClause = '';
  const params = [];
  
  if (status && status !== 'all') {
    whereClause = 'WHERE eer.status = $1';
    params.push(status);
  }

  const extensions = await db.query(`
    SELECT eer.*,
      esr.id as reservation_id,
      p.title as property_title, p.cover_image as property_image, p.city,
      u.name as user_name, u.email as user_email, u.phone as user_phone,
      es.tier, es.row_num, es.col_num
    FROM elite_extension_requests eer
    JOIN elite_slot_reservations esr ON eer.reservation_id = esr.id
    JOIN properties p ON esr.property_id = p.id
    JOIN users u ON eer.user_id = u.id
    JOIN elite_slots es ON esr.slot_id = es.id
    ${whereClause}
    ORDER BY 
      CASE WHEN eer.status = 'pending_admin' THEN 0 ELSE 1 END,
      eer.created_at DESC
  `, params);

  const stats = await db.query(`
    SELECT 
      COUNT(CASE WHEN status = 'pending_admin' THEN 1 END) as pending_count,
      COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
      COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count,
      COALESCE(SUM(CASE WHEN status = 'approved' THEN total_amount ELSE 0 END), 0) as total_revenue
    FROM elite_extension_requests
  `);

  res.json({ 
    extensions: extensions.rows,
    stats: stats.rows[0]
  });
}));

router.post('/admin/extensions/:id/approve', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const adminId = req.user.id;
  const extensionId = req.params.id;
  const { adminNote } = req.body;

  const extension = await db.query(`
    SELECT eer.*, esr.id as reservation_id, esr.reservation_ends_at, esp.ends_at as period_ends_at,
      p.title as property_title, p.user_id as property_owner_id
    FROM elite_extension_requests eer
    JOIN elite_slot_reservations esr ON eer.reservation_id = esr.id
    JOIN elite_slot_periods esp ON esr.period_id = esp.id
    JOIN properties p ON esr.property_id = p.id
    WHERE eer.id = $1 AND eer.status = 'pending_admin'
  `, [extensionId]);

  if (extension.rows.length === 0) {
    return res.status(404).json({ error: 'طلب التمديد غير موجود أو تمت معالجته' });
  }

  const ext = extension.rows[0];
  const currentEndDate = ext.reservation_ends_at || ext.period_ends_at;

  await db.query(`
    UPDATE elite_slot_reservations 
    SET reservation_ends_at = $2::timestamp + INTERVAL '1 day' * $3,
        updated_at = NOW()
    WHERE id = $1
  `, [ext.reservation_id, currentEndDate, ext.requested_days]);

  await db.query(`
    UPDATE elite_extension_requests 
    SET status = 'approved', admin_note = $2, processed_by = $3, processed_at = NOW(), updated_at = NOW()
    WHERE id = $1
  `, [extensionId, adminNote || null, adminId]);

  await db.query(`
    INSERT INTO notifications (user_id, title, body, type, link, channel, status, scheduled_at)
    VALUES ($1, 'تمت الموافقة على تمديد النخبة! 🎉', $2, 'elite_extension_approved', '/my-listings', 'app', 'pending', NOW())
  `, [ext.property_owner_id, `تمت الموافقة على تمديد نخبة إعلانك "${ext.property_title}" بـ ${ext.requested_days} أيام إضافية.`]);

  res.json({ 
    success: true,
    message: `تمت الموافقة وتمديد الحجز بـ ${ext.requested_days} أيام`
  });
}));

router.post('/admin/extensions/:id/reject', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const adminId = req.user.id;
  const extensionId = req.params.id;
  const { adminNote } = req.body;

  const extension = await db.query(`
    SELECT eer.*, p.title as property_title, p.user_id as property_owner_id
    FROM elite_extension_requests eer
    JOIN elite_slot_reservations esr ON eer.reservation_id = esr.id
    JOIN properties p ON esr.property_id = p.id
    WHERE eer.id = $1 AND eer.status = 'pending_admin'
  `, [extensionId]);

  if (extension.rows.length === 0) {
    return res.status(404).json({ error: 'طلب التمديد غير موجود أو تمت معالجته' });
  }

  const ext = extension.rows[0];

  await db.query(`
    UPDATE elite_extension_requests 
    SET status = 'rejected', admin_note = $2, processed_by = $3, processed_at = NOW(), updated_at = NOW()
    WHERE id = $1
  `, [extensionId, adminNote || 'تم الرفض من قبل الإدارة', adminId]);

  await db.query(`
    INSERT INTO notifications (user_id, title, body, type, link, channel, status, scheduled_at)
    VALUES ($1, 'تم رفض طلب تمديد النخبة ❌', $2, 'elite_extension_rejected', '/my-listings', 'app', 'pending', NOW())
  `, [ext.property_owner_id, `تم رفض طلب تمديد نخبة إعلانك "${ext.property_title}". ${adminNote ? 'السبب: ' + adminNote : ''}`]);

  res.json({ 
    success: true,
    message: 'تم رفض طلب التمديد'
  });
}));

router.post('/admin/check-expiring', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
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
          AND n.payload::jsonb->>'reservation_id' = esr.id::text
          AND n.created_at > NOW() - INTERVAL '24 hours'
      )
  `);

  let notificationsSent = 0;

  for (const resv of expiringReservations.rows) {
    const daysRemaining = Math.ceil((new Date(resv.effective_ends_at) - new Date()) / (1000 * 60 * 60 * 24));
    
    await db.query(`
      INSERT INTO notifications (user_id, title, body, type, link, channel, status, payload, scheduled_at)
      VALUES ($1, 'تنبيه: نخبة إعلانك ستنتهي قريباً! ⏰', $2, 'elite_expiry_warning', '/elite-booking/extend?reservation=' || $3, 'app', 'pending', $4, NOW())
    `, [
      resv.property_owner_id,
      `نخبة إعلانك "${resv.property_title}" ستنتهي خلال ${daysRemaining} يوم. قم بتمديدها الآن بـ 30 ريال لليوم!`,
      resv.id,
      JSON.stringify({ reservation_id: resv.id, property_id: resv.property_id, days_remaining: daysRemaining })
    ]);
    
    notificationsSent++;
  }

  res.json({ 
    success: true,
    message: `تم إرسال ${notificationsSent} إشعار تذكير`,
    count: notificationsSent
  });
}));

router.get('/extension-price', (req, res) => {
  res.json({ 
    pricePerDay: EXTENSION_PRICE_PER_DAY,
    currency: 'SAR'
  });
});

router.get('/admin/pricing', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT id, row_num, col_num, tier, base_price, is_active, display_order
    FROM elite_slots
    ORDER BY display_order ASC
  `);
  
  res.json({ slots: result.rows });
}));

router.put('/admin/pricing', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { prices } = req.body;
  
  if (!prices || !Array.isArray(prices)) {
    return res.status(400).json({ error: 'يجب توفير قائمة الأسعار' });
  }
  
  for (const item of prices) {
    if (!item.id || item.price === undefined) continue;
    const price = parseFloat(item.price);
    if (isNaN(price) || price < 0) {
      return res.status(400).json({ error: `سعر غير صالح للفتحة ${item.id}` });
    }
  }
  
  const client = await db.connect();
  
  try {
    await client.query('BEGIN');
    
    for (const item of prices) {
      if (!item.id || item.price === undefined) continue;
      const price = parseFloat(item.price);
      
      await client.query(
        'UPDATE elite_slots SET base_price = $1 WHERE id = $2',
        [price, item.id]
      );
    }
    
    await client.query(`
      INSERT INTO admin_audit_logs (admin_id, action, resource_type, resource_id, details)
      VALUES ($1, 'update_elite_prices', 'elite_slots', NULL, $2)
    `, [req.user.id, JSON.stringify({ prices })]);
    
    await client.query('COMMIT');
    
    res.json({ success: true, message: 'تم تحديث الأسعار بنجاح' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

router.put('/admin/pricing/tier', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { tier, price } = req.body;
  
  if (!tier || !['top', 'middle', 'bottom'].includes(tier)) {
    return res.status(400).json({ error: 'الفئة غير صالحة' });
  }
  
  const priceValue = parseFloat(price);
  if (isNaN(priceValue) || priceValue < 0) {
    return res.status(400).json({ error: 'السعر غير صالح' });
  }
  
  await db.query(
    'UPDATE elite_slots SET base_price = $1 WHERE tier = $2',
    [priceValue, tier]
  );
  
  await db.query(`
    INSERT INTO admin_audit_logs (admin_id, action, resource_type, resource_id, details)
    VALUES ($1, 'update_elite_tier_price', 'elite_slots', NULL, $2)
  `, [req.user.id, JSON.stringify({ tier, price: priceValue })]);
  
  res.json({ success: true, message: `تم تحديث سعر الفئة ${tier === 'top' ? 'العليا' : tier === 'middle' ? 'الوسطى' : 'السفلى'} بنجاح` });
}));

// 🌍 جلب أسعار الفتحات حسب البلد (للعملاء)
router.get('/pricing/by-country/:countryCode', asyncHandler(async (req, res) => {
  const { countryCode } = req.params;
  let upperCode = (countryCode || 'SA').toUpperCase();
  
  // Fallback unsupported codes to SA
  const supportedCodes = ['SA', 'AE', 'KW', 'QA', 'BH', 'OM', 'EG', 'LB', 'TR'];
  if (!supportedCodes.includes(upperCode)) {
    upperCode = 'SA';
  }
  
  // Countries data
  const countries = {
    SA: { name_ar: 'السعودية', currency_code: 'SAR', currency_symbol: 'ر.س', rate: 1 },
    AE: { name_ar: 'الإمارات', currency_code: 'AED', currency_symbol: 'درهم', rate: 0.98 },
    KW: { name_ar: 'الكويت', currency_code: 'KWD', currency_symbol: 'د.ك', rate: 0.082 },
    QA: { name_ar: 'قطر', currency_code: 'QAR', currency_symbol: 'ر.ق', rate: 0.97 },
    BH: { name_ar: 'البحرين', currency_code: 'BHD', currency_symbol: 'د.ب', rate: 0.1 },
    OM: { name_ar: 'عمان', currency_code: 'OMR', currency_symbol: 'ر.ع', rate: 0.103 },
    EG: { name_ar: 'مصر', currency_code: 'EGP', currency_symbol: 'جنيه', rate: 13.07 },
    LB: { name_ar: 'لبنان', currency_code: 'LBP', currency_symbol: 'ل.ل', rate: 23867 },
    TR: { name_ar: 'تركيا', currency_code: 'TRY', currency_symbol: 'ليرة', rate: 9.33 }
  };
  
  const country = countries[upperCode] || countries.SA;
  const isSaudi = upperCode === 'SA';
  
  // Get current exchange rate from database
  let rate = country.rate;
  try {
    const rateResult = await db.query(
      'SELECT rate_from_usd FROM exchange_rates WHERE currency_code = $1',
      [country.currency_code]
    );
    if (rateResult.rows[0]) {
      const sarRate = 3.75; // SAR to USD
      rate = rateResult.rows[0].rate_from_usd / sarRate;
    }
  } catch (err) {
    console.error('Error fetching exchange rate:', err);
  }
  
  // Check for custom country prices first
  const customPricesResult = await db.query(`
    SELECT escp.slot_id, escp.price, escp.needs_review
    FROM elite_slot_country_prices escp
    WHERE escp.country_code = $1 AND escp.is_active = true
  `, [upperCode]);
  
  const customPrices = {};
  customPricesResult.rows.forEach(row => {
    customPrices[row.slot_id] = { price: parseFloat(row.price), needsReview: row.needs_review };
  });
  
  // Get all slots with base prices
  const slotsResult = await db.query(`
    SELECT id, row_num, col_num, tier, base_price, display_order, is_active
    FROM elite_slots
    WHERE is_active = true
    ORDER BY display_order ASC
  `);
  
  const slots = slotsResult.rows.map(slot => {
    let localPrice;
    let needsReview = false;
    
    if (customPrices[slot.id]) {
      localPrice = customPrices[slot.id].price;
      needsReview = customPrices[slot.id].needsReview;
    } else if (isSaudi) {
      localPrice = parseFloat(slot.base_price);
    } else {
      localPrice = Math.round(parseFloat(slot.base_price) * rate);
      needsReview = true;
    }
    
    return {
      id: slot.id,
      row_num: slot.row_num,
      col_num: slot.col_num,
      tier: slot.tier,
      base_price_sar: parseFloat(slot.base_price),
      local_price: localPrice,
      display_order: slot.display_order,
      needs_review: needsReview
    };
  });
  
  res.json({
    country: {
      code: upperCode,
      name_ar: country.name_ar,
      currency_code: country.currency_code,
      currency_symbol: country.currency_symbol
    },
    slots
  });
}));

// 🌍 إدارة أسعار الفتحات حسب البلد (للإدارة)
router.get('/admin/country-pricing', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT escp.*, es.tier, es.row_num, es.col_num
    FROM elite_slot_country_prices escp
    JOIN elite_slots es ON escp.slot_id = es.id
    ORDER BY escp.country_code, es.display_order
  `);
  
  res.json({ prices: result.rows });
}));

router.put('/admin/country-pricing', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { slot_id, country_code, price, currency_code, currency_symbol, country_name_ar } = req.body;
  
  if (!slot_id || !country_code || price === undefined) {
    return res.status(400).json({ error: 'بيانات ناقصة: slot_id, country_code, price مطلوبة' });
  }
  
  if (!currency_code || !currency_symbol || !country_name_ar) {
    return res.status(400).json({ error: 'بيانات ناقصة: currency_code, currency_symbol, country_name_ar مطلوبة' });
  }
  
  const priceValue = parseFloat(price);
  if (isNaN(priceValue) || priceValue < 0) {
    return res.status(400).json({ error: 'السعر غير صالح' });
  }
  
  await db.query(`
    INSERT INTO elite_slot_country_prices 
    (slot_id, country_code, country_name_ar, currency_code, currency_symbol, price, needs_review, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, false, NOW())
    ON CONFLICT (slot_id, country_code) 
    DO UPDATE SET price = $6, needs_review = false, updated_at = NOW()
  `, [slot_id, country_code, country_name_ar, currency_code, currency_symbol, priceValue]);
  
  await db.query(`
    INSERT INTO admin_audit_logs (admin_id, action, resource_type, resource_id, details)
    VALUES ($1, 'update_elite_country_price', 'elite_slot_country_prices', $2, $3)
  `, [req.user.id, slot_id, JSON.stringify({ country_code, price: priceValue })]);
  
  res.json({ success: true, message: 'تم تحديث السعر بنجاح' });
}));

// موافقة على جميع الأسعار المحولة تلقائياً لبلد معين
router.post('/admin/country-pricing/approve', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { country_code } = req.body;
  
  if (!country_code) {
    return res.status(400).json({ error: 'كود البلد مطلوب' });
  }
  
  // Countries data
  const countries = {
    SA: { name_ar: 'السعودية', currency_code: 'SAR', currency_symbol: 'ر.س', rate: 1 },
    AE: { name_ar: 'الإمارات', currency_code: 'AED', currency_symbol: 'درهم', rate: 0.98 },
    KW: { name_ar: 'الكويت', currency_code: 'KWD', currency_symbol: 'د.ك', rate: 0.082 },
    QA: { name_ar: 'قطر', currency_code: 'QAR', currency_symbol: 'ر.ق', rate: 0.97 },
    BH: { name_ar: 'البحرين', currency_code: 'BHD', currency_symbol: 'د.ب', rate: 0.1 },
    OM: { name_ar: 'عمان', currency_code: 'OMR', currency_symbol: 'ر.ع', rate: 0.103 },
    EG: { name_ar: 'مصر', currency_code: 'EGP', currency_symbol: 'جنيه', rate: 13.07 },
    LB: { name_ar: 'لبنان', currency_code: 'LBP', currency_symbol: 'ل.ل', rate: 23867 },
    TR: { name_ar: 'تركيا', currency_code: 'TRY', currency_symbol: 'ليرة', rate: 9.33 }
  };
  
  const country = countries[country_code.toUpperCase()];
  if (!country) {
    return res.status(400).json({ error: 'بلد غير مدعوم' });
  }
  
  let rate = country.rate;
  try {
    const rateResult = await db.query(
      'SELECT rate_from_usd FROM exchange_rates WHERE currency_code = $1',
      [country.currency_code]
    );
    if (rateResult.rows[0]) {
      const sarRate = 3.75;
      rate = rateResult.rows[0].rate_from_usd / sarRate;
    }
  } catch (err) {
    console.error('Error fetching exchange rate:', err);
  }
  
  // Get all slots and insert/update prices
  const slotsResult = await db.query('SELECT id, base_price FROM elite_slots WHERE is_active = true');
  
  for (const slot of slotsResult.rows) {
    const localPrice = Math.round(parseFloat(slot.base_price) * rate);
    await db.query(`
      INSERT INTO elite_slot_country_prices 
      (slot_id, country_code, country_name_ar, currency_code, currency_symbol, price, needs_review, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, false, NOW())
      ON CONFLICT (slot_id, country_code) 
      DO UPDATE SET price = $6, needs_review = false, updated_at = NOW()
    `, [slot.id, country_code.toUpperCase(), country.name_ar, country.currency_code, country.currency_symbol, localPrice]);
  }
  
  await db.query(`
    INSERT INTO admin_audit_logs (admin_id, action, resource_type, resource_id, details)
    VALUES ($1, 'approve_elite_country_prices', 'elite_slot_country_prices', NULL, $2)
  `, [req.user.id, JSON.stringify({ country_code })]);
  
  res.json({ success: true, message: `تم اعتماد أسعار ${country.name_ar} بنجاح` });
}));

module.exports = router;
