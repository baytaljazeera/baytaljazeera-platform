const express = require("express");
const router = express.Router();
const db = require("../db");
const { authMiddleware, adminOnly, optionalAuth } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");

const POINTS_PER_RATING = 10;
const TRUSTED_BADGE_THRESHOLD = 10;
const ACTIVE_RATER_THRESHOLD = 5;
const MIN_MESSAGES_TO_RATE = 3;

router.post("/submit", authMiddleware, asyncHandler(async (req, res) => {
  const { advertiser_id, listing_id, rating, quick_rating, comment } = req.body;
  const raterId = req.user.id;

  if (!advertiser_id || !rating) {
    return res.status(400).json({ error: "معرف المعلن والتقييم مطلوبان" });
  }

  if (rating < 1 || rating > 5) {
    return res.status(400).json({ error: "التقييم يجب أن يكون بين 1 و 5" });
  }

  if (raterId === advertiser_id) {
    return res.status(400).json({ error: "لا يمكنك تقييم نفسك" });
  }

  const msgCheck = await db.query(`
    SELECT COUNT(*) as count FROM listing_messages 
    WHERE ((sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1))
    ${listing_id ? 'AND listing_id = $3' : ''}
  `, listing_id ? [raterId, advertiser_id, listing_id] : [raterId, advertiser_id]);

  if (parseInt(msgCheck.rows[0].count) < MIN_MESSAGES_TO_RATE) {
    return res.status(400).json({ 
      error: `يجب تبادل ${MIN_MESSAGES_TO_RATE} رسائل على الأقل قبل التقييم` 
    });
  }

  const existingRating = await db.query(`
    SELECT id FROM advertiser_ratings 
    WHERE rater_id = $1 AND advertiser_id = $2 
    ${listing_id ? 'AND listing_id = $3' : 'AND listing_id IS NULL'}
  `, listing_id ? [raterId, advertiser_id, listing_id] : [raterId, advertiser_id]);

  if (existingRating.rows.length > 0) {
    return res.status(400).json({ error: "لقد قمت بتقييم هذا المعلن مسبقاً لهذا الإعلان" });
  }

  const conversationId = `${raterId}___${listing_id || advertiser_id}`;
  const autoApprove = rating >= 3;

  const result = await db.query(`
    INSERT INTO advertiser_ratings 
    (advertiser_id, rater_id, listing_id, conversation_id, rating, quick_rating, comment, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id
  `, [advertiser_id, raterId, listing_id || null, conversationId, rating, quick_rating || null, comment || null, autoApprove ? 'approved' : 'pending']);

  const ratingId = result.rows[0].id;

  await db.query(`
    INSERT INTO rating_rewards (user_id, points, reason, rating_id)
    VALUES ($1, $2, $3, $4)
  `, [raterId, POINTS_PER_RATING, 'تقييم معلن', ratingId]);

  await db.query(`
    UPDATE users SET reward_points = COALESCE(reward_points, 0) + $1 WHERE id = $2
  `, [POINTS_PER_RATING, raterId]);

  const raterStats = await db.query(`
    SELECT COUNT(*) as count FROM advertiser_ratings WHERE rater_id = $1
  `, [raterId]);

  if (parseInt(raterStats.rows[0].count) >= ACTIVE_RATER_THRESHOLD) {
    await db.query(`UPDATE users SET active_rater_badge = true WHERE id = $1`, [raterId]);
  }

  if (autoApprove) {
    await updateAdvertiserReputation(advertiser_id);
  }

  res.json({ 
    success: true, 
    message: autoApprove ? "شكراً لتقييمك!" : "شكراً! سيتم مراجعة تقييمك",
    points_earned: POINTS_PER_RATING,
    rating_id: ratingId
  });
}));

router.get("/advertiser/:userId", optionalAuth, asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  const reputation = await db.query(`
    SELECT * FROM advertiser_reputation WHERE user_id = $1
  `, [userId]);

  const ratings = await db.query(`
    SELECT 
      ar.id, ar.rating, ar.quick_rating, ar.comment, ar.advertiser_reply,
      ar.advertiser_reply_at, ar.created_at,
      u.name as rater_name
    FROM advertiser_ratings ar
    LEFT JOIN users u ON ar.rater_id = u.id
    WHERE ar.advertiser_id = $1 AND ar.status = 'approved'
    ORDER BY ar.created_at DESC
    LIMIT $2 OFFSET $3
  `, [userId, limit, offset]);

  const countResult = await db.query(`
    SELECT COUNT(*) FROM advertiser_ratings WHERE advertiser_id = $1 AND status = 'approved'
  `, [userId]);

  const user = await db.query(`
    SELECT name, created_at FROM users WHERE id = $1
  `, [userId]);

  const rep = reputation.rows[0] || {
    total_ratings: 0,
    average_rating: 0,
    positive_count: 0,
    neutral_count: 0,
    negative_count: 0,
    response_rate: 0,
    trusted_badge: false
  };

  let responseSpeed = 'غير محدد';
  if (rep.avg_response_time_hours) {
    if (rep.avg_response_time_hours <= 1) responseSpeed = 'سريع جداً ⚡';
    else if (rep.avg_response_time_hours <= 6) responseSpeed = 'سريع';
    else if (rep.avg_response_time_hours <= 24) responseSpeed = 'متوسط';
    else responseSpeed = 'بطيء';
  }

  res.json({
    reputation: {
      ...rep,
      response_speed: responseSpeed,
      member_since: user.rows[0]?.created_at,
      advertiser_name: user.rows[0]?.name
    },
    ratings: ratings.rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: parseInt(countResult.rows[0].count)
    }
  });
}));

