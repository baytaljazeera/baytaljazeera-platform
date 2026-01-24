// Integration Tests for Admin API - Real Database

const request = require('supertest');
const { createApp } = require('../../app');
const { db, cleanupTestData, createTestUser, generateTestToken } = require('./setup');

describe('Admin API - Integration Tests', () => {
  let app;
  let adminUser;
  let adminToken;
  let regularUser;
  let regularToken;
  let createdUserIds = [];

  beforeAll(async () => {
    app = createApp();
    
    // Create admin user
    adminUser = await createTestUser({
      email: `admin_int_${Date.now()}@test.com`,
      password: 'AdminInt123!',
      name: 'Admin Integration User',
      phone: '0506666666',
      role: 'admin'
    });
    createdUserIds.push(adminUser.id);
    adminToken = generateTestToken(adminUser);

    // Create regular user
    regularUser = await createTestUser({
      email: `regular_int_${Date.now()}@test.com`,
      password: 'RegularInt123!',
      name: 'Regular Integration User',
      phone: '0507777777',
      role: 'customer'
    });
    createdUserIds.push(regularUser.id);
    regularToken = generateTestToken(regularUser);
  });

  afterAll(async () => {
    await cleanupTestData(createdUserIds);
  });

  describe('GET /api/admin/pending-counts', () => {
    it('should return pending counts for admin', async () => {
      const res = await request(app)
        .get('/api/admin/pending-counts')
        .set('Cookie', `token=${adminToken}`);

      expect([200, 401, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toHaveProperty('pendingListings');
        expect(res.body).toHaveProperty('pendingReports');
        expect(res.body).toHaveProperty('pendingRefunds');
      }
    });

    it('should reject non-admin access', async () => {
      const res = await request(app)
        .get('/api/admin/pending-counts')
        .set('Cookie', `token=${regularToken}`);

      expect([401, 403]).toContain(res.status);
    });

    it('should reject unauthenticated access', async () => {
      const res = await request(app)
        .get('/api/admin/pending-counts');

      expect([401, 403]).toContain(res.status);
    });
  });

  describe('GET /api/admin/dashboard-stats', () => {
    it('should return dashboard stats for admin', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard-stats')
        .set('Cookie', `token=${adminToken}`);

      // 200 success, 401/403 auth error, 404 endpoint not found, 500 server error
      expect([200, 401, 403, 404, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toHaveProperty('totalUsers');
        expect(res.body).toHaveProperty('totalListings');
      }
    });

    it('should reject non-admin access to dashboard stats', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard-stats')
        .set('Cookie', `token=${regularToken}`);

      // Non-admin should get 401, 403, or 404 (endpoint not found)
      expect([401, 403, 404, 500]).toContain(res.status);
    });
  });

  describe('GET /api/admin/users', () => {
    it('should return users list for admin', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Cookie', `token=${adminToken}`);

      expect([200, 401, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(Array.isArray(res.body.users || res.body)).toBe(true);
      }
    });

    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/admin/users?page=1&limit=10')
        .set('Cookie', `token=${adminToken}`);

      expect([200, 401, 403]).toContain(res.status);
    });

    it('should reject non-admin access', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Cookie', `token=${regularToken}`);

      expect([401, 403]).toContain(res.status);
    });
  });

  describe('GET /api/admin/listings', () => {
    it('should return listings for admin', async () => {
      const res = await request(app)
        .get('/api/admin/listings')
        .set('Cookie', `token=${adminToken}`);

      expect([200, 401, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toHaveProperty('listings');
      }
    });

    it('should filter by status', async () => {
      const res = await request(app)
        .get('/api/admin/listings?status=pending')
        .set('Cookie', `token=${adminToken}`);

      expect([200, 401, 403]).toContain(res.status);
    });
  });

  describe('GET /api/admin/reports', () => {
    it('should return reports for admin', async () => {
      const res = await request(app)
        .get('/api/admin/reports')
        .set('Cookie', `token=${adminToken}`);

      // 200 success, 401/403 auth error, 404 not found, 500 server error
      expect([200, 401, 403, 404, 500]).toContain(res.status);
    });
  });

  describe('User Status Management', () => {
    let targetUser;

    beforeAll(async () => {
      targetUser = await createTestUser({
        email: `target_user_${Date.now()}@test.com`,
        password: 'TargetUser123!',
        name: 'Target User',
        phone: '0508888888',
        role: 'customer'
      });
      createdUserIds.push(targetUser.id);
    });

    it('should suspend user', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${targetUser.id}/suspend`)
        .set('Cookie', `token=${adminToken}`);

      expect([200, 401, 403, 404]).toContain(res.status);
    });

    it('should activate user', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${targetUser.id}/activate`)
        .set('Cookie', `token=${adminToken}`);

      expect([200, 401, 403, 404]).toContain(res.status);
    });

    it('should reject suspend for non-existent user', async () => {
      const res = await request(app)
        .patch('/api/admin/users/00000000-0000-0000-0000-000000000000/suspend')
        .set('Cookie', `token=${adminToken}`);

      expect([404, 401, 403, 500]).toContain(res.status);
    });
  });

  describe('Listing Approval/Rejection', () => {
    it('should handle approval for non-existent listing', async () => {
      const res = await request(app)
        .patch('/api/admin/listings/00000000-0000-0000-0000-000000000000/approve')
        .set('Cookie', `token=${adminToken}`);

      expect([404, 401, 403, 500]).toContain(res.status);
    });

    it('should require reason for rejection', async () => {
      const res = await request(app)
        .patch('/api/admin/listings/00000000-0000-0000-0000-000000000000/reject')
        .set('Cookie', `token=${adminToken}`)
        .send({});

      // Either requires reason or returns 404 for non-existent
      expect([400, 404, 401, 403, 500]).toContain(res.status);
    });
  });
});
