const db = require('../db');
const promotionService = require('./promotionService');

const FREE_PLAN_ID = 1;

const PLAN_VALIDATION_RULES = {
  name_ar: { type: 'string', required: true, minLength: 2, maxLength: 100 },
  name_en: { type: 'string', required: true, minLength: 2, maxLength: 100 },
  slug: { type: 'string', maxLength: 50, pattern: /^[a-z0-9-]*$/ },
  price: { type: 'number', required: true, min: 0, max: 1000000 },
  duration_days: { type: 'number', min: 1, max: 3650, default: 30 },
  max_listings: { type: 'number', min: 0, max: 10000, default: 1 },
  max_photos_per_listing: { type: 'number', min: 0, max: 100, default: 5 },
  max_videos_per_listing: { type: 'number', min: 0, max: 20, default: 0 },
  max_video_duration: { type: 'number', min: 0, max: 600, default: 60 },
  show_on_map: { type: 'boolean', default: false },
  ai_support_level: { type: 'number', min: 0, max: 3, default: 0 },
  support_level: { type: 'number', min: 0, max: 3, default: 0 },
  seo_level: { type: 'number', min: 0, max: 2, default: 0 },
  highlights_allowed: { type: 'number', min: 0, max: 100, default: 0 },
  sort_order: { type: 'number', min: 0, max: 1000, default: 0 },
  visible: { type: 'boolean', default: true },
  color: { type: 'string', pattern: /^#[0-9A-Fa-f]{6}$/, default: '#D4AF37' },
  badge_bg_color: { type: 'string', pattern: /^#[0-9A-Fa-f]{6}$/ },
  badge_text_color: { type: 'string', pattern: /^#[0-9A-Fa-f]{6}$/ },
  badge_font_size: { type: 'number', min: 8, max: 48, default: 16 },
  header_bg_opacity: { type: 'number', min: 0, max: 100, default: 100 },
  body_bg_opacity: { type: 'number', min: 0, max: 100, default: 100 },
  badge_bg_opacity: { type: 'number', min: 0, max: 100, default: 100 },
};

function validatePlanInput(data, isUpdate = false) {
  const errors = [];
  const sanitized = {};

  for (const [field, rules] of Object.entries(PLAN_VALIDATION_RULES)) {
    let value = data[field];

    if (value === undefined || value === null || value === '') {
      if (rules.required && !isUpdate) {
        errors.push({ field, message: `${field} is required` });
      }
      if (rules.default !== undefined && !isUpdate) {
        sanitized[field] = rules.default;
      }
      continue;
    }

    if (rules.type === 'number') {
      value = parseFloat(value);
      if (isNaN(value)) {
        errors.push({ field, message: `${field} must be a number` });
        continue;
      }
      if (rules.min !== undefined && value < rules.min) {
        errors.push({ field, message: `${field} must be at least ${rules.min}` });
        continue;
      }
      if (rules.max !== undefined && value > rules.max) {
        errors.push({ field, message: `${field} must be at most ${rules.max}` });
        continue;
      }
    }

    if (rules.type === 'string') {
      value = String(value).trim();
      if (rules.minLength && value.length < rules.minLength) {
        errors.push({ field, message: `${field} must be at least ${rules.minLength} characters` });
        continue;
      }
      if (rules.maxLength && value.length > rules.maxLength) {
        errors.push({ field, message: `${field} must be at most ${rules.maxLength} characters` });
        continue;
      }
      if (rules.pattern && !rules.pattern.test(value)) {
        errors.push({ field, message: `${field} has invalid format` });
        continue;
      }
    }

    if (rules.type === 'boolean') {
      value = value === true || value === 'true' || value === 1;
    }

    sanitized[field] = value;
  }

  return { valid: errors.length === 0, errors, sanitized };
}

async function getPlanById(planId, client = null) {
  const queryFn = client || db;
  const result = await queryFn.query("SELECT * FROM plans WHERE id = $1", [planId]);
  return result.rows[0] || null;
}

async function getFreePlan() {
  return await getPlanById(FREE_PLAN_ID);
}

async function getAllPlans(includeHidden = false) {
  let query = "SELECT * FROM plans";
  if (!includeHidden) {
    query += " WHERE visible = true";
  }
  query += " ORDER BY sort_order ASC, price ASC";
  const result = await db.query(query);
  return result.rows;
}

async function getPlansWithPromotions(userId = null) {
  const plans = await getAllPlans(false);
  return await promotionService.applyPromotionsToPlans(plans, userId);
}

async function getActivePaidPlanForUser(userId) {
  const result = await db.query(
    `SELECT 
      up.*,
      p.*
    FROM user_plans up
    JOIN plans p ON up.plan_id = p.id
    WHERE up.user_id = $1
      AND up.expires_at > NOW()
    ORDER BY up.started_at DESC
    LIMIT 1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

async function createPlan(planData, adminUserId) {
  const { valid, errors, sanitized } = validatePlanInput(planData, false);
  
  if (!valid) {
    return { success: false, errors };
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const {
      name_ar, name_en, slug, price, duration_days = 30,
      max_listings = 1, max_photos_per_listing = 5, max_videos_per_listing = 0,
      show_on_map = false, ai_support_level = 0, highlights_allowed = 0,
      description, logo, icon, color = '#D4AF37', badge, visible = true,
      features = [], sort_order = 0, support_level = 0, max_video_duration = 60,
      custom_icon, badge_enabled = false, badge_text, badge_position = 'top-right',
      badge_shape = 'ribbon', badge_bg_color = '#D4AF37', badge_text_color = '#FFFFFF',
      horizontal_badge_enabled = false, horizontal_badge_text,
      horizontal_badge_bg_color = '#D4AF37', horizontal_badge_text_color = '#002845',
      header_bg_color, header_text_color, body_bg_color, body_text_color,
      badge_font_size = 16, header_bg_opacity = 100, body_bg_opacity = 100,
      badge_bg_opacity = 100, seo_level = 0, seo_feature_title, seo_feature_description,
      elite_feature_title, elite_feature_description, ai_feature_title, ai_feature_description,
      feature_display_order = { listings: 1, photos: 2, map: 3, ai: 4, video: 5, elite: 6, seo: 7 }
    } = planData;

    const result = await client.query(
      `INSERT INTO plans (
        name_ar, name_en, slug, price, duration_days,
        max_listings, max_photos_per_listing, max_videos_per_listing,
        show_on_map, ai_support_level, highlights_allowed,
        description, logo, icon, color, badge, visible, features, sort_order,
        support_level, max_video_duration, custom_icon,
        badge_enabled, badge_text, badge_position, badge_shape,
        badge_bg_color, badge_text_color, horizontal_badge_enabled,
        horizontal_badge_text, horizontal_badge_bg_color, horizontal_badge_text_color,
        header_bg_color, header_text_color, body_bg_color, body_text_color,
        badge_font_size, header_bg_opacity, body_bg_opacity, badge_bg_opacity,
        seo_level, seo_feature_title, seo_feature_description,
        elite_feature_title, elite_feature_description, ai_feature_title, ai_feature_description,
        feature_display_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48::jsonb)
      RETURNING *`,
      [
        name_ar, name_en, slug || null, price, duration_days,
        max_listings, max_photos_per_listing, max_videos_per_listing,
        show_on_map, ai_support_level, highlights_allowed,
        description || null, logo || null, icon || null, color, badge || null, visible,
        JSON.stringify(features), sort_order, support_level, max_video_duration, custom_icon || null,
        badge_enabled, badge_text || null, badge_position, badge_shape,
        badge_bg_color, badge_text_color, horizontal_badge_enabled,
        horizontal_badge_text || null, horizontal_badge_bg_color, horizontal_badge_text_color,
        header_bg_color || null, header_text_color || null, body_bg_color || null, body_text_color || null,
        badge_font_size, header_bg_opacity, body_bg_opacity, badge_bg_opacity,
        seo_level, seo_feature_title || null, seo_feature_description || null,
        elite_feature_title || null, elite_feature_description || null,
        ai_feature_title || null, ai_feature_description || null,
        JSON.stringify(typeof feature_display_order === 'string' ? JSON.parse(feature_display_order) : feature_display_order)
      ]
    );

    await client.query(
      `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details, created_at)
       VALUES ($1, 'create_plan', 'plan', $2, $3::jsonb, NOW())`,
      [adminUserId, result.rows[0].id, JSON.stringify({ name_ar, price, duration_days })]
    );

    await client.query('COMMIT');
    
    promotionService.invalidateCache();
    
    return { success: true, plan: result.rows[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return { success: false, errors: [{ field: 'slug', message: 'Slug already exists' }] };
    }
    throw err;
  } finally {
    client.release();
  }
}

async function updatePlan(planId, planData, adminUserId) {
  const { valid, errors, sanitized } = validatePlanInput(planData, true);
  
  if (!valid) {
    return { success: false, errors };
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const existingPlan = await getPlanById(planId, client);
    if (!existingPlan) {
      await client.query('ROLLBACK');
      return { success: false, errors: [{ field: 'id', message: 'Plan not found' }] };
    }

    const nullIfEmpty = (val) => (val === '' || val === undefined) ? null : val;
    const safeBadge = planData.badge === '__REMOVE__' ? null : (planData.badge || existingPlan.badge);

    const {
      name_ar, name_en, price, duration_days, max_listings, max_photos_per_listing,
      max_videos_per_listing, show_on_map, ai_support_level, highlights_allowed,
      description, logo, icon, color, visible, features, sort_order, support_level,
      max_video_duration, custom_icon, badge_enabled, badge_text, badge_position,
      badge_shape, badge_bg_color, badge_text_color, horizontal_badge_enabled,
      horizontal_badge_text, horizontal_badge_bg_color, horizontal_badge_text_color,
      header_bg_color, header_text_color, body_bg_color, body_text_color,
      badge_font_size, header_bg_opacity, body_bg_opacity, badge_bg_opacity,
      elite_feature_title, elite_feature_description, ai_feature_title, ai_feature_description,
      seo_level, seo_feature_title, seo_feature_description, feature_display_order
    } = planData;

    const result = await client.query(
      `UPDATE plans SET
        name_ar = COALESCE($1, name_ar),
        name_en = COALESCE($2, name_en),
        price = COALESCE($3, price),
        duration_days = COALESCE($4, duration_days),
        max_listings = COALESCE($5, max_listings),
        max_photos_per_listing = COALESCE($6, max_photos_per_listing),
        max_videos_per_listing = COALESCE($7, max_videos_per_listing),
        show_on_map = COALESCE($8, show_on_map),
        ai_support_level = COALESCE($9, ai_support_level),
        highlights_allowed = COALESCE($10, highlights_allowed),
        description = COALESCE($11, description),
        logo = $12,
        icon = COALESCE($13, icon),
        color = COALESCE($14, color),
        badge = $15,
        visible = COALESCE($16, visible),
        features = COALESCE($17::jsonb, features),
        sort_order = COALESCE($18, sort_order),
        support_level = COALESCE($19, support_level),
        max_video_duration = COALESCE($20, max_video_duration),
        custom_icon = $21,
        badge_enabled = COALESCE($22, badge_enabled),
        badge_text = COALESCE(NULLIF($23, ''), badge_text),
        badge_position = COALESCE(NULLIF($24, ''), badge_position),
        badge_shape = COALESCE(NULLIF($25, ''), badge_shape),
        badge_bg_color = COALESCE(NULLIF($26, ''), badge_bg_color),
        badge_text_color = COALESCE(NULLIF($27, ''), badge_text_color),
        horizontal_badge_enabled = COALESCE($28, horizontal_badge_enabled),
        horizontal_badge_text = COALESCE(NULLIF($29, ''), horizontal_badge_text),
        horizontal_badge_bg_color = COALESCE(NULLIF($30, ''), horizontal_badge_bg_color),
        horizontal_badge_text_color = COALESCE(NULLIF($31, ''), horizontal_badge_text_color),
        header_bg_color = $32,
        header_text_color = $33,
        body_bg_color = $34,
        body_text_color = $35,
        badge_font_size = COALESCE($36, badge_font_size),
        header_bg_opacity = COALESCE($37, header_bg_opacity),
        body_bg_opacity = COALESCE($38, body_bg_opacity),
        badge_bg_opacity = COALESCE($39, badge_bg_opacity),
        elite_feature_title = COALESCE(NULLIF($40, ''), elite_feature_title),
        elite_feature_description = COALESCE(NULLIF($41, ''), elite_feature_description),
        ai_feature_title = COALESCE(NULLIF($42, ''), ai_feature_title),
        ai_feature_description = COALESCE(NULLIF($43, ''), ai_feature_description),
        seo_level = COALESCE($44, seo_level),
        seo_feature_title = COALESCE(NULLIF($45, ''), seo_feature_title),
        seo_feature_description = COALESCE(NULLIF($46, ''), seo_feature_description),
        feature_display_order = COALESCE($47::jsonb, feature_display_order),
        updated_at = NOW()
      WHERE id = $48
      RETURNING *`,
      [
        name_ar, name_en, price, duration_days,
        max_listings, max_photos_per_listing, max_videos_per_listing,
        show_on_map, ai_support_level, highlights_allowed,
        description, nullIfEmpty(logo), icon, color, safeBadge, visible,
        features ? JSON.stringify(features) : null, sort_order,
        support_level, max_video_duration, nullIfEmpty(custom_icon),
        badge_enabled, badge_text, badge_position, badge_shape,
        badge_bg_color, badge_text_color, horizontal_badge_enabled,
        horizontal_badge_text, horizontal_badge_bg_color, horizontal_badge_text_color,
        nullIfEmpty(header_bg_color), nullIfEmpty(header_text_color),
        nullIfEmpty(body_bg_color), nullIfEmpty(body_text_color),
        badge_font_size, header_bg_opacity, body_bg_opacity, badge_bg_opacity,
        elite_feature_title, elite_feature_description,
        ai_feature_title, ai_feature_description,
        seo_level, seo_feature_title, seo_feature_description,
        feature_display_order ? JSON.stringify(typeof feature_display_order === 'string' ? JSON.parse(feature_display_order) : feature_display_order) : null,
        planId
      ]
    );

    const updatedPlan = result.rows[0];
    const propagationResults = { userPlans: 0, quotaBuckets: 0 };

    if (duration_days !== undefined && duration_days !== null && duration_days !== existingPlan.duration_days) {
      await client.query(`
        SELECT id FROM user_plans 
        WHERE plan_id = $1 AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
        FOR UPDATE
      `, [planId]);
      
      const userPlansUpdate = await client.query(`
        UPDATE user_plans 
        SET expires_at = started_at + INTERVAL '1 day' * $1, updated_at = NOW()
        WHERE plan_id = $2 AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
        RETURNING id
      `, [duration_days, planId]);
      propagationResults.userPlans = userPlansUpdate.rows.length;

      await client.query(`
        SELECT id FROM quota_buckets 
        WHERE plan_id = $1 AND active = true AND (expires_at IS NULL OR expires_at > NOW())
        FOR UPDATE
      `, [planId]);
      
      await client.query(`
        UPDATE quota_buckets 
        SET expires_at = created_at + INTERVAL '1 day' * $1, updated_at = NOW()
        WHERE plan_id = $2 AND active = true AND (expires_at IS NULL OR expires_at > NOW())
      `, [duration_days, planId]);
    }

    if (max_listings !== undefined && max_listings !== null && max_listings !== existingPlan.max_listings) {
      await client.query(`
        SELECT id FROM quota_buckets 
        WHERE plan_id = $1 AND active = true AND (expires_at IS NULL OR expires_at > NOW())
        FOR UPDATE
      `, [planId]);
      
      const quotaUpdate = await client.query(`
        UPDATE quota_buckets 
        SET total_slots = $1, updated_at = NOW()
        WHERE plan_id = $2 AND active = true AND (expires_at IS NULL OR expires_at > NOW())
        RETURNING id
      `, [max_listings, planId]);
      propagationResults.quotaBuckets = quotaUpdate.rows.length;
    }

    propagationResults.priceChanged = price !== undefined && parseFloat(price) !== parseFloat(existingPlan.price);
    propagationResults.countryPricesNeedReview = propagationResults.priceChanged;

    if (show_on_map !== undefined && show_on_map !== existingPlan.show_on_map) {
      const activeSubscribers = await client.query(`
        SELECT DISTINCT user_id FROM user_plans 
        WHERE plan_id = $1 AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
      `, [planId]);
      
      if (activeSubscribers.rows.length > 0) {
        const userIds = activeSubscribers.rows.map(r => r.user_id);
        const propertiesUpdate = await client.query(`
          UPDATE properties 
          SET show_on_map = $1, updated_at = NOW()
          WHERE user_id = ANY($2) AND status NOT IN ('deleted', 'archived', 'rejected')
          RETURNING id
        `, [show_on_map, userIds]);
        propagationResults.properties = propertiesUpdate.rows.length;
      }
    }

    if (seo_level !== undefined && seo_level !== existingPlan.seo_level) {
      const activeSubscribers = await client.query(`
        SELECT DISTINCT user_id FROM user_plans 
        WHERE plan_id = $1 AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
      `, [planId]);
      
      if (activeSubscribers.rows.length > 0) {
        const userIds = activeSubscribers.rows.map(r => r.user_id);
        const seoUpdate = await client.query(`
          UPDATE properties 
          SET seo_level = $1, updated_at = NOW()
          WHERE user_id = ANY($2) AND status NOT IN ('deleted', 'archived', 'rejected')
          RETURNING id
        `, [seo_level, userIds]);
        propagationResults.seoUpdates = seoUpdate.rows.length;
      }
    }

    const significantChanges = ['price', 'max_listings', 'duration_days', 'show_on_map', 'ai_support_level', 'seo_level'];
    const hasSignificantChange = significantChanges.some(field => 
      planData[field] !== undefined && planData[field] !== existingPlan[field]
    );
    
    let subscribersToNotify = [];
    if (hasSignificantChange) {
      const activeSubscribers = await client.query(`
        SELECT DISTINCT user_id FROM user_plans 
        WHERE plan_id = $1 AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
      `, [planId]);
      subscribersToNotify = activeSubscribers.rows.map(r => r.user_id);
      propagationResults.pendingNotifications = subscribersToNotify.length;
    }

    const changedFields = {};
    for (const key of Object.keys(planData)) {
      if (planData[key] !== existingPlan[key]) {
        changedFields[key] = { old: existingPlan[key], new: planData[key] };
      }
    }

    await client.query(
      `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details, created_at)
       VALUES ($1, 'update_plan', 'plan', $2, $3::jsonb, NOW())`,
      [adminUserId, planId, JSON.stringify({ changes: changedFields, propagation: propagationResults })]
    );

    await client.query('COMMIT');
    
    promotionService.invalidateCache();
    
    if (subscribersToNotify.length > 0) {
      const planName = existingPlan.name_ar;
      const notifyBatch = async (userIds) => {
        if (userIds.length === 0) return;
        const placeholders = userIds.map((_, i) => `($${i + 1}, $${userIds.length + 1}, $${userIds.length + 2}, 'plan_update', 'in_app', 'pending', NOW())`).join(', ');
        await db.query(`
          INSERT INTO notifications (user_id, title, body, type, channel, status, created_at)
          VALUES ${placeholders}
          ON CONFLICT DO NOTHING
        `, [...userIds, 'تحديث على باقتك', `تم تحديث باقة "${planName}" - تحقق من التفاصيل الجديدة`]);
      };
      
      setImmediate(async () => {
        try {
          const batchSize = 50;
          for (let i = 0; i < subscribersToNotify.length; i += batchSize) {
            await notifyBatch(subscribersToNotify.slice(i, i + batchSize));
          }
        } catch (notifErr) {
          console.error('Failed to send plan update notifications:', notifErr.message);
        }
      });
    }
    
    return { success: true, plan: updatedPlan, propagation: propagationResults };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deletePlan(planId, adminUserId) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const usersCheck = await client.query(
      "SELECT COUNT(*) as count FROM user_plans WHERE plan_id = $1 AND status = 'active'",
      [planId]
    );

    if (parseInt(usersCheck.rows[0].count) > 0) {
      await client.query('ROLLBACK');
      return { success: false, errors: [{ message: 'Cannot delete plan with active subscribers' }] };
    }

    const plan = await getPlanById(planId, client);
    if (!plan) {
      await client.query('ROLLBACK');
      return { success: false, errors: [{ message: 'Plan not found' }] };
    }

    await client.query("DELETE FROM plans WHERE id = $1", [planId]);

    await client.query(
      `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details, created_at)
       VALUES ($1, 'delete_plan', 'plan', $2, $3::jsonb, NOW())`,
      [adminUserId, planId, JSON.stringify({ name_ar: plan.name_ar, price: plan.price })]
    );

    await client.query('COMMIT');
    
    promotionService.invalidateCache();
    
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function subscribeToPlan(userId, planId, countryCode = 'SA') {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const plan = await getPlanById(planId, client);
    if (!plan) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Plan not found' };
    }

    const existingPlan = await client.query(
      `SELECT * FROM user_plans 
       WHERE user_id = $1 AND plan_id = $2 AND status = 'active' AND expires_at > NOW()
       FOR UPDATE`,
      [userId, planId]
    );

    if (existingPlan.rows.length > 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Already subscribed to this plan' };
    }

    let localPrice = parseFloat(plan.price);
    let currencyCode = 'SAR';
    let currencySymbol = 'ر.س';

    if (countryCode && countryCode !== 'SA') {
      const countryPriceResult = await client.query(
        `SELECT price, currency_code, currency_symbol 
         FROM country_plan_prices 
         WHERE plan_id = $1 AND country_code = $2 AND is_active = true`,
        [planId, countryCode]
      );
      if (countryPriceResult.rows.length > 0) {
        const cp = countryPriceResult.rows[0];
        localPrice = parseFloat(cp.price);
        currencyCode = cp.currency_code;
        currencySymbol = cp.currency_symbol;
      }
    }

    const bestPromo = await promotionService.getBestPromotionForPlan(planId, userId, client);
    const { discountedPrice, discountAmount, discountPercentage } = promotionService.calculateDiscount(localPrice, bestPromo);
    const { isFreePromo } = bestPromo ? promotionService.getPromotionTypeFlags(bestPromo) : { isFreePromo: false };
    const skipPayment = isFreePromo || (bestPromo?.skip_payment) || discountedPrice === 0;

    if (discountedPrice > 0 && !skipPayment) {
      await client.query('ROLLBACK');
      return {
        success: false,
        requiresPayment: true,
        originalPrice: localPrice,
        finalPrice: discountedPrice,
        discount: discountAmount,
        currencyCode,
        currencySymbol,
        countryCode,
        promotionId: bestPromo?.id,
        promotionName: bestPromo?.name_ar
      };
    }

    const durationDays = bestPromo ? promotionService.calculatePromotionDuration(bestPromo, plan.duration_days) : plan.duration_days;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);

    const subscriptionResult = await client.query(
      `INSERT INTO user_plans (user_id, plan_id, status, expires_at, created_at)
       VALUES ($1, $2, 'active', $3, NOW())
       RETURNING *`,
      [userId, planId, expiresAt]
    );
    const userPlanId = subscriptionResult.rows[0].id;

    await client.query(
      `INSERT INTO quota_buckets (user_id, plan_id, user_plan_id, source, total_slots, used_slots, expires_at, active)
       VALUES ($1, $2, $3, 'subscription', $4, 0, $5, true)`,
      [userId, planId, userPlanId, plan.max_listings, expiresAt]
    );

    if (bestPromo) {
      await promotionService.recordPromotionUsage(
        client, bestPromo.id, userId, planId, userPlanId, localPrice, discountedPrice || 0
      );
    }

    await client.query('COMMIT');

    return {
      success: true,
      subscription: subscriptionResult.rows[0],
      plan,
      expiresAt,
      originalPrice: localPrice,
      finalPrice: discountedPrice || 0,
      promotion: bestPromo ? {
        id: bestPromo.id,
        name: bestPromo.name_ar,
        type: bestPromo.promotion_type,
        discount: discountAmount
      } : null
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function scheduleListingExpiryReminder(userId, listing, plan) {
  if (!listing.expires_at) {
    return;
  }

  const expiresAt = new Date(listing.expires_at);
  const remindAt = new Date(expiresAt.getTime() - 24 * 60 * 60 * 1000);

  if (remindAt <= new Date()) {
    return;
  }

  const payload = {
    listing_id: listing.id,
    listing_title: listing.title,
    plan_name_ar: plan.name_ar,
    plan_id: plan.id,
    expires_at: listing.expires_at,
    message_type: "expiry_warning",
  };

  const title = "⏰ تنبيه: إعلانك على وشك الانتهاء!";
  const body = `إعلانك "${listing.title}" سينتهي خلال 24 ساعة. قم بتجديده الآن للحفاظ على ظهوره.`;

  await db.query(
    `INSERT INTO notifications
      (user_id, listing_id, title, body, type, channel, payload, scheduled_at, status)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, 'pending')`,
    [
      userId,
      listing.id,
      title,
      body,
      "listing_expiry_warning",
      "app",
      JSON.stringify(payload),
      remindAt,
    ]
  );
}

module.exports = {
  FREE_PLAN_ID,
  PLAN_VALIDATION_RULES,
  validatePlanInput,
  getPlanById,
  getFreePlan,
  getAllPlans,
  getPlansWithPromotions,
  getActivePaidPlanForUser,
  createPlan,
  updatePlan,
  deletePlan,
  subscribeToPlan,
  scheduleListingExpiryReminder,
};