router.post("/reply/:ratingId", authMiddleware, asyncHandler(async (req, res) => {
  const { ratingId } = req.params;
  const { reply } = req.body;
  const userId = req.user.id;

  if (!reply || reply.trim().length === 0) {
    return res.status(400).json({ error: "الرد مطلوب" });
  }

  if (reply.length > 500) {
    return res.status(400).json({ error: "الرد يجب ألا يتجاوز 500 حرف" });
  }

  const rating = await db.query(`
    SELECT id, advertiser_id, advertiser_reply FROM advertiser_ratings WHERE id = $1
  `, [ratingId]);

  if (rating.rows.length === 0) {
    return res.status(404).json({ error: "التقييم غير موجود" });
  }

  if (rating.rows[0].advertiser_id !== userId) {
    return res.status(403).json({ error: "لا يمكنك الرد على هذا التقييم" });
  }

  if (rating.rows[0].advertiser_reply) {
    return res.status(400).json({ error: "لقد قمت بالرد على هذا التقييم مسبقاً" });
  }

  await db.query(`
    UPDATE advertiser_ratings 
    SET advertiser_reply = $1, advertiser_reply_at = NOW(), updated_at = NOW()
    WHERE id = $2
  `, [reply.trim(), ratingId]);

  res.json({ success: true, message: "تم إضافة ردك بنجاح" });
}));

router.get("/can-rate/:advertiserId", authMiddleware, asyncHandler(async (req, res) => {
  const { advertiserId } = req.params;
  const { listing_id } = req.query;
  const raterId = req.user.id;

  if (raterId === advertiserId) {
    return res.json({ can_rate: false, reason: "لا يمكنك تقييم نفسك" });
  }

  const msgCheck = await db.query(`
    SELECT COUNT(*) as count FROM listing_messages 
    WHERE ((sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1))
    ${listing_id ? 'AND listing_id = $3' : ''}
  `, listing_id ? [raterId, advertiserId, listing_id] : [raterId, advertiserId]);

  if (parseInt(msgCheck.rows[0].count) < MIN_MESSAGES_TO_RATE) {
    return res.json({ 
      can_rate: false, 
      reason: `يجب تبادل ${MIN_MESSAGES_TO_RATE} رسائل على الأقل`,
      messages_exchanged: parseInt(msgCheck.rows[0].count),
      messages_required: MIN_MESSAGES_TO_RATE
    });
  }

  const existingRating = await db.query(`
    SELECT id FROM advertiser_ratings 
    WHERE rater_id = $1 AND advertiser_id = $2 
    ${listing_id ? 'AND listing_id = $3' : 'AND listing_id IS NULL'}
  `, listing_id ? [raterId, advertiserId, listing_id] : [raterId, advertiserId]);

  if (existingRating.rows.length > 0) {
    return res.json({ can_rate: false, reason: "لقد قمت بتقييم هذا المعلن مسبقاً" });
  }

  res.json({ can_rate: true });
}));

router.get("/my-points", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const user = await db.query(`
    SELECT reward_points, active_rater_badge FROM users WHERE id = $1
  `, [userId]);

  const history = await db.query(`
    SELECT points, reason, created_at FROM rating_rewards 
    WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20
  `, [userId]);

  const stats = await db.query(`
    SELECT COUNT(*) as total_ratings FROM advertiser_ratings WHERE rater_id = $1
  `, [userId]);

  res.json({
    points: user.rows[0]?.reward_points || 0,
    active_rater_badge: user.rows[0]?.active_rater_badge || false,
    total_ratings_given: parseInt(stats.rows[0].total_ratings),
    history: history.rows
  });
}));

router.get("/admin/pending", authMiddleware, adminOnly, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  const ratings = await db.query(`
    SELECT 
      ar.*,
      rater.name as rater_name, rater.email as rater_email,
      advertiser.name as advertiser_name, advertiser.email as advertiser_email,
      p.title as listing_title
    FROM advertiser_ratings ar
    LEFT JOIN users rater ON ar.rater_id = rater.id
    LEFT JOIN users advertiser ON ar.advertiser_id = advertiser.id
    LEFT JOIN properties p ON ar.listing_id = p.id
    WHERE ar.status = 'pending'
    ORDER BY ar.created_at DESC
    LIMIT $1 OFFSET $2
  `, [limit, offset]);

  const countResult = await db.query(`
    SELECT COUNT(*) FROM advertiser_ratings WHERE status = 'pending'
  `);

  res.json({
    ratings: ratings.rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: parseInt(countResult.rows[0].count)
    }
  });
}));

