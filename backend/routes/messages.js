const express = require("express");
const router = express.Router();
const db = require("../db");
const { authMiddlewareWithEmailCheck } = require("../middleware/auth");
const { asyncHandler } = require('../middleware/asyncHandler');
const OpenAI = require("openai");

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const SUSPICIOUS_PATTERNS = [
  { pattern: /\b\d{10}\b/g, flag: "phone_number", name: "رقم هاتف" },
  { pattern: /whatsapp|واتساب|واتس/gi, flag: "external_contact", name: "واتساب" },
  { pattern: /telegram|تليجرام|تلجرام/gi, flag: "external_contact", name: "تليجرام" },
  { pattern: /تحويل.*بنك|حوالة|ايبان|iban/gi, flag: "fraud", name: "معاملة مالية" },
  { pattern: /مبلغ.*مقدم.*ضمان|عربون.*نقد/gi, flag: "fraud", name: "طلب مال مقدم" },
  { pattern: /snapchat|سناب.*شات|سنابي/gi, flag: "external_contact", name: "سناب شات" },
  { pattern: /instagram|انستا|انستقرام/gi, flag: "external_contact", name: "انستقرام" },
  { pattern: /\+966\s?\d{9}|\b05\d{8}\b/g, flag: "phone_number", name: "رقم سعودي" },
];

/** Normalize LLM intent label for storage (snake_case, max 100 chars). */
function normalizeIntentCategory(value) {
  if (value == null || typeof value !== "string") return null;
  const s = value.trim().toLowerCase().replace(/[\s-]+/g, "_").slice(0, 100);
  return s || null;
}

async function autoAnalyzeMessage(senderId, recipientId, listingId, messageText) {
  try {
    const detectedPatterns = [];
    for (const { pattern, flag, name } of SUSPICIOUS_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(messageText)) {
        detectedPatterns.push({ flag, name });
      }
    }
    
    if (detectedPatterns.length === 0) {
      return null;
    }
    
    console.log(`[Auto-Analyze] Suspicious patterns detected in message: ${detectedPatterns.map(p => p.name).join(', ')}`);
    
    const prompt = `أنت محلل أمني. حلل هذه الرسالة من منصة عقارية:

"${messageText}"

**أنماط مكتشفة:** ${detectedPatterns.map(p => p.name).join(', ')}

**حلل وأجب بـ JSON فقط (بدون نص خارج JSON):**
{
  "risk_score": <0-100>,
  "risk_level": "safe"|"low"|"medium"|"high"|"critical",
  "primary_flag": "suspicious"|"fraud"|"spam"|"inappropriate"|"external_contact",
  "intent_category": "<معرّف إنجليزي واحد بصيغة snake_case يصف النية الأساسية>",
  "analysis": "شرح مختصر",
  "recommendation": "التوصية"
}

**intent_category** يجب أن يكون واحداً من القيم التالية عندما ينطبق، أو الأقرب منها:
commission_bypass | harassment | scam | external_communication | spam | inappropriate | money_request | phone_share | other

- commission_bypass: محاولة إتمام الصفقة أو دفع العمولة خارج المنصة
- external_communication: دعوة للتواصل خارج المنصة (واتساب، تليجرام، إلخ)
- scam | money_request | phone_share: حسب السياق
- other: إذا لم يتطابق أي تصنيف بوضوح`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "أنت محلل أمني. أجب بـ JSON فقط." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 300
    });
    
    let analysis;
    try {
      const responseText = response.choices[0]?.message?.content || '{}';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch (parseError) {
      analysis = {
        risk_score: 30,
        risk_level: "low",
        primary_flag: detectedPatterns[0]?.flag || "suspicious",
        intent_category: "other",
        analysis: "تحليل تلقائي",
        recommendation: "مراقبة",
      };
    }

    if (analysis) {
      analysis.intent_category = normalizeIntentCategory(analysis.intent_category);
    }
    
    if (analysis && analysis.risk_score >= 30) {
      const existingFlag = await db.query(
        `SELECT id FROM flagged_conversations 
         WHERE user1_id = LEAST($1::uuid, $2::uuid) AND user2_id = GREATEST($1::uuid, $2::uuid)
         AND listing_id = $3 AND status IN ('pending', 'investigating')`,
        [senderId, recipientId, listingId]
      );
      
      if (existingFlag.rows.length === 0) {
        await db.query(
          `INSERT INTO flagged_conversations 
           (user1_id, user2_id, listing_id, flag_type, intent_category, flag_reason, ai_analysis, ai_risk_score, status, created_at)
           VALUES (LEAST($1::uuid, $2::uuid), GREATEST($1::uuid, $2::uuid), $3, $4, $5, $6, $7, $8, 'pending', NOW())`,
          [
            senderId,
            recipientId,
            listingId,
            analysis.primary_flag || "suspicious",
            analysis.intent_category || null,
            `تحليل تلقائي: ${detectedPatterns.map(p => p.name).join(", ")}`,
            JSON.stringify(analysis),
            analysis.risk_score,
          ]
        );
        console.log(`[Auto-Analyze] Conversation flagged automatically (risk: ${analysis.risk_score}%, intent: ${analysis.intent_category || "n/a"})`);
      }
    }
    
    return analysis;
  } catch (error) {
    console.error("[Auto-Analyze] Error:", error.message);
    return null;
  }
}

