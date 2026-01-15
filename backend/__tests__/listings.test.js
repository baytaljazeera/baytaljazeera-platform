// Integration tests for Listings API
const request = require('supertest');
const express = require('express');

// Create a minimal test app for listings
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Mock listings data
  const mockListings = [
    { id: '550e8400-e29b-41d4-a716-446655440001', title: 'فيلا فاخرة', price: 1500000, city: 'الرياض', status: 'approved' },
    { id: '550e8400-e29b-41d4-a716-446655440002', title: 'شقة مميزة', price: 500000, city: 'جدة', status: 'approved' },
    { id: '550e8400-e29b-41d4-a716-446655440003', title: 'أرض للبيع', price: 800000, city: 'الدمام', status: 'pending' },
  ];
  
  const listingsRouter = express.Router();
  
  // Get all listings with filters
  listingsRouter.get('/', (req, res) => {
    let results = [...mockListings].filter(l => l.status === 'approved');
    
    // Apply city filter
    if (req.query.city) {
      results = results.filter(l => l.city === req.query.city);
    }
    
    // Apply price range
    if (req.query.min_price) {
      results = results.filter(l => l.price >= parseInt(req.query.min_price));
    }
    if (req.query.max_price) {
      results = results.filter(l => l.price <= parseInt(req.query.max_price));
    }
    
    // Apply pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    const paginatedResults = results.slice(offset, offset + limit);
    
    return res.json({
      listings: paginatedResults,
      total: results.length,
      page,
      limit
    });
  });
  
  // Get single listing
  listingsRouter.get('/:id', (req, res) => {
    const { id } = req.params;
    
    // UUID validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'معرف غير صالح' });
    }
    
    const listing = mockListings.find(l => l.id === id);
    
    if (!listing) {
      return res.status(404).json({ error: 'الإعلان غير موجود' });
    }
    
    return res.json(listing);
  });
  
  // Create listing (requires auth - mocked)
  listingsRouter.post('/', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'غير مصرح' });
    }
    
    const { title, description, price, city, property_type } = req.body;
    
    if (!title || !price || !city || !property_type) {
      return res.status(400).json({ error: 'الحقول المطلوبة: العنوان، السعر، المدينة، نوع العقار' });
    }
    
    if (price <= 0) {
      return res.status(400).json({ error: 'السعر يجب أن يكون أكبر من صفر' });
    }
    
    const newListing = {
      id: '550e8400-e29b-41d4-a716-446655440099',
      title,
      description,
      price,
      city,
      property_type,
      status: 'pending',
      created_at: new Date().toISOString()
    };
    
    return res.status(201).json({ ok: true, listing: newListing });
  });
  
  // Update listing
  listingsRouter.patch('/:id', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'غير مصرح' });
    }
    
    const { id } = req.params;
    const listing = mockListings.find(l => l.id === id);
    
    if (!listing) {
      return res.status(404).json({ error: 'الإعلان غير موجود' });
    }
    
    const updated = { ...listing, ...req.body };
    return res.json({ ok: true, listing: updated });
  });
  
  // Delete listing
  listingsRouter.delete('/:id', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'غير مصرح' });
    }
    
    const { id } = req.params;
    const listing = mockListings.find(l => l.id === id);
    
    if (!listing) {
      return res.status(404).json({ error: 'الإعلان غير موجود' });
    }
    
    return res.json({ ok: true, message: 'تم حذف الإعلان' });
  });
  
  app.use('/api/listings', listingsRouter);
  return app;
};

describe('Listings API', () => {
  let app;
  
  beforeAll(() => {
    app = createTestApp();
  });
  
  describe('GET /api/listings', () => {
    it('should return list of approved listings', async () => {
      const res = await request(app).get('/api/listings');
      
      expect(res.status).toBe(200);
      expect(res.body.listings).toBeDefined();
      expect(Array.isArray(res.body.listings)).toBe(true);
      expect(res.body.total).toBeDefined();
    });
    
    it('should filter listings by city', async () => {
      const res = await request(app)
        .get('/api/listings')
        .query({ city: 'الرياض' });
      
      expect(res.status).toBe(200);
      expect(res.body.listings.every(l => l.city === 'الرياض')).toBe(true);
    });
    
    it('should filter listings by price range', async () => {
      const res = await request(app)
        .get('/api/listings')
        .query({ min_price: 600000, max_price: 2000000 });
      
      expect(res.status).toBe(200);
      expect(res.body.listings.every(l => l.price >= 600000 && l.price <= 2000000)).toBe(true);
    });
    
    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/listings')
        .query({ page: 1, limit: 10 });
      
      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(10);
    });
  });
  
  describe('GET /api/listings/:id', () => {
    it('should return single listing by ID', async () => {
      const res = await request(app)
        .get('/api/listings/550e8400-e29b-41d4-a716-446655440001');
      
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('فيلا فاخرة');
    });
    
    it('should return 404 for non-existent listing', async () => {
      const res = await request(app)
        .get('/api/listings/550e8400-e29b-41d4-a716-446655440999');
      
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('غير موجود');
    });
    
    it('should return 400 for invalid UUID', async () => {
      const res = await request(app)
        .get('/api/listings/invalid-id');
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('غير صالح');
    });
  });
  
  describe('POST /api/listings', () => {
    it('should create listing with valid data', async () => {
      const res = await request(app)
        .post('/api/listings')
        .set('Authorization', 'Bearer mock-token')
        .send({
          title: 'فيلا جديدة',
          description: 'فيلا فاخرة في حي راقي',
          price: 2000000,
          city: 'الرياض',
          property_type: 'villa'
        });
      
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.listing.status).toBe('pending');
    });
    
    it('should reject without authentication', async () => {
      const res = await request(app)
        .post('/api/listings')
        .send({
          title: 'Test',
          price: 1000000,
          city: 'الرياض',
          property_type: 'villa'
        });
      
      expect(res.status).toBe(401);
    });
    
    it('should reject with missing required fields', async () => {
      const res = await request(app)
        .post('/api/listings')
        .set('Authorization', 'Bearer mock-token')
        .send({ title: 'Test' });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('مطلوبة');
    });
    
    it('should reject with invalid price', async () => {
      const res = await request(app)
        .post('/api/listings')
        .set('Authorization', 'Bearer mock-token')
        .send({
          title: 'Test',
          price: -100,
          city: 'الرياض',
          property_type: 'villa'
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('السعر');
    });
  });
  
  describe('PATCH /api/listings/:id', () => {
    it('should update listing', async () => {
      const res = await request(app)
        .patch('/api/listings/550e8400-e29b-41d4-a716-446655440001')
        .set('Authorization', 'Bearer mock-token')
        .send({ price: 1600000 });
      
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.listing.price).toBe(1600000);
    });
    
    it('should reject without authentication', async () => {
      const res = await request(app)
        .patch('/api/listings/550e8400-e29b-41d4-a716-446655440001')
        .send({ price: 1600000 });
      
      expect(res.status).toBe(401);
    });
  });
  
  describe('DELETE /api/listings/:id', () => {
    it('should delete listing', async () => {
      const res = await request(app)
        .delete('/api/listings/550e8400-e29b-41d4-a716-446655440001')
        .set('Authorization', 'Bearer mock-token');
      
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
    
    it('should reject without authentication', async () => {
      const res = await request(app)
        .delete('/api/listings/550e8400-e29b-41d4-a716-446655440001');
      
      expect(res.status).toBe(401);
    });
  });
});
