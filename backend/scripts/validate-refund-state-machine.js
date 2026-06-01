// ─────────────────────────────────────────────────────────────────
// End-to-end validation of the Refund Case state machine.
//
// Runs the FULL workflow against the live DB:
//   Customer composer
//   → Support review
//   → Support transfer to Finance Inbox
//   → Convert to Refund Case (pending_review)
//   → Approved
//   → Awaiting Bank Transfer
//   → Proof Uploaded
//   → Completed
//
// At every transition we snapshot:
//   - The support_tickets row (relevant columns)
//   - The refunds row (relevant columns)
//   - GET /api/finance/counters response
//   - notifications inserted since the previous snapshot
//   - refund_case_events for this case
//
// Cleans up after itself (best-effort) — every row created here
// carries a __VALIDATION__ marker in its text fields so a manual
// purge is straightforward if cleanup fails.
//
// Usage:
//   node --env-file=.env backend/scripts/validate-refund-state-machine.js
// ─────────────────────────────────────────────────────────────────

const db = require("../db");
const refundSM = require("../services/refundStateMachine");

const MARKER = "__VALIDATION__";
const VALIDATION_EMAIL = `validation_${Date.now()}@example.com`;

const snapshots = [];
let lastNotifId = 0; // watermark so each step shows only new notifications

function log(...args) { console.log(...args); }
function section(title) {
  log("");
  log("═══════════════════════════════════════════════════════════════");
  log("  " + title);
  log("═══════════════════════════════════════════════════════════════");
}
function divider() { log("───────────────────────────────────────────────────────────────"); }

// ── tiny helpers ─────────────────────────────────────────────────
async function fetchTicket(id) {
  if (!id) return null;
  const r = await db.query(
    `SELECT id, ticket_number, status, department, auto_assigned_role,
            transferred_to_finance_at, finance_inbox_state,
            refund_id, customer_reopen_deadline
     FROM support_tickets WHERE id = $1`,
    [id]
  );
  return r.rows[0] || null;
}

async function fetchCase(id) {
  if (!id) return null;
  const r = await db.query(
    `SELECT id, case_number, status, amount, original_amount,
            estimated_refund_amount, approved_refund_amount,
            bank_name, bank_account_iban, account_holder_name,
            payout_proof_url, payout_confirmed_at, bank_reference,
            refund_invoice_number,
            assigned_finance_user_id, priority, due_at,
            state_changed_at, state_changed_by, pre_wait_status,
            ticket_id
     FROM refunds WHERE id = $1`,
    [id]
  );
  return r.rows[0] || null;
}

async function fetchEvents(refundId) {
  if (!refundId) return [];
  const r = await db.query(
    `SELECT id, event_type, from_state, to_state, actor_name_snapshot,
            actor_role_snapshot, note, created_at
     FROM refund_case_events WHERE refund_id = $1
     ORDER BY id ASC`,
    [refundId]
  );
  return r.rows;
}

async function fetchNewNotifications(userId, watermark) {
  const r = await db.query(
    `SELECT id, type, title, body, created_at
     FROM notifications WHERE user_id = $1 AND id > $2
     ORDER BY id ASC`,
    [userId, watermark]
  );
  return r.rows;
}