const DEPARTMENTS = {
  admin: { name_ar: "الإدارة", icon: "👑", color: "#D4AF37" },
  support: { name_ar: "الدعم الفني", icon: "🎧", color: "#4CAF50" },
  finance: { name_ar: "المالية", icon: "💰", color: "#2196F3" },
};

router.get("/departments", (req, res) => {
  const departments = Object.entries(DEPARTMENTS).map(([key, value]) => ({
    id: key,
    ...value,
  }));
  res.json(departments);
});

router.get("/conversations", authMiddlewareWithEmailCheck, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { status } = req.query;

  let query = `
    SELECT 
      c.*,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.is_read = FALSE AND m.sender_type = 'admin') as unread_count
    FROM conversations c
    WHERE c.user_id = $1
  `;
  const params = [userId];

  if (status && status !== "all") {
    query += ` AND c.status = $2`;
    params.push(status);
  }

  query += ` ORDER BY c.last_message_at DESC`;

  const result = await db.query(query, params);

  const conversations = result.rows.map((conv) => ({
    ...conv,
    department_info: DEPARTMENTS[conv.department] || DEPARTMENTS.support,
  }));

  res.json(conversations);
}));

router.post("/conversations", authMiddlewareWithEmailCheck, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { department, subject, message } = req.body;

  if (!department || !DEPARTMENTS[department]) {
    return res.status(400).json({ error: "يرجى اختيار قسم صحيح" });
  }
  if (!subject || !subject.trim()) {
    return res.status(400).json({ error: "يرجى إدخال موضوع الرسالة" });
  }
  if (!message || !message.trim()) {
    return res.status(400).json({ error: "يرجى إدخال نص الرسالة" });
  }

  const convResult = await db.query(
    `INSERT INTO conversations (user_id, department, subject, status, created_at, updated_at, last_message_at)
     VALUES ($1, $2, $3, 'open', NOW(), NOW(), NOW())
     RETURNING *`,
    [userId, department, subject.trim()]
  );
  const conversation = convResult.rows[0];

  const userResult = await db.query(
    "SELECT name, email FROM users WHERE id = $1",
    [userId]
  );
  const userName = userResult.rows[0]?.name || userResult.rows[0]?.email || "مستخدم";

  await db.query(
    `INSERT INTO messages (conversation_id, sender_type, sender_id, sender_name, content, is_read, created_at)
     VALUES ($1, 'user', $2, $3, $4, FALSE, NOW())`,
    [conversation.id, userId, userName, message.trim()]
  );

  res.json({
    ...conversation,
    department_info: DEPARTMENTS[department],
  });
}));

