const db = require('../db');

const deleteUserCascade = async (userId) => {
  await db.query("DELETE FROM favorites WHERE user_id = $1", [userId]);
  await db.query("DELETE FROM notifications WHERE user_id = $1", [userId]);
  await db.query("DELETE FROM user_plans WHERE user_id = $1", [userId]);
  await db.query("DELETE FROM membership_requests WHERE user_id = $1", [userId]);
  await db.query("DELETE FROM users WHERE id = $1", [userId]);
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