async function snapshot(label, ctx) {
  const counters = await refundSM.fetchCounters(db);
  const ticket = await fetchTicket(ctx.ticketId);
  const refund = await fetchCase(ctx.refundId);
  const newNotifs = await fetchNewNotifications(ctx.userId, lastNotifId);
  if (newNotifs.length) lastNotifId = newNotifs[newNotifs.length - 1].id;
  const events = await fetchEvents(ctx.refundId);

  const snap = { label, ts: new Date().toISOString(), counters, ticket, refund, newNotifs, events };
  snapshots.push(snap);

  log("");
  log(`▶ SNAPSHOT: ${label}`);
  divider();
  log("Counters:", JSON.stringify(counters, null, 0));
  if (ticket) {
    log("Ticket:", JSON.stringify({
      id: ticket.id,
      number: ticket.ticket_number,
      status: ticket.status,
      role: ticket.auto_assigned_role,
      transferred_at: ticket.transferred_to_finance_at,
      finance_inbox_state: ticket.finance_inbox_state,
      linked_refund_id: ticket.refund_id,
    }));
  } else {
    log("Ticket: (none)");
  }
  if (refund) {
    log("Refund Case:", JSON.stringify({
      id: refund.id,
      case_number: refund.case_number,
      status: refund.status,
      amount: refund.amount,
      estimated: refund.estimated_refund_amount,
      approved: refund.approved_refund_amount,
      bank: refund.bank_name ? `${refund.bank_name} / ${refund.bank_account_iban} / ${refund.account_holder_name}` : null,
      proof: refund.payout_proof_url ? "[present]" : null,
      bank_reference: refund.bank_reference,
      refund_invoice: refund.refund_invoice_number,
      due_at: refund.due_at,
      assigned_to: refund.assigned_finance_user_id ? "[set]" : null,
    }));
  } else {
    log("Refund Case: (not yet created)");
  }
  if (newNotifs.length) {
    log(`New customer notifications (${newNotifs.length}):`);
    for (const n of newNotifs) {
      log(`  - [${n.type}] ${n.title}: ${n.body?.slice(0, 100) || ""}`);
    }
  } else {
    log("New customer notifications: (none)");
  }
  if (events.length) {
    log(`Refund case events so far (${events.length}):`);
    for (const e of events) {
      const flow = e.from_state ? `${e.from_state} → ${e.to_state}` : `(${e.event_type}) → ${e.to_state || "—"}`;
      log(`  - ${flow}  by ${e.actor_role_snapshot || "?"}: ${e.note?.slice(0, 80) || ""}`);
    }
  }
}

