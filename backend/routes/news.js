const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, requireRoles } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const COUNTRIES = [
  { code: 'SA', name_ar: 'السعودية', name_en: 'Saudi Arabia' },
  { code: 'AE', name_ar: 'الإمارات', name_en: 'UAE' },
  { code: 'KW', name_ar: 'الكويت', name_en: 'Kuwait' },
  { code: 'QA', name_ar: 'قطر', name_en: 'Qatar' },
  { code: 'BH', name_ar: 'البحرين', name_en: 'Bahrain' },
  { code: 'OM', name_ar: 'عمان', name_en: 'Oman' },
  { code: 'EG', name_ar: 'مصر', name_en: 'Egypt' },
  { code: 'LB', name_ar: 'لبنان', name_en: 'Lebanon' },
  { code: 'TR', name_ar: 'تركيا', name_en: 'Turkey' },
];

router.get("/countries", (req, res) => {
  res.json({ countries: COUNTRIES });
});

router.get("/cities", asyncHandler(async (req, res) => {
  const { country } = req.query;
  let query = `SELECT DISTINCT name_ar, name_en, country_code FROM cities`;
  const values = [];
  
  if (country) {
    query += ` WHERE country_code = $1`;
    values.push(country);
  }
  query += ` ORDER BY name_ar LIMIT 100`;
  
  const result = await db.query(query, values);
  res.json({ cities: result.rows });
}));

router.get("/", asyncHandler(async (req, res) => {
  const { active, country, city } = req.query;
  let query = `SELECT * FROM news`;
  const conditions = [];
  const values = [];
  let paramIndex = 1;
  
  if (active === 'true') {
    conditions.push(`active = true`);
    conditions.push(`(start_at IS NULL OR start_at <= NOW())`);
    conditions.push(`(end_at IS NULL OR end_at >= NOW())`);
  }
  
  if (country) {
    conditions.push(`(is_global = true OR target_countries IS NULL OR target_countries @> $${paramIndex}::jsonb)`);
    values.push(JSON.stringify([country]));
    paramIndex++;
  }
  
  if (city) {
    conditions.push(`(is_global = true OR target_cities IS NULL OR target_cities @> $${paramIndex}::jsonb)`);
    values.push(JSON.stringify([city]));
    paramIndex++;
  }
  
  if (conditions.length > 0) {
    query += ` WHERE ` + conditions.join(' AND ');
  }
  query += ` ORDER BY priority DESC, created_at DESC`;

  const result = await db.query(query, values);
  res.json({ news: result.rows });
}));

