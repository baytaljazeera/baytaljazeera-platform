// Unit tests for validation middleware
const {
  validateUUID,
  validatePagination,
  sanitizeInput,
  validateEmail,
  validatePhone,
  validateRequired,
  validateNumericRange
} = require('../middleware/validation');

describe('Validation Middleware', () => {
  
  describe('validateUUID', () => {
    it('should pass valid UUID', () => {
      const req = { params: { id: '550e8400-e29b-41d4-a716-446655440000' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      
      validateUUID('id')(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
    
    it('should reject invalid UUID', () => {
      const req = { params: { id: 'invalid-uuid' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      
      validateUUID('id')(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'معرف غير صالح' }));
      expect(next).not.toHaveBeenCalled();
    });
    
    it('should reject empty UUID', () => {
      const req = { params: { id: '' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      
      validateUUID('id')(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });
  
  describe('validatePagination', () => {
    it('should set default pagination values', () => {
      const req = { query: {} };
      const res = {};
      const next = jest.fn();
      
      validatePagination(req, res, next);
      
      expect(req.pagination).toEqual({ page: 1, limit: 20, offset: 0 });
      expect(next).toHaveBeenCalled();
    });
    
    it('should parse valid pagination params', () => {
      const req = { query: { page: '3', limit: '50' } };
      const res = {};
      const next = jest.fn();
      
      validatePagination(req, res, next);
      
      expect(req.pagination).toEqual({ page: 3, limit: 50, offset: 100 });
      expect(next).toHaveBeenCalled();
    });
    
    it('should reject invalid page number', () => {
      const req = { query: { page: '0' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      
      validatePagination(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
    
    it('should reject limit over 100', () => {
      const req = { query: { limit: '150' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      
      validatePagination(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });
  
  describe('sanitizeInput', () => {
    it('should sanitize script tags from strings', () => {
      const req = { body: { name: 'Test<script>alert("xss")</script>Name' } };
      const res = {};
      const next = jest.fn();
      
      sanitizeInput(req, res, next);
      
      expect(req.body.name).toBe('TestName');
      expect(next).toHaveBeenCalled();
    });
    
    it('should remove javascript: protocol', () => {
      const req = { body: { link: 'javascript:alert(1)' } };
      const res = {};
      const next = jest.fn();
      
      sanitizeInput(req, res, next);
      
      expect(req.body.link).not.toContain('javascript:');
      expect(next).toHaveBeenCalled();
    });
    
    it('should remove on* event handlers', () => {
      const req = { body: { html: '<img onerror=alert(1) src=x>' } };
      const res = {};
      const next = jest.fn();
      
      sanitizeInput(req, res, next);
      
      expect(req.body.html).not.toContain('onerror=');
      expect(next).toHaveBeenCalled();
    });
    
    it('should preserve arrays', () => {
      const req = { body: { images: ['img1.jpg', 'img2.jpg', 'img3.jpg'] } };
      const res = {};
      const next = jest.fn();
      
      sanitizeInput(req, res, next);
      
      expect(Array.isArray(req.body.images)).toBe(true);
      expect(req.body.images).toHaveLength(3);
      expect(req.body.images).toEqual(['img1.jpg', 'img2.jpg', 'img3.jpg']);
      expect(next).toHaveBeenCalled();
    });
    
    it('should handle nested objects', () => {
      const req = { 
        body: { 
          user: { 
            name: 'Test<script>xss</script>',
            email: 'test@example.com'
          } 
        } 
      };
      const res = {};
      const next = jest.fn();
      
      sanitizeInput(req, res, next);
      
      expect(req.body.user.name).toBe('Test');
      expect(req.body.user.email).toBe('test@example.com');
      expect(next).toHaveBeenCalled();
    });
    
    it('should handle null and undefined', () => {
      const req = { body: { nullField: null, undefinedField: undefined } };
      const res = {};
      const next = jest.fn();
      
      sanitizeInput(req, res, next);
      
      expect(req.body.nullField).toBeNull();
      expect(req.body.undefinedField).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });
  });
  
  describe('validateEmail', () => {
    it('should validate correct email', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('user.name@domain.co.sa')).toBe(true);
    });
    
    it('should reject invalid email', () => {
      expect(validateEmail('invalid')).toBe(false);
      expect(validateEmail('test@')).toBe(false);
      expect(validateEmail('@domain.com')).toBe(false);
    });
  });
  
  describe('validatePhone', () => {
    it('should validate Saudi phone numbers', () => {
      expect(validatePhone('0501234567')).toBe(true);
      expect(validatePhone('501234567')).toBe(true);
      expect(validatePhone('05 12 34 56 78')).toBe(true);
    });
    
    it('should reject invalid phone numbers', () => {
      expect(validatePhone('123')).toBe(false);
      expect(validatePhone('0601234567')).toBe(false);
    });
  });
  
  describe('validateRequired', () => {
    it('should pass when all required fields present', () => {
      const req = { body: { name: 'Test', email: 'test@test.com' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      
      validateRequired(['name', 'email'])(req, res, next);
      
      expect(next).toHaveBeenCalled();
    });
    
    it('should reject when required field missing', () => {
      const req = { body: { name: 'Test' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      
      validateRequired(['name', 'email'])(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
    
    it('should reject empty string values', () => {
      const req = { body: { name: '', email: 'test@test.com' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();
      
      validateRequired(['name', 'email'])(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
