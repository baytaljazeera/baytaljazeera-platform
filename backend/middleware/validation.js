// backend/middleware/validation.js - Input Validation Middleware
const crypto = require('crypto');

// CSRF Token generation and validation
const CSRF_TOKEN_LENGTH = 32;
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_COOKIE_NAME = 'csrf_token';

const generateCSRFToken = () => {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
};

const csrfProtection = (req, res, next) => {
  // Skip CSRF for safe methods
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    // Generate and set CSRF token for GET requests
    if (!req.cookies[CSRF_COOKIE_NAME]) {
      const token = generateCSRFToken();
      res.cookie(CSRF_COOKIE_NAME, token, {
        httpOnly: false, // Must be readable by frontend JS
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });
    }
    return next();
  }
  
  // For state-changing methods, validate CSRF token
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers?.[CSRF_HEADER_NAME];
  
  // If no tokens, return 403 (not crash)
  if (!cookieToken || !headerToken) {
    return res.status(403).json({ 
      error: 'رمز الأمان مفقود', 
      errorEn: 'CSRF token missing' 
    });
  }
  
  // Ensure both tokens are strings and have same length before comparison
  const cookieStr = String(cookieToken);
  const headerStr = String(headerToken);
  
  // Length mismatch = invalid token (avoid timingSafeEqual crash)
  if (cookieStr.length !== headerStr.length) {
    return res.status(403).json({ 
      error: 'رمز الأمان غير صالح', 
      errorEn: 'CSRF token invalid' 
    });
  }
  
  // Constant-time comparison to prevent timing attacks
  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(cookieStr, 'utf8'), 
      Buffer.from(headerStr, 'utf8')
    );
    if (!isValid) {
      return res.status(403).json({ 
        error: 'رمز الأمان غير صالح', 
        errorEn: 'CSRF token invalid' 
      });
    }
  } catch (err) {
    return res.status(403).json({ 
      error: 'رمز الأمان غير صالح', 
      errorEn: 'CSRF token invalid' 
    });
  }
  
  next();
};

// Lightweight CSRF (for APIs that accept Bearer tokens - already protected)
const csrfProtectionLite = (req, res, next) => {
  // If request has Authorization header with Bearer token, skip CSRF
  // Bearer tokens are not automatically sent by browsers, so CSRF is not applicable
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return next();
  }
  
  // Otherwise, apply full CSRF protection
  return csrfProtection(req, res, next);
};

const validateUUID = (paramName = 'id') => {
  return (req, res, next) => {
    const value = req.params[paramName];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    if (!value || !uuidRegex.test(value)) {
      return res.status(400).json({ 
        error: 'معرف غير صالح', 
        errorEn: 'Invalid ID format' 
      });
    }
    next();
  };
};