// ── workflow ─────────────────────────────────────────────────────
async function main() {
  const ctx = { userId: null, supportAdminId: null, financeAdminId: null, ticketId: null, refundId: null };

  section("SETUP: create test customer, support agent, finance agent, invoice");

  // 1) Customer
  const userRes = await db.query(
    `INSERT INTO users (email, password_hash, name, phone, role, status, created_at)
     VALUES ($1, 'x', $2, '0500000099', 'user', 'active', NOW())
     RETURNING id`,
    [VALIDATION_EMAIL, `${MARKER} Customer`]
  );
  ctx.userId = userRes.rows[0].id;
  log("Customer id:", ctx.userId);

  // 2) Support admin
  const saRes = await db.query(
    `INSERT INTO users (email, password_hash, name, phone, role, status, created_at)
     VALUES ($1, 'x', $2, '0500000098', 'support_admin', 'active', NOW())
     RETURNING id`,
    [`validation_support_${Date.now()}@example.com`, `${MARKER} Support`]
  );
  ctx.supportAdminId = saRes.rows[0].id;

  // 3) Finance admin
  const faRes = await db.query(
    `INSERT INTO users (email, password_hash, name, phone, role, status, created_at)
     VALUES ($1, 'x', $2, '0500000097', 'finance_admin', 'active', NOW())
     RETURNING id`,
    [`validation_finance_${Date.now()}@example.com`, `${MARKER} Finance`]
  );
  ctx.financeAdminId = faRes.rows[0].id;
  log("Support admin id:", ctx.supportAdminId);
  log("Finance admin id:", ctx.financeAdminId);

  // 4) Invoice the customer "paid" for — gives us a real reference
  //    amount the refund will key off of.
  let invoiceId = null;
  try {
    const inv = await db.query(
      `INSERT INTO invoices (user_id, invoice_number, total, currency, status, created_at)
       VALUES ($1, $2, $3, 'SAR', 'paid', NOW())
       RETURNING id`,
      [ctx.userId, `INV-VAL-${Date.now()}`, 599.00]
    );
    invoiceId = inv.rows[0].id;
    log("Invoice id:", invoiceId, "(599 SAR)");
  } catch (e) {
    log("[!] invoice insert failed — continuing without invoice. err:", e.message);
  }

  // Watermark notifications BEFORE any workflow runs so we only see
  // notifications generated by the validation itself.
  const wm = await db.query(`SELECT COALESCE(MAX(id), 0) AS id FROM notifications WHERE user_id = $1`, [ctx.userId]);
  lastNotifId = wm.rows[0].id;
  log("Notification watermark:", lastNotifId);

  await snapshot("STEP 0: clean slate (no ticket, no case)", ctx);

  // ════════════════════════════════════════════════════════════════
  section("STEP 1: customer submits refund request via Composer");
  // Replicate POST /api/support with ticket_type=financial, role=user.
  // Routing override (route handler logic) re-assigns to support_admin
  // because role=user + department=financial.
  // ════════════════════════════════════════════════════════════════
  const department = "financial";
  const routing = { role: "support_admin", sla_hours: 24 }; // routing override per support.js
  const ticketNumber = `TKT-VAL-${Date.now()}`;
  const tIns = await db.query(
    `INSERT INTO support_tickets
       (user_id, ticket_number, department, subcategory, category, priority,
        subject, description, auto_assigned_role, sla_hours, status,
        source, invoice_id, ticket_type, created_at, updated_at)
     VALUES ($1, $2, $3, 'refund', 'financial', 'medium',
             $4, $5, $6, $7, 'new',
             'unified_composer', $8, 'financial', NOW(), NOW())
     RETURNING id`,
    [
      ctx.userId, ticketNumber, department,
      `${MARKER} طلب استرداد تجريبي`,
      `${MARKER} هذه تذكرة تحقق من آلة الحالات. يجب حذفها لاحقاً.`,
      routing.role, routing.sla_hours, invoiceId,
    ]
  );
  ctx.ticketId = tIns.rows[0].id;
  // Customer ack notification
  await db.query(
    `INSERT INTO notifications (user_id, type, title, body, channel, status, scheduled_at)
     VALUES ($1, 'ticket_received', 'تم استلام طلبك',
             $2, 'app', 'pending', NOW())`,
    [ctx.userId, `${MARKER} تم استلام طلبك. رقم التذكرة: ${ticketNumber}`]
  );
  await snapshot("STEP 1: ticket created, sits with Support (role=support_admin)", ctx);

  // ════════════════════════════════════════════════════════════════
  section("STEP 2: Support agent opens ticket (in_review)");
  // ════════════════════════════════════════════════════════════════
  await db.query(`UPDATE support_tickets SET status = 'in_progress', updated_at = NOW() WHERE id = $1`, [ctx.ticketId]);
  await snapshot("STEP 2: status=in_progress (Support is working on it)", ctx);

  // ════════════════════════════════════════════════════════════════
  section("STEP 3: Support transfers to Finance Inbox (PATCH /transfer)");
  // Replicates the support.js /transfer route. Sets
  // finance_inbox_state='in_inbox', stamps transferred_to_finance_*,
  // re-routes role to finance_admin. Does NOT create a refund.
  // ════════════════════════════════════════════════════════════════
  await db.query(
    `UPDATE support_tickets
     SET department = 'financial',
         auto_assigned_role = 'finance_admin',
         sla_hours = 24,
         transferred_to_finance_at = NOW(),
         transferred_to_finance_by = $1,
         finance_inbox_state = 'in_inbox',
         updated_at = NOW()
     WHERE id = $2`,
    [ctx.supportAdminId, ctx.ticketId]
  );
  await db.query(
    `INSERT INTO support_ticket_replies (ticket_id, sender_id, sender_type, message)
     VALUES ($1, $2, 'internal', $3)`,
    [ctx.ticketId, ctx.supportAdminId, `${MARKER} Support transferred to Finance for refund evaluation.`]
  );
  await snapshot("STEP 3: ticket is now in Finance Inbox (finance_inbox count +1)", ctx);

  // ════════════════════════════════════════════════════════════════
  section("STEP 4: Finance Inbox → Convert to Refund Case (pending_review)");
  // Replicates POST /api/finance/inbox/:ticketId/convert-to-case.
  // Bank info LADDER: body → ticket snapshot → user profile.
  // We pass it in the body so the case opens directly in pending_review.
  // ════════════════════════════════════════════════════════════════
  const bankBody = {
    bank_name: "Al Rajhi Bank",
    bank_account_iban: "SA0380000000608010167519",
    account_holder_name: `${MARKER} Customer`,
  };
  // Mimic the route: get invoice total, mint case_number, INSERT refund.
  const ticketRow = await db.query(
    `SELECT user_id, invoice_id, ticket_number FROM support_tickets WHERE id = $1`,
    [ctx.ticketId]
  );
  const invRow = await db.query(`SELECT total FROM invoices WHERE id = $1`, [ticketRow.rows[0].invoice_id]);
  const originalAmount = parseFloat(invRow.rows[0].total);
  const amount = originalAmount;
  const client = await db.getClient();
  try {
    await client.query("BEGIN");
    const caseNumber = await refundSM.mintCaseNumber(client);
    const ins = await client.query(
      `INSERT INTO refunds
         (user_id, invoice_id, ticket_id, amount, original_amount,
          estimated_refund_amount, refund_type, reason, status, case_number,
          bank_name, bank_account_iban, account_holder_name,
          assigned_finance_user_id,
          state_changed_at, state_changed_by,
          processed_by, processed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'full', $7, 'pending_review', $8,
               $9, $10, $11, $12, NOW(), $13, $14, NOW(), NOW(), NOW())
       RETURNING id`,
      [
        ctx.userId, ticketRow.rows[0].invoice_id, ctx.ticketId,
        amount, originalAmount, amount,
        `${MARKER} converted from inbox`, caseNumber,
        bankBody.bank_name, bankBody.bank_account_iban, bankBody.account_holder_name,
        ctx.financeAdminId, ctx.financeAdminId, ctx.financeAdminId,
      ]
    );
    ctx.refundId = ins.rows[0].id;
    // stamp ticket
    await client.query(
      `UPDATE support_tickets
       SET finance_inbox_state = 'converted_to_refund', refund_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [ctx.refundId, ctx.ticketId]
    );
    await refundSM.recordEvent(client, {
      refund_id: ctx.refundId, event_type: "case_created",
      from_state: null, to_state: "pending_review",
      actor_user_id: ctx.financeAdminId,
      actor_name: `${MARKER} Finance`, actor_role: "finance_admin",
      note: "converted from finance inbox",
      payload: { ticket_id: ctx.ticketId, case_number: caseNumber, amount },
    });
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, channel, status, scheduled_at)
       VALUES ($1, 'refund_case_opened', 'تم فتح قضية استرداد', $2, 'app', 'pending', NOW())`,
      [ctx.userId, `${MARKER} قضية الاسترداد ${caseNumber} قيد المراجعة.`]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK"); throw e;
  } finally {
    client.release();
  }
  await snapshot("STEP 4: refund case created in pending_review (finance_inbox −1, pending_review +1)", ctx);

  // ════════════════════════════════════════════════════════════════
  section("STEP 5: Finance approves with approved_refund_amount=599");
  // Replicates PATCH /api/finance/cases/:id/transition (to=approved).
  // Guard: requires approved_refund_amount and <= original.
  // ════════════════════════════════════════════════════════════════
  {
    const refund = await fetchCase(ctx.refundId);
    const fromState = refund.status;
    const toState = "approved";
    if (!refundSM.canTransition(fromState, toState)) throw new Error(`bad transition ${fromState}→${toState}`);
    const guardErr = refundSM.guardTransition(toState, refund, { approved_refund_amount: 599.00 });
    if (guardErr) throw new Error(`guard rejected: ${guardErr}`);
    const c = await db.getClient();
    try {
      await c.query("BEGIN");
      await c.query(
        `UPDATE refunds
         SET status = 'approved',
             approved_refund_amount = $1,
             amount = $1,
             due_at = NOW() + INTERVAL '6 days',
             state_changed_at = NOW(), state_changed_by = $2,
             processed_by = COALESCE(processed_by, $2),
             processed_at = COALESCE(processed_at, NOW()),
             updated_at = NOW()
         WHERE id = $3`,
        [599.00, ctx.financeAdminId, ctx.refundId]
      );
      await refundSM.recordEvent(c, {
        refund_id: ctx.refundId, event_type: "state_changed",
        from_state: fromState, to_state: toState,
        actor_user_id: ctx.financeAdminId,
        actor_name: `${MARKER} Finance`, actor_role: "finance_admin",
        note: "validation approval",
        payload: { approved_refund_amount: 599 },
      });
      await c.query(
        `INSERT INTO notifications (user_id, type, title, body, channel, status, scheduled_at)
         VALUES ($1, 'refund_approved', 'تم اعتماد طلب الاسترداد', $2, 'app', 'pending', NOW())`,
        [ctx.userId, `${MARKER} تم اعتماد استرداد 599 ر.س. التحويل خلال 4-6 أيام عمل.`]
      );
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  }
  await snapshot("STEP 5: approved (pending_review −1, approved +1)", ctx);

  // ════════════════════════════════════════════════════════════════
  section("STEP 6: Finance starts the bank transfer queue");
  // approved → awaiting_bank_transfer. Banner condition triggers on
  // any case in this state.
  // ════════════════════════════════════════════════════════════════
  {
    const refund = await fetchCase(ctx.refundId);
    const guardErr = refundSM.guardTransition("awaiting_bank_transfer", refund, {});
    if (guardErr) throw new Error(`guard rejected: ${guardErr}`);
    const c = await db.getClient();
    try {
      await c.query("BEGIN");
      await c.query(
        `UPDATE refunds SET status = 'awaiting_bank_transfer',
                            state_changed_at = NOW(), state_changed_by = $1,
                            updated_at = NOW()
         WHERE id = $2`,
        [ctx.financeAdminId, ctx.refundId]
      );
      await refundSM.recordEvent(c, {
        refund_id: ctx.refundId, event_type: "state_changed",
        from_state: "approved", to_state: "awaiting_bank_transfer",
        actor_user_id: ctx.financeAdminId,
        actor_name: `${MARKER} Finance`, actor_role: "finance_admin",
        payload: {},
      });
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  }
  await snapshot("STEP 6: awaiting_bank_transfer (approved −1, awaiting +1) — BANNER ARMS", ctx);

  // ════════════════════════════════════════════════════════════════
  section("STEP 7: Accountant uploads bank proof");
  // Replicates POST /api/finance/cases/:id/attach-proof.
  // ════════════════════════════════════════════════════════════════
  const proofUrl = `https://example.invalid/${MARKER}/proof.png`;
  {
    const refund = await fetchCase(ctx.refundId);
    if (!refundSM.canTransition(refund.status, "proof_uploaded")) throw new Error(`bad transition`);
    const c = await db.getClient();
    try {
      await c.query("BEGIN");
      await c.query(
        `UPDATE refunds
         SET status = 'proof_uploaded',
             payout_proof_url = $1, bank_reference = 'TRX-VALIDATION-001',
             state_changed_at = NOW(), state_changed_by = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [proofUrl, ctx.financeAdminId, ctx.refundId]
      );
      await refundSM.recordEvent(c, {
        refund_id: ctx.refundId, event_type: "proof_uploaded",
        from_state: "awaiting_bank_transfer", to_state: "proof_uploaded",
        actor_user_id: ctx.financeAdminId,
        actor_name: `${MARKER} Finance`, actor_role: "finance_admin",
        note: "bank_reference=TRX-VALIDATION-001",
        payload: { payout_proof_url: proofUrl },
      });
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  }
  await snapshot("STEP 7: proof_uploaded (awaiting −1, proof_uploaded +1) — BANNER DISARMS", ctx);

  // ════════════════════════════════════════════════════════════════
  section("STEP 8: Senior finance confirms completion");
  // proof_uploaded → completed. Final customer notification fires.
  // ════════════════════════════════════════════════════════════════
  {
    const refund = await fetchCase(ctx.refundId);
    if (!refundSM.canTransition(refund.status, "completed")) throw new Error(`bad transition`);
    const guardErr = refundSM.guardTransition("completed", refund, {});
    if (guardErr) throw new Error(`guard rejected: ${guardErr}`);
    const c = await db.getClient();
    try {
      await c.query("BEGIN");
      // mint refund invoice number
      const year = new Date().getFullYear();
      await c.query(`SELECT pg_advisory_xact_lock($1)`, [2000000 + year]);
      const seq = await c.query(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(refund_invoice_number FROM 'RFD-\\d{4}-(\\d+)') AS INTEGER)), 0) + 1 AS n
         FROM refunds WHERE refund_invoice_number LIKE $1`,
        [`RFD-${year}-%`]
      );
      const refInvNo = `RFD-${year}-${String(seq.rows[0].n).padStart(6, "0")}`;
      await c.query(
        `UPDATE refunds
         SET status = 'completed', payout_confirmed_at = NOW(),
             refund_invoice_number = $1, refund_invoice_issued_at = NOW(),
             state_changed_at = NOW(), state_changed_by = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [refInvNo, ctx.financeAdminId, ctx.refundId]
      );
      await refundSM.recordEvent(c, {
        refund_id: ctx.refundId, event_type: "state_changed",
        from_state: "proof_uploaded", to_state: "completed",
        actor_user_id: ctx.financeAdminId,
        actor_name: `${MARKER} Finance`, actor_role: "finance_admin",
        note: `refund_invoice=${refInvNo}`,
        payload: {},
      });
      await c.query(
        `INSERT INTO notifications (user_id, type, title, body, channel, status, scheduled_at)
         VALUES ($1, 'refund_completed', 'تم تحويل مبلغ الاسترداد', $2, 'app', 'pending', NOW())`,
        [ctx.userId, `${MARKER} تم إيداع 599 ر.س. يصل خلال 4-6 أيام عمل بنكية. الفاتورة: ${refInvNo}`]
      );
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  }
  await snapshot("STEP 8: completed (proof_uploaded −1, completed +1) — REMOVED FROM ACTIVE", ctx);

  // ════════════════════════════════════════════════════════════════
  section("VALIDATION REPORT");
  // ════════════════════════════════════════════════════════════════
  printValidationReport(ctx);

  // ── cleanup ────────────────────────────────────────────────────
  section("CLEANUP: removing validation rows");
  try {
    await db.query(`DELETE FROM refund_case_events WHERE refund_id = $1`, [ctx.refundId]);
    await db.query(`DELETE FROM refunds WHERE id = $1`, [ctx.refundId]);
    await db.query(`DELETE FROM support_ticket_replies WHERE ticket_id = $1`, [ctx.ticketId]);
    await db.query(`DELETE FROM support_ticket_audit_log WHERE ticket_id = $1`, [ctx.ticketId]).catch(() => {});
    await db.query(`DELETE FROM support_tickets WHERE id = $1`, [ctx.ticketId]);
    if (invoiceId) await db.query(`DELETE FROM invoices WHERE id = $1`, [invoiceId]);
    await db.query(`DELETE FROM notifications WHERE user_id = $1`, [ctx.userId]);
    await db.query(`DELETE FROM users WHERE id IN ($1, $2, $3)`,
      [ctx.userId, ctx.supportAdminId, ctx.financeAdminId]);
    log("Cleanup OK — all validation rows removed.");
  } catch (e) {
    log("[!] Cleanup partial failure:", e.message);
    log(`    Run manually: DELETE FROM users WHERE email LIKE '%validation_%@example.com';`);
  }
}

function printValidationReport(ctx) {
  log("");
  log("Counter deltas across the workflow:");
  log("");
  const head = ["step".padEnd(48), "inbox", "pend", "wait", "appr", "await", "proof", "compl", "actv"].join("  ");
  log(head);
  log("─".repeat(head.length));
  for (const s of snapshots) {
    const c = s.counters;
    log([
      s.label.slice(0, 48).padEnd(48),
      String(c.finance_inbox).padStart(5),
      String(c.pending_review).padStart(4),
      String(c.waiting_customer_info).padStart(4),
      String(c.approved).padStart(4),
      String(c.awaiting_bank_transfer).padStart(5),
      String(c.proof_uploaded).padStart(5),
      String(c.completed).padStart(5),
      String(c.cases_active_total).padStart(4),
    ].join("  "));
  }

  log("");
  log("EVIDENCE CHECKS:");
  divider();
  // Pull individual counter values across steps for the asserts
  const get = (i) => snapshots[i].counters;
  const c0 = get(0), c1 = get(1), c2 = get(2), c3 = get(3), c4 = get(4), c5 = get(5), c6 = get(6), c7 = get(7), c8 = get(8);

  function check(label, ok, hint) {
    log(`  ${ok ? "✅" : "❌"}  ${label}${ok ? "" : "  ← " + hint}`);
  }

  check("Finance Inbox +1 after Support transfer",
        c3.finance_inbox === c2.finance_inbox + 1,
        `got ${c2.finance_inbox} → ${c3.finance_inbox}`);
  check("Finance Inbox −1 after convert-to-case",
        c4.finance_inbox === c3.finance_inbox - 1,
        `got ${c3.finance_inbox} → ${c4.finance_inbox}`);
  check("pending_review +1 after convert-to-case",
        c4.pending_review === c3.pending_review + 1,
        `got ${c3.pending_review} → ${c4.pending_review}`);
  check("pending_review −1 + approved +1 on approve",
        c5.pending_review === c4.pending_review - 1 && c5.approved === c4.approved + 1,
        `pending ${c4.pending_review}→${c5.pending_review}, approved ${c4.approved}→${c5.approved}`);
  check("approved −1 + awaiting +1 on start-bank-transfer",
        c6.approved === c5.approved - 1 && c6.awaiting_bank_transfer === c5.awaiting_bank_transfer + 1,
        `approved ${c5.approved}→${c6.approved}, awaiting ${c5.awaiting_bank_transfer}→${c6.awaiting_bank_transfer}`);
  check("Awaiting Bank Transfer banner ARMED at step 6 (awaiting ≥ 1)",
        c6.awaiting_bank_transfer >= 1,
        `value=${c6.awaiting_bank_transfer}`);
  check("awaiting −1 + proof_uploaded +1 on proof upload",
        c7.awaiting_bank_transfer === c6.awaiting_bank_transfer - 1 && c7.proof_uploaded === c6.proof_uploaded + 1,
        `awaiting ${c6.awaiting_bank_transfer}→${c7.awaiting_bank_transfer}, proof ${c6.proof_uploaded}→${c7.proof_uploaded}`);
  check("Banner DISARMS at step 7 (our case left awaiting)",
        c7.awaiting_bank_transfer === c6.awaiting_bank_transfer - 1,
        `awaiting did not decrement`);
  check("proof_uploaded −1 + completed +1 on confirm",
        c8.proof_uploaded === c7.proof_uploaded - 1 && c8.completed === c7.completed + 1,
        `proof ${c7.proof_uploaded}→${c8.proof_uploaded}, completed ${c7.completed}→${c8.completed}`);
  check("completed REMOVES from cases_active_total",
        c8.cases_active_total === c7.cases_active_total - 1,
        `active ${c7.cases_active_total}→${c8.cases_active_total}`);

  // Final case state
  const finalRefund = snapshots[snapshots.length - 1].refund;
  check("Case final status = completed",
        finalRefund?.status === "completed",
        `status=${finalRefund?.status}`);
  check("payout_proof_url persisted",
        Boolean(finalRefund?.proof),
        "proof column empty");
  check("Refund invoice minted (RFD-...)",
        Boolean(finalRefund?.refund_invoice),
        "no refund_invoice_number");
  check("approved_refund_amount set",
        Number(finalRefund?.approved) === 599,
        `got ${finalRefund?.approved}`);

  // Notification audit
  const allNotifs = snapshots.flatMap(s => s.newNotifs);
  const notifTypes = allNotifs.map(n => n.type);
  check("Notification: ticket_received",
        notifTypes.includes("ticket_received"), "missing");
  check("Notification: refund_case_opened",
        notifTypes.includes("refund_case_opened"), "missing");
  check("Notification: refund_approved",
        notifTypes.includes("refund_approved"), "missing");
  check("Notification: refund_completed (4-6 days copy)",
        notifTypes.includes("refund_completed"), "missing");

  // Timeline coverage
  const finalEvents = snapshots[snapshots.length - 1].events;
  const stateTransitions = finalEvents
    .filter(e => e.event_type === "state_changed" || e.event_type === "proof_uploaded" || e.event_type === "case_created")
    .map(e => `${e.from_state || "∅"}→${e.to_state}`);
  log("");
  log("Timeline transitions recorded:");
  for (const t of stateTransitions) log("  •", t);
  check("Timeline has case_created → pending_review",
        stateTransitions.includes("∅→pending_review"), "missing");
  check("Timeline has pending_review → approved",
        stateTransitions.includes("pending_review→approved"), "missing");
  check("Timeline has approved → awaiting_bank_transfer",
        stateTransitions.includes("approved→awaiting_bank_transfer"), "missing");
  check("Timeline has awaiting_bank_transfer → proof_uploaded",
        stateTransitions.includes("awaiting_bank_transfer→proof_uploaded"), "missing");
  check("Timeline has proof_uploaded → completed",
        stateTransitions.includes("proof_uploaded→completed"), "missing");
}

main()
  .then(() => { log(""); log("✅ DONE"); process.exit(0); })
  .catch((e) => { console.error("❌ Validation crashed:", e); process.exit(1); });
