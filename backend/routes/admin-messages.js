// backend/routes/admin-messages.js - Admin Internal Messaging Routes
const express = require("express");
const router = express.Router();
const db = require("../db");
const { authMiddleware, requireRoles } = require("../middleware/auth");
const { asyncHandler } = require('../middleware/asyncHandler');

// الأقسام المتاحة للمراسلات الداخلية
const ADMIN_DEPARTMENTS = [
  { id: 'general', name_ar: 'عام', icon: '📢', color: '#6366F1' },
  { id: 'finance', name_ar: 'المالية', icon: '💰', color: '#10B981' },
  { id: 'support', name_ar: 'الدعم الفني', icon: '🎧', color: '#3B82F6' },
  { id: 'content', name_ar: 'المحتوى', icon: '📝', color: '#8B5CF6' },
  { id: 'urgent', name_ar: 'عاجل', icon: '🚨', color: '#EF4444' },
];

// الأدوار المسموحة للوصول لكل قسم
const DEPARTMENT_ACCESS = {
  general: ['super_admin', 'finance_admin', 'support_admin', 'content_admin', 'admin'],
  finance: ['super_admin', 'finance_admin', 'admin'],
  support: ['super_admin', 'support_admin', 'admin'],
  content: ['super_admin', 'content_admin', 'admin'],
  urgent: ['super_admin', 'admin'],
};

// جلب الأقسام المتاحة حسب دور المستخدم
router.get('/departments', authMiddleware, requireRoles('super_admin', 'finance_admin', 'support_admin', 'content_admin'), asyncHandler(async (req, res) => {
  const userRole = req.user.role;
  const accessibleDepts = ADMIN_DEPARTMENTS.filter(dept => 
    DEPARTMENT_ACCESS[dept.id]?.includes(userRole)
  );
  res.json(accessibleDepts);
}));

// جلب المحادثات الداخلية
router.get('/conversations', authMiddleware, requireRoles('super_admin', 'finance_admin', 'support_admin', 'content_admin'), asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;

  // جلب المحادثات التي المستخدم مشارك فيها أو من قسمه
  const result = await db.query(`
    SELECT DISTINCT ON (ac.id)
      ac.*,
      u.name as creator_name,
      u.role as creator_role,
      (
        SELECT COUNT(*) FROM admin_messages am 
        WHERE am.conversation_id = ac.id 
        AND am.sender_id != $1
        AND NOT (am.read_by @> $2::jsonb)
      ) as unread_count,
      (
        SELECT COUNT(*) FROM admin_messages am 
        WHERE am.conversation_id = ac.id 
        AND am.sender_id != $1
        AND am.created_at > COALESCE(
          (SELECT MAX(am2.created_at) FROM admin_messages am2 
           WHERE am2.conversation_id = ac.id AND am2.sender_id = $1), 
          '1970-01-01'::timestamp
        )
      ) as awaiting_reply_count,
      (
        SELECT json_agg(json_build_object(
          'user_id', acp2.user_id,
          'name', u2.name,
          'role', u2.role
        ))
        FROM admin_conversation_participants acp2
        JOIN users u2 ON acp2.user_id = u2.id
        WHERE acp2.conversation_id = ac.id
      ) as participants,
      (
        SELECT json_build_object(
          'content', am2.content,
          'sender_id', am2.sender_id,
          'sender_name', u3.name,
          'created_at', am2.created_at
        )
        FROM admin_messages am2
        LEFT JOIN users u3 ON am2.sender_id = u3.id
        WHERE am2.conversation_id = ac.id
        ORDER BY am2.created_at DESC
        LIMIT 1
      ) as last_message
    FROM admin_conversations ac
    LEFT JOIN users u ON ac.created_by = u.id
    LEFT JOIN admin_conversation_participants acp ON ac.id = acp.conversation_id
    WHERE acp.user_id = $1
      OR ac.created_by = $1
      OR (ac.department = ANY($3) AND $4 IN ('super_admin', 'admin'))
    ORDER BY ac.id, ac.last_message_at DESC
  `, [userId, JSON.stringify([userId]), Object.keys(DEPARTMENT_ACCESS), userRole]);

  // إضافة معلومات القسم والتمييز بين المرسل والمستلم
  const conversations = result.rows.map(conv => {
    const userIdNum = Number(userId);
    const otherParticipants = (conv.participants || []).filter(p => Number(p.user_id) !== userIdNum);
    const initiatedByMe = Number(conv.created_by) === userIdNum;
    const lastMessageByMe = conv.last_message ? Number(conv.last_message.sender_id) === userIdNum : false;
    
    return {
      ...conv,
      department_info: ADMIN_DEPARTMENTS.find(d => d.id === conv.department),
      other_participants: otherParticipants,
      initiated_by_me: initiatedByMe,
      last_message_by_me: lastMessageByMe,
    };
  });

  res.json(conversations);
}));

