const rateLimit = require("express-rate-limit");

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: "تم تجاوز الحد المسموح من الطلبات، حاول لاحقاً", errorEn: "Too many requests" },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "محاولات كثيرة، حاول بعد 15 دقيقة", errorEn: "Too many login attempts" },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

const strictAuthLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: "تم قفل محاولات إعادة التعيين، حاول بعد ساعة", errorEn: "Password reset locked, try again in 1 hour" },
  standardHeaders: true,
  legacyHeaders: false,
});

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: "تم تجاوز حد التسجيل، حاول بعد ساعة", errorEn: "Registration limit exceeded" },
  standardHeaders: true,
  legacyHeaders: false,
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "تم تجاوز حد طلبات الذكاء الاصطناعي", errorEn: "AI rate limit exceeded" },
  standardHeaders: true,
  legacyHeaders: false,
});

const reportCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "تم تجاوز الحد المسموح من البلاغات، حاول لاحقاً", errorEn: "Too many reports" },
  standardHeaders: true,
  legacyHeaders: false,
});

const adminPagesLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "طلبات كثيرة، انتظر قليلاً", errorEn: "Too many requests" },
  standardHeaders: true,
  legacyHeaders: false,
});

const complaintsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: "تم تجاوز الحد المسموح من الشكاوى، حاول لاحقاً", errorEn: "Too many complaints" },
  standardHeaders: true,
  legacyHeaders: false,
});

const subscriptionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "طلبات اشتراك كثيرة، حاول بعد 15 دقيقة", errorEn: "Too many subscription attempts" },
  standardHeaders: true,
  legacyHeaders: false,
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "طلبات دفع كثيرة، حاول بعد 15 دقيقة", errorEn: "Too many payment attempts" },
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: { error: "تم تجاوز حد رفع الملفات، حاول لاحقاً", errorEn: "Too many uploads" },
  standardHeaders: true,
  legacyHeaders: false,
});

const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.CUSTOM_DOMAIN ? `https://${process.env.CUSTOM_DOMAIN}` : null,
  process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null,
  'http://localhost:5000',
  'http://localhost:3000',
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow Replit domains
    if (origin.includes('.replit.dev') || origin.includes('.replit.app')) {
      return callback(null, true);
    }
    
    // Allow Vercel domains (production frontend)
    if (origin.includes('.vercel.app') || origin.includes('vercel.app')) {
      return callback(null, true);
    }
    
    // Allow custom domain baytaljazeera.com (with and without www)
    if (origin.includes('baytaljazeera.com')) {
      return callback(null, true);
    }
    
    // Allow localhost in development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    // Check allowed origins from environment variables
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // In development, allow all origins (for testing)
    if (!isProduction) {
      console.warn(`[CORS] Allowing unrecognized origin in dev: ${origin}`);
      return callback(null, true);
    }
    
    // In production, log blocked origins for debugging
    console.warn(`[CORS] Blocked origin: ${origin}`);
    console.warn(`[CORS] Allowed origins:`, allowedOrigins);
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
};

const PASSWORD_POLICY = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: true,
  maxLoginAttempts: 5,
  lockoutDuration: 30 * 60 * 1000,
};

function validatePassword(password) {
  const errors = [];
  
  if (!password || password.length < PASSWORD_POLICY.minLength) {
    errors.push(`كلمة المرور يجب أن تكون ${PASSWORD_POLICY.minLength} حرفاً على الأقل`);
  }
  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("يجب أن تحتوي على حرف كبير واحد على الأقل");
  }
  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password)) {
    errors.push("يجب أن تحتوي على حرف صغير واحد على الأقل");
  }
  if (PASSWORD_POLICY.requireNumber && !/[0-9]/.test(password)) {
    errors.push("يجب أن تحتوي على رقم واحد على الأقل");
  }
  if (PASSWORD_POLICY.requireSpecial && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push("يجب أن تحتوي على رمز خاص واحد على الأقل");
  }
  
  return {
    valid: errors.length === 0,
    errors,
    errorMessage: errors.join("، "),
  };
}

function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[<>'"`;]/g, '')
    .trim();
}

const SQL_SAFE_ORDER_FIELDS = [
  'id', 'created_at', 'updated_at', 'price', 'area', 'land_area', 
  'building_area', 'views', 'name', 'title', 'status'
];

function validateOrderField(field) {
  return SQL_SAFE_ORDER_FIELDS.includes(field?.toLowerCase());
}

module.exports = {
  generalLimiter,
  authLimiter,
  strictAuthLimiter,
  registrationLimiter,
  aiLimiter,
  reportCreateLimiter,
  adminPagesLimiter,
  complaintsLimiter,
  subscriptionLimiter,
  paymentLimiter,
  uploadLimiter,
  corsOptions,
  isProduction,
  PASSWORD_POLICY,
  validatePassword,
  sanitizeInput,
  validateOrderField,
  SQL_SAFE_ORDER_FIELDS,
};
