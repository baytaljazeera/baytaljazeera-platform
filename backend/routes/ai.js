const express = require("express");
const router = express.Router();
const OpenAI = require("openai");
const { GoogleGenAI } = require("@google/genai");
const db = require("../db");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");
const { videoGenerationLimiter } = require("../config/security");
const path = require("path");
const fs = require("fs").promises;
const { spawn } = require("child_process");
const https = require("https");
const http = require("http");
const axios = require("axios");

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

const DEFAULT_SYSTEM_PROMPT = `أنت مساعد ذكي لمنصة "بيت الجزيرة" - منصة عقارية سعودية فاخرة.
مهمتك مساعدة المدراء في:
- إدارة الإعلانات والعقارات
- فهم تقارير المبيعات والإحصائيات
- حل مشاكل العملاء والشكاوى
- اقتراح استراتيجيات تسويقية
- صياغة ردود احترافية للعملاء
- تحليل أداء المنصة

أجب دائماً باللغة العربية بأسلوب احترافي ومختصر.
كن مفيداً وودوداً في ردودك.`;

// Approximate USD pricing (per 1K tokens) — used only for cost estimation
// in the admin Command Center; refresh as OpenAI publishes new rates.
const MODEL_PRICING = {
  'gpt-4o':       { input: 0.0025,   output: 0.01 },
  'gpt-4o-mini':  { input: 0.00015,  output: 0.0006 },
  'gpt-3.5-turbo':{ input: 0.0005,   output: 0.0015 },
};

const ALLOWED_MODELS = Object.keys(MODEL_PRICING);

// All center-controlled settings live in app_settings under ai_* keys.
// Defaults are returned when a key is missing so first-time access doesn't
// look broken.
const SETTINGS_DEFAULTS = {
  ai_support_enabled:        'true',
  ai_system_prompt:          DEFAULT_SYSTEM_PROMPT,
  ai_model:                  'gpt-4o-mini',
  ai_temperature:            '0.7',
  ai_max_tokens:             '1000',
  ai_banned_topics:          '',          // comma/newline-separated keywords
  ai_working_hours_start:    '',          // 24h "HH:MM" — empty = always on
  ai_working_hours_end:      '',
  ai_after_hours_mode:       'respond',   // respond | queue | disable
  ai_per_user_daily_limit:   '30',
  ai_sentiment_enabled:      'true',
  ai_ab_testing_enabled:     'false',
  ai_auto_escalate_negative: 'false',
  ai_knowledge_enabled:      'true',      // inject KB context into customer chat
  ai_lead_detection_enabled: 'true',      // classify customer messages into funnel stages
  ai_escalation_notify_email:    'false',
  ai_escalation_notify_whatsapp: 'false',
  ai_escalation_email_to:        '',      // comma-separated list of admin emails
  ai_escalation_whatsapp_to:     '',      // comma-separated E.164 phone numbers
};

async function loadAiSettings() {
  try {
    const r = await db.query("SELECT key, value FROM app_settings WHERE key LIKE 'ai_%'");
    const out = { ...SETTINGS_DEFAULTS };
    for (const row of r.rows) out[row.key] = row.value;
    return out;
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

function computeCostUsd(model, promptTokens, completionTokens) {
  const p = MODEL_PRICING[model] || MODEL_PRICING['gpt-4o-mini'];
  return ((promptTokens / 1000) * p.input + (completionTokens / 1000) * p.output);
}

async function logAdminChat(client, { userMessage, aiResponse, model, usage, sessionId }) {
  try {
    await client.query(
      `INSERT INTO ai_chat_logs (session_id, user_message, ai_response, source, model, prompt_tokens, completion_tokens, cost_usd, created_at)
       VALUES ($1, $2, $3, 'admin', $4, $5, $6, $7, NOW())`,
      [
        sessionId || null,
        (userMessage || '').slice(0, 4000),
        (aiResponse || '').slice(0, 4000),
        model,
        usage?.prompt_tokens || 0,
        usage?.completion_tokens || 0,
        computeCostUsd(model, usage?.prompt_tokens || 0, usage?.completion_tokens || 0),
      ]
    );
  } catch (logErr) {
    console.warn('[ai chat-log] failed:', logErr.message);
  }
}

const SYSTEM_PROMPT = DEFAULT_SYSTEM_PROMPT;

// ─── Phase 3 helpers: sentiment + A/B variants + auto-escalate ──────────
/**
 * Score an Arabic customer message on a 5-way sentiment scale using a
 * cheap gpt-4o-mini call. Returns { label, score } or null on failure.
 * Score is 0..1 where 0 = very_negative, 1 = very_positive.
 */
async function analyzeSentiment(text) {
  if (!text || text.trim().length < 3) return null;
  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'صنّف مزاج الرسالة التالية. أجب بـ JSON فقط: {"label": "very_negative|negative|neutral|positive|very_positive", "score": رقم بين 0 و 1}. لا شيء غير JSON.' },
        { role: 'user', content: text.slice(0, 800) },
      ],
      max_tokens: 50,
      temperature: 0,
      response_format: { type: 'json_object' },
    });
    const raw = r.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    const allowed = ['very_negative', 'negative', 'neutral', 'positive', 'very_positive'];
    if (!allowed.includes(parsed.label)) return null;
    const score = Math.max(0, Math.min(1, Number(parsed.score) || 0.5));
    return { label: parsed.label, score };
  } catch (e) {
    console.warn('[sentiment] failed:', e.message);
    return null;
  }
}

// ─── Settings enforcement helpers ───────────────────────────────────────
// Parse a banned-topics blob (comma or newline-separated) into lowercase
// keywords. Empty strings are dropped, and the result is unique.
function parseBannedTopics(blob) {
  if (!blob) return [];
  return Array.from(
    new Set(
      blob
        .split(/[\n,،;]/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 1)
    )
  );
}

// Returns the first matched banned term in `text`, or null. Compares
// normalized lowercase strings; works for both Arabic and English.
function findBannedTopic(text, topics) {
  if (!text || topics.length === 0) return null;
  const norm = String(text).toLowerCase();
  for (const t of topics) {
    if (norm.includes(t)) return t;
  }
  return null;
}

// Returns true if "now" (Asia/Riyadh) is OUTSIDE the configured window.
// Empty start or end means always-on. Window can span midnight
// (e.g. 22:00 → 06:00).
function isAfterHours(start, end) {
  if (!start || !end) return false;
  const parseHHMM = (s) => {
    const [h, m] = String(s).split(':').map((n) => parseInt(n, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  };
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  if (s == null || e == null) return false;
  const now = new Date();
  // Use Riyadh local time (UTC+3) consistently for business hours.
  const riyadh = new Date(now.getTime() + (3 * 60 - now.getTimezoneOffset()) * 60_000);
  const cur = riyadh.getUTCHours() * 60 + riyadh.getUTCMinutes();
  if (s <= e) return !(cur >= s && cur < e);
  // Window spans midnight: open if cur >= s OR cur < e.
  return !(cur >= s || cur < e);
}

// Count how many chats this session/user has used today.
async function countTodaysChats({ sessionId, userId }) {
  const params = [];
  const conds = [`created_at >= date_trunc('day', NOW())`, `source = 'customer'`];
  if (userId) {
    params.push(userId);
    conds.push(`(user_id = $${params.length} OR session_id = $${params.length + 1})`);
    params.push(sessionId || '');
  } else if (sessionId) {
    params.push(sessionId);
    conds.push(`session_id = $${params.length}`);
  } else {
    return 0;
  }
  try {
    const r = await db.query(
      `SELECT COUNT(*)::int AS c FROM ai_chat_logs WHERE ${conds.join(' AND ')}`,
      params
    );
    return r.rows[0]?.c || 0;
  } catch {
    return 0;
  }
}

async function logBlocked({ sessionId, userId, userMessage, reason, matchedTerm }) {
  try {
    await db.query(
      `INSERT INTO ai_blocked_attempts (session_id, user_id, user_message, reason, matched_term)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId || null, userId || null, (userMessage || '').slice(0, 2000), reason, matchedTerm || null]
    );
  } catch (e) {
    console.warn('[ai blocked log] failed:', e.message);
  }
}

// ─── Knowledge Base — vector embeddings + retrieval ────────────────────
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMS  = 1536;

async function embedText(text) {
  if (!text || !text.trim()) return null;
  try {
    const r = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: String(text).slice(0, 8000),
    });
    const v = r.data?.[0]?.embedding;
    if (!Array.isArray(v) || v.length !== EMBEDDING_DIMS) return null;
    // pgvector text format expects "[v1,v2,...,vN]"
    return `[${v.join(',')}]`;
  } catch (e) {
    console.warn('[embed] failed:', e.message);
    return null;
  }
}

let _vectorAvailable = null; // cached: do we have pgvector + embedding col?
async function isVectorAvailable() {
  if (_vectorAvailable !== null) return _vectorAvailable;
  try {
    const r = await db.query(`
      SELECT 1 FROM information_schema.columns
       WHERE table_name = 'ai_knowledge_articles' AND column_name = 'embedding'
       LIMIT 1
    `);
    _vectorAvailable = r.rows.length > 0;
  } catch {
    _vectorAvailable = false;
  }
  return _vectorAvailable;
}

// Vector retrieval when pgvector + embeddings are available; otherwise
// falls back to the ILIKE keyword search so the system keeps working on
// deployments without pgvector or when embeddings haven't been
// backfilled yet.
async function retrieveKnowledge(query, limit = 3) {
  if (!query || !query.trim()) return [];

  // Try vector path first
  if (await isVectorAvailable()) {
    const embedding = await embedText(query);
    if (embedding) {
      try {
        const r = await db.query(
          `SELECT id, title, content, category_id, priority,
                  1 - (embedding <=> $1::vector) AS similarity
             FROM ai_knowledge_articles
            WHERE is_active = true AND embedding IS NOT NULL
            ORDER BY embedding <=> $1::vector
            LIMIT $2`,
          [embedding, limit]
        );
        // Filter very weak matches (cosine similarity < 0.30) to avoid
        // injecting irrelevant articles.
        const strong = r.rows.filter((row) => Number(row.similarity) >= 0.30);
        if (strong.length > 0) return strong;
      } catch (e) {
        console.warn('[kb vector] failed, falling back:', e.message);
      }
    }
  }

  // Fallback: lightweight ILIKE token-overlap
  const words = query
    .toLowerCase()
    .replace(/[^؀-ۿ\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .slice(0, 12);
  if (words.length === 0) return [];
  const likes = words.map((_, i) => `(title ILIKE $${i + 1} OR keywords ILIKE $${i + 1} OR content ILIKE $${i + 1})`);
  const params = words.map((w) => `%${w}%`);
  try {
    const r = await db.query(
      `SELECT id, title, content, category_id, priority
         FROM ai_knowledge_articles
        WHERE is_active = true
          AND (${likes.join(' OR ')})
        ORDER BY priority DESC, updated_at DESC
        LIMIT $${params.length + 1}`,
      [...params, limit]
    );
    return r.rows;
  } catch {
    return [];
  }
}

// Compute + store embedding for one article. Fire-and-forget on save.
async function reindexArticle(id) {
  if (!(await isVectorAvailable())) return;
  try {
    const r = await db.query(
      `SELECT id, title, content, keywords FROM ai_knowledge_articles WHERE id = $1`,
      [id]
    );
    if (r.rows.length === 0) return;
    const a = r.rows[0];
    const text = `${a.title}\n\n${a.content}\n\n${a.keywords || ''}`.trim();
    const embedding = await embedText(text);
    if (!embedding) return;
    await db.query(
      `UPDATE ai_knowledge_articles SET embedding = $1::vector WHERE id = $2`,
      [embedding, id]
    );
  } catch (e) {
    console.warn('[kb reindex] failed for id=' + id + ':', e.message);
  }
}

function knowledgeAsContext(articles) {
  if (!articles || articles.length === 0) return '';
  const parts = articles.map(
    (a, i) => `[#${i + 1}] ${a.title}\n${(a.content || '').slice(0, 600)}`
  );
  return `\n\n--- معلومات معتمدة من قاعدة المعرفة (استخدم هذه فقط ولا تتعدّاها) ---\n${parts.join('\n\n')}\n--- نهاية المعلومات ---`;
}

// ─── Escalation queue ───────────────────────────────────────────────────
async function createEscalation({ chatLogId, sessionId, userId, userMessage, reason, sentiment }) {
  try {
    // session_id is VARCHAR(100); user_id is UUID. Frontend generates
    // session_<ts>_<rand> which fits, but defensively slice anyway so
    // a longer client-injected id can never break the INSERT.
    const r = await db.query(
      `INSERT INTO ai_escalations
         (chat_log_id, session_id, user_id, last_user_message, reason, sentiment, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'open')
       RETURNING *`,
      [
        chatLogId || null,
        sessionId ? String(sessionId).slice(0, 100) : null,
        userId || null,
        (userMessage || '').slice(0, 2000),
        (reason || '').slice(0, 500),
        sentiment || null,
      ]
    );
    const escalation = r.rows[0];
    if (!escalation) {
      console.warn('[escalation create] INSERT returned no row');
      return null;
    }
    console.log('[escalation create] row inserted', JSON.stringify({
      id: escalation.id,
      chatLogId: chatLogId || null,
      sessionId: sessionId || null,
      userId: userId || null,
    }));
    // Fire-and-forget — notification failures must never break the
    // customer flow. cfg fetched here so the helper can stay pure.
    loadAiSettings()
      .then((cfg) => {
        console.log(`[escalation notify #${escalation.id}] started`, JSON.stringify({
          email: cfg.ai_escalation_notify_email === 'true',
          whatsapp: cfg.ai_escalation_notify_whatsapp === 'true',
        }));
        return notifyEscalation(escalation, cfg);
      })
      .catch((e) => console.warn(`[escalation notify #${escalation.id}] outer:`, e.message));
    return escalation.id;
  } catch (e) {
    console.warn('[escalation create] INSERT failed:', e.message, '| chatLogId=', chatLogId, '| sessionId=', sessionId, '| userId=', userId);
    return null;
  }
}

// ─── Lead Intelligence — funnel classification ─────────────────────────
const LEAD_EVENTS = ['lead', 'inquiry', 'visit_request', 'agent_request', 'sale'];
const LEAD_INTENTS = ['buyer', 'seller', 'investor', 'unknown'];

/**
 * Classify a customer message into a funnel stage + intent. Returns
 * { event_type, intent, confidence, property_hint } or null when none
 * detected. Uses gpt-4o-mini in JSON mode for cheap, structured output.
 */
async function classifyLeadSignal(message) {
  if (!message || message.trim().length < 5) return null;
  try {
    const sys = `صنّف الرسالة وفق المراحل العقارية:
- lead: اهتمام مبدئي / يسأل عن عقارات
- inquiry: يسأل عن تفاصيل عقار معيّن (سعر، صور، مساحة...)
- visit_request: يطلب زيارة أو معاينة
- agent_request: يطلب التحدّث مع وكيل/مندوب
- sale: ينوي الشراء أو يطلب التعاقد
- none: ليس له صلة بالمبيعات

أيضاً صنّف النية: buyer / seller / investor / unknown
استخرج "property_hint" (المدينة/الحي/النوع) إن وُجد.

أجب بـ JSON فقط:
{"event_type": "lead|inquiry|visit_request|agent_request|sale|none",
 "intent": "buyer|seller|investor|unknown",
 "confidence": رقم بين 0 و 1,
 "property_hint": "نص قصير أو null"}`;
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: String(message).slice(0, 800) },
      ],
      max_tokens: 120,
      temperature: 0,
      response_format: { type: 'json_object' },
    });
    const raw = r.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    if (!parsed.event_type || parsed.event_type === 'none') return null;
    if (!LEAD_EVENTS.includes(parsed.event_type)) return null;
    return {
      event_type: parsed.event_type,
      intent: LEAD_INTENTS.includes(parsed.intent) ? parsed.intent : 'unknown',
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
      property_hint: parsed.property_hint && parsed.property_hint !== 'null' ? String(parsed.property_hint).slice(0, 200) : null,
    };
  } catch (e) {
    console.warn('[lead classify] failed:', e.message);
    return null;
  }
}