// إنشاء محادثة جديدة
router.post('/conversations', authMiddleware, requireRoles('super_admin', 'finance_admin', 'support_admin', 'content_admin'), asyncHandler(async (req, res) => {
  const { department, subject, message, participants } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;

  // التحقق من صلاحية الوصول للقسم
  if (!DEPARTMENT_ACCESS[department]?.includes(userRole)) {
    return res.status(403).json({ error: 'ليس لديك صلاحية للإرسال لهذا القسم' });
  }

  // جلب اسم المرسل
  const userResult = await db.query('SELECT name FROM users WHERE id = $1', [userId]);
  const senderName = userResult.rows[0]?.name || 'مستخدم';

  // إنشاء المحادثة
  const convResult = await db.query(`
    INSERT INTO admin_conversations (created_by, department, subject)
    VALUES ($1, $2, $3)
    RETURNING *
  `, [userId, department, subject]);

  const conversationId = convResult.rows[0].id;

  // إضافة المنشئ كمشارك
  await db.query(`
    INSERT INTO admin_conversation_participants (conversation_id, user_id, role)
    VALUES ($1, $2, $3)
  `, [conversationId, userId, userRole]);

  // إضافة المشاركين الآخرين (إن وجدوا)
  if (participants && participants.length > 0) {
    for (const participantId of participants) {
      const pResult = await db.query('SELECT role FROM users WHERE id = $1', [participantId]);
      if (pResult.rows.length > 0) {
        await db.query(`
          INSERT INTO admin_conversation_participants (conversation_id, user_id, role)
          VALUES ($1, $2, $3)
          ON CONFLICT (conversation_id, user_id) DO NOTHING
        `, [conversationId, participantId, pResult.rows[0].role]);
      }
    }
  }

  // إضافة الرسالة الأولى
  await db.query(`
    INSERT INTO admin_messages (conversation_id, sender_id, sender_role, content)
    VALUES ($1, $2, $3, $4)
  `, [conversationId, userId, userRole, message]);

  const conversation = {
    ...convResult.rows[0],
    department_info: ADMIN_DEPARTMENTS.find(d => d.id === department),
    creator_name: senderName,
  };

  res.status(201).json(conversation);
}));

