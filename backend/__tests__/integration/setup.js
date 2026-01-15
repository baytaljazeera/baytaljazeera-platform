// Integration Test Setup - Real Database Connection

const db = require('../../db');

// Test user data
const testUsers = {
  customer: {
    email: `test_customer_${Date.now()}@test.com`,
    password: 'Test123!@#',
    name: 'عميل تجريبي',
    phone: '0501234567',
    role: 'customer'
  },
  admin: {
    email: `test_admin_${Date.now()}@test.com`,
    password: 'Admin123!@#',
    name: 'مدير تجريبي',
    phone: '0509876543',
    role: 'admin'
  }
};

// Cleanup function to remove test data
async function cleanupTestData(userIds = []) {
  try {
    for (const userId of userIds) {
      // Delete in correct order respecting foreign keys
      await db.query('DELETE FROM notifications WHERE user_id = $1', [userId]);
      await db.query('DELETE FROM favorites WHERE user_id = $1', [userId]);
      await db.query('DELETE FROM properties WHERE user_id = $1', [userId]);
      await db.query('DELETE FROM user_plans WHERE user_id = $1', [userId]);
      await db.query('DELETE FROM quota_buckets WHERE user_id = $1', [userId]);
      await db.query('DELETE FROM users WHERE id = $1', [userId]);
    }
  } catch (error) {
    console.error('Cleanup error:', error.message);
  }
}

// Create test user directly in database
async function createTestUser(userData) {
  const bcrypt = require('bcrypt');
  const hashedPassword = await bcrypt.hash(userData.password, 10);
  
  const result = await db.query(`
    INSERT INTO users (email, password_hash, name, phone, role, status, created_at)
    VALUES ($1, $2, $3, $4, $5, 'active', NOW())
    RETURNING id, email, name, role
  `, [userData.email, hashedPassword, userData.name, userData.phone, userData.role]);
  
  return result.rows[0];
}

// Generate auth token for test user
function generateTestToken(user) {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.SESSION_SECRET || 'test-secret-key',
    { expiresIn: '1h' }
  );
}

// Close database connection after tests
async function closeDatabase() {
  try {
    await db.end();
  } catch (error) {
    // Pool already closed
  }
}

module.exports = {
  db,
  testUsers,
  cleanupTestData,
  createTestUser,
  generateTestToken,
  closeDatabase
};
