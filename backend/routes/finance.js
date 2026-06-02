// backend/routes/finance.js - Finance Admin Routes
const express = require("express");
const db = require("../db");
const fs = require("fs");
const path = require("path");
const { authMiddleware, requireRoles } = require("../middleware/auth");
const { asyncHandler } = require('../middleware/asyncHandler');
const refundSM = require('../services/refundStateMachine');

const router = express.Router();

/** Safe double-quote for PostgreSQL identifiers (names from pg_catalog only). */
function quoteSqlIdent(name) {
  if (typeof name !== "string" || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return `"${name.replace(/"/g, '""')}"`;
}

const SYSTEM_PG_SCHEMAS = new Set(["pg_catalog", "information_schema", "pg_toast"]);

/** Allow SET NULL on FK columns that were defined NOT NULL (pre-launch reset). */
async function dropNotNullOnFkColumnsReferencingConfrelid(client, confrelOid) {
  const { rows } = await client.query(
    `
    SELECT DISTINCT n.nspname AS schema_name, c.relname AS relname, a.attname AS attname
    FROM pg_constraint g
    JOIN pg_class c ON c.oid = g.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = g.conrelid AND a.attnum = ANY (g.conkey)
    WHERE g.contype = 'f'
      AND g.confrelid = $1
      AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      AND n.nspname NOT LIKE 'pg\\_temp\\_%' ESCAPE '\\'
      AND c.relkind IN ('r', 'p')
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attnotnull
  `,
    [confrelOid]
  );
  for (const row of rows) {
    if (SYSTEM_PG_SCHEMAS.has(row.schema_name)) continue;
    const sch = quoteSqlIdent(row.schema_name);
    const tbl = quoteSqlIdent(row.relname);
    const col = quoteSqlIdent(row.attname);
    await client.query(
      `ALTER TABLE ${sch}.${tbl} ALTER COLUMN ${col} DROP NOT NULL`
    );
  }
}

/**
 * Discover FKs pointing at a referenced table and clear referencing columns (SET NULL).
 * Used before DELETE/TRUNCATE when ON DELETE is not SET NULL/CASCADE everywhere.
 * Includes partitioned tables (relkind 'p'); handles multi-column FKs.
 */
async function nullAllForeignKeysToReferencedTable(client, schemaName, tableName, options = {}) {
  const { throwIfMissing = false } = options;
  const inv = await client.query(
    `
    SELECT ic.oid
    FROM pg_class ic
    JOIN pg_namespace ins ON ins.oid = ic.relnamespace
    WHERE ins.nspname = $1
      AND ic.relname = $2
      AND ic.relkind IN ('r', 'p')
  `,
    [schemaName, tableName]
  );
  if (inv.rows.length === 0) {
    if (throwIfMissing) {
      throw new Error(`جدول ${schemaName}.${tableName} غير موجود أو غير قابل للوصول`);
    }
    return;
  }
  const refOid = inv.rows[0].oid;

  await dropNotNullOnFkColumnsReferencingConfrelid(client, refOid);

  const { rows: singleCol } = await client.query(
    `
    SELECT DISTINCT n.nspname AS schema_name, c.relname AS relname, a.attname AS attname
    FROM pg_constraint g
    JOIN pg_class c ON c.oid = g.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = g.conrelid AND a.attnum = ANY (g.conkey)
    WHERE g.contype = 'f'
      AND g.confrelid = $1
      AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      AND n.nspname NOT LIKE 'pg\\_temp\\_%' ESCAPE '\\'
      AND c.relkind IN ('r', 'p')
      AND array_length(g.conkey, 1) = 1
  `,
    [refOid]
  );
  for (const row of singleCol) {
    if (SYSTEM_PG_SCHEMAS.has(row.schema_name)) continue;
    const sch = quoteSqlIdent(row.schema_name);
    const tbl = quoteSqlIdent(row.relname);
    const col = quoteSqlIdent(row.attname);
    await client.query(`UPDATE ${sch}.${tbl} SET ${col} = NULL WHERE ${col} IS NOT NULL`);
  }

  const { rows: multiFk } = await client.query(
    `
    SELECT g.oid, n.nspname AS schema_name, c.relname AS relname
    FROM pg_constraint g
    JOIN pg_class c ON c.oid = g.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE g.contype = 'f'
      AND g.confrelid = $1
      AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      AND n.nspname NOT LIKE 'pg\\_temp\\_%' ESCAPE '\\'
      AND c.relkind IN ('r', 'p')
      AND array_length(g.conkey, 1) > 1
  `,
    [refOid]
  );
  for (const fk of multiFk) {
    if (SYSTEM_PG_SCHEMAS.has(fk.schema_name)) continue;
    const { rows: attrs } = await client.query(
      `
      SELECT a.attname
      FROM pg_constraint g
      CROSS JOIN LATERAL unnest(g.conkey) WITH ORDINALITY AS u(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = g.conrelid AND a.attnum = u.attnum AND NOT a.attisdropped
      WHERE g.oid = $1
      ORDER BY u.ord
    `,
      [fk.oid]
    );
    if (attrs.length === 0) continue;
    const sch = quoteSqlIdent(fk.schema_name);
    const tbl = quoteSqlIdent(fk.relname);
    const setList = attrs.map((r) => `${quoteSqlIdent(r.attname)} = NULL`).join(", ");
    const whereAny = attrs.map((r) => `${quoteSqlIdent(r.attname)} IS NOT NULL`).join(" OR ");
    await client.query(`UPDATE ${sch}.${tbl} SET ${setList} WHERE ${whereAny}`);
  }
}

/**
 * TRUNCATE invoices fails while any row in another table still references invoices.
 * Delegates to nullAllForeignKeysToReferencedTable(public.invoices).
 */
async function nullAllForeignKeysToInvoices(client) {
  await nullAllForeignKeysToReferencedTable(client, "public", "invoices", { throwIfMissing: true });
}

function resetInvoicesRequestConfirmed(req) {
  if (req.body && req.body.confirm === true) return true;
  const q = req.query?.confirm;
  if (q === true) return true;
  if (typeof q === "string" && (q === "true" || q === "1")) return true;
  return false;
}

/** JSON body for POST/DELETE /reset-invoices failures so production can see the blocking FK/table (node-postgres). */
function buildResetInvoicesErrorResponse(err) {
  const base = {
    error: err.message || "فشل تصفير الفواتير",
    ok: false,
  };
  if (err && typeof err === "object") {
    if (err.name && err.name !== "Error") base.name = err.name;
    const pgKeys = [
      "code",
      "severity",
      "detail",
      "hint",
      "position",
      "internalPosition",
      "internalQuery",
      "where",
      "schema",
      "table",
      "column",
      "dataType",
      "constraint",
      "file",
      "line",
      "routine",
    ];
    for (const k of pgKeys) {
      if (err[k] != null && err[k] !== "") base[k] = err[k];
    }
  }
  return base;
}

/**
 * Empty invoices and reset SERIAL. TRUNCATE failure aborts the txn unless we use a savepoint;
 * otherwise the follow-up DELETE hits "current transaction is aborted".
 */
async function truncateInvoicesOrDeleteAndResetSeq(client) {
  await client.query("SAVEPOINT reset_invoices_trunc");
  try {
    await client.query(`TRUNCATE TABLE public.invoices RESTART IDENTITY`);
    await client.query("RELEASE SAVEPOINT reset_invoices_trunc");
    return;
  } catch (truncateErr) {
    console.error("[finance reset-invoices] TRUNCATE failed, using DELETE + setval", truncateErr);
    await client.query("ROLLBACK TO SAVEPOINT reset_invoices_trunc");
  }
  await client.query(`DELETE FROM public.invoices`);
  const seqRes = await client.query(
    `SELECT pg_get_serial_sequence('public.invoices', 'id') AS seqname`
  );
  const seqname = seqRes.rows[0]?.seqname;
  if (seqname) {
    await client.query(`SELECT setval($1::regclass, 1, false)`, [seqname]);
  }
}

/**
 * Run an optional step inside its own savepoint. Without the savepoint a
 * skippable error (missing table / column / function) aborts the surrounding
 * transaction — subsequent queries then fail with 25P02
 * "current transaction is aborted", which was the deeper bug that made the
 * pre-launch reset silently fail mid-chain. With the savepoint, skips are
 * recorded and the wipe continues.
 */
async function execOptionalSql(client, sql, label, skippedSink) {
  await client.query("SAVEPOINT step");
  try {
    await client.query(sql);
    await client.query("RELEASE SAVEPOINT step");
  } catch (err) {
    await client.query("ROLLBACK TO SAVEPOINT step");
    const code = err && err.code;
    // Soft-skip codes: missing table / column / function and FK violation
    // from a table outside this wipe's coverage.
    if (code === "42P01" || code === "42703" || code === "42883" || code === "23503" || code === "23502") {
      console.warn(`[finance reset-invoices] skip optional step (${label}):`, err.message);
      if (skippedSink) {
        skippedSink.push({ label, code, detail: err.detail || err.message });
      }
      return;
    }
    throw err;
  }
}

async function resetSerialIfExists(client, tableName, columnName = "id") {
  const r = await client.query(
    `SELECT pg_get_serial_sequence($1, $2) AS seqname`,
    [`public.${tableName}`, columnName]
  );
  const seqname = r.rows[0]?.seqname;
  if (seqname) {
    await client.query(`SELECT setval($1::regclass, 1, false)`, [seqname]);
  }
}

/**
 * Pre-launch holistic finance wipe: removes dependent rows so dashboards show zero,
 * not just invoices. Order: omni/tickets/complaints → rows that FK payments (chargebacks,
 * extension requests) → clear payment_id / pg_catalog FK sweep → DELETE payments →
 * billing log → legacy subscription tables → FK sweep user_plans → DELETE user_plans.
 *
 * Schema notes (public): FKs to payments include invoices (ON DELETE SET NULL),
 * elite_slot_reservations + elite_extension_requests (no ON DELETE → block DELETE),
 * chargebacks (NOT NULL, ON DELETE CASCADE). user_plans is referenced by quota_buckets,
 * promotion_usage (SET NULL), ambassador_consumptions (restrict), referral_rewards (no FK in base).
 * There is no generic `transactions` table for checkout; payment rows live in `payments`.
 * Legacy knex migration may add `user_subscriptions` — cleared optionally.
 * `wallet_transactions` is ambassador ledger (not Stripe/payment TXN) — not truncated here.
 */
async function wipeFinanceEcosystem(client, skipped) {
  // Each query gets its own SAVEPOINT via execOptionalSql, so a missing
  // optional column (42703) no longer pollutes the rest of the transaction.
  // The variant with `category` is tried first; if the column is missing
  // the simpler variant is tried via its own savepoint.
  await execOptionalSql(
    client,
    `
    DELETE FROM omni_conversations oc
    WHERE oc.source_type = 'ticket'
      AND oc.source_id IN (
        SELECT id FROM support_tickets
        WHERE department = 'financial' OR COALESCE(category, '') = 'billing_hint'
      )
  `,
    "omni_conversations linked to finance tickets (with category)",
    skipped
  );
  await execOptionalSql(
    client,
    `
    DELETE FROM omni_conversations oc
    WHERE oc.source_type = 'ticket'
      AND oc.source_id IN (SELECT id FROM support_tickets WHERE department = 'financial')
  `,
    "omni_conversations linked to finance tickets (fallback)",
    skipped
  );

  await execOptionalSql(
    client,
    `
    DELETE FROM support_tickets
    WHERE department = 'financial' OR COALESCE(category, '') = 'billing_hint'
  `,
    "support_tickets finance (with category)",
    skipped
  );
  await execOptionalSql(
    client,
    `DELETE FROM support_tickets WHERE department = 'financial'`,
    "support_tickets finance (fallback)",
    skipped
  );

  await execOptionalSql(
    client,
    `
    DELETE FROM account_complaints
    WHERE invoice_id IS NOT NULL OR refund_id IS NOT NULL
  `,
    "account_complaints linked to invoice/refund",
    skipped
  );

  /* Must remove chargebacks first: payment_id NOT NULL REFERENCES payments(id). */
  await execOptionalSql(client, `DELETE FROM chargebacks`, "chargebacks", skipped);
  await resetSerialIfExists(client, "chargebacks");

  await execOptionalSql(client, `DELETE FROM refunds`, "refunds", skipped);
  await resetSerialIfExists(client, "refunds");

  /* References payments(id) without ON DELETE — delete rows before clearing payments. */
  await execOptionalSql(client, `DELETE FROM elite_extension_requests`, "elite_extension_requests", skipped);

  /* elite_slot_reservations.payment_id REFERENCES payments(id) default NO ACTION */
  await execOptionalSql(
    client,
    `UPDATE elite_slot_reservations SET payment_id = NULL WHERE payment_id IS NOT NULL`,
    "elite_slot_reservations payment_id",
    skipped
  );

  await execOptionalSql(client, `DELETE FROM payment_idempotency`, "payment_idempotency", skipped);

  await execOptionalSql(
    client,
    `TRUNCATE TABLE stripe_payments RESTART IDENTITY`,
    "stripe_payments",
    skipped
  );

  /* Discover any other FKs → payments (incl. prod-only ALTERs), DROP NOT NULL + SET NULL.
   * Wrap in a savepoint too — a single failing UPDATE (e.g., trigger-protected col)
   * should not abort the wipe. */
  await client.query("SAVEPOINT step_null_payments_fks");
  try {
    await nullAllForeignKeysToReferencedTable(client, "public", "payments");
    await client.query("RELEASE SAVEPOINT step_null_payments_fks");
  } catch (err) {
    await client.query("ROLLBACK TO SAVEPOINT step_null_payments_fks");
    skipped.push({
      label: "nullAllForeignKeysToReferencedTable(payments)",
      code: err.code || "unknown",
      detail: err.detail || err.message,
    });
    console.warn("[finance reset-invoices] skip null-fks step (payments):", err.message);
  }

  await execOptionalSql(client, `DELETE FROM payments`, "payments", skipped);
  await resetSerialIfExists(client, "payments");

  await execOptionalSql(
    client,
    `TRUNCATE TABLE billing_audit_log RESTART IDENTITY`,
    "billing_audit_log",
    skipped
  );

  /* Legacy name from early knex migrations; main app uses user_plans. */
  await execOptionalSql(client, `DELETE FROM user_subscriptions`, "user_subscriptions", skipped);
  await resetSerialIfExists(client, "user_subscriptions");

  /* All referencing columns (e.g. ambassador_consumptions.user_plan_id) — then DELETE user_plans */
  await client.query("SAVEPOINT step_null_user_plans_fks");
  try {
    await nullAllForeignKeysToReferencedTable(client, "public", "user_plans");
    await client.query("RELEASE SAVEPOINT step_null_user_plans_fks");
  } catch (err) {
    await client.query("ROLLBACK TO SAVEPOINT step_null_user_plans_fks");
    skipped.push({
      label: "nullAllForeignKeysToReferencedTable(user_plans)",
      code: err.code || "unknown",
      detail: err.detail || err.message,
    });
    console.warn("[finance reset-invoices] skip null-fks step (user_plans):", err.message);
  }

  await execOptionalSql(client, `DELETE FROM user_plans`, "user_plans", skipped);
  await resetSerialIfExists(client, "user_plans");
}

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
    INNER JOIN users u ON u.id = up.user_id AND u.role = 'user'
    WHERE up.status = 'active' 
      AND (up.expires_at IS NULL OR up.expires_at > NOW())
  `);
  const activeSubscribers = parseInt(activeSubscribersResult.rows[0].count);

  const expiredSubscribersResult = await db.query(`
    SELECT COUNT(DISTINCT up.user_id) as count 
    FROM user_plans up
    INNER JOIN users u ON u.id = up.user_id AND u.role = 'user'
    WHERE up.status = 'active' 
      AND up.expires_at IS NOT NULL 
      AND up.expires_at <= NOW()
  `);
  const expiredSubscribers = parseInt(expiredSubscribersResult.rows[0].count);

  const suspendedSubscribersResult = await db.query(`
    SELECT COUNT(DISTINCT up.user_id) as count 
    FROM user_plans up
    INNER JOIN users u ON u.id = up.user_id AND u.role = 'user'
    WHERE up.status = 'suspended'
  `);
  const suspendedSubscribers = parseInt(suspendedSubscribersResult.rows[0].count);

  /* Align with GET /payment-stats: cash recorded in payments (not plan list price / paid_amount on user_plans). */
  const totalRevenueResult = await db.query(`
    SELECT COALESCE(SUM(amount), 0) as total 
    FROM payments
    WHERE status = 'completed'
  `);
  const totalRevenue = parseFloat(totalRevenueResult.rows[0].total) || 0;

  const monthlyRevenueResult = await db.query(`
    SELECT COALESCE(SUM(amount), 0) as total 
    FROM payments
    WHERE status = 'completed'
      AND created_at >= DATE_TRUNC('month', NOW())
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

  // طلبات السحب من السفراء (في انتظار المراجعة المالية)
  const pendingWithdrawalRequestsResult = await db.query(`
    SELECT COUNT(*) as count, COALESCE(SUM(amount_cents), 0) as total_cents 
    FROM ambassador_withdrawal_requests 
    WHERE status = 'finance_review'
  `);
  const pendingWithdrawalRequestsCount = parseInt(pendingWithdrawalRequestsResult.rows[0].count);
  const pendingWithdrawalRequestsAmount = parseFloat(pendingWithdrawalRequestsResult.rows[0].total_cents || 0) / 100;

  const planDistributionResult = await db.query(`
    SELECT p.name_ar, p.color, COUNT(up.id) as subscribers
    FROM plans p
    LEFT JOIN user_plans up ON p.id = up.plan_id AND up.status = 'active'
      AND (up.expires_at IS NULL OR up.expires_at > NOW())
      AND EXISTS (SELECT 1 FROM users u WHERE u.id = up.user_id AND u.role = 'user')
    WHERE p.visible = true
    GROUP BY p.id, p.name_ar, p.color
    ORDER BY p.sort_order
  `);

  const monthlyTrendResult = await db.query(`
    SELECT 
      TO_CHAR(DATE_TRUNC('month', p.created_at), 'YYYY-MM') as month,
      COUNT(*) as subscriptions,
      COALESCE(SUM(p.amount), 0) as revenue
    FROM payments p
    WHERE p.status = 'completed'
      AND p.created_at >= NOW() - INTERVAL '12 months'
    GROUP BY DATE_TRUNC('month', p.created_at)
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
      pendingRefundsCount,
      pendingWithdrawalRequests: pendingWithdrawalRequestsAmount,
      pendingWithdrawalRequestsCount
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

// ─── Smart refund suggestion ──────────────────────────────────────
// Owner asked: "the accountant needs to see how much is left on
// the subscription — if the customer used 25 of 30 days, refund
// should be pro-rated." This endpoint takes an invoice or a
// ticket and returns a suggested refund breakdown:
//   - days_used / days_remaining / days_total
//   - amount_paid (from invoice)
//   - suggested_full_refund   (if usage < 7 days → goodwill full)
//   - suggested_prorated      (days_remaining / days_total * paid)
//   - suggested_zero_refund   (if fully consumed → 0)
//   - recommended_amount      (the smart pick of the three)
// The accountant uses these as suggestions, NOT auto-applied.
router.get("/refunds/suggestion", authMiddleware, requireRoles('finance_admin', 'super_admin', 'admin_manager'), asyncHandler(async (req, res) => {
  const invoiceId = parseInt(req.query.invoice_id, 10);
  const ticketId = req.query.ticket_id ? parseInt(req.query.ticket_id, 10) : null;
  if (!invoiceId && !ticketId) {
    return res.status(400).json({ error: "يجب تمرير invoice_id أو ticket_id" });
  }

  // Resolve invoice via ticket if needed (the unified support_tickets
  // table carries invoice_id when the customer picked one at submit).
  let resolvedInvoiceId = invoiceId;
  if (!resolvedInvoiceId && ticketId) {
    try {
      const t = await db.query(`SELECT invoice_id FROM support_tickets WHERE id = $1`, [ticketId]);
      resolvedInvoiceId = t.rows[0]?.invoice_id || null;
    } catch { /* table or column missing — skip */ }
  }
  if (!resolvedInvoiceId) {
    return res.status(404).json({ error: "لا توجد فاتورة مرتبطة بالطلب" });
  }

  // Pull invoice + linked subscription + plan duration
  const invQ = await db.query(`
    SELECT i.*, p.duration_days, p.name_ar AS plan_name,
           up.id AS user_plan_id, up.started_at, up.expires_at, up.status AS plan_status
    FROM invoices i
    LEFT JOIN payments pay ON pay.id = i.payment_id
    LEFT JOIN user_plans up ON up.id = pay.user_plan_id
    LEFT JOIN plans p ON p.id = i.plan_id
    WHERE i.id = $1
  `, [resolvedInvoiceId]);
  if (invQ.rows.length === 0) {
    return res.status(404).json({ error: "الفاتورة غير موجودة" });
  }
  const inv = invQ.rows[0];

  const amountPaid = Number(inv.total) || 0;
  const durationDays = Number(inv.duration_days) || 30;

  // Compute days used + remaining from started_at + duration. If we
  // don't have started_at, fall back to invoice.created_at — the
  // subscription almost always begins at payment time.
  const startMs = inv.started_at ? new Date(inv.started_at).getTime() : new Date(inv.created_at).getTime();
  const now = Date.now();
  const elapsedMs = Math.max(0, now - startMs);
  const daysUsed = Math.min(durationDays, Math.floor(elapsedMs / (24 * 60 * 60 * 1000)));
  const daysRemaining = Math.max(0, durationDays - daysUsed);

  // Three suggestion strategies
  const fullRefund = amountPaid;
  const proRatedRefund = Math.round((daysRemaining / durationDays) * amountPaid * 100) / 100;
  const zeroRefund = 0;

  // Recommendation policy:
  //   < 3 days used   → full refund (cooling-off period)
  //   3 ≤ used < 7    → 90% of paid (small admin fee)
  //   plan expired (days_remaining == 0) → zero
  //   otherwise       → strict pro-rated
  let recommendation, recommendedAmount, rationale;
  if (daysRemaining === 0) {
    recommendation = "no_refund";
    recommendedAmount = zeroRefund;
    rationale = "انتهت مدة الاشتراك بالكامل — لا يستحق استرداد";
  } else if (daysUsed < 3) {
    recommendation = "full";
    recommendedAmount = fullRefund;
    rationale = "فترة سماح 72 ساعة — يُسترد كامل المبلغ";
  } else if (daysUsed < 7) {
    recommendation = "near_full";
    recommendedAmount = Math.round(amountPaid * 0.9 * 100) / 100;
    rationale = "خلال أول أسبوع — يُسترد 90% (10% رسوم إدارية اختيارية)";
  } else {
    recommendation = "prorated";
    recommendedAmount = proRatedRefund;
    rationale = `استرداد تناسبي على المتبقّي (${daysRemaining}/${durationDays} يوم)`;
  }

  res.json({
    invoice: {
      id: inv.id,
      invoice_number: inv.invoice_number,
      total: amountPaid,
      currency: inv.currency,
      plan_name: inv.plan_name,
      created_at: inv.created_at,
    },
    subscription: {
      user_plan_id: inv.user_plan_id,
      started_at: inv.started_at || inv.created_at,
      expires_at: inv.expires_at,
      status: inv.plan_status,
      duration_days: durationDays,
      days_used: daysUsed,
      days_remaining: daysRemaining,
      usage_percent: Math.round((daysUsed / durationDays) * 100),
    },
    options: {
      full_refund: { amount: fullRefund, label: "استرداد كامل", rationale: "ردّ كل المبلغ المدفوع" },
      prorated:    { amount: proRatedRefund, label: "استرداد تناسبي", rationale: `${daysRemaining} يوم متبقي من ${durationDays}` },
      no_refund:   { amount: zeroRefund, label: "بدون استرداد", rationale: "اعتبار الاشتراك مستهلَكاً" },
    },
    recommendation: {
      strategy: recommendation,
      amount: recommendedAmount,
      rationale,
    },
  });
}));

// Quick list: refunds that have been APPROVED but not yet
// confirmed as paid — the accountant's "don't forget" list.
router.get("/refunds/pending-payout", authMiddleware, requireRoles('finance_admin', 'super_admin', 'admin_manager'), asyncHandler(async (req, res) => {
  const r = await db.query(`
    SELECT r.*, u.name AS user_name, u.email AS user_email
    FROM refunds r
    LEFT JOIN users u ON u.id = r.user_id
    WHERE r.status = 'approved' AND r.payout_confirmed_at IS NULL
    ORDER BY r.processed_at ASC NULLS LAST
  `);
  // Add an "age" hint so urgent reminders surface clearly
  const now = Date.now();
  const out = r.rows.map((row) => ({
    ...row,
    days_since_approval: row.processed_at
      ? Math.floor((now - new Date(row.processed_at).getTime()) / (24 * 60 * 60 * 1000))
      : null,
  }));
  res.json({ refunds: out, count: out.length });
}));

// ──────────────────────────────────────────────────────────────
// Convert a Support-transferred ticket into an in-progress refund.
//
// Flow:
//   1. customer submits refund request via composer → support_tickets row
//      lands with auto_assigned_role='support_admin', department='financial'
//   2. Support agent clarifies / tries to resolve → if money still has to
//      move, hits "تحويل إلى المالية" → PATCH /support/:id/transfer
//      stamps transferred_to_finance_at + reroutes to finance_admin
//   3. Finance opens the Correspondence inbox, picks this ticket, clicks
//      "تحويل إلى عملية استرداد" → this route fires.
//
// Behaviour:
//   - Body accepts {amount, reason} optionally — if missing, the route
//     pulls the smart-suggestion recommendation for this invoice and
//     uses that as the seed amount.
//   - The new refund row is inserted with status='approved' directly
//     (skips pending) because the conversation IS the approval — the
//     accountant has already weighed it. It then sits in تحت العمليات
//     until confirm-payout fires with a bank screenshot.
//   - Returns {ok, refund, ticket} so the UI can navigate straight
//     into the refund detail view.
// ──────────────────────────────────────────────────────────────
router.post(
  "/refunds/from-ticket/:ticketId",
  authMiddleware,
  requireRoles('finance_admin', 'super_admin', 'admin_manager'),
  asyncHandler(async (req, res) => {
    const ticketId = parseInt(req.params.ticketId, 10);
    if (Number.isNaN(ticketId)) {
      return res.status(400).json({ error: "معرف التذكرة غير صالح" });
    }

    const ticketRes = await db.query(
      `SELECT * FROM support_tickets WHERE id = $1`,
      [ticketId]
    );
    if (ticketRes.rows.length === 0) {
      return res.status(404).json({ error: "التذكرة غير موجودة" });
    }
    const ticket = ticketRes.rows[0];

    if (!ticket.transferred_to_finance_at && ticket.auto_assigned_role !== 'finance_admin') {
      return res.status(400).json({ error: "هذه التذكرة لم تُحوَّل من الدعم بعد" });
    }
    if (ticket.refund_id) {
      return res.status(409).json({
        error: "هذه التذكرة مرتبطة بطلب استرداد قائم بالفعل",
        refund_id: ticket.refund_id,
      });
    }

    let amount = req.body?.amount != null ? parseFloat(req.body.amount) : null;
    let reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    let originalAmount = null;
    let refundType = 'full';

    if (ticket.invoice_id) {
      const inv = await db.query(
        `SELECT total FROM invoices WHERE id = $1`,
        [ticket.invoice_id]
      );
      if (inv.rows[0]) {
        originalAmount = parseFloat(inv.rows[0].total);
        if (amount == null) amount = originalAmount;
        refundType = amount < originalAmount ? 'partial' : 'full';
        if (amount > originalAmount) {
          return res.status(400).json({
            error: `مبلغ الاسترداد (${amount} ر.س) يتجاوز قيمة الفاتورة (${originalAmount} ر.س)`,
          });
        }
      }
    }

    if (amount == null || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        error: "يجب تحديد مبلغ الاسترداد — لم يتم العثور على مبلغ مرجعي من الفاتورة",
      });
    }
    const roundedAmount = Math.round(amount * 100) / 100;
    if (!reason) reason = `مُحوَّل من تذكرة ${ticket.ticket_number || ('#' + ticket.id)}`;

    const client = await db.connect();
    let didCommit = false;
    try {
      await client.query('BEGIN');

      // status='approved' so it immediately appears in "تحت العمليات".
      // processed_by = the finance admin doing the conversion — the
      // conversation review IS the approval step.
      let insert;
      try {
        insert = await client.query(`
          INSERT INTO refunds
            (user_id, invoice_id, ticket_id, amount, original_amount,
             refund_type, reason, status, processed_by, processed_at,
             created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', $8, NOW(), NOW(), NOW())
          RETURNING *
        `, [
          ticket.user_id, ticket.invoice_id || null, ticketId,
          roundedAmount, originalAmount, refundType, reason, req.user.id,
        ]);
      } catch (errCol) {
        if (!(errCol && errCol.code === '42703')) throw errCol;
        insert = await client.query(`
          INSERT INTO refunds
            (user_id, invoice_id, amount, original_amount,
             refund_type, reason, status, processed_by, processed_at,
             created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, 'approved', $7, NOW(), NOW(), NOW())
          RETURNING *
        `, [
          ticket.user_id, ticket.invoice_id || null,
          roundedAmount, originalAmount, refundType, reason, req.user.id,
        ]);
      }
      const refund = insert.rows[0];

      // Back-reference on the ticket so future views show "→ refund #N in progress".
      try {
        await client.query(
          `UPDATE support_tickets SET refund_id = $1, updated_at = NOW() WHERE id = $2`,
          [refund.id, ticketId]
        );
      } catch (e) {
        if (e && e.code !== '42703') console.warn('[from-ticket] stamp ticket.refund_id:', e.message);
      }

      // Internal-only reply so the conversation audit trail captures the conversion.
      try {
        await client.query(
          `INSERT INTO support_ticket_replies (ticket_id, sender_id, sender_type, message)
           VALUES ($1, $2, 'internal', $3)`,
          [
            ticketId, req.user.id,
            `تم تحويل المراسلة إلى عملية استرداد رقم #${refund.id} بمبلغ ${roundedAmount} ر.س. الحالة الآن: تحت العمليات.`,
          ]
        );
      } catch (e) { /* never block the conversion */ }

      await client.query(
        `INSERT INTO billing_audit_log (action, user_id, admin_id, details)
         VALUES ('REFUND_CREATED_FROM_TICKET', $1, $2, $3)`,
        [ticket.user_id, req.user.id, JSON.stringify({
          ticket_id: ticketId, refund_id: refund.id, amount: roundedAmount,
        })]
      );

      // Customer-facing notification — sets the 4–6 day expectation up front.
      await client.query(`
        INSERT INTO notifications (user_id, type, title, body, channel, status, payload, scheduled_at)
        VALUES ($1, 'refund_in_progress', 'تم تحويل طلبك إلى عملية استرداد',
                $2, 'app', 'pending', $3, NOW())
      `, [
        ticket.user_id,
        `جاري تنفيذ استرداد بمبلغ ${roundedAmount} ر.س إلى حسابك البنكي. عملية التحويل تستغرق عادة 4-6 أيام عمل.`,
        JSON.stringify({ refund_id: refund.id, ticket_id: ticketId, amount: roundedAmount }),
      ]);

      await client.query('COMMIT');
      didCommit = true;
      client.release();

      res.json({ ok: true, refund, ticket_id: ticketId });
    } catch (err) {
      if (!didCommit) {
        try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      }
      try { client.release(); } catch { /* ignore */ }
      throw err;
    }
  })
);

