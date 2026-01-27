// backend/app.js - Express App Configuration (separado del server para testing)

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const session = require("express-session");
const passport = require("passport");
const { sanitizeInput } = require("./middleware/validation");

const isTest = process.env.NODE_ENV === 'test';

// Skip environment validation in test mode
if (!isTest) {
  const REQUIRED_ENV_VARS = ['SESSION_SECRET', 'DATABASE_URL'];
  const missingEnvVars = REQUIRED_ENV_VARS.filter(key => !process.env[key]);
  if (missingEnvVars.length > 0) {
    console.error('❌ CRITICAL: Missing required environment variables:', missingEnvVars.join(', '));
    process.exit(1);
  }
}

// Import routes
const authRoutes = require("./routes/auth");
const favoritesRoutes = require("./routes/favorites");
const notificationsRoutes = require("./routes/notifications");
const accountRoutes = require("./routes/account");
const plansRoutes = require("./routes/plans");
const adminRoutes = require("./routes/admin");
const membershipRoutes = require("./routes/membership");
const messagesRoutes = require("./routes/messages");
const adminMessagesRoutes = require("./routes/admin-messages");
const financeRoutes = require("./routes/finance");
const marketingRoutes = require("./routes/marketing");
const permissionsRoutes = require("./routes/permissions");
const paymentsRoutes = require("./routes/payments");
const quotaRoutes = require("./routes/quota");
const supportRoutes = require("./routes/support");
const eliteSlotsRoutes = require("./routes/elite-slots");
const whatsappRoutes = require("./routes/whatsapp");
const aiRoutes = require("./routes/ai");
const listingsRoutes = require("./routes/listings");
const reportsRoutes = require("./routes/reports");
const complaintsRoutes = require("./routes/complaints");
const newsRoutes = require("./routes/news");
const settingsRoutes = require("./routes/settings");
const exchangeRatesRoutes = require("./routes/exchange-rates");
const geolocationRoutes = require("./routes/geolocation");
const referralsRoutes = require("./routes/referrals");
const ambassadorRoutes = require("./routes/ambassador");
const promotionsRoutes = require("./routes/promotions");
const oauthRoutes = require("./routes/oauth");

