const express = require("express");
const router = express.Router();
const OpenAI = require("openai");
const { GoogleGenAI } = require("@google/genai");
const db = require("../db");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");
const path = require("path");
const fs = require("fs").promises;
const { spawn } = require("child_process");
const https = require("https");
const http = require("http");

// 🔒 Security: Path validation to prevent path traversal attacks
function isPathSafe(inputPath, allowedBase) {
  try {
    const resolvedPath = path.resolve(inputPath);
    const resolvedBase = path.resolve(allowedBase);
    return resolvedPath.startsWith(resolvedBase);
  } catch {
    return false;
  }
}

// 🔒 Security: Sanitize text for FFmpeg/ASS to prevent injection
function sanitizeTextForMedia(text) {
  if (!text || typeof text !== 'string') return '';
  // Remove potentially dangerous characters for ASS subtitles and shell
  return text
    .replace(/[\\{}]/g, '')  // Remove ASS control chars
    .replace(/[\x00-\x1f\x7f]/g, '')  // Remove control characters
    .slice(0, 500);  // Limit length
}

// Arabic text reshaping for RTL video subtitles
const ArabicReshaper = require("arabic-reshaper");

// Function to reshape Arabic text for proper rendering in FFmpeg/ASS
// Note: We only reshape letters, no BiDi reversal - ASS handles RTL natively
function reshapeArabicText(text) {
  if (!text) return "";
  try {
    // Step 1: Convert Arabic numerals to English numerals
    const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    let cleanText = text;
    arabicNumerals.forEach((arabic, index) => {
      cleanText = cleanText.replace(new RegExp(arabic, 'g'), String(index));
    });
    
    // Step 2: Split text into segments (numbers vs Arabic text)
    // Match: numbers with commas/dots OR Arabic/other characters
    const segments = cleanText.match(/[\d,.']+|[^\d,.']+/g) || [cleanText];
    
    // Step 3: Process each segment
    const processedSegments = segments.map(segment => {
      // If it's a number, keep it as-is
      if (/^[\d,.']+$/.test(segment)) {
        return { type: 'number', text: segment };
      }
      // If it's text, reshape and reverse
      const reshaped = ArabicReshaper.convertArabic(segment);
      const reversed = [...reshaped].reverse().join('');
      return { type: 'text', text: reversed };
    });
    
    // Step 4: Reverse the order of segments (RTL layout)
    // But numbers should stay in their visual position
    const result = processedSegments.reverse().map(s => s.text).join('');
    
    console.log(`[Arabic] "${text.substring(0, 15)}..." => "${result.substring(0, 20)}..."`);
    return result;
  } catch (e) {
    console.warn("[Arabic Reshaper] Error:", e.message);
    return [...text].reverse().join('');
  }
}

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

// Initialize Google GenAI for video generation
// Priority: GEMINI_API_KEY > Gemeni2 > Gemeni
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.Gemeni2 || process.env.Gemeni;
let genAI = null;
if (geminiApiKey) {
  genAI = new GoogleGenAI({ apiKey: geminiApiKey });
  console.log('[AI] ✅ Gemini API configured for video generation');
} else {
  console.warn('[AI] ⚠️ Gemini API not configured - Veo video generation disabled');
}

// In-memory storage for video generation operations with automatic cleanup
const videoOperations = new Map();

// 🔒 Security: Automatic cleanup of old video operations to prevent memory leaks
// TTL set to 5 hours to allow long video generation jobs to complete
const VIDEO_OPERATION_TTL = 5 * 60 * 60 * 1000; // 5 hours TTL
const CLEANUP_INTERVAL = 5 * 60 * 1000; // Cleanup every 5 minutes

function cleanupVideoOperations() {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [operationId, opData] of videoOperations.entries()) {
    const age = now - opData.startedAt;
    // Remove operations older than TTL or completed/failed operations after 10 minutes
    if (age > VIDEO_OPERATION_TTL || 
        (opData.status !== 'processing' && age > 10 * 60 * 1000)) {
      videoOperations.delete(operationId);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`[AI] Cleaned up ${cleanedCount} old video operations. Active: ${videoOperations.size}`);
  }
}

// Start cleanup interval
setInterval(cleanupVideoOperations, CLEANUP_INTERVAL);

// Cleanup on process exit
process.on('beforeExit', () => {
  videoOperations.clear();
});

const SYSTEM_PROMPT = `أنت مساعد ذكي لمنصة "بيت الجزيرة" - منصة عقارية سعودية فاخرة.
مهمتك مساعدة المدراء في:
- إدارة الإعلانات والعقارات
- فهم تقارير المبيعات والإحصائيات
- حل مشاكل العملاء والشكاوى
- اقتراح استراتيجيات تسويقية
- صياغة ردود احترافية للعملاء
- تحليل أداء المنصة

أجب دائماً باللغة العربية بأسلوب احترافي ومختصر.
كن مفيداً وودوداً في ردودك.`;

// Helper function for OpenAI error handling
function handleOpenAIError(error, res) {
  console.error("OpenAI API Error:", error.message);
  
  // Rate limit error
  if (error.status === 429 || error.code === 'rate_limit_exceeded') {
    return res.status(429).json({ 
      error: "تم تجاوز الحد المسموح لطلبات الذكاء الاصطناعي. حاول بعد دقيقة.",
      errorEn: "AI rate limit exceeded. Try again in a minute.",
      retryAfter: 60
    });
  }
  
  // Authentication/API key error
  if (error.status === 401 || error.code === 'invalid_api_key') {
    return res.status(503).json({ 
      error: "خدمة الذكاء الاصطناعي غير متاحة حالياً",
      errorEn: "AI service temporarily unavailable"
    });
  }
  
  // Quota exceeded
  if (error.status === 402 || error.code === 'insufficient_quota') {
    return res.status(503).json({ 
      error: "خدمة الذكاء الاصطناعي غير متاحة حالياً",
      errorEn: "AI service temporarily unavailable"
    });
  }
  
  // Network/timeout error
  if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
    return res.status(503).json({ 
      error: "تعذر الاتصال بخدمة الذكاء الاصطناعي",
      errorEn: "Could not connect to AI service"
    });
  }
  
  // Generic error
  return res.status(500).json({ error: "حدث خطأ في الذكاء الاصطناعي" });
}

router.post("/chat", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "الرسائل مطلوبة" });
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages.map(m => ({
          role: m.role,
          content: m.content
        }))
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    const assistantMessage = response.choices[0]?.message?.content || "عذراً، لم أتمكن من الرد.";

    res.json({ message: assistantMessage });
  } catch (error) {
    return handleOpenAIError(error, res);
  }
}));

