const express = require("express");
const db = require("../db");
const { authMiddleware, requireRoles } = require("../middleware/auth");
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();

async function sendWhatsAppMessage(to, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
  
  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials not configured');
  }
  
  const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to.startsWith('+') ? to : '+' + to}`;
  
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      From: fromNumber,
      To: toNumber,
      Body: message,
    }),
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.message || 'Failed to send WhatsApp message');
  }
  
  return data;
}

router.post("/send", authMiddleware, requireRoles('super_admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const { phone, message, userId } = req.body;
  
  if (!phone || !message) {
    return res.status(400).json({ error: "رقم الهاتف والرسالة مطلوبان" });
  }
  
  try {
    const result = await sendWhatsAppMessage(phone, message);
    
    await db.query(`
      INSERT INTO whatsapp_messages (user_id, phone, message, status, twilio_sid, sent_by, created_at)
      VALUES ($1, $2, $3, 'sent', $4, $5, NOW())
    `, [userId || null, phone, message, result.sid, req.user.id]);
    
    res.json({ ok: true, message: "تم إرسال الرسالة بنجاح", sid: result.sid });
  } catch (err) {
    await db.query(`
      INSERT INTO whatsapp_messages (user_id, phone, message, status, error_message, sent_by, created_at)
      VALUES ($1, $2, $3, 'failed', $4, $5, NOW())
    `, [userId || null, phone, message, err.message, req.user.id]);
    
    return res.status(500).json({ error: "فشل في إرسال الرسالة: " + err.message });
  }
}));

router.post("/send-bulk", authMiddleware, requireRoles('super_admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const { recipients, message, campaign_name } = req.body;
  
  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: "قائمة المستلمين مطلوبة" });
  }
  
  if (!message) {
    return res.status(400).json({ error: "الرسالة مطلوبة" });
  }
  
  const campaignResult = await db.query(`
    INSERT INTO whatsapp_campaigns (name, message, total_recipients, sent_by, created_at)
    VALUES ($1, $2, $3, $4, NOW())
    RETURNING id
  `, [campaign_name || 'حملة بدون عنوان', message, recipients.length, req.user.id]);
  
  const campaignId = campaignResult.rows[0].id;
  
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };
  
  for (const recipient of recipients) {
    try {
      const twilioResult = await sendWhatsAppMessage(recipient.phone, message);
      
      await db.query(`
        INSERT INTO whatsapp_messages (user_id, phone, message, status, twilio_sid, campaign_id, sent_by, created_at)
        VALUES ($1, $2, $3, 'sent', $4, $5, $6, NOW())
      `, [recipient.userId || null, recipient.phone, message, twilioResult.sid, campaignId, req.user.id]);
      
      results.success++;
    } catch (err) {
      await db.query(`
        INSERT INTO whatsapp_messages (user_id, phone, message, status, error_message, campaign_id, sent_by, created_at)
        VALUES ($1, $2, $3, 'failed', $4, $5, $6, NOW())
      `, [recipient.userId || null, recipient.phone, message, err.message, campaignId, req.user.id]);
      
      results.failed++;
      results.errors.push({ phone: recipient.phone, error: err.message });
    }
  }
  
  await db.query(`
    UPDATE whatsapp_campaigns 
    SET success_count = $1, failed_count = $2, status = 'completed'
    WHERE id = $3
  `, [results.success, results.failed, campaignId]);
  
  res.json({
    ok: true,
    message: `تم إرسال ${results.success} رسالة بنجاح، فشل ${results.failed}`,
    campaignId,
    results
  });
}));

router.get("/campaigns", authMiddleware, requireRoles('super_admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT 
      wc.*,
      u.name as sent_by_name
    FROM whatsapp_campaigns wc
    LEFT JOIN users u ON wc.sent_by = u.id
    ORDER BY wc.created_at DESC
    LIMIT 50
  `);
  
  res.json({ campaigns: result.rows });
}));

router.get("/messages", authMiddleware, requireRoles('super_admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const { campaignId, status, limit = 50 } = req.query;
  
  let whereClause = "WHERE 1=1";
  const params = [];
  let paramIndex = 1;
  
  if (campaignId) {
    whereClause += ` AND wm.campaign_id = $${paramIndex}`;
    params.push(campaignId);
    paramIndex++;
  }
  
  if (status) {
    whereClause += ` AND wm.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }
  
  params.push(parseInt(limit));
  
  const result = await db.query(`
    SELECT 
      wm.*,
      u.name as user_name,
      sender.name as sent_by_name
    FROM whatsapp_messages wm
    LEFT JOIN users u ON wm.user_id = u.id
    LEFT JOIN users sender ON wm.sent_by = sender.id
    ${whereClause}
    ORDER BY wm.created_at DESC
    LIMIT $${paramIndex}
  `, params);
  
  res.json({ messages: result.rows });
}));

router.get("/templates", authMiddleware, requireRoles('super_admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT * FROM whatsapp_templates
    ORDER BY created_at DESC
  `);
  
  res.json({ templates: result.rows });
}));

router.post("/templates", authMiddleware, requireRoles('super_admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const { name, message, category } = req.body;
  
  if (!name || !message) {
    return res.status(400).json({ error: "اسم القالب والرسالة مطلوبان" });
  }
  
  const result = await db.query(`
    INSERT INTO whatsapp_templates (name, message, category, created_by, created_at)
    VALUES ($1, $2, $3, $4, NOW())
    RETURNING *
  `, [name, message, category || 'general', req.user.id]);
  
  res.json({ ok: true, template: result.rows[0] });
}));

router.delete("/templates/:id", authMiddleware, requireRoles('super_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  await db.query("DELETE FROM whatsapp_templates WHERE id = $1", [id]);
  
  res.json({ ok: true, message: "تم حذف القالب" });
}));

router.get("/check-config", authMiddleware, requireRoles('super_admin', 'marketing_admin'), asyncHandler(async (req, res) => {
  const configured = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
  res.json({ configured });
}));

module.exports = router;
