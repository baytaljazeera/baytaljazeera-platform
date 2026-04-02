const express = require('express');
const db = require('../db');
const { authMiddleware, requireRoles } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');
const { GoogleGenAI } = require('@google/genai');

// Lazy-init Gemini — same key priority as ai.js
function getGenAI() {
  const key = process.env.GEMINI_API_KEY || process.env.Gemeni2 || process.env.Gemeni;
  if (!key) return null;
  return new GoogleGenAI({ apiKey: key });
}

async function geminiText(prompt, opts = {}) {
  const genAI = getGenAI();
  if (!genAI) throw new Error('Gemini API key not configured');
  const result = await genAI.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: prompt,
    config: { temperature: 0.85, maxOutputTokens: 300, ...opts },
  });
  return (result.text || '').trim();
}

const router = express.Router();

const ALLOWED_ROLES = ['super_admin', 'marketing_admin', 'support_admin'];
const adminAuth = [authMiddleware, requireRoles(...ALLOWED_ROLES)];

const WELCOME_FALLBACK =
  'أهلاً وسهلاً بكم في بيت الجزيرة 🏠\n\nشكراً لتواصلكم معنا. سيقوم أحد ممثلي خدمة العملاء بالرد عليكم في أقرب وقت ممكن.\n\nنحن هنا لمساعدتكم في جميع استفساراتكم العقارية.';

// ─── Twilio send helper (mirrors whatsapp.js, kept local to avoid circular deps) ───
async function sendWhatsAppMessage(to, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const rawFrom = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken) throw new Error('Twilio credentials not configured');
  if (!rawFrom) throw new Error('TWILIO_PHONE_NUMBER environment variable is not set');

  const fromNumber = rawFrom.startsWith('whatsapp:') ? rawFrom : `whatsapp:${rawFrom}`;
  const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to.startsWith('+') ? to : '+' + to}`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: fromNumber, To: toNumber, Body: message }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to send WhatsApp message');
  return data;
}

// ─── GET /settings ───────────────────────────────────────────────────────────
router.get('/settings', ...adminAuth, asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT value FROM app_settings WHERE key = 'whatsapp_welcome_message'`
  );
  res.json({
    welcome_message: result.rows[0]?.value || WELCOME_FALLBACK,
  });
}));

// ─── POST /settings ──────────────────────────────────────────────────────────
router.post('/settings', ...adminAuth, asyncHandler(async (req, res) => {
  const { welcome_message } = req.body;
  if (!welcome_message || !welcome_message.trim()) {
    return res.status(400).json({ error: 'نص الرسالة الترحيبية مطلوب' });
  }

  await db.query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ('whatsapp_welcome_message', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
    [welcome_message.trim()]
  );

  res.json({ ok: true, message: 'تم حفظ الرسالة الترحيبية بنجاح' });
}));

// ─── GET /messages — conversation list (one row per phone) ───────────────────
router.get('/messages', ...adminAuth, asyncHandler(async (req, res) => {
  const result = await db.query(`
    WITH latest AS (
      SELECT DISTINCT ON (phone)
        phone,
        message  AS last_message,
        direction AS last_direction,
        created_at AS last_message_at
      FROM whatsapp_messages
      ORDER BY phone, created_at DESC
    ),
    unread AS (
      SELECT phone, COUNT(*) AS unread_count
      FROM whatsapp_messages
      WHERE direction = 'inbound' AND is_read = false
      GROUP BY phone
    )
    SELECT
      l.phone,
      l.last_message,
      l.last_direction,
      l.last_message_at,
      COALESCE(u.unread_count, 0)::int AS unread_count
    FROM latest l
    LEFT JOIN unread u ON u.phone = l.phone
    ORDER BY l.last_message_at DESC
  `);

  res.json({ conversations: result.rows });
}));

// ─── GET /messages/:phone — full thread ──────────────────────────────────────
router.get('/messages/:phone', ...adminAuth, asyncHandler(async (req, res) => {
  const { phone } = req.params;

  const result = await db.query(
    `SELECT id, phone, message, direction, is_read, status, twilio_sid, created_at
     FROM whatsapp_messages
     WHERE phone = $1
     ORDER BY created_at ASC`,
    [phone]
  );

  res.json({ messages: result.rows });
}));

