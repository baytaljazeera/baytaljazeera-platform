// backend/routes/account.js - Account/Profile Routes
const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();

router.get("/profile", authMiddleware, asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT id, email, name, phone, whatsapp, role, email_verified_at, phone_verified_at, created_at
     FROM users WHERE id = $1`,
    [req.user.id]
  );
  
  const user = result.rows[0];
  if (!user) {
    return res.status(404).json({ error: "المستخدم غير موجود" });
  }

  const planResult = await db.query(
    `SELECT p.*, up.expires_at, up.started_at, up.status as subscription_status
     FROM user_plans up
     JOIN plans p ON up.plan_id = p.id
     WHERE up.user_id = $1 AND up.status = 'active'
     ORDER BY up.started_at DESC LIMIT 1`,
    [user.id]
  );

  const plan = planResult.rows[0];

  const listingsCount = await db.query(
    `SELECT COUNT(*) as count FROM properties 
     WHERE user_id = $1 AND status NOT IN ('deleted', 'rejected')`,
    [user.id]
  );

  res.json({
    user: {
      ...user,
      emailVerified: !!user.email_verified_at,
      phoneVerified: !!user.phone_verified_at,
      planName: plan?.name_ar || "بدون باقة",
      planNameEn: plan?.name_en || "No Plan",
      planId: plan?.id || null,
      planColor: plan?.color || "#6b7280",
      planLogoUrl: plan?.custom_icon || null,
      planPrice: plan?.price || 0,
      subscriptionStatus: plan?.subscription_status || 'inactive',
      subscriptionStartDate: plan?.started_at || null,
      subscriptionEndDate: plan?.expires_at || null,
      listingsCount: parseInt(listingsCount.rows[0]?.count) || 0,
      listingLimit: plan?.max_listings || 0,
      maxPhotosPerListing: plan?.max_photos_per_listing || 5,
      featuredAllowed: plan?.featured_allowed || false,
    }
  });
}));

router.patch("/profile", authMiddleware, asyncHandler(async (req, res) => {
  const { name, phone, whatsappNumber } = req.body;
  
  try {
    await db.query(
      `UPDATE users SET name = $1, phone = $2, whatsapp = $3, updated_at = NOW() WHERE id = $4`,
      [name || null, phone || null, whatsappNumber || null, req.user.id]
    );

    res.json({ ok: true, message: "تم حفظ التعديلات" });
  } catch (err) {
    if (err.code === "23505" && err.constraint?.includes("phone")) {
      return res.status(409).json({ error: "رقم الجوال مستخدم من قبل" });
    }
    throw err;
  }
}));

router.post("/change-password", authMiddleware, asyncHandler(async (req, res) => {
  const { current, next } = req.body;
  
  if (!current || !next) {
    return res.status(400).json({ error: "كلمة المرور الحالية والجديدة مطلوبتان" });
  }

  if (next.length < 6) {
    return res.status(400).json({ error: "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل" });
  }

  const userResult = await db.query(
    `SELECT password_hash FROM users WHERE id = $1`,
    [req.user.id]
  );

  const user = userResult.rows[0];
  if (!user) {
    return res.status(404).json({ error: "المستخدم غير موجود" });
  }

  const validPassword = await bcrypt.compare(current, user.password_hash);
  if (!validPassword) {
    return res.status(401).json({ error: "كلمة المرور الحالية غير صحيحة" });
  }

  const newHash = await bcrypt.hash(next, 10);
  await db.query(
    `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
    [newHash, req.user.id]
  );

  res.json({ ok: true, message: "تم تغيير كلمة المرور بنجاح" });
}));

router.get("/my-listings", authMiddleware, asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT * FROM properties WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.user.id]
  );
  
  const listings = await Promise.all(result.rows.map(async (listing) => {
    // Fetch images from listing_media table (like /api/listings/:id does)
    let images = [];
    try {
      const mediaResult = await db.query(
        `SELECT id, url, kind, is_cover FROM listing_media WHERE listing_id = $1 ORDER BY is_cover DESC, sort_order ASC`,
        [listing.id]
      );
      images = mediaResult.rows.filter(m => m.kind === 'image' || !m.kind);
    } catch (mediaErr) {
      console.error("Error fetching media:", mediaErr);
    }
    
    // Fallback to cover_image or images array from properties table
    if (images.length === 0) {
      if (listing.cover_image) {
        images = [{ id: 'cover', url: listing.cover_image, is_cover: true }];
      } else if (listing.images && Array.isArray(listing.images) && listing.images.length > 0) {
        images = listing.images.map((url, idx) => ({
          id: `img-${idx}`,
          url: url,
          is_cover: idx === 0
        }));
      }
    }
    
    return {
      ...listing,
      images: images.map(img => img.url), // Return as array of URLs for compatibility
      image_url: images[0]?.url || listing.cover_image || (listing.images && listing.images[0]) || null
    };
  }));
  
  res.json({ listings });
}));