router.post("/refunds", authMiddleware, requireRoles('finance_admin'), asyncHandler(async (req, res) => {
  const { userId, user_id, userPlanId, user_plan_id, invoice_id, amount, reason, ticket_id } = req.body;
  const actualUserId = userId || user_id;
  const actualUserPlanId = userPlanId || user_plan_id;
  const linkedTicketId = ticket_id ? parseInt(ticket_id, 10) : null;
  
  if (!actualUserId || !amount) {
    return res.status(400).json({ error: "المستخدم والمبلغ مطلوبان" });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: "مبلغ الاسترداد غير صالح" });
  }
  
  const roundedAmount = Math.round(parsedAmount * 100) / 100;
  
  const client = await db.connect();
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
    
    // ticket_id is best-effort: if the column doesn't exist on this env yet
    // (rolling migration) we drop back to the legacy insert.
    let result;
    try {
      result = await client.query(`
        INSERT INTO refunds (user_id, user_plan_id, invoice_id, ticket_id, amount, original_amount, refund_type, reason, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', NOW(), NOW())
        RETURNING *
      `, [actualUserId, actualUserPlanId || null, invoice_id || null, linkedTicketId, roundedAmount, originalAmount, refundType, reason || null]);
    } catch (errCol) {
      if (!(errCol && errCol.code === '42703')) throw errCol;
      result = await client.query(`
        INSERT INTO refunds (user_id, user_plan_id, invoice_id, amount, original_amount, refund_type, reason, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW(), NOW())
        RETURNING *
      `, [actualUserId, actualUserPlanId || null, invoice_id || null, roundedAmount, originalAmount, refundType, reason || null]);
    }

    // Stamp refund_id back on the ticket so the Finance Correspondence
    // inbox can show "this conversation already has a refund in progress".
    if (linkedTicketId && result.rows[0]) {
      try {
        await client.query(
          `UPDATE support_tickets SET refund_id = $1, updated_at = NOW() WHERE id = $2 AND refund_id IS NULL`,
          [result.rows[0].id, linkedTicketId]
        );
      } catch (e) {
        if (e && e.code !== '42703') console.warn('[POST refunds] stamp ticket.refund_id:', e.message);
      }
    }

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
    
    // Owner's standing rule: communicate 4–6 business days, never less.
    // That window covers the accountant's bank trip + the inter-bank
    // settlement, so we don't promise a number we can't keep.
    let notificationBody = `تمت الموافقة على طلب استرداد بمبلغ ${refund.amount} ر.س. سيتم تحويل المبلغ إلى حسابك خلال 4-6 أيام عمل.`;
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
    const { bank_reference, payout_proof_url } = req.body;

    if (isNaN(parseInt(id))) {
      client.release();
      return res.status(400).json({ error: "معرف الاسترداد غير صالح" });
    }

    // Owner's rule: a refund cannot move to "تم الاسترداد" until the
    // accountant has actually transferred the money AND uploaded a
    // screenshot of the bank transfer. Without proof we keep the row in
    // "تحت العمليات" so it stays visible on the pending list.
    const proofUrl = typeof payout_proof_url === "string" ? payout_proof_url.trim() : "";
    if (!proofUrl) {
      client.release();
      return res.status(400).json({
        error: "يجب رفع صورة إثبات التحويل البنكي قبل تأكيد الاسترداد",
      });
    }

    await client.query('BEGIN');

    // Resilient UPDATE — try with payout_proof_url first, fall back to
    // legacy shape if a rolling deploy hasn't migrated the column.
    let result;
    try {
      result = await client.query(`
        UPDATE refunds
        SET status = 'completed',
            payout_confirmed_at = NOW(),
            bank_reference = $1,
            payout_proof_url = $2,
            updated_at = NOW()
        WHERE id = $3 AND status = 'approved'
        RETURNING *,
          (SELECT email FROM users WHERE id = user_id) as user_email,
          (SELECT name FROM users WHERE id = user_id) as user_name
      `, [bank_reference || null, proofUrl, id]);
    } catch (errCol) {
      if (!(errCol && errCol.code === '42703')) throw errCol;
      result = await client.query(`
        UPDATE refunds
        SET status = 'completed', payout_confirmed_at = NOW(), bank_reference = $1, updated_at = NOW()
        WHERE id = $2 AND status = 'approved'
        RETURNING *,
          (SELECT email FROM users WHERE id = user_id) as user_email,
          (SELECT name FROM users WHERE id = user_id) as user_name
      `, [bank_reference || null, id]);
    }
    
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

/**
 * Pre-launch only: wipe all invoices and reset SERIAL (super_admin + confirm).
 * Clears FK references from dependent tables first.
 * POST preferred: some proxies strip DELETE bodies; DELETE still supported; ?confirm=true is a fallback.
 */
const resetInvoicesHandler = asyncHandler(async (req, res) => {
  if (!resetInvoicesRequestConfirmed(req)) {
    return res.status(400).json({ error: "يجب إرسال { confirm: true } أو ?confirm=true للتأكيد" });
  }
  const client = await db.pool.connect();
  const skipped = [];
  try {
    await client.query("BEGIN");
    await wipeFinanceEcosystem(client, skipped);

    // Final invoices wipe — also savepoint-wrapped so a leftover blocker
    // surfaces as a skip + 200 (with skipped[] populated) rather than a
    // 500 that hides everything that *did* succeed above.
    await client.query("SAVEPOINT step_null_invoices_fks");
    try {
      await nullAllForeignKeysToInvoices(client);
      await client.query("RELEASE SAVEPOINT step_null_invoices_fks");
    } catch (err) {
      await client.query("ROLLBACK TO SAVEPOINT step_null_invoices_fks");
      skipped.push({
        label: "nullAllForeignKeysToInvoices",
        code: err.code || "unknown",
        detail: err.detail || err.message,
      });
    }

    await client.query("SAVEPOINT step_truncate_invoices");
    let invoicesTruncated = true;
    try {
      await truncateInvoicesOrDeleteAndResetSeq(client);
      await client.query("RELEASE SAVEPOINT step_truncate_invoices");
    } catch (err) {
      await client.query("ROLLBACK TO SAVEPOINT step_truncate_invoices");
      invoicesTruncated = false;
      skipped.push({
        label: "truncateInvoicesOrDeleteAndResetSeq",
        code: err.code || "unknown",
        detail: err.detail || err.message,
      });
    }

    await client.query("COMMIT");
    res.json({
      ok: true,
      invoices_truncated: invoicesTruncated,
      skipped,
      message: invoicesTruncated
        ? "تم تصفير بيئة المالية: المدفوعات، اشتراكات المستخدمين (user_plans)، الفواتير، الاستردادات، الاعتراضات البنكية، الشكاوى المرتبطة، تذاكر المالية، طلبات تمديد النخبة، مفاتيح عدم تكرار الدفع، وسجل التدقيق."
        : `تم تصفير معظم بيئة المالية لكن لم يكتمل حذف الفواتير — راجع قائمة "تم تخطّيها" (${skipped.length}) أدناه.`,
    });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      console.error("[finance reset-invoices] rollback failed", rollbackErr);
    }
    console.error("[finance reset-invoices]", err);
    const body = buildResetInvoicesErrorResponse(err);
    body.skipped = skipped;
    res.status(500).json(body);
  } finally {
    client.release();
  }
});