// ─── POST /send — manual admin reply ─────────────────────────────────────────
router.post('/send', ...adminAuth, asyncHandler(async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message || !message.trim()) {
    return res.status(400).json({ error: 'رقم الهاتف والرسالة مطلوبان' });
  }

  const result = await sendWhatsAppMessage(phone, message.trim());

  await db.query(
    `INSERT INTO whatsapp_messages (phone, message, status, direction, is_read, twilio_sid, sent_by, created_at)
     VALUES ($1, $2, 'sent', 'outbound', true, $3, $4, NOW())`,
    [phone, message.trim(), result.sid, req.user.id]
  );

  res.json({ ok: true, sid: result.sid });
}));

// ─── PUT /read/:phone — mark all inbound from a customer as read ──────────────
router.put('/read/:phone', ...adminAuth, asyncHandler(async (req, res) => {
  const { phone } = req.params;

  await db.query(
    `UPDATE whatsapp_messages
     SET is_read = true
     WHERE phone = $1 AND direction = 'inbound' AND is_read = false`,
    [phone]
  );

  res.json({ ok: true });
}));

// ─── POST /send-template — Template Launcher ─────────────────────────────────
const WA_TEMPLATES = [
  {
    id: 'hook_1',
    label: 'رسالة استكشاف أولى',
    text: 'مرحباً {{1}}، لاحظنا بحثك عن عقارات مؤخراً. لدينا عروض جديدة تناسبك، هل ترغب بالاطلاع عليها؟',
  },
  {
    id: 'hook_2',
    label: 'عرض حصري قبل النشر',
    text: 'أهلاً {{1}}، تم إدراج عقار مميز في {{2}} قبل نشره للعامة. هل أنت مهتم بالتفاصيل؟',
  },
  {
    id: 'hook_3',
    label: 'تذكير بحث الإيجار',
    text: 'تذكير من بيت الجزيرة: هل ما زلت تبحث عن عقار للإيجار؟ أرسل "نعم" لمساعدتك.',
  },
];

router.get('/templates', ...adminAuth, asyncHandler(async (req, res) => {
  res.json({ templates: WA_TEMPLATES });
}));

router.post('/send-template', ...adminAuth, asyncHandler(async (req, res) => {
  const { phone, templateId, variables = [] } = req.body;

  if (!phone || !templateId) {
    return res.status(400).json({ error: 'رقم الهاتف ومعرّف القالب مطلوبان' });
  }

  const template = WA_TEMPLATES.find((t) => t.id === templateId);
  if (!template) {
    return res.status(400).json({ error: 'القالب غير موجود' });
  }

  // Replace {{1}}, {{2}}, … with the provided variables array
  let finalMessage = template.text;
  variables.forEach((val, idx) => {
    finalMessage = finalMessage.replace(`{{${idx + 1}}}`, val || '');
  });

  const result = await sendWhatsAppMessage(phone, finalMessage);

  await db.query(
    `INSERT INTO whatsapp_messages
       (phone, message, status, direction, is_read, twilio_sid, sent_by, created_at)
     VALUES ($1, $2, 'sent', 'outbound', true, $3, $4, NOW())`,
    [phone, finalMessage, result.sid, req.user.id]
  );

  res.json({ ok: true, sid: result.sid, finalMessage });
}));

