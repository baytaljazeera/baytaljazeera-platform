const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../db");
const { getCustomerUnreadAdminReplyCount } = require("../utils/supportTicketUnread");
const { JWT_SECRET, JWT_CONFIG, JWT_VERIFY_OPTIONS, optionalAuth } = require("../middleware/auth");
const { asyncHandler } = require('../middleware/asyncHandler');
const { validatePassword, PASSWORD_POLICY, sanitizeInput, strictAuthLimiter } = require("../config/security");
const { sendPasswordResetEmail, sendWelcomeEmail, sendEmailVerificationEmail } = require("../services/emailService");

const router = express.Router();

// Cookie configuration for cross-domain support (Vercel frontend ↔ Railway backend)
const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  // Use 'none' for cross-domain (different origins), 'lax' for same-domain
  const isCrossDomain = !!process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes('localhost');
  
  return {
    httpOnly: true,
    secure: isProduction || isCrossDomain, // Must be true for sameSite: 'none'
    sameSite: isCrossDomain ? 'none' : 'lax', // 'none' allows cross-domain cookies
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

router.post("/register", asyncHandler(async (req, res) => {
  const allowRegResult = await db.query(
    `SELECT value FROM app_settings WHERE key = 'allow_registration'`
  );
  const allowRegistration = allowRegResult.rows.length === 0 || allowRegResult.rows[0].value === 'true';
  
  if (!allowRegistration) {
    return res.status(403).json({ 
      error: "التسجيل مغلق حالياً", 
      errorEn: "Registration is currently closed" 
    });
  }

  const { email, password, name, phone, referral_code, referralCode } = req.body;
  const refCode = referral_code || referralCode;
  
  if (!email || !password) {
    return res.status(400).json({ error: "البريد وكلمة المرور مطلوبان", errorEn: "Email and password required" });
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return res.status(400).json({ 
      error: passwordValidation.errorMessage, 
      errorEn: "Password does not meet security requirements",
      requirements: passwordValidation.errors
    });
  }

  const sanitizedEmail = sanitizeInput(email.toLowerCase().trim());
  const sanitizedName = name ? sanitizeInput(name) : null;
  const sanitizedPhone = phone ? sanitizeInput(phone) : null;

  let referrerId = null;
  let referrerCode = null;
  if (refCode) {
    const normalizedCode = refCode.toUpperCase().trim();
    const referrerResult = await db.query(
      'SELECT id, referral_code, ambassador_code, email FROM users WHERE referral_code = $1 OR ambassador_code = $1',
      [normalizedCode]
    );
    if (referrerResult.rows.length > 0) {
      const referrer = referrerResult.rows[0];
      if (referrer.email.toLowerCase() !== sanitizedEmail) {
        referrerId = referrer.id;
        referrerCode = referrer.ambassador_code || referrer.referral_code;
      }
    }
  }

  const hashed = await bcrypt.hash(password, 10);
  let newReferralCode = generateReferralCode();
  let codeExists = true;
  let attempts = 0;
  while (codeExists && attempts < 10) {
    const checkCode = await db.query('SELECT 1 FROM users WHERE referral_code = $1', [newReferralCode]);
    if (checkCode.rows.length === 0) {
      codeExists = false;
    } else {
      newReferralCode = generateReferralCode();
      attempts++;
    }
  }

  // Generate email verification token
  const emailVerificationToken = crypto.randomBytes(32).toString('hex');
  const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  try {
    const result = await db.query(
      `INSERT INTO users (email, password_hash, name, phone, referral_code, referred_by, email_verification_token, email_verification_expires)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, email, name, phone, role, created_at, referral_code`,
      [sanitizedEmail, hashed, sanitizedName, sanitizedPhone, newReferralCode, referrerId, emailVerificationToken, emailVerificationExpires]
    );

    const user = result.rows[0];

    if (referrerId && referrerCode) {
      // جلب إعدادات السفراء لتحديد حالة الإحالة
      const settingsResult = await db.query(
        `SELECT require_first_listing, require_email_verified FROM ambassador_settings WHERE id = 1`
      );
      const settings = settingsResult.rows[0] || { require_first_listing: false, require_email_verified: false };
      
      // إذا كان اشتراط إعلان أول مفعّل، تُسجّل الإحالة كـ pending_listing
      // وإلا تُسجّل كـ completed مباشرة
      const initialStatus = settings.require_first_listing ? 'pending_listing' : 'completed';
      
      await db.query(
        `INSERT INTO referrals (referrer_id, referred_id, referral_code, status)
         VALUES ($1, $2, $3, $4)`,
        [referrerId, user.id, referrerCode, initialStatus]
      );
      
      // لا نحتسب الإحالة في referral_count إلا إذا كانت completed
      if (initialStatus === 'completed') {
        const updateResult = await db.query(
          `UPDATE users SET referral_count = referral_count + 1, updated_at = NOW()
           WHERE id = $1
           RETURNING referral_count, referral_reward_claimed`,
          [referrerId]
        );
      
        const referrerData = updateResult.rows[0];
        if (referrerData && referrerData.referral_count >= 10 && !referrerData.referral_reward_claimed) {
          let businessPlan = await db.query(
            `SELECT id, duration_days, max_listings FROM plans 
             WHERE ai_support_level = 3 AND visible = true AND price > 0 
             ORDER BY price DESC LIMIT 1`
          );
          
          if (businessPlan.rows.length === 0) {
            businessPlan = await db.query(
              `SELECT id, duration_days, max_listings FROM plans 
               WHERE ai_support_level >= 2 AND visible = true 
               ORDER BY ai_support_level DESC, price DESC LIMIT 1`
            );
          }
          
          if (businessPlan.rows.length > 0) {
            const plan = businessPlan.rows[0];
            const durationDays = 365;
            
            const userPlanResult = await db.query(
              `INSERT INTO user_plans (user_id, plan_id, status, started_at, expires_at, paid_amount)
               VALUES ($1, $2, 'active', NOW(), NOW() + INTERVAL '1 day' * $3, 0)
               RETURNING id, expires_at`,
              [referrerId, plan.id, durationDays]
            );
            const userPlanId = userPlanResult.rows[0].id;
            const expiresAt = userPlanResult.rows[0].expires_at;
            
            await db.query(
              `INSERT INTO quota_buckets (user_id, plan_id, user_plan_id, source, total_slots, used_slots, expires_at, active)
               VALUES ($1, $2, $3, 'referral_reward', $4, 0, $5, true)`,
              [referrerId, plan.id, userPlanId, plan.max_listings || 10, expiresAt]
            );
            
            await db.query(
              `INSERT INTO referral_rewards (user_id, reward_type, plan_id, user_plan_id, referral_count, notes)
               VALUES ($1, 'free_subscription', $2, $3, 10, 'مكافأة إحالة 10 عملاء - اشتراك سنة رجال أعمال مجاني')`,
              [referrerId, plan.id, userPlanId]
            );
            
            await db.query(
              `UPDATE users SET referral_reward_claimed = true, updated_at = NOW() WHERE id = $1`,
              [referrerId]
            );
            
            await db.query(
              `INSERT INTO notifications (user_id, title, body, type, created_at)
               VALUES ($1, '🎉 مبروك! حصلت على اشتراك مجاني', 'تهانينا! لقد أحلت 10 عملاء وحصلت على اشتراك سنة رجال أعمال مجاناً', 'referral_reward', NOW())`,
              [referrerId]
            );
            
            console.log(`🎁 Referral reward granted to user ${referrerId}: 1-year plan (ID: ${plan.id})`);
          } else {
            console.error(`❌ Referral reward FAILED for user ${referrerId}: No eligible plan found`);
            await db.query(
              `INSERT INTO notifications (user_id, title, body, type, created_at)
               VALUES ($1, '⚠️ مكافأة الإحالة قيد المعالجة', 'تهانينا على 10 إحالات! سيتم تفعيل اشتراكك المجاني قريباً', 'referral_pending', NOW())`,
              [referrerId]
            );
          }
        }
      }
      
      console.log(`📨 Referral registered: ${referrerCode} -> ${user.email} (status: ${initialStatus})`);
    }
    
    const freePlanResult = await db.query(
      `SELECT id, duration_days FROM plans WHERE price = 0 AND visible = true ORDER BY id LIMIT 1`
    );
    
    if (freePlanResult.rows.length > 0) {
      const freePlan = freePlanResult.rows[0];
      const durationDays = freePlan.duration_days || 30;
      
      const fullPlanResult = await db.query(
        `SELECT max_listings FROM plans WHERE id = $1`,
        [freePlan.id]
      );
      const maxListings = fullPlanResult.rows[0]?.max_listings || 1;
      
      const userPlanResult = await db.query(
        `INSERT INTO user_plans (user_id, plan_id, status, started_at, expires_at)
         VALUES ($1, $2, 'active', NOW(), NOW() + INTERVAL '1 day' * $3)
         RETURNING id, expires_at`,
        [user.id, freePlan.id, durationDays]
      );
      const userPlanId = userPlanResult.rows[0].id;
      const expiresAt = userPlanResult.rows[0].expires_at;
      
      await db.query(
        `INSERT INTO quota_buckets (user_id, plan_id, user_plan_id, source, total_slots, used_slots, expires_at, active)
         VALUES ($1, $2, $3, 'registration', $4, 0, $5, true)`,
        [user.id, freePlan.id, userPlanId, maxListings, expiresAt]
      );
      
      console.log(`✅ Assigned free plan and quota bucket (user_plan_id: ${userPlanId}) to new user ${user.email}`);
    } else {
      console.warn(`⚠️ No free plan found for new user ${user.email}`);
    }
    
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { 
        expiresIn: JWT_CONFIG.expiresIn,
        issuer: JWT_CONFIG.issuer,
        audience: JWT_CONFIG.audience
      }
    );

    // Send email verification email (non-blocking)
    try {
      const emailResult = await sendEmailVerificationEmail(user.email, emailVerificationToken, user.name);
      if (emailResult.success) {
        console.log(`✅ [Auth] Email verification sent successfully to ${user.email}, messageId: ${emailResult.messageId}`);
      } else {
        console.error(`❌ [Auth] Failed to send email verification to ${user.email}:`, emailResult.error);
      }
    } catch (emailErr) {
      console.error('❌ [Auth] Exception while sending email verification:', emailErr);
      // Don't fail registration if email fails
    }

    // Send welcome email (non-blocking) - after verification
    // We'll send welcome email after email is verified

    res
      .cookie("token", token, getCookieOptions())
      .json({ 
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          role: user.role,
        },
        token,
        message: "تم إنشاء الحساب بنجاح"
      });
  } catch (err) {
    if (err.code === "23505") {
      // Check constraint name to determine which field caused the duplicate
      const constraintName = err.constraint || '';
      if (constraintName.includes("email") || constraintName.includes("users_email")) {
        return res.status(409).json({ error: "البريد الإلكتروني مستخدم من قبل", errorEn: "Email already exists" });
      }
      if (constraintName.includes("phone") || constraintName.includes("users_phone")) {
        return res.status(409).json({ error: "رقم الجوال مستخدم من قبل. يرجى استخدام رقم هاتف آخر أو ترك الحقل فارغاً", errorEn: "Phone number already exists. Please use a different phone number or leave it empty" });
      }
      // Generic duplicate error
      return res.status(409).json({ error: "البيانات المدخلة مستخدمة من قبل", errorEn: "Data already exists" });
    }
    throw err;
  }
}));

