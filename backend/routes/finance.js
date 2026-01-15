// backend/routes/finance.js - Finance Admin Routes
const express = require("express");
const db = require("../db");
const fs = require("fs");
const path = require("path");
const { authMiddleware, requireRoles } = require("../middleware/auth");
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();

function sendRefundEmail(type, refund, userEmail, userName, decisionNote, bankReference) {
  const emailLogPath = path.join(__dirname, '../../public/emails');
  if (!fs.existsSync(emailLogPath)) {
    fs.mkdirSync(emailLogPath, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const emailId = `REFUND-${type.toUpperCase()}-${timestamp}`;
  
  let subject, body;
  
  if (type === 'approved') {
    subject = 'تمت الموافقة على طلب الاسترداد - بيت الجزيرة';
    body = `
      عزيزي/عزيزتي ${userName || 'العميل'},
      
      يسعدنا إبلاغك بأنه تمت الموافقة على طلب الاسترداد الخاص بك.
      
      المبلغ: ${refund.amount} ر.س
      ${decisionNote ? 'ملاحظة: ' + decisionNote : ''}
      
      سيتم تحويل المبلغ إلى حسابك البنكي خلال 3-5 أيام عمل.
      
      شكراً لثقتكم في بيت الجزيرة.
    `;
  } else if (type === 'rejected') {
    subject = 'تم رفض طلب الاسترداد - بيت الجزيرة';
    body = `
      عزيزي/عزيزتي ${userName || 'العميل'},
      
      نأسف لإبلاغك بأنه تم رفض طلب الاسترداد الخاص بك.
      
      المبلغ المطلوب: ${refund.amount} ر.س
      سبب الرفض: ${decisionNote || 'لا يوجد'}
      
      إذا كان لديك أي استفسار، يرجى التواصل مع خدمة العملاء.
      
      شكراً لتفهمكم.
    `;
  } else if (type === 'completed') {
    subject = 'تم تحويل مبلغ الاسترداد - بيت الجزيرة';
    body = `
      عزيزي/عزيزتي ${userName || 'العميل'},
      
      يسعدنا إبلاغك بأنه تم تحويل مبلغ الاسترداد إلى حسابك البنكي بنجاح.
      
      المبلغ المحول: ${refund.amount} ر.س
      ${bankReference ? 'رقم المرجع البنكي: ' + bankReference : ''}
      
      شكراً لثقتكم في بيت الجزيرة.
    `;
  }
  
  const emailLog = {
    id: emailId,
    to: userEmail,
    subject,
    body,
    refund_id: refund.id,
    type: `refund_${type}`,
    sent_at: new Date().toISOString()
  };
  
  fs.writeFileSync(
    path.join(emailLogPath, `${emailId}.json`),
    JSON.stringify(emailLog, null, 2)
  );
  
  console.log(`📧 Email sent to ${userEmail}: ${subject}`);
}

function sendRefundInvoiceEmail(refund, refundInvoiceNumber) {
  const emailLogPath = path.join(__dirname, '../../public/emails');
  if (!fs.existsSync(emailLogPath)) {
    fs.mkdirSync(emailLogPath, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const emailId = `REFUND-INVOICE-${timestamp}`;
  
  const subject = 'فاتورة استرداد - بيت الجزيرة';
  const body = `
    عزيزي/عزيزتي ${refund.user_name || 'العميل'},
    
    تم إصدار فاتورة استرداد لطلبك.
    
    رقم الفاتورة: ${refundInvoiceNumber}
    المبلغ المسترد: ${refund.amount} ر.س
    ${refund.bank_reference ? 'رقم المرجع البنكي: ' + refund.bank_reference : ''}
    
    يمكنك الاطلاع على الفاتورة وطباعتها من خلال حسابك على المنصة.
    
    شكراً لثقتكم في بيت الجزيرة.
  `;
  
  const emailLog = {
    id: emailId,
    to: refund.user_email,
    subject,
    body,
    refund_id: refund.id,
    refund_invoice_number: refundInvoiceNumber,
    type: 'refund_invoice',
    sent_at: new Date().toISOString()
  };
  
  fs.writeFileSync(
    path.join(emailLogPath, `${emailId}.json`),
    JSON.stringify(emailLog, null, 2)
  );
  
  console.log(`📧 Email sent to ${refund.user_email}: ${subject}`);
}

router.get("/stats", authMiddleware, requireRoles('finance_admin'), asyncHandler(async (req, res) => {
  const totalUsersResult = await db.query(`SELECT COUNT(*) as count FROM users WHERE role = 'user'`);
  const totalUsers = parseInt(totalUsersResult.rows[0].count);

  const activeSubscribersResult = await db.query(`
    SELECT COUNT(DISTINCT up.user_id) as count 
    FROM user_plans up
    WHERE up.status = 'active' 
      AND (up.expires_at IS NULL OR up.expires_at > NOW())
  `);
  const activeSubscribers = parseInt(activeSubscribersResult.rows[0].count);

  const expiredSubscribersResult = await db.query(`
    SELECT COUNT(DISTINCT up.user_id) as count 
    FROM user_plans up
    WHERE up.status = 'active' 
      AND up.expires_at IS NOT NULL 
      AND up.expires_at <= NOW()
  `);
  const expiredSubscribers = parseInt(expiredSubscribersResult.rows[0].count);

  const suspendedSubscribersResult = await db.query(`
    SELECT COUNT(DISTINCT up.user_id) as count 
    FROM user_plans up
    WHERE up.status = 'suspended'
  `);
  const suspendedSubscribers = parseInt(suspendedSubscribersResult.rows[0].count);

  const totalRevenueResult = await db.query(`
    SELECT COALESCE(SUM(CASE WHEN up.paid_amount > 0 THEN up.paid_amount ELSE p.price END), 0) as total 
    FROM user_plans up
    JOIN plans p ON up.plan_id = p.id
    WHERE p.price > 0
      AND up.status = 'active'
      AND up.id = (SELECT id FROM user_plans WHERE user_id = up.user_id ORDER BY started_at DESC LIMIT 1)
  `);
  const totalRevenue = parseFloat(totalRevenueResult.rows[0].total) || 0;

  const monthlyRevenueResult = await db.query(`
    SELECT COALESCE(SUM(CASE WHEN up.paid_amount > 0 THEN up.paid_amount ELSE p.price END), 0) as total 
    FROM user_plans up
    JOIN plans p ON up.plan_id = p.id
    WHERE p.price > 0 
      AND up.status = 'active'
      AND up.started_at >= DATE_TRUNC('month', CURRENT_DATE)
      AND up.id = (SELECT id FROM user_plans WHERE user_id = up.user_id ORDER BY started_at DESC LIMIT 1)
  `);
  const monthlyRevenue = parseFloat(monthlyRevenueResult.rows[0].total) || 0;

  const totalRefundsResult = await db.query(`
    SELECT COALESCE(SUM(amount), 0) as total FROM refunds WHERE status = 'approved'
  `);
  const totalRefunds = parseFloat(totalRefundsResult.rows[0].total) || 0;

  const pendingRefundsResult = await db.query(`
    SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM refunds WHERE status = 'pending'
  `);
  const pendingRefundsCount = parseInt(pendingRefundsResult.rows[0].count);
  const pendingRefundsAmount = parseFloat(pendingRefundsResult.rows[0].total) || 0;

  const planDistributionResult = await db.query(`
    SELECT p.name_ar, p.color, COUNT(up.id) as subscribers
    FROM plans p
    LEFT JOIN user_plans up ON p.id = up.plan_id AND up.status = 'active'
    WHERE p.visible = true
    GROUP BY p.id, p.name_ar, p.color
    ORDER BY p.sort_order
  `);

  const monthlyTrendResult = await db.query(`
    SELECT 
      TO_CHAR(DATE_TRUNC('month', up.started_at), 'YYYY-MM') as month,
      COUNT(*) as subscriptions,
      COALESCE(SUM(CASE WHEN up.paid_amount > 0 THEN up.paid_amount ELSE p.price END), 0) as revenue
    FROM user_plans up
    JOIN plans p ON up.plan_id = p.id
    WHERE up.started_at >= NOW() - INTERVAL '12 months'
      AND up.status = 'active'
      AND up.id = (SELECT id FROM user_plans WHERE user_id = up.user_id ORDER BY started_at DESC LIMIT 1)
    GROUP BY DATE_TRUNC('month', up.started_at)
    ORDER BY month DESC
    LIMIT 12
  `);

  res.json({
    users: {
      total: totalUsers,
      active: activeSubscribers,
      expired: expiredSubscribers,
      suspended: suspendedSubscribers,
      noSubscription: totalUsers - activeSubscribers - expiredSubscribers - suspendedSubscribers
    },
    revenue: {
      total: totalRevenue,
      monthly: monthlyRevenue,
      refundsTotal: totalRefunds,
      pendingRefunds: pendingRefundsAmount,
      pendingRefundsCount
    },
    planDistribution: planDistributionResult.rows,
    monthlyTrend: monthlyTrendResult.rows
  });
}));

router.get("/subscribers", authMiddleware, requireRoles('finance_admin'), asyncHandler(async (req, res) => {
  const { status, planId, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  
  let whereClause = "WHERE u.role = 'user'";
  const params = [];
  let paramIndex = 1;
  
  if (status === 'active') {
    whereClause += ` AND up.status = 'active' AND (up.expires_at IS NULL OR up.expires_at > NOW())`;
  } else if (status === 'expired') {
    whereClause += ` AND up.status = 'active' AND up.expires_at <= NOW()`;
  } else if (status === 'suspended') {
    whereClause += ` AND up.status = 'suspended'`;
  }
  
  if (planId) {
    whereClause += ` AND up.plan_id = $${paramIndex}`;
    params.push(planId);
    paramIndex++;
  }
  
  params.push(parseInt(limit), offset);
  
  const result = await db.query(`
    SELECT 
      u.id, u.name, u.email, u.phone, u.created_at as registered_at,
      up.id as subscription_id, up.plan_id, up.status as subscription_status,
      up.started_at, up.expires_at, up.paid_amount, up.suspended_at, up.suspension_reason,
      p.name_ar as plan_name, p.price as plan_price, p.color as plan_color
    FROM users u
    LEFT JOIN user_plans up ON u.id = up.user_id AND up.id = (
      SELECT id FROM user_plans WHERE user_id = u.id ORDER BY started_at DESC LIMIT 1
    )
    LEFT JOIN plans p ON up.plan_id = p.id
    ${whereClause}
    ORDER BY up.started_at DESC NULLS LAST
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, params);
  
  const countResult = await db.query(`
    SELECT COUNT(DISTINCT u.id) as total
    FROM users u
    LEFT JOIN user_plans up ON u.id = up.user_id
    ${whereClause}
  `, params.slice(0, -2));
  
  res.json({
    subscribers: result.rows,
    total: parseInt(countResult.rows[0].total),
    page: parseInt(page),
    limit: parseInt(limit)
  });
}));

router.patch("/subscribers/:userId/suspend", authMiddleware, requireRoles('finance_admin'), asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { reason } = req.body;
  
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: "سبب الإيقاف مطلوب للتوثيق" });
  }
  
  const result = await db.query(`
    UPDATE user_plans 
    SET status = 'suspended', 
        suspended_by = $1, 
        suspended_at = NOW(), 
        suspension_reason = $2
    WHERE user_id = $3 AND status = 'active'
    RETURNING user_id
  `, [req.user.id, reason, userId]);
  
  if (result.rows.length > 0) {
    const userResult = await db.query(
      'SELECT name, email FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      
      await db.query(`
        INSERT INTO notifications (user_id, type, title, body, channel, status, payload, scheduled_at)
        VALUES ($1, 'subscription_suspended', 'تم إيقاف اشتراكك مؤقتاً', $2, 'app', 'pending', $3, NOW())
      `, [
        userId,
        `تم إيقاف اشتراكك مؤقتاً. السبب: ${reason}. للمزيد من المعلومات تواصل مع الدعم الفني.`,
        JSON.stringify({ reason, suspended_by: req.user.id })
      ]);
      
      const emailLogPath = path.join(__dirname, '../../public/emails');
      if (!fs.existsSync(emailLogPath)) {
        fs.mkdirSync(emailLogPath, { recursive: true });
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const emailId = `SUSPENSION-${timestamp}`;
      
      const emailLog = {
        id: emailId,
        to: user.email,
        subject: 'تم إيقاف اشتراكك مؤقتاً - بيت الجزيرة',
        body: `
          عزيزي/عزيزتي ${user.name || 'العميل'},
          
          نود إعلامك بأنه تم إيقاف اشتراكك مؤقتاً على منصة بيت الجزيرة.
          
          سبب الإيقاف: ${reason}
          
          إذا كان لديك أي استفسار، يرجى التواصل مع فريق الدعم الفني.
          
          شكراً لتفهمكم.
        `,
        user_id: userId,
        type: 'subscription_suspended',
        sent_at: new Date().toISOString()
      };
      
      fs.writeFileSync(
        path.join(emailLogPath, `${emailId}.json`),
        JSON.stringify(emailLog, null, 2)
      );
      
      console.log(`📧 Email sent to ${user.email}: Subscription Suspended`);
    }
  }
  
  res.json({ ok: true, message: "تم إيقاف الاشتراك وإشعار العميل" });
}));

router.patch("/subscribers/:userId/activate", authMiddleware, requireRoles('finance_admin'), asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { reason } = req.body;
  
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: "سبب التفعيل مطلوب للتوثيق" });
  }
  
  const result = await db.query(`
    UPDATE user_plans 
    SET status = 'active', 
        suspended_by = NULL, 
        suspended_at = NULL, 
        suspension_reason = NULL
    WHERE user_id = $1 AND status = 'suspended'
    RETURNING user_id
  `, [userId]);
  
  if (result.rows.length > 0) {
    const userResult = await db.query(
      'SELECT name, email FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      
      await db.query(`
        INSERT INTO notifications (user_id, type, title, body, channel, status, payload, scheduled_at)
        VALUES ($1, 'subscription_activated', 'تم إعادة تفعيل اشتراكك', $2, 'app', 'pending', $3, NOW())
      `, [
        userId,
        `تم إعادة تفعيل اشتراكك بنجاح. السبب: ${reason}`,
        JSON.stringify({ reason, activated_by: req.user.id })
      ]);
      
      const emailLogPath = path.join(__dirname, '../../public/emails');
      if (!fs.existsSync(emailLogPath)) {
        fs.mkdirSync(emailLogPath, { recursive: true });
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const emailId = `ACTIVATION-${timestamp}`;
      
      const emailLog = {
        id: emailId,
        to: user.email,
        subject: 'تم إعادة تفعيل اشتراكك - بيت الجزيرة',
        body: `
          عزيزي/عزيزتي ${user.name || 'العميل'},
          
          يسعدنا إبلاغك بأنه تم إعادة تفعيل اشتراكك بنجاح.
          
          سبب التفعيل: ${reason}
          
          يمكنك الآن الاستمتاع بجميع مزايا باقتك.
          
          شكراً لثقتكم في بيت الجزيرة.
        `,
        user_id: userId,
        type: 'subscription_activated',
        sent_at: new Date().toISOString()
      };
      
      fs.writeFileSync(
        path.join(emailLogPath, `${emailId}.json`),
        JSON.stringify(emailLog, null, 2)
      );
      
      console.log(`📧 Email sent to ${user.email}: Subscription Activated`);
    }
  }
  
  res.json({ ok: true, message: "تم تفعيل الاشتراك وإشعار العميل" });
}));

router.get("/pending-bank-count", authMiddleware, asyncHandler(async (req, res) => {
  const isAdmin = ['super_admin', 'admin', 'finance_admin'].includes(req.user.role);
  
  if (!isAdmin) {
    return res.json({ count: 0 });
  }
  
  const result = await db.query(`
    SELECT COUNT(*) as count 
    FROM refunds 
    WHERE status = 'approved' AND payout_confirmed_at IS NULL
  `);
  
  res.json({ count: parseInt(result.rows[0].count) || 0 });
}));

router.get("/refunds", authMiddleware, requireRoles('finance_admin'), asyncHandler(async (req, res) => {
  const { status } = req.query;
  
  let whereClause = "";
  const params = [];
  
  if (status && ['pending', 'approved', 'rejected', 'completed'].includes(status)) {
    whereClause = "WHERE r.status = $1";
    params.push(status);
  }
  
  const result = await db.query(`
    SELECT 
      r.*,
      u.name as user_name, u.email as user_email, u.phone as user_phone,
      i.invoice_number,
      p.name_ar as plan_name,
      proc.name as processed_by_name
    FROM refunds r
    JOIN users u ON r.user_id = u.id
    LEFT JOIN invoices i ON i.id = r.invoice_id
    LEFT JOIN plans p ON p.id = i.plan_id
    LEFT JOIN users proc ON proc.id = r.processed_by
    ${whereClause}
    ORDER BY r.created_at DESC
  `, params);
  
  res.json({ refunds: result.rows });
}));

router.post("/refunds", authMiddleware, requireRoles('finance_admin'), asyncHandler(async (req, res) => {
  const { userId, user_id, userPlanId, user_plan_id, invoice_id, amount, reason } = req.body;
  const actualUserId = userId || user_id;
  const actualUserPlanId = userPlanId || user_plan_id;
  
  if (!actualUserId || !amount) {
    return res.status(400).json({ error: "المستخدم والمبلغ مطلوبان" });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: "مبلغ الاسترداد غير صالح" });
  }
  
  const roundedAmount = Math.round(parsedAmount * 100) / 100;
  
  const client = await db.getClient();
  let didCommit = false;
  
  try {
    await client.query('BEGIN');
    
    let originalAmount = null;
    let refundType = 'full';
    
    if (invoice_id) {
      const invoiceResult = await client.query(
        'SELECT total FROM invoices WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [invoice_id, actualUserId]
      );
      if (invoiceResult.rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(404).json({ error: "الفاتورة غير موجودة" });
      }
      const paidAmount = parseFloat(invoiceResult.rows[0].total);
      originalAmount = paidAmount;
      
      if (roundedAmount > paidAmount) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({ 
          error: `مبلغ الاسترداد (${roundedAmount} ر.س) يتجاوز المبلغ المدفوع (${paidAmount} ر.س)` 
        });
      }
      
      refundType = roundedAmount < paidAmount ? 'partial' : 'full';

      const existingRefund = await client.query(
        'SELECT id, amount FROM refunds WHERE invoice_id = $1 AND status != $2 FOR UPDATE',
        [invoice_id, 'rejected']
      );
      if (existingRefund.rows.length > 0) {
        const existingTotal = existingRefund.rows.reduce((sum, r) => sum + parseFloat(r.amount), 0);
        if (existingTotal + roundedAmount > paidAmount) {
          await client.query('ROLLBACK');
          client.release();
          return res.status(400).json({ 
            error: `إجمالي الاستردادات (${existingTotal + roundedAmount} ر.س) يتجاوز المبلغ المدفوع (${paidAmount} ر.س)` 
          });
        }
      }
    } else if (actualUserPlanId) {
      const planResult = await client.query(
        'SELECT paid_amount FROM user_plans WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [actualUserPlanId, actualUserId]
      );
      if (planResult.rows.length > 0) {
        const paidAmount = parseFloat(planResult.rows[0].paid_amount) || 0;
        originalAmount = paidAmount;
        if (paidAmount > 0) {
          if (roundedAmount > paidAmount) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(400).json({ 
              error: `مبلغ الاسترداد (${roundedAmount} ر.س) يتجاوز المبلغ المدفوع (${paidAmount} ر.س)` 
            });
          }
          refundType = roundedAmount < paidAmount ? 'partial' : 'full';
        }
      }
    }
    
    const result = await client.query(`
      INSERT INTO refunds (user_id, user_plan_id, invoice_id, amount, original_amount, refund_type, reason, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW(), NOW())
      RETURNING *
    `, [actualUserId, actualUserPlanId || null, invoice_id || null, roundedAmount, originalAmount, refundType, reason || null]);

    await client.query(`
      INSERT INTO billing_audit_log (action, user_id, admin_id, details)
      VALUES ('REFUND_REQUESTED', $1, $2, $3)
    `, [actualUserId, req.user.id, JSON.stringify({ 
      refundId: result.rows[0].id, 
      amount: roundedAmount,
      originalAmount,
      refundType,
      invoiceId: invoice_id,
      reason 
    })]);
    
    await client.query('COMMIT');
    didCommit = true;
    client.release();
    
    res.json({ ok: true, refund: result.rows[0] });
  } catch (err) {
    if (!didCommit) {
      try { await client.query('ROLLBACK'); } catch (rollbackErr) { /* ignore */ }
    }
    try { client.release(); } catch (releaseErr) { /* ignore */ }
    throw err;
  }
}));

router.patch("/refunds/:id/approve", authMiddleware, requireRoles('finance_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { decision_note, subscription_action, cancel_quota } = req.body;
  
  const result = await db.query(`
    UPDATE refunds 
    SET status = 'approved', processed_by = $1, processed_at = NOW(), updated_at = NOW(),
        decision_note = $2
    WHERE id = $3 AND status = 'pending'
    RETURNING *, 
      (SELECT email FROM users WHERE id = user_id) as user_email,
      (SELECT name FROM users WHERE id = user_id) as user_name
  `, [req.user.id, decision_note || null, id]);
  
  if (result.rows.length > 0) {
    const refund = result.rows[0];
    
    if (subscription_action === 'suspend') {
      if (refund.user_plan_id) {
        await db.query(`
          UPDATE user_plans 
          SET status = 'suspended', 
              suspended_by = $1, 
              suspended_at = NOW(), 
              suspension_reason = 'تم الإيقاف بسبب الاسترداد'
          WHERE id = $2 AND status = 'active'
        `, [req.user.id, refund.user_plan_id]);
      } else {
        await db.query(`
          UPDATE user_plans 
          SET status = 'suspended', 
              suspended_by = $1, 
              suspended_at = NOW(), 
              suspension_reason = 'تم الإيقاف بسبب الاسترداد'
          WHERE id = (SELECT id FROM user_plans WHERE user_id = $2 AND status = 'active' ORDER BY started_at DESC LIMIT 1)
        `, [req.user.id, refund.user_id]);
      }
    } else if (subscription_action === 'cancel') {
      if (refund.user_plan_id) {
        await db.query(`
          UPDATE user_plans 
          SET status = 'cancelled', 
              cancelled_at = NOW(), 
              cancellation_reason = 'تم الإلغاء بسبب الاسترداد'
          WHERE id = $1 AND status = 'active'
        `, [refund.user_plan_id]);
      } else {
        await db.query(`
          UPDATE user_plans 
          SET status = 'cancelled', 
              cancelled_at = NOW(), 
              cancellation_reason = 'تم الإلغاء بسبب الاسترداد'
          WHERE id = (SELECT id FROM user_plans WHERE user_id = $1 AND status = 'active' ORDER BY started_at DESC LIMIT 1)
        `, [refund.user_id]);
      }
    }
    
    if (cancel_quota) {
      if (refund.user_plan_id) {
        await db.query(`
          UPDATE quota_buckets 
          SET expires_at = NOW(), 
              updated_at = NOW()
          WHERE user_plan_id = $1 AND (expires_at IS NULL OR expires_at > NOW())
        `, [refund.user_plan_id]);
      } else {
        await db.query(`
          UPDATE quota_buckets 
          SET expires_at = NOW(), 
              updated_at = NOW()
          WHERE id = (SELECT id FROM quota_buckets WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY created_at ASC LIMIT 1)
        `, [refund.user_id]);
      }
    }
    
    let notificationBody = `تمت الموافقة على طلب استرداد بمبلغ ${refund.amount} ر.س. سيتم تحويل المبلغ إلى حسابك خلال 3-5 أيام عمل.`;
    if (subscription_action === 'suspend') {
      notificationBody += ' تم إيقاف اشتراكك مؤقتاً.';
    } else if (subscription_action === 'cancel') {
      notificationBody += ' تم إلغاء اشتراكك.';
    }
    
    await db.query(`
      INSERT INTO notifications (user_id, type, title, body, channel, status, payload, scheduled_at)
      VALUES ($1, 'refund_approved', 'تمت الموافقة على طلب الاسترداد', $2, 'app', 'pending', $3, NOW())
    `, [
      refund.user_id,
      notificationBody,
      JSON.stringify({ refund_id: refund.id, amount: refund.amount, subscription_action, cancel_quota })
    ]);
    
    sendRefundEmail('approved', refund, refund.user_email, refund.user_name, decision_note, null);
  }
  
  res.json({ ok: true, message: "تم الموافقة على طلب الاسترداد" });
}));

router.patch("/refunds/:id/reject", authMiddleware, requireRoles('finance_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { decision_note } = req.body;
  
  const result = await db.query(`
    UPDATE refunds 
    SET status = 'rejected', processed_by = $1, processed_at = NOW(), updated_at = NOW(),
        decision_note = $2
    WHERE id = $3 AND status = 'pending'
    RETURNING *,
      (SELECT email FROM users WHERE id = user_id) as user_email,
      (SELECT name FROM users WHERE id = user_id) as user_name
  `, [req.user.id, decision_note || 'تم الرفض', id]);
  
  if (result.rows.length > 0) {
    const refund = result.rows[0];
    await db.query(`
      INSERT INTO notifications (user_id, type, title, body, channel, status, payload, scheduled_at)
      VALUES ($1, 'refund_rejected', 'تم رفض طلب الاسترداد', $2, 'app', 'pending', $3, NOW())
    `, [
      refund.user_id,
      `تم رفض طلب استرداد بمبلغ ${refund.amount} ر.س. السبب: ${decision_note || 'لا يوجد'}`,
      JSON.stringify({ refund_id: refund.id, reason: decision_note })
    ]);
    
    sendRefundEmail('rejected', refund, refund.user_email, refund.user_name, decision_note, null);
  }
  
  res.json({ ok: true, message: "تم رفض طلب الاسترداد" });
}));

router.patch("/refunds/:id/confirm-payout", authMiddleware, requireRoles('finance_admin'), asyncHandler(async (req, res) => {
  const client = await db.pool.connect();
  let didCommit = false;
  
  try {
    const { id } = req.params;
    const { bank_reference } = req.body;

    if (isNaN(parseInt(id))) {
      client.release();
      return res.status(400).json({ error: "معرف الاسترداد غير صالح" });
    }
    
    await client.query('BEGIN');
    
    const result = await client.query(`
      UPDATE refunds 
      SET status = 'completed', payout_confirmed_at = NOW(), bank_reference = $1, updated_at = NOW()
      WHERE id = $2 AND status = 'approved'
      RETURNING *,
        (SELECT email FROM users WHERE id = user_id) as user_email,
        (SELECT name FROM users WHERE id = user_id) as user_name
    `, [bank_reference || null, id]);
    
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({ error: "الطلب غير موجود أو غير موافق عليه" });
    }
    
    const refund = result.rows[0];
    
    let refundInvoiceNumber = refund.refund_invoice_number;
    if (!refundInvoiceNumber) {
      const year = new Date().getFullYear();
      const lockId = 2000000 + year;
      
      await client.query(`SELECT pg_advisory_xact_lock($1)`, [lockId]);
      
      const seqResult = await client.query(`
        SELECT COALESCE(MAX(CAST(SUBSTRING(refund_invoice_number FROM 'RFD-\\d{4}-(\\d+)') AS INTEGER)), 0) + 1 as next_num 
        FROM refunds WHERE refund_invoice_number LIKE $1
      `, [`RFD-${year}-%`]);
      const nextNum = seqResult.rows[0].next_num;
      refundInvoiceNumber = `RFD-${year}-${String(nextNum).padStart(6, '0')}`;
      
      await client.query(`
        UPDATE refunds 
        SET refund_invoice_number = $1, refund_invoice_issued_at = NOW(), updated_at = NOW()
        WHERE id = $2
      `, [refundInvoiceNumber, id]);
    }
    
    await client.query(`
      INSERT INTO notifications (user_id, type, title, body, channel, status, payload, scheduled_at)
      VALUES ($1, 'refund_completed', 'تم تحويل مبلغ الاسترداد', $2, 'app', 'pending', $3, NOW())
    `, [
      refund.user_id,
      `تم تحويل مبلغ ${refund.amount} ر.س إلى حسابك البنكي بنجاح. رقم فاتورة الاسترداد: ${refundInvoiceNumber}${bank_reference ? '. رقم المرجع البنكي: ' + bank_reference : ''}`,
      JSON.stringify({ refund_id: refund.id, amount: refund.amount, bank_reference, refund_invoice_number: refundInvoiceNumber })
    ]);

    await client.query(`
      INSERT INTO billing_audit_log (action, user_id, admin_id, details)
      VALUES ('REFUND_COMPLETED', $1, $2, $3)
    `, [refund.user_id, req.user.id, JSON.stringify({ 
      refundId: refund.id, 
      amount: refund.amount,
      refundInvoiceNumber,
      bankReference: bank_reference
    })]);
    
    await client.query('COMMIT');
    didCommit = true;
    client.release();
    
    try {
      sendRefundEmail('completed', refund, refund.user_email, refund.user_name, null, bank_reference);
      sendRefundInvoiceEmail(refund, refundInvoiceNumber);
    } catch (emailErr) {
      console.error("Email sending failed (non-critical):", emailErr);
    }
    
    res.json({ ok: true, message: "تم تأكيد التحويل البنكي وإصدار الفاتورة", refund_invoice_number: refundInvoiceNumber });
  } catch (err) {
    if (!didCommit) {
      try { await client.query('ROLLBACK'); } catch (rollbackErr) { /* ignore */ }
    }
    try { client.release(); } catch (releaseErr) { /* ignore if already released */ }
    throw err;
  }
}));

router.post("/refunds/:id/generate-invoice", authMiddleware, requireRoles('finance_admin'), asyncHandler(async (req, res) => {
  const client = await db.pool.connect();
  let didCommit = false;
  
  try {
    const { id } = req.params;

    if (isNaN(parseInt(id))) {
      client.release();
      return res.status(400).json({ error: "معرف الاسترداد غير صالح" });
    }
    
    await client.query('BEGIN');
    
    const refundResult = await client.query(`
      SELECT r.*, 
             u.name as user_name, u.email as user_email, u.phone as user_phone,
             i.invoice_number as original_invoice_number,
             p.name_ar as plan_name, p.name_en as plan_name_en
      FROM refunds r
      JOIN users u ON r.user_id = u.id
      LEFT JOIN invoices i ON i.id = r.invoice_id
      LEFT JOIN plans p ON p.id = i.plan_id
      WHERE r.id = $1 AND r.status = 'completed'
      FOR UPDATE OF r
    `, [id]);
    
    if (refundResult.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({ error: "طلب الاسترداد غير موجود أو غير مكتمل" });
    }
    
    const refund = refundResult.rows[0];
    
    if (refund.refund_invoice_number) {
      await client.query('COMMIT');
      didCommit = true;
      client.release();
      return res.json({ 
        ok: true, 
        refund_invoice_number: refund.refund_invoice_number,
        message: "الفاتورة موجودة مسبقاً" 
      });
    }
    
    const year = new Date().getFullYear();
    const lockId = 2000000 + year;
    
    await client.query(`SELECT pg_advisory_xact_lock($1)`, [lockId]);
    
    const seqResult = await client.query(`
      SELECT COALESCE(MAX(CAST(SUBSTRING(refund_invoice_number FROM 'RFD-\\d{4}-(\\d+)') AS INTEGER)), 0) + 1 as next_num 
      FROM refunds WHERE refund_invoice_number LIKE $1
    `, [`RFD-${year}-%`]);
    const nextNum = seqResult.rows[0].next_num;
    const refundInvoiceNumber = `RFD-${year}-${String(nextNum).padStart(6, '0')}`;
    
    await client.query(`
      UPDATE refunds 
      SET refund_invoice_number = $1, refund_invoice_issued_at = NOW(), updated_at = NOW()
      WHERE id = $2
    `, [refundInvoiceNumber, id]);
    
    await client.query(`
      INSERT INTO notifications (user_id, type, title, body, channel, status, payload, scheduled_at)
      VALUES ($1, 'refund_invoice', 'فاتورة استرداد جديدة', $2, 'app', 'pending', $3, NOW())
    `, [
      refund.user_id,
      `تم إصدار فاتورة استرداد بمبلغ ${refund.amount} ر.س. رقم الفاتورة: ${refundInvoiceNumber}`,
      JSON.stringify({ refund_id: refund.id, refund_invoice_number: refundInvoiceNumber, amount: refund.amount })
    ]);
    
    await client.query(`
      INSERT INTO billing_audit_log (action, user_id, admin_id, details)
      VALUES ('REFUND_INVOICE_GENERATED', $1, $2, $3)
    `, [refund.user_id, req.user.id, JSON.stringify({ 
      refundId: refund.id, 
      refundInvoiceNumber,
      amount: refund.amount
    })]);
    
    await client.query('COMMIT');
    didCommit = true;
    client.release();
    
    try {
      sendRefundInvoiceEmail(refund, refundInvoiceNumber);
    } catch (emailErr) {
      console.error("Refund invoice email failed (non-critical):", emailErr);
    }
    
    res.json({ 
      ok: true, 
      refund_invoice_number: refundInvoiceNumber,
      message: "تم إنشاء فاتورة الاسترداد بنجاح" 
    });
  } catch (err) {
    if (!didCommit) {
      try { await client.query('ROLLBACK'); } catch (rollbackErr) { /* ignore */ }
    }
    try { client.release(); } catch (releaseErr) { /* ignore if already released */ }
    throw err;
  }
}));

router.get("/refund-invoices/:refundId", authMiddleware, requireRoles('finance_admin'), asyncHandler(async (req, res) => {
  const { refundId } = req.params;
  
  const result = await db.query(`
    SELECT r.*, 
           u.name as user_name, u.email as user_email, u.phone as user_phone,
           i.invoice_number as original_invoice_number,
           p.name_ar as plan_name, p.name_en as plan_name_en, p.duration_days
    FROM refunds r
    JOIN users u ON r.user_id = u.id
    LEFT JOIN invoices i ON i.id = r.invoice_id
    LEFT JOIN plans p ON p.id = i.plan_id
    WHERE r.id = $1
  `, [refundId]);
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "طلب الاسترداد غير موجود" });
  }
  
  res.json({ refund: result.rows[0] });
}));

router.get("/messages", authMiddleware, requireRoles('finance_admin'), asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT 
      c.*,
      u.name as user_name, u.email as user_email, u.phone as user_phone,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.is_read = false AND m.sender_type = 'user') as unread_count
    FROM conversations c
    JOIN users u ON c.user_id = u.id
    WHERE c.department = 'finance'
    ORDER BY c.last_message_at DESC
  `);
  
  res.json({ conversations: result.rows });
}));

router.get("/messages/:conversationId", authMiddleware, requireRoles('finance_admin'), asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  
  const conversationResult = await db.query(`
    SELECT c.*, u.name as user_name, u.email as user_email
    FROM conversations c
    JOIN users u ON c.user_id = u.id
    WHERE c.id = $1 AND c.department = 'finance'
  `, [conversationId]);
  
  if (conversationResult.rows.length === 0) {
    return res.status(404).json({ error: "المحادثة غير موجودة" });
  }
  
  const messagesResult = await db.query(`
    SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC
  `, [conversationId]);
  
  await db.query(`
    UPDATE messages SET is_read = true 
    WHERE conversation_id = $1 AND sender_type = 'user' AND is_read = false
  `, [conversationId]);
  
  res.json({
    conversation: conversationResult.rows[0],
    messages: messagesResult.rows
  });
}));

router.post("/messages/:conversationId/reply", authMiddleware, requireRoles('finance_admin'), asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const { content } = req.body;
  
  if (!content?.trim()) {
    return res.status(400).json({ error: "محتوى الرسالة مطلوب" });
  }
  
  const result = await db.query(`
    INSERT INTO messages (conversation_id, sender_type, sender_id, sender_name, content)
    VALUES ($1, 'admin', $2, $3, $4)
    RETURNING *
  `, [conversationId, req.user.id, req.user.name, content.trim()]);
  
  await db.query(`
    UPDATE conversations SET last_message_at = NOW(), updated_at = NOW()
    WHERE id = $1
  `, [conversationId]);
  
  res.json({ ok: true, message: result.rows[0] });
}));

router.get("/payments", authMiddleware, requireRoles('finance_admin'), asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  
  let whereClause = "";
  const params = [];
  
  if (status) {
    whereClause = "WHERE pay.status = $1";
    params.push(status);
  }
  
  const countResult = await db.query(`
    SELECT COUNT(*) as count FROM payments pay ${whereClause}
  `, params);
  
  const result = await db.query(`
    SELECT pay.*, 
           u.name as user_name, u.email as user_email,
           p.name_ar as plan_name,
           prev.name_ar as previous_plan_name
    FROM payments pay
    LEFT JOIN users u ON pay.user_id = u.id
    LEFT JOIN plans p ON pay.plan_id = p.id
    LEFT JOIN plans prev ON pay.previous_plan_id = prev.id
    ${whereClause}
    ORDER BY pay.created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `, [...params, parseInt(limit), offset]);
  
  res.json({
    payments: result.rows,
    total: parseInt(countResult.rows[0].count),
    page: parseInt(page),
    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit))
  });
}));