router.post("/generate-description", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { propertyType, bedrooms, bathrooms, area, location, features } = req.body;

  const prompt = `اكتب وصفاً عقارياً جذاباً ومختصراً (3-4 جمل) لـ:
نوع العقار: ${propertyType || "عقار"}
الغرف: ${bedrooms || "غير محدد"}
الحمامات: ${bathrooms || "غير محدد"}
المساحة: ${area || "غير محددة"} متر مربع
الموقع: ${location || "غير محدد"}
المميزات: ${features || "غير محددة"}

اكتب الوصف بأسلوب تسويقي احترافي يجذب المشترين.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "أنت كاتب محتوى عقاري محترف. اكتب أوصافاً جذابة ومختصرة بالعربية." },
        { role: "user", content: prompt }
      ],
      max_tokens: 300,
      temperature: 0.8,
    });

    const description = response.choices[0]?.message?.content || "";

    res.json({ description });
  } catch (error) {
    return handleOpenAIError(error, res);
  }
}));

// User-facing AI description generator (requires AI support level >= 1)
router.post("/user/generate-description", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.userId || req.user.id;
    
    // Check user's AI support level from both user_plans AND quota_buckets
    const planResult = await db.query(
      `SELECT COALESCE(MAX(p.ai_support_level), 0) as ai_level
       FROM (
         -- From user_plans
         SELECT p.ai_support_level
         FROM user_plans up
         JOIN plans p ON up.plan_id = p.id
         WHERE up.user_id = $1 AND up.status = 'active' AND (up.expires_at IS NULL OR up.expires_at > NOW())
         UNION ALL
         -- From quota_buckets (for users with active buckets)
         SELECT p.ai_support_level
         FROM quota_buckets qb
         JOIN plans p ON qb.plan_id = p.id
         WHERE qb.user_id = $1 AND qb.active = true 
           AND (qb.expires_at IS NULL OR qb.expires_at > NOW())
           AND (qb.total_slots - qb.used_slots) > 0
       ) p`,
      [userId]
    );
    
    const aiLevel = parseInt(planResult.rows[0]?.ai_level) || 0;
    
    if (aiLevel < 1) {
      return res.status(403).json({ 
        error: "هذه الميزة متاحة فقط للباقات التي تدعم الذكاء الاصطناعي",
        upgradeRequired: true 
      });
    }

    const { propertyType, purpose, city, district, price, area, bedrooms, bathrooms, title, hasPool, hasElevator, hasGarden, direction, parkingSpaces } = req.body;

    if (!propertyType) {
      return res.status(400).json({ error: "نوع العقار مطلوب" });
    }

    // Build amenities list
    const amenities = [];
    if (hasPool) amenities.push("مسبح خاص");
    if (hasElevator) amenities.push("مصعد");
    if (hasGarden) amenities.push("حديقة");
    if (direction) amenities.push(`واجهة ${direction}`);
    if (parkingSpaces && parkingSpaces !== "0") amenities.push(`${parkingSpaces} مواقف سيارات`);
    const amenitiesText = amenities.length > 0 ? amenities.join("، ") : "لا يوجد";

    // Different prompts based on AI level
    const isVIP = aiLevel >= 2;
    
    const prompt = isVIP 
      ? `أنت خبير تسويق عقاري محترف. اكتب وصفاً تسويقياً جذاباً ومميزاً (4-6 جمل) لهذا العقار:
نوع العقار: ${propertyType}
الغرض: ${purpose || "للبيع"}
المدينة: ${city || "غير محددة"}
الحي: ${district || "غير محدد"}
السعر: ${price ? `${Number(price).toLocaleString('ar-SA')} ريال` : "غير محدد"}
المساحة: ${area ? `${area} م²` : "غير محددة"}
الغرف: ${bedrooms || "غير محدد"}
الحمامات: ${bathrooms || "غير محدد"}
العنوان: ${title || "غير محدد"}
المميزات الإضافية: ${amenitiesText}

اكتب وصفاً:
- يبرز المميزات الفريدة للعقار${hasPool ? " وخاصة المسبح" : ""}${hasGarden ? " والحديقة" : ""}${hasElevator ? " والمصعد" : ""}
- يستخدم كلمات جذابة ومؤثرة
- يخلق شعوراً بالفخامة والقيمة
- يحفز المشتري على التواصل فوراً`
      : `اكتب وصفاً مختصراً وواضحاً (2-3 جمل) للعقار التالي:
نوع العقار: ${propertyType}
الغرض: ${purpose || "للبيع"}
المدينة: ${city || "غير محددة"}
الحي: ${district || "غير محدد"}
المساحة: ${area ? `${area} م²` : "غير محددة"}
الغرف: ${bedrooms || "غير محدد"}
المميزات الإضافية: ${amenitiesText}

تعليمات مهمة:
- ابدأ مباشرة بوصف العقار مثل "${propertyType} ${purpose === "إيجار" ? "للإيجار" : "للبيع"} في حي ${district || "مميز"}..."
- لا تستخدم كلمات مثل "تقدم" أو "نقدم" أو "نعرض"
- ${amenities.length > 0 ? `أذكر المميزات المهمة: ${amenitiesText}` : ""}
- اكتب بأسلوب إعلان عقاري مباشر وجذاب`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { 
          role: "system", 
          content: isVIP 
            ? "أنت كاتب محتوى عقاري محترف. اكتب أوصافاً جذابة بالعربية. ابدأ مباشرة بوصف العقار بدون مقدمات مثل 'تقدم' أو 'نقدم'. مثال: 'فيلا فاخرة للبيع في حي النرجس...'"
            : "أنت كاتب إعلانات عقارية. اكتب وصفاً مباشراً وواضحاً بالعربية. لا تستخدم كلمات مثل 'تقدم' أو 'نقدم' أو 'نعرض'. ابدأ مباشرة بنوع العقار." 
        },
        { role: "user", content: prompt }
      ],
      max_tokens: isVIP ? 400 : 200,
      temperature: isVIP ? 0.8 : 0.6,
    });

    const description = response.choices[0]?.message?.content || "";

    res.json({ 
      description,
      aiLevel,
      isVIP
    });
  } catch (error) {
    return handleOpenAIError(error, res);
  }
}));

// User-facing AI title generator (requires AI support level >= 3 - Business tier only)
router.post("/user/generate-title", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.userId || req.user.id;
    
    // Check user's support level from both user_plans AND quota_buckets
    const planResult = await db.query(
      `SELECT COALESCE(MAX(p.support_level), 0) as support_level
       FROM (
         SELECT p.support_level
         FROM user_plans up
         JOIN plans p ON up.plan_id = p.id
         WHERE up.user_id = $1 AND up.status = 'active' AND (up.expires_at IS NULL OR up.expires_at > NOW())
         UNION ALL
         SELECT p.support_level
         FROM quota_buckets qb
         JOIN plans p ON qb.plan_id = p.id
         WHERE qb.user_id = $1 AND qb.active = true 
           AND (qb.expires_at IS NULL OR qb.expires_at > NOW())
           AND (qb.total_slots - qb.used_slots) > 0
       ) p`,
      [userId]
    );
    
    const supportLevel = parseInt(planResult.rows[0]?.support_level) || 0;
    
    if (supportLevel < 3) {
      return res.status(403).json({ 
        error: "ميزة توليد العناوين بالذكاء الاصطناعي متاحة فقط لمشتركي باقة رجال الأعمال",
        upgradeRequired: true 
      });
    }

    const { propertyType, purpose, city, district, area, bedrooms, bathrooms, hasPool, hasElevator, hasGarden } = req.body;

    if (!propertyType) {
      return res.status(400).json({ error: "نوع العقار مطلوب لتوليد العنوان" });
    }

    // Build features for the title
    const features = [];
    if (bedrooms && bedrooms !== "0") features.push(`${bedrooms} غرف`);
    if (hasPool) features.push("مسبح");
    if (hasGarden) features.push("حديقة");
    if (hasElevator) features.push("مصعد");
    
    const featuresText = features.length > 0 ? features.join(" + ") : "";

  try {
    const prompt = `اكتب عنواناً تعريفياً جذاباً ومختصراً (سطر واحد فقط، 10-15 كلمة) لإعلان عقاري:

نوع العقار: ${propertyType}
الغرض: ${purpose === "إيجار" ? "للإيجار" : "للبيع"}
المدينة: ${city || "غير محددة"}
الحي: ${district || "غير محدد"}
المساحة: ${area ? `${area} م²` : "غير محددة"}
عدد الغرف: ${bedrooms || "غير محدد"}
عدد الحمامات: ${bathrooms || "غير محدد"}
المميزات: ${featuresText || "لا يوجد"}

تعليمات مهمة:
- اكتب عنواناً واحداً فقط بدون شرح
- ابدأ مباشرة بنوع العقار
- اذكر أهم الميزات بشكل مختصر
- استخدم كلمات جذابة مثل: فاخرة، مميزة، استثنائية، راقية
- مثال: "فيلا فاخرة 5 غرف مع مسبح خاص - حي النرجس - تشطيب سوبر ديلوكس"`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { 
          role: "system", 
          content: "أنت خبير كتابة عناوين إعلانات عقارية جذابة. اكتب عنواناً واحداً فقط بدون أي شرح أو مقدمة. العنوان يجب أن يكون مختصراً وجذاباً ومباشراً."
        },
        { role: "user", content: prompt }
      ],
      max_tokens: 100,
      temperature: 0.7,
    });

    let title = response.choices[0]?.message?.content || "";
    // Clean up the title - remove quotes and extra whitespace
    title = title.replace(/^["']|["']$/g, '').trim();

    res.json({ 
      title,
      supportLevel
    });
  } catch (error) {
    return handleOpenAIError(error, res);
  }
}));

// 🔍 توليد SEO بالذكاء الاصطناعي - ميزة مدفوعة حسب الباقة
// Level 0: لا يوجد SEO (Starter)
// Level 1: عنوان + وصف SEO أساسي (Premium)  
// Level 2: SEO كامل + Schema + تحسين صور + فيديو (VIP Elite)
router.post("/user/generate-seo", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.userId || req.user.id;
    
    // Check user's SEO level from plan
    const planResult = await db.query(
      `SELECT COALESCE(MAX(p.seo_level), 0) as seo_level
       FROM (
         SELECT p.seo_level
         FROM user_plans up
         JOIN plans p ON up.plan_id = p.id
         WHERE up.user_id = $1 AND up.status = 'active' AND (up.expires_at IS NULL OR up.expires_at > NOW())
         UNION ALL
         SELECT p.seo_level
         FROM quota_buckets qb
         JOIN plans p ON qb.plan_id = p.id
         WHERE qb.user_id = $1 AND qb.active = true 
           AND (qb.expires_at IS NULL OR qb.expires_at > NOW())
           AND (qb.total_slots - qb.used_slots) > 0
       ) p`,
      [userId]
    );
    
    const seoLevel = parseInt(planResult.rows[0]?.seo_level) || 0;
    
    if (seoLevel < 1) {
      return res.status(403).json({ 
        error: "ميزة تحسين محركات البحث SEO متاحة فقط للمشتركين في باقة Premium أو أعلى",
        upgradeRequired: true,
        requiredLevel: 1
      });
    }

    const { title, propertyType, purpose, city, district, area, bedrooms, bathrooms, price, hasPool, hasGarden, hasElevator, description } = req.body;

    if (!title || !propertyType) {
      return res.status(400).json({ error: "عنوان العقار ونوعه مطلوبان لتوليد SEO" });
    }

    // Build property features list
    const features = [];
    if (bedrooms && bedrooms !== "0") features.push(`${bedrooms} غرف نوم`);
    if (bathrooms && bathrooms !== "0") features.push(`${bathrooms} حمامات`);
    if (area) features.push(`${area} م²`);
    if (hasPool) features.push("مسبح خاص");
    if (hasGarden) features.push("حديقة");
    if (hasElevator) features.push("مصعد");

    // Level 1: Basic SEO (Title + Description)
    const seoTitlePrompt = `اكتب عنوان SEO احترافي (60-70 حرف بالضبط) لإعلان عقاري:
العقار: ${propertyType} ${purpose === "إيجار" ? "للإيجار" : "للبيع"}
المدينة: ${city || "السعودية"}
الحي: ${district || ""}
المساحة: ${area || "غير محددة"} م²

اكتب عنواناً واحداً فقط يتضمن:
- نوع العقار والغرض
- الموقع
- كلمة جذابة مثل "فاخر" أو "مميز"
مثال: "فيلا فاخرة للبيع في حي النرجس الرياض - 5 غرف مع مسبح"`;

    const seoDescPrompt = `اكتب وصف Meta Description احترافي (140-160 حرف بالضبط) لإعلان عقاري:
العقار: ${propertyType} ${purpose === "إيجار" ? "للإيجار" : "للبيع"}
المدينة: ${city || "السعودية"}
الحي: ${district || ""}
السعر: ${price || "اتصل للسعر"}
المميزات: ${features.join("، ") || "عقار مميز"}

اكتب وصفاً واحداً مختصراً يشجع على النقر ويتضمن المميزات الرئيسية.`;

  try {
    // Generate SEO title and description
    const [titleResponse, descResponse] = await Promise.all([
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "أنت خبير SEO عقاري. اكتب عنواناً واحداً فقط بدون شرح." },
          { role: "user", content: seoTitlePrompt }
        ],
        max_tokens: 80,
        temperature: 0.6,
      }),
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "أنت خبير SEO عقاري. اكتب وصفاً واحداً فقط بدون شرح." },
          { role: "user", content: seoDescPrompt }
        ],
        max_tokens: 120,
        temperature: 0.6,
      })
    ]);

    let seoTitle = (titleResponse.choices[0]?.message?.content || "").replace(/^["']|["']$/g, '').trim();
    let seoDescription = (descResponse.choices[0]?.message?.content || "").replace(/^["']|["']$/g, '').trim();

    // Ensure proper length
    if (seoTitle.length > 70) seoTitle = seoTitle.substring(0, 67) + "...";
    if (seoDescription.length > 160) seoDescription = seoDescription.substring(0, 157) + "...";

    // Level 1: Basic SEO - title + description only
    const result = {
      seoTitle,
      seoDescription,
      seoLevel,
      schemaEnabled: false,
      imagesOptimized: false,
      videoEnabled: false,
      keywords: []
    };

    // Level 2 ONLY: Full SEO with Schema + Image optimization + Video + Keywords
    // This ensures paid feature separation - Premium (1) vs VIP Elite (2)
    if (seoLevel >= 2) {
      // Generate keywords for Level 2+ users only
      const keywordsPrompt = `اقترح 8-10 كلمات مفتاحية للبحث (كلمة أو كلمتين لكل واحدة) لإعلان عقاري:
${propertyType} ${purpose === "إيجار" ? "للإيجار" : "للبيع"} في ${city || "السعودية"} ${district || ""}
اكتب الكلمات المفتاحية فقط مفصولة بفواصل.`;

      const keywordsResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "اكتب كلمات مفتاحية فقط مفصولة بفواصل، بدون أي شرح أو ترقيم." },
          { role: "user", content: keywordsPrompt }
        ],
        max_tokens: 150,
        temperature: 0.5,
      });

      const keywordsText = keywordsResponse.choices[0]?.message?.content || "";
      result.keywords = keywordsText.split(/[،,]/).map(k => k.trim()).filter(k => k.length > 0 && k.length < 30);
      // Only Level 2+ gets these advanced features
      result.schemaEnabled = true;
      result.imagesOptimized = true;
      result.videoEnabled = true;
    }

    // Log the SEO generation for auditing
    console.log(`[SEO] Generated for user ${userId}, level ${seoLevel}: title="${seoTitle.substring(0, 30)}..."`);

    res.json(result);
  } catch (error) {
    return handleOpenAIError(error, res);
  }
}));

// 🏆 اقتراحات التسعير الذكية - حصرياً لرجال الأعمال
router.post("/user/smart-pricing", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { propertyType, purpose, country, city, district, landArea, buildingArea, area, bedrooms, bathrooms, hasPool, hasElevator, hasGarden, currency, currencyName } = req.body;

    // Check user's support level
    const planResult = await db.query(
      `SELECT COALESCE(MAX(support_level), 0) as support_level
       FROM (
         SELECT p.support_level
         FROM user_plans up
         JOIN plans p ON up.plan_id = p.id
         WHERE up.user_id = $1 AND up.status = 'active' AND (up.expires_at IS NULL OR up.expires_at > NOW())
         UNION ALL
         SELECT p.support_level
         FROM quota_buckets qb
         JOIN plans p ON qb.plan_id = p.id
         WHERE qb.user_id = $1 AND qb.active = true 
           AND (qb.expires_at IS NULL OR qb.expires_at > NOW())
           AND (qb.total_slots - qb.used_slots) > 0
       ) AS combined`,
      [userId]
    );
    
    const supportLevel = parseInt(planResult.rows[0]?.support_level) || 0;
    
    if (supportLevel < 3) {
      return res.status(403).json({ 
        error: "ميزة اقتراحات التسعير الذكية متاحة فقط لمشتركي باقة رجال الأعمال",
        upgradeRequired: true 
      });
    }

    if (!propertyType || !city) {
      return res.status(400).json({ error: "يرجى تحديد نوع العقار والمدينة" });
    }

    // Use landArea or fallback to area for backwards compatibility
    const effectiveLandArea = landArea || area;
    const effectiveBuildingArea = buildingArea || null;

    // Get market data from similar properties
    const marketData = await db.query(
      `SELECT AVG(price) as avg_price, MIN(price) as min_price, MAX(price) as max_price, COUNT(*) as count
       FROM properties 
       WHERE type = $1 AND city = $2 AND status = 'approved' 
         AND price > 0 AND created_at > NOW() - INTERVAL '6 months'`,
      [propertyType, city]
    );

    const market = marketData.rows[0] || {};
    const features = [];
    if (hasPool) features.push("مسبح");
    if (hasElevator) features.push("مصعد");
    if (hasGarden) features.push("حديقة");

  try {
    // Determine property category for better pricing context
    const isCommercial = ["أرض تجارية", "محل", "مكتب", "معرض", "مستودع", "فندق", "مجمع تجاري", "مبنى تجاري"].includes(propertyType);
    const isLargeProperty = Number(effectiveLandArea) >= 10000 || Number(effectiveBuildingArea) >= 5000 || Number(bedrooms) >= 50;
    
    // Determine if using local currency (non-SAR)
    const effectiveCurrency = currency || "SAR";
    const effectiveCurrencyName = currencyName || "ريال سعودي";
    const effectiveCountry = country || "المملكة العربية السعودية";
    const isSaudiMarket = !country || country === "المملكة العربية السعودية" || country === "السعودية";
    
    // Calculate realistic base price per sqm based on market
    let marketContext = "";
    
    // Add market context based on country
    if (isSaudiMarket) {
      if (isCommercial) {
        if (propertyType === "مجمع تجاري" || propertyType === "مبنى تجاري") {
          marketContext = `
معلومات السوق السعودي للمجمعات التجارية (2024-2025):
- سعر المتر للأراضي التجارية في المدن الكبرى: 3,000 - 15,000 ريال/م²
- سعر المتر للمباني التجارية المشيدة: 8,000 - 25,000 ريال/م²
- المجمعات التجارية الكبيرة (أكثر من 10,000 م²): 50 مليون - 500 مليون ريال
- المجمعات المتوسطة (2,000 - 10,000 م²): 15 مليون - 80 مليون ريال
- العائد الاستثماري المتوقع: 6-12% سنوياً`;
        } else if (propertyType === "فندق") {
          marketContext = `
معلومات السوق السعودي للفنادق (2024-2025):
- سعر الغرفة الفندقية الواحدة (تقييم): 300,000 - 1,500,000 ريال
- فنادق 3 نجوم: 200,000 - 400,000 ريال/غرفة
- فنادق 4 نجوم: 400,000 - 800,000 ريال/غرفة
- فنادق 5 نجوم: 800,000 - 2,000,000 ريال/غرفة
- الفنادق في مكة والمدينة: أسعار أعلى بـ 50-100%`;
        } else if (propertyType === "مستودع") {
          marketContext = `
معلومات السوق السعودي للمستودعات (2024-2025):
- سعر المتر للمستودعات: 1,500 - 4,000 ريال/م²
- المستودعات الكبيرة (أكثر من 5,000 م²): 10 مليون - 50 مليون ريال
- إيجار المتر السنوي: 150 - 400 ريال`;
        } else {
          marketContext = `
معلومات السوق السعودي للعقارات التجارية (2024-2025):
- سعر المتر للمحلات التجارية في الشوارع الرئيسية: 20,000 - 80,000 ريال/م²
- سعر المتر للمكاتب: 8,000 - 25,000 ريال/م²
- سعر المتر للمعارض: 5,000 - 15,000 ريال/م²`;
        }
      } else {
        marketContext = `
معلومات السوق السعودي للعقارات السكنية (2024-2025):
- الفلل الفاخرة في الأحياء الراقية: 3 مليون - 20 مليون ريال
- الشقق الفاخرة: 500,000 - 3 مليون ريال
- القصور والعمارات: 10 مليون - 100 مليون ريال
- سعر المتر في الرياض وجدة: 4,000 - 12,000 ريال/م²`;
      }
    } else {
      // International markets context
      const countryContexts = {
        "الإمارات العربية المتحدة": `
معلومات السوق الإماراتي (2024-2025):
- سعر المتر للشقق في دبي: 15,000 - 50,000 درهم/م²
- الفلل الفاخرة: 3 مليون - 30 مليون درهم
- العقارات التجارية: 20,000 - 80,000 درهم/م²`,
        "الإمارات": `
معلومات السوق الإماراتي (2024-2025):
- سعر المتر للشقق في دبي: 15,000 - 50,000 درهم/م²
- الفلل الفاخرة: 3 مليون - 30 مليون درهم
- العقارات التجارية: 20,000 - 80,000 درهم/م²`,
        "الكويت": `
معلومات السوق الكويتي (2024-2025):
- سعر المتر للشقق: 800 - 2,500 دينار/م²
- الفلل: 300,000 - 2 مليون دينار
- العقارات التجارية: 2,000 - 8,000 دينار/م²`,
        "قطر": `
معلومات السوق القطري (2024-2025):
- سعر المتر للشقق: 10,000 - 30,000 ريال قطري/م²
- الفلل الفاخرة: 3 مليون - 20 مليون ريال قطري`,
        "البحرين": `
معلومات السوق البحريني (2024-2025):
- سعر المتر للشقق: 600 - 1,500 دينار/م²
- الفلل: 150,000 - 800,000 دينار`,
        "عمان": `
معلومات السوق العماني (2024-2025):
- سعر المتر للشقق: 400 - 1,200 ريال عماني/م²
- الفلل: 100,000 - 500,000 ريال عماني`,
        "عُمان": `
معلومات السوق العماني (2024-2025):
- سعر المتر للشقق: 400 - 1,200 ريال عماني/م²
- الفلل: 100,000 - 500,000 ريال عماني`,
        "سلطنة عمان": `
معلومات السوق العماني (2024-2025):
- سعر المتر للشقق: 400 - 1,200 ريال عماني/م²
- الفلل: 100,000 - 500,000 ريال عماني`,
        "مصر": `
معلومات السوق المصري (2024-2025):
- سعر المتر للشقق في القاهرة: 30,000 - 150,000 جنيه/م²
- الفلل: 5 مليون - 50 مليون جنيه
- العقارات الساحلية: أسعار أعلى بـ 30-50%`,
        "لبنان": `
معلومات السوق اللبناني (2024-2025):
- الأسعار تُقيّم بالدولار الأمريكي
- سعر المتر للشقق في بيروت: 2,000 - 5,000 دولار/م²
- الفلل: 500,000 - 3 مليون دولار`,
        "تركيا": `
معلومات السوق التركي (2024-2025):
- سعر المتر للشقق في إسطنبول: 30,000 - 150,000 ليرة/م²
- الفلل: 10 مليون - 100 مليون ليرة
- مناطق الساحل (أنطاليا، بودروم): أسعار أعلى للأجانب`
      };
      marketContext = countryContexts[effectiveCountry] || `
معلومات السوق العقاري (2024-2025):
- يرجى الاستفادة من خبرتك في تسعير العقارات لهذا السوق
- عملة التسعير: ${effectiveCurrencyName} (${effectiveCurrency})`;
    }

    const prompt = `أنت خبير تسعير عقارات محترف. قم بتحليل وتقديم اقتراح تسعير واقعي ودقيق للعقار التالي:

📋 معلومات العقار:
- الدولة: ${effectiveCountry}
- نوع العقار: ${propertyType}
- الغرض: ${purpose || "بيع"}
- المدينة: ${city}
- الحي: ${district || "غير محدد"}
- مساحة الأرض: ${effectiveLandArea ? `${Number(effectiveLandArea).toLocaleString()} م²` : "غير محددة"}
- مساحة البناء: ${effectiveBuildingArea ? `${Number(effectiveBuildingArea).toLocaleString()} م²` : "غير محددة"}
- عدد الغرف: ${bedrooms || "غير محدد"}
- عدد الحمامات: ${bathrooms || "غير محدد"}
- المميزات الإضافية: ${features.length > 0 ? features.join("، ") : "لا يوجد"}

💰 عملة التسعير: ${effectiveCurrencyName} (${effectiveCurrency})

📊 بيانات من قاعدة البيانات (آخر 6 أشهر):
- متوسط السعر: ${market.avg_price ? Math.round(market.avg_price).toLocaleString() + " ريال سعودي" : "غير متوفر (لا توجد عقارات مشابهة)"}
- أقل سعر: ${market.min_price ? Math.round(market.min_price).toLocaleString() + " ريال سعودي" : "غير متوفر"}
- أعلى سعر: ${market.max_price ? Math.round(market.max_price).toLocaleString() + " ريال سعودي" : "غير متوفر"}
- عدد العقارات المشابهة: ${market.count || 0}
${marketContext}

⚠️ تعليمات مهمة:
- يجب أن تكون جميع الأسعار بـ ${effectiveCurrencyName} (${effectiveCurrency})
- إذا لم تتوفر بيانات من قاعدة البيانات، استخدم معلومات السوق المحلي أعلاه
- السعر يجب أن يكون منطقياً ومتناسباً مع حجم ونوع العقار والسوق المحلي
- للعقارات التجارية الكبيرة، توقع أسعار بالملايين أو عشرات الملايين
- للفنادق، احسب بناءً على عدد الغرف وتصنيف الفندق

قدم:
1. **السعر المقترح**: رقم محدد بـ ${effectiveCurrencyName} (يجب أن يكون واقعياً للسوق المحلي)
2. **نطاق السعر الموصى به**: (من - إلى) بـ ${effectiveCurrencyName}
3. **تبرير التسعير**: شرح مختصر يوضح كيف تم حساب السعر
4. **نصيحة ذهبية**: نصيحة واحدة لتحسين فرصة البيع/الإيجار`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { 
          role: "system", 
          content: `أنت خبير تسعير عقارات محترف مع خبرة 20 سنة في أسواق الشرق الأوسط وتركيا. 

${isSaudiMarket ? `قواعد التسعير للسوق السعودي:
- المجمعات التجارية الكبيرة: عشرات إلى مئات الملايين ريال
- الفنادق: ملايين حسب عدد الغرف (300,000-1,500,000 ريال/غرفة)
- المباني التجارية: 8,000-25,000 ريال/م² مبني
- الأراضي التجارية: 3,000-15,000 ريال/م²
- الفلل الفاخرة: 3-20 مليون ريال` : `أنت تقوم بتسعير عقار في ${effectiveCountry}.
عملة التسعير المطلوبة: ${effectiveCurrencyName} (${effectiveCurrency})
يجب أن تكون جميع الأسعار بالعملة المحلية فقط.`}

لا تقترح أبداً أسعاراً منخفضة جداً للعقارات الكبيرة. استخدم تنسيق markdown.`
        },
        { role: "user", content: prompt }
      ],
      max_tokens: 700,
      temperature: 0.5,
    });

    const pricing = response.choices[0]?.message?.content || "";

    res.json({ 
      pricing,
      marketData: {
        avgPrice: market.avg_price ? Math.round(market.avg_price) : null,
        minPrice: market.min_price ? Math.round(market.min_price) : null,
        maxPrice: market.max_price ? Math.round(market.max_price) : null,
        count: market.count || 0
      }
    });
  } catch (error) {
    return handleOpenAIError(error, res);
  }
}));

// 🎯 نصائح تسويقية مخصصة - حصرياً لرجال الأعمال
router.post("/user/marketing-tips", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { propertyType, purpose, city, district, price, area, bedrooms, title, description } = req.body;

    // Check user's support level
    const planResult = await db.query(
      `SELECT COALESCE(MAX(support_level), 0) as support_level
       FROM (
         SELECT p.support_level
         FROM user_plans up
         JOIN plans p ON up.plan_id = p.id
         WHERE up.user_id = $1 AND up.status = 'active' AND (up.expires_at IS NULL OR up.expires_at > NOW())
         UNION ALL
         SELECT p.support_level
         FROM quota_buckets qb
         JOIN plans p ON qb.plan_id = p.id
         WHERE qb.user_id = $1 AND qb.active = true 
           AND (qb.expires_at IS NULL OR qb.expires_at > NOW())
           AND (qb.total_slots - qb.used_slots) > 0
       ) AS combined`,
      [userId]
    );
    
    const supportLevel = parseInt(planResult.rows[0]?.support_level) || 0;
    
    if (supportLevel < 3) {
      return res.status(403).json({ 
        error: "ميزة النصائح التسويقية المخصصة متاحة فقط لمشتركي باقة رجال الأعمال",
        upgradeRequired: true 
      });
    }

    if (!propertyType) {
      return res.status(400).json({ error: "يرجى تحديد نوع العقار" });
    }

    const formattedPrice = price ? Number(price).toLocaleString('ar-SA') + " ريال" : null;
    const formattedArea = area ? Number(area).toLocaleString('ar-SA') + " م²" : null;
    
  try {
    const prompt = `أنت خبير تسويق عقاري متخصص في السوق السعودي. حلل هذا العقار بدقة وقدم نصائح تسويقية مخصصة له:

📊 **تفاصيل العقار المحددة:**
- نوع العقار: ${propertyType || "غير محدد"}
- الغرض: ${purpose || "غير محدد"}
- المدينة: ${city || "غير محددة"}
- الحي: ${district || "غير محدد"}
- السعر: ${formattedPrice || "غير محدد"}
- المساحة: ${formattedArea || "غير محددة"}
- عدد الغرف: ${bedrooms || "غير محدد"}
- العنوان: ${title || "بدون عنوان"}
- الوصف: ${description ? description.substring(0, 300) : "لا يوجد وصف"}

🎯 **المطلوب - نصائح مخصصة لهذا العقار بالتحديد:**

### 1. تحليل نقاط القوة
حدد 3 نقاط قوة في هذا العقار المحدد بناءً على موقعه وسعره ومواصفاته.

### 2. الجمهور المستهدف
من هو المشتري/المستأجر المثالي لهذا العقار في ${city || "هذه المنطقة"}؟ (عائلات/شباب/مستثمرين/أجانب)

### 3. استراتيجية التسعير
هل السعر ${formattedPrice || "المحدد"} مناسب للسوق في ${city || "المنطقة"}؟ قدم تحليل سريع.

### 4. نصائح التصوير
3 زوايا محددة يجب تصويرها في ${propertyType || "العقار"} لجذب المشترين.

### 5. أفضل وقت للنشر
متى تنشر إعلان ${purpose || "هذا العقار"} في ${city || "المنطقة"} لتحقيق أعلى مشاهدات؟

### 6. تقييم الإعلان
قيّم قوة هذا الإعلان (ممتاز/جيد/يحتاج تحسين) مع ذكر السبب المحدد.

**ملاحظة:** كل نصيحة يجب أن تكون مرتبطة بتفاصيل هذا العقار المحدد وليست نصائح عامة.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { 
          role: "system", 
          content: "أنت خبير تسويق عقاري سعودي متخصص. قدم نصائح مخصصة ومحددة لكل عقار بناءً على بياناته الفعلية. لا تقدم نصائح عامة - كل نصيحة يجب أن تذكر تفاصيل العقار المحدد. استخدم تنسيق markdown مع emojis."
        },
        { role: "user", content: prompt }
      ],
      max_tokens: 900,
      temperature: 0.7,
    });

    const tips = response.choices[0]?.message?.content || "";

    res.json({ tips });
  } catch (error) {
    return handleOpenAIError(error, res);
  }
}));

