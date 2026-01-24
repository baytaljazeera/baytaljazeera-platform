const express = require("express");
const router = express.Router();
const db = require("../db");
const { authMiddleware } = require("../middleware/auth");
const { asyncHandler } = require('../middleware/asyncHandler');

function remainingInBucket(bucket, now = new Date()) {
  if (!bucket.active) return 0;
  if (bucket.expires_at && new Date(bucket.expires_at).getTime() <= now.getTime()) {
    return 0;
  }
  return Math.max(bucket.total_slots - bucket.used_slots, 0);
}

router.get("/my-quotas", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const now = new Date();

  const result = await db.query(`
    SELECT 
      qb.id,
      qb.user_id,
      qb.plan_id,
      qb.source,
      qb.total_slots,
      qb.used_slots,
      qb.expires_at,
      qb.active,
      qb.created_at,
      p.name_ar as plan_name,
      p.name_en as plan_name_en,
      p.slug as plan_slug,
      p.color as plan_color,
      p.logo as plan_logo,
      p.icon as plan_icon,
      p.features as plan_features,
      p.max_photos_per_listing,
      p.max_videos_per_listing,
      p.show_on_map,
      p.ai_support_level,
      p.highlights_allowed
    FROM quota_buckets qb
    JOIN plans p ON qb.plan_id = p.id
    LEFT JOIN user_plans up ON qb.user_plan_id = up.id
    WHERE qb.user_id = $1 AND qb.active = true
      AND (up.id IS NULL OR up.status = 'active')
    ORDER BY qb.expires_at ASC NULLS LAST, qb.created_at ASC
  `, [userId]);

  const buckets = result.rows.map(bucket => ({
    id: bucket.id,
    planId: bucket.plan_id,
    planName: bucket.plan_name,
    planNameEn: bucket.plan_name_en,
    planSlug: bucket.plan_slug,
    planColor: bucket.plan_color,
    planLogo: bucket.plan_logo,
    planIcon: bucket.plan_icon,
    planFeatures: bucket.plan_features || [],
    source: bucket.source,
    totalSlots: bucket.total_slots,
    usedSlots: bucket.used_slots,
    remainingSlots: remainingInBucket(bucket, now),
    expiresAt: bucket.expires_at,
    active: bucket.active,
    createdAt: bucket.created_at,
    benefits: {
      maxPhotos: bucket.max_photos_per_listing,
      maxVideos: bucket.max_videos_per_listing,
      showOnMap: bucket.show_on_map,
      aiSupportLevel: bucket.ai_support_level,
      highlightsAllowed: bucket.highlights_allowed
    }
  }));

  const availableBuckets = buckets.filter(b => b.remainingSlots > 0);
  const totalRemaining = buckets.reduce((sum, b) => sum + b.remainingSlots, 0);

  const byPlan = {};
  for (const bucket of buckets) {
    if (!byPlan[bucket.planId]) {
      byPlan[bucket.planId] = {
        planId: bucket.planId,
        planName: bucket.planName,
        planSlug: bucket.planSlug,
        planColor: bucket.planColor,
        planLogo: bucket.planLogo,
        totalRemaining: 0,
        buckets: []
      };
    }
    byPlan[bucket.planId].totalRemaining += bucket.remainingSlots;
    byPlan[bucket.planId].buckets.push(bucket);
  }

  res.json({
    buckets,
    availableBuckets,
    totalRemaining,
    byPlan: Object.values(byPlan)
  });
}));