router.get("/invoices", authMiddleware, requireRoles('finance_admin'), asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const pageInt = parseInt(page) || 1;
  const limitInt = Math.min(parseInt(limit) || 20, 100);
  const offset = (pageInt - 1) * limitInt;
  
  let whereClause = "";
  let paramIndex = 1;
  const params = [];
  
  if (status) {
    whereClause = `WHERE i.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }
  
  const countResult = await db.query(
    `SELECT COUNT(*) as count FROM invoices i ${whereClause}`,
    params
  );
  
  params.push(limitInt, offset);
  const limitPlaceholder = `$${paramIndex}`;
  const offsetPlaceholder = `$${paramIndex + 1}`;
  
  const result = await db.query(`
    WITH invoice_refs AS (
      SELECT DISTINCT ON (inv.id) 
             inv.id as invoice_id,
             r.referrer_id,
             ref.name as referrer_name, 
             COALESCE(ref.ambassador_code, ref.referral_code) as referrer_code
      FROM invoices inv
      LEFT JOIN users usr ON inv.user_id = usr.id
      LEFT JOIN referrals r ON r.referred_id = usr.id AND r.status = 'completed'
      LEFT JOIN users ref ON ref.id = r.referrer_id
      ORDER BY inv.id, r.created_at DESC NULLS LAST, r.id DESC
    )
    SELECT i.*, 
           u.name as user_name, u.email as user_email,
           p.name_ar as plan_name,
           ir.referrer_name, ir.referrer_code,
           CASE WHEN ir.referrer_id IS NOT NULL THEN true ELSE false END as has_referrer
    FROM invoices i
    LEFT JOIN users u ON i.user_id = u.id
    LEFT JOIN plans p ON i.plan_id = p.id
    LEFT JOIN invoice_refs ir ON ir.invoice_id = i.id
    ${whereClause}
    ORDER BY i.created_at DESC
    LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
  `, params);
  
  res.json({
    invoices: result.rows,
    total: parseInt(countResult.rows[0].count),
    page: pageInt,
    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limitInt)
  });
}));

router.get("/invoices/:id", authMiddleware, requireRoles('finance_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const result = await db.query(`
    SELECT i.*, 
           u.name as user_name, u.email as user_email, u.phone as user_phone,
           p.name_ar as plan_name, p.name_en as plan_name_en, p.duration_days,
           pay.transaction_id, pay.payment_method,
           prev_plan.name_ar as previous_plan_name,
           CASE WHEN pay.previous_plan_id IS NOT NULL THEN 'upgrade' ELSE 'subscription' END as invoice_type,
           ref.name as referrer_name, ref.email as referrer_email, COALESCE(ref.ambassador_code, ref.referral_code) as referrer_code,
           CASE WHEN r.id IS NOT NULL THEN true ELSE false END as has_referrer
    FROM invoices i
    LEFT JOIN users u ON i.user_id = u.id
    LEFT JOIN plans p ON i.plan_id = p.id
    LEFT JOIN payments pay ON i.payment_id = pay.id
    LEFT JOIN plans prev_plan ON pay.previous_plan_id = prev_plan.id
    LEFT JOIN LATERAL (
      SELECT * FROM referrals 
      WHERE referred_id = u.id AND status = 'completed' 
      ORDER BY created_at DESC LIMIT 1
    ) r ON true
    LEFT JOIN users ref ON ref.id = r.referrer_id
    WHERE i.id = $1
  `, [id]);
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "الفاتورة غير موجودة" });
  }
  
  res.json({ invoice: result.rows[0] });
}));

router.get("/payment-stats", authMiddleware, requireRoles('finance_admin'), asyncHandler(async (req, res) => {
  const totalPaymentsResult = await db.query(`
    SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total 
    FROM payments WHERE status = 'completed'
  `);
  
  const todayPaymentsResult = await db.query(`
    SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total 
    FROM payments 
    WHERE status = 'completed' AND created_at >= DATE_TRUNC('day', NOW())
  `);
  
  const monthPaymentsResult = await db.query(`
    SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total 
    FROM payments 
    WHERE status = 'completed' AND created_at >= DATE_TRUNC('month', NOW())
  `);
  
  const invoicesCountResult = await db.query(`
    SELECT COUNT(*) as count FROM invoices
  `);
  
  res.json({
    total: {
      count: parseInt(totalPaymentsResult.rows[0].count),
      amount: parseFloat(totalPaymentsResult.rows[0].total) || 0
    },
    today: {
      count: parseInt(todayPaymentsResult.rows[0].count),
      amount: parseFloat(todayPaymentsResult.rows[0].total) || 0
    },
    month: {
      count: parseInt(monthPaymentsResult.rows[0].count),
      amount: parseFloat(monthPaymentsResult.rows[0].total) || 0
    },
    invoicesCount: parseInt(invoicesCountResult.rows[0].count)
  });
}));

// ========== Chargebacks System ==========

router.get("/chargebacks", authMiddleware, requireRoles('finance_admin'), asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  
  let whereClause = "";
  const params = [];
  
  if (status && ['received', 'under_review', 'evidence_submitted', 'won', 'lost', 'accepted'].includes(status)) {
    whereClause = "WHERE c.status = $1";
    params.push(status);
  }
  
  const countResult = await db.query(`
    SELECT COUNT(*) as count FROM chargebacks c ${whereClause}
  `, params);
  
  const result = await db.query(`
    SELECT c.*, 
           u.name as user_name, u.email as user_email,
           pay.transaction_id, pay.payment_method,
           i.invoice_number,
           p.name_ar as plan_name,
           proc.name as processed_by_name
    FROM chargebacks c
    JOIN users u ON c.user_id = u.id
    JOIN payments pay ON c.payment_id = pay.id
    LEFT JOIN invoices i ON c.invoice_id = i.id
    LEFT JOIN plans p ON pay.plan_id = p.id
    LEFT JOIN users proc ON c.processed_by = proc.id
    ${whereClause}
    ORDER BY c.created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `, [...params, parseInt(limit), offset]);
  
  res.json({
    chargebacks: result.rows,
    total: parseInt(countResult.rows[0].count),
    page: parseInt(page),
    totalPages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit))
  });
}));

router.get("/chargebacks/pending-count", authMiddleware, requireRoles('finance_admin'), asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT COUNT(*) as count FROM chargebacks WHERE status IN ('received', 'under_review')
  `);
  res.json({ count: parseInt(result.rows[0].count) || 0 });
}));