// 🎬 توليد نص تحفيزي ذكي وفريد - Gemini أولاً ثم OpenAI كبديل
async function generateDynamicPromoText(listingData) {
  const { propertyType, purpose, city, district, price, landArea, buildingArea, bedrooms, bathrooms, title, description, hasPool, hasElevator, hasGarden } = listingData;
  
  const formattedPrice = price ? `${Number(price).toLocaleString('ar-SA')} ريال` : null;
  const formattedArea = landArea ? `${Number(landArea).toLocaleString('ar-SA')} م²` : (buildingArea ? `${Number(buildingArea).toLocaleString('ar-SA')} م²` : null);
  
  // تجميع المميزات
  const features = [];
  if (bedrooms) features.push(`${bedrooms} غرف`);
  if (bathrooms) features.push(`${bathrooms} حمام`);
  if (hasPool) features.push("مسبح");
  if (hasElevator) features.push("مصعد");
  if (hasGarden) features.push("حديقة");
  const featuresText = features.length > 0 ? features.join(" • ") : "تشطيب فاخر";
  
  const prompt = `أنت كاتب إعلانات عقارية محترف في الخليج. مهمتك كتابة نصوص إعلانية تلفت الانتباه وتجعل المشاهد يتوقف ويشاهد الفيديو كاملاً.

🏠 بيانات العقار:
- النوع: ${propertyType || "عقار فاخر"}
- الغرض: ${purpose || "للبيع"}  
- المدينة: ${city || "الخليج"}
- الحي: ${district || "موقع استراتيجي"}
- السعر: ${formattedPrice || "عرض حصري"}
- المساحة: ${formattedArea || "مساحة واسعة"}
- المميزات: ${featuresText}

📝 المطلوب - 3 نصوص إعلانية قوية ومشوقة:

1. headline (5-10 كلمات): عنوان يلفت الانتباه فوراً ويثير الفضول
   أمثلة قوية:
   - "امتلك قصرك الخاص في أرقى أحياء الرياض"
   - "فرصة لا تتكرر - فيلا فاخرة بسعر استثنائي"
   - "لأول مرة - شقة VIP بإطلالة بانورامية"
   - "حلمك يتحقق الآن في قلب المدينة"

2. subheadline (8-15 كلمة): وصف يبرز أهم المميزات بطريقة مشوقة
   أمثلة قوية:
   - "تصميم معماري فريد • تشطيبات سوبر ديلوكس • موقع ذهبي"
   - "5 غرف ماستر • مسبح خاص • حديقة واسعة • جراج 3 سيارات"
   - "على بُعد دقائق من الخدمات الرئيسية والمرافق الحيوية"

3. priceTag (3-6 كلمات): دعوة للتواصل أو عرض السعر بطريقة جذابة
   أمثلة قوية:
   - "السعر الآن قبل الارتفاع"
   - "عرض محدود - تواصل فوراً"  
   - "استثمار مضمون العائد"
   - "احجز موعد المعاينة الآن"

⚡ قواعد مهمة:
- استخدم كلمات تحفيزية: فاخر، استثنائي، حصري، نادر، ذهبي، VIP، أرقى، أفخم
- اخلق إحساس بالفرصة والعجلة
- ركز على القيمة والتميز
- بدون أي emoji
- عربي فصيح راقي

أرجع JSON فقط:
{"headline": "...", "subheadline": "...", "priceTag": "..."}`;

  // محاولة Gemini أولاً
  if (genAI) {
    try {
      console.log("[Gemini] Generating promotional text...");
      const result = await genAI.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
        config: {
          temperature: 0.8,
          maxOutputTokens: 300,
        }
      });
      
      const content = result.text || "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log("[Gemini] ✅ Promotional text generated successfully");
        return parsed;
      }
    } catch (geminiError) {
      console.warn("[Gemini] Promo generation failed, trying OpenAI:", geminiError.message);
    }
  }

  // بديل OpenAI
  try {
    console.log("[OpenAI] Generating promotional text as fallback...");
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "أنت خبير تسويق عقارات فاخرة في الخليج. تكتب نصوص إعلانية راقية ومشجعة تلفت الانتباه وتحفز على الشراء. أسلوبك احترافي وجذاب. أرجع JSON فقط." },
        { role: "user", content: prompt }
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      console.log("[OpenAI] ✅ Promotional text generated successfully");
      return JSON.parse(jsonMatch[0]);
    }
  } catch (openaiError) {
    console.error("[AI] Both Gemini and OpenAI failed:", openaiError.message);
  }
  
  // Fallback to static generation
  console.log("[AI] Using static promotional text as final fallback");
  return generatePromotionalText(propertyType, purpose, city, district, price);
}