// جلب محادثة مع رسائلها
router.get('/conversations/:id', authMiddleware, requireRoles('super_admin', 'finance_admin', 'support_admin', 'content_admin'), asyncHandler(async (req, res) => {
  const conversationId = req.params.id;
  const userId = req.user.id;

  // جلب المحادثة
  const convResult = await db.query(`
    SELECT ac.*, u.name as creator_name, u.role as creator_role
    FROM admin_conversations ac
    LEFT JOIN users u ON ac.created_by = u.id
    WHERE ac.id = $1
  `, [conversationId]);

  if (convResult.rows.length === 0) {
    return res.status(404).json({ error: 'المحادثة غير موجودة' });
  }

  // جلب الرسائل
  const messagesResult = await db.query(`
    SELECT am.*, u.name as sender_name
    FROM admin_messages am
    LEFT JOIN users u ON am.sender_id = u.id
    WHERE am.conversation_id = $1
    ORDER BY am.created_at ASC
  `, [conversationId]);

  // تحديث حالة القراءة
  await db.query(`
    UPDATE admin_messages 
    SET read_by = read_by || $1::jsonb
    WHERE conversation_id = $2 AND sender_id != $3
    AND NOT (read_by @> $1::jsonb)
  `, [JSON.stringify([userId]), conversationId, userId]);

  // جلب المشاركين
  const participantsResult = await db.query(`
    SELECT acp.*, u.name, u.email
    FROM admin_conversation_participants acp
    LEFT JOIN users u ON acp.user_id = u.id
    WHERE acp.conversation_id = $1
  `, [conversationId]);

  const conversation = {
    ...convResult.rows[0],
    department_info: ADMIN_DEPARTMENTS.find(d => d.id === convResult.rows[0].department),
    messages: messagesResult.rows,
    participants: participantsResult.rows,
  };

  res.json(conversation);
}));

// إرسال رد
router.post('/conversations/:id/messages', authMiddleware, requireRoles('super_admin', 'finance_admin', 'support_admin', 'content_admin'), asyncHandler(async (req, res) => {
  const conversationId = req.params.id;
  const { content } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;

  // جلب اسم المرسل
  const userResult = await db.query('SELECT name FROM users WHERE id = $1', [userId]);
  const senderName = userResult.rows[0]?.name || 'مستخدم';

  // إضافة الرسالة
  const result = await db.query(`
    INSERT INTO admin_messages (conversation_id, sender_id, sender_role, content)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [conversationId, userId, userRole, content]);

  // تحديث وقت آخر رسالة
  await db.query(`
    UPDATE admin_conversations SET last_message_at = NOW(), updated_at = NOW()
    WHERE id = $1
  `, [conversationId]);

  // إضافة المرسل كمشارك إن لم يكن
  await db.query(`
    INSERT INTO admin_conversation_participants (conversation_id, user_id, role)
    VALUES ($1, $2, $3)
    ON CONFLICT (conversation_id, user_id) DO NOTHING
  `, [conversationId, userId, userRole]);

  res.status(201).json({
    ...result.rows[0],
    sender_name: senderName,
  });
}));

// عدد الرسائل غير المقروءة
router.get('/unread-count', authMiddleware, requireRoles('super_admin', 'finance_admin', 'support_admin', 'content_admin'), asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const result = await db.query(`
    SELECT COUNT(*) as count
    FROM admin_messages am
    JOIN admin_conversation_participants acp ON am.conversation_id = acp.conversation_id
    WHERE acp.user_id = $1
    AND am.sender_id != $1
    AND NOT (am.read_by @> $2::jsonb)
  `, [userId, JSON.stringify([userId])]);

  res.json({ count: parseInt(result.rows[0]?.count) || 0 });
}));

// جلب قائمة المدراء حسب القسم
router.get('/admins', authMiddleware, requireRoles('super_admin', 'finance_admin', 'support_admin', 'content_admin'), asyncHandler(async (req, res) => {
  const { department } = req.query;
  const userRole = req.user.role;
  const userId = req.user.id;

  let roleFilter = ['super_admin', 'finance_admin', 'support_admin', 'content_admin', 'admin'];
  
  if (department && DEPARTMENT_ACCESS[department]) {
    roleFilter = DEPARTMENT_ACCESS[department];
  }

  const result = await db.query(`
    SELECT id, name, email, role
    FROM users
    WHERE role = ANY($1)
    AND id != $2
    ORDER BY 
      CASE role 
        WHEN 'super_admin' THEN 1
        WHEN 'admin' THEN 2
        WHEN 'finance_admin' THEN 3
        WHEN 'support_admin' THEN 4
        WHEN 'content_admin' THEN 5
        ELSE 6
      END
  `, [roleFilter, userId]);

  res.json(result.rows);
}));

module.exports = router;
