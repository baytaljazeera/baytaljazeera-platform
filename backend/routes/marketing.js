// backend/routes/marketing.js - Marketing & Advertising Admin Routes
const express = require("express");
const db = require("../db");
const { authMiddleware, requireRoles } = require("../middleware/auth");
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();

// ========== CUSTOMER SEGMENTS ==========

// Get all customer segments
router.get("/segments", authMiddleware, requireRoles('super_admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT cs.*, 
      (SELECT COUNT(*) FROM user_segments WHERE segment_id = cs.id) as user_count
    FROM customer_segments cs
    ORDER BY cs.priority DESC
  `);
  res.json({ segments: result.rows });
}));

// Get users by segment
router.get("/segments/:segmentId/users", authMiddleware, requireRoles('super_admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const { segmentId } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const result = await db.query(`
    SELECT u.id, u.name, u.email, u.phone, u.whatsapp, u.created_at,
      u.last_login_at, u.login_count,
      (SELECT COUNT(*) FROM properties WHERE user_id = u.id) as listings_count,
      (SELECT COUNT(*) FROM properties WHERE user_id = u.id AND status = 'active') as active_listings,
      (SELECT p.name_ar FROM user_plans up JOIN plans p ON up.plan_id = p.id 
       WHERE up.user_id = u.id AND up.status = 'active' 
       ORDER BY up.started_at DESC LIMIT 1) as current_plan,
      (SELECT up.expires_at FROM user_plans up 
       WHERE up.user_id = u.id AND up.status = 'active' 
       ORDER BY up.started_at DESC LIMIT 1) as plan_expires_at,
      CASE 
        WHEN u.last_login_at IS NULL THEN 'لم يسجل دخول'
        WHEN u.last_login_at > NOW() - INTERVAL '7 days' THEN 'نشط جداً'
        WHEN u.last_login_at > NOW() - INTERVAL '30 days' THEN 'نشط'
        WHEN u.last_login_at > NOW() - INTERVAL '90 days' THEN 'غير نشط'
        ELSE 'متوقف'
      END as activity_status
    FROM users u
    JOIN user_segments us ON u.id = us.user_id
    WHERE us.segment_id = $1
    ORDER BY u.last_login_at DESC NULLS LAST
    LIMIT $2 OFFSET $3
  `, [segmentId, parseInt(limit), offset]);

  const countResult = await db.query(
    "SELECT COUNT(*) FROM user_segments WHERE segment_id = $1",
    [segmentId]
  );

  res.json({
    users: result.rows,
    total: parseInt(countResult.rows[0].count),
    page: parseInt(page),
    limit: parseInt(limit)
  });
}));

// Assign user to segment
router.post("/segments/:segmentId/users", authMiddleware, requireRoles('super_admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const { segmentId } = req.params;
  const { userIds } = req.body;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ error: "قائمة المستخدمين مطلوبة" });
  }

  let added = 0;
  for (const userId of userIds) {
    try {
      await db.query(`
        INSERT INTO user_segments (user_id, segment_id, assigned_by)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, segment_id) DO NOTHING
      `, [userId, segmentId, req.user.id]);
      added++;
    } catch (e) {
      // Skip duplicates
    }
  }

  res.json({ ok: true, message: `تم إضافة ${added} عميل للتصنيف` });
}));

// Remove user from segment
router.delete("/segments/:segmentId/users/:userId", authMiddleware, requireRoles('super_admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const { segmentId, userId } = req.params;
  await db.query("DELETE FROM user_segments WHERE segment_id = $1 AND user_id = $2", [segmentId, userId]);
  res.json({ ok: true, message: "تم إزالة العميل من التصنيف" });
}));

// Auto-assign segments based on criteria
router.post("/segments/auto-assign", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const results = { vip: 0, active: 0, new: 0, inactive: 0, churned: 0 };

  // أولاً: حذف جميع التصنيفات القديمة لإعادة التصنيف بشكل صحيح
  await db.query(`DELETE FROM user_segments`);

  // VIP: باقة مدفوعة + 3 عقارات أو أكثر + نشط (دخل خلال 30 يوم)
  const vipUsers = await db.query(`
    SELECT DISTINCT u.id FROM users u
    JOIN user_plans up ON u.id = up.user_id
    WHERE up.status = 'active' AND up.plan_id > 1
      AND (SELECT COUNT(*) FROM properties WHERE user_id = u.id) >= 3
      AND u.last_login_at IS NOT NULL 
      AND u.last_login_at > NOW() - INTERVAL '30 days'
  `);
  for (const user of vipUsers.rows) {
    await db.query(`
      INSERT INTO user_segments (user_id, segment_id)
      SELECT $1, id FROM customer_segments WHERE name = 'vip'
      ON CONFLICT DO NOTHING
    `, [user.id]);
    results.vip++;
  }

  // نشط: دخل خلال 14 يوم ولديه عقار نشط
  const activeUsers = await db.query(`
    SELECT DISTINCT u.id FROM users u
    JOIN properties p ON u.id = p.user_id
    WHERE p.status = 'active'
      AND u.role = 'user'
      AND (u.last_login_at IS NOT NULL AND u.last_login_at > NOW() - INTERVAL '14 days')
      AND u.id NOT IN (SELECT user_id FROM user_segments)
  `);
  for (const user of activeUsers.rows) {
    await db.query(`
      INSERT INTO user_segments (user_id, segment_id)
      SELECT $1, id FROM customer_segments WHERE name = 'active'
      ON CONFLICT DO NOTHING
    `, [user.id]);
    results.active++;
  }

  // جديد: سجل خلال 30 يوم
  const newUsers = await db.query(`
    SELECT id FROM users 
    WHERE role = 'user' 
      AND created_at > NOW() - INTERVAL '30 days'
      AND id NOT IN (SELECT user_id FROM user_segments)
  `);
  for (const user of newUsers.rows) {
    await db.query(`
      INSERT INTO user_segments (user_id, segment_id)
      SELECT $1, id FROM customer_segments WHERE name = 'new'
      ON CONFLICT DO NOTHING
    `, [user.id]);
    results.new++;
  }

  // غير نشط: لم يدخل منذ 30-90 يوم
  const inactiveUsers = await db.query(`
    SELECT u.id FROM users u
    WHERE u.role = 'user'
      AND (
        (u.last_login_at IS NOT NULL AND u.last_login_at < NOW() - INTERVAL '30 days' AND u.last_login_at > NOW() - INTERVAL '90 days')
        OR (u.last_login_at IS NULL AND u.created_at < NOW() - INTERVAL '30 days' AND u.created_at > NOW() - INTERVAL '90 days')
      )
      AND u.id NOT IN (SELECT user_id FROM user_segments)
  `);
  for (const user of inactiveUsers.rows) {
    await db.query(`
      INSERT INTO user_segments (user_id, segment_id)
      SELECT $1, id FROM customer_segments WHERE name = 'inactive'
      ON CONFLICT DO NOTHING
    `, [user.id]);
    results.inactive++;
  }

  // متوقف: لم يدخل منذ أكثر من 90 يوم أو باقة منتهية
  const churnedUsers = await db.query(`
    SELECT u.id FROM users u
    WHERE u.role = 'user'
      AND (
        (u.last_login_at IS NOT NULL AND u.last_login_at < NOW() - INTERVAL '90 days')
        OR (u.last_login_at IS NULL AND u.created_at < NOW() - INTERVAL '90 days')
        OR EXISTS (
          SELECT 1 FROM user_plans up 
          WHERE up.user_id = u.id AND up.expires_at < NOW() AND up.plan_id > 1
            AND NOT EXISTS (
              SELECT 1 FROM user_plans up2 
              WHERE up2.user_id = u.id AND up2.status = 'active' AND up2.expires_at > NOW()
            )
        )
      )
      AND u.id NOT IN (SELECT user_id FROM user_segments)
  `);
  for (const user of churnedUsers.rows) {
    await db.query(`
      INSERT INTO user_segments (user_id, segment_id)
      SELECT $1, id FROM customer_segments WHERE name = 'churned'
      ON CONFLICT DO NOTHING
    `, [user.id]);
    results.churned++;
  }

  res.json({ ok: true, message: "تم تصنيف العملاء تلقائياً", results });
}));

// ========== EMAIL CAMPAIGNS ==========

// Get email templates
router.get("/email-templates", authMiddleware, requireRoles('super_admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT * FROM email_templates ORDER BY created_at DESC
  `);
  res.json({ templates: result.rows });
}));

