const db = require('../db');

const deleteUserCascade = async (userId) => {
  const safeDelete = async (query, params) => {
    try {
      await db.query(query, params);
    } catch (err) {
      if (!err.message?.includes('does not exist')) {
        console.warn(`[UserService] Warning during cascade delete: ${err.message}`);
      }
    }
  };
  
  // حذف جميع البيانات المرتبطة بالمستخدم
  await safeDelete("DELETE FROM email_verification_tokens WHERE user_id = $1", [userId]);
  await safeDelete("DELETE FROM email_verifications WHERE user_id = $1", [userId]);
  await safeDelete("DELETE FROM password_reset_tokens WHERE user_id = $1", [userId]);
  await safeDelete("DELETE FROM favorites WHERE user_id = $1", [userId]);
  await safeDelete("DELETE FROM notifications WHERE user_id = $1", [userId]);
  await safeDelete("DELETE FROM user_plans WHERE user_id = $1", [userId]);
  await safeDelete("DELETE FROM quota_buckets WHERE user_id = $1", [userId]);
  await safeDelete("DELETE FROM membership_requests WHERE user_id = $1", [userId]);
  await safeDelete("DELETE FROM listing_inquiries WHERE sender_id = $1 OR recipient_id = $1", [userId]);
  await safeDelete("DELETE FROM referrals WHERE referrer_id = $1 OR referred_id = $1", [userId]);
  await safeDelete("UPDATE properties SET user_id = NULL WHERE user_id = $1", [userId]);
  
  // حذف المستخدم نهائياً - يستطيع التسجيل من جديد
  await db.query("DELETE FROM users WHERE id = $1", [userId]);
  console.log(`✅ [UserService] User ${userId} deleted completely - can re-register`);
};

const getUserById = async (userId) => {
  const result = await db.query("SELECT * FROM users WHERE id = $1", [userId]);
  return result.rows[0] || null;
};

const updateUserRole = async (userId, role) => {
  const result = await db.query(
    "UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, email, role",
    [role, userId]
  );
  return result.rows[0] || null;
};

const updateUserStatus = async (userId, status) => {
  const result = await db.query(
    "UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, email, status",
    [status, userId]
  );
  return result.rows[0] || null;
};

module.exports = {
  deleteUserCascade,
  getUserById,
  updateUserRole,
  updateUserStatus
};
