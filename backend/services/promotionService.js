/**
 * Promotion Service - Centralized promotion logic
 * Handles promotion eligibility, discount calculations, and caching
 */

const db = require('../db');

let cachedPromotions = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute cache

/**
 * Get all active promotions with caching
 */
async function getActivePromotions(forceRefresh = false) {
  const now = Date.now();
  
  if (!forceRefresh && cachedPromotions && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedPromotions;
  }

  const query = `
    SELECT * FROM promotions 
    WHERE status = 'active'
      AND (start_at IS NULL OR start_at <= NOW())
      AND (end_at IS NULL OR end_at > NOW())
      AND (usage_limit_total IS NULL OR current_usage < usage_limit_total)
    ORDER BY priority DESC, discount_value DESC
  `;
  
  const result = await db.query(query);
  cachedPromotions = result.rows;
  cacheTimestamp = now;
  
  return cachedPromotions;
}

/**
 * Check if a promotion applies to a specific plan
 */
function promotionAppliesToPlan(promo, planId) {
  if (promo.applies_to === 'all_plans') return true;
  if (promo.applies_to === 'specific_plans' && promo.target_plan_ids) {
    return promo.target_plan_ids.includes(planId);
  }
  return false;
}

/**
 * Get user's promotion usage counts in batch
 */
async function getUserPromotionUsage(userId, promotionIds, client = null) {
  if (!userId || !promotionIds || promotionIds.length === 0) {
    return {};
  }

  const queryFn = client || db;
  const result = await queryFn.query(
    `SELECT promotion_id, COUNT(*) as usage_count 
     FROM promotion_usage 
     WHERE user_id = $1 AND promotion_id = ANY($2)
     GROUP BY promotion_id`,
    [userId, promotionIds]
  );

  const usageMap = {};
  result.rows.forEach(row => {
    usageMap[row.promotion_id] = parseInt(row.usage_count);
  });
  
  return usageMap;
}

/**
 * Determine promotion type flags for consistent logic
 */
function getPromotionTypeFlags(promo) {
  const promoType = promo.promotion_type;
  const discountType = promo.discount_type;

  return {
    isFreePromo: promoType === 'free_trial' || promoType === 'free_plan',
    isPercentageDiscount: promoType === 'percentage_discount' || 
      (promoType === 'discount' && discountType === 'percentage'),
    isFixedDiscount: promoType === 'fixed_discount' || 
      (promoType === 'discount' && discountType === 'fixed')
  };
}

/**
 * Calculate discount for a plan based on promotion
 */
function calculateDiscount(planPrice, promo) {
  if (!promo) {
    return {
      discountedPrice: null,
      discountAmount: 0,
      discountPercentage: null,
      skipPayment: false
    };
  }

  const { isFreePromo, isPercentageDiscount, isFixedDiscount } = getPromotionTypeFlags(promo);
  const discountValue = parseFloat(promo.discount_value) || 0;
  const price = parseFloat(planPrice);

  let discountedPrice = null;
  let discountAmount = 0;
  let discountPercentage = null;
  let skipPayment = promo.skip_payment || false;

  if (isFreePromo) {
    discountedPrice = 0;
    discountAmount = price;
    discountPercentage = 100;
    skipPayment = true;
  } else if (isPercentageDiscount && discountValue > 0) {
    discountAmount = (price * discountValue) / 100;
    discountedPrice = Math.max(0, price - discountAmount);
    discountPercentage = discountValue;
  } else if (isFixedDiscount && discountValue > 0) {
    discountAmount = Math.min(discountValue, price);
    discountedPrice = Math.max(0, price - discountValue);
    discountPercentage = price > 0 ? Math.min(100, Math.round((discountValue / price) * 100)) : 0;
  }

  return { discountedPrice, discountAmount, discountPercentage, skipPayment };
}

/**
 * Calculate promotion duration in days
 */
function calculatePromotionDuration(promo, defaultDays = 30) {
  if (!promo || !promo.duration_value || !promo.duration_unit) {
    return defaultDays;
  }

  switch (promo.duration_unit) {
    case 'days':
      return promo.duration_value;
    case 'months':
      return promo.duration_value * 30;
    case 'years':
      return promo.duration_value * 365;
    default:
      return defaultDays;
  }
}