router.post("/reset-invoices", authMiddleware, requireRoles("super_admin"), resetInvoicesHandler);
router.delete("/reset-invoices", authMiddleware, requireRoles("super_admin"), resetInvoicesHandler);

// ════════════════════════════════════════════════════════════════════
// Customer-facing refund endpoints (Round 3)
//
// Mounted at /api/refunds/* via the same router (app.js mounts
// financeRoutes on /api/refunds). These don't use requireRoles —
// any authenticated user can call them, but the handler checks that
// the refund belongs to req.user.id.
// ════════════════════════════════════════════════════════════════════

// List the logged-in customer's refunds (any state).
router.get("/mine", authMiddleware, asyncHandler(async (req, res) => {
  const rows = await db.query(
    `SELECT id, case_number, status, amount, original_amount,
            refund_method, customer_confirmation_deadline,
            customer_confirmed_at, customer_declined_at,
            refund_invoice_number, payout_confirmed_at,
            created_at, updated_at, state_changed_at
     FROM refunds
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json({ refunds: rows.rows });
}));

// Detail — gated to owner.
router.get("/customer/:id", authMiddleware, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "معرف غير صالح" });
  const r = await db.query(
    `SELECT r.id, r.case_number, r.status, r.amount, r.original_amount,
            r.refund_method, r.refund_method_note,
            r.bank_name, r.bank_account_iban, r.account_holder_name,
            r.customer_confirmation_deadline,
            r.customer_confirmed_at, r.customer_declined_at,
            r.payout_proof_url, r.bank_reference,
            r.refund_invoice_number, r.payout_confirmed_at,
            r.created_at, r.updated_at, r.state_changed_at,
            i.invoice_number AS invoice_number
     FROM refunds r
     LEFT JOIN invoices i ON i.id = r.invoice_id
     WHERE r.id = $1 AND r.user_id = $2`,
    [id, req.user.id]
  );
  if (r.rows.length === 0) return res.status(404).json({ error: "غير موجود" });
  res.json({ refund: r.rows[0] });
}));

// Customer confirms the refund + picks method + (for bank) IBAN trio.
router.post("/customer/:id/confirm", authMiddleware, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const method = typeof req.body?.refund_method === 'string' ? req.body.refund_method : '';
  const bank = req.body?.bank || {};
  // Free-text customer note: for credit_card, typically holds the card
  // last-4 + reference; for bank, optional additional details.
  const methodNote = typeof req.body?.refund_method_note === 'string'
    ? req.body.refund_method_note.trim()
    : '';

  if (Number.isNaN(id)) return res.status(400).json({ error: "معرف غير صالح" });
  if (!['credit_card', 'bank'].includes(method)) {
    return res.status(400).json({ error: "اختر طريقة الإرجاع: credit_card أو bank" });
  }

  const r = await db.query(
    `SELECT * FROM refunds WHERE id = $1 AND user_id = $2`,
    [id, req.user.id]
  );
  if (r.rows.length === 0) return res.status(404).json({ error: "غير موجود" });
  const refund = r.rows[0];

  if (refund.status !== 'pending_customer_confirmation') {
    return res.status(409).json({
      error: `لا يمكن تأكيد هذه المعاملة — حالتها الحالية: ${refund.status}`,
    });
  }
  if (refund.customer_confirmation_deadline && new Date(refund.customer_confirmation_deadline) < new Date()) {
    return res.status(409).json({ error: "انتهت مهلة التأكيد (4 أيام). يجب إعادة فتح المعاملة من المالية." });
  }

  let bankName = refund.bank_name, iban = refund.bank_account_iban, holder = refund.account_holder_name;
  if (method === 'bank') {
    bankName = (bank.bank_name || '').trim();
    iban = (bank.bank_account_iban || '').trim();
    holder = (bank.account_holder_name || '').trim();
    if (!bankName || !iban || !holder) {
      return res.status(400).json({ error: "للطريقة البنكية: اسم البنك ورقم IBAN واسم صاحب الحساب مطلوبة" });
    }
  }

  const client = await db.connect();
  let didCommit = false;
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE refunds
       SET refund_method = $1,
           bank_name = $2, bank_account_iban = $3, account_holder_name = $4,
           refund_method_note = NULLIF($5, ''),
           status = 'awaiting_bank_transfer',
           customer_confirmed_at = NOW(),
           state_changed_at = NOW(), state_changed_by = $6,
           updated_at = NOW()
       WHERE id = $7`,
      [method, bankName, iban, holder, methodNote, req.user.id, id]
    );
    await refundSM.recordEvent(client, {
      refund_id: id,
      event_type: 'customer_confirmed',
      from_state: 'pending_customer_confirmation',
      to_state: 'awaiting_bank_transfer',
      actor_user_id: req.user.id,
      actor_name: req.user.name,
      actor_role: 'user',
      note: `طريقة الإرجاع: ${method === 'credit_card' ? 'بطاقة ائتمانية' : 'حساب بنكي'}`,
      payload: { refund_method: method, has_bank_info: method === 'bank' },
    });
    // Customer-visible reply on the linked ticket so the conversation
    // captures the confirmation moment.
    if (refund.ticket_id) {
      await client.query(
        `INSERT INTO support_ticket_replies
           (ticket_id, sender_id, sender_type, sender_role, message, visibility)
         VALUES ($1, $2, 'user', 'user', $3, 'customer_visible')`,
        [refund.ticket_id, req.user.id,
         `أكدت معاملة الاسترداد ${refund.case_number}. الطريقة المختارة: ${method === 'credit_card' ? 'بطاقة ائتمانية' : 'حساب بنكي'}.`]
      );
    }
    await client.query('COMMIT');
    didCommit = true;
    client.release();
    res.json({ ok: true });
  } catch (err) {
    if (!didCommit) { try { await client.query('ROLLBACK'); } catch { /* ignore */ } }
    try { client.release(); } catch { /* ignore */ }
    throw err;
  }
}));