// ─── GET /unread-count — total unread conversations (for sidebar badge) ───────
router.get('/unread-count', ...adminAuth, asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT COUNT(DISTINCT phone)::int AS count
    FROM whatsapp_messages
    WHERE direction = 'inbound' AND is_read = false
  `);

  res.json({ count: result.rows[0]?.count || 0 });
}));

// ─── GET /customers — 24-hour window radar ───────────────────────────────────
router.get('/customers', ...adminAuth, asyncHandler(async (req, res) => {
  const { rows } = await db.query(`
    WITH last_inbound AS (
      SELECT
        phone,
        MAX(created_at) FILTER (WHERE direction = 'inbound') AS last_inbound_at
      FROM whatsapp_messages
      GROUP BY phone
    ),
    last_msg AS (
      SELECT DISTINCT ON (phone)
        phone,
        message AS last_snippet
      FROM whatsapp_messages
      ORDER BY phone, created_at DESC
    )
    SELECT
      li.phone,
      li.last_inbound_at,
      lm.last_snippet,
      CASE
        WHEN li.last_inbound_at IS NOT NULL
             AND li.last_inbound_at > NOW() - INTERVAL '24 hours'
        THEN 'OPEN'
        ELSE 'CLOSED'
      END AS window_status,
      GREATEST(
        COALESCE(
          EXTRACT(EPOCH FROM (li.last_inbound_at + INTERVAL '24 hours' - NOW()))::int,
          0
        ),
        0
      ) AS remaining_seconds
    FROM last_inbound li
    JOIN last_msg lm ON lm.phone = li.phone
    ORDER BY
      CASE WHEN li.last_inbound_at > NOW() - INTERVAL '24 hours' THEN 0 ELSE 1 END,
      li.last_inbound_at DESC NULLS LAST
  `);
  res.json({ customers: rows });
}));

// ─── POST /ai-suggest — Gemini suggestion for a specific customer ─────────────
router.post('/ai-suggest', ...adminAuth, asyncHandler(async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'رقم الهاتف مطلوب' });

  if (!getGenAI()) {
    return res.status(503).json({ error: 'خدمة الذكاء الاصطناعي غير متاحة حالياً' });
  }

  const { rows: msgs } = await db.query(
    `SELECT message, direction
     FROM whatsapp_messages
     WHERE phone = $1
     ORDER BY created_at DESC LIMIT 5`,
    [phone]
  );

  const contextLines = msgs
    .reverse()
    .map(m => `${m.direction === 'inbound' ? 'العميل' : 'بيت الجزيرة'}: ${m.message}`)
    .join('\n');

  const prompt = `أنت خبير تسويق عقارات فاخرة في السعودية تعمل لصالح منصة "بيت الجزيرة".

آخر رسائل هذا العميل:
${contextLines}

المطلوب: اكتب رسالة واتساب قصيرة ومقنعة (3 جمل كحد أقصى) بالعربية للمتابعة خلال نافذة الـ 24 ساعة.
- ركّز على اهتمام العميل المحدد المستنبط من المحادثة
- أنشئ إحساساً خفياً بالفرصة الحصرية
- لا تستخدم إيموجي
- أرجع نص الرسالة فقط بدون أي مقدمة`;

  try {
    const suggestion = await geminiText(prompt);
    if (!suggestion) return res.status(500).json({ error: 'فشل توليد الاقتراح' });
    res.json({ suggestion });
  } catch (err) {
    console.error('[ai-suggest]', err.message);
    res.status(500).json({ error: 'فشل توليد الاقتراح' });
  }
}));

// ─── POST /ai-blast-suggest — generic luxury blast message ───────────────────
router.post('/ai-blast-suggest', ...adminAuth, asyncHandler(async (req, res) => {
  if (!getGenAI()) {
    return res.status(503).json({ error: 'خدمة الذكاء الاصطناعي غير متاحة حالياً' });
  }

  const prompt = `أنت خبير تسويق عقارات فاخرة في السعودية تعمل لصالح منصة "بيت الجزيرة".

اكتب رسالة واتساب تسويقية راقية (3-4 جمل) لمجموعة عملاء مهتمين بالعقارات الفاخرة في المملكة.
- ابدأ بعبارة ترحيبية راقية تعكس هوية بيت الجزيرة
- أبرز عرضاً حصرياً أو فرصة استثمارية متميزة
- أضف حافزاً للتصرف الفوري (محدودية العرض أو الوقت)
- لا تستخدم إيموجي
- أرجع نص الرسالة فقط`;

  try {
    const suggestion = await geminiText(prompt, { temperature: 0.9 });
    if (!suggestion) return res.status(500).json({ error: 'فشل توليد الرسالة' });
    res.json({ suggestion });
  } catch (err) {
    console.error('[ai-blast-suggest]', err.message);
    res.status(500).json({ error: 'فشل توليد الرسالة' });
  }
}));

module.exports = router;