router.post("/chargebacks", authMiddleware, requireRoles('finance_admin'), asyncHandler(async (req, res) => {
  const { payment_id, amount, reason, bank_reference, bank_reason_code, notes } = req.body;
  
  if (!payment_id || !amount) {
    return res.status(400).json({ error: "رقم الدفعة والمبلغ مطلوبان" });
  }
  
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: "مبلغ الاعتراض غير صالح - يجب أن يكون رقمًا موجبًا" });
  }
  
  const roundedAmount = Math.round(parsedAmount * 100) / 100;
  
  const paymentResult = await db.query(`
    SELECT p.*, i.id as invoice_id, i.invoice_number 
    FROM payments p
    LEFT JOIN invoices i ON i.payment_id = p.id
    WHERE p.id = $1
  `, [payment_id]);
  
  if (paymentResult.rows.length === 0) {
    return res.status(404).json({ error: "الدفعة غير موجودة" });
  }
  
  const payment = paymentResult.rows[0];
  
  if (roundedAmount > parseFloat(payment.amount)) {
    return res.status(400).json({ 
      error: `مبلغ الاعتراض (${roundedAmount} ر.س) يتجاوز مبلغ الدفعة (${payment.amount} ر.س)` 
    });
  }
  
  const existingChargeback = await db.query(
    'SELECT id FROM chargebacks WHERE payment_id = $1 AND status NOT IN ($2, $3)',
    [payment_id, 'lost', 'accepted']
  );
  if (existingChargeback.rows.length > 0) {
    return res.status(400).json({ error: "يوجد اعتراض بنكي سابق لهذه الدفعة" });
  }
  
  const result = await db.query(`
    INSERT INTO chargebacks (payment_id, invoice_id, user_id, amount, reason, bank_reference, bank_reason_code, notes, status, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'received', NOW(), NOW())
    RETURNING *
  `, [payment_id, payment.invoice_id, payment.user_id, roundedAmount, reason || null, bank_reference || null, bank_reason_code || null, notes || null]);
  
  await db.query(`
    INSERT INTO billing_audit_log (action, user_id, admin_id, details)
    VALUES ('CHARGEBACK_RECEIVED', $1, $2, $3)
  `, [payment.user_id, req.user.id, JSON.stringify({ 
    chargebackId: result.rows[0].id,
    paymentId: payment_id,
    amount: roundedAmount,
    bankReference: bank_reference
  })]);
  
  res.json({ ok: true, chargeback: result.rows[0] });
}));

