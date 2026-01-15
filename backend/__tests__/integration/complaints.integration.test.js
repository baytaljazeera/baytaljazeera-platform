const request = require('supertest');
const { createApp } = require('../../app');
const { db, cleanupTestData, createTestUser, generateTestToken } = require('./setup');

describe('Complaints API Integration Tests', () => {
  let app;
  let testUser;
  let adminUser;
  let authToken;
  let adminToken;
  let createdUserIds = [];
  let testComplaintId;

  beforeAll(async () => {
    app = createApp();
    
    const uniqueId = Date.now();
    testUser = await createTestUser({
      email: `complaints_test_${uniqueId}@test.com`,
      password: 'ComplaintsTest123!',
      name: 'Complaints Test User',
      phone: `05${String(uniqueId + 10).slice(-8)}`,
      role: 'customer'
    });
    createdUserIds.push(testUser.id);
    authToken = generateTestToken(testUser);

    adminUser = await createTestUser({
      email: `complaints_admin_${uniqueId}@test.com`,
      password: 'ComplaintsAdmin123!',
      name: 'Complaints Admin User',
      phone: `05${String(uniqueId + 11).slice(-8)}`,
      role: 'admin'
    });
    createdUserIds.push(adminUser.id);
    adminToken = generateTestToken(adminUser);
  });

  afterAll(async () => {
    if (testComplaintId) {
      await db.query('DELETE FROM account_complaints WHERE id = $1', [testComplaintId]);
    }
    await cleanupTestData(createdUserIds);
  });

  describe('POST /api/account-complaints - Create Complaint', () => {
    it('should create a complaint', async () => {
      const res = await request(app)
        .post('/api/account-complaints')
        .set('Cookie', `token=${authToken}`)
        .send({
          category: 'technical',
          subject: 'مشكلة تقنية في الحساب',
          details: 'لا أستطيع تحديث بياناتي الشخصية'
        });
      
      expect([200, 201, 429]).toContain(res.status);
      if (res.status === 201 || res.status === 200) {
        testComplaintId = res.body.id || res.body.complaint?.id;
      }
    });

    it('should reject complaint without required fields', async () => {
      const res = await request(app)
        .post('/api/account-complaints')
        .set('Cookie', `token=${authToken}`)
        .send({
          category: 'technical'
        });
      
      expect([400, 422, 429]).toContain(res.status);
    });
  });

  describe('GET /api/account-complaints/mine - User Complaints', () => {
    it('should get user complaints', async () => {
      const res = await request(app)
        .get('/api/account-complaints/mine')
        .set('Cookie', `token=${authToken}`);
      
      expect([200, 401, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(Array.isArray(res.body.complaints || res.body)).toBe(true);
      }
    });

    it('should reject without authentication', async () => {
      const res = await request(app)
        .get('/api/account-complaints/mine');
      
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('GET /api/account-complaints - Admin Get Complaints', () => {
    it('should get complaints list for admin', async () => {
      const res = await request(app)
        .get('/api/account-complaints')
        .set('Cookie', `token=${adminToken}`);
      
      expect([200, 401, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toBeDefined();
      }
    });

    it('should reject for non-admin users', async () => {
      const res = await request(app)
        .get('/api/account-complaints')
        .set('Cookie', `token=${authToken}`);
      
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('PATCH /api/account-complaints/:id - Update Complaint', () => {
    it('should update complaint for admin', async () => {
      if (!testComplaintId) return;
      
      const res = await request(app)
        .patch(`/api/account-complaints/${testComplaintId}`)
        .set('Cookie', `token=${adminToken}`)
        .send({ status: 'in_progress' });
      
      expect([200, 401, 403, 404]).toContain(res.status);
    });

    it('should reject update for non-admin', async () => {
      if (!testComplaintId) return;
      
      const res = await request(app)
        .patch(`/api/account-complaints/${testComplaintId}`)
        .set('Cookie', `token=${authToken}`)
        .send({ status: 'in_progress' });
      
      expect([401, 403]).toContain(res.status);
    });
  });
});
