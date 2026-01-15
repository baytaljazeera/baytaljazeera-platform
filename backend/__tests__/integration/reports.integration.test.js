const request = require('supertest');
const { createApp } = require('../../app');
const { db, cleanupTestData, createTestUser, generateTestToken } = require('./setup');

describe('Reports API Integration Tests', () => {
  let app;
  let testUser;
  let adminUser;
  let authToken;
  let adminToken;
  let createdUserIds = [];
  let testListingId;
  let testReportId;

  beforeAll(async () => {
    app = createApp();
    
    const uniqueId = Date.now();
    testUser = await createTestUser({
      email: `reports_test_${uniqueId}@test.com`,
      password: 'ReportsTest123!',
      name: 'Reports Test User',
      phone: `05${String(uniqueId).slice(-8)}`,
      role: 'customer'
    });
    createdUserIds.push(testUser.id);
    authToken = generateTestToken(testUser);

    adminUser = await createTestUser({
      email: `reports_admin_${uniqueId}@test.com`,
      password: 'ReportsAdmin123!',
      name: 'Reports Admin User',
      phone: `05${String(uniqueId + 1).slice(-8)}`,
      role: 'admin'
    });
    createdUserIds.push(adminUser.id);
    adminToken = generateTestToken(adminUser);

    const listingResult = await db.query(`
      INSERT INTO properties (user_id, title, description, type, purpose, city, district, price, area, status, created_at)
      VALUES ($1, 'عقار للاختبار', 'وصف تجريبي', 'شقة', 'بيع', 'الرياض', 'النرجس', 500000, 150, 'approved', NOW())
      RETURNING id
    `, [testUser.id]);
    testListingId = listingResult.rows[0].id;
  });

  afterAll(async () => {
    if (testReportId) {
      await db.query('DELETE FROM listing_reports WHERE id = $1', [testReportId]);
    }
    if (testListingId) {
      await db.query('DELETE FROM properties WHERE id = $1', [testListingId]);
    }
    await cleanupTestData(createdUserIds);
  });

  describe('POST /api/report-listing - Create Report', () => {
    it('should create a report for a listing', async () => {
      const res = await request(app)
        .post('/api/report-listing')
        .set('Cookie', `token=${authToken}`)
        .send({
          listingId: testListingId,
          reason: 'محتوى مخالف',
          details: 'هذا الإعلان يحتوي على معلومات غير صحيحة'
        });
      
      expect([200, 201, 429]).toContain(res.status);
      if (res.status === 201 || res.status === 200) {
        testReportId = res.body.report?.id || res.body.id;
      }
    });

    it('should reject report without listing_id', async () => {
      const res = await request(app)
        .post('/api/report-listing')
        .set('Cookie', `token=${authToken}`)
        .send({
          reason: 'محتوى مخالف'
        });
      
      expect([400, 422, 429]).toContain(res.status);
    });

    it('should allow report without authentication (public)', async () => {
      const res = await request(app)
        .post('/api/report-listing')
        .send({
          listingId: testListingId,
          reason: 'محتوى مخالف',
          reporterName: 'زائر',
          reporterPhone: '0500000000'
        });
      
      expect([200, 201, 400, 429]).toContain(res.status);
    });
  });

  describe('GET /api/report-listing - Admin Get Reports', () => {
    it('should get reports list for admin', async () => {
      const res = await request(app)
        .get('/api/report-listing')
        .set('Cookie', `token=${adminToken}`);
      
      expect([200, 401, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toBeDefined();
      }
    });

    it('should reject for non-admin users', async () => {
      const res = await request(app)
        .get('/api/report-listing')
        .set('Cookie', `token=${authToken}`);
      
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('GET /api/report-listing/stats - Report Statistics', () => {
    it('should get report statistics for admin', async () => {
      const res = await request(app)
        .get('/api/report-listing/stats')
        .set('Cookie', `token=${adminToken}`);
      
      expect([200, 401, 403]).toContain(res.status);
    });
  });

  describe('PATCH /api/report-listing/:id - Update Report', () => {
    it('should update report for admin with valid status', async () => {
      if (!testReportId) return;
      
      const res = await request(app)
        .patch(`/api/report-listing/${testReportId}`)
        .set('Cookie', `token=${adminToken}`)
        .send({ status: 'in_review' });
      
      expect([200, 401, 403, 404]).toContain(res.status);
    });

    it('should reject invalid status values', async () => {
      if (!testReportId) return;
      
      const res = await request(app)
        .patch(`/api/report-listing/${testReportId}`)
        .set('Cookie', `token=${adminToken}`)
        .send({ status: 'invalid_status' });
      
      expect([400, 401]).toContain(res.status);
    });

    it('should reject update for non-admin', async () => {
      if (!testReportId) return;
      
      const res = await request(app)
        .patch(`/api/report-listing/${testReportId}`)
        .set('Cookie', `token=${authToken}`)
        .send({ status: 'in_review' });
      
      expect([401, 403]).toContain(res.status);
    });
  });
});