// Customer declines the refund (changed their mind).
router.post("/customer/:id/decline", authMiddleware, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
  if (Number.isNaN(id)) return res.status(400).json({ error: "معرف غير صالح" });

  const r = await db.query(
    `SELECT * FROM refunds WHERE id = $1 AND user_id = $2`,
    [id, req.user.id]
  );
  if (r.rows.length === 0) return res.status(404).json({ error: "غير موجود" });
  const refund = r.rows[0];

  if (refund.status !== 'pending_customer_confirmation') {
    return res.status(409).json({ error: `لا يمكن إلغاء هذه المعاملة من حالتها الحالية` });
  }

  const client = await db.connect();
  let didCommit = false;
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE refunds
       SET status = 'rejected',
           customer_declined_at = NOW(),
           decision_note = $1,
           state_changed_at = NOW(), state_changed_by = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [note || "ألغى العميل المعاملة", req.user.id, id]
    );
    await refundSM.recordEvent(client, {
      refund_id: id,
      event_type: 'customer_declined',
      from_state: 'pending_customer_confirmation',
      to_state: 'rejected',
      actor_user_id: req.user.id,
      actor_name: req.user.name,
      actor_role: 'user',
      note: note || null,
      payload: {},
    });
    if (refund.ticket_id) {
      await client.query(
        `INSERT INTO support_ticket_replies
           (ticket_id, sender_id, sender_type, sender_role, message, visibility)
         VALUES ($1, $2, 'user', 'user', $3, 'customer_visible')`,
        [refund.ticket_id, req.user.id,
         `ألغى العميل معاملة الاسترداد ${refund.case_number}. ${note ? "السبب: " + note : ""}`]
      );
    }
    await client.query('COMMIT');
    didCommit = true;
    client.release();
    res.json({ ok: true });
  } catch (err) {
    if (!didCommit) { try { await client.query('ROLLBACK'); } catch { /* ignore */ } }
    try { client.release(); } catch { /* ignore */ }
    throw err;
  }
}));

