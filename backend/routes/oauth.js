const express = require("express");
const passport = require("passport");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require("../db");
const jwt = require("jsonwebtoken");
const { JWT_SECRET, JWT_CONFIG } = require("../middleware/auth");
const { asyncHandler } = require('../middleware/asyncHandler');
const { sendWelcomeEmail } = require("../services/emailService");
const crypto = require("crypto");

const router = express.Router();

// Cookie configuration
const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const isCrossDomain = !!process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes('localhost');
  
  return {
    httpOnly: true,
    secure: isProduction || isCrossDomain,
    sameSite: isCrossDomain ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
};

function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'AQR';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  // Build callback URL - must be absolute URL
  const baseUrl = process.env.BACKEND_URL || process.env.FRONTEND_URL || 'http://localhost:10000';
  const callbackUrl = `${baseUrl.replace(/\/$/, '')}/api/auth/google/callback`;
  
  console.log('🔐 [OAuth] Initializing Google OAuth...');
  console.log(`   - Client ID: ${process.env.GOOGLE_CLIENT_ID.substring(0, 20)}...`);
  console.log(`   - Callback URL: ${callbackUrl}`);
  
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: callbackUrl
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      const name = profile.displayName || `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim();
      const googleId = profile.id;
      const photo = profile.photos?.[0]?.value;

      if (!email) {
        return done(new Error('No email provided by Google'));
      }

      // Check if user exists by email or google_id
      let user = await db.query(
        `SELECT * FROM users WHERE email = $1 OR google_id = $2 LIMIT 1`,
        [email.toLowerCase(), googleId]
      );

      if (user.rows.length > 0) {
        // User exists - update google_id if missing
        const existingUser = user.rows[0];
        if (!existingUser.google_id) {
          await db.query(
            `UPDATE users SET google_id = $1, profile_image = $2 WHERE id = $3`,
            [googleId, photo, existingUser.id]
          );
        }
        return done(null, existingUser);
      }

      // Create new user
      const referralCode = generateReferralCode();
      const emailVerificationToken = crypto.randomBytes(32).toString('hex');
      const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const result = await db.query(
        `INSERT INTO users (email, name, google_id, profile_image, email_verified, referral_code, email_verification_token, email_verification_expires)
         VALUES ($1, $2, $3, $4, true, $5, $6, $7)
         RETURNING id, email, name, phone, role, created_at, referral_code`,
        [email.toLowerCase(), name, googleId, photo, referralCode, emailVerificationToken, emailVerificationExpires]
      );

      const newUser = result.rows[0];

      // Assign free plan
      const { getFreePlan } = require("../services/planService");
      const freePlan = getFreePlan();
      if (freePlan) {
        await db.query(
          `INSERT INTO user_plans (user_id, plan_id, status, starts_at, expires_at)
           VALUES ($1, $2, 'active', NOW(), NULL)
           ON CONFLICT DO NOTHING`,
          [newUser.id, freePlan.id]
        );
      }

      // Send welcome email
      try {
        await sendWelcomeEmail(newUser.email, newUser.name);
      } catch (emailErr) {
        console.error('Failed to send welcome email:', emailErr);
      }

      return done(null, newUser);
    } catch (error) {
      console.error('Google OAuth error:', error);
      return done(error, null);
    }
  }));
  console.log('✅ [OAuth] Google OAuth configured successfully');
} else {
  console.log('⚠️ [OAuth] Google OAuth not configured - missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
}

// Google OAuth Routes
router.get('/google',
  passport.authenticate('google', { session: false, scope: ['profile', 'email'] })
);

router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/register?error=oauth_failed' }),
  asyncHandler(async (req, res) => {
    const user = req.user;
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      {
        expiresIn: JWT_CONFIG.expiresIn,
        issuer: JWT_CONFIG.issuer,
        audience: JWT_CONFIG.audience
      }
    );

    const frontendUrl = process.env.FRONTEND_URL || 'https://baytaljazeera.com';
    // Redirect to frontend with token - frontend will set the cookie
    res.redirect(`${frontendUrl}/oauth-callback?token=${encodeURIComponent(token)}&provider=google`);
  })
);

// Apple OAuth (simplified - requires Apple Developer account)
// Note: Apple Sign In requires more complex setup with private keys
// For now, we'll add a placeholder route
router.get('/apple', (req, res) => {
  res.status(501).json({ 
    error: 'Apple Sign In غير متاح حالياً. قريباً إن شاء الله.',
    errorEn: 'Apple Sign In is not available yet. Coming soon.'
  });
});

// OAuth status endpoint
router.get('/status', (req, res) => {
  res.json({
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    apple: false, // Will be enabled when implemented
    available: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  });
});

module.exports = router;
