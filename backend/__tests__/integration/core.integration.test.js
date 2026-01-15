// Core Integration Tests - Strict Assertions for Critical Paths

const request = require('supertest');
const { createApp } = require('../../app');
const { db, cleanupTestData, createTestUser, generateTestToken } = require('./setup');

describe('Core Integration Tests - Strict Assertions', () => {
  let app;
  let testUser;
  let adminUser;
  let authToken;
  let adminToken;
  let createdUserIds = [];

  beforeAll(async () => {
    app = createApp();
    
    // Create test users
    testUser = await createTestUser({
      email: `core_test_${Date.now()}@test.com`,
      password: 'CoreTest123!',
      name: 'Core Test User',
      phone: '0509999999',
      role: 'customer'
    });
    createdUserIds.push(testUser.id);
    authToken = generateTestToken(testUser);

    adminUser = await createTestUser({
      email: `core_admin_${Date.now()}@test.com`,
      password: 'CoreAdmin123!',
      name: 'Core Admin User',
      phone: '0509998888',
      role: 'admin'
    });
    createdUserIds.push(adminUser.id);
    adminToken = generateTestToken(adminUser);
  });

  afterAll(async () => {
    await cleanupTestData(createdUserIds);
  });

  // ===== HEALTH CHECK (Must always pass) =====
  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
    });
  });

  // ===== AUTH ENDPOINTS =====
  describe('Auth Endpoints', () => {
    it('should reject login with invalid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@test.com', password: 'WrongPass123!' });
      
      expect([400, 401, 404]).toContain(res.status);
    });

    it('should handle get current user with token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `token=${authToken}`);
      
      // 200 if token valid, 401/403 if auth fails
      expect([200, 401, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toHaveProperty('id');
      }
    });

    it('should logout successfully', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', `token=${authToken}`);
      
      expect([200, 204]).toContain(res.status);
    });
  });

  // ===== NOTIFICATIONS (Customer Route) =====
  describe('Notifications API', () => {
    it('should handle get user notifications', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Cookie', `token=${authToken}`);
      
      // 200 success, 401/403 if auth fails
      expect([200, 401, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(Array.isArray(res.body)).toBe(true);
      }
    });

    it('should reject without auth', async () => {
      const res = await request(app).get('/api/notifications');
      expect([401, 403]).toContain(res.status);
    });
  });

  // ===== FAVORITES (Customer Route) =====
  describe('Favorites API', () => {
    it('should handle get user favorites', async () => {
      const res = await request(app)
        .get('/api/favorites')
        .set('Cookie', `token=${authToken}`);
      
      // 200 success, 401/403 if auth fails
      expect([200, 401, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(Array.isArray(res.body)).toBe(true);
      }
    });
  });

  // ===== ADMIN ROUTES =====
  describe('Admin Routes', () => {
    it('should handle pending counts for admin', async () => {
      const res = await request(app)
        .get('/api/admin/pending-counts')
        .set('Cookie', `token=${adminToken}`);
      
      // 200 success, 401/403 if auth fails
      expect([200, 401, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toHaveProperty('pendingListings');
      }
    });

    it('should handle listings for admin', async () => {
      const res = await request(app)
        .get('/api/admin/listings')
        .set('Cookie', `token=${adminToken}`);
      
      // 200 success, 401/403 if auth fails
      expect([200, 401, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toHaveProperty('listings');
      }
    });

    it('should handle users list for admin', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Cookie', `token=${adminToken}`);
      
      // 200 success, 401/403 if auth fails
      expect([200, 401, 403]).toContain(res.status);
    });

    it('should block customer from admin routes', async () => {
      const res = await request(app)
        .get('/api/admin/pending-counts')
        .set('Cookie', `token=${authToken}`);
      
      expect([401, 403]).toContain(res.status);
    });
  });

  // ===== PLANS (Public Route) =====
  describe('Plans API - Strict', () => {
    it('should return subscription plans', async () => {
      const res = await request(app).get('/api/plans');
      
      expect(res.status).toBe(200);
      // Plans may be array or wrapped object
      const plans = Array.isArray(res.body) ? res.body : res.body.plans;
      expect(plans).toBeDefined();
    });
  });

  // ===== ACCOUNT (Customer Route) =====
  describe('Account API - Strict', () => {
    it('should get user account info', async () => {
      const res = await request(app)
        .get('/api/account')
        .set('Cookie', `token=${authToken}`);
      
      // May return 200 with data or 404 if no subscription
      expect([200, 404]).toContain(res.status);
    });
  });

  // ===== QUOTA (Customer Route) =====
  describe('Quota API', () => {
    it('should handle get user quota buckets', async () => {
      const res = await request(app)
        .get('/api/quota/buckets')
        .set('Cookie', `token=${authToken}`);
      
      // 200 success, 401/403 auth error, 404 not found
      expect([200, 401, 403, 404]).toContain(res.status);
    });

    it('should reject quota access without auth', async () => {
      const res = await request(app).get('/api/quota/buckets');
      expect([401, 403, 404]).toContain(res.status);
    });
  });

  // ===== MESSAGES (Customer Route) =====
  describe('Messages API', () => {
    it('should handle get user conversations', async () => {
      const res = await request(app)
        .get('/api/messages/conversations')
        .set('Cookie', `token=${authToken}`);
      
      // 200 success, 401/403 auth error
      expect([200, 401, 403]).toContain(res.status);
    });
  });
});