router.get("/limits", authMiddleware, asyncHandler(async (req, res) => {
  const FREE_PLAN_ID = 1;
  
  const bucketsResult = await db.query(
    `SELECT 
      qb.id, qb.plan_id, qb.total_slots, qb.used_slots, qb.expires_at, qb.active,
      p.name_ar as plan_name, p.max_photos_per_listing, p.max_videos_per_listing,
      p.max_video_duration, p.show_on_map, p.ai_support_level, p.highlights_allowed
     FROM quota_buckets qb
     JOIN plans p ON qb.plan_id = p.id
     WHERE qb.user_id = $1 
       AND qb.active = true 
       AND (qb.expires_at IS NULL OR qb.expires_at > NOW())
       AND (qb.total_slots - qb.used_slots) > 0
     ORDER BY qb.expires_at ASC NULLS LAST`,
    [req.user.id]
  );
  
  const activeBuckets = bucketsResult.rows;
  const totalRemaining = activeBuckets.reduce((sum, b) => sum + (b.total_slots - b.used_slots), 0);
  const totalSlots = activeBuckets.reduce((sum, b) => sum + b.total_slots, 0);
  const totalUsed = activeBuckets.reduce((sum, b) => sum + b.used_slots, 0);
  
  const canAdd = totalRemaining > 0;
  
  const planResult = await db.query(
    `SELECT p.*, up.expires_at, up.status as subscription_status
     FROM user_plans up
     JOIN plans p ON up.plan_id = p.id
     WHERE up.user_id = $1 AND up.status = 'active'
     ORDER BY up.started_at DESC LIMIT 1`,
    [req.user.id]
  );

  let plan = planResult.rows[0];
  let isFreeUser = false;
  
  if (!plan) {
    const freePlanResult = await db.query(
      `SELECT * FROM plans WHERE id = $1`,
      [FREE_PLAN_ID]
    );
    
    if (freePlanResult.rows[0]) {
      plan = freePlanResult.rows[0];
      plan.subscription_status = 'active';
      isFreeUser = true;
    }
  }
  
  if (!plan && activeBuckets.length === 0) {
    return res.json({
      planId: null,
      planName: "بدون باقة",
      maxListings: 0,
      currentListings: 0,
      remainingListings: 0,
      canAdd: false,
      maxPhotosPerListing: 0,
      maxVideosPerListing: 0,
      maxVideoDuration: 0,
      showOnMap: false,
      aiSupportLevel: 0,
      highlightsAllowed: 0,
      expiresAt: null,
      needsUpgrade: true,
      isFreeUser: true,
      quotaBuckets: []
    });
  }
  
  const bestBucket = activeBuckets[0];
  
  res.json({
    planId: plan?.id || bestBucket?.plan_id,
    planName: plan?.name_ar || bestBucket?.plan_name || "الباقة المجانية",
    maxListings: totalSlots,
    currentListings: totalUsed,
    remainingListings: totalRemaining,
    canAdd,
    maxPhotosPerListing: bestBucket?.max_photos_per_listing || plan?.max_photos_per_listing || 5,
    maxVideosPerListing: bestBucket?.max_videos_per_listing || plan?.max_videos_per_listing || 0,
    maxVideoDuration: bestBucket?.max_video_duration || plan?.max_video_duration || 60,
    showOnMap: bestBucket?.show_on_map || plan?.show_on_map || false,
    aiSupportLevel: bestBucket?.ai_support_level || plan?.ai_support_level || 0,
    highlightsAllowed: bestBucket?.highlights_allowed || plan?.highlights_allowed || 0,
    expiresAt: bestBucket?.expires_at || plan?.expires_at || null,
    needsUpgrade: !canAdd,
    isExpired: false,
    isFreeUser,
    quotaBuckets: activeBuckets.map(b => ({
      id: b.id,
      planId: b.plan_id,
      planName: b.plan_name,
      remaining: b.total_slots - b.used_slots,
      total: b.total_slots,
      expiresAt: b.expires_at
    }))
  });
}));