router.get("/options-for-listing", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const now = new Date();

  const result = await db.query(`
    SELECT 
      qb.id as bucket_id,
      qb.plan_id,
      qb.total_slots,
      qb.used_slots,
      qb.expires_at,
      qb.active,
      p.name_ar as plan_name,
      p.slug as plan_slug,
      p.color as plan_color,
      p.logo as plan_logo,
      p.icon as plan_icon,
      p.custom_icon as plan_custom_icon,
      p.features as plan_features,
      p.max_photos_per_listing,
      p.max_videos_per_listing,
      p.max_video_duration,
      p.show_on_map,
      p.ai_support_level,
      p.highlights_allowed,
      p.support_level,
      p.header_bg_color,
      p.body_bg_color
    FROM quota_buckets qb
    JOIN plans p ON qb.plan_id = p.id
    LEFT JOIN user_plans up ON qb.user_plan_id = up.id
    WHERE qb.user_id = $1 AND qb.active = true
      AND (up.id IS NULL OR up.status = 'active')
    ORDER BY qb.expires_at ASC NULLS LAST
  `, [userId]);

  const options = result.rows
    .map(bucket => {
      const remaining = remainingInBucket(bucket, now);
      if (remaining <= 0) return null;

      return {
        bucketId: bucket.bucket_id,
        planId: bucket.plan_id,
        planName: bucket.plan_name,
        planSlug: bucket.plan_slug,
        planColor: bucket.body_bg_color || bucket.plan_color,
        planHeaderColor: bucket.header_bg_color,
        planBodyColor: bucket.body_bg_color,
        planLogo: bucket.plan_logo,
        planIcon: bucket.plan_icon,
        planCustomIcon: bucket.plan_custom_icon,
        remainingSlots: remaining,
        expiresAt: bucket.expires_at,
        benefits: {
          maxPhotos: bucket.max_photos_per_listing,
          maxVideos: bucket.max_videos_per_listing,
          maxVideoDuration: bucket.max_video_duration,
          showOnMap: bucket.show_on_map,
          aiSupportLevel: bucket.ai_support_level,
          highlightsAllowed: bucket.highlights_allowed,
          supportLevel: bucket.support_level,
          features: bucket.plan_features || []
        }
      };
    })
    .filter(Boolean);

  res.json({ options });
}));

router.post("/consume", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { bucketId, listingId } = req.body;
  const now = new Date();

  if (!bucketId) {
    return res.status(400).json({ error: "يجب تحديد رصيد الباقة" });
  }

  const bucketResult = await db.query(`
    SELECT qb.*, p.name_ar as plan_name, p.slug as plan_slug
    FROM quota_buckets qb
    JOIN plans p ON qb.plan_id = p.id
    WHERE qb.id = $1
  `, [bucketId]);

  if (bucketResult.rows.length === 0) {
    return res.status(404).json({ error: "الرصيد غير موجود" });
  }

  const bucket = bucketResult.rows[0];

  if (bucket.user_id !== userId) {
    return res.status(403).json({ error: "هذا الرصيد غير متاح لك" });
  }

  const remaining = remainingInBucket(bucket, now);
  if (remaining <= 0) {
    return res.status(400).json({ error: "لا يوجد رصيد متبقي في هذه الباقة" });
  }

  await db.query("BEGIN");

  try {
    await db.query(`
      UPDATE quota_buckets 
      SET used_slots = used_slots + 1, updated_at = NOW()
      WHERE id = $1
    `, [bucketId]);

    if (listingId) {
      await db.query(`
        UPDATE properties 
        SET bucket_id = $1, tier_code = $2, tier_label = $3, plan_id = $4
        WHERE id = $5 AND user_id = $6
      `, [bucketId, bucket.plan_slug, bucket.plan_name, bucket.plan_id, listingId, userId]);
    }

    await db.query("COMMIT");

    res.json({
      success: true,
      message: "تم استهلاك رصيد إعلان واحد",
      remainingInBucket: remaining - 1,
      bucketId,
      planName: bucket.plan_name
    });
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
}));