function createApp() {
  const app = express();

  // Trust proxy for Replit
  app.set('trust proxy', 1);

  // Security Middleware - Helmet with hardened CSP
  const isProduction = process.env.NODE_ENV === 'production';
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: isProduction ? {
      directives: {
        defaultSrc: ["'self'"],
        // 🔒 Security: Removed unsafe-eval - only unsafe-inline for Next.js compatibility
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        // 🔒 Security: Restricted image sources to trusted domains
        imgSrc: ["'self'", "data:", "blob:", "https://*.tile.openstreetmap.org", "https://unpkg.com", "https://*.replit.dev", "https://*.replit.app"],
        // 🔒 Security: Restricted connect sources
        connectSrc: ["'self'", "https://*.replit.dev", "https://*.replit.app", "https://api.openai.com", "https://generativelanguage.googleapis.com", "wss:"],
        mediaSrc: ["'self'", "blob:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'", "https://*.replit.dev", "https://*.replit.app"],
        upgradeInsecureRequests: [],
      }
    } : false,
    // 🔒 Security: Strict Transport Security
    hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    // 🔒 Security: Prevent clickjacking
    xFrameOptions: false, // We use frameAncestors in CSP instead
    // 🔒 Security: Prevent MIME type sniffing
    noSniff: true,
    // 🔒 Security: XSS Protection
    xssFilter: true,
    permissionsPolicy: {
      features: {
        geolocation: ["'self'"],
        camera: ["'none'"],
        microphone: ["'none'"],
        payment: ["'self'"],
        usb: ["'none'"],
        bluetooth: ["'none'"],
      }
    },
  }));

  // Rate Limiting (disabled in test mode for speed)
  if (!isTest) {
    const { generalLimiter, authLimiter, registrationLimiter, strictAuthLimiter } = require("./config/security");

    app.use(generalLimiter);
    app.use("/api/auth/login", authLimiter);
    app.use("/api/auth/register", registrationLimiter);
    app.use("/api/auth/reset-password", strictAuthLimiter);
    app.use("/api/auth/forgot-password", strictAuthLimiter);
  }

  // CORS
  app.use(cors({
    origin: (origin, callback) => {
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
      // Allow all origins (for compatibility)
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  }));

  app.use(cookieParser());
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));

  // Session configuration for OAuth
  app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-secret-for-dev',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    }
  }));

  // Initialize Passport
  passport.serializeUser((user, done) => done(null, user.id || user));
  passport.deserializeUser((id, done) => done(null, id));
  app.use(passport.initialize());
  app.use(passport.session());

  // Input Sanitization
  app.use(sanitizeInput);

  // Request Logging (disabled in test mode)
  if (!isTest) {
    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        const logLevel = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
        if (req.path !== '/api/health' && !req.path.startsWith('/_next')) {
          console.log(`[${logLevel}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
        }
      });
      next();
    });
  }

  // Static files
  app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

  // Health check
  app.get('/api/health', async (req, res) => {
    try {
      const db = require('./db');
      await db.query('SELECT 1');
      res.json({ status: 'healthy', database: 'connected' });
    } catch (error) {
      res.status(503).json({ status: 'unhealthy', database: 'disconnected' });
    }
  });

  // Cloudinary status check
  app.get('/api/cloudinary-status', async (req, res) => {
    const { isCloudinaryConfigured, testCloudinaryConnection } = require('./services/cloudinaryService');
    const configured = isCloudinaryConfigured();
    
    const status = {
      configured,
      hasCloudinaryUrl: !!process.env.CLOUDINARY_URL,
      hasIndividualVars: !!(
        process.env.CLOUDINARY_CLOUD_NAME && 
        process.env.CLOUDINARY_API_KEY && 
        process.env.CLOUDINARY_API_SECRET
      ),
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || null,
      apiKeyPrefix: process.env.CLOUDINARY_API_KEY ? 
        `${process.env.CLOUDINARY_API_KEY.substring(0, 4)}...${process.env.CLOUDINARY_API_KEY.substring(process.env.CLOUDINARY_API_KEY.length - 4)}` : 
        null,
      connectionTest: null
    };
    
    // Test connection if configured
    if (configured) {
      try {
        const connectionTest = await testCloudinaryConnection();
        status.connectionTest = connectionTest;
      } catch (err) {
        status.connectionTest = {
          success: false,
          error: err.message
        };
      }
    }
    
    res.json(status);
  });

  // API Routes
  app.use("/api/auth", authRoutes);
  app.use("/api/auth", oauthRoutes);
  app.use("/api/favorites", favoritesRoutes);
  app.use("/api/notifications", notificationsRoutes);
  app.use("/api/account", accountRoutes);
  app.use("/api/plans", plansRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/membership", membershipRoutes);
  app.use("/api/messages", messagesRoutes);
  app.use("/api/admin/messages", adminMessagesRoutes);
  app.use("/api/finance", financeRoutes);
  app.use("/api/marketing", marketingRoutes);
  app.use("/api/permissions", permissionsRoutes);
  app.use("/api/payments", paymentsRoutes);
  app.use("/api/quota", quotaRoutes);
  app.use("/api/support", supportRoutes);
  app.use("/api/support-tickets", supportRoutes);
  app.use("/api/refunds", financeRoutes);
  app.use("/api/elite-slots", eliteSlotsRoutes);
  app.use("/api/whatsapp", whatsappRoutes);
  app.use("/api/ai", aiRoutes);
  app.use("/api/listings", listingsRoutes);
  app.use("/api/report-listing", reportsRoutes);
  app.use("/api/account-complaints", complaintsRoutes);
  app.use("/api/news", newsRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/exchange-rates", exchangeRatesRoutes);
  app.use("/api/geolocation", geolocationRoutes);
  app.use("/api/referrals", referralsRoutes);
  app.use("/api/ambassador", ambassadorRoutes);
  app.use("/api/promotions", promotionsRoutes);

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'المسار غير موجود' });
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    res.status(500).json({ error: 'حدث خطأ في الخادم' });
  });

  return app;
}

module.exports = { createApp };