router.patch("/chargebacks/:id/status", authMiddleware, requireRoles('finance_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, notes, evidence_details } = req.body;
  
  const validStatuses = ['received', 'under_review', 'evidence_submitted', 'won', 'lost', 'accepted'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: "حالة غير صالحة" });
  }
  
  const updateFields = ['status = $1', 'updated_at = NOW()', 'processed_by = $2'];
  const params = [status, req.user.id];
  let paramIndex = 3;
  
  if (notes) {
    updateFields.push(`notes = $${paramIndex}`);
    params.push(notes);
    paramIndex++;
  }
  
  if (evidence_details) {
    updateFields.push(`evidence_details = $${paramIndex}`);
    updateFields.push('evidence_submitted = TRUE');
    params.push(JSON.stringify(evidence_details));
    paramIndex++;
  }
  
  if (['won', 'lost', 'accepted'].includes(status)) {
    updateFields.push('outcome = $' + paramIndex);
    updateFields.push('outcome_date = NOW()');
    params.push(status);
    paramIndex++;
  }
  
  params.push(id);
  
  const result = await db.query(`
    UPDATE chargebacks 
    SET ${updateFields.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `, params);
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "الاعتراض البنكي غير موجود" });
  }
  
  const chargeback = result.rows[0];
  
  if (status === 'accepted' || status === 'lost') {
    await db.query(`
      UPDATE payments SET status = 'chargebacked', metadata = metadata || $1
      WHERE id = $2
    `, [JSON.stringify({ chargeback_id: chargeback.id, chargeback_status: status }), chargeback.payment_id]);
  }
  
  await db.query(`
    INSERT INTO billing_audit_log (action, user_id, admin_id, details)
    VALUES ($1, $2, $3, $4)
  `, [
    `CHARGEBACK_${status.toUpperCase()}`, 
    chargeback.user_id, 
    req.user.id, 
    JSON.stringify({ chargebackId: id, status, notes })
  ]);
  
  res.json({ ok: true, chargeback: result.rows[0] });
}));

router.get("/chargebacks/:id", authMiddleware, requireRoles('finance_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const result = await db.query(`
    SELECT c.*, 
           u.name as user_name, u.email as user_email, u.phone as user_phone,
           pay.transaction_id, pay.payment_method, pay.amount as payment_amount,
           i.invoice_number,
           p.name_ar as plan_name, p.name_en as plan_name_en,
           proc.name as processed_by_name
    FROM chargebacks c
    JOIN users u ON c.user_id = u.id
    JOIN payments pay ON c.payment_id = pay.id
    LEFT JOIN invoices i ON c.invoice_id = i.id
    LEFT JOIN plans p ON pay.plan_id = p.id
    LEFT JOIN users proc ON c.processed_by = proc.id
    WHERE c.id = $1
  `, [id]);
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "الاعتراض البنكي غير موجود" });
  }
  
  res.json({ chargeback: result.rows[0] });
}));

module.exports = router;
