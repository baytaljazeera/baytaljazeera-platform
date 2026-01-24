// backend/middleware/auth.js - JWT Authentication Middleware with Role-Based Access Control
const jwt = require("jsonwebtoken");

// 🔒 Security: JWT_SECRET MUST be set separately - NO FALLBACK for security
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("❌ CRITICAL: JWT_SECRET is not set! Application cannot start securely.");
  console.error("   Please set JWT_SECRET environment variable with a strong random value.");
  process.exit(1);
}

console.log("✅ Using dedicated JWT_SECRET for token signing");

// JWT Configuration with audience and issuer for security
const JWT_CONFIG = {
  issuer: 'aqar-aljazeera',
  audience: 'aqar-aljazeera-users',
  expiresIn: '7d'
};

// تعريف الأدوار ومستوياتها
const ROLES = {
  user: { level: 0, name_ar: 'مستخدم' },
  super_admin: { level: 100, name_ar: 'المدير العام' },
  admin: { level: 100, name_ar: 'مدير' },
  admin_manager: { level: 80, name_ar: 'مدير إداري' },
  finance_admin: { level: 70, name_ar: 'إدارة المالية' },
  support_admin: { level: 60, name_ar: 'الدعم الفني' },
  content_admin: { level: 60, name_ar: 'إدارة المحتوى' },
};

// تعريف صلاحيات كل دور
const ROLE_PERMISSIONS = {
  super_admin: ['*'], // كل شيء
  admin: ['*'],
  admin_manager: [], // يحدد المدير العام صلاحياته
  finance_admin: ['dashboard:view', 'plans:*', 'membership:*', 'payments:*', 'users:view'],
  support_admin: ['dashboard:view', 'support:*', 'complaints:*', 'messages:*', 'users:view'],
  content_admin: ['dashboard:view', 'listings:*', 'reports:*', 'news:*', 'users:view'],
  user: [],
};

// 🔒 Security: Shared strict verification options for all JWT checks
const JWT_VERIFY_OPTIONS = {
  issuer: JWT_CONFIG.issuer,
  audience: JWT_CONFIG.audience,
  algorithms: ['HS256']
};

function authMiddleware(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");
  
  if (!token) {
    return res.status(401).json({ error: "غير مصرح", errorEn: "Unauthorized" });
  }

  try {
    // 🔒 Security: Verify with shared strict options
    const payload = jwt.verify(token, JWT_SECRET, JWT_VERIFY_OPTIONS);
    
    // 🔒 Validate required claims
    if (!payload.userId || !payload.role) {
      return res.status(401).json({ error: "رمز غير صالح", errorEn: "Invalid token claims" });
    }
    
    req.user = { 
      id: payload.userId, 
      role: payload.role,
      role_level: ROLES[payload.role]?.level || 0
    };
    next();
  } catch (err) {
    // 🔒 Security: Log the error type for monitoring but don't expose details
    const errorType = err.name || 'UnknownError';
    console.warn(`[Auth] Token verification failed: ${errorType}`);
    
    // Provide user-friendly error messages
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: "انتهت صلاحية الجلسة، سجل دخول من جديد", errorEn: "Session expired" });
    }
    
    return res.status(401).json({ error: "جلسة غير صالحة، سجل دخول من جديد", errorEn: "Invalid session" });
  }
}

function optionalAuth(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");
  
  if (token) {
    try {
      // 🔒 Security: Use same strict verification as authMiddleware
      const payload = jwt.verify(token, JWT_SECRET, JWT_VERIFY_OPTIONS);
      
      // 🔒 Validate required claims
      if (!payload.userId || !payload.role) {
        req.user = null;
      } else {
        req.user = { 
          id: payload.userId, 
          role: payload.role,
          role_level: ROLES[payload.role]?.level || 0
        };
      }
    } catch (err) {
      // Silent failure for optional auth - just set user to null
      req.user = null;
    }
  } else {
    req.user = null;
  }
  next();
}

// التحقق من أن المستخدم أحد أدوار الإدارة (أي admin)
async function adminOnly(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "غير مصرح", errorEn: "Unauthorized" });
  }
  
  const defaultAdminRoles = ['super_admin', 'admin', 'admin_manager', 'finance_admin', 'support_admin', 'content_admin'];
  
  if (defaultAdminRoles.includes(req.user.role)) {
    return next();
  }
  
  if (req.user.role !== 'user') {
    try {
      const db = require('../db');
      const customRole = await db.query(
        "SELECT key FROM custom_roles WHERE key = $1 AND is_active = true",
        [req.user.role]
      );
      if (customRole.rows.length > 0) {
        return next();
      }
    } catch (err) {
      console.error("Error checking custom role:", err);
    }
  }
  
  return res.status(403).json({ error: "هذا القسم مخصص للإدارة فقط", errorEn: "Admin access required" });
}

