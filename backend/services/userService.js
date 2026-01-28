const db = require('../db');

const deleteUserCascade = async (userId, options = {}) => {
  const { banEmail = true } = options;
  
  const safeDelete = async (query, params) => {
    try {
      await db.query(query, params);
    } catch (err) {
      if (!err.message?.includes('does not exist')) {
        console.warn(`[UserService] Warning during cascade delete: ${err.message}`);
      }
    }
  };
  
  // Get user email before deletion for ban list
  const userResult = await db.query("SELECT email FROM users WHERE id = $1", [userId]);
  const userEmail = userResult.rows[0]?.email;
  
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
  
  // Add email to banned list to prevent re-registration
  if (banEmail && userEmail) {
    try {
      await db.query(
        `INSERT INTO banned_emails (email, reason, banned_at) 
         VALUES ($1, 'deleted_by_admin', NOW()) 
         ON CONFLICT (email) DO NOTHING`,
        [userEmail.toLowerCase()]
      );
      console.log(`🚫 [UserService] Email ${userEmail} added to ban list`);
    } catch (err) {
      // Table might not exist yet, that's ok
      if (!err.message?.includes('does not exist')) {
        console.warn(`[UserService] Could not add email to ban list: ${err.message}`);
      }
    }
  }
};

const isEmailBanned = async (email) => {
  try {
    const result = await db.query(
      "SELECT 1 FROM banned_emails WHERE email = $1 LIMIT 1",
      [email.toLowerCase()]
    );
    return result.rows.length > 0;
  } catch (err) {
    // Table might not exist
    return false;
  }
};

const unbanEmail = async (email) => {
  try {
    await db.query("DELETE FROM banned_emails WHERE email = $1", [email.toLowerCase()]);
    return true;
  } catch (err) {
    return false;
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
  updateUserStatus,
  isEmailBanned,
  unbanEmail
};
