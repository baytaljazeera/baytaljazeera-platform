const db = require('../db');

const deleteUserCascade = async (userId, adminId = null) => {
  const safeDelete = async (query, params) => {
    try {
      await db.query(query, params);
    } catch (err) {
      if (!err.message?.includes('does not exist')) {
        console.warn(`[UserService] Warning during cascade delete: ${err.message}`);
      }
    }
  };
  
  // 🔒 Security: Get user email BEFORE deletion to ban it
  const userResult = await db.query('SELECT email, google_id FROM users WHERE id = $1', [userId]);
  const userEmail = userResult.rows[0]?.email;
  const googleId = userResult.rows[0]?.google_id;
  
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
  await db.query("DELETE FROM users WHERE id = $1", [userId]);
  
  // 🔒 Security: Add email to banned list to prevent re-registration
  if (userEmail) {
    try {
      await db.query(
        `INSERT INTO banned_emails (email, google_id, reason, banned_by, banned_at)
         VALUES ($1, $2, 'deleted_by_admin', $3, NOW())
         ON CONFLICT (email) DO UPDATE SET 
           google_id = COALESCE($2, banned_emails.google_id),
           banned_by = $3,
           banned_at = NOW()`,
        [userEmail.toLowerCase(), googleId, adminId]
      );
      console.log(`🔒 [UserService] Email ${userEmail} added to banned list`);
    } catch (banErr) {
      console.warn(`[UserService] Could not ban email: ${banErr.message}`);
    }
  }
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