// دالة لإنشاء middleware يتحقق من أدوار محددة
// ملاحظة: الأدوار المخصصة لا تمر من هنا - يجب استخدام requirePermission للصلاحيات المخصصة
function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "غير مصرح", errorEn: "Unauthorized" });
    }

    // super_admin و admin لهم وصول لكل شيء
    if (req.user.role === 'super_admin' || req.user.role === 'admin') {
      return next();
    }

    // التحقق من الأدوار المسموحة
    if (allowedRoles.includes(req.user.role)) {
      return next();
    }

    const allowedNames = allowedRoles.map(r => ROLES[r]?.name_ar || r).join('، ');
    return res.status(403).json({ 
      error: `غير مسموح - هذا القسم مخصص لـ: ${allowedNames}`,
      errorEn: "Access denied - insufficient permissions"
    });
  };
}

// دالة للتحقق من صلاحية معينة
function requirePermission(permission) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "غير مصرح", errorEn: "Unauthorized" });
    }

    // super_admin و admin لهم كل الصلاحيات
    if (req.user.role === 'super_admin' || req.user.role === 'admin') {
      return next();
    }

    // التحقق من الصلاحيات الثابتة للأدوار الافتراضية
    const userPermissions = ROLE_PERMISSIONS[req.user.role] || [];
    
    // التحقق من صلاحية كاملة أو wildcard
    let hasPermission = userPermissions.includes('*') || 
                        userPermissions.includes(permission) ||
                        userPermissions.some(p => {
                          if (p.endsWith(':*')) {
                            const prefix = p.slice(0, -2);
                            return permission.startsWith(prefix + ':');
                          }
                          return false;
                        });

    // إذا لم يتم العثور على الصلاحية، تحقق من قاعدة البيانات للأدوار المخصصة
    if (!hasPermission && req.user.role !== 'user') {
      try {
        const db = require('../db');
        const dbPermission = await db.query(
          "SELECT is_granted FROM role_permissions WHERE role = $1 AND permission_key = $2 AND is_granted = true",
          [req.user.role, permission]
        );
        if (dbPermission.rows.length > 0) {
          hasPermission = true;
        }
      } catch (err) {
        console.error("Error checking DB permissions:", err);
      }
    }

    if (!hasPermission) {
      return res.status(403).json({ 
        error: "ليس لديك صلاحية لهذا الإجراء",
        errorEn: "Permission denied"
      });
    }
    next();
  };
}

// Alias for adminOnly
const adminMiddleware = adminOnly;

// قائمة أدوار الإدارة الافتراضية
const ADMIN_ROLES = ['super_admin', 'admin', 'admin_manager', 'finance_admin', 'support_admin', 'content_admin'];

// Combined auth middleware: supports both JWT and Replit OAuth session
async function combinedAuthMiddleware(req, res, next) {
  // First, try JWT authentication
  const token = req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");
  
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET, JWT_VERIFY_OPTIONS);
      
      if (payload.userId && payload.role) {
        req.user = { 
          id: payload.userId, 
          role: payload.role,
          role_level: ROLES[payload.role]?.level || 0
        };
        return next();
      }
    } catch (err) {
      // JWT failed, try session auth below
    }
  }
  
  // Second, try Replit OAuth session
  if (req.isAuthenticated && req.isAuthenticated() && req.user?.claims) {
    try {
      const db = require('../db');
      const replitUserId = req.user.claims.sub;
      
      // Find the local user linked to this Replit user
      const replitUserResult = await db.query(
        'SELECT local_user_id FROM replit_users WHERE id = $1',
        [replitUserId]
      );
      
      if (replitUserResult.rows.length > 0 && replitUserResult.rows[0].local_user_id) {
        const localUserId = replitUserResult.rows[0].local_user_id;
        const userResult = await db.query(
          'SELECT id, role FROM users WHERE id = $1',
          [localUserId]
        );
        
        if (userResult.rows.length > 0) {
          req.user = {
            id: userResult.rows[0].id,
            role: userResult.rows[0].role || 'user',
            role_level: ROLES[userResult.rows[0].role]?.level || 0
          };
          return next();
        }
      }
      
      // If no linked local user, try to find by email
      const email = req.user.claims.email;
      if (email) {
        const userByEmail = await db.query(
          'SELECT id, role FROM users WHERE email = $1',
          [email.toLowerCase()]
        );
        
        if (userByEmail.rows.length > 0) {
          req.user = {
            id: userByEmail.rows[0].id,
            role: userByEmail.rows[0].role || 'user',
            role_level: ROLES[userByEmail.rows[0].role]?.level || 0
          };
          return next();
        }
      }
    } catch (err) {
      console.error('[Auth] Session lookup error:', err.message);
    }
  }
  
  return res.status(401).json({ error: "غير مصرح", errorEn: "Unauthorized" });
}

module.exports = { 
  authMiddleware, 
  combinedAuthMiddleware,
  optionalAuth, 
  adminOnly, 
  adminMiddleware,
  requireRoles,
  requirePermission,
  ROLES,
  ROLE_PERMISSIONS,
  ADMIN_ROLES,
  JWT_SECRET,
  JWT_CONFIG,
  JWT_VERIFY_OPTIONS
};