async function recordLeadEvent({ sessionId, userId, chatLogId, signal, rawMessage }) {
  try {
    await db.query(
      `INSERT INTO ai_lead_events
         (session_id, user_id, chat_log_id, event_type, intent, confidence, property_hint, raw_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        sessionId || null,
        userId || null,
        chatLogId || null,
        signal.event_type,
        signal.intent,
        signal.confidence,
        signal.property_hint,
        (rawMessage || '').slice(0, 2000),
      ]
    );
  } catch (e) {
    console.warn('[lead event] failed:', e.message);
  }
}

// ─── Escalation notifications (email + WhatsApp) ───────────────────────
// Imported lazily to avoid circular deps with /routes/whatsapp.js, and
// because emailService is loaded at boot.
async function notifyEscalation(escalation, cfg) {
  const lines = [];
  // Email
  if (cfg.ai_escalation_notify_email === 'true' && cfg.ai_escalation_email_to) {
    try {
      const { sendEmail } = require('../services/emailService');
      const to = cfg.ai_escalation_email_to.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
      const subject = `🚨 تصعيد جديد — بيت الجزيرة AI`;
      const body = `
        <div dir="rtl" style="font-family: Tahoma, sans-serif; color: #002845;">
          <h2 style="color:#9A7D28">تصعيد جديد من المساعد الآلي</h2>
          <p><b>المعرّف:</b> #${escalation.id}</p>
          <p><b>السبب:</b> ${escalation.reason || '—'}</p>
          <p><b>المزاج:</b> ${escalation.sentiment || '—'}</p>
          <p><b>رسالة العميل:</b></p>
          <blockquote style="border-right: 3px solid #D4AF37; padding: 8px 12px; background: #FAF8F4;">
            ${(escalation.last_user_message || '').replace(/</g, '&lt;')}
          </blockquote>
          <p style="margin-top: 16px;">
            <a href="https://www.baytaljazeera.com/add-listing/admin/ai-center?tab=escalations" style="color:#9A7D28">افتح لوحة التصعيدات</a>
          </p>
        </div>
      `;
      for (const recipient of to) {
        try {
          await sendEmail(recipient, subject, body);
          lines.push(`email→${recipient}`);
        } catch (e) {
          lines.push(`email-fail→${recipient}: ${e.message}`);
        }
      }
    } catch (e) {
      lines.push(`email-load-fail: ${e.message}`);
    }
  }
  // WhatsApp
  if (cfg.ai_escalation_notify_whatsapp === 'true' && cfg.ai_escalation_whatsapp_to) {
    try {
      const wa = require('./whatsapp');
      const send = wa.sendWhatsAppMessage || wa.default?.sendWhatsAppMessage;
      const to = cfg.ai_escalation_whatsapp_to.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
      const text = `🚨 تصعيد جديد — بيت الجزيرة AI\nمعرّف: #${escalation.id}\nالسبب: ${escalation.reason || '—'}\nالمزاج: ${escalation.sentiment || '—'}\n\nالرسالة:\n${(escalation.last_user_message || '').slice(0, 400)}\n\nاللوحة: https://www.baytaljazeera.com/add-listing/admin/ai-center?tab=escalations`;
      if (typeof send !== 'function') {
        lines.push('wa-no-send-fn');
      } else {
        for (const recipient of to) {
          try {
            await send(recipient, text);
            lines.push(`wa→${recipient}`);
          } catch (e) {
            lines.push(`wa-fail→${recipient}: ${e.message}`);
          }
        }
      }
    } catch (e) {
      lines.push(`wa-load-fail: ${e.message}`);
    }
  }
  if (lines.length > 0) {
    console.log(`[escalation notify #${escalation.id}] done:`, lines.join(', '));
  } else {
    console.log(`[escalation notify #${escalation.id}] done: no channels enabled`);
  }
}

// ─── Audit log ──────────────────────────────────────────────────────────
async function auditAi({ action, targetKind, targetId, oldValue, newValue, actor }) {
  try {
    await db.query(
      `INSERT INTO ai_audit_log
         (action, target_kind, target_id, old_value, new_value, actor_id, actor_name, actor_role)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8)`,
      [
        action,
        targetKind || null,
        targetId != null ? String(targetId).slice(0, 80) : null,
        oldValue == null ? null : JSON.stringify(oldValue),
        newValue == null ? null : JSON.stringify(newValue),
        actor?.id || null,
        actor?.name || null,
        actor?.role || null,
      ]
    );
  } catch (e) {
    console.warn('[ai audit] failed:', e.message);
  }
}

/**
 * Pick a random active prompt variant weighted by `weight`. Returns
 * { id, prompt_text } or null when no variant configured / A/B disabled.
 */