// Customer invoices (payment + refund invoices)
router.get("/invoices", authMiddleware, asyncHandler(async (req, res) => {
  // Payment invoices
  const paymentInvoices = await db.query(`
    SELECT 
      i.*,
      'payment' as invoice_type,
      p.name_ar as plan_name, p.name_en as plan_name_en,
      pay.transaction_id, pay.payment_method,
      r.id as refund_id, r.status as refund_status, r.reason as refund_reason, 
      r.created_at as refund_created_at, r.decision_note, r.payout_confirmed_at,
      r.refund_invoice_number
    FROM invoices i
    LEFT JOIN plans p ON i.plan_id = p.id
    LEFT JOIN payments pay ON i.payment_id = pay.id
    LEFT JOIN refunds r ON r.invoice_id = i.id
    WHERE i.user_id = $1
    ORDER BY i.created_at DESC
  `, [req.user.id]);
  
  // Refund invoices (only completed refunds with invoice number)
  const refundInvoices = await db.query(`
    SELECT 
      r.id,
      r.refund_invoice_number as invoice_number,
      'refund' as invoice_type,
      r.amount as subtotal,
      0 as vat_amount,
      r.amount as total,
      r.refund_invoice_issued_at as created_at,
      r.payout_confirmed_at,
      r.bank_reference,
      p.name_ar as plan_name, p.name_en as plan_name_en,
      i.invoice_number as original_invoice_number
    FROM refunds r
    LEFT JOIN invoices i ON r.invoice_id = i.id
    LEFT JOIN plans p ON i.plan_id = p.id
    WHERE r.user_id = $1 
      AND r.refund_invoice_number IS NOT NULL
      AND r.status = 'completed'
    ORDER BY r.refund_invoice_issued_at DESC
  `, [req.user.id]);
  
  res.json({ 
    invoices: paymentInvoices.rows,
    refundInvoices: refundInvoices.rows
  });
}));