// Create email template
router.post("/email-templates", authMiddleware, requireRoles('super_admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const { name, subject, content, category, variables } = req.body;
  if (!name || !subject || !content) {
    return res.status(400).json({ error: "جميع الحقول مطلوبة" });
  }
  const result = await db.query(`
    INSERT INTO email_templates (name, subject, content, category, variables, created_by)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [name, subject, content, category || 'general', JSON.stringify(variables || []), req.user.id]);
  res.json({ ok: true, template: result.rows[0] });
}));

// Delete email template
router.delete("/email-templates/:id", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  await db.query("DELETE FROM email_templates WHERE id = $1", [req.params.id]);
  res.json({ ok: true, message: "تم حذف القالب" });
}));

// Get email campaigns
router.get("/email-campaigns", authMiddleware, requireRoles('super_admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT ec.*, u.name as created_by_name
    FROM email_campaigns ec
    LEFT JOIN users u ON ec.created_by = u.id
    ORDER BY ec.created_at DESC
    LIMIT 50
  `);
  res.json({ campaigns: result.rows });
}));

// Create email campaign
router.post("/email-campaigns", authMiddleware, requireRoles('super_admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const { name, subject, content, template_id, segment_filter, scheduled_at } = req.body;
  if (!name || !subject || !content) {
    return res.status(400).json({ error: "اسم الحملة والموضوع والمحتوى مطلوبة" });
  }
  const result = await db.query(`
    INSERT INTO email_campaigns (name, subject, content, template_id, segment_filter, scheduled_at, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [name, subject, content, template_id || null, JSON.stringify(segment_filter || {}), scheduled_at || null, req.user.id]);
  res.json({ ok: true, campaign: result.rows[0] });
}));

// Send email campaign (bulk)
router.post("/email-campaigns/:id/send", authMiddleware, requireRoles('super_admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { recipientIds, segmentId } = req.body;

  // Get campaign
  const campaignResult = await db.query("SELECT * FROM email_campaigns WHERE id = $1", [id]);
  if (campaignResult.rows.length === 0) {
    return res.status(404).json({ error: "الحملة غير موجودة" });
  }
  const campaign = campaignResult.rows[0];

  // Get recipients
  let users = [];
  if (recipientIds && recipientIds.length > 0) {
    const usersResult = await db.query(
      "SELECT id, email, name FROM users WHERE id = ANY($1) AND email IS NOT NULL",
      [recipientIds]
    );
    users = usersResult.rows;
  } else if (segmentId) {
    const usersResult = await db.query(`
      SELECT u.id, u.email, u.name FROM users u
      JOIN user_segments us ON u.id = us.user_id
      WHERE us.segment_id = $1 AND u.email IS NOT NULL
    `, [segmentId]);
    users = usersResult.rows;
  } else {
    return res.status(400).json({ error: "يجب تحديد المستلمين أو التصنيف" });
  }

  if (users.length === 0) {
    return res.status(400).json({ error: "لا يوجد مستلمين" });
  }

  // Log emails (actual sending would be via email service)
  let sentCount = 0;
  for (const user of users) {
    await db.query(`
      INSERT INTO email_logs (campaign_id, user_id, email, subject, status, sent_at)
      VALUES ($1, $2, $3, $4, 'queued', NOW())
    `, [id, user.id, user.email, campaign.subject]);
    sentCount++;
  }

  // Update campaign
  await db.query(`
    UPDATE email_campaigns 
    SET total_recipients = $1, sent_count = $2, status = 'sent', sent_at = NOW()
    WHERE id = $3
  `, [users.length, sentCount, id]);

  res.json({
    ok: true,
    message: `تم إرسال الحملة إلى ${sentCount} مستلم`,
    sentCount
  });
}));

// ========== GOOGLE REVIEW ==========

// Public endpoint to get Google review link (for customer rating page)
router.get("/google-review/link", asyncHandler(async (req, res) => {
  const result = await db.query(
    "SELECT value FROM app_settings WHERE key = 'google_review_link'"
  );
  res.json({ link: result.rows[0]?.value || "" });
}));

// Get Google review settings (admin)
router.get("/google-review/settings", authMiddleware, requireRoles('super_admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT key, value FROM app_settings 
    WHERE key IN ('google_review_link', 'google_place_id')
  `);
  const settings = {};
  result.rows.forEach(r => settings[r.key] = r.value);
  
  // Get stats
  const statsResult = await db.query(`
    SELECT 
      COUNT(*) as total_sent,
      COUNT(clicked_at) as total_clicked,
      COUNT(CASE WHEN reviewed THEN 1 END) as total_reviewed
    FROM google_review_requests
  `);
  
  res.json({ settings, stats: statsResult.rows[0] });
}));