async function pickPromptVariant() {
  try {
    const r = await db.query(
      "SELECT id, prompt_text, weight FROM ai_prompt_variants WHERE is_active = true AND weight > 0"
    );
    if (r.rows.length === 0) return null;
    const total = r.rows.reduce((s, x) => s + (x.weight || 0), 0);
    if (total <= 0) return null;
    let n = Math.random() * total;
    for (const row of r.rows) {
      n -= row.weight;
      if (n <= 0) return { id: row.id, prompt_text: row.prompt_text };
    }
    return { id: r.rows[0].id, prompt_text: r.rows[0].prompt_text };
  } catch {
    return null;
  }
}

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

  const cfg = await loadAiSettings();
  const model = ALLOWED_MODELS.includes(cfg.ai_model) ? cfg.ai_model : 'gpt-4o-mini';
  const temperature = Math.min(2, Math.max(0, parseFloat(cfg.ai_temperature) || 0.7));
  const maxTokens = Math.min(4000, Math.max(50, parseInt(cfg.ai_max_tokens, 10) || 1000));
  const systemPrompt = cfg.ai_system_prompt || DEFAULT_SYSTEM_PROMPT;

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
      max_tokens: maxTokens,
      temperature,
    });

    const assistantMessage = response.choices[0]?.message?.content || "عذراً، لم أتمكن من الرد.";
    const usage = response.usage || {};
    const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content || '';

    // Log admin chat (was previously not captured anywhere — admins
    // querying the bot for sensitive data left no audit trail).
    await logAdminChat(db, {
      userMessage: lastUser,
      aiResponse: assistantMessage,
      model,
      usage,
      sessionId: req.user?.id ? `admin:${req.user.id}` : null,
    });

    res.json({
      message: assistantMessage,
      usage: {
        prompt_tokens: usage.prompt_tokens || 0,
        completion_tokens: usage.completion_tokens || 0,
        total_tokens: usage.total_tokens || 0,
        estimated_cost_usd: computeCostUsd(model, usage.prompt_tokens || 0, usage.completion_tokens || 0),
        model,
      },
    });
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
  
  const prompt = `أنت أفضل كاتب نصوص فيديو عقاري فاخر في السعودية والخليج. أسلوبك يجمع بين رقي صنّاع المحتوى السينمائي وحرفية كتّاب الإعلانات لدى دور المزادات الراقية (Sotheby's, Christie's). كل كلمة لها قيمة. لا حشو، لا قوالب جاهزة، لا كلام عام.

🏠 بيانات العقار:
- النوع: ${propertyType || "عقار فاخر"}
- الغرض: ${purpose || "للبيع"}
- المدينة: ${city || "الخليج"}
- الحي: ${district || "موقع استراتيجي"}
- السعر: ${formattedPrice || "عرض حصري"}
- المساحة: ${formattedArea || "مساحة واسعة"}
- المميزات: ${featuresText}
${title ? `- عنوان المالك: ${title}` : ''}
${description ? `- وصف المالك: ${description}` : ''}

📝 اكتب 4 عناصر بعناية شديدة:

1) **headline** (3-6 كلمات بحدّ أقصى — جملة واحدة قصيرة كصاعقة):
   - يجب أن تثير الفضول بصرياً، لا أن تصف.
   - أمثلة جيدة: "هنا تبدأ القصة"، "حيث تسكن الفخامة"، "إعلان يستحق التوقف"
   - أمثلة سيئة (ممنوعة): "فيلا فاخرة للبيع في الرياض"، "عقار مميز بسعر منافس"

2) **subheadline** (5-9 كلمات — جملة موقع/تجربة، لا قائمة مميزات):
   - تخبر المشاهد عن المكان أو الشعور، لا عن عدد الغرف.
   - مثال جيد: "في قلب ${district || "أرقى الأحياء"}، حيث الهدوء سيد المشهد"
   - مثال سيئ: "5 غرف نوم و3 حمامات ومسبح وحديقة"

3) **priceTag** (2-4 كلمات — CTA لاذع):
   - دعوة لاتخاذ خطوة، ليست مجرد رقم.
   - أمثلة: "احجز معاينتك الآن"، "تواصل قبل فواته"، "اتصل لتفاصيل خاصة"
   - ⛔ لا تذكر السعر هنا — السعر يعرض في مكان آخر من الفيديو.

4) **voiceScript** (150-220 كلمة — تعليق صوتي وثائقي راقٍ، مدة ~60-90 ثانية):
   - افتتاحية بجملة قصيرة قوية تشد المشاهد في أول ثانيتين.
   - ثم قصة قصيرة عن المكان (الحي، أجواؤه، إيقاع الحياة فيه).
   - ثم تجوّل وصفي حسّي بالعقار — الإضاءة، المساحات، التفاصيل المعمارية، اللحظات التي ستعيشها فيه.
   - دون قائمة مرافق. القصد هو الشعور لا التعداد.
   - ختام يدعو إلى تجربة المعاينة، باسم "بيت الجزيرة".
   - ⛔ ممنوع ذكر السعر أو أي رقم مالي.
   - ⛔ ممنوع استخدام: "فاخر، استثنائي، حصري، ذهبي، مميز، فرصة، عرض" — هذه كلمات مستهلكة. ابحث عن بدائل أصلية وأقرب للمعنى البصري الحقيقي.

⚡ قواعد الكتابة:
- عربية فصحى بسيطة، **بدون تشكيل نهائياً** (لا حركات).
- جمل قصيرة (4-9 كلمات للجملة في الـ headline/subheadline). لا فقرات طويلة.
- فاصلات للتنفّس، ونقاط للوقف، وثلاث نقاط (...) للتأمل في voiceScript.
- بدون emoji نهائياً.
- ⛔ **ممنوع كتابة أي رقم بصيغته الرقمية في voiceScript** (لا "725" ولا "5" ولا "100"). اكتب كل الأعداد بالكلمات العربية الصحيحة: "سبعمائة وخمس وعشرون"، "خمس غرف"، "مئة متر". هذا حرج لأن المعلّق الصوتي يقرأ الأرقام بشكل خاطئ.
- استخدم المثنى الصحيح: "غرفتان" لا "2 غرف" ولا "غرفتين". للأعداد 3-10: "ثلاث غرف" لا "3 غرف".
- في voiceScript تحديداً: تجنّب ذكر أي مساحة بالأمتار، أو عدد محدّد إن كان أكبر من 20 — فضّل عبارات وصفية ("مساحات واسعة"، "عدد كبير من الغرف") بدلاً من أرقام دقيقة. هذا يمنع كلياً مشاكل النطق.
- اقرأ ما تكتب بصوتك الداخلي — لو شعرت أنه مكرر أو "إعلاني مبتذل"، أعد كتابته.

أرجع JSON صالحاً فقط (بدون أي شرح خارجه):
{"headline": "...", "subheadline": "...", "priceTag": "...", "voiceScript": "..."}`;

  // محاولة Gemini أولاً
  if (genAI) {
    try {
      console.log("[Gemini] Generating promotional text...");
      const result = await genAI.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
        config: {
          temperature: 0.8,
          maxOutputTokens: 2000,
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

  // بديل OpenAI — استخدمنا gpt-4o (وليس mini) لأن جودة النسخ التسويقي حرجة هنا.
  // التكلفة تبقى صغيرة لأن المخرج محدود بـ 600-900 token تقريباً.
  try {
    console.log("[OpenAI] Generating promotional text via gpt-4o (cinematic upgrade)...");
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "أنت كاتب نصوص فيديو عقاري فاخر في السعودية. تكتب نصوصاً قصيرة، أنيقة، وغير مكررة — كما يكتب صنّاع المحتوى السينمائي. تتجنب الكليشيهات والكلمات المستهلكة. ترجع JSON صالحاً فقط، بدون شرح أو ملاحظات خارج الـ JSON." },
        { role: "user", content: prompt }
      ],
      max_tokens: 900,
      temperature: 0.85,
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
  
  // توقيتات سينمائية: عناصر تظهر متتابعة بفواصل أطول، والقيمة الأخيرة (CTA) تتأخر قليلاً للوزن.
  const t1 = 1.2;   // عنوان رئيسي (يدخل بعد افتتاحية صامتة قصيرة)
  const t2 = 3.0;   // وصف موقع/تجربة
  const t3 = totalDuration - 4.5;  // CTA يدخل قرب النهاية لتأثير ختامي
  const logoFadeOut = totalDuration - 0.8;
  const endTime = totalDuration - 0.5;

  // لوحة ألوان سينمائية (BGR for ASS)
  const GOLD   = "&H0037AFD4"; // ذهبي بيت الجزيرة
  const WHITE  = "&H00FFFFFF";
  const BLACK  = "&H00000000";
  const SOFT_SHADOW = "&H80000000";

  // فلسفة التصميم:
  //  - خط Cairo (موجود في /backend/public/fonts كما يستخدمه advancedVideoService).
  //  - عنصر واحد فقط مرئي بقوة في كل لحظة → focus بصري.
  //  - الـ fade أطول (1200ms in / 800ms out) → "ينساب" بدلاً من snap.
  //  - حركة دخول لطيفة من الأسفل (\move عمودي 60px) → cinematic feel.
  //  - Logo صغير ثابت أسفل اليمين (لا يزاحم المحتوى).
  //  - استخدام MarginV الكبيرة للابتعاد عن الحواف.
  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Logo,Cairo,46,${GOLD},${GOLD},${BLACK},${SOFT_SHADOW},1,0,0,0,100,100,3,0,1,3,3,3,80,80,60,1
Style: Title,Cairo,110,${WHITE},${WHITE},${BLACK},${SOFT_SHADOW},1,0,0,0,100,100,2,0,1,6,5,5,140,140,0,1
Style: Sub,Cairo,52,${GOLD},${GOLD},${BLACK},${SOFT_SHADOW},0,0,0,0,100,100,3,0,1,4,4,5,180,180,0,1
Style: CTA,Cairo,84,${WHITE},${WHITE},${GOLD},${SOFT_SHADOW},1,0,0,0,100,100,4,0,1,7,5,2,120,120,80,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
; Logo: ثابت أسفل اليمين طوال الفيديو، fade in بطيء + fade out قبل النهاية.
Dialogue: 0,${toAssTime(0.6)},${toAssTime(logoFadeOut)},Logo,,0,0,0,,{\\fad(1000,800)}${logo}
; Title: يدخل من تحت بحركة ناعمة، يبقى ~1.5 ثانية ثم يختفي بسلاسة.
Dialogue: 1,${toAssTime(t1)},${toAssTime(t1 + 2.6)},Title,,0,0,0,,{\\fad(1200,800)\\move(960,600,960,540,0,900)}${topLine}
; Subhead: يأتي بعد ما يختفي الـ Title، أقصر مدة لقراءة سريعة.
Dialogue: 1,${toAssTime(t2)},${toAssTime(t2 + 2.4)},Sub,,0,0,0,,{\\fad(1200,800)\\move(960,580,960,540,0,900)}${midLine}
; CTA: يدخل أخيراً للتأثير الختامي مع حركة up-fade.
Dialogue: 2,${toAssTime(t3)},${toAssTime(endTime)},CTA,,0,0,0,,{\\fad(1500,500)\\move(960,720,960,640,0,1000)}${bottomLine}
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
  // Slightly longer crossfade + minimum slide duration gives each shot time to breathe (cinematic pacing).
  const transition = 1.5; // crossfade أطول (1.5s بدل 1.2s) — انتقال سينمائي ناعم
  const numImages = imagePaths.length;
  const slideDuration = Math.max(4.5, Math.min(20, (duration + (numImages - 1) * transition) / numImages));
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
  
  const frames = Math.round(slideDuration * fps);
  // ─── حركات كاميرا سينمائية أنعم ───
  // (سرعات zoom أقل بنسبة 35% — حركة شبيهة بـ drone slow-push للمنازل الفاخرة)
  const cameraMovements = [
    // 1) Slow push-in افتتاحي — تكبير بطيء جداً من المنتصف
    { zoom: `min(zoom+0.0009,1.20)`, x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" },
    // 2) Pull-out هادئ — كشف العقار من تفصيل إلى كامل
    { zoom: `if(lte(zoom,1.0),1.20,max(1.0,zoom-0.0008))`, x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" },
    // 3) Tilt-down ناعم مع تكبير لطيف
    { zoom: `min(zoom+0.0006,1.15)`, x: "iw/2-(iw/zoom/2)", y: `min(on*${(0.4/frames).toFixed(6)}*ih,ih/2-(ih/zoom/2))` },
    // 4) Pan أفقي بطيء (يسار→يمين) بدون تكبير ملحوظ
    { zoom: "1.12", x: `on/${frames}*(iw-iw/zoom)`, y: "ih/2-(ih/zoom/2)" },
    // 5) حركة قطرية ناعمة (drone-style)
    { zoom: `min(zoom+0.0006,1.16)`, x: `on/${frames}*(iw-iw/zoom)*0.7`, y: `on/${frames}*(ih-ih/zoom)*0.5` },
  ];

  // ─── انتقالات سينمائية فقط (إزالة الانتقالات المزعجة fadeblack/fadewhite/circlecrop/radial/hblur) ───
  const transitionTypes = ["fade", "dissolve", "smoothleft", "smoothright", "fade", "dissolve"];
  
  // Build input arguments
  let args = ["-y"];
  for (const img of validPaths) {
    args.push("-loop", "1", "-t", String(slideDuration), "-framerate", String(fps), "-i", img);
  }
  
  // Build filter complex
  const filters = [];
  
  // Step 1: Scale and apply dramatic Ken Burns effect
  for (let i = 0; i < validPaths.length; i++) {
    const movement = cameraMovements[i % cameraMovements.length];
    
    // Scale, apply Ken Burns zoom/pan, then a LIGHTWEIGHT cinematic color grade:
    //   • eq with per-channel gamma → cheap "filmic warm" tilt (gamma_r>1 lifts oranges,
    //     gamma_b<1 cools blue highlights). Single fused filter, no curves/colorbalance
    //     which are 3-4× more CPU-intensive on Render's shared cores.
    //   • unsharp small kernel only → fast edge enhancement.
    //   • vignette PI/4.5 → soft corners.
    // Restores the previous ~render time while keeping most of the cinematic feel.
    filters.push(
      `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,scale=8000:-1,zoompan=z='${movement.zoom}':x='${movement.x}':y='${movement.y}':d=${frames}:s=${W}x${H}:fps=${fps},eq=contrast=1.10:brightness=0.02:saturation=1.18:gamma=1.03:gamma_r=1.05:gamma_b=0.96,unsharp=3:3:0.4,vignette=PI/4.5,format=yuv420p[v${i}]`
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
  
  // Step 2.5: Cinematic fade-in/out — أطول (1.2s) لافتتاحية وخاتمة درامية
  const fadeInOut = `[${lastLabel}]fade=t=in:st=0:d=1.2,fade=t=out:st=${(totalDuration - 1.2).toFixed(2)}:d=1.2[vfaded]`;
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
router.post("/user/generate-slideshow-video", authMiddleware, videoGenerationLimiter, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { imagePaths, listingData, customText } = req.body;

  const planResult = await db.query(
    `SELECT p.max_videos_per_listing, p.video_config
     FROM (
       SELECT up.plan_id FROM user_plans up
       WHERE up.user_id = $1 AND up.status = 'active' AND (up.expires_at IS NULL OR up.expires_at > NOW())
       UNION ALL
       SELECT qb.plan_id FROM quota_buckets qb
       WHERE qb.user_id = $1 AND qb.active = true 
         AND (qb.expires_at IS NULL OR qb.expires_at > NOW())
         AND (qb.total_slots - qb.used_slots) > 0
     ) AS combined
     JOIN plans p ON p.id = combined.plan_id
     ORDER BY p.max_videos_per_listing DESC
     LIMIT 1`,
    [userId]
  );
  
  const userPlan = planResult.rows[0];
  const maxVideos = userPlan?.max_videos_per_listing || 0;
  const videoConfig = userPlan?.video_config || {};
  const videoEnabled = videoConfig.enabled !== false && maxVideos > 0;
  
  if (!videoEnabled) {
    return res.status(403).json({ 
      error: "باقتك الحالية لا تتضمن ميزة توليد الفيديو. يرجى ترقية الباقة",
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
router.post("/user/generate-advanced-video", authMiddleware, videoGenerationLimiter, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { imagePaths, listingData, template = "luxury", includeAudio = true } = req.body;

  const planResult = await db.query(
    `SELECT p.max_videos_per_listing, p.video_config
     FROM (
       SELECT up.plan_id FROM user_plans up
       WHERE up.user_id = $1 AND up.status = 'active' AND (up.expires_at IS NULL OR up.expires_at > NOW())
       UNION ALL
       SELECT qb.plan_id FROM quota_buckets qb
       WHERE qb.user_id = $1 AND qb.active = true 
         AND (qb.expires_at IS NULL OR qb.expires_at > NOW())
         AND (qb.total_slots - qb.used_slots) > 0
     ) AS combined
     JOIN plans p ON p.id = combined.plan_id
     ORDER BY p.max_videos_per_listing DESC
     LIMIT 1`,
    [userId]
  );
  
  const userPlan = planResult.rows[0];
  const maxVideos = userPlan?.max_videos_per_listing || 0;
  const videoConfig = userPlan?.video_config || {};
  const videoEnabled = videoConfig.enabled !== false && maxVideos > 0;
  
  if (!videoEnabled) {
    return res.status(403).json({ 
      error: "باقتك الحالية لا تتضمن ميزة توليد الفيديو. يرجى ترقية الباقة",
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

// 🎬 توليد فيديو ترويجي بالذكاء الاصطناعي - Python Engine
// ─── 3-Tier video gating helpers (standard / luxury / ultra) ───
// In-memory per-user counter for the Luxury daily quota. Resets on backend
// restart — acceptable for now since the cap is "1 per day" and Render restarts
// daily-ish. If we need durability we'll back it with Redis later.
const LUXURY_USAGE = new Map(); // userId -> { count, lastResetMs }
const LUXURY_DAILY_LIMIT = parseInt(process.env.LUXURY_DAILY_LIMIT || "1", 10);
const LUXURY_BYPASS_CODE = process.env.LUXURY_BYPASS_CODE || "M333M333M333";
const ULTRA_BYPASS_CODE = process.env.ULTRA_BYPASS_CODE || "MMM2099";

function checkLuxuryQuota(userId, providedBypassCode) {
  // Bypass code for the owner's testing — must match env exactly.
  if (providedBypassCode && providedBypassCode === LUXURY_BYPASS_CODE) {
    return { allowed: true, bypassed: true };
  }
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const rec = LUXURY_USAGE.get(userId) || { count: 0, lastResetMs: now };
  if (now - rec.lastResetMs >= ONE_DAY) {
    rec.count = 0;
    rec.lastResetMs = now;
  }
  if (rec.count >= LUXURY_DAILY_LIMIT) {
    const msToNext = ONE_DAY - (now - rec.lastResetMs);
    const hoursToNext = Math.ceil(msToNext / (60 * 60 * 1000));
    return { allowed: false, reason: "luxury_daily_limit", retryAfterHours: hoursToNext };
  }
  rec.count += 1;
  LUXURY_USAGE.set(userId, rec);
  return { allowed: true, bypassed: false };
}

router.post("/user/generate-video", authMiddleware, videoGenerationLimiter, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { propertyType, purpose, city, district, price, title, imagePaths, listingId, description, videoQuality, videoVoice, targetDurationSec, seedVideoUrl, mode } = req.body;

  // Resolve requested tier (standard / luxury / ultra). Backwards-compatible —
  // requests without `tier` get treated as the previous default ("standard"),
  // so existing frontend code keeps working until it learns about tiers.
  const requestedTier = String(req.body.tier || "standard").toLowerCase();
  const bypassCode = req.body.bypassCode || req.get("x-bypass-code") || null;

  // ── Tier 3: Ultra Cinematic (Gemini Veo) ──
  // Locked by default; opens with the ULTRA_BYPASS_CODE for owner testing.
  // Each successful generation costs ~$2-6 on Google's billing — heavy gate
  // means we never accept it from a normal user during pre-launch.
  if (requestedTier === "ultra") {
    if (!bypassCode || bypassCode !== ULTRA_BYPASS_CODE) {
      return res.status(403).json({
        error: "هذه الميزة متاحة فقط للباقات المدفوعة المميزة. ستُفتح قريباً.",
        errorEn: "This feature is locked for premium tiers.",
        tier: "ultra",
        locked: true,
      });
    }
    // Bypass accepted — fail fast if Gemini isn't actually configured.
    if (!genAI) {
      return res.status(503).json({
        error: "خدمة الإنتاج السينمائي الخارق غير مفعّلة على الخادم حالياً. تواصل مع الدعم.",
        errorEn: "Gemini Veo not configured (missing GEMINI_API_KEY).",
        tier: "ultra",
      });
    }
    console.log(`[Ultra] 🔓 Bypass code accepted for user ${userId} — kicking off real Veo generation (~$2-6 cost).`);
  }

  // ── Tier 2: Luxury — rate-limit + bypass code ──
  if (requestedTier === "luxury") {
    const quota = checkLuxuryQuota(userId, bypassCode);
    if (!quota.allowed) {
      return res.status(429).json({
        error: `تجاوزت حد المستوى الفاخر (${LUXURY_DAILY_LIMIT} فيديو في اليوم). أعد المحاولة بعد ${quota.retryAfterHours} ساعة، أو استعمل كود التجربة الخاص.`,
        errorEn: `Luxury tier daily limit reached. Retry in ${quota.retryAfterHours}h, or supply the bypass code.`,
        tier: "luxury",
        retryAfterHours: quota.retryAfterHours,
      });
    }
    if (quota.bypassed) {
      console.log(`[Luxury] 🔓 Bypass code accepted for user ${userId} — daily limit ignored.`);
    }
  }

  const planResult = await db.query(
    `SELECT p.max_videos_per_listing, p.max_video_duration, p.max_video_seconds, p.video_config, p.name_ar
     FROM (
       SELECT up.plan_id FROM user_plans up
       WHERE up.user_id = $1 AND up.status = 'active' AND (up.expires_at IS NULL OR up.expires_at > NOW())
       UNION ALL
       SELECT qb.plan_id FROM quota_buckets qb
       WHERE qb.user_id = $1 AND qb.active = true 
         AND (qb.expires_at IS NULL OR qb.expires_at > NOW())
         AND (qb.total_slots - qb.used_slots) > 0
     ) AS combined
     JOIN plans p ON p.id = combined.plan_id
     ORDER BY p.max_videos_per_listing DESC
     LIMIT 1`,
    [userId]
  );
  
  const userPlan = planResult.rows[0];
  const maxVideos = userPlan?.max_videos_per_listing || 0;
  const videoConfig = userPlan?.video_config || {};
  const videoEnabled = videoConfig.enabled !== false && maxVideos > 0;

  if (!videoEnabled) {
    return res.status(403).json({
      error: "باقتك الحالية لا تتضمن ميزة توليد الفيديو. يرجى ترقية الباقة",
      upgradeRequired: true
    });
  }

  // ── Plan-level tier permission gate ──
  // Reads which tiers this plan unlocks. Supports the new `allowed_tiers`
  // array; falls back to the legacy `tier` string for old DB rows.
  // Bypass codes (LUXURY_BYPASS_CODE / ULTRA_BYPASS_CODE), if present and
  // valid earlier in the route, take precedence — they short-circuit this gate.
  const planAllowedTiers = (function (cfg) {
    if (Array.isArray(cfg?.allowed_tiers) && cfg.allowed_tiers.length > 0) {
      return new Set(cfg.allowed_tiers.map((t) => String(t).toLowerCase()));
    }
    const legacy = String(cfg?.tier || "").toLowerCase();
    if (legacy === "cinematic" || legacy === "luxury") return new Set(["standard", "luxury"]);
    if (legacy === "ultra") return new Set(["standard", "luxury", "ultra"]);
    return new Set(["standard"]);
  })(videoConfig);

  const hasUltraBypassNow = bypassCode === ULTRA_BYPASS_CODE;
  const hasLuxuryBypassNow = bypassCode === LUXURY_BYPASS_CODE;

  if (requestedTier === "luxury" && !planAllowedTiers.has("luxury") && !hasLuxuryBypassNow && !hasUltraBypassNow) {
    return res.status(403).json({
      error: "باقتك الحالية لا تشمل المستوى الفاخر. يرجى الترقية أو إدخال كود تجربة صالح.",
      tier: "luxury",
      allowed_tiers: Array.from(planAllowedTiers),
    });
  }
  if (requestedTier === "ultra" && !planAllowedTiers.has("ultra") && !hasUltraBypassNow) {
    // (The earlier Ultra block also blocks without ULTRA_BYPASS_CODE; this is
    // belt-and-braces for plans that explicitly do not include Ultra.)
    return res.status(403).json({
      error: "باقتك الحالية لا تشمل المستوى السينمائي الخارق.",
      tier: "ultra",
      allowed_tiers: Array.from(planAllowedTiers),
    });
  }

  const planMaxDuration = userPlan?.max_video_duration || userPlan?.max_video_seconds || 60;

  if (!propertyType || !city) {
    return res.status(400).json({ error: "يرجى تحديد نوع العقار والمدينة" });
  }

  // Clean Image Paths (Sanitize URLs - remove trailing indices like :1)
  let cleanImages = [];
  if (Array.isArray(imagePaths)) {
    cleanImages = imagePaths.map(img => {
      // Handle both string and object formats
      let url = (typeof img === 'string') ? img : (img?.url || null);
      
      // 🔥 Fix: Remove trailing index (e.g., .jpg:1)
      if (url && typeof url === 'string') {
        return url.replace(/:\d+$/, '').trim();
      }
      return null;
    }).filter(Boolean);
  }

  // Track B (video_cleanup) does NOT need listing images at all — the
  // source is the uploaded seed video. Images are only needed for the
  // optional narration source. Skip the strict image-count checks
  // when cleanup mode is requested.
  const isCleanupMode = mode === "video_cleanup" && typeof seedVideoUrl === "string" && seedVideoUrl.trim().length > 0;
  if (!isCleanupMode) {
    if (cleanImages.length === 0) {
      return res.status(400).json({
        success: false,
        error: "يرجى رفع صور العقار أولاً لتوليد الفيديو"
      });
    }
    if (cleanImages.length < 2) {
      return res.status(400).json({
        success: false,
        error: "يحتاج الفيديو صورتين على الأقل. اختر 2–8 صور ثم ولد."
      });
    }
  }

  console.log("🚀 [AI Route] Video generation for user:", userId);
  console.log("[Video] Image count:", cleanImages.length);

  const operationId = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const opData = {
    userId,
    status: "processing",
    startedAt: Date.now(),
    // Multi-stage progress fields — kept here so the status endpoint
    // can surface them without re-deriving each poll. Orchestrators
    // bump these via the onProgress callback below.
    stage: null,        // e.g. "veo_polling", "concat", "upload"
    stageLabel: null,   // human-readable Arabic label
    stageIndex: 0,      // 1..N
    stageTotal: 0,      // N (depends on tier)
    progressPercent: 0, // 0..100
  };
  videoOperations.set(operationId, opData);

  res.json({
    success: true,
    operationId,
    message: "جاري إعداد الفيديو السينمائي...",
    status: "processing"
  });

  // Progress callback that orchestrators use to report stage changes.
  // Keeps coupling minimal — any orchestrator that ignores it still
  // works (frontend just sees stage:null and falls back to the
  // generic elapsed-seconds display).
  const onProgress = (info) => {
    const op = videoOperations.get(operationId);
    if (!op) return;
    videoOperations.set(operationId, {
      ...op,
      stage: info.stage ?? op.stage,
      stageLabel: info.stageLabel ?? op.stageLabel,
      stageIndex: info.stageIndex ?? op.stageIndex,
      stageTotal: info.stageTotal ?? op.stageTotal,
      progressPercent: typeof info.percent === "number" ? info.percent : op.progressPercent,
    });
  };

  const { generateListingSlideshow } = require('../services/videoService');
  const { generateHybridLuxuryVideo } = require('../services/luxuryVideoOrchestrator');
  const { generateUltraVeoVideo } = require('../services/ultraVideoOrchestrator');
  const openAiVoices = ['onyx', 'ash', 'fable', 'echo', 'alloy'];
  const isOpenAiVoice = openAiVoices.includes(String(videoVoice || '').toLowerCase());
  const listingData = {
    title: title || 'عقار مميز',
    city,
    district,
    price,
    userId,
    propertyType,
    purpose,
    description: description || `${propertyType} لل${purpose}`,
    videoQuality: videoQuality ?? 'full',
    voice: isOpenAiVoice ? (videoVoice || 'onyx') : 'onyx',
    elevenlabsVoiceId: !isOpenAiVoice && videoVoice && String(videoVoice).length > 10 ? String(videoVoice).trim() : undefined,
    targetDurationSec: targetDurationSec ?? 20,
    // Ultra only: when the customer uploaded a phone video via
    // /api/ai/user/upload-seed-video, that Cloudinary URL flows
    // here. The orchestrator extracts N frames from it (where N =
    // sceneCount from the duration tier) and uses them as image-to-
    // video seeds — turning amateur footage into a cinematic AI
    // production. Other tiers ignore.
    seedVideoUrl: requestedTier === "ultra" && typeof seedVideoUrl === "string" && seedVideoUrl.trim()
      ? seedVideoUrl.trim()
      : undefined,
    tier: requestedTier,
    // Wire progress: orchestrators that support multi-stage reporting
    // (currently Ultra; Luxury can follow) call this at each milestone.
    onProgress,
  };
  const targetId = listingId || `temp_${Date.now()}`;

  // Two-track dispatch (June 2026):
  //
  //   Track A — IMAGE-based 3 tiers (existing AI pipeline):
  //      Standard = FFmpeg slideshow + voice
  //      Luxury   = Veo hybrid
  //      Ultra    = Replicate multi-scene hybrid
  //
  //   Track B — VIDEO-cleanup mode (new, owner-driven):
  //      mode === "video_cleanup" routes here. Customer uploaded a
  //      phone video; we polish it with FFmpeg only — no AI cost
  //      (just ElevenLabs voice). Independent of tier; the tier
  //      picker is hidden on the frontend when this mode is active.
  //      Ignores `cleanImages` since the source is the seed video.
  //
  // File-name footgun (engine swap memory):
  //   generateUltraVeoVideo      -> Luxury tier (Veo hybrid)
  //   generateHybridLuxuryVideo  -> Ultra  tier (Replicate hybrid)
  let generationPromise;
  if (mode === "video_cleanup" && typeof seedVideoUrl === "string" && seedVideoUrl.trim()) {
    const { generateCleanupVideo } = require("../services/videoCleanupService");
    // listingData carries imageUrls (for narration source) + onProgress.
    // We pass cleanImages so the slideshow voice path can still fire.
    generationPromise = generateCleanupVideo(targetId, seedVideoUrl.trim(), {
      ...listingData,
      imageUrls: cleanImages,
    });
  } else if (requestedTier === "ultra") {
    generationPromise = generateHybridLuxuryVideo(targetId, cleanImages, listingData);
  } else if (requestedTier === "luxury") {
    generationPromise = generateUltraVeoVideo(targetId, cleanImages, listingData);
  } else {
    generationPromise = generateListingSlideshow(targetId, cleanImages, listingData);
  }

  generationPromise
    .then((result) => {
      const url = result?.url ?? (typeof result === 'string' ? result : null);
      if (url) {
        const op = videoOperations.get(operationId) || opData;
        const promoText = result?.promoText;
        let scriptText = null;
        if (promoText) {
          scriptText = promoText.voiceScript || promoText._voiceScript || null;
          if (!scriptText) {
            const parts = [promoText.headline, promoText.subheadline, promoText.topLine, promoText.callToAction].filter(Boolean);
            if (parts.length > 0) scriptText = parts.join(' — ');
          }
        }
        videoOperations.set(operationId, { ...op, status: "completed", videoUrl: url, promoText, scriptText });
        console.log("[Video] ✅ Background job success:", url);
      }
    })
    .catch((err) => {
      const op = videoOperations.get(operationId) || opData;
      let errMsg = err?.message || "فشل في توليد الفيديو";
      if (errMsg.includes("401") && !errMsg.includes("توكن")) {
        errMsg = "توكن Replicate غير صالح أو غير مضبوط. تحقق من REPLICATE_API_TOKEN في Environment على Render.";
      }
      if (errMsg.includes("402") && !errMsg.includes("رصيد")) {
        errMsg = "حساب خدمة الإنتاج السينمائي يحتاج رصيد أو تفعيل الدفع. أعد المحاولة لاحقاً.";
      }
      // Capture the structured diagnostic produced by the Ultra/Veo
      // orchestrator (or any orchestrator that follows the same
      // convention) so the operator can read the FULL Google response
      // — http_status, google_error_status, google_error_details — via
      // the status endpoint instead of having to dig through Render logs.
      const diagnostic = err?.diagnostic || null;
      videoOperations.set(operationId, {
        ...op,
        status: "error",
        error: errMsg,
        diagnostic,
        tier: requestedTier,
      });
      console.error(
        "[Video] ❌ Background job failed:",
        err?.message,
        diagnostic ? `\n[Video]    diagnostic: ${JSON.stringify(diagnostic)}` : ""
      );
    });
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

// 🎙️ جلب أصواتي فقط (My Voices) — أصواتك المحفوظة في ElevenLabs بدون الأصوات الافتراضية
router.get("/user/elevenlabs-voices", authMiddleware, asyncHandler(async (req, res) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return res.json({ voices: [], message: "ELEVENLABS_API_KEY غير مضبوط" });
  }
  return new Promise((resolve) => {
    // v2 مع voice_type=cloned = أصواتي فقط (مستنسخة/مخصصة). إن فشل نرجع v1 ونفلتر حسب category
    const pathV2 = "/v2/voices?voice_type=cloned&page_size=100";
    const options = {
      hostname: "api.elevenlabs.io",
      path: pathV2,
      method: "GET",
      headers: { "xi-api-key": apiKey.trim(), "Content-Type": "application/json" },
    };
    const reqHttp = https.request(options, (resp) => {
      let data = "";
      resp.on("data", (ch) => { data += ch; });
      resp.on("end", () => {
        if (resp.statusCode !== 200) {
          // إن v2 غير متاح أو يرجع خطأ، نجرب v1 ونفلتر بأصوات مخصصة فقط (category cloned أو generated)
          const pathV1 = "/v1/voices";
          const optV1 = {
            hostname: "api.elevenlabs.io",
            path: pathV1,
            method: "GET",
            headers: { "xi-api-key": apiKey.trim(), "Content-Type": "application/json" },
          };
          const reqV1 = https.request(optV1, (resp1) => {
            let data1 = "";
            resp1.on("data", (ch) => { data1 += ch; });
            resp1.on("end", () => {
              try {
                const json = JSON.parse(data1);
                const all = json.voices || [];
                const onlyMine = all.filter((v) => {
                  const cat = (v.category || v.labels || "").toString().toLowerCase();
                  return cat === "cloned" || cat === "generated" || cat === "instant" || (v.labels && Array.isArray(v.labels) && v.labels.some((l) => /cloned|generated|custom/i.test(l)));
                });
                const voices = (onlyMine.length ? onlyMine : all).map((v) => ({
                  id: v.voice_id || v.id,
                  name: v.name || "بدون اسم",
                  previewUrl: v.preview_url || (v.samples && v.samples[0] && (v.samples[0].url || v.samples[0].preview_url)) || null,
                })).filter((v) => v.id);
                res.json({ voices });
              } catch (_) {
                res.status(500).json({ voices: [], error: "خطأ في قراءة الأصوات" });
              }
              resolve();
            });
          });
          reqV1.on("error", () => {
            res.status(500).json({ voices: [], error: "تعذر جلب أصواتي من ElevenLabs" });
            resolve();
          });
          reqV1.setTimeout(12000, () => { reqV1.destroy(); });
          reqV1.end();
          return;
        }
        try {
          const json = JSON.parse(data);
          const voices = (json.voices || []).map((v) => ({
            id: v.voice_id || v.id,
            name: v.name || "بدون اسم",
            previewUrl: v.preview_url || (v.samples && v.samples[0] && (v.samples[0].url || v.samples[0].content_url || v.samples[0].preview_url)) || null,
          })).filter((v) => v.id);
          res.json({ voices });
        } catch (_) {
          res.status(500).json({ voices: [], error: "خطأ في قراءة الأصوات" });
        }
        resolve();
      });
    });
    reqHttp.on("error", (err) => {
      res.status(500).json({ voices: [], error: err.message || "خطأ اتصال بخدمة الأصوات" });
      resolve();
    });
    reqHttp.setTimeout(15000, () => {
      reqHttp.destroy();
      res.status(504).json({ voices: [], error: "انتهت مهلة الاتصال" });
      resolve();
    });
    reqHttp.end();
  });
}));

// 🔄 التحقق من حالة توليد الفيديو (Polling endpoint)
router.get("/user/video-status/:operationId", authMiddleware, asyncHandler(async (req, res) => {
  const { operationId } = req.params;
  const userId = req.user.id;

  const opData = videoOperations.get(operationId);

  if (!opData) {
    // 404 here usually means one of:
    //   - the operation was created BEFORE a Render redeploy, so the
    //     in-memory Map got wiped when Node restarted
    //   - the frontend kept polling after the final "completed" /
    //     "error" response (which deletes the op record)
    //   - the operationId is malformed or from a stale tab
    // Tell the user the actionable thing: try again, the server is
    // ready. Avoid the generic "not found" which leaves them stuck.
    return res.status(404).json({
      error: "انتهت صلاحية عملية التوليد أو تم إعادة تشغيل السيرفر. اضغط إعادة التوليد مرة أخرى — الإعدادات جاهزة.",
      status: "expired",
      hint: "retry_generation",
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
      scriptText: opData.scriptText,
      useImageToVideo: opData.useImageToVideo,
      message: opData.useImageToVideo 
        ? "تم تحويل صورتك إلى فيديو سينمائي بنجاح! 🎬" 
        : "تم توليد الفيديو الدعائي بنجاح!",
      duration: "8 ثواني"
    });
  }

  if (opData.status === "error" || opData.status === "timeout") {
    videoOperations.delete(operationId);
    // Surface the orchestrator's structured diagnostic alongside the
    // friendly error message. With this in place the operator sees
    // http_status + google_error_status + google_error_details in the
    // network response without needing Render logs.
    return res.json({
      status: "error",
      error: opData.error || "فشل توليد الفيديو",
      diagnostic: opData.diagnostic || null,
      tier: opData.tier || null,
    });
  }

  // Still processing — surface the multi-stage progress fields so the
  // frontend can render a real 4-step bar instead of one long opaque
  // spinner. All fields are optional; if an orchestrator never calls
  // onProgress they stay null and the frontend falls back to the
  // generic elapsed-seconds display.
  const elapsed = Math.floor((Date.now() - opData.startedAt) / 1000);
  res.json({
    status: "processing",
    message: opData.stageLabel
      ? `${opData.stageLabel} (${elapsed} ثانية)`
      : `جاري توليد الفيديو... (${elapsed} ثانية)`,
    elapsedSeconds: elapsed,
    stage: opData.stage || null,
    stageLabel: opData.stageLabel || null,
    stageIndex: opData.stageIndex || 0,
    stageTotal: opData.stageTotal || 0,
    progressPercent: opData.progressPercent || 0,
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
4. اختم كل ردّ بسؤال متابعة قصير جداً مثل: "هل تريد تعديل النتيجة أم الرجوع للقائمة الرئيسية؟" — لا تترك العميل بدون خطوة تالية

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

    // Load all AI center settings once so we can enforce them — banned
    // topics, working hours, daily limits, knowledge injection, and A/B.
    const centralCfg = await loadAiSettings();
    const aiEnabled = centralCfg.ai_support_enabled === 'true';
    const userMessage = messages[messages.length - 1]?.content || '';

    if (!aiEnabled) {
      return res.json({
        message: "شكراً لتواصلك! سيتم الرد عليك من فريق الدعم قريباً.",
        escalated: true,
        reason: "الدعم الآلي معطل حالياً"
      });
    }

    // Phase 1.1 — banned topics enforcement
    const bannedTopics = parseBannedTopics(centralCfg.ai_banned_topics);
    const matchedTerm = findBannedTopic(userMessage, bannedTopics);
    if (matchedTerm) {
      await logBlocked({ sessionId, userId, userMessage, reason: 'banned_topic', matchedTerm });
      return res.json({
        blocked: true,
        reason: 'banned_topic',
        message: 'هذا الموضوع خارج نطاق المساعد. سيسعدنا مساعدتك في موضوع آخر يخص العقارات أو الباقات.',
      });
    }

    // Phase 1.2 — working hours
    const afterHours = isAfterHours(centralCfg.ai_working_hours_start, centralCfg.ai_working_hours_end);
    if (afterHours) {
      const mode = centralCfg.ai_after_hours_mode || 'respond';
      if (mode === 'disable') {
        await logBlocked({ sessionId, userId, userMessage, reason: 'after_hours_disabled', matchedTerm: null });
        return res.json({
          blocked: true,
          reason: 'after_hours',
          message: `خدمة الدعم الآلي متاحة فقط بين ${centralCfg.ai_working_hours_start} و ${centralCfg.ai_working_hours_end}. تواصل معنا خلال هذه الساعات أو اترك رسالة وسنرد لاحقاً.`,
        });
      }
      if (mode === 'queue') {
        await logBlocked({ sessionId, userId, userMessage, reason: 'after_hours_queued', matchedTerm: null });
        // We dont actually queue/send notifications here; create an
        // escalation row tagged as after_hours so the next available
        // human picks it up from the escalations board.
        await createEscalation({
          sessionId,
          userId,
          userMessage,
          reason: `تم خارج ساعات العمل (${centralCfg.ai_working_hours_start} → ${centralCfg.ai_working_hours_end})`,
          sentiment: null,
        });
        return res.json({
          queued: true,
          reason: 'after_hours',
          message: 'استلمنا رسالتك وسيتم الرد عليك خلال ساعات العمل. شكراً لصبرك.',
        });
      }
      // mode === 'respond' → fall through and answer normally.
    }

    // Phase 1.3 — per-user/session daily limit (admins exempt — we look
    // them up by role so an authenticated admin doesnt get blocked).
    const limit = parseInt(centralCfg.ai_per_user_daily_limit, 10);
    if (Number.isFinite(limit) && limit > 0) {
      let isAdminUser = false;
      if (userId) {
        try {
          const ur = await db.query('SELECT role FROM users WHERE id = $1', [userId]);
          const role = ur.rows[0]?.role || '';
          isAdminUser = ['super_admin', 'admin', 'admin_manager', 'finance_admin', 'support_admin', 'content_admin'].includes(role);
        } catch { /* fall through */ }
      }
      if (!isAdminUser) {
        const used = await countTodaysChats({ sessionId, userId });
        if (used >= limit) {
          await logBlocked({ sessionId, userId, userMessage, reason: 'daily_limit', matchedTerm: String(limit) });
          return res.json({
            blocked: true,
            reason: 'daily_limit',
            message: `لقد استخدمت الحد اليومي المسموح (${limit} محادثات). يمكنك المحاولة غداً أو التواصل مع الدعم البشري.`,
          });
        }
      }
    }

    // Use the authoritative resolver — bypasses plan tier for admin
    // roles (super_admin et al), reads role_level too so any future
    // 100-level role is also exempt.
    const aiLevelInfo = await resolveAiLevelForUser(userId);
    const aiLevel = aiLevelInfo.level;
    const userName = aiLevelInfo.userName;

    // Diagnostic logging (gated by env to avoid log spam in prod —
    // flip AI_VERBOSE=1 on Render to see).
    if (process.env.AI_VERBOSE === '1' || process.env.AI_VERBOSE === 'true') {
      console.log('[customer-chat resolve]', JSON.stringify({
        userId: userId || null,
        sessionId: sessionId || null,
        role: aiLevelInfo.role,
        role_level: aiLevelInfo.role_level,
        bypass: aiLevelInfo.bypass,
        plan: aiLevelInfo.planName,
        ai_level: aiLevel,
      }));
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

    // centralCfg already loaded above for enforcement; reuse it.
    let systemPrompt = getCustomerSupportPrompt(plansInfo, aiLevel, userName);
    let variantId = null;
    if (centralCfg.ai_ab_testing_enabled === 'true') {
      const variant = await pickPromptVariant();
      if (variant) {
        systemPrompt = variant.prompt_text;
        variantId = variant.id;
      }
    }

    // Phase 2 — inject Knowledge Base context. Customer messages get
    // searched against the KB and the top matches are appended to the
    // system prompt so the bot answers from the operators source of
    // truth instead of stale memory.
    if (centralCfg.ai_knowledge_enabled !== 'false') {
      const kbArticles = await retrieveKnowledge(userMessage, 3);
      const kbContext = knowledgeAsContext(kbArticles);
      if (kbContext) systemPrompt = systemPrompt + kbContext;
    }

    const chatModel = ALLOWED_MODELS.includes(centralCfg.ai_model) ? centralCfg.ai_model : 'gpt-4o-mini';

    // Adjust model and tokens based on AI level
    const maxTokens = aiLevel >= 2 ? 800 : (aiLevel === 1 ? 500 : 300);

    // ─── OpenAI call ─────────────────────────────────────────────────
    // ONLY the OpenAI request is wrapped by handleOpenAIError. Anything
    // after must never bubble a 500 — the customer already has a reply
    // ready and deserves to see it, plus the escalation flag if any.
    let response;
    try {
      response = await openai.chat.completions.create({
        model: chatModel,
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
    } catch (error) {
      return handleOpenAIError(error, res);
    }

    let assistantMessage = response.choices[0]?.message?.content || "عذراً، لم أتمكن من الرد.";
    const usage = response.usage || {};

    let escalated = false;
    let escalateReason = "";

    if (assistantMessage.includes("[ESCALATE]")) {
      escalated = true;
      const parts = assistantMessage.split("[ESCALATE]");
      escalateReason = parts[1]?.trim() || "يحتاج تدخل بشري";
      assistantMessage = "شكراً لتواصلك! سأقوم بتحويل استفسارك لفريق الدعم المختص للمساعدة بشكل أفضل. سيتواصل معك أحد ممثلي الدعم قريباً.";
      console.log('[escalation] flow entered via [ESCALATE] tag', JSON.stringify({ sessionId: sessionId || null, userId: userId || null }));
    }

    // Sentiment analysis — isolated so an OpenAI hiccup here never
    // blocks the customer's reply or the escalation row.
    let sentiment = null;
    if (centralCfg.ai_sentiment_enabled === 'true' && userMessage) {
      try {
        sentiment = await analyzeSentiment(userMessage);
        if (
          sentiment?.label === 'very_negative' &&
          centralCfg.ai_auto_escalate_negative === 'true' &&
          !escalated
        ) {
          escalated = true;
          escalateReason = `تصعيد تلقائي — مزاج العميل سلبي جداً (score=${sentiment.score})`;
          console.log('[escalation] flow entered via auto-sentiment', JSON.stringify({ sessionId: sessionId || null, score: sentiment.score }));
        }
      } catch (sentErr) {
        console.warn('[customer-chat sentiment] failed:', sentErr.message);
      }
    }

    // Chat-log INSERT — wrapped so a schema drift or constraint hit
    // doesnt nuke the customers reply. We still try to create the
    // escalation row even if the log row failed (chatLogId stays null).
    let chatLogId = null;
    if (sessionId) {
      try {
        const ins = await db.query(
          `INSERT INTO ai_chat_logs
             (session_id, user_message, ai_response, escalated, escalate_reason,
              source, model, prompt_tokens, completion_tokens, cost_usd,
              sentiment, sentiment_score, variant_id, created_at)
           VALUES ($1, $2, $3, $4, $5, 'customer', $6, $7, $8, $9, $10, $11, $12, NOW())
           RETURNING id`,
          [
            String(sessionId).slice(0, 100),
            userMessage,
            assistantMessage,
            escalated,
            escalateReason,
            chatModel,
            usage.prompt_tokens || 0,
            usage.completion_tokens || 0,
            computeCostUsd(chatModel, usage.prompt_tokens || 0, usage.completion_tokens || 0),
            sentiment?.label || null,
            sentiment?.score ?? null,
            variantId,
          ]
        );
        chatLogId = ins.rows[0]?.id || null;
      } catch (logErr) {
        console.warn('[customer-chat ai_chat_logs insert] failed:', logErr.message);
      }
    }

    // Phase 4 — feed the escalation queue. createEscalation already
    // swallows its own errors and returns null on failure, so this can
    // never throw to us. We still log the outcome so the operator can
    // trace bot-reply → escalation row in one grep.
    let escalationId = null;
    if (escalated) {
      console.log('[escalation] creating row', JSON.stringify({
        sessionId: sessionId || null,
        userId: userId || null,
        chatLogId,
        reason: (escalateReason || '').slice(0, 120),
      }));
      escalationId = await createEscalation({
        chatLogId,
        sessionId,
        userId,
        userMessage,
        reason: escalateReason,
        sentiment: sentiment?.label || null,
      });
      console.log('[escalation] row created', JSON.stringify({ escalationId, chatLogId }));
    }

    // Phase: Lead Intelligence — already async/fire-and-forget.
    if (centralCfg.ai_lead_detection_enabled !== 'false' && userMessage && chatLogId) {
      classifyLeadSignal(userMessage).then((signal) => {
        if (signal) {
          recordLeadEvent({ sessionId, userId, chatLogId, signal, rawMessage: userMessage });
        }
      }).catch((e) => console.warn('[lead detect]', e.message));
    }

    if (escalated) {
      console.log('[escalation] returning to frontend', JSON.stringify({ escalationId, escalated: true }));
    }

    return res.json({
      message: assistantMessage,
      escalated,
      reason: escalateReason,
      sentiment: sentiment?.label || null,
      escalation_id: escalationId,
    });
}));

router.post("/escalate", authMiddleware, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { sessionId, lastMessage, reason } = req.body;

  console.log('[escalate] entered', JSON.stringify({
    userId,
    sessionId: sessionId || null,
    reason: (reason || '').slice(0, 120),
  }));

  // جلب اسم المستخدم
  let userName = "مستخدم";
  try {
    const userResult = await db.query("SELECT name FROM users WHERE id = $1", [userId]);
    if (userResult.rows[0]?.name) {
      userName = userResult.rows[0].name;
    }
  } catch (e) {
    console.warn('[escalate] user name lookup failed:', e.message);
  }

  const ticketNumber = `TKT-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
  const reasonText = reason || 'يحتاج تدخل بشري';
  const lastMsgText = (lastMessage || '').toString();

  // ─── Ticket INSERT — the one step that MUST succeed. If this fails
  // the customer truly has no ticket and we must tell them. We try
  // once with source/source_ref (new schema) and fall back to the
  // narrow form for environments that havent run the migration yet.
  let ticket = null;
  try {
    const result = await db.query(
      `INSERT INTO support_tickets (user_id, ticket_number, category, priority, subject, description, status, source, source_ref)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        userId,
        ticketNumber,
        'ai_escalation',
        'medium',
        'تصعيد من الدعم الآلي',
        `سبب التصعيد: ${reasonText}\n\nآخر رسالة: ${lastMsgText}`,
        'new',
        'ai_chatbot',
        sessionId || null,
      ]
    );
    ticket = result.rows[0];
  } catch (insertErr) {
    console.warn('[escalate] support_tickets full INSERT failed, retrying narrow:', insertErr.message);
    try {
      const result = await db.query(
        `INSERT INTO support_tickets (user_id, ticket_number, category, priority, subject, description, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          userId,
          ticketNumber,
          'ai_escalation',
          'medium',
          'تصعيد من الدعم الآلي',
          `سبب التصعيد: ${reasonText}\n\nآخر رسالة: ${lastMsgText}`,
          'new',
        ]
      );
      ticket = result.rows[0];
    } catch (fallbackErr) {
      console.error('[escalate] support_tickets INSERT failed (both shapes):', fallbackErr.message);
      return res.status(500).json({
        error: 'تعذّر إنشاء تذكرة الدعم حالياً. حاول مرة أخرى أو راسلنا مباشرة.',
        errorEn: 'Could not create support ticket',
      });
    }
  }

  console.log('[escalate] ticket row created', JSON.stringify({
    ticketId: ticket.id,
    ticketNumber,
    userId,
  }));

  // ─── Everything below is best-effort: notifications, admin pings,
  // the first reply transcript. None of these failing should ever
  // hide success from the customer.

  try {
    await db.query(
      `INSERT INTO notifications (user_id, title, body, type, link, created_at)
       VALUES ($1, $2, $3, 'support_ticket_created', $4, NOW())`,
      [
        userId,
        "تم فتح طلب دعم",
        `تم تسجيل تذكرة ${ticketNumber} بعد التصعيد من الدعم الآلي. يمكنك متابعة رد فريق الدعم من صفحة طلبات الدعم.`,
        `/account/my-tickets?open=${ticket.id}`,
      ]
    );
    console.log(`[escalate] customer inbox notified ticket=${ticket.id}`);
  } catch (e) {
    console.error("[escalate] customer notification failed:", e.message);
  }

  try {
    await db.query(
      `INSERT INTO support_ticket_replies (ticket_id, sender_id, sender_type, message)
       VALUES ($1, $2, $3, $4)`,
      [
        ticket.id,
        userId,
        'user',
        `تم التصعيد من الدعم الآلي\n\nسبب التصعيد: ${reasonText}\n\nآخر رسالة من العميل:\n${lastMsgText}`
      ]
    );
    console.log(`[escalate] transcript first-reply inserted ticket=${ticket.id}`);
  } catch (e) {
    console.error('[escalate] support_ticket_replies INSERT failed:', e.message);
  }

  // Admin pings (in-app notifications). Each admin in its own try so
  // one bad row never poisons the others.
  try {
    const supportAdmins = await db.query(
      "SELECT id FROM users WHERE role IN ('super_admin', 'admin', 'support_admin')"
    );
    let notifiedCount = 0;
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
        notifiedCount += 1;
      } catch (notifErr) {
        console.error(`[escalate] admin notify failed admin=${admin.id}:`, notifErr.message);
      }
    }
    console.log(`[escalate] admin pings sent count=${notifiedCount} of=${supportAdmins.rows.length}`);
  } catch (notifErr) {
    console.error('[escalate] admin lookup failed:', notifErr.message);
  }

  // Email + WhatsApp fan-out for this manual escalation as well —
  // reuse the AI-center notifyEscalation by synthesising an escalation
  // row shape it understands. Wrapped in try so a missing helper or
  // bad credentials never break the customer success path.
  try {
    const cfg = await loadAiSettings();
    if (cfg.ai_escalation_notify_email === 'true' || cfg.ai_escalation_notify_whatsapp === 'true') {
      console.log(`[escalate notify ticket=${ticket.id}] started`, JSON.stringify({
        email: cfg.ai_escalation_notify_email === 'true',
        whatsapp: cfg.ai_escalation_notify_whatsapp === 'true',
      }));
      notifyEscalation(
        {
          id: ticketNumber,
          last_user_message: lastMsgText,
          reason: reasonText,
          sentiment: null,
        },
        cfg
      ).catch((e) => console.error(`[escalate notify ticket=${ticket.id}] failed:`, e.message));
    }
  } catch (e) {
    console.error(`[escalate notify ticket=${ticket.id}] settings load failed:`, e.message);
  }

  console.log(`🚨 تصعيد جديد من الدعم الآلي: ${ticketNumber} من ${userName}`);
  console.log('[escalate] returning to frontend', JSON.stringify({
    ticketId: ticket.id,
    ticketNumber,
    ok: true,
  }));

  return res.json({ ok: true, ticket, ticketNumber });
}));

router.get("/support-settings", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const settings = await loadAiSettings();
  res.json({
    ...settings,
    _meta: {
      allowed_models: ALLOWED_MODELS,
      defaults: SETTINGS_DEFAULTS,
      pricing_per_1k_tokens: MODEL_PRICING,
    },
  });
}));

router.post("/support-settings", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  // Accept the full configurable set. Values are stored as text in
  // app_settings so booleans become 'true'/'false' strings — the
  // loadAiSettings consumer parses on read.
  const body = req.body || {};
  const updates = {};
  if (body.ai_support_enabled !== undefined) {
    updates.ai_support_enabled = body.ai_support_enabled ? 'true' : 'false';
  }
  if (typeof body.ai_system_prompt === 'string')   updates.ai_system_prompt = body.ai_system_prompt.slice(0, 8000);
  if (typeof body.ai_model === 'string' && ALLOWED_MODELS.includes(body.ai_model)) updates.ai_model = body.ai_model;
  if (body.ai_temperature !== undefined) {
    const t = parseFloat(body.ai_temperature);
    if (!Number.isNaN(t) && t >= 0 && t <= 2) updates.ai_temperature = String(t);
  }
  if (body.ai_max_tokens !== undefined) {
    const n = parseInt(body.ai_max_tokens, 10);
    if (Number.isFinite(n) && n >= 50 && n <= 4000) updates.ai_max_tokens = String(n);
  }
  if (typeof body.ai_banned_topics === 'string')  updates.ai_banned_topics = body.ai_banned_topics.slice(0, 4000);
  if (typeof body.ai_working_hours_start === 'string') updates.ai_working_hours_start = body.ai_working_hours_start.slice(0, 5);
  if (typeof body.ai_working_hours_end === 'string')   updates.ai_working_hours_end = body.ai_working_hours_end.slice(0, 5);
  if (body.ai_per_user_daily_limit !== undefined) {
    const n = parseInt(body.ai_per_user_daily_limit, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 1000) updates.ai_per_user_daily_limit = String(n);
  }
  if (body.ai_sentiment_enabled !== undefined) {
    updates.ai_sentiment_enabled = body.ai_sentiment_enabled ? 'true' : 'false';
  }
  if (body.ai_ab_testing_enabled !== undefined) {
    updates.ai_ab_testing_enabled = body.ai_ab_testing_enabled ? 'true' : 'false';
  }
  if (body.ai_auto_escalate_negative !== undefined) {
    updates.ai_auto_escalate_negative = body.ai_auto_escalate_negative ? 'true' : 'false';
  }
  if (body.ai_knowledge_enabled !== undefined) {
    updates.ai_knowledge_enabled = body.ai_knowledge_enabled ? 'true' : 'false';
  }
  if (typeof body.ai_after_hours_mode === 'string' && ['respond', 'queue', 'disable'].includes(body.ai_after_hours_mode)) {
    updates.ai_after_hours_mode = body.ai_after_hours_mode;
  }
  if (body.ai_lead_detection_enabled !== undefined) {
    updates.ai_lead_detection_enabled = body.ai_lead_detection_enabled ? 'true' : 'false';
  }
  if (body.ai_escalation_notify_email !== undefined) {
    updates.ai_escalation_notify_email = body.ai_escalation_notify_email ? 'true' : 'false';
  }
  if (body.ai_escalation_notify_whatsapp !== undefined) {
    updates.ai_escalation_notify_whatsapp = body.ai_escalation_notify_whatsapp ? 'true' : 'false';
  }
  if (typeof body.ai_escalation_email_to === 'string')    updates.ai_escalation_email_to    = body.ai_escalation_email_to.slice(0, 500);
  if (typeof body.ai_escalation_whatsapp_to === 'string') updates.ai_escalation_whatsapp_to = body.ai_escalation_whatsapp_to.slice(0, 500);

  // Snapshot the current values for the audit log diff.
  const before = await loadAiSettings();

  for (const [key, value] of Object.entries(updates)) {
    await db.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, value]
    );
  }

  const fresh = await loadAiSettings();

  // Audit log per changed key. Skips no-op writes.
  for (const key of Object.keys(updates)) {
    if (before[key] !== updates[key]) {
      await auditAi({
        action: 'settings_change',
        targetKind: 'app_settings',
        targetId: key,
        oldValue: { [key]: before[key] },
        newValue: { [key]: updates[key] },
        actor: req.user,
      });
    }
  }

  res.json({ ok: true, message: "تم حفظ الإعدادات", settings: fresh, saved_keys: Object.keys(updates) });
}));

// ─── AI Command Center — overview stats ────────────────────────────────────
router.get("/center/stats", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const safe = async (sql, params = []) => {
    try {
      const r = await db.query(sql, params);
      return r.rows;
    } catch (e) {
      return [];
    }
  };

  const [today, week, month, byHour, escalated, topUsers] = await Promise.all([
    safe(`SELECT
            COUNT(*) FILTER (WHERE source = 'customer')::int AS customer_chats,
            COUNT(*) FILTER (WHERE source = 'admin')::int    AS admin_chats,
            COUNT(*) FILTER (WHERE escalated)::int           AS escalations,
            COALESCE(SUM(prompt_tokens), 0)::int             AS prompt_tokens,
            COALESCE(SUM(completion_tokens), 0)::int         AS completion_tokens,
            COALESCE(SUM(cost_usd), 0)::numeric              AS cost_usd
          FROM ai_chat_logs WHERE created_at >= NOW() - INTERVAL '24 hours'`),
    safe(`SELECT
            COUNT(*)::int                                    AS total_chats,
            COUNT(*) FILTER (WHERE escalated)::int           AS escalations,
            COALESCE(SUM(cost_usd), 0)::numeric              AS cost_usd
          FROM ai_chat_logs WHERE created_at >= NOW() - INTERVAL '7 days'`),
    safe(`SELECT
            COUNT(*)::int                                    AS total_chats,
            COUNT(*) FILTER (WHERE escalated)::int           AS escalations,
            COALESCE(SUM(cost_usd), 0)::numeric              AS cost_usd
          FROM ai_chat_logs WHERE created_at >= NOW() - INTERVAL '30 days'`),
    safe(`SELECT date_trunc('hour', created_at) AS hour, COUNT(*)::int AS n
          FROM ai_chat_logs WHERE created_at >= NOW() - INTERVAL '24 hours'
          GROUP BY 1 ORDER BY 1`),
    safe(`SELECT id, user_message, escalate_reason, created_at
          FROM ai_chat_logs WHERE escalated = true
          ORDER BY created_at DESC LIMIT 5`),
    safe(`SELECT session_id, COUNT(*)::int AS chats
          FROM ai_chat_logs WHERE created_at >= NOW() - INTERVAL '7 days' AND session_id IS NOT NULL
          GROUP BY session_id ORDER BY chats DESC LIMIT 5`),
  ]);

  res.json({
    today: today[0] || { customer_chats: 0, admin_chats: 0, escalations: 0, prompt_tokens: 0, completion_tokens: 0, cost_usd: 0 },
    week:  week[0]  || { total_chats: 0, escalations: 0, cost_usd: 0 },
    month: month[0] || { total_chats: 0, escalations: 0, cost_usd: 0 },
    by_hour_24h: byHour,
    recent_escalations: escalated,
    top_sessions_7d: topUsers,
  });
}));

// ─── AI Command Center — A/B prompt variants CRUD ─────────────────────────
router.get("/center/prompt-variants", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const r = await db.query(
    `SELECT v.id, v.label, v.prompt_text, v.weight, v.is_active, v.created_at, v.updated_at,
            COUNT(l.id)::int AS chats,
            COUNT(l.id) FILTER (WHERE l.escalated)::int AS escalations,
            COUNT(l.id) FILTER (WHERE l.sentiment IN ('negative','very_negative'))::int AS negative,
            COUNT(l.id) FILTER (WHERE l.sentiment IN ('positive','very_positive'))::int AS positive
       FROM ai_prompt_variants v
       LEFT JOIN ai_chat_logs l ON l.variant_id = v.id AND l.created_at >= NOW() - INTERVAL '30 days'
       GROUP BY v.id
       ORDER BY v.created_at DESC`
  );
  res.json({ variants: r.rows });
}));

router.post("/center/prompt-variants", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { label, prompt_text, weight, is_active } = req.body || {};
  if (!label || !prompt_text) return res.status(400).json({ error: "label و prompt_text مطلوبان" });
  const w = Math.max(0, Math.min(100, parseInt(weight, 10) || 1));
  const a = is_active !== false;
  const r = await db.query(
    `INSERT INTO ai_prompt_variants (label, prompt_text, weight, is_active)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [label.slice(0, 100), prompt_text.slice(0, 8000), w, a]
  );
  await auditAi({ action: 'prompt_variant_create', targetKind: 'prompt_variant', targetId: r.rows[0].id, newValue: { label: r.rows[0].label }, actor: req.user });
  res.json({ ok: true, variant: r.rows[0] });
}));

router.patch("/center/prompt-variants/:id", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const fields = [];
  const values = [];
  const b = req.body || {};
  if (typeof b.label === 'string')       { fields.push(`label = $${fields.length + 1}`);       values.push(b.label.slice(0, 100)); }
  if (typeof b.prompt_text === 'string') { fields.push(`prompt_text = $${fields.length + 1}`); values.push(b.prompt_text.slice(0, 8000)); }
  if (b.weight !== undefined)            { fields.push(`weight = $${fields.length + 1}`);      values.push(Math.max(0, Math.min(100, parseInt(b.weight, 10) || 1))); }
  if (b.is_active !== undefined)         { fields.push(`is_active = $${fields.length + 1}`);   values.push(!!b.is_active); }
  if (fields.length === 0) return res.status(400).json({ error: "لا حقول للتحديث" });
  fields.push(`updated_at = NOW()`);
  values.push(id);
  const r = await db.query(
    `UPDATE ai_prompt_variants SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  if (r.rows.length === 0) return res.status(404).json({ error: "غير موجود" });
  await auditAi({ action: 'prompt_variant_update', targetKind: 'prompt_variant', targetId: id, newValue: { label: r.rows[0].label, is_active: r.rows[0].is_active }, actor: req.user });
  res.json({ ok: true, variant: r.rows[0] });
}));

router.delete("/center/prompt-variants/:id", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  await db.query(`DELETE FROM ai_prompt_variants WHERE id = $1`, [id]);
  await auditAi({ action: 'prompt_variant_delete', targetKind: 'prompt_variant', targetId: id, actor: req.user });
  res.json({ ok: true });
}));

// ─── Knowledge Base CRUD ────────────────────────────────────────────────
router.get("/center/knowledge/categories", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const r = await db.query(
    `SELECT c.id, c.slug, c.name, c.sort_order, c.is_active,
            COUNT(a.id) FILTER (WHERE a.is_active)::int AS active_articles,
            COUNT(a.id)::int AS total_articles
       FROM ai_knowledge_categories c
       LEFT JOIN ai_knowledge_articles a ON a.category_id = c.id
       GROUP BY c.id
       ORDER BY c.sort_order, c.id`
  );
  res.json({ categories: r.rows });
}));

router.post("/center/knowledge/categories", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { slug, name, sort_order, is_active } = req.body || {};
  if (!slug || !name) return res.status(400).json({ error: "slug و name مطلوبان" });
  const r = await db.query(
    `INSERT INTO ai_knowledge_categories (slug, name, sort_order, is_active)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order, is_active = EXCLUDED.is_active, updated_at = NOW()
     RETURNING *`,
    [String(slug).slice(0, 60), String(name).slice(0, 120), parseInt(sort_order, 10) || 0, is_active !== false]
  );
  await auditAi({ action: 'kb_category_save', targetKind: 'kb_category', targetId: r.rows[0].id, newValue: r.rows[0], actor: req.user });
  res.json({ ok: true, category: r.rows[0] });
}));

router.patch("/center/knowledge/categories/:id", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const fields = [];
  const values = [];
  const b = req.body || {};
  if (typeof b.name === 'string') { fields.push(`name = $${fields.length + 1}`); values.push(b.name.slice(0, 120)); }
  if (b.sort_order !== undefined) { fields.push(`sort_order = $${fields.length + 1}`); values.push(parseInt(b.sort_order, 10) || 0); }
  if (b.is_active !== undefined)  { fields.push(`is_active = $${fields.length + 1}`); values.push(!!b.is_active); }
  if (fields.length === 0) return res.status(400).json({ error: "لا حقول للتحديث" });
  fields.push(`updated_at = NOW()`);
  values.push(id);
  const r = await db.query(
    `UPDATE ai_knowledge_categories SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  if (r.rows.length === 0) return res.status(404).json({ error: "غير موجود" });
  await auditAi({ action: 'kb_category_update', targetKind: 'kb_category', targetId: id, newValue: r.rows[0], actor: req.user });
  res.json({ ok: true, category: r.rows[0] });
}));

router.delete("/center/knowledge/categories/:id", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  await db.query(`DELETE FROM ai_knowledge_categories WHERE id = $1`, [id]);
  await auditAi({ action: 'kb_category_delete', targetKind: 'kb_category', targetId: id, actor: req.user });
  res.json({ ok: true });
}));

router.get("/center/knowledge/articles", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { category_id, q, active } = req.query;
  const conds = [];
  const params = [];
  if (category_id) { params.push(category_id); conds.push(`a.category_id = $${params.length}`); }
  if (q) { params.push(`%${String(q).trim()}%`); conds.push(`(a.title ILIKE $${params.length} OR a.content ILIKE $${params.length} OR a.keywords ILIKE $${params.length})`); }
  if (active === '1' || active === 'true') conds.push(`a.is_active = true`);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const r = await db.query(
    `SELECT a.*, c.name AS category_name, c.slug AS category_slug
       FROM ai_knowledge_articles a
       LEFT JOIN ai_knowledge_categories c ON c.id = a.category_id
       ${where}
       ORDER BY a.priority DESC, a.updated_at DESC
       LIMIT 200`,
    params
  );
  res.json({ articles: r.rows });
}));

router.post("/center/knowledge/articles", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { category_id, title, content, keywords, is_active, priority } = req.body || {};
  if (!title || !content) return res.status(400).json({ error: "title و content مطلوبان" });
  const r = await db.query(
    `INSERT INTO ai_knowledge_articles (category_id, title, content, keywords, is_active, priority, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      category_id ? parseInt(category_id, 10) : null,
      String(title).slice(0, 200),
      String(content).slice(0, 10000),
      keywords ? String(keywords).slice(0, 1000) : null,
      is_active !== false,
      parseInt(priority, 10) || 0,
      req.user?.id || null,
    ]
  );
  await auditAi({ action: 'kb_article_create', targetKind: 'kb_article', targetId: r.rows[0].id, newValue: { title: r.rows[0].title }, actor: req.user });
  // Fire-and-forget embedding refresh so vector search picks it up.
  reindexArticle(r.rows[0].id).catch(() => null);
  res.json({ ok: true, article: r.rows[0] });
}));

router.patch("/center/knowledge/articles/:id", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const before = await db.query(`SELECT * FROM ai_knowledge_articles WHERE id = $1`, [id]);
  if (before.rows.length === 0) return res.status(404).json({ error: "غير موجود" });
  const b = req.body || {};
  const fields = [];
  const values = [];
  if (b.category_id !== undefined) { fields.push(`category_id = $${fields.length + 1}`); values.push(b.category_id ? parseInt(b.category_id, 10) : null); }
  if (typeof b.title === 'string')   { fields.push(`title = $${fields.length + 1}`); values.push(b.title.slice(0, 200)); }
  if (typeof b.content === 'string') { fields.push(`content = $${fields.length + 1}`); values.push(b.content.slice(0, 10000)); }
  if (b.keywords !== undefined)      { fields.push(`keywords = $${fields.length + 1}`); values.push(b.keywords ? String(b.keywords).slice(0, 1000) : null); }
  if (b.is_active !== undefined)     { fields.push(`is_active = $${fields.length + 1}`); values.push(!!b.is_active); }
  if (b.priority !== undefined)      { fields.push(`priority = $${fields.length + 1}`); values.push(parseInt(b.priority, 10) || 0); }
  if (req.user?.id)                  { fields.push(`updated_by = $${fields.length + 1}`); values.push(req.user.id); }
  if (fields.length === 0) return res.status(400).json({ error: "لا حقول للتحديث" });
  fields.push(`updated_at = NOW()`);
  values.push(id);
  const r = await db.query(
    `UPDATE ai_knowledge_articles SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  await auditAi({
    action: 'kb_article_update',
    targetKind: 'kb_article',
    targetId: id,
    oldValue: { title: before.rows[0].title, is_active: before.rows[0].is_active },
    newValue: { title: r.rows[0].title, is_active: r.rows[0].is_active },
    actor: req.user,
  });
  // Refresh embedding if title/content/keywords changed.
  if (b.title !== undefined || b.content !== undefined || b.keywords !== undefined) {
    reindexArticle(r.rows[0].id).catch(() => null);
  }
  res.json({ ok: true, article: r.rows[0] });
}));

router.delete("/center/knowledge/articles/:id", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  await db.query(`DELETE FROM ai_knowledge_articles WHERE id = $1`, [id]);
  await auditAi({ action: 'kb_article_delete', targetKind: 'kb_article', targetId: id, actor: req.user });
  res.json({ ok: true });
}));

// ─── Escalations queue ──────────────────────────────────────────────────
router.get("/center/escalations", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { status, limit } = req.query;
  const conds = [];
  const params = [];
  if (status && ['open', 'assigned', 'resolved'].includes(String(status))) {
    params.push(status);
    conds.push(`e.status = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const limitN = Math.min(500, Math.max(1, parseInt(String(limit || 100), 10) || 100));
  const r = await db.query(
    `SELECT e.*, u.name AS assigned_to_name
       FROM ai_escalations e
       LEFT JOIN users u ON u.id = e.assigned_to
       ${where}
       ORDER BY e.created_at DESC
       LIMIT ${limitN}`,
    params
  );
  res.json({ escalations: r.rows });
}));

router.patch("/center/escalations/:id/assign", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { assigned_to } = req.body || {};
  const target = assigned_to || req.user?.id;
  if (!target) return res.status(400).json({ error: "assigned_to مطلوب" });
  const r = await db.query(
    `UPDATE ai_escalations
       SET assigned_to = $1, status = 'assigned', updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [target, id]
  );
  if (r.rows.length === 0) return res.status(404).json({ error: "غير موجود" });
  await auditAi({ action: 'escalation_assign', targetKind: 'escalation', targetId: id, newValue: { assigned_to: target }, actor: req.user });
  res.json({ ok: true, escalation: r.rows[0] });
}));

router.patch("/center/escalations/:id/resolve", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { resolution_note } = req.body || {};
  const r = await db.query(
    `UPDATE ai_escalations
       SET status = 'resolved', resolved_at = NOW(), resolution_note = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [resolution_note ? String(resolution_note).slice(0, 1000) : null, id]
  );
  if (r.rows.length === 0) return res.status(404).json({ error: "غير موجود" });
  await auditAi({ action: 'escalation_resolve', targetKind: 'escalation', targetId: id, newValue: { resolution_note }, actor: req.user });
  res.json({ ok: true, escalation: r.rows[0] });
}));

// ─── Audit log feed ─────────────────────────────────────────────────────
router.get("/center/audit", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { action, limit } = req.query;
  const conds = [];
  const params = [];
  if (action) { params.push(action); conds.push(`action = $${params.length}`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const limitN = Math.min(500, Math.max(1, parseInt(String(limit || 100), 10) || 100));
  const r = await db.query(
    `SELECT id, action, target_kind, target_id, old_value, new_value, actor_id, actor_name, actor_role, created_at
       FROM ai_audit_log
       ${where}
       ORDER BY created_at DESC
       LIMIT ${limitN}`,
    params
  );
  res.json({ entries: r.rows });
}));

// ─── Authoritative AI level resolver ────────────────────────────────────
// Single source of truth used by both /api/user/ai-level (chatbot badge)
// and /customer-chat (actual model/token sizing). Admin roles short-
// circuit straight to the top tier — they own the platform and should
// never see "قم بالترقية" or get throttled by plan tiers.
const ADMIN_BYPASS_ROLES = new Set([
  'super_admin',
  'admin',
  'admin_manager',
  'finance_admin',
  'support_admin',
  'content_admin',
  'hr_admin',
  'quality_monitor',
]);

async function resolveAiLevelForUser(userId) {
  // Default fallback for anonymous/unknown
  const fallback = { level: 0, levelName: 'غير مشترك', planName: '', userName: '', role: null, role_level: 0, bypass: false };
  if (!userId) return fallback;

  // Step 1: pull role + level. role_level >= 100 also bypasses
  // (covers any future role configured at owner tier).
  let role = null;
  let role_level = 0;
  let userName = '';
  try {
    const ur = await db.query(
      `SELECT name, role, COALESCE(role_level, 0) AS role_level FROM users WHERE id = $1`,
      [userId]
    );
    if (ur.rows.length === 0) return fallback;
    role = ur.rows[0].role;
    role_level = parseInt(ur.rows[0].role_level, 10) || 0;
    userName = ur.rows[0].name || '';
  } catch (e) {
    console.warn('[ai-level] users lookup failed:', e.message);
    return fallback;
  }

  // Step 2: admin bypass — owners/staff always get the top tier
  if (ADMIN_BYPASS_ROLES.has(role) || role_level >= 100) {
    return {
      level: 3,
      levelName: 'مساعد شخصي VIP+',
      planName: 'صلاحيات إدارية',
      userName,
      role,
      role_level,
      bypass: true,
    };
  }

  // Step 3: regular customer — pick the highest ai_support_level
  // across their active plan rows.
  try {
    const pr = await db.query(
      `SELECT COALESCE(MAX(p.ai_support_level), 0)::int AS ai_level,
              MAX(p.name_ar) FILTER (WHERE p.ai_support_level = (
                SELECT MAX(p2.ai_support_level)
                  FROM user_plans up2 JOIN plans p2 ON up2.plan_id = p2.id
                 WHERE up2.user_id = $1 AND up2.status = 'active'
                   AND (up2.expires_at IS NULL OR up2.expires_at > NOW())
              )) AS plan_name
         FROM user_plans up
         JOIN plans p ON up.plan_id = p.id
        WHERE up.user_id = $1 AND up.status = 'active'
          AND (up.expires_at IS NULL OR up.expires_at > NOW())`,
      [userId]
    );
    const level = parseInt(pr.rows[0]?.ai_level, 10) || 0;
    const planName = pr.rows[0]?.plan_name || '';
    const levelNames = {
      0: 'غير مشترك',
      1: 'دعم ذكي أساسي',
      2: 'دعم VIP متقدم',
      3: 'مساعد شخصي VIP+',
    };
    return {
      level,
      levelName: levelNames[level] || 'غير مشترك',
      planName,
      userName,
      role,
      role_level,
      bypass: false,
    };
  } catch (e) {
    console.warn('[ai-level] plan lookup failed:', e.message);
    return { ...fallback, userName, role, role_level };
  }
}

// ─── /api/ai/user/ai-level — chatbot badge resolver ─────────────────────
// Mounted at /api/ai/user/ai-level. The original chatbot fetched
// /api/user/ai-level which never existed; we keep a compatibility alias
// at /api/user/ai-level in index.js (next.config rewrites) by also
// exposing it here under the same router-relative path that previously
// existed — see /user/ai-level below.
router.get("/user/ai-level", authMiddleware, asyncHandler(async (req, res) => {
  const info = await resolveAiLevelForUser(req.user?.id);
  res.json(info);
}));

// ─── Lead Intelligence — funnel + intent ────────────────────────────────
router.get("/center/leads/funnel", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const window = String(req.query.window || '30d');
  const interval = window === '7d' ? '7 days' : window === '24h' ? '24 hours' : '30 days';

  const safe = async (sql, params = []) => {
    try { const r = await db.query(sql, params); return r.rows; } catch { return []; }
  };

  const [byStage, byIntent, byProperty, recent, byDay] = await Promise.all([
    safe(`SELECT event_type, COUNT(*)::int AS n
            FROM ai_lead_events
           WHERE created_at >= NOW() - INTERVAL '${interval}'
           GROUP BY event_type`),
    safe(`SELECT intent, COUNT(*)::int AS n
            FROM ai_lead_events
           WHERE created_at >= NOW() - INTERVAL '${interval}'
           GROUP BY intent`),
    safe(`SELECT property_hint, COUNT(*)::int AS n
            FROM ai_lead_events
           WHERE created_at >= NOW() - INTERVAL '${interval}'
             AND property_hint IS NOT NULL AND property_hint <> ''
           GROUP BY property_hint
           ORDER BY n DESC LIMIT 10`),
    safe(`SELECT id, event_type, intent, confidence, property_hint, raw_message, created_at, session_id
            FROM ai_lead_events
           WHERE created_at >= NOW() - INTERVAL '${interval}'
           ORDER BY created_at DESC
           LIMIT 50`),
    safe(`SELECT date_trunc('day', created_at) AS day,
                 event_type, COUNT(*)::int AS n
            FROM ai_lead_events
           WHERE created_at >= NOW() - INTERVAL '${interval}'
           GROUP BY 1, 2
           ORDER BY 1`),
  ]);

  // Convert byStage into a fixed-shape object for the funnel viz.
  const stageCounts = { lead: 0, inquiry: 0, visit_request: 0, agent_request: 0, sale: 0 };
  for (const row of byStage) {
    if (stageCounts[row.event_type] !== undefined) stageCounts[row.event_type] = row.n;
  }

  res.json({
    window,
    stages: stageCounts,
    intents: byIntent,
    top_properties: byProperty,
    recent,
    by_day: byDay,
  });
}));

// ─── Knowledge Base — bulk reindex of embeddings ────────────────────────
router.post("/center/knowledge/reindex", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  if (!(await isVectorAvailable())) {
    return res.status(503).json({ ok: false, error: "pgvector غير مفعّل على قاعدة البيانات" });
  }
  // Only reindex active articles missing an embedding, OR all when `force=1`.
  const force = req.query.force === '1';
  const r = await db.query(
    force
      ? `SELECT id FROM ai_knowledge_articles ORDER BY priority DESC, updated_at DESC`
      : `SELECT id FROM ai_knowledge_articles WHERE embedding IS NULL`
  );
  let done = 0;
  let failed = 0;
  // Process serially to avoid hitting OpenAI's rate limit; this endpoint
  // is operator-triggered and rare. Returns a summary.
  for (const row of r.rows) {
    try {
      await reindexArticle(row.id);
      done += 1;
    } catch {
      failed += 1;
    }
  }
  await auditAi({ action: 'kb_reindex', targetKind: 'kb', targetId: force ? 'force' : 'missing', newValue: { done, failed }, actor: req.user });
  res.json({ ok: true, processed: r.rows.length, done, failed });
}));

// ─── Enforcement metrics (Phase 7 add-ons) ──────────────────────────────
router.get("/center/enforcement-stats", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const r = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE reason = 'banned_topic'         AND created_at >= NOW() - INTERVAL '24 hours')::int  AS banned_today,
      COUNT(*) FILTER (WHERE reason = 'banned_topic'         AND created_at >= NOW() - INTERVAL '30 days')::int   AS banned_month,
      COUNT(*) FILTER (WHERE reason LIKE 'after_hours%'      AND created_at >= NOW() - INTERVAL '24 hours')::int  AS after_hours_today,
      COUNT(*) FILTER (WHERE reason = 'daily_limit'          AND created_at >= NOW() - INTERVAL '24 hours')::int  AS limit_today,
      COUNT(*) FILTER (WHERE reason = 'daily_limit'          AND created_at >= NOW() - INTERVAL '30 days')::int   AS limit_month
    FROM ai_blocked_attempts
  `);
  const esc = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'open')::int     AS open_escalations,
      COUNT(*) FILTER (WHERE status = 'assigned')::int AS assigned_escalations,
      COUNT(*) FILTER (WHERE status = 'resolved' AND resolved_at >= NOW() - INTERVAL '7 days')::int AS resolved_week
    FROM ai_escalations
  `);
  const kb = await db.query(`
    SELECT COUNT(*) FILTER (WHERE is_active)::int AS active_articles,
           COUNT(*)::int                          AS total_articles
    FROM ai_knowledge_articles
  `);
  res.json({
    blocked: r.rows[0],
    escalations: esc.rows[0],
    knowledge: kb.rows[0],
  });
}));

// Sentiment summary for the overview card / pie chart.
router.get("/center/sentiment", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const r = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE sentiment = 'very_negative')::int AS very_negative,
       COUNT(*) FILTER (WHERE sentiment = 'negative')::int       AS negative,
       COUNT(*) FILTER (WHERE sentiment = 'neutral')::int        AS neutral,
       COUNT(*) FILTER (WHERE sentiment = 'positive')::int       AS positive,
       COUNT(*) FILTER (WHERE sentiment = 'very_positive')::int  AS very_positive,
       COUNT(*) FILTER (WHERE sentiment IS NOT NULL)::int        AS scored,
       COUNT(*)::int                                              AS total
     FROM ai_chat_logs
     WHERE source = 'customer' AND created_at >= NOW() - INTERVAL '7 days'`
  );
  res.json({ window: '7d', ...r.rows[0] });
}));

// ─── AI Command Center — logs feed ────────────────────────────────────────
router.get("/center/logs", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { source, escalated, q, limit } = req.query;
  const conditions = [];
  const params = [];
  if (source === 'customer' || source === 'admin') {
    conditions.push(`source = $${params.length + 1}`);
    params.push(source);
  }
  if (escalated === '1' || escalated === 'true') {
    conditions.push(`escalated = true`);
  }
  if (q && String(q).trim()) {
    conditions.push(`(user_message ILIKE $${params.length + 1} OR ai_response ILIKE $${params.length + 1})`);
    params.push(`%${String(q).trim()}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitN = Math.min(500, Math.max(1, parseInt(String(limit || 100), 10) || 100));
  const result = await db.query(
    `SELECT id, session_id, source, model, user_message, ai_response,
            escalated, escalate_reason, prompt_tokens, completion_tokens,
            cost_usd, created_at
       FROM ai_chat_logs
       ${where}
       ORDER BY created_at DESC
       LIMIT ${limitN}`,
    params
  );
  res.json({ logs: result.rows });
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

// ─────────────────────────────────────────────────────────────────
// GET /api/ai/ultra-diagnostic?code=<ULTRA_BYPASS_CODE>
//
// One-shot connectivity test for Gemini Veo. Owner-only — gated on
// the same bypass code that protects the real Ultra path so it can't
// be triggered by anonymous traffic.
//
// What it does:
//   1. Reports whether GEMINI_API_KEY is present.
//   2. Reports the model name + endpoint that the orchestrator will
//      hit (so the owner can confirm it matches Google's allowlisted
//      model for their billing project).
//   3. Fires the exact Veo `:generateVideos` POST with a minimal
//      text-only payload and captures Google's response verbatim.
//      Does NOT poll, does NOT download. If Google returns 4xx we
//      see the real error; if 200 we know connectivity + auth +
//      billing all work (a small generation cost may apply on
//      Google's side for an accepted operation).
//   4. Returns everything as a flat JSON so the owner can paste it
//      back without polling or DevTools.
//
// The endpoint never echoes the API key — only the model name and
// path template. The bypass code is matched server-side and not
// reflected in the response.
// ─────────────────────────────────────────────────────────────────
router.get("/ultra-diagnostic", asyncHandler(async (req, res) => {
  const code = typeof req.query?.code === "string" ? req.query.code : "";
  if (!code || code !== ULTRA_BYPASS_CODE) {
    return res.status(403).json({
      ok: false,
      error: "unauthorized — supply ?code=<ULTRA_BYPASS_CODE>",
    });
  }

  const apiKey =
    process.env.GEMINI_API_KEY || process.env.Gemeni2 || process.env.Gemeni || "";
  const veoModel = process.env.VEO_MODEL || "veo-3.0-generate-001";

  // First diagnostic returned 404+HTML+empty for :generateVideos.
  // On the Gemini API (generativelanguage.googleapis.com) Veo's
  // start action is :predictLongRunning, NOT :generateVideos
  // (which is a Vertex-AI-only verb). Probe both so the response
  // shows definitively which action works for this key.
  const actions = ["predictLongRunning", "generateVideos"];

  const base = {
    geminiKeyPresent: !!apiKey,
    geminiKeySource: process.env.GEMINI_API_KEY
      ? "GEMINI_API_KEY"
      : process.env.Gemeni2
        ? "Gemeni2"
        : process.env.Gemeni
          ? "Gemeni"
          : null,
    model: veoModel,
    ultraBypassConfigured: !!process.env.ULTRA_BYPASS_CODE,
  };

  if (!apiKey) {
    return res.json({
      ...base,
      veoTestResult: "skipped",
      googleStatus: null,
      googleError: "GEMINI_API_KEY is not set on Render — Veo cannot be called.",
    });
  }

  const payload = {
    instances: [{ prompt: "cinematic test of luxury real estate, 2 seconds" }],
    parameters: {
      aspectRatio: "16:9",
      durationSeconds: 5,
      sampleCount: 1,
      personGeneration: "dont_allow",
    },
  };

  // Try each action and report the result. If ANY succeeds, that's
  // the action the orchestrator should be using.
  const probes = [];
  let firstAccepted = null;
  for (const action of actions) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${veoModel}:${action}?key=${apiKey}`;
    try {
      const r = await axios.post(url, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 60000,
        validateStatus: () => true,
      });
      const rawBody =
        typeof r.data === "string"
          ? r.data
          : (() => { try { return JSON.stringify(r.data); } catch { return String(r.data); } })();
      const probe = {
        action,
        url: `models/${veoModel}:${action}`,
        status: r.status,
        contentType: r.headers?.["content-type"] || null,
        googleError: r.data?.error || null,
        bodyRaw: rawBody?.slice(0, 2000) || null,
        operationName: r.status < 400 ? (r.data?.name || null) : null,
      };
      probes.push(probe);
      if (r.status < 400 && !firstAccepted) firstAccepted = probe;
    } catch (err) {
      probes.push({
        action,
        url: `models/${veoModel}:${action}`,
        status: err.response?.status || null,
        networkError: err.message || String(err),
      });
    }
  }

  return res.json({
    ...base,
    veoTestResult: firstAccepted ? "accepted" : "google_error",
    googleStatus: firstAccepted ? firstAccepted.status : probes[0]?.status || null,
    googleError: firstAccepted ? null : (probes[0]?.googleError || probes[0]?.bodyRaw || null),
    workingAction: firstAccepted ? firstAccepted.action : null,
    workingOperationName: firstAccepted ? firstAccepted.operationName : null,
    probes,
    note: firstAccepted
      ? `Veo accepted via :${firstAccepted.action}. Update orchestrator to use this action.`
      : "All probed actions returned 4xx. See probes[] for each action's exact response.",
  });
}));