// Customer refund requests
router.get("/refunds", authMiddleware, asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT 
      r.*,
      i.invoice_number, i.total as invoice_total,
      p.name_ar as plan_name
    FROM refunds r
    LEFT JOIN invoices i ON r.invoice_id = i.id
    LEFT JOIN plans p ON i.plan_id = p.id
    WHERE r.user_id = $1
    ORDER BY r.created_at DESC
  `, [req.user.id]);
  
  res.json({ refunds: result.rows });
}));

// Customer request refund
router.post("/refunds", authMiddleware, asyncHandler(async (req, res) => {
  const { invoice_id, reason } = req.body;
  
  if (!invoice_id || !reason) {
    return res.status(400).json({ error: "رقم الفاتورة والسبب مطلوبان" });
  }
  
  // Check if invoice belongs to user
  const invoiceResult = await db.query(
    'SELECT * FROM invoices WHERE id = $1 AND user_id = $2',
    [invoice_id, req.user.id]
  );
  
  if (invoiceResult.rows.length === 0) {
    return res.status(404).json({ error: "الفاتورة غير موجودة" });
  }
  
  const invoice = invoiceResult.rows[0];
  
  // Check if refund already exists
  const existingRefund = await db.query(
    'SELECT id, status FROM refunds WHERE invoice_id = $1 AND status NOT IN ($2, $3)',
    [invoice_id, 'rejected', 'completed']
  );
  
  if (existingRefund.rows.length > 0) {
    return res.status(400).json({ error: "يوجد طلب استرداد سابق لهذه الفاتورة" });
  }
  
  // Get user_plan_id from payment or directly from invoice's plan
  let userPlanId = null;
  if (invoice.payment_id) {
    const paymentResult = await db.query(
      'SELECT user_plan_id FROM payments WHERE id = $1',
      [invoice.payment_id]
    );
    userPlanId = paymentResult.rows[0]?.user_plan_id || null;
  }
  
  // Create refund request with user_plan_id for proper quota cancellation
  const result = await db.query(`
    INSERT INTO refunds (user_id, user_plan_id, invoice_id, amount, reason, status, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), NOW())
    RETURNING *
  `, [req.user.id, userPlanId, invoice_id, parseFloat(invoice.subtotal), reason]);
  
  // Create notification for finance admins
  const financeAdmins = await db.query(
    "SELECT id FROM users WHERE role IN ('super_admin', 'finance_admin', 'admin')"
  );
  
  for (const admin of financeAdmins.rows) {
    await db.query(`
      INSERT INTO notifications (user_id, type, title, body, channel, status, payload, scheduled_at)
      VALUES ($1, 'refund_request', 'طلب استرداد جديد', $2, 'app', 'pending', $3, NOW())
    `, [
      admin.id,
      `طلب استرداد جديد من ${req.user.name || req.user.email} بمبلغ ${invoice.subtotal} ر.س`,
      JSON.stringify({ refund_id: result.rows[0].id, invoice_id })
    ]);
  }
  
  res.json({ ok: true, refund: result.rows[0], message: "تم تقديم طلب الاسترداد بنجاح" });
}));

// 🟢 جلب أعداد الشارات للمستخدم - GET /api/account/pending-counts
// أحمر = جديد (تم الرد عليه ولم يره المستخدم)، أصفر = قيد الانتظار
router.get("/pending-counts", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  // جلب أو إنشاء سجل حالة الشارات للمستخدم
  let badgeState = await db.query(
    `SELECT * FROM user_badge_state WHERE user_id = $1`, [userId]
  );
  
  if (badgeState.rows.length === 0) {
    await db.query(
      `INSERT INTO user_badge_state (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
    badgeState = await db.query(
      `SELECT * FROM user_badge_state WHERE user_id = $1`, [userId]
    );
  }
  
  const state = badgeState.rows[0] || {
    listings_seen_at: new Date(0),
    invoices_seen_at: new Date(0),
    complaints_seen_at: new Date(0),
    messages_seen_at: new Date(0),
    refunds_seen_at: new Date(0)
  };
  
  // الإعلانات: مرفوض = عدد المرفوضة، مقبول = عدد النشطة (approved)
  const listingsRejected = await db.query(`
    SELECT COUNT(*) as count FROM properties 
    WHERE user_id = $1 AND status = 'rejected'
  `, [userId]);
  
  const listingsApproved = await db.query(`
    SELECT COUNT(*) as count FROM properties 
    WHERE user_id = $1 AND status = 'approved'
  `, [userId]);
  
  const listingsPending = await db.query(`
    SELECT COUNT(*) as count FROM properties 
    WHERE user_id = $1 AND status = 'pending'
  `, [userId]);
  
  // الفواتير: جديد = فواتير أنشئت بعد آخر زيارة
  const invoicesNew = await db.query(`
    SELECT COUNT(*) as count FROM invoices 
    WHERE user_id = $1 AND created_at > $2
  `, [userId, state.invoices_seen_at]);
  
  // الشكاوى: جديد = تم الرد عليها بعد آخر زيارة، قيد الانتظار = new/in_review
  const complaintsNew = await db.query(`
    SELECT COUNT(*) as count FROM account_complaints 
    WHERE user_id = $1 
      AND status IN ('resolved', 'rejected')
      AND COALESCE(status_changed_at, updated_at, created_at) > $2
  `, [userId, state.complaints_seen_at]);
  
  const complaintsPending = await db.query(`
    SELECT COUNT(*) as count FROM account_complaints 
    WHERE user_id = $1 AND status IN ('new', 'in_review')
  `, [userId]);
  
  // الاسترداد: جديد = تمت الموافقة/الرفض/الإكمال بعد آخر زيارة، قيد الانتظار = pending
  const refundsNew = await db.query(`
    SELECT COUNT(*) as count FROM refunds 
    WHERE user_id = $1 
      AND status IN ('approved', 'rejected', 'completed')
      AND COALESCE(status_changed_at, updated_at, created_at) > $2
  `, [userId, state.refunds_seen_at]);
  
  const refundsPending = await db.query(`
    SELECT COUNT(*) as count FROM refunds 
    WHERE user_id = $1 AND status = 'pending'
  `, [userId]);
  
  // الرسائل: غير مقروءة
  const messagesNew = await db.query(`
    SELECT COUNT(*) as count FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE c.user_id = $1 AND m.sender_type = 'admin' AND m.is_read = false
  `, [userId]);
  
  // مكافآت السفير: إشعارات غير مقروءة من نوع ambassador
  const ambassadorRewards = await db.query(`
    SELECT COUNT(*) as count FROM notifications 
    WHERE user_id = $1 AND type = 'ambassador' AND read_at IS NULL
  `, [userId]);
  
  res.json({
    // إعلاناتي
    listingsRejected: parseInt(listingsRejected.rows[0]?.count) || 0,
    listingsApproved: parseInt(listingsApproved.rows[0]?.count) || 0,
    listingsPending: parseInt(listingsPending.rows[0]?.count) || 0,
    // فواتيري
    invoicesNew: parseInt(invoicesNew.rows[0]?.count) || 0,
    // شكاواي
    complaintsNew: parseInt(complaintsNew.rows[0]?.count) || 0,
    complaintsPending: parseInt(complaintsPending.rows[0]?.count) || 0,
    // استرداد
    refundsNew: parseInt(refundsNew.rows[0]?.count) || 0,
    refundsPending: parseInt(refundsPending.rows[0]?.count) || 0,
    // الرسائل
    messagesNew: parseInt(messagesNew.rows[0]?.count) || 0,
    // مكافآت السفير
    ambassadorRewards: parseInt(ambassadorRewards.rows[0]?.count) || 0
  });
}));