const validatePagination = (req, res, next) => {
  const rawPage = req.query.page;
  const rawLimit = req.query.limit;
  
  const page = rawPage !== undefined ? parseInt(rawPage) : 1;
  const limit = rawLimit !== undefined ? parseInt(rawLimit) : 20;
  
  if (isNaN(page) || page < 1 || page > 10000) {
    return res.status(400).json({ error: 'رقم الصفحة غير صالح' });
  }
  if (isNaN(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({ error: 'عدد النتائج غير صالح (1-100)' });
  }
  
  req.pagination = { page, limit, offset: (page - 1) * limit };
  next();
};

const sanitizeInput = (req, res, next) => {
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    
    return str
      // Remove script tags (including nested and malformed)
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<script[^>]*>/gi, '')
      .replace(/<\/script>/gi, '')
      // Remove dangerous protocols only in HTML attributes context
      .replace(/href\s*=\s*['"]?\s*javascript:/gi, 'href="blocked:')
      .replace(/src\s*=\s*['"]?\s*javascript:/gi, 'src="blocked:')
      // Remove event handlers in HTML tags only (not in regular text)
      .replace(/<[^>]+\s(on\w+)\s*=/gi, (match, attr) => match.replace(attr + '=', 'data-blocked='))
      // Remove style expressions in style attribute
      .replace(/style\s*=\s*['"][^'"]*expression\s*\([^)]*\)/gi, 'style=""')
      // Remove iframe and object tags
      .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
      .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '')
      .replace(/<embed[^>]*>/gi, '')
      // Trim and limit length
      .trim()
      .slice(0, 50000);
  };
  
  const sanitize = (obj, depth = 0) => {
    // Prevent prototype pollution and deep recursion
    if (depth > 10) return obj;
    if (obj === null || obj === undefined) return obj;
    
    if (typeof obj === 'string') {
      return sanitizeString(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.slice(0, 1000).map(item => sanitize(item, depth + 1));
    }
    
    if (typeof obj === 'object') {
      // Block prototype pollution attempts
      if (obj.constructor !== Object && obj.constructor !== undefined) {
        return {};
      }
      
      const sanitized = {};
      const keys = Object.keys(obj).slice(0, 200);
      
      for (const key of keys) {
        // Block __proto__, constructor, prototype keys
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          continue;
        }
        sanitized[key] = sanitize(obj[key], depth + 1);
      }
      return sanitized;
    }
    
    return obj;
  };
  
  if (req.body) req.body = sanitize(req.body);
  if (req.query) req.query = sanitize(req.query);
  next();
};

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePhone = (phone) => {
  const phoneRegex = /^(05|5)\d{8}$/;
  const cleanPhone = phone?.replace(/[\s-]/g, '');
  return phoneRegex.test(cleanPhone);
};

const validateRequired = (fields) => {
  return (req, res, next) => {
    const missing = fields.filter(field => {
      const value = req.body[field];
      return value === undefined || value === null || value === '';
    });
    
    if (missing.length > 0) {
      return res.status(400).json({
        error: `الحقول التالية مطلوبة: ${missing.join(', ')}`,
        errorEn: `Required fields missing: ${missing.join(', ')}`
      });
    }
    next();
  };
};

const validateNumericRange = (field, min, max) => {
  return (req, res, next) => {
    const value = parseFloat(req.body[field] || req.query[field]);
    
    if (isNaN(value) || value < min || value > max) {
      return res.status(400).json({
        error: `قيمة ${field} يجب أن تكون بين ${min} و ${max}`,
        errorEn: `${field} must be between ${min} and ${max}`
      });
    }
    next();
  };
};

const validate = (schema) => (req, res, next) => {
  const errors = [];
  
  for (const [field, rules] of Object.entries(schema)) {
    const source = rules.in || 'body';
    let value = source === 'params' ? req.params[field] : 
                source === 'query' ? req.query[field] : 
                req.body[field];
    
    if (rules.sanitize) {
      for (const sanitizer of rules.sanitize) {
        if (sanitizer === 'trim' && typeof value === 'string') value = value.trim();
        if (sanitizer === 'toLowerCase' && typeof value === 'string') value = value.toLowerCase();
        if (sanitizer === 'toUpperCase' && typeof value === 'string') value = value.toUpperCase();
        if (sanitizer === 'toInt' && value) value = parseInt(value, 10);
        if (sanitizer === 'toFloat' && value) value = parseFloat(value);
      }
      if (source === 'params') req.params[field] = value;
      else if (source === 'query') req.query[field] = value;
      else req.body[field] = value;
    }
    
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push({ field, message: rules.message || `${field} مطلوب`, messageEn: `${field} is required` });
      continue;
    }
    
    if (value === undefined || value === null || value === '') continue;
    
    if (rules.type === 'email' && !validateEmail(value)) {
      errors.push({ field, message: 'البريد الإلكتروني غير صالح', messageEn: 'Invalid email' });
    }
    
    if (rules.type === 'phone' && !validatePhone(value)) {
      errors.push({ field, message: 'رقم الجوال غير صالح', messageEn: 'Invalid phone number' });
    }
    
    if (rules.type === 'positiveInt' && (!Number.isInteger(Number(value)) || Number(value) <= 0)) {
      errors.push({ field, message: 'يجب أن يكون رقم صحيح موجب', messageEn: 'Must be a positive integer' });
    }
    
    if (rules.minLength && typeof value === 'string' && value.length < rules.minLength) {
      errors.push({ field, message: `يجب أن يكون ${rules.minLength} أحرف على الأقل`, messageEn: `Min ${rules.minLength} characters` });
    }
    
    if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
      errors.push({ field, message: `يجب ألا يتجاوز ${rules.maxLength} حرف`, messageEn: `Max ${rules.maxLength} characters` });
    }
    
    if (rules.enum && !rules.enum.includes(value)) {
      errors.push({ field, message: 'قيمة غير صالحة', messageEn: `Must be one of: ${rules.enum.join(', ')}` });
    }
    
    if (rules.min !== undefined && parseFloat(value) < rules.min) {
      errors.push({ field, message: `يجب أن يكون ${rules.min} على الأقل`, messageEn: `Min ${rules.min}` });
    }
    
    if (rules.max !== undefined && parseFloat(value) > rules.max) {
      errors.push({ field, message: `يجب ألا يتجاوز ${rules.max}`, messageEn: `Max ${rules.max}` });
    }
  }
  
  if (errors.length > 0) {
    return res.status(400).json({ 
      error: errors[0].message,
      errorEn: errors[0].messageEn,
      errors 
    });
  }
  
  next();
};

const validateId = (paramName = 'id') => (req, res, next) => {
  const id = req.params[paramName];
  if (!id) {
    return res.status(400).json({ error: 'المعرف مطلوب', errorEn: 'ID is required' });
  }
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(id)) {
    next();
  } else if (Number.isInteger(Number(id)) && Number(id) > 0) {
    req.params[paramName] = parseInt(id, 10);
    next();
  } else {
    return res.status(400).json({ error: 'معرف غير صالح', errorEn: 'Invalid ID' });
  }
};

const commonSchemas = {
  login: {
    email: { required: true, type: 'email', sanitize: ['trim', 'toLowerCase'] },
    password: { required: true, minLength: 6 }
  },
  register: {
    email: { required: true, type: 'email', sanitize: ['trim', 'toLowerCase'] },
    password: { required: true, minLength: 12 },
    name: { required: true, minLength: 2, maxLength: 100, sanitize: ['trim'] }
  },
  updateProfile: {
    name: { minLength: 2, maxLength: 100, sanitize: ['trim'] },
    phone: { type: 'phone' }
  },
  changePassword: {
    current: { required: true, minLength: 6 },
    next: { required: true, minLength: 12 }
  }
};

module.exports = {
  csrfProtection,
  csrfProtectionLite,
  generateCSRFToken,
  CSRF_HEADER_NAME,
  validateUUID,
  validatePagination,
  sanitizeInput,
  validateEmail,
  validatePhone,
  validateRequired,
  validateNumericRange,
  validate,
  validateId,
  commonSchemas
};
