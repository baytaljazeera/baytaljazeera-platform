// Integration tests for Admin API
const request = require('supertest');
const express = require('express');

// Create a minimal test app for admin
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Mock admin middleware
  const adminMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'غير مصرح' });
    }
    
    const token = authHeader.split(' ')[1];
    if (token === 'admin-token') {
      req.user = { id: 'admin-id', role: 'admin', role_level: 100 };
      return next();
    }
    if (token === 'user-token') {
      req.user = { id: 'user-id', role: 'user', role_level: 0 };
      return res.status(403).json({ error: 'غير مصرح - إدارة فقط' });
    }
    
    return res.status(401).json({ error: 'جلسة غير صالحة' });
  };
  
  const adminRouter = express.Router();
  
  // Mock pending counts
  adminRouter.get('/pending-counts', adminMiddleware, (req, res) => {
    return res.json({
      pendingListings: 5,
      pendingReports: 3,
      pendingMembership: 2,
      pendingRefunds: 1,
      unrepliedMessages: 4,
      pendingComplaints: 0
    });
  });
  
  // Mock listings list for admin
  adminRouter.get('/listings', adminMiddleware, (req, res) => {
    const mockListings = [
      { id: '1', title: 'إعلان 1', status: 'pending' },
      { id: '2', title: 'إعلان 2', status: 'approved' },
      { id: '3', title: 'إعلان 3', status: 'pending' },
    ];
    
    const status = req.query.status;
    let filtered = status ? mockListings.filter(l => l.status === status) : mockListings;
    
    return res.json({ listings: filtered, total: filtered.length });
  });
  
  // Mock approve listing
  adminRouter.patch('/listings/:id/approve', adminMiddleware, (req, res) => {
    const { id } = req.params;
    if (id === 'not-found') {
      return res.status(404).json({ error: 'الإعلان غير موجود' });
    }
    return res.json({ ok: true, message: 'تم اعتماد الإعلان', listing: { id, status: 'approved' } });
  });
  
  // Mock reject listing
  adminRouter.patch('/listings/:id/reject', adminMiddleware, (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({ error: 'سبب الرفض مطلوب' });
    }
    
    return res.json({ ok: true, message: 'تم رفض الإعلان', listing: { id, status: 'rejected' } });
  });
  
  // Mock delete listing
  adminRouter.delete('/listings/:id', adminMiddleware, (req, res) => {
    const { id } = req.params;
    if (id === 'not-found') {
      return res.status(404).json({ error: 'الإعلان غير موجود' });
    }
    return res.json({ ok: true, message: 'تم حذف الإعلان' });
  });
  
  // Mock dashboard stats
  adminRouter.get('/dashboard-stats', adminMiddleware, (req, res) => {
    return res.json({
      totalUsers: 150,
      totalListings: 320,
      activeSubscribers: 45,
      pendingListings: 12,
      recentTransactions: 28,
      monthlyRevenue: 15000
    });
  });
  
  // Mock users list
  adminRouter.get('/users', adminMiddleware, (req, res) => {
    const mockUsers = [
      { id: '1', name: 'مستخدم 1', email: 'user1@test.com', status: 'active' },
      { id: '2', name: 'مستخدم 2', email: 'user2@test.com', status: 'active' },
      { id: '3', name: 'مستخدم 3', email: 'user3@test.com', status: 'suspended' },
    ];
    
    const status = req.query.status;
    let filtered = status ? mockUsers.filter(u => u.status === status) : mockUsers;
    
    return res.json({ users: filtered, total: filtered.length });
  });
  
  // Mock suspend user
  adminRouter.patch('/users/:id/suspend', adminMiddleware, (req, res) => {
    const { id } = req.params;
    return res.json({ ok: true, message: 'تم إيقاف الحساب', user: { id, status: 'suspended' } });
  });
  
  // Mock activate user
  adminRouter.patch('/users/:id/activate', adminMiddleware, (req, res) => {
    const { id } = req.params;
    return res.json({ ok: true, message: 'تم تفعيل الحساب', user: { id, status: 'active' } });
  });
  
  app.use('/api/admin', adminRouter);
  return app;
};