// 🟢 تحديث وقت آخر زيارة لقسم معين - PATCH /api/account/pending-counts/:scope/seen
// حماية CSRF: يتطلب Content-Type application/json
router.patch("/pending-counts/:scope/seen", authMiddleware, asyncHandler(async (req, res) => {
  // التحقق من Content-Type للحماية من CSRF
  const contentType = req.headers['content-type'];
  if (!contentType || !contentType.includes('application/json')) {
    return res.status(400).json({ error: "يجب إرسال طلب JSON" });
  }
  
  const userId = req.user.id;
  const { scope } = req.params;
  
  const validScopes = ['listings', 'invoices', 'complaints', 'messages', 'refunds'];
  if (!validScopes.includes(scope)) {
    return res.status(400).json({ error: "نطاق غير صالح" });
  }
  
  const columnName = `${scope}_seen_at`;
  
  await db.query(`
    INSERT INTO user_badge_state (user_id, ${columnName})
    VALUES ($1, NOW())
    ON CONFLICT (user_id) DO UPDATE SET ${columnName} = NOW(), updated_at = NOW()
  `, [userId]);
  
  res.json({ ok: true, message: "تم تحديث وقت الزيارة" });
}));

// ============================================
// 🔔 تنبيهات الحساب - Account Alerts
// ============================================

// جلب تنبيهات حسابي
router.get("/alerts", authMiddleware, asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT 
      aa.id, aa.alert_type, aa.title, aa.message, 
      aa.is_read, aa.created_at,
      a.name as admin_name
    FROM account_alerts aa
    LEFT JOIN users a ON aa.admin_id = a.id
    WHERE aa.user_id = $1
    ORDER BY aa.created_at DESC
  `, [req.user.id]);
  
  const unreadCount = result.rows.filter(a => !a.is_read).length;
  
  res.json({ 
    alerts: result.rows,
    unread_count: unreadCount
  });
}));

// عدد التنبيهات غير المقروءة
router.get("/alerts/unread-count", authMiddleware, asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT COUNT(*) as count FROM account_alerts 
    WHERE user_id = $1 AND is_read = FALSE
  `, [req.user.id]);
  
  res.json({ count: parseInt(result.rows[0]?.count) || 0 });
}));

// تحديد تنبيه كمقروء
router.patch("/alerts/:id/read", authMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  await db.query(`
    UPDATE account_alerts SET is_read = TRUE 
    WHERE id = $1 AND user_id = $2
  `, [id, req.user.id]);
  
  res.json({ ok: true });
}));

// تحديد جميع التنبيهات كمقروءة
router.patch("/alerts/mark-all-read", authMiddleware, asyncHandler(async (req, res) => {
  await db.query(`
    UPDATE account_alerts SET is_read = TRUE 
    WHERE user_id = $1 AND is_read = FALSE
  `, [req.user.id]);
  
  res.json({ ok: true, message: "تم تحديد جميع التنبيهات كمقروءة" });
}));

module.exports = router;