// ════════════════════════════════════════════════════════════════════
// Refund Case state machine (Phase 1) — Finance Inbox + Cases API.
//
// Architectural rule: routes never hit refunds.status directly.
// Every state change funnels through refundSM.guardTransition + an
// UPDATE inside the same transaction as a refund_case_events INSERT,
// so the timeline is the durable record of every move.
// ════════════════════════════════════════════════════════════════════

const financeRoles = ['finance_admin', 'super_admin', 'admin_manager'];

// ════════════════════════════════════════════════════════════════════
// Refund Request "request more info" → bounces case back to support.
//
// Owner rule #9: when finance needs more detail to decide, they DO
// NOT ask the customer. They flip the case into a "needs support
// follow-up" state, support sees it in their inbox, support
// contacts the customer, support consolidates a new support_note,
// then support presses "re-forward to finance".
// ════════════════════════════════════════════════════════════════════
router.patch(
  "/refund-requests/:id/request-info",
  authMiddleware,
  requireRoles(...financeRoles),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
    if (Number.isNaN(id)) return res.status(400).json({ error: "معرف غير صالح" });
    if (note.length < 5) {
      return res.status(400).json({ error: "اكتب الملاحظة التي تريد من الدعم متابعتها مع العميل" });
    }

    const r = await db.query(
      `SELECT id, status, ticket_id, user_id, case_number FROM refunds WHERE id = $1`,
      [id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: "الطلب غير موجود" });
    const refund = r.rows[0];

    // Owner directive: request-info is ONLY allowed from
    // pending_review. After approval, the case proceeds through the
    // bank-transfer pipeline — going back to the customer at that
    // point requires a separate administrative escalation, not this
    // routine button.
    if (refund.status !== "pending_review") {
      return res.status(409).json({
        error: `طلب المعلومات يُسمح فقط في حالة "قيد المراجعة". الحالة الحالية: "${refund.status}".`,
      });
    }

    const client = await db.connect();
    let didCommit = false;
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE refunds
         SET support_followup_required = TRUE,
             state_changed_at = NOW(), state_changed_by = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [req.user.id, id]
      );
      await refundSM.recordEvent(client, {
        refund_id: id,
        event_type: "info_requested_from_support",
        from_state: refund.status,
        to_state: refund.status,
        actor_user_id: req.user.id,
        actor_name: req.user.name,
        actor_role: req.user.role,
        note,
        payload: {},
      });
      // Internal reply on the support ticket so the support team sees
      // the question. Finance never authors customer-facing messages —
      // this entry is sender_type='internal'.
      if (refund.ticket_id) {
        await client.query(
          `INSERT INTO support_ticket_replies (ticket_id, sender_id, sender_type, message)
           VALUES ($1, $2, 'internal', $3)`,
          [refund.ticket_id, req.user.id, `[طلب من المالية على القضية ${refund.case_number}] ${note}`]
        );
        await client.query(
          `UPDATE support_tickets SET status = 'in_progress', updated_at = NOW() WHERE id = $1`,
          [refund.ticket_id]
        );
      }
      await client.query("COMMIT");
      didCommit = true;
      client.release();
      res.json({ ok: true });
    } catch (err) {
      if (!didCommit) { try { await client.query("ROLLBACK"); } catch { /* ignore */ } }
      try { client.release(); } catch { /* ignore */ }
      throw err;
    }
  })
);

// Refund Request endpoints are aliases of /cases for clarity — the
// finance UI calls these by name to make the boundary explicit:
// finance never asks for /cases (which sounds like an internal data
// model), they ask for /refund-requests (the business object).
router.get("/refund-requests", authMiddleware, requireRoles(...financeRoles), (req, res, next) => {
  req.url = "/cases" + (req.url.slice("/refund-requests".length) || "");
  next();
});
router.get("/refund-requests/:id", authMiddleware, requireRoles(...financeRoles), (req, res, next) => {
  req.url = `/cases/${req.params.id}`;
  next();
});
router.patch("/refund-requests/:id/approve", authMiddleware, requireRoles(...financeRoles), (req, res, next) => {
  req.body = { ...(req.body || {}), to: "approved" };
  req.url = `/cases/${req.params.id}/transition`;
  next();
});
router.patch("/refund-requests/:id/reject", authMiddleware, requireRoles(...financeRoles), (req, res, next) => {
  req.body = { ...(req.body || {}), to: "rejected" };
  req.url = `/cases/${req.params.id}/transition`;
  next();
});

// ── Counters (one call, all badges) ────────────────────────────────
router.get(
  "/counters",
  authMiddleware,
  requireRoles(...financeRoles),
  asyncHandler(async (req, res) => {
    const counters = await refundSM.fetchCounters(db);
    res.json({ counters });
  })
);

// ════════════════════════════════════════════════════════════════════
// LEGACY /api/finance/inbox/* — DEPRECATED.
//
// Round 3 model: a ticket is born support-only. When support presses
// "transfer to finance" it gets finance_inbox_state='in_inbox' and
// becomes CO-OWNED. Finance can read the full thread from this
// moment forward and reply to the customer in the same thread.
// Creating a Refund Transaction is a SEPARATE, LATER decision —
// /inbox/:id/convert-to-refund-transaction below.
//
// We keep denyFinanceFromSupport active on /api/support/* (so a
// blanket "give me all tickets" query is still 403'd). The finance
// surface goes through /api/finance/inbox/* which queries
// support_tickets but only matches rows transferred to finance.
// ════════════════════════════════════════════════════════════════════