describe('Admin API', () => {
  let app;
  
  beforeAll(() => {
    app = createTestApp();
  });
  
  describe('Authorization', () => {
    it('should reject requests without token', async () => {
      const res = await request(app).get('/api/admin/pending-counts');
      expect(res.status).toBe(401);
    });
    
    it('should reject non-admin users', async () => {
      const res = await request(app)
        .get('/api/admin/pending-counts')
        .set('Authorization', 'Bearer user-token');
      expect(res.status).toBe(403);
    });
    
    it('should accept admin users', async () => {
      const res = await request(app)
        .get('/api/admin/pending-counts')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
    });
  });
  
  describe('GET /api/admin/pending-counts', () => {
    it('should return pending counts', async () => {
      const res = await request(app)
        .get('/api/admin/pending-counts')
        .set('Authorization', 'Bearer admin-token');
      
      expect(res.status).toBe(200);
      expect(res.body.pendingListings).toBeDefined();
      expect(res.body.pendingReports).toBeDefined();
      expect(res.body.pendingRefunds).toBeDefined();
    });
  });
  
  describe('GET /api/admin/listings', () => {
    it('should return all listings', async () => {
      const res = await request(app)
        .get('/api/admin/listings')
        .set('Authorization', 'Bearer admin-token');
      
      expect(res.status).toBe(200);
      expect(res.body.listings).toBeDefined();
      expect(Array.isArray(res.body.listings)).toBe(true);
    });
    
    it('should filter by status', async () => {
      const res = await request(app)
        .get('/api/admin/listings')
        .query({ status: 'pending' })
        .set('Authorization', 'Bearer admin-token');
      
      expect(res.status).toBe(200);
      expect(res.body.listings.every(l => l.status === 'pending')).toBe(true);
    });
  });
  
  describe('PATCH /api/admin/listings/:id/approve', () => {
    it('should approve listing', async () => {
      const res = await request(app)
        .patch('/api/admin/listings/123/approve')
        .set('Authorization', 'Bearer admin-token');
      
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.listing.status).toBe('approved');
    });
    
    it('should return 404 for non-existent listing', async () => {
      const res = await request(app)
        .patch('/api/admin/listings/not-found/approve')
        .set('Authorization', 'Bearer admin-token');
      
      expect(res.status).toBe(404);
    });
  });
  
  describe('PATCH /api/admin/listings/:id/reject', () => {
    it('should reject listing with reason', async () => {
      const res = await request(app)
        .patch('/api/admin/listings/123/reject')
        .set('Authorization', 'Bearer admin-token')
        .send({ reason: 'الصور غير واضحة' });
      
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.listing.status).toBe('rejected');
    });
    
    it('should require reason for rejection', async () => {
      const res = await request(app)
        .patch('/api/admin/listings/123/reject')
        .set('Authorization', 'Bearer admin-token')
        .send({});
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('سبب');
    });
  });
  
  describe('DELETE /api/admin/listings/:id', () => {
    it('should delete listing', async () => {
      const res = await request(app)
        .delete('/api/admin/listings/123')
        .set('Authorization', 'Bearer admin-token');
      
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
  
  describe('GET /api/admin/dashboard-stats', () => {
    it('should return dashboard statistics', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard-stats')
        .set('Authorization', 'Bearer admin-token');
      
      expect(res.status).toBe(200);
      expect(res.body.totalUsers).toBeDefined();
      expect(res.body.totalListings).toBeDefined();
      expect(res.body.activeSubscribers).toBeDefined();
    });
  });
  
  describe('User Management', () => {
    it('should list users', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', 'Bearer admin-token');
      
      expect(res.status).toBe(200);
      expect(res.body.users).toBeDefined();
    });
    
    it('should suspend user', async () => {
      const res = await request(app)
        .patch('/api/admin/users/123/suspend')
        .set('Authorization', 'Bearer admin-token');
      
      expect(res.status).toBe(200);
      expect(res.body.user.status).toBe('suspended');
    });
    
    it('should activate user', async () => {
      const res = await request(app)
        .patch('/api/admin/users/123/activate')
        .set('Authorization', 'Bearer admin-token');
      
      expect(res.status).toBe(200);
      expect(res.body.user.status).toBe('active');
    });
  });
});