// Update Google review settings
router.put("/google-review/settings", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const { google_review_link, google_place_id } = req.body;
  
  if (google_review_link !== undefined) {
    await db.query(`
      UPDATE app_settings SET value = $1, updated_at = NOW() 
      WHERE key = 'google_review_link'
    `, [google_review_link]);
  }
  
  if (google_place_id !== undefined) {
    await db.query(`
      UPDATE app_settings SET value = $1, updated_at = NOW() 
      WHERE key = 'google_place_id'
    `, [google_place_id]);
  }
  
  res.json({ ok: true, message: "تم تحديث الإعدادات" });
}));

// Send Google review request to users
router.post("/google-review/send", authMiddleware, requireRoles('super_admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const { userIds, sendVia = 'email' } = req.body;
  
  if (!userIds || userIds.length === 0) {
    return res.status(400).json({ error: "يجب تحديد المستلمين" });
  }

  // Get Google review link
  const linkResult = await db.query("SELECT value FROM app_settings WHERE key = 'google_review_link'");
  if (!linkResult.rows[0]?.value) {
    return res.status(400).json({ error: "يجب إعداد رابط التقييم في Google أولاً" });
  }

  let sentCount = 0;
  for (const userId of userIds) {
    await db.query(`
      INSERT INTO google_review_requests (user_id, sent_via)
      VALUES ($1, $2)
    `, [userId, sendVia]);
    sentCount++;
  }

  res.json({
    ok: true,
    message: `تم إرسال طلب التقييم إلى ${sentCount} عميل`,
    reviewLink: linkResult.rows[0].value
  });
}));