// ─────────────────────────────────────────────────────────────────
// POST /api/ai/user/upload-seed-video
//
// Customer uploads a poorly-shot phone video; we host it on
// Cloudinary and return the URL. The Ultra generation endpoint
// can then accept this URL via `seedVideoUrl` and the orchestrator
// extracts frames from it to use as image-to-video seeds —
// transforming amateur footage into a cinematic AI production.
//
// Multer limits already enforce 20 MB max per file (config/multer.js).
// Only the Ultra tier path consumes this URL; other tiers ignore.
// ─────────────────────────────────────────────────────────────────
const { upload: seedVideoMulter } = require("../config/multer");
const { uploadVideo: cloudinaryUploadVideoForSeed } = require("../services/cloudinaryService");

router.post(
  "/user/upload-seed-video",
  authMiddleware,
  seedVideoMulter.single("video"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "يرجى رفع ملف فيديو واحد." });
    }
    const mt = (req.file.mimetype || "").toLowerCase();
    const ext = path.extname(req.file.originalname || "").toLowerCase();
    if (!mt.startsWith("video/") && !/\.(mp4|webm|mov|m4v)$/i.test(ext)) {
      try { await fs.unlink(req.file.path); } catch {}
      return res.status(400).json({ error: "صيغة الملف غير مدعومة — استخدم MP4 أو MOV أو WebM." });
    }
    try {
      const folder = `users/${req.user.id}/seed-videos`;
      const uploadResult = await cloudinaryUploadVideoForSeed(req.file.path, folder);
      if (!uploadResult?.success || !uploadResult.url) {
        throw new Error(uploadResult?.error || "فشل رفع الفيديو إلى التخزين السحابي.");
      }
      try { await fs.unlink(req.file.path); } catch {}
      return res.json({
        success: true,
        url: uploadResult.url,
        publicId: uploadResult.publicId || null,
        durationSec: uploadResult.duration || null,
        message: "تم رفع الفيديو. يمكنك الآن توليد الإنتاج السينمائي.",
      });
    } catch (e) {
      try { await fs.unlink(req.file.path); } catch {}
      console.error("[upload-seed-video] failed:", e.message);
      return res.status(500).json({ error: e.message || "فشل رفع الفيديو." });
    }
  })
);

module.exports = router;

// Export helper functions for use in other modules
module.exports.createSlideshowVideo = createSlideshowVideo;
module.exports.generateDynamicPromoText = generateDynamicPromoText;
module.exports.generatePromotionalText = generatePromotionalText;