// GET /inbox — list of tickets transferred to finance.
router.get(
  "/inbox",
  authMiddleware,
  requireRoles(...financeRoles),
  asyncHandler(async (req, res) => {
    const rows = await db.query(
      `SELECT st.id, st.ticket_number, st.subject, st.description,
              st.priority, st.status, st.category, st.subcategory,
              st.created_at, st.updated_at, st.transferred_to_finance_at,
              st.transferred_to_finance_by, st.invoice_id, st.user_id,
              st.refund_id,
              u.name AS user_name, u.email AS user_email,
              r.case_number AS refund_case_number,
              r.status AS refund_status,
              i.invoice_number AS invoice_number, i.total AS invoice_total,
              (SELECT COUNT(*)::int FROM support_ticket_replies sr
                 WHERE sr.ticket_id = st.id AND sr.visibility = 'customer_visible') AS reply_count,
              (SELECT MAX(created_at) FROM support_ticket_replies sr
                 WHERE sr.ticket_id = st.id) AS last_reply_at
       FROM support_tickets st
       LEFT JOIN users u ON u.id = st.user_id
       LEFT JOIN refunds r ON r.id = st.refund_id
       LEFT JOIN invoices i ON i.id = st.invoice_id
       WHERE st.finance_inbox_state = 'in_inbox'
       ORDER BY st.transferred_to_finance_at DESC NULLS LAST, st.id DESC`
    );
    res.json({ tickets: rows.rows });
  })
);

// GET /inbox/:ticketId — ticket detail + full thread.
// Returns BOTH customer-visible replies and internal notes — staff
// see everything on this surface. The customer's own ticket view
// filters internal notes out via /api/support/:id (denied to
// finance role anyway by the shared middleware).
router.get(
  "/inbox/:ticketId",
  authMiddleware,
  requireRoles(...financeRoles),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.ticketId, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "معرف غير صالح" });

    const t = await db.query(
      `SELECT st.*, u.name AS user_name, u.email AS user_email,
              r.case_number AS refund_case_number, r.status AS refund_status,
              i.invoice_number AS invoice_number, i.total AS invoice_total
       FROM support_tickets st
       LEFT JOIN users u ON u.id = st.user_id
       LEFT JOIN refunds r ON r.id = st.refund_id
       LEFT JOIN invoices i ON i.id = st.invoice_id
       WHERE st.id = $1`,
      [id]
    );
    if (t.rows.length === 0) return res.status(404).json({ error: "التذكرة غير موجودة" });
    if (t.rows[0].finance_inbox_state !== 'in_inbox') {
      return res.status(403).json({ error: "هذه التذكرة ليست في صندوق المالية" });
    }

    const replies = await db.query(
      `SELECT r.id, r.sender_id, r.sender_type, r.sender_role,
              r.message, r.visibility, r.created_at,
              u.name AS sender_name, u.role AS sender_current_role
       FROM support_ticket_replies r
       LEFT JOIN users u ON u.id = r.sender_id
       WHERE r.ticket_id = $1
       ORDER BY r.created_at ASC`,
      [id]
    );

    // Round 3.1: if the ticket is linked to a refund transaction,
    // return the full refund detail so the right-pane "Refund Panel"
    // can render its state-driven actions (upload proof, complete,
    // etc.) without a second round trip.
    let refundDetail = null;
    if (t.rows[0].refund_id) {
      const r = await db.query(
        `SELECT r.id, r.case_number, r.status, r.amount, r.original_amount,
                r.refund_method, r.refund_method_note,
                r.bank_name, r.bank_account_iban, r.account_holder_name,
                r.customer_confirmation_deadline,
                r.customer_confirmed_at, r.customer_declined_at,
                r.payout_proof_url, r.bank_reference,
                r.refund_invoice_number, r.payout_confirmed_at,
                r.state_changed_at, r.created_at, r.updated_at
         FROM refunds r WHERE r.id = $1`,
        [t.rows[0].refund_id]
      );
      refundDetail = r.rows[0] || null;
    }

    res.json({ ticket: t.rows[0], replies: replies.rows, refund: refundDetail });
  })
);

// POST /inbox/:ticketId/reply — finance writes a customer-visible reply.
// The reply lands in the same thread; the customer reads it in
// /account/my-tickets like any other staff reply.
router.post(
  "/inbox/:ticketId/reply",
  authMiddleware,
  requireRoles(...financeRoles),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.ticketId, 10);
    const msg = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (Number.isNaN(id) || !msg) return res.status(400).json({ error: "الرسالة مطلوبة" });

    const t = await db.query(
      `SELECT id, finance_inbox_state FROM support_tickets WHERE id = $1`, [id]
    );
    if (t.rows.length === 0) return res.status(404).json({ error: "غير موجود" });
    if (t.rows[0].finance_inbox_state !== 'in_inbox') {
      return res.status(403).json({ error: "هذه التذكرة ليست في صندوق المالية" });
    }

    const reply = await db.query(
      `INSERT INTO support_ticket_replies
         (ticket_id, sender_id, sender_type, sender_role, message, visibility)
       VALUES ($1, $2, 'admin', $3, $4, 'customer_visible')
       RETURNING *`,
      [id, req.user.id, req.user.role, msg]
    );
    await db.query(`UPDATE support_tickets SET updated_at = NOW(), status = CASE WHEN status = 'new' THEN 'in_progress' ELSE status END WHERE id = $1`, [id]);
    res.json({ ok: true, reply: reply.rows[0] });
  })
);

// POST /inbox/:ticketId/internal-note — staff-only message, never
// shown to the customer.
router.post(
  "/inbox/:ticketId/internal-note",
  authMiddleware,
  requireRoles(...financeRoles),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.ticketId, 10);
    const msg = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (Number.isNaN(id) || !msg) return res.status(400).json({ error: "الملاحظة مطلوبة" });

    const t = await db.query(
      `SELECT id, finance_inbox_state FROM support_tickets WHERE id = $1`, [id]
    );
    if (t.rows.length === 0) return res.status(404).json({ error: "غير موجود" });
    if (t.rows[0].finance_inbox_state !== 'in_inbox') {
      return res.status(403).json({ error: "هذه التذكرة ليست في صندوق المالية" });
    }

    const reply = await db.query(
      `INSERT INTO support_ticket_replies
         (ticket_id, sender_id, sender_type, sender_role, message, visibility)
       VALUES ($1, $2, 'internal', $3, $4, 'internal')
       RETURNING *`,
      [id, req.user.id, req.user.role, msg]
    );
    await db.query(`UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`, [id]);
    res.json({ ok: true, reply: reply.rows[0] });
  })
);

// POST /inbox/:ticketId/return-to-support — hand the ticket back.
router.post(
  "/inbox/:ticketId/return-to-support",
  authMiddleware,
  requireRoles(...financeRoles),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.ticketId, 10);
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    if (Number.isNaN(id)) return res.status(400).json({ error: "معرف غير صالح" });

    const t = await db.query(
      `SELECT id, finance_inbox_state FROM support_tickets WHERE id = $1`, [id]
    );
    if (t.rows.length === 0) return res.status(404).json({ error: "غير موجود" });
    if (t.rows[0].finance_inbox_state !== 'in_inbox') {
      return res.status(400).json({ error: "غير قابلة للإرجاع من هنا" });
    }

    await db.query(
      `UPDATE support_tickets
       SET finance_inbox_state = 'returned_to_support',
           auto_assigned_role = 'support_admin',
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
    await db.query(
      `INSERT INTO support_ticket_replies
         (ticket_id, sender_id, sender_type, sender_role, message, visibility)
       VALUES ($1, $2, 'internal', $3, $4, 'internal')`,
      [id, req.user.id, req.user.role,
       note ? `أُعيدت للدعم: ${note}` : "أعادت المالية التذكرة للدعم."]
    );
    res.json({ ok: true });
  })
);

// POST /inbox/:ticketId/convert-to-refund-transaction
//
// The single moment when a refund row is born. Creates a refunds
// row in status='pending_customer_confirmation' with a 4-day deadline.
// The customer sees a notification to open the refund page, pick a
// method (credit_card or bank), and confirm.
router.post(
  "/inbox/:ticketId/convert-to-refund-transaction",
  authMiddleware,
  requireRoles(...financeRoles),
  asyncHandler(async (req, res) => {
    const ticketId = parseInt(req.params.ticketId, 10);
    if (Number.isNaN(ticketId)) return res.status(400).json({ error: "معرف غير صالح" });

    const amount = req.body?.amount != null ? parseFloat(req.body.amount) : null;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "المبلغ مطلوب ويجب أن يكون أكبر من صفر" });
    }

    const tRes = await db.query(
      `SELECT * FROM support_tickets WHERE id = $1`, [ticketId]
    );
    if (tRes.rows.length === 0) return res.status(404).json({ error: "التذكرة غير موجودة" });
    const ticket = tRes.rows[0];
    if (ticket.finance_inbox_state !== 'in_inbox') {
      return res.status(400).json({ error: "هذه التذكرة ليست في صندوق المالية" });
    }
    if (ticket.refund_id) {
      return res.status(409).json({ error: "هذه التذكرة لها معاملة استرداد قائمة", refund_id: ticket.refund_id });
    }

    let originalAmount = null;
    if (ticket.invoice_id) {
      const inv = await db.query(`SELECT total FROM invoices WHERE id = $1`, [ticket.invoice_id]);
      if (inv.rows[0]) {
        originalAmount = parseFloat(inv.rows[0].total);
        if (amount > originalAmount) {
          return res.status(400).json({ error: `المبلغ (${amount}) يتجاوز قيمة الفاتورة (${originalAmount})` });
        }
      }
    }
    const refundType = (originalAmount != null && amount < originalAmount) ? 'partial' : 'full';
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 4); // 4-day customer confirmation window

    const client = await db.connect();
    let didCommit = false;
    try {
      await client.query('BEGIN');
      const caseNumber = await refundSM.mintCaseNumber(client);
      const ins = await client.query(
        `INSERT INTO refunds
           (user_id, invoice_id, ticket_id, amount, original_amount,
            estimated_refund_amount, refund_type, reason,
            status, case_number,
            customer_confirmation_deadline,
            assigned_finance_user_id,
            state_changed_at, state_changed_by,
            processed_by, processed_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $4, $6, $7,
                 'pending_customer_confirmation', $8, $9,
                 $10, NOW(), $10, $10, NOW(), NOW(), NOW())
         RETURNING *`,
        [
          ticket.user_id, ticket.invoice_id || null, ticketId,
          amount, originalAmount, refundType, reason || null,
          caseNumber, deadline, req.user.id,
        ]
      );
      const refund = ins.rows[0];

      // Stamp the ticket → refund link (does NOT remove from inbox;
      // finance keeps the conversation open with the customer).
      await client.query(
        `UPDATE support_tickets SET refund_id = $1, updated_at = NOW() WHERE id = $2`,
        [refund.id, ticketId]
      );
      // Customer-visible reply telling them what just happened.
      await client.query(
        `INSERT INTO support_ticket_replies
           (ticket_id, sender_id, sender_type, sender_role, message, visibility)
         VALUES ($1, $2, 'admin', $3, $4, 'customer_visible')`,
        [ticketId, req.user.id, req.user.role,
         `تم فتح معاملة استرداد رقم ${caseNumber} بمبلغ ${amount} ر.س. الرجاء فتح صفحة الاسترداد لاختيار طريقة الإرجاع وتأكيد طلبك خلال 4 أيام.`]
      );

      await refundSM.recordEvent(client, {
        refund_id: refund.id,
        event_type: 'transaction_created',
        from_state: null,
        to_state: 'pending_customer_confirmation',
        actor_user_id: req.user.id,
        actor_name: req.user.name,
        actor_role: req.user.role,
        note: reason || null,
        payload: { ticket_id: ticketId, amount, case_number: caseNumber },
      });
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, link, channel, status, payload, scheduled_at)
         VALUES ($1, 'refund_needs_confirmation',
                 'لديك معاملة استرداد بانتظار تأكيدك',
                 $2, $3, 'app', 'pending', $4::jsonb, NOW())`,
        [
          ticket.user_id,
          `معاملة الاسترداد ${caseNumber} بمبلغ ${amount} ر.س جاهزة. افتحها لتختار طريقة الإرجاع وتأكيد طلبك خلال 4 أيام.`,
          `/account/refunds/${refund.id}/confirm`,
          JSON.stringify({ refund_id: refund.id, ticket_id: ticketId, case_number: caseNumber }),
        ]
      );

      await client.query('COMMIT');
      didCommit = true;
      client.release();
      res.json({ ok: true, refund });
    } catch (err) {
      if (!didCommit) { try { await client.query('ROLLBACK'); } catch { /* ignore */ } }
      try { client.release(); } catch { /* ignore */ }
      throw err;
    }
  })
);