// ========== QUICK ACTIONS ==========

// Get users for quick email/whatsapp (with filters)
router.get("/users-for-campaign", authMiddleware, requireRoles('super_admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const { segmentId, search, hasEmail, hasPhone, hasWhatsapp, limit = 100 } = req.query;
  
  let whereClause = "WHERE u.role = 'user'";
  const params = [];
  let paramIndex = 1;

  if (segmentId) {
    whereClause += ` AND EXISTS (SELECT 1 FROM user_segments WHERE user_id = u.id AND segment_id = $${paramIndex})`;
    params.push(segmentId);
    paramIndex++;
  }

  if (search) {
    whereClause += ` AND (u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex} OR u.phone ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  if (hasEmail === 'true') {
    whereClause += " AND u.email IS NOT NULL";
  }

  if (hasPhone === 'true') {
    whereClause += " AND u.phone IS NOT NULL";
  }

  if (hasWhatsapp === 'true') {
    whereClause += " AND u.whatsapp IS NOT NULL";
  }

  params.push(parseInt(limit));

  const result = await db.query(`
    SELECT u.id, u.name, u.email, u.phone, u.whatsapp, u.created_at,
      (SELECT array_agg(cs.name_ar) FROM user_segments us 
       JOIN customer_segments cs ON us.segment_id = cs.id 
       WHERE us.user_id = u.id) as segments
    FROM users u
    ${whereClause}
    ORDER BY u.created_at DESC
    LIMIT $${paramIndex}
  `, params);

  res.json({ users: result.rows });
}));

router.get("/stats", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const totalClientsResult = await db.query(`
    SELECT COUNT(*) as count FROM users WHERE role = 'user'
  `);
  const totalClients = parseInt(totalClientsResult.rows[0].count);

  const activeClientsResult = await db.query(`
    SELECT COUNT(DISTINCT user_id) as count FROM properties WHERE status = 'active'
  `);
  const activeClients = parseInt(activeClientsResult.rows[0].count);

  const clientsWithAdsResult = await db.query(`
    SELECT COUNT(DISTINCT user_id) as count FROM properties
  `);
  const clientsWithAds = parseInt(clientsWithAdsResult.rows[0].count);

  const avgRatingResult = await db.query(`
    SELECT COALESCE(AVG(rating), 0) as avg, COUNT(*) as count 
    FROM client_ratings WHERE rating_type = 'service'
  `);
  const avgRating = parseFloat(avgRatingResult.rows[0].avg) || 0;
  const totalRatings = parseInt(avgRatingResult.rows[0].count);

  const ratingDistributionResult = await db.query(`
    SELECT rating, COUNT(*) as count
    FROM client_ratings 
    WHERE rating_type = 'service'
    GROUP BY rating
    ORDER BY rating DESC
  `);

  const satisfiedClientsResult = await db.query(`
    SELECT COUNT(DISTINCT user_id) as count 
    FROM client_ratings 
    WHERE rating >= 4 AND rating_type = 'service'
  `);
  const satisfiedClients = parseInt(satisfiedClientsResult.rows[0].count);

  const upgradesResult = await db.query(`
    SELECT COUNT(*) as count FROM user_plans 
    WHERE plan_id > 1 AND status = 'active'
  `);
  const totalUpgrades = parseInt(upgradesResult.rows[0].count);

  const totalListingsResult = await db.query(`
    SELECT COUNT(*) as count FROM properties
  `);
  const totalListings = parseInt(totalListingsResult.rows[0].count);

  const activeListingsResult = await db.query(`
    SELECT COUNT(*) as count FROM properties WHERE status = 'active'
  `);
  const activeListings = parseInt(activeListingsResult.rows[0].count);

  const planUpgradesResult = await db.query(`
    SELECT p.name_ar, p.color, COUNT(up.id) as count
    FROM plans p
    LEFT JOIN user_plans up ON p.id = up.plan_id AND up.status = 'active'
    WHERE p.price > 0 AND p.visible = true
    GROUP BY p.id, p.name_ar, p.color
    ORDER BY p.sort_order
  `);

  const monthlyNewClientsResult = await db.query(`
    SELECT 
      TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
      COUNT(*) as count
    FROM users 
    WHERE role = 'user' AND created_at >= NOW() - INTERVAL '12 months'
    GROUP BY DATE_TRUNC('month', created_at)
    ORDER BY month DESC
    LIMIT 12
  `);

  const retentionResult = await db.query(`
    WITH first_plan AS (
      SELECT user_id, MIN(started_at) as first_subscription
      FROM user_plans WHERE plan_id > 1
      GROUP BY user_id
    ),
    renewed AS (
      SELECT fp.user_id
      FROM first_plan fp
      JOIN user_plans up ON fp.user_id = up.user_id
      WHERE up.started_at > fp.first_subscription + INTERVAL '30 days'
        AND up.plan_id > 1
    )
    SELECT 
      (SELECT COUNT(*) FROM first_plan) as first_time_subscribers,
      (SELECT COUNT(*) FROM renewed) as renewed_subscribers
  `);
  
  const firstTimeSubscribers = parseInt(retentionResult.rows[0]?.first_time_subscribers) || 0;
  const renewedSubscribers = parseInt(retentionResult.rows[0]?.renewed_subscribers) || 0;
  const retentionRate = firstTimeSubscribers > 0 ? 
    Math.round((renewedSubscribers / firstTimeSubscribers) * 100) : 0;

  res.json({
    clients: {
      total: totalClients,
      active: activeClients,
      withAds: clientsWithAds,
      satisfied: satisfiedClients
    },
    ratings: {
      average: Math.round(avgRating * 10) / 10,
      total: totalRatings,
      distribution: ratingDistributionResult.rows,
      satisfactionRate: totalRatings > 0 ? Math.round((satisfiedClients / totalRatings) * 100) : 0
    },
    listings: {
      total: totalListings,
      active: activeListings
    },
    upgrades: {
      total: totalUpgrades,
      byPlan: planUpgradesResult.rows
    },
    retention: {
      firstTimeSubscribers,
      renewedSubscribers,
      rate: retentionRate
    },
    monthlyNewClients: monthlyNewClientsResult.rows
  });
}));

router.get("/clients", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, sortBy = 'listings', search } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  
  let whereClause = "WHERE u.role = 'user'";
  const params = [];
  let paramIndex = 1;
  
  if (search) {
    whereClause += ` AND (u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex} OR u.phone ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }
  
  params.push(parseInt(limit), offset);
  
  const result = await db.query(`
    SELECT 
      u.id, u.name, u.email, u.phone, u.created_at,
      (SELECT COUNT(*) FROM properties WHERE user_id = u.id) as listings_count,
      (SELECT COUNT(*) FROM properties WHERE user_id = u.id AND status = 'active') as active_listings,
      (SELECT p.name_ar FROM user_plans up JOIN plans p ON up.plan_id = p.id 
       WHERE up.user_id = u.id AND up.status = 'active' 
       ORDER BY up.started_at DESC LIMIT 1) as current_plan,
      (SELECT COALESCE(AVG(rating), 0) FROM client_ratings WHERE user_id = u.id) as avg_rating,
      (SELECT COUNT(*) FROM user_plans WHERE user_id = u.id AND plan_id > 1) as upgrades_count
    FROM users u
    ${whereClause}
    ORDER BY ${sortBy === 'rating' ? 'avg_rating' : 
              sortBy === 'upgrades' ? 'upgrades_count' : 
              sortBy === 'recent' ? 'u.created_at' : 'listings_count'} DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, params);
  
  const countResult = await db.query(`
    SELECT COUNT(*) as total FROM users u ${whereClause}
  `, params.slice(0, -2));
  
  res.json({
    clients: result.rows,
    total: parseInt(countResult.rows[0].total),
    page: parseInt(page),
    limit: parseInt(limit)
  });
}));

router.get("/clients/:userId", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const { userId } = req.params;
  
  const userResult = await db.query(`
    SELECT id, name, email, phone, created_at, status
    FROM users WHERE id = $1
  `, [userId]);
  
  if (userResult.rows.length === 0) {
    return res.status(404).json({ error: "المستخدم غير موجود" });
  }
  
  const listingsResult = await db.query(`
    SELECT id, title, status, created_at, city, price, type
    FROM properties 
    WHERE user_id = $1
    ORDER BY created_at DESC
  `, [userId]);
  
  const plansHistoryResult = await db.query(`
    SELECT up.*, p.name_ar as plan_name, p.price as plan_price
    FROM user_plans up
    JOIN plans p ON up.plan_id = p.id
    WHERE up.user_id = $1
    ORDER BY up.started_at DESC
  `, [userId]);
  
  const ratingsResult = await db.query(`
    SELECT * FROM client_ratings WHERE user_id = $1 ORDER BY created_at DESC
  `, [userId]);
  
  res.json({
    user: userResult.rows[0],
    listings: listingsResult.rows,
    plansHistory: plansHistoryResult.rows,
    ratings: ratingsResult.rows
  });
}));

router.get("/ratings", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const { minRating, maxRating, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  
  let whereClause = "WHERE 1=1";
  const params = [];
  let paramIndex = 1;
  
  if (minRating) {
    whereClause += ` AND cr.rating >= $${paramIndex}`;
    params.push(parseInt(minRating));
    paramIndex++;
  }
  
  if (maxRating) {
    whereClause += ` AND cr.rating <= $${paramIndex}`;
    params.push(parseInt(maxRating));
    paramIndex++;
  }
  
  params.push(parseInt(limit), offset);
  
  const result = await db.query(`
    SELECT 
      cr.*,
      u.name as user_name, u.email as user_email
    FROM client_ratings cr
    JOIN users u ON cr.user_id = u.id
    ${whereClause}
    ORDER BY cr.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, params);
  
  res.json({ ratings: result.rows });
}));