router.post("/auto-allocate", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { listingId } = req.body;
  const now = new Date();

  const result = await db.query(`
    SELECT qb.*, p.name_ar as plan_name, p.slug as plan_slug
    FROM quota_buckets qb
    JOIN plans p ON qb.plan_id = p.id
    WHERE qb.user_id = $1 AND qb.active = true
    ORDER BY qb.expires_at ASC NULLS LAST
  `, [userId]);

  let selectedBucket = null;
  for (const bucket of result.rows) {
    if (remainingInBucket(bucket, now) > 0) {
      selectedBucket = bucket;
      break;
    }
  }

  if (!selectedBucket) {
    return res.status(400).json({ 
      error: "لا يوجد رصيد متاح",
      noQuota: true
    });
  }

  await db.query("BEGIN");

  try {
    await db.query(`
      UPDATE quota_buckets 
      SET used_slots = used_slots + 1, updated_at = NOW()
      WHERE id = $1
    `, [selectedBucket.id]);

    if (listingId) {
      await db.query(`
        UPDATE properties 
        SET bucket_id = $1, tier_code = $2, tier_label = $3, plan_id = $4
        WHERE id = $5 AND user_id = $6
      `, [selectedBucket.id, selectedBucket.plan_slug, selectedBucket.plan_name, selectedBucket.plan_id, listingId, userId]);
    }

    await db.query("COMMIT");

    res.json({
      success: true,
      bucketId: selectedBucket.id,
      planName: selectedBucket.plan_name,
      planSlug: selectedBucket.plan_slug,
      remainingInBucket: remainingInBucket(selectedBucket, now) - 1
    });
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
}));

router.post("/create-bucket", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { planId, source = "subscription" } = req.body;

  if (!planId) {
    return res.status(400).json({ error: "يجب تحديد الباقة" });
  }

  const planResult = await db.query("SELECT * FROM plans WHERE id = $1", [planId]);
  if (planResult.rows.length === 0) {
    return res.status(404).json({ error: "الباقة غير موجودة" });
  }

  const plan = planResult.rows[0];
  const durationDays = plan.duration_days || 30;
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

  const result = await db.query(`
    INSERT INTO quota_buckets (user_id, plan_id, source, total_slots, used_slots, expires_at, active)
    VALUES ($1, $2, $3, $4, 0, $5, true)
    RETURNING *
  `, [userId, planId, source, plan.max_listings, expiresAt]);

  const newBucket = result.rows[0];

  res.json({
    success: true,
    bucket: {
      id: newBucket.id,
      planId: newBucket.plan_id,
      planName: plan.name_ar,
      totalSlots: newBucket.total_slots,
      usedSlots: 0,
      remainingSlots: newBucket.total_slots,
      expiresAt: newBucket.expires_at
    }
  });
}));

router.get("/summary-by-plan", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const now = new Date();

  const result = await db.query(`
    SELECT 
      qb.plan_id,
      p.name_ar as plan_name,
      p.slug as plan_slug,
      p.color as plan_color,
      p.logo as plan_logo,
      SUM(qb.total_slots) as total_slots,
      SUM(qb.used_slots) as used_slots,
      MIN(qb.expires_at) as earliest_expiry
    FROM quota_buckets qb
    JOIN plans p ON qb.plan_id = p.id
    WHERE qb.user_id = $1 AND qb.active = true
      AND (qb.expires_at IS NULL OR qb.expires_at > $2)
    GROUP BY qb.plan_id, p.name_ar, p.slug, p.color, p.logo
    ORDER BY p.sort_order ASC
  `, [userId, now]);

  const summary = result.rows.map(row => ({
    planId: row.plan_id,
    planName: row.plan_name,
    planSlug: row.plan_slug,
    planColor: row.plan_color,
    planLogo: row.plan_logo,
    totalSlots: parseInt(row.total_slots),
    usedSlots: parseInt(row.used_slots),
    remainingSlots: parseInt(row.total_slots) - parseInt(row.used_slots),
    earliestExpiry: row.earliest_expiry
  }));

  const totalRemaining = summary.reduce((sum, s) => sum + s.remainingSlots, 0);

  res.json({
    summary,
    totalRemaining
  });
}));