router.get("/conversations/:id", authMiddlewareWithEmailCheck, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const conversationId = req.params.id;

  const convResult = await db.query(
    `SELECT * FROM conversations WHERE id = $1 AND user_id = $2`,
    [conversationId, userId]
  );

  if (convResult.rows.length === 0) {
    return res.status(404).json({ error: "المحادثة غير موجودة" });
  }

  const conversation = convResult.rows[0];

  const messagesResult = await db.query(
    `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
    [conversationId]
  );

  await db.query(
    `UPDATE messages SET is_read = TRUE 
     WHERE conversation_id = $1 AND sender_type = 'admin' AND is_read = FALSE`,
    [conversationId]
  );

  res.json({
    ...conversation,
    department_info: DEPARTMENTS[conversation.department] || DEPARTMENTS.support,
    messages: messagesResult.rows,
  });
}));

router.post("/conversations/:id/messages", authMiddlewareWithEmailCheck, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const conversationId = req.params.id;
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: "يرجى إدخال نص الرسالة" });
  }

  const convResult = await db.query(
    `SELECT * FROM conversations WHERE id = $1 AND user_id = $2`,
    [conversationId, userId]
  );

  if (convResult.rows.length === 0) {
    return res.status(404).json({ error: "المحادثة غير موجودة" });
  }

  const userResult = await db.query(
    "SELECT name, email FROM users WHERE id = $1",
    [userId]
  );
  const userName = userResult.rows[0]?.name || userResult.rows[0]?.email || "مستخدم";

  const msgResult = await db.query(
    `INSERT INTO messages (conversation_id, sender_type, sender_id, sender_name, content, is_read, created_at)
     VALUES ($1, 'user', $2, $3, $4, FALSE, NOW())
     RETURNING *`,
    [conversationId, userId, userName, content.trim()]
  );

  await db.query(
    `UPDATE conversations SET last_message_at = NOW(), updated_at = NOW(), status = 'open' WHERE id = $1`,
    [conversationId]
  );

  res.json(msgResult.rows[0]);
}));

router.get("/unread-count", authMiddlewareWithEmailCheck, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const result = await db.query(
    `SELECT COUNT(*) as count 
     FROM messages m 
     JOIN conversations c ON m.conversation_id = c.id 
     WHERE c.user_id = $1 AND m.sender_type = 'admin' AND m.is_read = FALSE`,
    [userId]
  );

  res.json({ count: parseInt(result.rows[0].count) || 0 });
}));

router.get("/customer-messages-unread-count", authMiddlewareWithEmailCheck, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const result = await db.query(
    `SELECT COUNT(*) as count 
     FROM listing_messages lm
     WHERE lm.recipient_id = $1 AND lm.is_read = FALSE`,
    [userId]
  );

  res.json({ count: parseInt(result.rows[0].count) || 0 });
}));

router.patch("/conversations/:id/close", authMiddlewareWithEmailCheck, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const conversationId = req.params.id;

  const result = await db.query(
    `UPDATE conversations SET status = 'closed', updated_at = NOW() 
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [conversationId, userId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "المحادثة غير موجودة" });
  }

  res.json(result.rows[0]);
}));

router.post("/to-advertiser", authMiddlewareWithEmailCheck, asyncHandler(async (req, res) => {
  const senderId = req.user.id;
  const { listingId, recipientId, message } = req.body;

  if (!listingId) {
    return res.status(400).json({ error: "يرجى تحديد الإعلان" });
  }
  
  if (!message?.trim()) {
    return res.status(400).json({ error: "يرجى كتابة رسالتك" });
  }
  
  if (!recipientId) {
    return res.status(400).json({ error: "هذا الإعلان ليس له مالك محدد ولا يمكن مراسلته" });
  }

  const senderResult = await db.query(
    "SELECT id, name, email, role FROM users WHERE id = $1",
    [senderId]
  );
  
  if (senderResult.rows.length === 0) {
    return res.status(401).json({ error: "المستخدم غير موجود" });
  }
  
  const sender = senderResult.rows[0];
  const isAdmin = sender.role && sender.role.includes("admin");
  
  if (!isAdmin) {
    const subscriptionResult = await db.query(
      `SELECT up.id, up.plan_id, p.name_ar as plan_name
       FROM user_plans up
       JOIN plans p ON up.plan_id = p.id
       WHERE up.user_id = $1 
       AND up.status = 'active'
       AND (up.expires_at IS NULL OR up.expires_at > NOW())
       ORDER BY up.created_at DESC
       LIMIT 1`,
      [senderId]
    );
    
    if (subscriptionResult.rows.length === 0) {
      return res.status(403).json({ error: "يجب الاشتراك في إحدى الباقات للتمكن من مراسلة المعلنين" });
    }
  }

  const listingResult = await db.query(
    "SELECT id, title, user_id FROM properties WHERE id = $1",
    [listingId]
  );
  
  if (listingResult.rows.length === 0) {
    return res.status(404).json({ error: "الإعلان غير موجود" });
  }
  
  const listing = listingResult.rows[0];

  if (listing.user_id !== recipientId) {
    return res.status(400).json({ error: "المستلم ليس صاحب الإعلان" });
  }

  if (senderId === recipientId) {
    return res.status(400).json({ error: "لا يمكنك مراسلة نفسك" });
  }

  const recipientResult = await db.query(
    "SELECT id, name, email FROM users WHERE id = $1",
    [recipientId]
  );
  
  if (recipientResult.rows.length === 0) {
    return res.status(404).json({ error: "المعلن غير موجود" });
  }

  const recipient = recipientResult.rows[0];
  const senderName = sender.name || sender.email || "مستخدم";

  // TODO [SUPERHUMAN AI]: Implement Pre-Send Blocking (Wait for AI score before inserting message to DB).
  // TODO [SUPERHUMAN AI]: Implement Vision/OCR for image attachments.

  const msgResult = await db.query(
    `INSERT INTO listing_messages 
     (listing_id, sender_id, recipient_id, sender_name, message, is_read, created_at)
     VALUES ($1, $2, $3, $4, $5, FALSE, NOW())
     RETURNING *`,
    [listingId, senderId, recipientId, senderName, message.trim()]
  );

  try {
    await db.query(
      `INSERT INTO notifications (user_id, type, title, body, payload, status, scheduled_at, sent_at, is_read, created_at)
       VALUES ($1, 'new_inquiry', $2, $3, $4, 'sent', NOW(), NOW(), FALSE, NOW())`,
      [
        recipientId, 
        "رسالة جديدة من مهتم",
        `${senderName} أرسل لك رسالة بخصوص إعلانك: ${listing.title}`,
        JSON.stringify({ listingId, messageId: msgResult.rows[0].id, senderId })
      ]
    );
  } catch (notifErr) {
    console.error("Notification insert error (non-fatal):", notifErr.message);
  }

  autoAnalyzeMessage(senderId, recipientId, listingId, message.trim()).catch(err => {
    console.error("Auto-analyze error (non-fatal):", err.message);
  });

  res.json({ 
    success: true, 
    message: "تم إرسال الرسالة بنجاح",
    data: msgResult.rows[0]
  });
}));

