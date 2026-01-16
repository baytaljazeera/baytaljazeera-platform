const db = require('../db');
const plans = require('./plans_backup.json');

async function seedPlans() {
  console.log('🌱 Starting plans seed...');
  
  try {
    for (const plan of plans) {
      const existing = await db.query('SELECT id FROM plans WHERE id = $1', [plan.id]);
      
      if (existing.rows.length > 0) {
        await db.query(`
          UPDATE plans SET 
            name_ar = $1, name_en = $2, price = $3, duration_days = $4,
            max_listings = $5, max_photos_per_listing = $6, max_videos_per_listing = $7,
            max_video_seconds = $8, show_on_map = $9, ai_support_level = $10,
            ai_calls_per_month = $11, highlights_allowed = $12, has_extra_support = $13,
            description = $14, logo = $15, icon = $16, color = $17, badge = $18,
            visible = $19, sort_order = $20, support_level = $21, max_video_duration = $22,
            custom_icon = $23, badge_enabled = $24, badge_text = $25, badge_position = $26,
            badge_shape = $27, badge_bg_color = $28, badge_text_color = $29,
            horizontal_badge_enabled = $30, horizontal_badge_text = $31,
            horizontal_badge_bg_color = $32, horizontal_badge_text_color = $33,
            body_bg_color = $34, body_text_color = $35, badge_font_size = $36,
            body_bg_opacity = $37, badge_bg_opacity = $38, seo_level = $39,
            seo_feature_title = $40, seo_feature_description = $41,
            elite_feature_title = $42, elite_feature_description = $43,
            ai_feature_title = $44, ai_feature_description = $45,
            feature_display_order = $46, updated_at = NOW()
          WHERE id = $47
        `, [
          plan.name_ar, plan.name_en, plan.price, plan.duration_days,
          plan.max_listings, plan.max_photos_per_listing, plan.max_videos_per_listing,
          plan.max_video_seconds, plan.show_on_map, plan.ai_support_level,
          plan.ai_calls_per_month, plan.highlights_allowed, plan.has_extra_support,
          plan.description, plan.logo, plan.icon, plan.color, plan.badge,
          plan.visible, plan.sort_order, plan.support_level, plan.max_video_duration,
          plan.custom_icon, plan.badge_enabled, plan.badge_text, plan.badge_position,
          plan.badge_shape, plan.badge_bg_color, plan.badge_text_color,
          plan.horizontal_badge_enabled, plan.horizontal_badge_text,
          plan.horizontal_badge_bg_color, plan.horizontal_badge_text_color,
          plan.body_bg_color, plan.body_text_color, plan.badge_font_size,
          plan.body_bg_opacity, plan.badge_bg_opacity, plan.seo_level,
          plan.seo_feature_title, plan.seo_feature_description,
          plan.elite_feature_title, plan.elite_feature_description,
          plan.ai_feature_title, plan.ai_feature_description,
          JSON.stringify(plan.feature_display_order), plan.id
        ]);
        console.log(`✅ Updated: ${plan.name_ar}`);
      } else {
        await db.query(`
          INSERT INTO plans (
            id, name_ar, name_en, price, duration_days,
            max_listings, max_photos_per_listing, max_videos_per_listing,
            max_video_seconds, show_on_map, ai_support_level,
            ai_calls_per_month, highlights_allowed, has_extra_support,
            description, logo, icon, color, badge,
            visible, sort_order, support_level, max_video_duration,
            custom_icon, badge_enabled, badge_text, badge_position,
            badge_shape, badge_bg_color, badge_text_color,
            horizontal_badge_enabled, horizontal_badge_text,
            horizontal_badge_bg_color, horizontal_badge_text_color,
            body_bg_color, body_text_color, badge_font_size,
            body_bg_opacity, badge_bg_opacity, seo_level,
            seo_feature_title, seo_feature_description,
            elite_feature_title, elite_feature_description,
            ai_feature_title, ai_feature_description,
            feature_display_order
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
            $31, $32, $33, $34, $35, $36, $37, $38, $39, $40,
            $41, $42, $43, $44, $45, $46, $47
          )
        `, [
          plan.id, plan.name_ar, plan.name_en, plan.price, plan.duration_days,
          plan.max_listings, plan.max_photos_per_listing, plan.max_videos_per_listing,
          plan.max_video_seconds, plan.show_on_map, plan.ai_support_level,
          plan.ai_calls_per_month, plan.highlights_allowed, plan.has_extra_support,
          plan.description, plan.logo, plan.icon, plan.color, plan.badge,
          plan.visible, plan.sort_order, plan.support_level, plan.max_video_duration,
          plan.custom_icon, plan.badge_enabled, plan.badge_text, plan.badge_position,
          plan.badge_shape, plan.badge_bg_color, plan.badge_text_color,
          plan.horizontal_badge_enabled, plan.horizontal_badge_text,
          plan.horizontal_badge_bg_color, plan.horizontal_badge_text_color,
          plan.body_bg_color, plan.body_text_color, plan.badge_font_size,
          plan.body_bg_opacity, plan.badge_bg_opacity, plan.seo_level,
          plan.seo_feature_title, plan.seo_feature_description,
          plan.elite_feature_title, plan.elite_feature_description,
          plan.ai_feature_title, plan.ai_feature_description,
          JSON.stringify(plan.feature_display_order)
        ]);
        console.log(`✅ Inserted: ${plan.name_ar}`);
      }
    }
    
    await db.query(`SELECT setval('plans_id_seq', (SELECT MAX(id) FROM plans))`);
    console.log('✅ Plans sequence updated');
    console.log('🎉 Plans seed completed successfully!');
    
  } catch (error) {
    console.error('❌ Error seeding plans:', error.message);
    throw error;
  }
}

if (require.main === module) {
  seedPlans()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { seedPlans };