// 🎬 توليد نص تحفيزي ثابت (احتياطي) - نصوص تسويقية قوية ومشوقة
function generatePromotionalText(propertyType, purpose, city, district, price) {
  // عناوين قوية ومشوقة حسب المدينة
  const cityHeadlines = {
    "مكة المكرمة": ["امتلك سكنك قرب بيت الله الحرام", "فرصة لا تتكرر في قلب مكة المكرمة", "استثمار مبارك في أطهر بقاع الأرض"],
    "المدينة المنورة": ["سكن راقٍ في جوار المسجد النبوي", "فرصة ذهبية في طيبة الطيبة", "امتلك عقارك في مدينة الرسول"],
    "الرياض": ["امتلك قصرك في قلب العاصمة", "فرصة استثنائية في أرقى أحياء الرياض", "حياة الرفاهية تنتظرك في العاصمة"],
    "جدة": ["إطلالة ساحرة على عروس البحر الأحمر", "امتلك فيلا أحلامك في جدة", "استثمار مميز في لؤلؤة الغرب"],
    "الدمام": ["بوابتك للاستثمار في الشرقية", "فرصة ذهبية في قلب الدمام", "موقع استراتيجي بعوائد مضمونة"],
    "الخبر": ["حياة الرفاهية على ساحل الخليج", "امتلك إطلالة بحرية استثنائية", "استثمار راقٍ في لؤلؤة الخليج"],
    "دبي": ["امتلك قطعة من أيقونة الفخامة العالمية", "استثمار ذكي في عاصمة المستقبل", "حياة الترف والرفاهية في دبي"],
    "أبوظبي": ["سكن ملكي في عاصمة الإمارات", "استثمار آمن في قلب أبوظبي", "امتلك مستقبلك في إمارة الأمان"],
    "الكويت": ["فرصة نادرة في قلب الكويت", "استثمار مضمون في أرض الخير", "امتلك عقارك في لؤلؤة الخليج"],
    "الدوحة": ["سكن فاخر في عاصمة قطر", "استثمار ذكي في مدينة المستقبل", "فرصة ذهبية في الدوحة"],
    "المنامة": ["امتلك قطعة من لؤلؤة البحرين", "استثمار واعد في قلب المنامة", "سكن راقٍ في جزيرة اللؤلؤ"],
    "مسقط": ["جوهرة عُمان تنتظرك", "استثمار حكيم في سلطنة عمان", "امتلك سكنك في مسقط الساحرة"],
  };

  // عبارات فرعية قوية حسب نوع العقار
  const typeSubheadlines = {
    "فيلا": ["تصميم معماري فريد وتشطيبات سوبر ديلوكس", "فيلا فاخرة بمواصفات ملكية استثنائية", "خصوصية تامة ومساحات واسعة"],
    "قصر": ["تحفة معمارية بمواصفات لا مثيل لها", "قصر ملكي يليق بذوقك الرفيع", "فخامة وأناقة في كل تفصيلة"],
    "شقة": ["شقة عصرية بتصميم ذكي ومساحات مثالية", "تشطيبات راقية وموقع استراتيجي", "سكن أنيق يجمع الراحة والفخامة"],
    "أرض سكنية": ["أرض جاهزة للبناء بموقع ذهبي", "فرصة لبناء منزل أحلامك", "استثمار مضمون في موقع متميز"],
    "أرض تجارية": ["موقع تجاري استراتيجي بعوائد مرتفعة", "فرصة استثمارية لا تعوض", "أرض تجارية على شارع رئيسي"],
    "عمارة": ["عمارة استثمارية بدخل شهري مضمون", "عوائد إيجارية ممتازة", "موقع حيوي وطلب مرتفع"],
    "مزرعة": ["مزرعة خضراء بمساحات شاسعة", "استثمار زراعي واعد", "ملاذك الهادئ بعيداً عن الضوضاء"],
  };

  // دعوات للتواصل قوية
  const callToActions = purpose === "للبيع" 
    ? ["السعر الآن قبل الارتفاع - تواصل فوراً", "عرض محدود - احجز معاينتك اليوم", "الفرصة لن تتكرر - بادر الآن"]
    : ["احجز جولتك المجانية اليوم", "تواصل الآن قبل نفاد العرض", "استأجر بأفضل سعر - عرض محدود"];

  const headlines = cityHeadlines[city] || [`فرصة استثنائية في قلب ${city}`, `امتلك عقارك المميز في ${city}`];
  const subheadlines = typeSubheadlines[propertyType] || ["عقار متميز بمواصفات عالية وموقع استراتيجي", "فرصة نادرة لا تتكرر"];
  
  const formattedPrice = price ? Number(price).toLocaleString('ar-SA') : null;
  
  return {
    headline: headlines[Math.floor(Math.random() * headlines.length)],
    subheadline: subheadlines[Math.floor(Math.random() * subheadlines.length)],
    callToAction: callToActions[Math.floor(Math.random() * callToActions.length)],
    tagline: "بيت الجزيرة - وجهتك العقارية الأولى",
    priceTag: formattedPrice ? `فقط ${formattedPrice} ريال` : "سعر تنافسي - تواصل للتفاصيل"
  };
}

// 🗺️ جلب صورة خريطة للمدينة من OpenStreetMap
async function fetchMapSnapshot(city, lat, lng) {
  const zoom = 12;
  const width = 1280;
  const height = 720;
  
  // Use static map tiles from OSM
  const mapUrl = `https://static-maps.yandex.ru/1.x/?ll=${lng},${lat}&z=${zoom}&l=map&size=${width},${height}&lang=ar_AR`;
  
  // Fallback to a simple placeholder if map service fails
  return null; // Map snapshot optional for now
}

// 🎬 تحويل الوقت لصيغة ASS
function toAssTime(seconds) {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(2);
  const [ss, cs] = sec.split(".");
  return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${cs}`;
}

// 🎬 بناء ملف ASS للنصوص العربية - تصميم بسيط واحترافي
function buildAssFile(promoText, totalDuration, outPath) {
  // 🔒 Security: Sanitize all text inputs to prevent ASS injection
  const topLineRaw = sanitizeTextForMedia(promoText.headline || promoText.hook || "فرصة استثمارية ذهبية");
  const midLineRaw = sanitizeTextForMedia(promoText.subheadline || promoText.features || "");
  const bottomLineRaw = sanitizeTextForMedia(promoText.priceTag || promoText.callToAction || "تواصل الآن");
  
  // معالجة النص العربي - reshape + reverse للعرض الصحيح في FFmpeg
  const topLine = reshapeArabicText(topLineRaw.replace(/\n/g, " ").trim());
  const midLine = reshapeArabicText(midLineRaw.replace(/\n/g, " ").trim());
  const bottomLine = reshapeArabicText(bottomLineRaw.replace(/\n/g, " ").trim());
  const logo = reshapeArabicText("بيت الجزيرة");
  
  // توقيتات
  const t1 = 0.5;
  const t2 = 1.5;
  const t3 = 2.5;
  const endTime = totalDuration - 0.3;
  
  // ألوان احترافية محسّنة (BGR format for ASS)
  const GOLD = "&H0037AFD4";       // ذهبي فاخر
  const WHITE = "&H00FFFFFF";      // أبيض نقي
  const BLACK = "&H00000000";      // أسود للحدود
  const DARK_BG = "&HE0000000";    // خلفية سوداء شفافة 88% (أكثر وضوحاً)
  const GOLD_BG = "&H8037AFD4";    // خلفية ذهبية شفافة 50% للسعر
  
  // ASS بتصميم احترافي محسّن - خطوط أكبر، ظلال أقوى، خلفيات أوضح
  // Alignment: 8=top-center, 5=middle-center, 2=bottom-center
  // Outline: 5-6 (حدود سميكة)، Shadow: 2-3 (ظلال قوية)
  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Logo,Arial,68,${GOLD},${GOLD},${BLACK},${DARK_BG},1,0,0,0,100,100,3,0,3,5,3,8,100,100,50,1
Style: Title,Arial,88,${WHITE},${WHITE},${BLACK},${DARK_BG},1,0,0,0,100,100,2,0,3,6,3,5,100,100,0,1
Style: Features,Arial,58,${GOLD},${GOLD},${BLACK},${DARK_BG},1,0,0,0,100,100,2,0,3,5,2,5,100,100,0,1
Style: Price,Arial,78,${WHITE},${WHITE},${BLACK},${GOLD_BG},1,0,0,0,100,100,3,0,3,6,3,2,100,100,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,${toAssTime(t1)},${toAssTime(endTime)},Logo,,0,0,0,,${logo}
Dialogue: 0,${toAssTime(t1 + 0.3)},${toAssTime(endTime)},Title,,0,0,0,,${topLine}
Dialogue: 0,${toAssTime(t2)},${toAssTime(endTime)},Features,,0,0,0,,${midLine}
Dialogue: 0,${toAssTime(t3)},${toAssTime(endTime)},Price,,0,0,0,,${bottomLine}
`.trim();

  require("fs").writeFileSync(outPath, ass, "utf8");
  console.log("[ASS] Generated simple professional subtitles");
  return outPath;
}

