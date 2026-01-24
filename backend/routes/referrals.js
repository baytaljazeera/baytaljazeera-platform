const express = require("express");
const db = require("../db");
const { authMiddleware, requireRoles } = require("../middleware/auth");
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();

router.get("/my-referrals", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  const userResult = await db.query(
    `SELECT referral_code, referral_count, referral_reward_claimed 
     FROM users WHERE id = $1`,
    [userId]
  );
  
  if (userResult.rows.length === 0) {
    return res.status(404).json({ error: "المستخدم غير موجود" });
  }
  
  const user = userResult.rows[0];
  
  const referralsResult = await db.query(
    `SELECT r.id, r.status, r.created_at,
            u.name as referred_name, u.email as referred_email
     FROM referrals r
     JOIN users u ON u.id = r.referred_id
     WHERE r.referrer_id = $1
     ORDER BY r.created_at DESC`,
    [userId]
  );
  
  const rewardsResult = await db.query(
    `SELECT rr.*, p.name_ar as plan_name
     FROM referral_rewards rr
     LEFT JOIN plans p ON p.id = rr.plan_id
     WHERE rr.user_id = $1
     ORDER BY rr.granted_at DESC`,
    [userId]
  );
  
  res.json({
    referral_code: user.referral_code,
    referral_count: user.referral_count || 0,
    reward_claimed: user.referral_reward_claimed || false,
    remaining_for_reward: Math.max(0, 10 - (user.referral_count || 0)),
    referrals: referralsResult.rows,
    rewards: rewardsResult.rows
  });
}));

router.get("/validate/:code", asyncHandler(async (req, res) => {
  const { code } = req.params;
  
  if (!code) {
    return res.status(400).json({ valid: false, error: "الكود مطلوب" });
  }
  
  const result = await db.query(
    `SELECT id, name, referral_code FROM users WHERE referral_code = $1`,
    [code.toUpperCase().trim()]
  );
  
  if (result.rows.length === 0) {
    return res.json({ valid: false, error: "كود الإحالة غير صالح" });
  }
  
  res.json({ 
    valid: true, 
    referrer_name: result.rows[0].name || 'عميل بيت الجزيرة'
  });
}));

router.get("/admin/list", authMiddleware, requireRoles('super_admin', 'support_admin'), asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  
  const result = await db.query(`
    SELECT 
      r.id, r.referral_code, r.status, r.reward_granted, r.created_at,
      referrer.name as referrer_name, referrer.email as referrer_email, referrer.referral_count,
      referred.name as referred_name, referred.email as referred_email
    FROM referrals r
    JOIN users referrer ON referrer.id = r.referrer_id
    JOIN users referred ON referred.id = r.referred_id
    ORDER BY r.created_at DESC
    LIMIT $1 OFFSET $2
  `, [parseInt(limit), offset]);
  
  const countResult = await db.query('SELECT COUNT(*) FROM referrals');
  
  res.json({
    referrals: result.rows,
    total: parseInt(countResult.rows[0].count),
    page: parseInt(page),
    limit: parseInt(limit)
  });
}));

router.get("/admin/rewards", authMiddleware, requireRoles('super_admin', 'finance_admin'), asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT 
      rr.*, 
      u.name as user_name, u.email as user_email, u.referral_count,
      p.name_ar as plan_name
    FROM referral_rewards rr
    JOIN users u ON u.id = rr.user_id
    LEFT JOIN plans p ON p.id = rr.plan_id
    ORDER BY rr.granted_at DESC
  `);
  
  res.json({ rewards: result.rows });
}));

router.get("/admin/stats", authMiddleware, requireRoles('super_admin', 'support_admin', 'finance_admin'), asyncHandler(async (req, res) => {
  const statsResult = await db.query(`
    SELECT 
      (SELECT COUNT(*) FROM referrals)::int as total_referrals,
      (SELECT COUNT(*) FROM referrals WHERE status = 'completed')::int as successful_referrals,
      (SELECT COUNT(*) FROM referral_rewards)::int as rewards_granted,
      (SELECT COUNT(DISTINCT referrer_id) FROM referrals)::int as active_referrers,
      (SELECT COUNT(*) FROM users WHERE referral_count >= 10)::int as users_reached_goal
  `);
  
  const topReferrers = await db.query(`
    SELECT u.id, u.name, u.email, u.referral_count, u.referral_reward_claimed
    FROM users u
    WHERE u.referral_count > 0
    ORDER BY u.referral_count DESC
    LIMIT 10
  `);
  
  res.json({
    stats: statsResult.rows[0],
    top_referrers: topReferrers.rows
  });
}));

module.exports = router;