router.post("/sync", authMiddleware, asyncHandler(async (req, res) => {
  const client = await db.connect();
  
  try {
    const userId = req.user.id;
    
    await client.query('BEGIN');
    
    await client.query(`
      ALTER TABLE quota_buckets 
      ADD COLUMN IF NOT EXISTS user_plan_id UUID REFERENCES user_plans(id) ON DELETE SET NULL
    `);
    
    await client.query(
      `SELECT id FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );

    const userPlansWithoutBuckets = await client.query(`
      SELECT up.id as user_plan_id, up.plan_id, up.expires_at, 
             p.max_listings, p.duration_days, p.name_ar
      FROM user_plans up
      JOIN plans p ON up.plan_id = p.id
      LEFT JOIN quota_buckets qb ON qb.user_plan_id = up.id
      WHERE up.user_id = $1 
        AND up.status = 'active'
        AND (up.expires_at IS NULL OR up.expires_at > NOW())
        AND qb.id IS NULL
      ORDER BY up.created_at DESC
    `, [userId]);

    const allUserPlans = await client.query(`
      SELECT up.id, p.name_ar
      FROM user_plans up
      JOIN plans p ON up.plan_id = p.id
      WHERE up.user_id = $1 AND up.status = 'active'
      AND (up.expires_at IS NULL OR up.expires_at > NOW())
    `, [userId]);

    if (allUserPlans.rows.length === 0) {
      const freePlanResult = await client.query(
        `SELECT id, duration_days, max_listings, name_ar FROM plans WHERE price = 0 AND visible = true ORDER BY id LIMIT 1`
      );

      if (freePlanResult.rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(500).json({ error: "لا توجد باقة مجانية متاحة" });
      }

      const freePlan = freePlanResult.rows[0];
      const durationDays = freePlan.duration_days || 30;

      const userPlanResult = await client.query(
        `INSERT INTO user_plans (user_id, plan_id, status, started_at, expires_at)
         VALUES ($1, $2, 'active', NOW(), NOW() + INTERVAL '1 day' * $3)
         RETURNING id, expires_at`,
        [userId, freePlan.id, durationDays]
      );
      const newUserPlanId = userPlanResult.rows[0].id;
      const expiresAt = userPlanResult.rows[0].expires_at;

      await client.query(
        `INSERT INTO quota_buckets (user_id, plan_id, user_plan_id, source, total_slots, used_slots, expires_at, active)
         VALUES ($1, $2, $3, 'sync', $4, 0, $5, true)`,
        [userId, freePlan.id, newUserPlanId, freePlan.max_listings || 1, expiresAt]
      );

      await client.query('COMMIT');
      client.release();

      return res.json({
        synced: true,
        message: `تم إنشاء رصيد جديد من باقة "${freePlan.name_ar}"`,
        bucket: {
          planName: freePlan.name_ar,
          totalSlots: freePlan.max_listings || 1,
          expiresAt
        }
      });
    }

    if (userPlansWithoutBuckets.rows.length === 0) {
      await client.query('COMMIT');
      client.release();
      return res.json({ 
        synced: false, 
        message: "جميع باقاتك لديها أرصدة بالفعل",
        bucketsCreated: 0
      });
    }

    let createdBuckets = 0;
    for (const plan of userPlansWithoutBuckets.rows) {
      await client.query(
        `INSERT INTO quota_buckets (user_id, plan_id, user_plan_id, source, total_slots, used_slots, expires_at, active)
         VALUES ($1, $2, $3, 'sync', $4, 0, $5, true)`,
        [userId, plan.plan_id, plan.user_plan_id, plan.max_listings || 1, plan.expires_at]
      );
      createdBuckets++;
      console.log(`✅ Created quota bucket for user ${userId}, plan "${plan.name_ar}" (user_plan_id: ${plan.user_plan_id}) with ${plan.max_listings} slots`);
    }

    await client.query('COMMIT');
    client.release();

    res.json({
      synced: true,
      message: `تم مزامنة ${createdBuckets} رصيد من باقاتك الجديدة`,
      bucketsCreated: createdBuckets
    });
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    throw err;
  }
}));

module.exports = router;