router.post("/login", asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  
  // Validate JWT_SECRET before processing login
  if (!JWT_SECRET) {
    console.error("❌ CRITICAL: JWT_SECRET is not set in login route!");
    return res.status(500).json({ 
      error: "خطأ في إعدادات السيرفر - JWT_SECRET غير موجود",
      errorEn: "Server configuration error - JWT_SECRET missing"
    });
  }
  
  if (!email || !password) {
    return res.status(400).json({ error: "البريد وكلمة المرور مطلوبان", errorEn: "Email and password required" });
  }

  let user;
  try {
    const result = await db.query(
      "SELECT * FROM users WHERE email = $1",
      [email.toLowerCase().trim()]
    );
    user = result.rows[0];
  } catch (dbError) {
    console.error("❌ Database error during login:", dbError.message);
    console.error("Full error:", dbError);
    return res.status(500).json({ 
      error: "خطأ في الاتصال بقاعدة البيانات", 
      errorEn: "Database connection error",
      details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
    });
  }
  
  if (!user) {
    console.log(`⚠️ Login attempt failed: User not found - ${email}`);
    return res.status(401).json({ error: "بيانات الدخول غير صحيحة", errorEn: "Invalid credentials" });
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const remainingMinutes = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
    return res.status(423).json({ 
      error: `الحساب مقفل، حاول بعد ${remainingMinutes} دقيقة`, 
      errorEn: `Account locked, try again in ${remainingMinutes} minutes` 
    });
  }

  const validPassword = await bcrypt.compare(password, user.password_hash);
  if (!validPassword) {
    const failedAttempts = (user.failed_login_attempts || 0) + 1;
    
    if (failedAttempts >= PASSWORD_POLICY.maxLoginAttempts) {
      await db.query(
        `UPDATE users SET failed_login_attempts = $1, locked_until = NOW() + INTERVAL '30 minutes' WHERE id = $2`,
        [failedAttempts, user.id]
      );
      return res.status(423).json({ 
        error: "تم قفل الحساب بسبب محاولات فاشلة متعددة، حاول بعد 30 دقيقة", 
        errorEn: "Account locked due to multiple failed attempts" 
      });
    }
    
    await db.query(
      `UPDATE users SET failed_login_attempts = $1 WHERE id = $2`,
      [failedAttempts, user.id]
    );
    
    return res.status(401).json({ 
      error: "بيانات الدخول غير صحيحة", 
      errorEn: "Invalid credentials",
      attemptsRemaining: PASSWORD_POLICY.maxLoginAttempts - failedAttempts
    });
  }
  
  await db.query(
    `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
    [user.id]
  );

  // Only assign free plan to regular users (not admins) and only if they don't have a plan
  if (user.role === 'user') {
    try {
      const existingPlan = await db.query(
        `SELECT id FROM user_plans WHERE user_id = $1 LIMIT 1`,
        [user.id]
      );
      
      if (existingPlan.rows.length === 0) {
        const freePlanResult = await db.query(
          `SELECT id, duration_days FROM plans WHERE price = 0 AND visible = true ORDER BY id LIMIT 1`
        );
        
        if (freePlanResult.rows.length > 0) {
          const freePlan = freePlanResult.rows[0];
          const durationDays = freePlan.duration_days || 30;
          
          const fullPlanResult = await db.query(
            `SELECT max_listings FROM plans WHERE id = $1`,
            [freePlan.id]
          );
          const maxListings = fullPlanResult.rows[0]?.max_listings || 1;
          
          const userPlanResult = await db.query(
            `INSERT INTO user_plans (user_id, plan_id, status, started_at, expires_at)
             VALUES ($1, $2, 'active', NOW(), NOW() + INTERVAL '1 day' * $3)
             RETURNING id, expires_at`,
            [user.id, freePlan.id, durationDays]
          );
          const userPlanId = userPlanResult.rows[0].id;
          const expiresAt = userPlanResult.rows[0].expires_at;
          
          await db.query(
            `INSERT INTO quota_buckets (user_id, plan_id, user_plan_id, source, total_slots, used_slots, expires_at, active)
             VALUES ($1, $2, $3, 'login_assignment', $4, 0, $5, true)`,
            [user.id, freePlan.id, userPlanId, maxListings, expiresAt]
          );
          
          console.log(`✅ Assigned free plan and quota bucket (user_plan_id: ${userPlanId}) to existing user ${user.email} on login`);
        } else {
          console.warn(`⚠️ No free plan found for user ${user.email} - skipping plan assignment`);
        }
      }
    } catch (planError) {
      // Don't fail login if plan assignment fails - just log the error
      console.error(`⚠️ Error assigning plan to user ${user.email}:`, planError.message);
    }
  }

  try {
    await db.query(
      `UPDATE users SET last_login_at = NOW(), login_count = COALESCE(login_count, 0) + 1 WHERE id = $1`,
      [user.id]
    );
  } catch (updateErr) {
    console.error("Error updating last_login_at:", updateErr.message);
    // Don't fail login if this update fails
  }

  if (!JWT_SECRET) {
    console.error("❌ JWT_SECRET is not set!");
    return res.status(500).json({ 
      error: "خطأ في إعدادات السيرفر", 
      errorEn: "Server configuration error" 
    });
  }

  let token;
  try {
    token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { 
        expiresIn: JWT_CONFIG.expiresIn,
        issuer: JWT_CONFIG.issuer,
        audience: JWT_CONFIG.audience
      }
    );
  } catch (jwtErr) {
    console.error("Error signing JWT:", jwtErr.message);
    return res.status(500).json({ 
      error: "خطأ في إنشاء رمز الدخول", 
      errorEn: "Token generation error" 
    });
  }

  res
    .cookie("token", token, getCookieOptions())
    .json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        whatsapp: user.whatsapp,
        role: user.role,
      },
      token,
      message: "تم تسجيل الدخول بنجاح"
    });
}));

router.post("/logout", (req, res) => {
  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        console.warn("Session destroy error:", err);
      }
    });
  }
  
  const clearOpts = { ...getCookieOptions(), path: "/" };
  res
    .clearCookie("token", clearOpts)
    .clearCookie("connect.sid", clearOpts)
    .json({ ok: true, message: "تم تسجيل الخروج بنجاح" });
});

router.get("/me", asyncHandler(async (req, res) => {
  const token = req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");
  
  if (!token) {
    return res.status(401).json({ error: "غير مسجل الدخول", errorEn: "Not logged in" });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET, JWT_VERIFY_OPTIONS);
  } catch (err) {
    return res.status(401).json({ error: "انتهت صلاحية الجلسة", errorEn: "Session expired" });
  }
  
  // Try to read the international fields (country/timezone/preferred_language)
  // added by migration 20260525130000. If the columns don't exist yet in this
  // environment, fall back to the legacy column set so /me keeps responding.
  let result;
  try {
    result = await db.query(
      `SELECT id, email, name, phone, whatsapp, role, email_verified_at, phone_verified_at, created_at,
              country, timezone, preferred_language
       FROM users WHERE id = $1`,
      [payload.userId]
    );
  } catch (err) {
    if (err && err.code === '42703') {
      result = await db.query(
        `SELECT id, email, name, phone, whatsapp, role, email_verified_at, phone_verified_at, created_at
         FROM users WHERE id = $1`,
        [payload.userId]
      );
    } else {
      throw err;
    }
  }
  
  const user = result.rows[0];
  if (!user) {
    return res.status(401).json({ error: "المستخدم غير موجود", errorEn: "User not found" });
  }

  const planResult = await db.query(
    `SELECT p.* FROM user_plans up
     JOIN plans p ON up.plan_id = p.id
     WHERE up.user_id = $1 AND up.status = 'active' AND (up.expires_at IS NULL OR up.expires_at > NOW())
     ORDER BY up.started_at DESC LIMIT 1`,
    [user.id]
  );

  let ticketsUnread = 0;
  if (user.role === "user") {
    ticketsUnread = await getCustomerUnreadAdminReplyCount(db, user.id);
  }

  res.json({
    user: {
      ...user,
      emailVerified: !!user.email_verified_at,
      phoneVerified: !!user.phone_verified_at,
    },
    plan: planResult.rows[0] || null,
    ticketsUnread,
  });
}));

router.post("/forgot-password", strictAuthLimiter, asyncHandler(async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: "البريد الإلكتروني مطلوب", errorEn: "Email is required" });
  }

  const sanitizedEmail = sanitizeInput(email.toLowerCase().trim());
  
  const userResult = await db.query(
    `SELECT id, email, name FROM users WHERE email = $1`,
    [sanitizedEmail]
  );

  if (userResult.rows.length > 0) {
    const user = userResult.rows[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await db.query(
      `DELETE FROM password_reset_tokens WHERE user_id = $1`,
      [user.id]
    );

    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    try {
      await sendPasswordResetEmail(user.email, resetToken, user.name);
      console.log(`📧 Password reset email sent to ${user.email}`);
    } catch (emailErr) {
      console.error('❌ Failed to send password reset email:', emailErr);
    }
  }

  res.json({ 
    ok: true, 
    message: "إذا كان البريد الإلكتروني مسجلاً لدينا، ستصلك رسالة تحتوي على رابط إعادة التعيين" 
  });
}));

router.post("/reset-password", strictAuthLimiter, asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  
  if (!token || !password) {
    return res.status(400).json({ 
      error: "الرمز وكلمة المرور الجديدة مطلوبان", 
      errorEn: "Token and new password are required" 
    });
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return res.status(400).json({ 
      error: passwordValidation.errorMessage, 
      errorEn: "Password does not meet security requirements",
      requirements: passwordValidation.errors
    });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const tokenResult = await db.query(
    `SELECT prt.*, u.email, u.name 
     FROM password_reset_tokens prt
     JOIN users u ON prt.user_id = u.id
     WHERE prt.token_hash = $1 AND prt.expires_at > NOW() AND prt.used_at IS NULL`,
    [tokenHash]
  );

  if (tokenResult.rows.length === 0) {
    return res.status(400).json({ 
      error: "الرابط غير صالح أو منتهي الصلاحية", 
      errorEn: "Invalid or expired reset link" 
    });
  }

  const resetRecord = tokenResult.rows[0];
  const hashedPassword = await bcrypt.hash(password, 10);

  await db.query(
    `UPDATE users SET password_hash = $1, failed_login_attempts = 0, lockout_until = NULL, updated_at = NOW()
     WHERE id = $2`,
    [hashedPassword, resetRecord.user_id]
  );

  await db.query(
    `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`,
    [resetRecord.id]
  );

  console.log(`✅ Password reset successful for user ${resetRecord.email}`);

  res.json({ 
    ok: true, 
    message: "تم إعادة تعيين كلمة المرور بنجاح! يمكنك الآن تسجيل الدخول." 
  });
}));

// ========== EMAIL VERIFICATION ==========

router.get("/verify-email", asyncHandler(async (req, res) => {
  const { token } = req.query;
  
  if (!token) {
    return res.status(400).json({ 
      error: "رمز التأكيد مطلوب", 
      errorEn: "Verification token required" 
    });
  }

  try {
    const result = await db.query(
      `SELECT id, email, email_verified_at, email_verification_expires 
       FROM users 
       WHERE email_verification_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ 
        error: "رمز التأكيد غير صالح", 
        errorEn: "Invalid verification token" 
      });
    }

    const user = result.rows[0];

    // Check if already verified
    if (user.email_verified_at) {
      return res.status(400).json({ 
        error: "البريد الإلكتروني مؤكد بالفعل", 
        errorEn: "Email already verified" 
      });
    }

    // Check if token expired
    if (new Date(user.email_verification_expires) < new Date()) {
      return res.status(400).json({ 
        error: "انتهت صلاحية رمز التأكيد", 
        errorEn: "Verification token expired" 
      });
    }

    // Verify email
    await db.query(
      `UPDATE users 
       SET email_verified_at = NOW(), 
           email_verification_token = NULL, 
           email_verification_expires = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    // Send welcome email after verification
    try {
      await sendWelcomeEmail(user.email, user.name || 'عزيزنا العميل');
      console.log(`📧 Welcome email sent to ${user.email} after verification`);
    } catch (emailErr) {
      console.error('❌ Failed to send welcome email:', emailErr);
    }

    res.json({ 
      ok: true,
      message: "تم تأكيد بريدك الإلكتروني بنجاح",
      messageEn: "Email verified successfully"
    });
  } catch (err) {
    console.error("Email verification error:", err);
    res.status(500).json({ 
      error: "حدث خطأ أثناء تأكيد البريد الإلكتروني", 
      errorEn: "Error verifying email" 
    });
  }
}));

// Resend verification email
// Allow resending without authentication - user just needs to provide their email
// Use optionalAuth to set req.user if token exists, but don't require it
router.post("/resend-verification", strictAuthLimiter, optionalAuth, asyncHandler(async (req, res) => {
  console.log('📧 [Resend Verification] Request received');
  console.log('📧 [Resend Verification] Body:', JSON.stringify(req.body));
  console.log('📧 [Resend Verification] User:', req.user ? 'Authenticated' : 'Not authenticated');
  
  const { email } = req.body;
  
  // Try to get userId from auth first (if user is logged in)
  // Note: req.user might be set by optionalAuth middleware if token exists
  let userId = req.user?.id || req.user?.userId;
  
  console.log('📧 [Resend Verification] userId:', userId, 'email:', email);
  
  // If no userId from auth, require email in body
  if (!userId && !email) {
    console.log('📧 [Resend Verification] Missing both userId and email');
    return res.status(400).json({ 
      error: "يرجى إدخال بريدك الإلكتروني", 
      errorEn: "Email is required" 
    });
  }

  try {
    let result;
    if (userId) {
      // If user is authenticated, use userId
      result = await db.query(
        `SELECT id, email, name, email_verified_at, email_verification_token, email_verification_expires
         FROM users 
         WHERE id = $1`,
        [userId]
      );
    } else {
      // If not authenticated, use email from body
      if (!email || !email.trim()) {
        console.log('📧 [Resend Verification] No email provided and user not authenticated');
        return res.status(400).json({ 
          error: "يرجى إدخال بريدك الإلكتروني", 
          errorEn: "Email is required" 
        });
      }
      
      const sanitizedEmail = sanitizeInput(email.toLowerCase().trim());
      console.log('📧 [Resend Verification] Looking up user by email:', sanitizedEmail);
      result = await db.query(
        `SELECT id, email, name, email_verified_at, email_verification_token, email_verification_expires
         FROM users 
         WHERE email = $1`,
        [sanitizedEmail]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: "المستخدم غير موجود", 
        errorEn: "User not found" 
      });
    }

    const user = result.rows[0];

    // Check if already verified
    if (user.email_verified_at) {
      return res.status(400).json({ 
        error: "البريد الإلكتروني مؤكد بالفعل", 
        errorEn: "Email already verified" 
      });
    }

    // Generate new verification token
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db.query(
      `UPDATE users 
       SET email_verification_token = $1, 
           email_verification_expires = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [emailVerificationToken, emailVerificationExpires, user.id]
    );

    // Send verification email
    try {
      const emailResult = await sendEmailVerificationEmail(user.email, emailVerificationToken, user.name);
      if (emailResult.success) {
        console.log(`✅ [Auth] Verification email resent successfully to ${user.email}, messageId: ${emailResult.messageId}`);
      } else {
        console.error(`❌ [Auth] Failed to resend verification email to ${user.email}:`, emailResult.error);
        return res.status(500).json({ 
          error: `فشل إرسال إيميل التأكيد: ${emailResult.error}`, 
          errorEn: `Failed to send verification email: ${emailResult.error}` 
        });
      }
    } catch (emailErr) {
      console.error('❌ [Auth] Exception while resending verification email:', emailErr);
      return res.status(500).json({ 
        error: "فشل إرسال إيميل التأكيد", 
        errorEn: "Failed to send verification email" 
      });
    }

    res.json({ 
      ok: true,
      message: "تم إرسال إيميل التأكيد بنجاح",
      messageEn: "Verification email sent successfully"
    });
  } catch (err) {
    console.error("Resend verification error:", err);
    res.status(500).json({ 
      error: "حدث خطأ أثناء إرسال إيميل التأكيد", 
      errorEn: "Error sending verification email" 
    });
  }
}));

module.exports = router;