router.get("/settings", asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT COALESCE(MAX(speed), 25) as global_speed 
    FROM news WHERE active = true
  `);
  res.json({ 
    globalSpeed: result.rows[0]?.global_speed || 25
  });
}));

router.post("/generate-ai", authMiddleware, requireRoles('super_admin', 'admin', 'content_admin'), asyncHandler(async (req, res) => {
  const { 
    news_type, topic, country, city, tone, include_cta,
    custom_instructions
  } = req.body;

  if (!news_type || !topic) {
    return res.status(400).json({ error: "نوع الخبر والموضوع مطلوبان" });
  }

  const countryName = country ? COUNTRIES.find(c => c.code === country)?.name_ar || country : '';
  const locationContext = countryName ? `للجمهور في ${countryName}${city ? ` - ${city}` : ''}` : '';

  const typePrompts = {
    general: 'خبر عام ومعلوماتي',
    promo: 'عرض ترويجي جذاب ومغري',
    announcement: 'إعلان رسمي ومهم',
    alert: 'تنبيه عاجل ومهم'
  };

  const tonePrompts = {
    professional: 'بأسلوب احترافي ورسمي',
    friendly: 'بأسلوب ودود وقريب من القارئ',
    urgent: 'بأسلوب عاجل ومهم',
    exciting: 'بأسلوب حماسي ومثير'
  };

  const systemPrompt = `أنت كاتب محتوى محترف لمنصة عقارية فاخرة سعودية تسمى "بيت الجزيرة". 
مهمتك هي كتابة أخبار قصيرة وجذابة لشريط الأخبار العلوي في الموقع.

قواعد الكتابة:
1. العنوان يجب أن يكون قصيراً (5-15 كلمة) وجذاباً
2. المحتوى الإضافي اختياري ويجب أن يكون مختصراً (10-25 كلمة)
3. استخدم لغة عربية فصحى سهلة وواضحة
4. اجعل النص يعكس الفخامة والاحترافية
5. تجنب المبالغة والوعود الكاذبة
6. إذا طُلب زر إجراء، اقترح نصاً قصيراً ومشجعاً (2-4 كلمات)

أجب بتنسيق JSON فقط:
{
  "title": "العنوان الرئيسي",
  "content": "المحتوى الإضافي (اختياري)",
  "cta_label": "نص زر الإجراء (إن طُلب)",
  "suggested_icon": "اسم الأيقونة المناسبة: newspaper/star/megaphone/alert/gift/tag/fire/sparkles"
}`;

  const userPrompt = `اكتب ${typePrompts[news_type] || 'خبر'} ${tonePrompts[tone] || ''} ${locationContext} عن الموضوع التالي:

"${topic}"

${include_cta ? 'أضف اقتراحاً لنص زر الإجراء (CTA).' : 'لا تضف زر إجراء.'}
${custom_instructions ? `تعليمات إضافية: ${custom_instructions}` : ''}

أجب بتنسيق JSON فقط.`;

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    instructions: systemPrompt,
    input: userPrompt,
    text: {
      format: {
        type: "json_object"
      }
    }
  });

  let generated = null;
  
  if (response.output && Array.isArray(response.output)) {
    for (const item of response.output) {
      if (item.type === 'message' && item.content) {
        for (const content of item.content) {
          if (content.type === 'output_text' && content.text) {
            try {
              generated = JSON.parse(content.text);
              break;
            } catch (e) {
              console.error("Failed to parse AI response:", e);
            }
          }
        }
      }
    }
  }
  
  if (!generated) {
    return res.status(500).json({ error: "لم يتم توليد محتوى" });
  }
  
  res.json({
    ok: true,
    generated: {
      title: generated.title || '',
      content: generated.content || '',
      cta_label: include_cta ? (generated.cta_label || '') : '',
      suggested_icon: generated.suggested_icon || 'newspaper',
      type: news_type
    }
  });
}));

router.post("/", authMiddleware, requireRoles('super_admin', 'admin', 'content_admin'), asyncHandler(async (req, res) => {
  const { 
    title, content, type, active, priority, speed,
    background_color, text_color, icon, cta_label, cta_url,
    start_at, end_at, target_countries, target_cities, is_global, ai_generated
  } = req.body;

  if (!title) {
    return res.status(400).json({ error: "العنوان مطلوب" });
  }

  const result = await db.query(
    `INSERT INTO news (
      title, content, type, active, priority, speed,
      background_color, text_color, icon, cta_label, cta_url,
      start_at, end_at, target_countries, target_cities, is_global, ai_generated, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW()) RETURNING *`,
    [
      title, content || '', type || 'general', active !== false,
      priority || 0, speed || 25, background_color || null, text_color || null,
      icon || null, cta_label || null, cta_url || null,
      start_at || null, end_at || null,
      target_countries ? JSON.stringify(target_countries) : null,
      target_cities ? JSON.stringify(target_cities) : null,
      is_global !== false, ai_generated || false
    ]
  );

  res.status(201).json({ ok: true, news: result.rows[0], message: "تم إضافة الخبر بنجاح" });
}));

router.patch("/:id", authMiddleware, requireRoles('super_admin', 'admin', 'content_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const body = req.body;

  const updates = [];
  const values = [];
  let paramIndex = 1;

  const stringFields = [
    'title', 'content', 'type', 'priority', 'speed',
    'background_color', 'text_color', 'icon', 'cta_label', 'cta_url',
    'start_at', 'end_at'
  ];
  
  const boolFields = ['active', 'is_global', 'ai_generated'];
  const jsonFields = ['target_countries', 'target_cities'];

  for (const field of stringFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = $${paramIndex}`);
      values.push(body[field]);
      paramIndex++;
    }
  }
  
  for (const field of boolFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = $${paramIndex}`);
      values.push(body[field]);
      paramIndex++;
    }
  }
  
  for (const field of jsonFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = $${paramIndex}`);
      values.push(body[field] ? JSON.stringify(body[field]) : null);
      paramIndex++;
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "لا توجد بيانات للتحديث" });
  }

  updates.push('updated_at = NOW()');
  values.push(id);

  const result = await db.query(
    `UPDATE news SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  if (result.rows.length === 0) return res.status(404).json({ error: "الخبر غير موجود" });
  res.json({ ok: true, news: result.rows[0], message: "تم تحديث الخبر بنجاح" });
}));

router.delete("/:id", authMiddleware, requireRoles('super_admin', 'admin', 'content_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await db.query(`DELETE FROM news WHERE id = $1 RETURNING id`, [id]);
  if (result.rows.length === 0) return res.status(404).json({ error: "الخبر غير موجود" });
  res.json({ ok: true, message: "تم حذف الخبر بنجاح" });
}));

module.exports = router;
