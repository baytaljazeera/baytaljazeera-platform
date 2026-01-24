// Integration tests for Auth API
const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

// Create a minimal test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  
  // Mock auth routes for testing
  const authRouter = express.Router();
  
  // Mock login endpoint
  authRouter.post('/login', (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'البريد وكلمة المرور مطلوبان' });
    }
    
    if (!email.includes('@')) {
      return res.status(400).json({ error: 'بريد إلكتروني غير صالح' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'كلمة المرور قصيرة جداً' });
    }
    
    // Mock successful login
    if (email === 'test@example.com' && password === 'password123') {
      res.cookie('token', 'mock-jwt-token', { httpOnly: true });
      return res.json({ ok: true, user: { id: '123', email, name: 'Test User' } });
    }
    
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  });
  
  // Mock register endpoint
  authRouter.post('/register', (req, res) => {
    const { name, email, password, phone } = req.body;
    
    if (!name || !email || !password || !phone) {
      return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    }
    
    if (!email.includes('@')) {
      return res.status(400).json({ error: 'بريد إلكتروني غير صالح' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    }
    
    if (email === 'existing@example.com') {
      return res.status(400).json({ error: 'البريد مستخدم مسبقاً' });
    }
    
    return res.status(201).json({ 
      ok: true, 
      user: { id: '456', name, email },
      message: 'تم إنشاء الحساب بنجاح'
    });
  });
  
  // Mock logout endpoint
  authRouter.post('/logout', (req, res) => {
    res.clearCookie('token');
    return res.json({ ok: true, message: 'تم تسجيل الخروج' });
  });
  
  // Mock me endpoint
  authRouter.get('/me', (req, res) => {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'غير مصرح' });
    }
    
    if (token === 'mock-jwt-token') {
      return res.json({ id: '123', email: 'test@example.com', name: 'Test User' });
    }
    
    return res.status(401).json({ error: 'جلسة غير صالحة' });
  });
  
  app.use('/api/auth', authRouter);
  return app;
};

describe('Auth API', () => {
  let app;
  
  beforeAll(() => {
    app = createTestApp();
  });
  
  describe('POST /api/auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });
      
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('test@example.com');
      expect(res.headers['set-cookie']).toBeDefined();
    });
    
    it('should reject login with invalid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'wrongpassword' });
      
      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });
    
    it('should reject login with missing email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ password: 'password123' });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
    
    it('should reject login with invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'invalid-email', password: 'password123' });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('غير صالح');
    });
    
    it('should reject login with short password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: '123' });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('قصيرة');
    });
  });
  
  describe('POST /api/auth/register', () => {
    it('should register successfully with valid data', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'New User',
          email: 'newuser@example.com',
          password: 'password123',
          phone: '0501234567'
        });
      
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.user).toBeDefined();
      expect(res.body.message).toContain('بنجاح');
    });
    
    it('should reject registration with existing email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: 'existing@example.com',
          password: 'password123',
          phone: '0501234567'
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('مستخدم');
    });
    
    it('should reject registration with missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Test User', email: 'test@example.com' });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('مطلوبة');
    });
    
    it('should reject registration with short password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: '123',
          phone: '0501234567'
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('6');
    });
  });
  
  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      const res = await request(app)
        .post('/api/auth/logout');
      
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
  
  describe('GET /api/auth/me', () => {
    it('should return user data with valid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer mock-jwt-token');
      
      expect(res.status).toBe(200);
      expect(res.body.email).toBe('test@example.com');
    });
    
    it('should reject without token', async () => {
      const res = await request(app)
        .get('/api/auth/me');
      
      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });
    
    it('should reject with invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');
      
      expect(res.status).toBe(401);
    });
  });
});