// 📥 تنزيل صورة من URL إلى ملف محلي
async function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = require('fs').createWriteStream(destPath);
    
    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirect
        downloadImage(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
    }).on('error', (err) => {
      require('fs').unlink(destPath, () => {});
      reject(err);
    });
  });
}

// 🎬 إنشاء فيديو شرائح احترافي مع نصوص عربية
async function createSlideshowVideo(imagePaths, outputPath, promoText, duration = 20) {
  const tempDir = path.join(__dirname, "../../public/uploads/temp");
  await fs.mkdir(tempDir, { recursive: true });
  
  if (!imagePaths || imagePaths.length === 0) {
    throw new Error("لا توجد صور لإنشاء الفيديو");
  }

  // Calculate duration per slide with transition overlap
  const transition = 0.8; // مدة الانتقال
  const numImages = imagePaths.length;
  const slideDuration = Math.max(2.5, (duration + (numImages - 1) * transition) / numImages);
  const totalDuration = (numImages * slideDuration) - ((numImages - 1) * transition);
  
  // 🔒 Security: Define allowed base directories for images
  const publicDir = path.resolve(__dirname, "../../public");
  const uploadsDir = path.resolve(__dirname, "../../public/uploads");
  const os = require('os');
  const tmpDir = os.tmpdir(); // Allow /tmp/ directory for temporary files
  
  // Verify images exist and get valid paths
  const validPaths = [];
  const downloadedFiles = []; // Track downloaded files for cleanup
  
  for (const imgPath of imagePaths) {
    // 🔒 Security: Validate input type
    if (typeof imgPath !== 'string' || imgPath.length > 1000) {
      console.log(`[Video] ❌ Invalid image path type or too long`);
      continue;
    }
    
    // 🌐 Handle Cloudinary/remote URLs
    if (imgPath.startsWith('http://') || imgPath.startsWith('https://')) {
      try {
        const ext = path.extname(new URL(imgPath).pathname) || '.jpg';
        const tempFile = path.join(tempDir, `remote_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
        console.log(`[Video] 📥 Downloading remote image: ${imgPath.substring(0, 80)}...`);
        await downloadImage(imgPath, tempFile);
        validPaths.push(tempFile);
        downloadedFiles.push(tempFile);
        console.log(`[Video] ✅ Downloaded to: ${tempFile}`);
        continue;
      } catch (dlErr) {
        console.log(`[Video] ❌ Failed to download: ${dlErr.message}`);
        continue;
      }
    }
    
    // 🔒 Security: Block path traversal attempts
    if (imgPath.includes('..') || imgPath.includes('\0')) {
      console.log(`[Video] ❌ Blocked path traversal attempt: ${imgPath.substring(0, 50)}`);
      continue;
    }
    
    // Handle different path formats
    let fullPath = imgPath;
    
    // If it's already an absolute path (from listings.js or videoService.js), use it directly
    if (imgPath.startsWith('/home/') || imgPath.startsWith(publicDir)) {
      fullPath = imgPath;
    }
    // Allow paths in /tmp/ directory (for videoService.js downloaded images)
    else if (imgPath.startsWith('/tmp/') || imgPath.startsWith(tmpDir)) {
      fullPath = imgPath;
    }
    // If it's a URL path starting with /uploads, convert to filesystem path
    else if (imgPath.startsWith('/uploads/')) {
      fullPath = path.join(publicDir, imgPath);
    } 
    // Otherwise treat as relative to public folder  
    else if (!imgPath.startsWith('/')) {
      fullPath = path.join(publicDir, imgPath);
    }
    // For other absolute paths, validate and use directly
    else {
      fullPath = imgPath;
    }
    
    // 🔒 Security: Validate resolved path is within allowed directory
    // Allow paths in publicDir OR tmpDir (for temporary downloaded files)
    const isInPublicDir = isPathSafe(fullPath, publicDir);
    const isInTmpDir = fullPath.startsWith('/tmp/') || fullPath.startsWith(tmpDir);
    
    if (!isInPublicDir && !isInTmpDir) {
      console.log(`[Video] ❌ Path outside allowed directory: ${fullPath}`);
      console.log(`[Video]    Allowed: ${publicDir} or ${tmpDir}`);
      continue;
    }
    
    try {
      await fs.access(fullPath);
      validPaths.push(fullPath);
      console.log(`[Video] ✅ Found image: ${fullPath}`);
    } catch (e) {
      console.log(`[Video] ❌ Image not found: ${fullPath}`);
    }
  }
  
  if (validPaths.length === 0) {
    throw new Error("لم يتم العثور على صور صالحة");
  }
  
  // Store downloadedFiles for cleanup after video generation
  const cleanupDownloads = async () => {
    for (const f of downloadedFiles) {
      try { await fs.unlink(f); } catch {}
    }
  };
  
  // Create ASS subtitle file
  const assPath = path.join(tempDir, `captions_${Date.now()}.ass`);
  const fontsDir = path.join(__dirname, "../public/fonts");
  
  try {
    buildAssFile(promoText, totalDuration, assPath);
    console.log("[Video] ASS subtitle file created:", assPath);
  } catch (e) {
    console.warn("[Video] Failed to create ASS file:", e.message);
  }
  
  // Build FFmpeg complex filter - Professional slideshow with crossfade
  const fps = 30;
  const W = 1920;
  const H = 1080;
  
  // Realistic camera movements (ground-level, no aerial shots)
  const cameraMovements = [
    // Gentle zoom in (subtle)
    { zoom: "min(zoom+0.0005,1.1)", x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" },
    // Gentle zoom out (subtle)
    { zoom: "if(lte(zoom,1.0),1.1,max(1.0,zoom-0.0005))", x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" },
    // Slow pan left to right
    { zoom: "1.05", x: "on/(25*" + String(slideDuration) + ")*(iw-iw/zoom)", y: "ih/2-(ih/zoom/2)" },
    // Slow pan right to left
    { zoom: "1.05", x: "(iw-iw/zoom)-(on/(25*" + String(slideDuration) + ")*(iw-iw/zoom))", y: "ih/2-(ih/zoom/2)" },
    // Static (no movement)
    { zoom: "1.0", x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" },
  ];
  
  // Professional transition types (crossfade variations)
  const transitionTypes = ["fade", "fadeblack", "fadewhite", "distance", "fadefast"];
  
  // Build input arguments
  let args = ["-y"];
  for (const img of validPaths) {
    args.push("-loop", "1", "-t", String(slideDuration), "-framerate", String(fps), "-i", img);
  }
  
  // Build filter complex
  const filters = [];
  
  // Step 1: Scale and apply subtle Ken Burns effect (ground-level only)
  for (let i = 0; i < validPaths.length; i++) {
    const frames = Math.round(slideDuration * fps);
    const movement = cameraMovements[i % cameraMovements.length];
    
    // Scale to 1920x1080 with padding, then apply subtle zoom/pan
    filters.push(
      `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,scale=8000:-1,zoompan=z='${movement.zoom}':x='${movement.x}':y='${movement.y}':d=${frames}:s=${W}x${H}:fps=${fps},format=yuv420p[v${i}]`
    );
  }
  
  // Step 2: Crossfade transitions between clips
  let lastLabel = "v0";
  let currentOffset = slideDuration - transition;
  for (let i = 1; i < validPaths.length; i++) {
    const outLabel = `vx${i}`;
    const transType = transitionTypes[i % transitionTypes.length];
    filters.push(
      `[${lastLabel}][v${i}]xfade=transition=${transType}:duration=${transition}:offset=${currentOffset.toFixed(2)}[${outLabel}]`
    );
    lastLabel = outLabel;
    currentOffset += (slideDuration - transition);
  }
  
  // Step 2.5: Add fade-in at start and fade-out at end
  const fadeInOut = `[${lastLabel}]fade=t=in:st=0:d=0.5,fade=t=out:st=${(totalDuration - 0.5).toFixed(2)}:d=0.5[vfaded]`;
  filters.push(fadeInOut);
  lastLabel = "vfaded";
  
  // Step 3: Add subtitles if ASS file exists
  let finalLabel = lastLabel;
  try {
    await fs.access(assPath);
    await fs.access(fontsDir);
    // Escape paths for FFmpeg filter
    const escapedAssPath = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
    const escapedFontsDir = fontsDir.replace(/\\/g, "/").replace(/:/g, "\\:");
    filters.push(
      `[${lastLabel}]subtitles='${escapedAssPath}':fontsdir='${escapedFontsDir}'[vfinal]`
    );
    finalLabel = "vfinal";
  } catch (e) {
    console.warn("[Video] Subtitles skipped - missing ASS or fonts:", e.message);
  }
  
  // Combine filters
  args.push("-filter_complex", filters.join(";"));
  
  // Output settings - Professional high quality for premium output
  // CRF 18 = very high quality (lower = better quality, larger file)
  // preset "medium" = better compression (slower but smaller files)
  args.push(
    "-map", `[${finalLabel}]`,
    "-c:v", "libx264",
    "-preset", "medium", // Better compression for professional output
    "-crf", "18", // Very high quality (18=very high, 20=high, 23=default, 28=low)
    "-profile:v", "high",
    "-level", "4.0",
    "-pix_fmt", "yuv420p",
    "-r", String(fps),
    "-movflags", "+faststart", // Enable web streaming (progressive download)
    "-t", String(Math.ceil(totalDuration)),
    outputPath
  );
  
  // Execute FFmpeg
  return new Promise((resolve, reject) => {
    console.log("[Video] Running FFmpeg with", validPaths.length, "images...");
    const ff = require("child_process").spawn("ffmpeg", args);
    
    let stderr = "";
    ff.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    
    ff.on("close", async (code) => {
      // Cleanup temp files
      await fs.unlink(assPath).catch(() => {});
      // Cleanup downloaded remote images
      await cleanupDownloads();
      
      if (code === 0) {
        console.log("[Video] FFmpeg completed successfully");
        resolve(true);
      } else {
        console.error("[Video] FFmpeg failed with code", code);
        console.error("[Video] Last stderr:", stderr.slice(-1000));
        reject(new Error("فشل في إنشاء الفيديو"));
      }
    });
    
    ff.on("error", (err) => {
      console.error("[Video] FFmpeg spawn error:", err);
      reject(new Error("فشل في تشغيل FFmpeg"));
    });
  });
}

// 🎬 توليد فيديو شرائح من صور الإعلان المرفوعة - يستخدم FFmpeg
router.post("/user/generate-slideshow-video", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { imagePaths, listingData, customText } = req.body;

  // Check user's support level
  const planResult = await db.query(
    `SELECT COALESCE(MAX(support_level), 0) as support_level
     FROM (
       SELECT p.support_level
       FROM user_plans up
       JOIN plans p ON up.plan_id = p.id
       WHERE up.user_id = $1 AND up.status = 'active' AND (up.expires_at IS NULL OR up.expires_at > NOW())
       UNION ALL
       SELECT p.support_level
       FROM quota_buckets qb
       JOIN plans p ON qb.plan_id = p.id
       WHERE qb.user_id = $1 AND qb.active = true 
         AND (qb.expires_at IS NULL OR qb.expires_at > NOW())
         AND (qb.total_slots - qb.used_slots) > 0
     ) AS combined`,
    [userId]
  );
  
  const supportLevel = parseInt(planResult.rows[0]?.support_level) || 0;
  
  if (supportLevel < 3) {
    return res.status(403).json({ 
      error: "ميزة توليد الفيديو الدعائي متاحة فقط لمشتركي باقة رجال الأعمال",
      upgradeRequired: true 
    });
  }

  if (!imagePaths || imagePaths.length === 0) {
    return res.status(400).json({ error: "يرجى رفع صور العقار أولاً" });
  }

  // Generate dynamic promotional text using AI
  let promoText;
  if (customText) {
    promoText = { headline: customText, subheadline: "", callToAction: "", tagline: "" };
  } else if (listingData) {
    promoText = await generateDynamicPromoText(listingData);
  } else {
    promoText = { headline: "عقار مميز", subheadline: "فرصة استثمارية", callToAction: "تواصل الآن", tagline: "بيت الجزيرة" };
  }

  // Create output directory
  const videoDir = path.join(__dirname, "../../public/uploads/videos");
  await fs.mkdir(videoDir, { recursive: true });
  
  const videoFilename = `slideshow_${userId}_${Date.now()}.mp4`;
  const videoPath = path.join(videoDir, videoFilename);
  const videoUrl = `/uploads/videos/${videoFilename}`;

  console.log("[AI] Creating slideshow video for user:", userId);
  console.log("[AI] Image paths:", imagePaths);
  console.log("[AI] Promo text:", JSON.stringify(promoText, null, 2));

  // Create the video
  await createSlideshowVideo(imagePaths, videoPath, promoText, 20);

  res.json({
    success: true,
    videoUrl,
    promoText,
    message: "تم إنشاء الفيديو بنجاح من صورك!"
  });
}));

// 🎬 الحصول على قوالب الفيديو المتاحة
router.get("/video-templates", asyncHandler(async (req, res) => {
  const { VIDEO_TEMPLATES } = require("../services/advancedVideoService");
  
  const templates = Object.entries(VIDEO_TEMPLATES).map(([key, value]) => ({
    id: key,
    name: value.name,
    nameEn: value.nameEn,
    musicMood: value.musicMood
  }));
  
  res.json({ templates });
}));

// 🎬 توليد فيديو متقدم مع قوالب وموسيقى
router.post("/user/generate-advanced-video", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { imagePaths, listingData, template = "luxury", includeAudio = true } = req.body;

  const planResult = await db.query(
    `SELECT COALESCE(MAX(support_level), 0) as support_level
     FROM (
       SELECT p.support_level
       FROM user_plans up
       JOIN plans p ON up.plan_id = p.id
       WHERE up.user_id = $1 AND up.status = 'active' AND (up.expires_at IS NULL OR up.expires_at > NOW())
       UNION ALL
       SELECT p.support_level
       FROM quota_buckets qb
       JOIN plans p ON qb.plan_id = p.id
       WHERE qb.user_id = $1 AND qb.active = true 
         AND (qb.expires_at IS NULL OR qb.expires_at > NOW())
         AND (qb.total_slots - qb.used_slots) > 0
     ) AS combined`,
    [userId]
  );
  
  const supportLevel = parseInt(planResult.rows[0]?.support_level) || 0;
  
  if (supportLevel < 2) {
    return res.status(403).json({ 
      error: "ميزة توليد الفيديو المتقدم متاحة لمشتركي الباقات المميزة",
      upgradeRequired: true 
    });
  }

  if (!imagePaths || imagePaths.length === 0) {
    return res.status(400).json({ error: "يرجى رفع صور العقار أولاً" });
  }

  const { VIDEO_TEMPLATES, generateEnhancedPromoText, createAdvancedSlideshow } = require("../services/advancedVideoService");

  const validTemplates = Object.keys(VIDEO_TEMPLATES);
  const selectedTemplate = validTemplates.includes(template) ? template : "luxury";

  let promoText;
  if (listingData) {
    promoText = await generateEnhancedPromoText(listingData, selectedTemplate);
  } else {
    promoText = {
      topLine: "عقار استثنائي للبيع",
      midLine: "موقع مميز - تصميم فاخر",
      bottomLine: "فرصة ذهبية - تواصل الآن!"
    };
  }

  const videoDir = path.join(__dirname, "../../public/uploads/videos");
  await fs.mkdir(videoDir, { recursive: true });
  
  const videoFilename = `advanced_${userId}_${selectedTemplate}_${Date.now()}.mp4`;
  const videoPath = path.join(videoDir, videoFilename);
  const videoUrl = `/uploads/videos/${videoFilename}`;

  console.log("[AI] Creating advanced video for user:", userId, "template:", selectedTemplate);

  try {
    await createAdvancedSlideshow(imagePaths, videoPath, promoText, {
      duration: 25,
      template: selectedTemplate,
      includeAudio
    });

    res.json({
      success: true,
      videoUrl,
      promoText,
      template: selectedTemplate,
      templateName: VIDEO_TEMPLATES[selectedTemplate]?.name || selectedTemplate,
      message: `تم إنشاء الفيديو بنجاح بقالب ${VIDEO_TEMPLATES[selectedTemplate]?.name || "مميز"}!`
    });
  } catch (error) {
    console.error("[AI] Advanced video generation error:", error);
    res.status(500).json({
      error: "فشل في إنشاء الفيديو. يرجى المحاولة مرة أخرى.",
      details: error.message
    });
  }
}));

// 🎬 بدء توليد فيديو دعائي سينمائي - حصرياً لرجال الأعمال (Veo 2.0)
// يرجع فوراً مع operationId ثم يتم الـ polling من الفرونت
router.post("/user/generate-video", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { propertyType, purpose, city, district, price, landArea, buildingArea, bedrooms, bathrooms, title, hasPool, hasElevator, hasGarden, selectedImageUrl, customPromoText, description } = req.body;

  // Check if Gemini API is configured
  if (!genAI) {
    return res.status(503).json({ 
      error: "خدمة توليد الفيديو غير متاحة حالياً. يرجى التواصل مع الإدارة.",
      errorEn: "Video generation service is not available"
    });
  }

    // Check user's support level
    const planResult = await db.query(
      `SELECT COALESCE(MAX(support_level), 0) as support_level
       FROM (
         SELECT p.support_level
         FROM user_plans up
         JOIN plans p ON up.plan_id = p.id
         WHERE up.user_id = $1 AND up.status = 'active' AND (up.expires_at IS NULL OR up.expires_at > NOW())
         UNION ALL
         SELECT p.support_level
         FROM quota_buckets qb
         JOIN plans p ON qb.plan_id = p.id
         WHERE qb.user_id = $1 AND qb.active = true 
           AND (qb.expires_at IS NULL OR qb.expires_at > NOW())
           AND (qb.total_slots - qb.used_slots) > 0
       ) AS combined`,
      [userId]
    );
    
    const supportLevel = parseInt(planResult.rows[0]?.support_level) || 0;
    
    if (supportLevel < 3) {
      return res.status(403).json({ 
        error: "ميزة توليد الفيديو الدعائي متاحة فقط لمشتركي باقة رجال الأعمال",
        upgradeRequired: true 
      });
    }

    if (!propertyType || !city) {
      return res.status(400).json({ error: "يرجى تحديد نوع العقار والمدينة" });
    }

  try {
    // Generate promotional text - use custom text if provided, otherwise AI generates unique text
    let promoText;
    if (customPromoText && customPromoText.trim()) {
      // User provided custom promotional text
      promoText = {
        headline: customPromoText.trim(),
        subheadline: `${propertyType} في ${city}`,
        callToAction: purpose === "بيع" ? "تملّك الآن! 💰" : "استأجر اليوم! 🏠",
        tagline: "بيت الجزيرة ✨",
        priceTag: price ? `${Number(price).toLocaleString('ar-SA')} ريال` : null
      };
      console.log("[AI] Using custom promo text from user:", customPromoText);
    } else {
      // Generate dynamic promotional text using AI (unique for each listing)
      promoText = await generateDynamicPromoText({
        propertyType, purpose, city, district, price, landArea, buildingArea, 
        bedrooms, bathrooms, title, description, hasPool, hasElevator, hasGarden
      });
    }

    // Build video prompt with promotional messaging - Realistic and grounded
    let videoPrompt = `Professional real estate property showcase video in ${city || 'Saudi Arabia'}.
${propertyType === "فيلا" || propertyType === "قصر" ? "Ground-level view of luxury villa exterior, realistic architecture, natural daylight, authentic property details, front facade, entrance area" : ""}
${propertyType === "شقة" ? "Real apartment building exterior, actual building facade, realistic urban setting, authentic property appearance" : ""}
${propertyType === "مجمع تجاري" || propertyType === "مبنى تجاري" ? "Actual commercial building exterior, realistic business district setting, authentic property appearance" : ""}
${propertyType === "فندق" ? "Real hotel building exterior, authentic entrance, realistic property appearance" : ""}
${propertyType.includes("أرض") ? "Actual land plot, realistic landscape, authentic property boundaries, natural setting" : ""}
Realistic ground-level camera movement, natural lighting, authentic property showcase, professional real estate video quality.
NO aerial shots, NO drone footage, NO flying cameras, NO unrealistic movements.
NO people, NO text overlays, NO fantasy elements - only realistic property showcase.
Keep camera at eye level or slightly elevated, smooth slow pan or gentle zoom on the actual property.`;

    console.log("[AI] Starting video generation for user:", userId);
    console.log("[AI] Video prompt:", videoPrompt);
    console.log("[AI] Promotional text:", JSON.stringify(promoText, null, 2));

    let operation;
    let useImageToVideo = false;

    // If user selected an image, try image-to-video generation
    // Only works with server file paths (not blob: URLs from frontend previews)
    if (selectedImageUrl && !selectedImageUrl.startsWith('blob:') && selectedImageUrl.startsWith('/')) {
      try {
        const imagePath = path.join(__dirname, "../../public", selectedImageUrl);
        const imageBuffer = await fs.readFile(imagePath);
        const imageBase64 = imageBuffer.toString('base64');
        const mimeType = selectedImageUrl.endsWith('.png') ? 'image/png' : 'image/jpeg';

        console.log("[AI] Using image-to-video with image:", selectedImageUrl);

        // Enhanced prompt for image-based video - Realistic and grounded
        videoPrompt = `Transform this real estate property image into a realistic promotional video.
Ground-level camera movement, gentle slow pan or subtle zoom on the actual property shown in the image.
Natural lighting enhancement, keep the original property appearance exactly as shown.
Add only subtle realistic environmental motion (gentle cloud movement, natural light changes, soft shadows).
NO aerial shots, NO drone footage, NO flying cameras, NO unrealistic camera movements.
NO text overlays, NO people - pure realistic visual showcase of this specific property from the image.
Camera stays at eye level or slightly elevated, smooth and natural movement only.`;

        operation = await genAI.models.generateVideos({
          model: "veo-2.0-generate-001",
          prompt: videoPrompt,
          image: {
            imageBytes: imageBase64,
            mimeType: mimeType
          },
          config: {
            aspectRatio: "16:9",
            numberOfVideos: 1,
            durationSeconds: 8,
          }
        });
        useImageToVideo = true;
      } catch (imgErr) {
        console.log("[AI] Image-to-video failed, falling back to text-only:", imgErr.message);
        // Fall back to text-only generation
        operation = await genAI.models.generateVideos({
          model: "veo-2.0-generate-001",
          prompt: videoPrompt,
          config: {
            aspectRatio: "16:9",
            numberOfVideos: 1,
            durationSeconds: 8,
          }
        });
      }
    } else {
      // Text-only video generation (also used when blob: URL is passed)
      if (selectedImageUrl && selectedImageUrl.startsWith('blob:')) {
        console.log("[AI] Blob URL detected, using text-only generation. Image-to-video requires uploaded images.");
      }
      operation = await genAI.models.generateVideos({
        model: "veo-2.0-generate-001",
        prompt: videoPrompt,
        config: {
          aspectRatio: "16:9",
          numberOfVideos: 1,
          durationSeconds: 8,
        }
      });
    }

    const operationId = `video_${userId}_${Date.now()}`;
    console.log("[AI] Video generation started, operationId:", operationId, "operation:", operation.name);

    // Store operation in memory for polling
    videoOperations.set(operationId, {
      operation,
      userId,
      status: "processing",
      startedAt: Date.now(),
      videoUrl: null,
      error: null,
      promoText,
      useImageToVideo
    });

    // Start background polling (don't await)
    pollVideoOperation(operationId).catch(err => {
      console.error("[AI] Background poll error:", err);
    });

    // Return immediately with operationId and promotional text
    res.json({ 
      success: true,
      operationId,
      status: "processing",
      promoText,
      useImageToVideo,
      message: useImageToVideo 
        ? "جاري تحويل صورتك إلى فيديو سينمائي... قد يستغرق من 1-3 دقائق" 
        : "جاري توليد الفيديو... قد يستغرق من 1-3 دقائق"
    });

  } catch (error) {
    console.error("[AI] Video generation error:", error);
    
    if (error.status === 429) {
      return res.status(429).json({ 
        error: "تم تجاوز الحد المسموح لطلبات الفيديو. حاول بعد دقيقة.",
        errorEn: "Video generation rate limit exceeded"
      });
    }
    
    if (error.status === 403 || error.message?.includes("permission")) {
      return res.status(403).json({ 
        error: "ليس لديك صلاحية لاستخدام خدمة توليد الفيديو. تأكد من تفعيل Veo في حساب Google.",
        errorEn: "Video generation permission denied"
      });
    }

    if (error.message?.includes("billing") || error.message?.includes("FAILED_PRECONDITION")) {
      return res.status(400).json({ 
        error: "خدمة توليد الفيديو تتطلب حساب Google Cloud مفعل عليه الفوترة. تواصل مع الدعم الفني.",
        errorEn: "GCP billing required for video generation"
      });
    }

    return res.status(500).json({ 
      error: "حدث خطأ في توليد الفيديو. يرجى المحاولة مرة أخرى.",
      errorEn: error.message || "Video generation error"
    });
  }
}));

// Background polling function for video generation
async function pollVideoOperation(operationId) {
  const opData = videoOperations.get(operationId);
  if (!opData) return;

  const maxWaitTime = 5 * 60 * 1000; // 5 minutes
  const pollInterval = 10000; // 10 seconds
  const startTime = opData.startedAt;

  let result = opData.operation;

  while (!result.done && (Date.now() - startTime) < maxWaitTime) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    try {
      result = await genAI.operations.getVideosOperation({ operation: result });
      console.log("[AI] Background polling:", operationId, result.done ? "complete" : "in progress");
    } catch (err) {
      console.error("[AI] Poll error:", err);
      videoOperations.set(operationId, { ...opData, status: "error", error: err.message });
      return;
    }
  }

  if (!result.done) {
    videoOperations.set(operationId, { ...opData, status: "timeout", error: "استغرق توليد الفيديو وقتاً طويلاً" });
    return;
  }

  if (!result.response || !result.response.generatedVideos || result.response.generatedVideos.length === 0) {
    videoOperations.set(operationId, { ...opData, status: "error", error: "فشل توليد الفيديو" });
    return;
  }

  try {
    const video = result.response.generatedVideos[0];
    const uploadsDir = path.join(__dirname, "../../public/uploads/videos");
    await fs.mkdir(uploadsDir, { recursive: true });
    
    const videoFileName = `promo_${opData.userId}_${Date.now()}.mp4`;
    const videoPath = path.join(uploadsDir, videoFileName);
    
    const videoData = video.video;
    console.log("[AI] Video data:", JSON.stringify(videoData, null, 2));
    
    if (videoData && videoData.uri) {
      // Download video with API key authentication
      const fetch = (await import('node-fetch')).default;
      const apiKey = process.env.Gemeni2 || process.env.GEMINI_API_KEY;
      
      // Try downloading with API key in header first
      let videoResponse = await fetch(videoData.uri, {
        headers: {
          'x-goog-api-key': apiKey
        }
      });
      
      // If that fails, try with API key as query parameter
      if (!videoResponse.ok) {
        const uriWithKey = videoData.uri.includes('?') 
          ? `${videoData.uri}&key=${apiKey}` 
          : `${videoData.uri}?key=${apiKey}`;
        videoResponse = await fetch(uriWithKey);
      }
      
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.status} ${videoResponse.statusText}`);
      }
      
      const arrayBuffer = await videoResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Verify it's actually a video (should start with ftyp for MP4)
      if (buffer.length < 1000 || buffer.toString('utf8', 0, 100).includes('"error"')) {
        console.error("[AI] Downloaded content is not a valid video:", buffer.toString('utf8', 0, 500));
        throw new Error("Downloaded file is not a valid video");
      }
      
      await fs.writeFile(videoPath, buffer);
      console.log("[AI] Video saved, size:", buffer.length, "bytes");
      
    } else if (videoData && videoData.videoBytes) {
      await fs.writeFile(videoPath, Buffer.from(videoData.videoBytes, 'base64'));
    } else {
      throw new Error("No video data available");
    }

    const videoUrl = `/uploads/videos/${videoFileName}`;
    console.log("[AI] Video saved successfully:", videoUrl);

    videoOperations.set(operationId, { ...opData, status: "completed", videoUrl });
  } catch (err) {
    console.error("[AI] Video save error:", err);
    videoOperations.set(operationId, { ...opData, status: "error", error: err.message || "فشل حفظ الفيديو" });
  }
}