/**
 * Build applied promotion object for API responses
 */
function buildAppliedPromotionObject(promo) {
  if (!promo) return null;

  return {
    id: promo.id,
    name_ar: promo.name_ar,
    type: promo.promotion_type,
    badge_text: promo.badge_text,
    badge_color: promo.badge_color,
    skip_payment: promo.skip_payment || getPromotionTypeFlags(promo).isFreePromo,
    duration_value: promo.duration_value,
    duration_unit: promo.duration_unit
  };
}

/**
 * Get the best applicable promotion for a plan and user
 * Uses batch query for user usage to avoid N+1
 */
async function getBestPromotionForPlan(planId, userId = null, client = null) {
  const activePromos = await getActivePromotions();
  
  if (activePromos.length === 0) return null;

  const applicablePromos = activePromos.filter(p => promotionAppliesToPlan(p, planId));
  
  if (applicablePromos.length === 0) return null;

  if (!userId) {
    return applicablePromos[0];
  }

  const promoIds = applicablePromos
    .filter(p => p.usage_limit_per_user)
    .map(p => p.id);

  const usageMap = await getUserPromotionUsage(userId, promoIds, client);

  for (const promo of applicablePromos) {
    if (promo.usage_limit_per_user) {
      const currentUsage = usageMap[promo.id] || 0;
      if (currentUsage >= promo.usage_limit_per_user) {
        continue;
      }
    }
    return promo;
  }

  return null;
}

/**
 * Apply promotions to multiple plans in batch (optimized for plan listing)
 */
async function applyPromotionsToPlans(plans, userId = null) {
  const activePromos = await getActivePromotions();
  
  if (activePromos.length === 0) {
    return plans.map(plan => ({
      ...plan,
      original_price: null,
      discounted_price: null,
      discount_percentage: null,
      discount_amount: null,
      applied_promotion: null
    }));
  }

  let usageMap = {};
  if (userId) {
    const promoIds = activePromos
      .filter(p => p.usage_limit_per_user)
      .map(p => p.id);
    usageMap = await getUserPromotionUsage(userId, promoIds);
  }

  return plans.map(plan => {
    const planPrice = parseFloat(plan.local_price || plan.price);
    let appliedPromo = null;

    for (const promo of activePromos) {
      if (!promotionAppliesToPlan(promo, plan.id)) continue;

      if (userId && promo.usage_limit_per_user) {
        const currentUsage = usageMap[promo.id] || 0;
        if (currentUsage >= promo.usage_limit_per_user) continue;
      }

      appliedPromo = promo;
      break;
    }

    const { discountedPrice, discountAmount, discountPercentage } = calculateDiscount(planPrice, appliedPromo);

    return {
      ...plan,
      original_price: discountedPrice !== null ? planPrice : null,
      discounted_price: discountedPrice,
      discount_percentage: discountPercentage,
      discount_amount: discountAmount,
      applied_promotion: buildAppliedPromotionObject(appliedPromo)
    };
  });
}

/**
 * Record promotion usage
 */
async function recordPromotionUsage(client, promoId, userId, planId, userPlanId, originalAmount, discountedAmount) {
  await client.query(`
    INSERT INTO promotion_usage (promotion_id, user_id, plan_id, user_plan_id, amount_original, amount_discounted, used_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
  `, [promoId, userId, planId, userPlanId, originalAmount, discountedAmount]);

  await client.query(`
    UPDATE promotions SET current_usage = current_usage + 1, updated_at = NOW() WHERE id = $1
  `, [promoId]);

  cachedPromotions = null;
}

/**
 * Invalidate promotion cache (call after admin updates)
 */
function invalidateCache() {
  cachedPromotions = null;
  cacheTimestamp = 0;
}

module.exports = {
  getActivePromotions,
  promotionAppliesToPlan,
  getUserPromotionUsage,
  getPromotionTypeFlags,
  calculateDiscount,
  calculatePromotionDuration,
  buildAppliedPromotionObject,
  getBestPromotionForPlan,
  applyPromotionsToPlans,
  recordPromotionUsage,
  invalidateCache
};