router.patch("/admin/:ratingId", authMiddleware, adminOnly, asyncHandler(async (req, res) => {
  const { ratingId } = req.params;
  const { status, admin_notes } = req.body;
  const adminId = req.user.id;

  if (!['approved', 'rejected', 'hidden'].includes(status)) {
    return res.status(400).json({ error: "حالة غير صالحة" });
  }

  const rating = await db.query(`
    SELECT advertiser_id FROM advertiser_ratings WHERE id = $1
  `, [ratingId]);

  if (rating.rows.length === 0) {
    return res.status(404).json({ error: "التقييم غير موجود" });
  }

  await db.query(`
    UPDATE advertiser_ratings 
    SET status = $1, admin_notes = $2, reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW()
    WHERE id = $4
  `, [status, admin_notes || null, adminId, ratingId]);

  if (status === 'approved') {
    await updateAdvertiserReputation(rating.rows[0].advertiser_id);
  }

  res.json({ success: true, message: "تم تحديث حالة التقييم" });
}));

router.get("/admin/all", authMiddleware, adminOnly, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, advertiser_id } = req.query;
  const offset = (page - 1) * limit;

  let whereClause = "1=1";
  const params = [];
  let paramIndex = 1;

  if (status) {
    whereClause += ` AND ar.status = $${paramIndex++}`;
    params.push(status);
  }
  if (advertiser_id) {
    whereClause += ` AND ar.advertiser_id = $${paramIndex++}`;
    params.push(advertiser_id);
  }

  params.push(limit, offset);

  const ratings = await db.query(`
    SELECT 
      ar.*,
      rater.name as rater_name,
      advertiser.name as advertiser_name,
      p.title as listing_title,
      reviewer.name as reviewer_name
    FROM advertiser_ratings ar
    LEFT JOIN users rater ON ar.rater_id = rater.id
    LEFT JOIN users advertiser ON ar.advertiser_id = advertiser.id
    LEFT JOIN properties p ON ar.listing_id = p.id
    LEFT JOIN users reviewer ON ar.reviewed_by = reviewer.id
    WHERE ${whereClause}
    ORDER BY ar.created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex}
  `, params);

  const countParams = params.slice(0, -2);
  const countResult = await db.query(`
    SELECT COUNT(*) FROM advertiser_ratings ar WHERE ${whereClause}
  `, countParams);

  res.json({
    ratings: ratings.rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: parseInt(countResult.rows[0].count)
    }
  });
}));

async function updateAdvertiserReputation(advertiserId) {
  try {
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total,
        AVG(rating) as avg_rating,
        SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) as positive,
        SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as neutral,
        SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) as negative
      FROM advertiser_ratings 
      WHERE advertiser_id = $1 AND status = 'approved'
    `, [advertiserId]);

    const msgStats = await db.query(`
      SELECT 
        COUNT(DISTINCT CASE WHEN sender_id = $1 THEN recipient_id END) as replied_to,
        COUNT(DISTINCT recipient_id) as total_received
      FROM listing_messages
      WHERE recipient_id = $1 OR sender_id = $1
    `, [advertiserId]);

    const s = stats.rows[0];
    const m = msgStats.rows[0];
    const total = parseInt(s.total) || 0;
    const avgRating = parseFloat(s.avg_rating) || 0;
    const responseRate = m.total_received > 0 ? (m.replied_to / m.total_received * 100) : 0;
    const trustedBadge = total >= TRUSTED_BADGE_THRESHOLD && avgRating >= 4.0;

    await db.query(`
      INSERT INTO advertiser_reputation 
      (user_id, total_ratings, average_rating, positive_count, neutral_count, negative_count, 
       response_rate, trusted_badge, trusted_badge_at, last_calculated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        total_ratings = $2,
        average_rating = $3,
        positive_count = $4,
        neutral_count = $5,
        negative_count = $6,
        response_rate = $7,
        trusted_badge = $8,
        trusted_badge_at = CASE WHEN $8 AND NOT advertiser_reputation.trusted_badge THEN NOW() ELSE advertiser_reputation.trusted_badge_at END,
        last_calculated_at = NOW()
    `, [
      advertiserId, 
      total, 
      avgRating.toFixed(1), 
      parseInt(s.positive) || 0, 
      parseInt(s.neutral) || 0, 
      parseInt(s.negative) || 0,
      responseRate.toFixed(2),
      trustedBadge,
      trustedBadge ? new Date() : null
    ]);
  } catch (err) {
    console.error("[Ratings] Error updating reputation:", err.message);
  }
}

module.exports = router;