router.get("/listing-inquiries", authMiddlewareWithEmailCheck, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const result = await db.query(
    `SELECT lm.*, p.title as listing_title, u.name as sender_display_name, u.email as sender_email
     FROM listing_messages lm
     JOIN properties p ON lm.listing_id = p.id
     JOIN users u ON lm.sender_id = u.id
     WHERE lm.recipient_id = $1
     ORDER BY lm.created_at DESC`,
    [userId]
  );

  res.json(result.rows);
}));

router.get("/my-sent-inquiries", authMiddlewareWithEmailCheck, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const result = await db.query(
    `SELECT lm.*, p.title as listing_title, u.name as recipient_display_name, u.email as recipient_email
     FROM listing_messages lm
     JOIN properties p ON lm.listing_id = p.id
     JOIN users u ON lm.recipient_id = u.id
     WHERE lm.sender_id = $1
     ORDER BY lm.created_at DESC`,
    [userId]
  );

  res.json(result.rows);
}));

router.patch("/listing-inquiries/:id/read", authMiddlewareWithEmailCheck, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const messageId = req.params.id;

  const result = await db.query(
    `UPDATE listing_messages SET is_read = TRUE 
     WHERE id = $1 AND recipient_id = $2 RETURNING *`,
    [messageId, userId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "الرسالة غير موجودة" });
  }

  res.json(result.rows[0]);
}));

router.get("/customer-conversations", authMiddlewareWithEmailCheck, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const result = await db.query(
    `WITH user_conversations AS (
      SELECT 
        CASE 
          WHEN lm.sender_id = $1 THEN lm.recipient_id 
          ELSE lm.sender_id 
        END as other_user_id,
        lm.listing_id,
        MAX(lm.created_at) as last_message_at
      FROM listing_messages lm
      WHERE lm.sender_id = $1 OR lm.recipient_id = $1
      GROUP BY 
        CASE WHEN lm.sender_id = $1 THEN lm.recipient_id ELSE lm.sender_id END,
        lm.listing_id
    )
    SELECT 
      uc.other_user_id || '___' || uc.listing_id as id,
      uc.other_user_id,
      COALESCE(u.name, 'مستخدم محذوف') as other_user_name,
      uc.listing_id,
      COALESCE(p.title, 'إعلان محذوف') as listing_title,
      (SELECT lm2.message FROM listing_messages lm2 
       WHERE ((lm2.sender_id = $1 AND lm2.recipient_id = uc.other_user_id) OR 
              (lm2.recipient_id = $1 AND lm2.sender_id = uc.other_user_id))
       AND lm2.listing_id = uc.listing_id
       ORDER BY lm2.created_at DESC LIMIT 1) as last_message,
      uc.last_message_at,
      (SELECT COUNT(*) FROM listing_messages lm3 
       WHERE lm3.recipient_id = $1 AND lm3.sender_id = uc.other_user_id 
       AND lm3.listing_id = uc.listing_id AND lm3.is_read = FALSE) as unread_count
    FROM user_conversations uc
    LEFT JOIN users u ON uc.other_user_id = u.id
    LEFT JOIN properties p ON uc.listing_id = p.id
    ORDER BY uc.last_message_at DESC`,
    [userId]
  );

  res.json({ conversations: result.rows });
}));