// 🔄 التحقق من حالة توليد الفيديو (Polling endpoint)
router.get("/user/video-status/:operationId", authMiddleware, asyncHandler(async (req, res) => {
  const { operationId } = req.params;
  const userId = req.user.id;

  const opData = videoOperations.get(operationId);
  
  if (!opData) {
    return res.status(404).json({ 
      error: "عملية التوليد غير موجودة",
      status: "not_found"
    });
  }

  // Verify ownership
  if (opData.userId !== userId) {
    return res.status(403).json({ error: "غير مصرح" });
  }

  if (opData.status === "completed") {
    // Clean up from memory after successful retrieval
    videoOperations.delete(operationId);
    return res.json({
      status: "completed",
      success: true,
      videoUrl: opData.videoUrl,
      promoText: opData.promoText,
      useImageToVideo: opData.useImageToVideo,
      message: opData.useImageToVideo 
        ? "تم تحويل صورتك إلى فيديو سينمائي بنجاح! 🎬" 
        : "تم توليد الفيديو الدعائي بنجاح!",
      duration: "8 ثواني"
    });
  }

  if (opData.status === "error" || opData.status === "timeout") {
    videoOperations.delete(operationId);
    return res.json({
      status: "error",
      error: opData.error || "فشل توليد الفيديو"
    });
  }

  // Still processing
  const elapsed = Math.floor((Date.now() - opData.startedAt) / 1000);
  res.json({
    status: "processing",
    message: `جاري توليد الفيديو... (${elapsed} ثانية)`,
    elapsedSeconds: elapsed
  });
}));

