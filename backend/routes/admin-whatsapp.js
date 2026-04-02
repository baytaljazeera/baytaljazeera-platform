const express = require('express');
const db = require('../db');
const { authMiddleware, requireRoles } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();

const ALLOWED_ROLES = ['super_admin', 'marketing_admin', 'support_admin'];
const adminAuth = [authMiddleware, requireRoles(...ALLOWED_ROLES)];

const WELCOME_FALLBACK =
  'أهلاً وسهلاً بكم في بيت الجزيرة 🏠\n\nسيقوم فريقنا بالتواصل معكم قريباً.';

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

// ─── GET /unread-count — total unread conversations (for sidebar badge) ───────
router.get('/unread-count', ...adminAuth, asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT COUNT(DISTINCT phone)::int AS count
    FROM whatsapp_messages
    WHERE direction = 'inbound' AND is_read = false
  `);

  res.json({ count: result.rows[0]?.count || 0 });
}));

module.exports = router;