// ════════════════════════════════════════════════════════════════════
// REFUND CASES — the canonical workspace for finance after conversion.
// Listing, detail, transition, attach proof, customer info.
// ════════════════════════════════════════════════════════════════════

router.get(
  "/cases",
  authMiddleware,
  requireRoles(...financeRoles),
  asyncHandler(async (req, res) => {
    const state = typeof req.query.state === 'string' ? req.query.state : null;
    const params = [];
    let where = '1=1';
    if (state && state !== 'all') {
      if (state === 'active') {
        where = `r.status IN ('pending_review','waiting_customer_info','approved','awaiting_bank_transfer','proof_uploaded')`;
      } else if (refundSM.ALL_STATES.includes(state)) {
        params.push(state);
        where = `r.status = $1`;
      } else {
        return res.status(400).json({ error: "حالة غير معروفة" });
      }
    }

    // Refund-request summary fields ONLY. We deliberately do NOT
    // expose ticket_id, ticket_number, or anything that lets the
    // finance UI fetch the support conversation. The single
    // consolidated brief is r.support_note (written by support at
    // forward-time). That's all finance sees about the customer's
    // chat history with us.
    const rows = await db.query(
      `SELECT r.id, r.case_number, r.status, r.amount, r.original_amount,
              r.estimated_refund_amount, r.approved_refund_amount,
              r.refund_type, r.reason, r.support_note,
              r.support_followup_required,
              r.created_at, r.updated_at,
              r.state_changed_at, r.due_at, r.priority,
              r.payout_proof_url, r.payout_confirmed_at, r.bank_reference,
              r.refund_invoice_number,
              r.bank_name, r.bank_account_iban, r.account_holder_name,
              r.invoice_id, r.user_id, r.assigned_finance_user_id,
              u.name AS user_name, u.email AS user_email,
              i.invoice_number AS original_invoice_number
       FROM refunds r
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN invoices i ON i.id = r.invoice_id
       WHERE ${where}
       ORDER BY
         CASE r.status
           WHEN 'awaiting_bank_transfer' THEN 1
           WHEN 'pending_review'         THEN 2
           WHEN 'waiting_customer_info'  THEN 3
           WHEN 'approved'               THEN 4
           WHEN 'proof_uploaded'         THEN 5
           ELSE 9
         END,
         r.state_changed_at DESC NULLS LAST,
         r.id DESC`,
      params
    );
    res.json({ cases: rows.rows });
  })
);

router.get(
  "/cases/:id",
  authMiddleware,
  requireRoles(...financeRoles),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "معرف غير صالح" });

    // Detail endpoint mirrors the list contract: refund-request fields
    // + customer + invoice ONLY. The support conversation thread that
    // used to be returned as `ticket_replies` is GONE — the
    // owner's rule is "finance reads support_note, never the chat".
    // We also strip ticket_number / ticket_subject — they're support
    // internals that have no bearing on a refund decision.
    const c = await db.query(
      `SELECT r.id, r.case_number, r.status, r.amount, r.original_amount,
              r.estimated_refund_amount, r.approved_refund_amount,
              r.refund_type, r.reason, r.support_note,
              r.support_followup_required,
              r.decision_note, r.priority, r.due_at,
              r.state_changed_at, r.state_changed_by, r.pre_wait_status,
              r.bank_name, r.bank_account_iban, r.account_holder_name,
              r.payout_proof_url, r.payout_confirmed_at, r.bank_reference,
              r.refund_invoice_number, r.refund_invoice_issued_at,
              r.assigned_finance_user_id, r.processed_by, r.processed_at,
              r.waiting_info_requested_at, r.waiting_info_received_at,
              r.created_at, r.updated_at,
              r.user_id, r.invoice_id,
              u.name AS user_name, u.email AS user_email, u.phone AS user_phone,
              i.invoice_number AS original_invoice_number, i.total AS invoice_total
       FROM refunds r
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN invoices i ON i.id = r.invoice_id
       WHERE r.id = $1`,
      [id]
    );
    if (c.rows.length === 0) return res.status(404).json({ error: "القضية غير موجودة" });

    const events = await db.query(
      `SELECT id, event_type, from_state, to_state,
              actor_name_snapshot AS actor_name, actor_role_snapshot AS actor_role,
              note, payload, created_at
       FROM refund_case_events
       WHERE refund_id = $1
       ORDER BY created_at ASC, id ASC`,
      [id]
    );

    res.json({
      case: c.rows[0],
      events: events.rows,
      // ticket_replies intentionally absent — finance never sees the
      // customer↔support conversation.
    });
  })
);