// 📊 التحقق من حالة توليد الفيديو
router.get("/user/video-status", authMiddleware, asyncHandler(async (req, res) => {
  // Check if Gemini API is configured
  const isAvailable = !!genAI;
  
  res.json({ 
    available: isAvailable,
    message: isAvailable ? "خدمة توليد الفيديو متاحة" : "خدمة توليد الفيديو غير متاحة"
  });
}));

router.post("/analyze-market", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { data } = req.body;

  const prompt = `حلل البيانات التالية لسوق العقارات السعودي وقدم ملخصاً موجزاً:
${JSON.stringify(data, null, 2)}

قدم:
1. ملخص الوضع الحالي
2. الاتجاهات الملحوظة
3. توصيات للتحسين`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "أنت محلل سوق عقاري خبير. قدم تحليلات مختصرة ومفيدة بالعربية." },
        { role: "user", content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const analysis = response.choices[0]?.message?.content || "";

    res.json({ analysis });
  } catch (error) {
    return handleOpenAIError(error, res);
  }
}));

router.post("/draft-response", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { complaint, customerName } = req.body;

  const prompt = `اكتب رداً احترافياً ومهذباً على الشكوى التالية:
اسم العميل: ${customerName || "العميل"}
الشكوى: ${complaint}

اكتب رداً يعبر عن:
1. الاعتذار والتفهم
2. الحل المقترح
3. شكر العميل على صبره`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "أنت ممثل خدمة عملاء محترف. اكتب ردوداً مهذبة واحترافية بالعربية." },
        { role: "user", content: prompt }
      ],
      max_tokens: 400,
      temperature: 0.7,
    });

    const draftResponse = response.choices[0]?.message?.content || "";

    res.json({ response: draftResponse });
  } catch (error) {
    return handleOpenAIError(error, res);
  }
}));

const AI_LEVEL_PROMPTS = {
  0: `أنت مساعد أساسي لمنصة "بيت الجزيرة". 
أجب بإيجاز على الأسئلة الشائعة فقط.
إذا كان السؤال معقداً أو يتطلب مساعدة متخصصة، استخدم [ESCALATE].
أخبر المستخدم أنه يمكنه الترقية للحصول على دعم ذكي أفضل.`,

  1: `أنت مساعد دعم لمنصة "بيت الجزيرة" - مستوى أساسي.
مهمتك:
- الإجابة على الأسئلة الشائعة
- شرح الباقات والأسعار
- المساعدة في البحث عن العقارات
استخدم [ESCALATE] للمشاكل المعقدة أو طلبات الاسترداد.`,

  2: `أنت مساعد دعم متقدم لمنصة "بيت الجزيرة" - مستوى VIP.
مهمتك:
- الإجابة الشاملة على جميع الأسئلة
- المساعدة في إضافة وتحسين الإعلانات
- تقديم نصائح تسويقية للعقارات
- شرح مفصل للباقات والمميزات
- حل المشاكل التقنية
استخدم [ESCALATE] فقط لطلبات الاسترداد أو مشاكل الحساب الجدية.`,

  3: `أنت مساعد شخصي VIP لمنصة "بيت الجزيرة" - أعلى مستوى.
العميل من فئة الإمبراطوري ويستحق أفضل خدمة.
مهمتك:
- الإجابة الشاملة والمفصلة على جميع الأسئلة
- المساعدة الكاملة في إدارة الإعلانات
- تقديم استشارات تسويقية احترافية
- تحليل أداء الإعلانات
- نصائح لزيادة المبيعات
- المساعدة في صياغة أوصاف جذابة
- أولوية قصوى في الخدمة
استخدم [ESCALATE] فقط لطلبات الاسترداد المالية.`
};

const getCustomerSupportPrompt = (plansInfo, aiLevel, userName) => {
  const levelPrompt = AI_LEVEL_PROMPTS[aiLevel] || AI_LEVEL_PROMPTS[0];
  const greeting = userName ? `اسم العميل: ${userName}` : '';
  
  return `${levelPrompt}

${greeting}

قواعد مهمة:
1. أجب باللغة العربية بأسلوب ودود ${aiLevel >= 2 ? 'ومهني واحترافي' : 'ومختصر'}
2. إذا احتجت تدخل بشري، أجب بـ: [ESCALATE] ثم اكتب سبب التصعيد
3. استخدم المعلومات الفعلية للباقات أدناه

معلومات المنصة:
- المنصة سعودية متخصصة في العقارات
- يمكن إضافة صور وفيديو للعقار
- الدفع عبر بطاقة ائتمان أو تحويل بنكي

الباقات المتوفرة حالياً:
${plansInfo}

ملاحظات:
- الأسعار بالريال السعودي شاملة ضريبة القيمة المضافة 15%
- يمكن الترقية في أي وقت`;
};

router.post("/customer-chat", asyncHandler(async (req, res) => {
  const { messages, sessionId, userId } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "الرسائل مطلوبة" });
  }

    const settingsResult = await db.query(
      "SELECT value FROM app_settings WHERE key = 'ai_support_enabled'"
    );
    const aiEnabled = settingsResult.rows[0]?.value === 'true';

    if (!aiEnabled) {
      return res.json({ 
        message: "شكراً لتواصلك! سيتم الرد عليك من فريق الدعم قريباً.",
        escalated: true,
        reason: "الدعم الآلي معطل حالياً"
      });
    }

    // Get user's AI support level from their active plan
    let aiLevel = 0;
    let userName = "";
    
    if (userId) {
      const userResult = await db.query(
        `SELECT u.name, COALESCE(MAX(p.ai_support_level), 0) as ai_level
         FROM users u
         LEFT JOIN user_plans up ON u.id = up.user_id AND up.status = 'active'
         LEFT JOIN plans p ON up.plan_id = p.id
         WHERE u.id = $1
         GROUP BY u.id, u.name`,
        [userId]
      );
      if (userResult.rows[0]) {
        aiLevel = parseInt(userResult.rows[0].ai_level) || 0;
        userName = userResult.rows[0].name || "";
      }
    }

    // If user has no AI support (level 0), limit responses
    if (aiLevel === 0) {
      // Still provide basic help but suggest upgrade
    }

    // Fetch real plans data from database
    const plansResult = await db.query(
      `SELECT name_ar as name, price, max_listings as listings_allowed, max_photos_per_listing as max_photos, 
              max_videos_per_listing as max_videos, duration_days, features, ai_support_level
       FROM plans WHERE visible = true ORDER BY price ASC`
    );
    
    let plansInfo = "";
    plansResult.rows.forEach((plan, idx) => {
      let features = [];
      try {
        features = plan.features ? (typeof plan.features === 'string' ? JSON.parse(plan.features) : plan.features) : [];
      } catch (e) {
        features = [];
      }
      const featuresText = Array.isArray(features) && features.length > 0 ? features.join("، ") : "";
      const aiLevelText = plan.ai_support_level > 0 ? ` | دعم ذكي: مستوى ${plan.ai_support_level}` : "";
      plansInfo += `${idx + 1}. **${plan.name}**: ${plan.price} ريال، ${plan.listings_allowed} إعلان، ${plan.max_photos} صور، ${plan.max_videos} فيديو، ${plan.duration_days} يوم${aiLevelText}${featuresText ? ` | ${featuresText}` : ""}\n`;
    });

    if (!plansInfo) {
      plansInfo = "لا توجد باقات متوفرة حالياً";
    }

    const systemPrompt = getCustomerSupportPrompt(plansInfo, aiLevel, userName);

    // Adjust model and tokens based on AI level
    const maxTokens = aiLevel >= 2 ? 800 : (aiLevel === 1 ? 500 : 300);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map(m => ({
          role: m.role,
          content: m.content
        }))
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    });

    let assistantMessage = response.choices[0]?.message?.content || "عذراً، لم أتمكن من الرد.";
    
    let escalated = false;
    let escalateReason = "";
    
    if (assistantMessage.includes("[ESCALATE]")) {
      escalated = true;
      const parts = assistantMessage.split("[ESCALATE]");
      escalateReason = parts[1]?.trim() || "يحتاج تدخل بشري";
      assistantMessage = "شكراً لتواصلك! سأقوم بتحويل استفسارك لفريق الدعم المختص للمساعدة بشكل أفضل. سيتواصل معك أحد ممثلي الدعم قريباً.";
    }

    if (sessionId) {
      await db.query(
        `INSERT INTO ai_chat_logs (session_id, user_message, ai_response, escalated, escalate_reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [sessionId, messages[messages.length - 1]?.content, assistantMessage, escalated, escalateReason]
      );
    }

    res.json({ message: assistantMessage, escalated, reason: escalateReason });
  } catch (error) {
    return handleOpenAIError(error, res);
  }
}));

router.post("/escalate", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { sessionId, lastMessage, reason } = req.body;
    
    // جلب اسم المستخدم
    let userName = "مستخدم";
    try {
      const userResult = await db.query("SELECT name FROM users WHERE id = $1", [userId]);
      if (userResult.rows[0]?.name) {
        userName = userResult.rows[0].name;
      }
    } catch (e) {
      // استخدام الاسم الافتراضي
    }
    
    const ticketNumber = `TKT-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    
    const result = await db.query(
      `INSERT INTO support_tickets (user_id, ticket_number, category, priority, subject, description, status, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        userId,
        ticketNumber,
        'ai_escalation',
        'medium',
        'تصعيد من الدعم الآلي',
        `سبب التصعيد: ${reason}\n\nآخر رسالة: ${lastMessage}`,
        'new',
        'ai_chatbot'
      ]
    );

    const ticket = result.rows[0];

    // Add the first reply with the conversation context
    await db.query(
      `INSERT INTO support_ticket_replies (ticket_id, sender_id, sender_type, message)
       VALUES ($1, $2, $3, $4)`,
      [
        ticket.id,
        userId,
        'user',
        `تم التصعيد من الدعم الآلي\n\nسبب التصعيد: ${reason || 'يحتاج تدخل بشري'}\n\nآخر رسالة من العميل:\n${lastMessage}`
      ]
    );
    
    // إرسال إشعار للمشرفين (بدون إيقاف العملية عند الفشل)
    try {
      const supportAdmins = await db.query(
        "SELECT id FROM users WHERE role IN ('super_admin', 'admin', 'support_admin')"
      );
      
      for (const admin of supportAdmins.rows) {
        try {
          await db.query(
            `INSERT INTO notifications (user_id, title, body, type, link, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [
              admin.id,
              '🚨 تصعيد من الدعم الآلي',
              `${userName} يحتاج مساعدة بشرية (${ticketNumber})`,
              'support_escalation',
              `/admin/support`
            ]
          );
        } catch (notifErr) {
          console.error(`Failed to notify admin ${admin.id}:`, notifErr.message);
        }
      }
    } catch (notifErr) {
      console.error("Failed to fetch admins for notification:", notifErr.message);
    }
    
    console.log(`🚨 تصعيد جديد من الدعم الآلي: ${ticketNumber} من ${userName}`);
    
    res.json({ ok: true, ticket: ticket, ticketNumber });
}));

