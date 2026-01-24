const crypto = require('crypto');

const CSRF_TOKEN_LENGTH = 32;
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_COOKIE_NAME = 'csrf_token';

function generateCsrfToken() {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

function timingSafeCompare(a, b) {
  if (!a || !b || a.length !== b.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function csrfProtection(req, res, next) {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  
  if (safeMethods.includes(req.method)) {
    return next();
  }
  
  const tokenFromHeader = req.headers[CSRF_HEADER_NAME];
  const tokenFromCookie = req.cookies?.[CSRF_COOKIE_NAME];
  
  if (!tokenFromHeader || !tokenFromCookie) {
    return res.status(403).json({ 
      error: 'طلب غير صالح - يرجى تحديث الصفحة',
      errorEn: 'Invalid request - please refresh the page',
      code: 'CSRF_MISSING'
    });
  }
  
  if (!timingSafeCompare(tokenFromHeader, tokenFromCookie)) {
    return res.status(403).json({ 
      error: 'طلب غير صالح - يرجى تحديث الصفحة',
      errorEn: 'Invalid request - please refresh the page',
      code: 'CSRF_MISMATCH'
    });
  }
  
  next();
}

function setCsrfToken(req, res, next) {
  if (!req.cookies?.[CSRF_COOKIE_NAME]) {
    const token = generateCsrfToken();
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000
    });
  }
  next();
}

function getCsrfToken(req, res) {
  let token = req.cookies?.[CSRF_COOKIE_NAME];
  
  if (!token) {
    token = generateCsrfToken();
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000
    });
  }
  
  res.json({ csrfToken: token });
}

module.exports = {
  csrfProtection,
  setCsrfToken,
  getCsrfToken,
  generateCsrfToken,
  CSRF_HEADER_NAME,
  CSRF_COOKIE_NAME
};