router.post("/ratings", authMiddleware, asyncHandler(async (req, res) => {
  const { rating, feedback, ratingType = 'service' } = req.body;
  const userId = req.user.id;
  
  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "التقييم يجب أن يكون بين 1 و 5" });
  }
  
  const result = await db.query(`
    INSERT INTO client_ratings (user_id, rating, feedback, rating_type)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [userId, rating, feedback || null, ratingType]);
  
  res.json({ ok: true, rating: result.rows[0] });
}));

router.get("/retargeting", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const inactiveClientsResult = await db.query(`
    SELECT 
      u.id, u.name, u.email, u.phone, u.created_at,
      MAX(p.created_at) as last_listing_date,
      COUNT(p.id) as total_listings
    FROM users u
    LEFT JOIN properties p ON u.id = p.user_id
    WHERE u.role = 'user'
    GROUP BY u.id
    HAVING MAX(p.created_at) < NOW() - INTERVAL '30 days' 
       OR MAX(p.created_at) IS NULL
    ORDER BY last_listing_date DESC NULLS LAST
    LIMIT 50
  `);

  const expiredSubscriptionsResult = await db.query(`
    SELECT 
      u.id, u.name, u.email, u.phone,
      p.name_ar as last_plan,
      up.expires_at
    FROM users u
    JOIN user_plans up ON u.id = up.user_id
    JOIN plans p ON up.plan_id = p.id
    WHERE up.expires_at < NOW()
      AND up.expires_at > NOW() - INTERVAL '30 days'
      AND up.plan_id > 1
      AND NOT EXISTS (
        SELECT 1 FROM user_plans up2 
        WHERE up2.user_id = u.id 
          AND up2.status = 'active' 
          AND (up2.expires_at IS NULL OR up2.expires_at > NOW())
      )
    ORDER BY up.expires_at DESC
    LIMIT 50
  `);

  const lowSatisfactionResult = await db.query(`
    SELECT 
      u.id, u.name, u.email, u.phone,
      cr.rating, cr.feedback, cr.created_at
    FROM client_ratings cr
    JOIN users u ON cr.user_id = u.id
    WHERE cr.rating <= 2
    ORDER BY cr.created_at DESC
    LIMIT 50
  `);
  
  res.json({
    inactiveClients: inactiveClientsResult.rows,
    expiredSubscriptions: expiredSubscriptionsResult.rows,
    lowSatisfaction: lowSatisfactionResult.rows
  });
}));

module.exports = router;