// Transition endpoint. All state moves funnel through here so guards,
// notifications, and events stay in lockstep with the DB.
router.patch(
  "/cases/:id/transition",
  authMiddleware,
  requireRoles(...financeRoles),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const toState = req.body?.to;
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    const payloadIn = req.body?.payload || {};
    if (Number.isNaN(id)) return res.status(400).json({ error: "معرف غير صالح" });
    if (!refundSM.ALL_STATES.includes(toState)) {
      return res.status(400).json({ error: "حالة الوجهة غير معروفة" });
    }

    const client = await db.connect();
    let didCommit = false;
    try {
      await client.query('BEGIN');

      const r = await client.query(
        `SELECT * FROM refunds WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (r.rows.length === 0) {
        await client.query('ROLLBACK'); client.release();
        return res.status(404).json({ error: "القضية غير موجودة" });
      }
      const refund = r.rows[0];
      const fromState = refund.status;

      if (!refundSM.canTransition(fromState, toState)) {
        await client.query('ROLLBACK'); client.release();
        return res.status(409).json({
          error: `لا يمكن الانتقال من "${fromState}" إلى "${toState}"`,
        });
      }
      const guardErr = refundSM.guardTransition(toState, refund, { ...payloadIn, note });
      if (guardErr) {
        await client.query('ROLLBACK'); client.release();
        return res.status(400).json({ error: guardErr });
      }

      // Side-effects per destination state.
      const updates = [`status = $1`, `state_changed_at = NOW()`, `state_changed_by = $2`, `updated_at = NOW()`];
      const values = [toState, req.user.id];
      let nextIdx = 3;

      // Auto-claim: any finance user transitioning an unassigned case
      // takes ownership of it. Stops the "everybody can edit, nobody is
      // responsible" failure mode without forcing an extra click.
      if (!refund.assigned_finance_user_id) {
        updates.push(`assigned_finance_user_id = $${nextIdx++}`);
        values.push(req.user.id);
      }

      if (toState === refundSM.STATES.APPROVED) {
        // Commit the approved figure to its own column AND mirror it
        // onto amount so downstream invoicing/notifications use the
        // exact number finance signed off on.
        const approvedAmt = payloadIn.approved_refund_amount != null
          ? Math.round(Number(payloadIn.approved_refund_amount) * 100) / 100
          : (refund.approved_refund_amount != null ? Number(refund.approved_refund_amount) : null);
        updates.push(`approved_refund_amount = $${nextIdx++}`);
        values.push(approvedAmt);
        updates.push(`amount = $${nextIdx++}`);
        values.push(approvedAmt);
        if (!refund.due_at) {
          updates.push(`due_at = $${nextIdx++}`);
          values.push(refundSM.computeDueAt(6));
        }
        updates.push(`processed_by = COALESCE(processed_by, $${nextIdx++})`);
        values.push(req.user.id);
        updates.push(`processed_at = COALESCE(processed_at, NOW())`);
      }
      if (toState === refundSM.STATES.WAITING_CUSTOMER_INFO) {
        updates.push(`waiting_info_requested_at = NOW()`);
        updates.push(`pre_wait_status = $${nextIdx++}`);
        values.push(fromState);
      }
      if (fromState === refundSM.STATES.WAITING_CUSTOMER_INFO && toState === refundSM.STATES.PENDING_REVIEW) {
        updates.push(`waiting_info_received_at = NOW()`);
      }
      if (toState === refundSM.STATES.REJECTED) {
        updates.push(`decision_note = COALESCE($${nextIdx++}, decision_note)`);
        values.push(note || null);
      }

      values.push(id);
      const upd = await client.query(
        `UPDATE refunds SET ${updates.join(', ')} WHERE id = $${nextIdx} RETURNING *`,
        values
      );

      await refundSM.recordEvent(client, {
        refund_id: id,
        event_type: 'state_changed',
        from_state: fromState,
        to_state: toState,
        actor_user_id: req.user.id,
        actor_name: req.user.name,
        actor_role: req.user.role,
        note: note || null,
        payload: payloadIn,
      });

      // Customer notifications — only the four "external" states.
      let notif = null;
      if (toState === refundSM.STATES.APPROVED) {
        notif = {
          type: 'refund_approved',
          title: 'تم اعتماد طلب الاسترداد',
          body: `تم اعتماد استرداد ${refund.case_number}. جاري تجهيز التحويل البنكي خلال 4-6 أيام عمل.`,
        };
      } else if (toState === refundSM.STATES.WAITING_CUSTOMER_INFO) {
        notif = {
          type: 'refund_needs_bank_info',
          title: 'نحتاج بيانات حسابك البنكي',
          body: `لإتمام استرداد ${refund.case_number} نحتاج: اسم البنك، رقم IBAN، اسم صاحب الحساب.`,
        };
      } else if (toState === refundSM.STATES.REJECTED) {
        notif = {
          type: 'refund_rejected',
          title: 'تم رفض طلب الاسترداد',
          body: `سبب الرفض: ${note || 'لا يوجد'}`,
        };
      } else if (toState === refundSM.STATES.COMPLETED) {
        // The actual money-moved notification — fires on the
        // proof_uploaded -> completed transition that the accountant
        // confirms after they've executed the bank transfer / card refund.
        const methodText = refund.refund_method === 'credit_card'
          ? 'بطاقتك الائتمانية الأصلية'
          : 'حسابك البنكي';
        notif = {
          type: 'refund_completed',
          title: 'تم تحويل مبلغ الاسترداد ✅',
          body: `تم استرداد ${refund.amount} ر.س إلى ${methodText}. يصلك خلال 4-6 أيام عمل بنكية. شكراً لتعاملك مع بيت الجزيرة.`,
        };
      }
      if (notif) {
        await client.query(
          `INSERT INTO notifications (user_id, type, title, body, channel, status, payload, scheduled_at)
           VALUES ($1, $2, $3, $4, 'app', 'pending', $5, NOW())`,
          [
            refund.user_id, notif.type, notif.title, notif.body,
            JSON.stringify({ refund_id: id, case_number: refund.case_number }),
          ]
        );
      }

      await client.query('COMMIT');
      didCommit = true;
      client.release();
      res.json({ ok: true, case: upd.rows[0] });
    } catch (err) {
      if (!didCommit) { try { await client.query('ROLLBACK'); } catch { /* ignore */ } }
      try { client.release(); } catch { /* ignore */ }
      throw err;
    }
  })
);

// Attach (or replace) bank-transfer proof on a case. Flips state to
// proof_uploaded as part of the same write.
router.post(
  "/cases/:id/attach-proof",
  authMiddleware,
  requireRoles(...financeRoles),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const proofUrl = typeof req.body?.payout_proof_url === 'string' ? req.body.payout_proof_url.trim() : '';
    const bankRef = typeof req.body?.bank_reference === 'string' ? req.body.bank_reference.trim() : '';
    if (Number.isNaN(id) || !proofUrl) {
      return res.status(400).json({ error: "صورة إثبات التحويل مطلوبة" });
    }

    const client = await db.connect();
    let didCommit = false;
    try {
      await client.query('BEGIN');
      const r = await client.query(`SELECT * FROM refunds WHERE id = $1 FOR UPDATE`, [id]);
      if (r.rows.length === 0) {
        await client.query('ROLLBACK'); client.release();
        return res.status(404).json({ error: "القضية غير موجودة" });
      }
      const refund = r.rows[0];
      if (!refundSM.canTransition(refund.status, refundSM.STATES.PROOF_UPLOADED)) {
        await client.query('ROLLBACK'); client.release();
        return res.status(409).json({ error: `لا يمكن رفع الإثبات من حالة "${refund.status}"` });
      }

      const upd = await client.query(
        `UPDATE refunds
         SET status = $1, payout_proof_url = $2,
             bank_reference = COALESCE(NULLIF($3, ''), bank_reference),
             state_changed_at = NOW(), state_changed_by = $4, updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [refundSM.STATES.PROOF_UPLOADED, proofUrl, bankRef, req.user.id, id]
      );
      await refundSM.recordEvent(client, {
        refund_id: id,
        event_type: 'proof_uploaded',
        from_state: refund.status,
        to_state: refundSM.STATES.PROOF_UPLOADED,
        actor_user_id: req.user.id,
        actor_name: req.user.name,
        actor_role: req.user.role,
        note: bankRef ? `bank_reference=${bankRef}` : null,
        payload: { payout_proof_url: proofUrl },
      });
      await client.query('COMMIT');
      didCommit = true;
      client.release();
      res.json({ ok: true, case: upd.rows[0] });
    } catch (err) {
      if (!didCommit) { try { await client.query('ROLLBACK'); } catch { /* ignore */ } }
      try { client.release(); } catch { /* ignore */ }
      throw err;
    }
  })
);

// Assign / re-assign / unassign the case to a finance user. Use:
//   PATCH /api/finance/cases/:id/assign  { assignee_id: <uuid|null> }
// Passing null or omitting assignee_id un-assigns the case (it goes
// back to the "free" pool that any finance user can claim by acting).
router.patch(
  "/cases/:id/assign",
  authMiddleware,
  requireRoles(...financeRoles),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "معرف غير صالح" });
    const assigneeRaw = req.body?.assignee_id;
    const assignee = (typeof assigneeRaw === "string" && assigneeRaw.trim()) ? assigneeRaw.trim() : null;

    // Validate assignee is actually a finance user (or super_admin).
    if (assignee) {
      const u = await db.query(
        `SELECT id, role FROM users WHERE id = $1`,
        [assignee]
      );
      if (u.rows.length === 0) {
        return res.status(400).json({ error: "المستخدم غير موجود" });
      }
      const okRoles = new Set(["finance_admin", "super_admin", "admin_manager"]);
      if (!okRoles.has(u.rows[0].role)) {
        return res.status(400).json({ error: "لا يمكن تعيين القضية إلى مستخدم خارج فريق المالية" });
      }
    }

    const r = await db.query(`SELECT id, assigned_finance_user_id, status FROM refunds WHERE id = $1`, [id]);
    if (r.rows.length === 0) return res.status(404).json({ error: "القضية غير موجودة" });
    const fromAssignee = r.rows[0].assigned_finance_user_id;

    const upd = await db.query(
      `UPDATE refunds
       SET assigned_finance_user_id = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [assignee, id]
    );

    // Best-effort event log so the case timeline shows who got it.
    try {
      await db.query(
        `INSERT INTO refund_case_events
           (refund_id, event_type, actor_user_id, actor_name_snapshot,
            actor_role_snapshot, payload)
         VALUES ($1, 'assignment_changed', $2, $3, $4, $5::jsonb)`,
        [
          id, req.user.id, req.user?.name || null, req.user?.role || null,
          JSON.stringify({ from: fromAssignee, to: assignee }),
        ]
      );
    } catch (e) {
      if (e && e.code !== '42P01') console.warn('[assign] event log:', e.message);
    }

    res.json({ ok: true, case: upd.rows[0] });
  })
);

// Update bank info on a case (finance editing what the customer gave
// them via reply). If status was waiting_customer_info, this also
// flips the case back to pending_review.
router.post(
  "/cases/:id/customer-info",
  authMiddleware,
  requireRoles(...financeRoles),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const bankName = typeof req.body?.bank_name === 'string' ? req.body.bank_name.trim() : '';
    const iban = typeof req.body?.bank_account_iban === 'string' ? req.body.bank_account_iban.trim() : '';
    const holder = typeof req.body?.account_holder_name === 'string' ? req.body.account_holder_name.trim() : '';
    if (Number.isNaN(id) || !bankName || !iban || !holder) {
      return res.status(400).json({ error: "بيانات البنك الثلاثة مطلوبة" });
    }

    const client = await db.connect();
    let didCommit = false;
    try {
      await client.query('BEGIN');
      const r = await client.query(`SELECT * FROM refunds WHERE id = $1 FOR UPDATE`, [id]);
      if (r.rows.length === 0) {
        await client.query('ROLLBACK'); client.release();
        return res.status(404).json({ error: "القضية غير موجودة" });
      }
      const refund = r.rows[0];
      const wasWaiting = refund.status === refundSM.STATES.WAITING_CUSTOMER_INFO;
      const nextStatus = wasWaiting
        ? (refund.pre_wait_status || refundSM.STATES.PENDING_REVIEW)
        : refund.status;

      const upd = await client.query(
        `UPDATE refunds
         SET bank_name = $1, bank_account_iban = $2, account_holder_name = $3,
             status = $4,
             waiting_info_received_at = CASE WHEN status = 'waiting_customer_info' THEN NOW() ELSE waiting_info_received_at END,
             state_changed_at = CASE WHEN status <> $4 THEN NOW() ELSE state_changed_at END,
             state_changed_by = CASE WHEN status <> $4 THEN $5 ELSE state_changed_by END,
             updated_at = NOW()
         WHERE id = $6
         RETURNING *`,
        [bankName, iban, holder, nextStatus, req.user.id, id]
      );
      await refundSM.recordEvent(client, {
        refund_id: id,
        event_type: wasWaiting ? 'customer_info_received' : 'customer_info_updated',
        from_state: refund.status,
        to_state: nextStatus,
        actor_user_id: req.user.id,
        actor_name: req.user.name,
        actor_role: req.user.role,
        note: null,
        payload: { bank_name: bankName, bank_account_iban: iban, account_holder_name: holder },
      });
      await client.query('COMMIT');
      didCommit = true;
      client.release();
      res.json({ ok: true, case: upd.rows[0] });
    } catch (err) {
      if (!didCommit) { try { await client.query('ROLLBACK'); } catch { /* ignore */ } }
      try { client.release(); } catch { /* ignore */ }
      throw err;
    }
  })
);

module.exports = router;