router.get("/customer-conversations/:id", authMiddlewareWithEmailCheck, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const convId = req.params.id;
  const parts = convId.split("___");
  if (parts.length !== 2) {
    return res.status(400).json({ error: "معرف المحادثة غير صحيح" });
  }
  const [otherUserId, listingId] = parts;

  if (!otherUserId || !listingId) {
    return res.status(400).json({ error: "معرف المحادثة غير صحيح" });
  }

  const userResult = await db.query("SELECT name FROM users WHERE id = $1", [otherUserId]);
  const listingResult = await db.query("SELECT title FROM properties WHERE id = $1", [listingId]);

  const messagesResult = await db.query(
    `SELECT 
      lm.id, 
      lm.sender_id, 
      COALESCE(u.name, 'مستخدم محذوف') as sender_name, 
      lm.message as content, 
      lm.created_at,
      CASE WHEN lm.sender_id = $1 THEN TRUE ELSE FALSE END as is_mine
     FROM listing_messages lm
     LEFT JOIN users u ON lm.sender_id = u.id
     WHERE ((lm.sender_id = $1 AND lm.recipient_id = $2) OR (lm.recipient_id = $1 AND lm.sender_id = $2))
     AND lm.listing_id = $3
     ORDER BY lm.created_at ASC`,
    [userId, otherUserId, listingId]
  );

  await db.query(
    `UPDATE listing_messages SET is_read = TRUE 
     WHERE recipient_id = $1 AND sender_id = $2 AND listing_id = $3 AND is_read = FALSE`,
    [userId, otherUserId, listingId]
  );

  res.json({
    id: convId,
    other_user_id: otherUserId,
    other_user_name: userResult.rows[0]?.name || "مستخدم محذوف",
    listing_id: listingId,
    listing_title: listingResult.rows[0]?.title || "إعلان محذوف",
    messages: messagesResult.rows,
  });
}));

router.post("/customer-conversations/:id/reply", authMiddlewareWithEmailCheck, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const convId = req.params.id;
  const { message } = req.body;
  const parts = convId.split("___");
  if (parts.length !== 2) {
    return res.status(400).json({ error: "معرف المحادثة غير صحيح" });
  }
  const [otherUserId, listingId] = parts;

  if (!message?.trim()) {
    return res.status(400).json({ error: "يرجى كتابة رسالتك" });
  }

  if (!otherUserId || !listingId) {
    return res.status(400).json({ error: "معرف المحادثة غير صحيح" });
  }

  const userResult = await db.query("SELECT name, email FROM users WHERE id = $1", [userId]);
  const senderName = userResult.rows[0]?.name || userResult.rows[0]?.email || "مستخدم";

  // TODO [SUPERHUMAN AI]: Implement Pre-Send Blocking (Wait for AI score before inserting message to DB).
  // TODO [SUPERHUMAN AI]: Implement Vision/OCR for image attachments.

  const msgResult = await db.query(
    `INSERT INTO listing_messages 
     (listing_id, sender_id, recipient_id, sender_name, message, is_read, created_at)
     VALUES ($1, $2, $3, $4, $5, FALSE, NOW())
     RETURNING id, sender_id, message as content, created_at`,
    [listingId, userId, otherUserId, senderName, message.trim()]
  );

  const listingResult = await db.query("SELECT title FROM properties WHERE id = $1", [listingId]);

  try {
    await db.query(
      `INSERT INTO notifications (user_id, type, title, body, payload, status, scheduled_at, sent_at, is_read, created_at)
       VALUES ($1, 'new_message', $2, $3, $4, 'sent', NOW(), NOW(), FALSE, NOW())`,
      [
        otherUserId, 
        "رسالة جديدة",
        `${senderName} أرسل لك رسالة بخصوص: ${listingResult.rows[0]?.title}`,
        JSON.stringify({ listingId, messageId: msgResult.rows[0].id, senderId: userId })
      ]
    );
  } catch (notifErr) {
    console.error("Notification error:", notifErr.message);
  }

  autoAnalyzeMessage(userId, otherUserId, listingId, message.trim()).catch(err => {
    console.error("Auto-analyze error (non-fatal):", err.message);
  });

  res.json({
    ...msgResult.rows[0],
    sender_name: senderName,
    is_mine: true,
  });
}));

module.exports = router;