router.get("/support-settings", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const result = await db.query(
    "SELECT key, value FROM app_settings WHERE key LIKE 'ai_%'"
  );
  const settings = {};
  result.rows.forEach(row => {
    settings[row.key] = row.value;
  });
  res.json(settings);
}));

router.post("/support-settings", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { ai_support_enabled } = req.body;
  
  await db.query(
    `INSERT INTO app_settings (key, value) VALUES ('ai_support_enabled', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
    [ai_support_enabled ? 'true' : 'false']
  );
  
  res.json({ ok: true, message: "تم حفظ الإعدادات" });
}));

router.get("/chat-logs", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT * FROM ai_chat_logs 
    ORDER BY created_at DESC 
    LIMIT 100
  `);
  res.json({ logs: result.rows });
}));

// تحليل محادثة بالذكاء الاصطناعي للكشف عن المحتوى المشبوه
router.post("/analyze-conversation", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { messages, user1_name, user2_name, listing_title } = req.body;
  
  if (!messages || messages.length === 0) {
    return res.status(400).json({ error: "لا توجد رسائل للتحليل" });
  }
  
  // تحويل الرسائل لنص قابل للتحليل
  const conversationText = messages.map(m => 
    `${m.sender_name}: ${m.content}`
  ).join('\n');
  
  const prompt = `أنت محلل أمني متخصص في منصات العقارات. مهمتك تحليل المحادثة التالية للكشف عن أي محتوى مشبوه أو مخالف.

**المحادثة بين:** ${user1_name} و ${user2_name}
**حول الإعلان:** ${listing_title}

**المحادثة:**
${conversationText}

**حلل المحادثة وفق المعايير التالية:**
1. محتوى غير لائق أو مسيء
2. محاولات احتيال أو نصب
3. طلبات معلومات شخصية حساسة
4. تواصل خارج المنصة (أرقام هاتف، روابط خارجية)
5. نشاط تجاري غير قانوني
6. تهديدات أو ابتزاز
7. عروض مشبوهة أو غير واقعية

**أجب بصيغة JSON فقط:**
{
  "risk_score": (رقم من 0 إلى 100، 0 = آمن، 100 = خطير جداً),
  "risk_level": ("safe" أو "low" أو "medium" أو "high" أو "critical"),
  "flags": ["قائمة بالمخالفات المكتشفة إن وجدت"],
  "analysis": "شرح مختصر للتحليل",
  "recommendation": "التوصية (مراقبة، تحذير، حظر، لا إجراء)"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "أنت محلل أمني. أجب بصيغة JSON فقط." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 500
    });
    
    let analysis;
    try {
      const responseText = response.choices[0]?.message?.content || '{}';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { risk_score: 0, risk_level: 'safe', flags: [], analysis: 'لم يتم التحليل', recommendation: 'لا إجراء' };
    } catch (parseError) {
      analysis = {
        risk_score: 0,
        risk_level: 'unknown',
        flags: [],
        analysis: response.choices[0]?.message?.content || 'خطأ في التحليل',
        recommendation: 'مراجعة يدوية'
      };
    }
    
    res.json({
      ok: true,
      analysis
    });
  } catch (error) {
    return handleOpenAIError(error, res);
  }
}));

// فحص رسالة واحدة قبل إرسالها (للمراقبة الفورية)
// Note: Intentionally keeping try/catch to return fallback {ok: true, safe: true} on any error
router.post("/check-message", authMiddleware, asyncHandler(async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message || message.trim().length === 0) {
      return res.json({ ok: true, safe: true });
    }
    
    // قائمة كلمات مشبوهة للفحص السريع (بدون AI)
    const suspiciousPatterns = [
      /\b\d{10}\b/g, // أرقام هاتف
      /whatsapp|واتساب|واتس/gi,
      /telegram|تليجرام/gi,
      /تحويل.*بنك|حوالة/gi,
      /مبلغ.*مقدم.*ضمان/gi,
      /snapchat|سناب/gi,
      /instagram|انستا/gi,
    ];
    
    const foundPatterns = [];
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(message)) {
        foundPatterns.push(pattern.source);
      }
    }
    
    if (foundPatterns.length > 0) {
      res.json({
        ok: true,
        safe: false,
        warning: "تم اكتشاف محتوى قد يخالف شروط الاستخدام",
        patterns: foundPatterns.length
      });
    } else {
      res.json({ ok: true, safe: true });
    }
  } catch (error) {
    console.error("Message Check Error:", error);
    res.json({ ok: true, safe: true }); // في حالة الخطأ، نسمح بالرسالة
  }
}));

// توليد عرض ترويجي بالذكاء الاصطناعي
router.post("/generate-promotion", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  try {
    const { idea, availablePlans } = req.body;
    
    if (!idea) {
      return res.status(400).json({ ok: false, error: "يرجى إدخال فكرة العرض" });
    }
    
    const plansInfo = availablePlans?.map(p => `${p.name} (ID: ${p.id})`).join(", ") || "الأساس, التميز, النخبة, الصفوة, كبار رجال الأعمال";
    
    const prompt = `أنت خبير تسويق عقاري خليجي محترف. مهمتك إنشاء عرض ترويجي جذاب ومقنع لمنصة "بيت الجزيرة" - منصة عقارية خليجية فاخرة تخدم السعودية، الإمارات، الكويت، قطر، البحرين، عُمان.

## فكرة العرض:
${idea}

## الباقات المتاحة:
${plansInfo}

## المناسبات الخليجية والإسلامية:
### مناسبات إسلامية (لجميع الدول):
- رمضان (ramadan): 🌙 هلال، مسجد، فانوس
- عيد الفطر (eid_fitr): 🎉 احتفال، هدايا
- عيد الأضحى (eid_adha): 🕌 تهنئة، بركة
- موسم الحج (hajj): 🕋 روحانية

### مناسبات وطنية خليجية:
- الإمارات: اليوم الوطني (uae_national) 2 ديسمبر 🇦🇪، يوم العلم (uae_flag) 3 نوفمبر
- الكويت: اليوم الوطني (kuwait_national) 25 فبراير 🇰🇼، يوم التحرير (kuwait_liberation) 26 فبراير
- قطر: اليوم الوطني (qatar_national) 18 ديسمبر 🇶🇦، اليوم الرياضي (qatar_sports) ثاني ثلاثاء فبراير
- البحرين: اليوم الوطني (bahrain_national) 16 ديسمبر 🇧🇭
- عُمان: اليوم الوطني (oman_national) 18 نوفمبر 🇴🇲، يوم النهضة (oman_renaissance) 23 يوليو
- السعودية: اليوم الوطني (saudi_national) 23 سبتمبر 🇸🇦، يوم التأسيس (saudi_founding) 22 فبراير

### مناسبات عامة:
- رأس السنة (new_year): 🎊
- موسم الصيف (summer): ☀️
- موسم الشتاء (winter): ❄️
- العودة للمدارس (back_to_school): 📚
- عرض الإطلاق (launch): 🚀
- عرض خاص (special): ✨

## قواعد الإيموجي:
- استخدم 1-2 إيموجي فقط في badge_text (الشارة)
- الإيموجي المناسبة: 🎁 للهدايا، ✨ للتميز، 🔥 للعروض الحارة، 💎 للفخامة، 🏆 للتميز، ⭐ للنجوم، 💫 للسحر، 🎯 للدقة، 🌟 للتألق

## ألوان الهوية الخليجية الفاخرة:
- ذهبي صحراوي: #D4AF37 (للفخامة والتميز - اللون الأساسي)
- كحلي خليجي: #01273C (للاحترافية والثقة)
- زمردي ملكي: #0B6B4C (للمناسبات الوطنية)
- بنفسجي فخم: #6B21A8 (للعروض الخاصة)
- أحمر مخملي: #991B1B (للعروض المحدودة)
- تركواز بحري: #2A9CA0 (للصيف والبحر)

## ملاحظة مهمة:
- اكتب نصوصاً بعربية فصحى محايدة تناسب جميع دول الخليج
- تجنب العبارات الخاصة بدولة واحدة إلا إذا كان العرض مخصصاً لها
- إذا ذُكرت دولة معينة في الفكرة، استخدم المناسبة الوطنية المناسبة لها

## أنشئ عرضاً بصيغة JSON فقط:
{
  "name": "اسم إنجليزي قصير وجذاب",
  "name_ar": "اسم عربي مميز وجذاب (بدون إيموجي)",
  "description": "وصف إنجليزي موجز",
  "description_ar": "وصف عربي محفز وجذاب (بدون إيموجي، 10-20 كلمة)",
  "promotion_type": "free_trial أو percentage_discount أو fixed_discount أو free_plan",
  "discount_value": رقم (30 للخصم 30%، أو 100 للمجاني),
  "duration_value": رقم المدة (7، 14، 30، 60),
  "duration_unit": "days أو weeks أو months",
  "applies_to": "all_plans أو specific_plans",
  "target_plan_ids": [أرقام الباقات المستهدفة كـ integers],
  "seasonal_tag": "اختر المناسبة المناسبة أو null",
  "badge_text": "نص قصير مع 1-2 إيموجي مناسب (مثال: 🎁 عرض حصري)",
  "badge_color": "لون hex مناسب للمناسبة",
  "banner_text": "نص تسويقي قصير للبانر",
  "background_color": "#002845 أو لون مناسب للمناسبة",
  "overlay_title": "عنوان جذاب للنافذة المنبثقة (اختياري)",
  "overlay_description": "وصف محفز للنافذة (اختياري)",
  "overlay_cta_text": "نص زر الإجراء (مثال: استفد الآن)"
}

## قواعد مهمة:
1. اجعل النصوص العربية بليغة ومحفزة بدون مبالغة
2. تجنب الإيموجي في الأسماء والأوصاف، استخدمها في badge_text فقط
3. اختر ألواناً تتناسب مع المناسبة
4. إذا كانت الفكرة عامة، اختر اللون الذهبي والكحلي
5. أرجع JSON صالح فقط بدون أي نص إضافي`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "أنت خبير تسويق عقاري خليجي لمنصة بيت الجزيرة. أنشئ عروضاً ترويجية احترافية وجذابة تناسب جميع دول الخليج. أجب بصيغة JSON صالح فقط." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1200
    });
    
    const responseText = response.choices[0]?.message?.content || '{}';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      return res.status(500).json({ ok: false, error: "فشل في تحليل استجابة الذكاء الاصطناعي" });
    }
    
    const promotion = JSON.parse(jsonMatch[0]);
    
    res.json({
      ok: true,
      promotion
    });
  } catch (error) {
    return handleOpenAIError(error, res);
  }
}));

module.exports = router;

// Export helper functions for use in other modules
module.exports.createSlideshowVideo = createSlideshowVideo;
module.exports.generateDynamicPromoText = generateDynamicPromoText;
module.exports.generatePromotionalText = generatePromotionalText;
