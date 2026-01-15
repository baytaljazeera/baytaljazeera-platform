const pool = require('../db');

class AuthStorage {
  async getUser(id) {
    const result = await pool.query(
      'SELECT * FROM replit_users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async upsertUser(userData) {
    const { id, email, firstName, lastName, profileImageUrl } = userData;
    
    const result = await pool.query(`
      INSERT INTO replit_users (id, email, first_name, last_name, profile_image_url, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        profile_image_url = EXCLUDED.profile_image_url,
        updated_at = NOW()
      RETURNING *
    `, [id, email, firstName, lastName, profileImageUrl]);
    
    return result.rows[0];
  }

  async linkToLocalUser(replitUserId, localUserId) {
    await pool.query(`
      UPDATE replit_users 
      SET local_user_id = $1, updated_at = NOW()
      WHERE id = $2
    `, [localUserId, replitUserId]);
  }

  async findLocalUserByEmail(email) {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0] || null;
  }
}

const authStorage = new AuthStorage();

module.exports = { authStorage };
