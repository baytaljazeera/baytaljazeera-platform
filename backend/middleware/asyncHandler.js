const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const errorMessages = {
  'not_found': { status: 404, ar: 'العنصر غير موجود', en: 'Not found' },
  'unauthorized': { status: 401, ar: 'غير مصرح', en: 'Unauthorized' },
  'forbidden': { status: 403, ar: 'ممنوع الوصول', en: 'Forbidden' },
  'bad_request': { status: 400, ar: 'طلب غير صالح', en: 'Bad request' },
  'conflict': { status: 409, ar: 'تعارض في البيانات', en: 'Conflict' },
  'server_error': { status: 500, ar: 'خطأ في الخادم', en: 'Server error' }
};

class AppError extends Error {
  constructor(type, customMessage) {
    const errorInfo = errorMessages[type] || errorMessages.server_error;
    super(customMessage || errorInfo.ar);
    this.status = errorInfo.status;
    this.type = type;
    this.messageAr = customMessage || errorInfo.ar;
    this.messageEn = errorInfo.en;
  }
}

const errorHandler = (err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`, err.stack ? err.stack.split('\n')[1] : '');
  
  if (err instanceof AppError) {
    return res.status(err.status).json({ 
      error: err.messageAr,
      errorEn: err.messageEn 
    });
  }
  
  res.status(500).json({ 
    error: 'حدث خطأ في الخادم',
    errorEn: 'Server error occurred'
  });
};

module.exports = { asyncHandler, AppError, errorHandler };
