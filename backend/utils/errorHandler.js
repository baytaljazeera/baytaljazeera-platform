// backend/utils/errorHandler.js
// Improved Error Handler for Production

const isProduction = process.env.NODE_ENV === 'production';

// Production-safe error messages
const ERROR_MESSAGES = {
  // Authentication Errors
  AUTH_REQUIRED: {
    ar: 'يجب تسجيل الدخول أولاً',
    en: 'Authentication required'
  },
  AUTH_INVALID: {
    ar: 'بيانات الدخول غير صحيحة',
    en: 'Invalid credentials'
  },
  AUTH_EXPIRED: {
    ar: 'انتهت صلاحية الجلسة، سجل دخول من جديد',
    en: 'Session expired'
  },
  AUTH_LOCKED: {
    ar: 'تم قفل حسابك مؤقتاً بسبب محاولات دخول خاطئة متعددة',
    en: 'Account temporarily locked'
  },
  
  // Authorization Errors
  FORBIDDEN: {
    ar: 'ليس لديك صلاحية لهذا الإجراء',
    en: 'Access forbidden'
  },
  PERMISSION_DENIED: {
    ar: 'ليس لديك الصلاحية المطلوبة',
    en: 'Permission denied'
  },
  
  // Validation Errors
  VALIDATION_ERROR: {
    ar: 'البيانات المرسلة غير صحيحة',
    en: 'Invalid data'
  },
  MISSING_REQUIRED: {
    ar: 'بعض الحقول المطلوبة مفقودة',
    en: 'Required fields missing'
  },
  INVALID_FORMAT: {
    ar: 'تنسيق البيانات غير صحيح',
    en: 'Invalid data format'
  },
  
  // Resource Errors
  NOT_FOUND: {
    ar: 'المورد المطلوب غير موجود',
    en: 'Resource not found'
  },
  ALREADY_EXISTS: {
    ar: 'البيانات موجودة مسبقاً',
    en: 'Resource already exists'
  },
  CONFLICT: {
    ar: 'تعارض في البيانات',
    en: 'Data conflict'
  },
  
  // Database Errors
  DATABASE_ERROR: {
    ar: 'حدث خطأ في قاعدة البيانات',
    en: 'Database error'
  },
  CONNECTION_ERROR: {
    ar: 'تعذر الاتصال بقاعدة البيانات',
    en: 'Database connection failed'
  },
  
  // File Upload Errors
  FILE_TOO_LARGE: {
    ar: 'حجم الملف كبير جداً',
    en: 'File too large'
  },
  INVALID_FILE_TYPE: {
    ar: 'نوع الملف غير مدعوم',
    en: 'Invalid file type'
  },
  UPLOAD_FAILED: {
    ar: 'فشل رفع الملف',
    en: 'File upload failed'
  },
  
  // Rate Limiting
  RATE_LIMIT_EXCEEDED: {
    ar: 'تم تجاوز الحد المسموح من الطلبات، حاول لاحقاً',
    en: 'Rate limit exceeded'
  },
  
  // Server Errors
  SERVER_ERROR: {
    ar: isProduction ? 'حدث خطأ في السيرفر' : 'خطأ في السيرفر: {details}',
    en: isProduction ? 'Server error occurred' : 'Server error: {details}'
  },
  SERVICE_UNAVAILABLE: {
    ar: 'الخدمة غير متاحة حالياً',
    en: 'Service temporarily unavailable'
  },
  
  // Business Logic Errors
  QUOTA_EXCEEDED: {
    ar: 'تم تجاوز الحد المسموح',
    en: 'Quota exceeded'
  },
  INSUFFICIENT_PERMISSIONS: {
    ar: 'ليس لديك صلاحية لهذا الإجراء',
    en: 'Insufficient permissions'
  },
};

class AppError extends Error {
  constructor(type, customMessage = null, details = null) {
    const errorInfo = ERROR_MESSAGES[type] || ERROR_MESSAGES.SERVER_ERROR;
    const message = customMessage || errorInfo.ar;
    
    super(message);
    this.type = type;
    this.messageAr = message;
    this.messageEn = errorInfo.en;
    this.status = this.getStatus(type);
    this.details = isProduction ? null : details; // Hide details in production
  }
  
  getStatus(type) {
    const statusMap = {
      AUTH_REQUIRED: 401,
      AUTH_INVALID: 401,
      AUTH_EXPIRED: 401,
      AUTH_LOCKED: 423,
      FORBIDDEN: 403,
      PERMISSION_DENIED: 403,
      VALIDATION_ERROR: 400,
      MISSING_REQUIRED: 400,
      INVALID_FORMAT: 400,
      NOT_FOUND: 404,
      ALREADY_EXISTS: 409,
      CONFLICT: 409,
      DATABASE_ERROR: 500,
      CONNECTION_ERROR: 503,
      FILE_TOO_LARGE: 413,
      INVALID_FILE_TYPE: 400,
      UPLOAD_FAILED: 500,
      RATE_LIMIT_EXCEEDED: 429,
      SERVER_ERROR: 500,
      SERVICE_UNAVAILABLE: 503,
      QUOTA_EXCEEDED: 403,
      INSUFFICIENT_PERMISSIONS: 403,
    };
    
    return statusMap[type] || 500;
  }
  
  toJSON() {
    return {
      error: this.messageAr,
      errorEn: this.messageEn,
      ...(this.details && !isProduction && { details: this.details })
    };
  }
}

// Centralized error handler middleware
function errorHandler(err, req, res, next) {
  // Log error (with stack trace in development)
  const logLevel = err.status >= 500 ? 'ERROR' : 'WARN';
  console.error(`[${logLevel}] ${err.message}`, 
    !isProduction && err.stack ? `\n${err.stack}` : ''
  );
  
  // Handle known AppError
  if (err instanceof AppError) {
    return res.status(err.status).json(err.toJSON());
  }
  
  // Handle database errors
  if (err.code && err.code.startsWith('23')) {
    // PostgreSQL constraint errors
    if (err.code === '23505') { // Unique violation
      const field = err.constraint?.includes('email') ? 'البريد الإلكتروني' :
                    err.constraint?.includes('phone') ? 'رقم الجوال' :
                    'البيانات';
      return res.status(409).json({
        error: `${field} مستخدم من قبل`,
        errorEn: `${field} already exists`
      });
    }
    
    if (err.code === '23503') { // Foreign key violation
      return res.status(400).json({
        error: 'مرجع غير صالح',
        errorEn: 'Invalid reference'
      });
    }
    
    if (err.code === '22P02') { // Invalid input syntax
      return res.status(400).json({
        error: 'تنسيق البيانات غير صالح',
        errorEn: 'Invalid data format'
      });
    }
  }
  
  // Handle Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'حجم الملف كبير جداً (الحد الأقصى: 10 ميجابايت)',
      errorEn: 'File too large (max: 10MB)'
    });
  }
  
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      error: 'عدد الملفات كبير جداً',
      errorEn: 'Too many files'
    });
  }
  
  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'رمز الدخول غير صالح',
      errorEn: 'Invalid token'
    });
  }
  
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'انتهت صلاحية الجلسة',
      errorEn: 'Session expired'
    });
  }
  
  // Generic server error
  const error = isProduction 
    ? new AppError('SERVER_ERROR')
    : new AppError('SERVER_ERROR', null, err.message);
    
  return res.status(error.status).json(error.toJSON());
}

module.exports = {
  AppError,
  errorHandler,
  ERROR_MESSAGES
};
