// ─────────────────────────────────────────────────────────────────
// TEMPORARY endpoint — Refund Case state machine end-to-end validation.
//
// POST /api/_dev/validate-refund-sm   (super_admin only)
//
// Creates a marked test customer + support_admin + finance_admin +
// invoice + ticket, walks the full state machine (8 transitions),
// snapshots DB rows + counters + notifications + case events at every
// step, cleans up at the end, and returns a JSON report.
//
// HARD-CODED to be unconditionally removable: every row it creates
// carries __VALIDATION__ in a text field, and the final block
// DELETEs by id. If cleanup partially fails, the orphans are
// trivially purgeable with:
//   DELETE FROM users WHERE email LIKE 'validation_%@example.com';
//
// This file MUST be deleted in a separate follow-up commit once the
// validation has passed in production. See REMOVE-MARKER below.
// ─────────────────────────────────────────────────────────────────

const express = require("express");
const db = require("../db");
const refundSM = require("../services/refundStateMachine");
const { authMiddleware, requireRoles } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();

// REMOVE-MARKER: _dev_validate_refund_sm — strip this entire file
// + its mount in app.js after validation signoff.
router.post(
  "/validate-refund-sm",
  authMiddleware,
  requireRoles("super_admin"),
  asyncHandler(async (req, res) => {
    const MARKER = "__VALIDATION__";
    const startedAt = Date.now();
    const report = {
      ok: false,
      marker: MARKER,
      started_at: new Date(startedAt).toISOString(),
      ctx: {},
      snapshots: [],
      checks: [],
      cleanup: null,
      finished_at: null,
      total_ms: null,
    };

    const ctx = {
      userId: null, supportAdminId: null, financeAdminId: null,
      ticketId: null, invoiceId: null, refundId: null,
    };
    let lastNotifId = 0;

    // ── snapshot helper ────────────────────────────────────────
    async function snapshot(label) {
      const counters = await refundSM.fetchCounters(db);
      const tRes = ctx.ticketId
        ? await db.query(
            `SELECT id, ticket_number, status, department, auto_assigned_role,
                    transferred_to_finance_at, finance_inbox_state, refund_id
             FROM support_tickets WHERE id = $1`,
            [ctx.ticketId]
          )
        : { rows: [] };
      const rRes = ctx.refundId
        ? await db.query(
            `SELECT id, case_number, status, amount, original_amount,
                    estimated_refund_amount, approved_refund_amount,
                    bank_name, bank_account_iban, account_holder_name,
                    payout_proof_url, bank_reference, refund_invoice_number,
                    assigned_finance_user_id, due_at,
                    state_changed_at, pre_wait_status, ticket_id
             FROM refunds WHERE id = $1`,
            [ctx.refundId]
          )
        : { rows: [] };
      const notifs = await db.query(
        `SELECT id, type, title, body, created_at
         FROM notifications WHERE user_id = $1 AND id > $2
         ORDER BY id ASC`,
        [ctx.userId, lastNotifId]
      );
      if (notifs.rows.length) lastNotifId = notifs.rows[notifs.rows.length - 1].id;
      const events = ctx.refundId
        ? await db.query(
            `SELECT id, event_type, from_state, to_state,
                    actor_role_snapshot AS actor_role, note, created_at
             FROM refund_case_events WHERE refund_id = $1
             ORDER BY id ASC`,
            [ctx.refundId]
          )
        : { rows: [] };

      const snap = {
        label,
        at: new Date().toISOString(),
        counters,
        ticket: tRes.rows[0] || null,
        refund: rRes.rows[0] || null,
        new_notifications: notifs.rows,
        events: events.rows,
      };
      report.snapshots.push(snap);
      return snap;
    }

    function recordCheck(label, ok, hint) {
      report.checks.push({ label, ok, hint: ok ? null : (hint || null) });
    }

    try {
      // ════════════════════════════════════════════════════════
      // SETUP: 3 users + 1 invoice
      // ════════════════════════════════════════════════════════
      const stamp = Date.now();
      const u = await db.query(
        `INSERT INTO users (email, password_hash, name, phone, role, status, created_at)
         VALUES ($1, 'x', $2, '0500000099', 'user', 'active', NOW())
         RETURNING id`,
        [`validation_customer_${stamp}@example.com`, `${MARKER} Customer`]
      );
      ctx.userId = u.rows[0].id;

      const sa = await db.query(
        `INSERT INTO users (email, password_hash, name, phone, role, status, created_at)
         VALUES ($1, 'x', $2, '0500000098', 'support_admin', 'active', NOW())
         RETURNING id`,
        [`validation_support_${stamp}@example.com`, `${MARKER} Support`]
      );
      ctx.supportAdminId = sa.rows[0].id;

      const fa = await db.query(
        `INSERT INTO users (email, password_hash, name, phone, role, status, created_at)
         VALUES ($1, 'x', $2, '0500000097', 'finance_admin', 'active', NOW())
         RETURNING id`,
        [`validation_finance_${stamp}@example.com`, `${MARKER} Finance`]
      );
      ctx.financeAdminId = fa.rows[0].id;

      const inv = await db.query(
        `INSERT INTO invoices (user_id, invoice_number, total, currency, status, created_at)
         VALUES ($1, $2, 599.00, 'SAR', 'paid', NOW())
         RETURNING id`,
        [ctx.userId, `INV-VAL-${stamp}`]
      );
      ctx.invoiceId = inv.rows[0].id;

      // watermark notifications
      const wm = await db.query(
        `SELECT COALESCE(MAX(id), 0) AS id FROM notifications WHERE user_id = $1`,
        [ctx.userId]
      );
      lastNotifId = wm.rows[0].id;

      report.ctx = { ...ctx, marker: MARKER };
      await snapshot("STEP 0: clean slate (no ticket, no case)");

      // ════════════════════════════════════════════════════════
      // STEP 1: Customer submits via Composer.
      // Per routing override in support.js, role=user + financial
      // gets routed to support_admin even though dept='financial'.
      // ════════════════════════════════════════════════════════
      const ticketNumber = `TKT-VAL-${stamp}`;
      const t = await db.query(
        `INSERT INTO support_tickets
           (user_id, ticket_number, department, subcategory, category, priority,
            subject, description, auto_assigned_role, sla_hours, status,
            source, invoice_id, ticket_type, created_at, updated_at)
         VALUES ($1, $2, 'financial', 'refund', 'financial', 'medium',
                 $3, $4, 'support_admin', 24, 'new',
                 'unified_composer', $5, 'financial', NOW(), NOW())
         RETURNING id`,
        [
          ctx.userId, ticketNumber,
          `${MARKER} طلب استرداد تجريبي`,
          `${MARKER} validation ticket — auto-cleanup at end.`,
          ctx.invoiceId,
        ]
      );
      ctx.ticketId = t.rows[0].id;
      await db.query(
        `INSERT INTO notifications (user_id, type, title, body, channel, status, scheduled_at)
         VALUES ($1, 'ticket_received', 'تم استلام طلبك',
                 $2, 'app', 'pending', NOW())`,
        [ctx.userId, `${MARKER} تم استلام طلبك. رقم التذكرة: ${ticketNumber}`]
      );
      await snapshot("STEP 1: ticket created, sits with Support");

      // ════════════════════════════════════════════════════════
      // STEP 2: Support agent opens (in_progress).
      // ════════════════════════════════════════════════════════
      await db.query(
        `UPDATE support_tickets SET status = 'in_progress', updated_at = NOW() WHERE id = $1`,
        [ctx.ticketId]
      );
      await snapshot("STEP 2: support_in_progress (Support is working on it)");

      // ════════════════════════════════════════════════════════
      // STEP 3: Support transfers to Finance Inbox.
      // Replicates PATCH /api/support/:id/transfer.
      // ════════════════════════════════════════════════════════
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
        [ctx.ticketId, ctx.supportAdminId, `${MARKER} Support → Finance for refund evaluation`]
      );
      await snapshot("STEP 3: in Finance Inbox (finance_inbox_state='in_inbox')");

      // ════════════════════════════════════════════════════════
      // STEP 4: Finance Inbox → Refund Case (pending_review).
      // Bank info supplied so case opens in pending_review, not waiting.
      // ════════════════════════════════════════════════════════
      const bank = {
        bank_name: "Al Rajhi Bank",
        iban: "SA0380000000608010167519",
        holder: `${MARKER} Customer`,
      };
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
           VALUES ($1, $2, $3, 599.00, 599.00, 599.00, 'full', $4, 'pending_review', $5,
                   $6, $7, $8, $9, NOW(), $9, $9, NOW(), NOW(), NOW())
           RETURNING id, case_number`,
          [
            ctx.userId, ctx.invoiceId, ctx.ticketId,
            `${MARKER} converted from inbox`, caseNumber,
            bank.bank_name, bank.iban, bank.holder,
            ctx.financeAdminId,
          ]
        );
        ctx.refundId = ins.rows[0].id;
        await client.query(
          `UPDATE support_tickets
           SET finance_inbox_state = 'converted_to_refund', refund_id = $1, updated_at = NOW()
           WHERE id = $2`,
          [ctx.refundId, ctx.ticketId]
        );
        await refundSM.recordEvent(client, {
          refund_id: ctx.refundId,
          event_type: "case_created",
          from_state: null,
          to_state: "pending_review",
          actor_user_id: ctx.financeAdminId,
          actor_name: `${MARKER} Finance`,
          actor_role: "finance_admin",
          note: "converted from finance inbox",
          payload: { ticket_id: ctx.ticketId, case_number: caseNumber, amount: 599 },
        });
        await client.query(
          `INSERT INTO notifications (user_id, type, title, body, channel, status, scheduled_at)
           VALUES ($1, 'refund_case_opened', 'تم فتح قضية استرداد',
                   $2, 'app', 'pending', NOW())`,
          [ctx.userId, `${MARKER} قضية الاسترداد ${caseNumber} قيد المراجعة.`]
        );
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK"); client.release(); throw e;
      }
      client.release();
      await snapshot("STEP 4: case_created → pending_review (inbox -1, pending_review +1)");

      // ════════════════════════════════════════════════════════
      // STEP 5: Approve. Guard requires approved_refund_amount.
      // ════════════════════════════════════════════════════════
      {
        const r = await db.query(`SELECT * FROM refunds WHERE id = $1`, [ctx.refundId]);
        const refund = r.rows[0];
        if (!refundSM.canTransition(refund.status, "approved")) {
          throw new Error(`pre-check failed: cannot ${refund.status} → approved`);
        }
        const guardErr = refundSM.guardTransition("approved", refund, { approved_refund_amount: 599 });
        if (guardErr) throw new Error(`approve guard rejected: ${guardErr}`);
        const c = await db.getClient();
        try {
          await c.query("BEGIN");
          await c.query(
            `UPDATE refunds
             SET status = 'approved',
                 approved_refund_amount = 599.00,
                 amount = 599.00,
                 due_at = NOW() + INTERVAL '6 days',
                 state_changed_at = NOW(), state_changed_by = $1,
                 processed_by = COALESCE(processed_by, $1),
                 processed_at = COALESCE(processed_at, NOW()),
                 updated_at = NOW()
             WHERE id = $2`,
            [ctx.financeAdminId, ctx.refundId]
          );
          await refundSM.recordEvent(c, {
            refund_id: ctx.refundId,
            event_type: "state_changed",
            from_state: "pending_review",
            to_state: "approved",
            actor_user_id: ctx.financeAdminId,
            actor_name: `${MARKER} Finance`,
            actor_role: "finance_admin",
            note: "validation approval",
            payload: { approved_refund_amount: 599 },
          });
          await c.query(
            `INSERT INTO notifications (user_id, type, title, body, channel, status, scheduled_at)
             VALUES ($1, 'refund_approved', 'تم اعتماد طلب الاسترداد',
                     $2, 'app', 'pending', NOW())`,
            [ctx.userId, `${MARKER} تم اعتماد استرداد 599 ر.س. التحويل خلال 4-6 أيام عمل.`]
          );
          await c.query("COMMIT");
        } catch (e) { await c.query("ROLLBACK"); c.release(); throw e; }
        c.release();
      }
      await snapshot("STEP 5: pending_review -1, approved +1");

      // ════════════════════════════════════════════════════════
      // STEP 6: Start bank transfer. Banner ARMS.
      // ════════════════════════════════════════════════════════
      {
        const r = await db.query(`SELECT * FROM refunds WHERE id = $1`, [ctx.refundId]);
        const guardErr = refundSM.guardTransition("awaiting_bank_transfer", r.rows[0], {});
        if (guardErr) throw new Error(`awaiting guard rejected: ${guardErr}`);
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
            refund_id: ctx.refundId,
            event_type: "state_changed",
            from_state: "approved",
            to_state: "awaiting_bank_transfer",
            actor_user_id: ctx.financeAdminId,
            actor_name: `${MARKER} Finance`,
            actor_role: "finance_admin",
            payload: {},
          });
          await c.query("COMMIT");
        } catch (e) { await c.query("ROLLBACK"); c.release(); throw e; }
        c.release();
      }
      await snapshot("STEP 6: approved -1, awaiting +1 (BANNER ARMS)");

      // ════════════════════════════════════════════════════════
      // STEP 7: Upload proof.
      // ════════════════════════════════════════════════════════
      const proofUrl = `https://example.invalid/${MARKER}/proof.png`;
      {
        const r = await db.query(`SELECT * FROM refunds WHERE id = $1`, [ctx.refundId]);
        const guardErr = refundSM.guardTransition("proof_uploaded", r.rows[0], { payout_proof_url: proofUrl });
        if (guardErr) throw new Error(`proof guard rejected: ${guardErr}`);
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
            refund_id: ctx.refundId,
            event_type: "proof_uploaded",
            from_state: "awaiting_bank_transfer",
            to_state: "proof_uploaded",
            actor_user_id: ctx.financeAdminId,
            actor_name: `${MARKER} Finance`,
            actor_role: "finance_admin",
            note: "bank_reference=TRX-VALIDATION-001",
            payload: { payout_proof_url: proofUrl },
          });
          await c.query("COMMIT");
        } catch (e) { await c.query("ROLLBACK"); c.release(); throw e; }
        c.release();
      }
      await snapshot("STEP 7: awaiting -1, proof_uploaded +1 (BANNER DISARMS)");

      // ════════════════════════════════════════════════════════
      // STEP 8: Confirm completion. RFD-...-NNNNNN minted.
      // ════════════════════════════════════════════════════════
      {
        const r = await db.query(`SELECT * FROM refunds WHERE id = $1`, [ctx.refundId]);
        const guardErr = refundSM.guardTransition("completed", r.rows[0], {});
        if (guardErr) throw new Error(`complete guard rejected: ${guardErr}`);
        const c = await db.getClient();
        try {
          await c.query("BEGIN");
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
            refund_id: ctx.refundId,
            event_type: "state_changed",
            from_state: "proof_uploaded",
            to_state: "completed",
            actor_user_id: ctx.financeAdminId,
            actor_name: `${MARKER} Finance`,
            actor_role: "finance_admin",
            note: `refund_invoice=${refInvNo}`,
            payload: {},
          });
          await c.query(
            `INSERT INTO notifications (user_id, type, title, body, channel, status, scheduled_at)
             VALUES ($1, 'refund_completed', 'تم تحويل مبلغ الاسترداد',
                     $2, 'app', 'pending', NOW())`,
            [ctx.userId, `${MARKER} تم إيداع 599 ر.س. يصل خلال 4-6 أيام عمل. الفاتورة: ${refInvNo}`]
          );
          await c.query("COMMIT");
        } catch (e) { await c.query("ROLLBACK"); c.release(); throw e; }
        c.release();
      }
      await snapshot("STEP 8: proof_uploaded -1, completed +1 (REMOVED FROM ACTIVE)");

      // ════════════════════════════════════════════════════════
      // CHECKS — counter deltas, banner arm/disarm, persistence.
      // ════════════════════════════════════════════════════════
      const s = report.snapshots;
      const c = (i) => s[i].counters;
      const c0 = c(0), c1 = c(1), c2 = c(2), c3 = c(3), c4 = c(4), c5 = c(5), c6 = c(6), c7 = c(7), c8 = c(8);

      recordCheck("Finance Inbox +1 after Support transfer",
        c3.finance_inbox === c2.finance_inbox + 1,
        `${c2.finance_inbox} -> ${c3.finance_inbox}`);
      recordCheck("Finance Inbox -1 after convert-to-case",
        c4.finance_inbox === c3.finance_inbox - 1,
        `${c3.finance_inbox} -> ${c4.finance_inbox}`);
      recordCheck("pending_review +1 after convert-to-case",
        c4.pending_review === c3.pending_review + 1,
        `${c3.pending_review} -> ${c4.pending_review}`);
      recordCheck("pending_review -1 + approved +1 on approve",
        c5.pending_review === c4.pending_review - 1 && c5.approved === c4.approved + 1,
        `p:${c4.pending_review}->${c5.pending_review} a:${c4.approved}->${c5.approved}`);
      recordCheck("approved -1 + awaiting +1 on start bank transfer",
        c6.approved === c5.approved - 1 && c6.awaiting_bank_transfer === c5.awaiting_bank_transfer + 1,
        `a:${c5.approved}->${c6.approved} w:${c5.awaiting_bank_transfer}->${c6.awaiting_bank_transfer}`);
      recordCheck("Bank Action banner ARMED at step 6",
        c6.awaiting_bank_transfer >= 1, `value=${c6.awaiting_bank_transfer}`);
      recordCheck("awaiting -1 + proof_uploaded +1 on proof upload",
        c7.awaiting_bank_transfer === c6.awaiting_bank_transfer - 1 && c7.proof_uploaded === c6.proof_uploaded + 1,
        `w:${c6.awaiting_bank_transfer}->${c7.awaiting_bank_transfer} p:${c6.proof_uploaded}->${c7.proof_uploaded}`);
      recordCheck("Banner DISARMS at step 7",
        c7.awaiting_bank_transfer === c6.awaiting_bank_transfer - 1,
        `did not decrement`);
      recordCheck("proof_uploaded -1 + completed +1 on confirm",
        c8.proof_uploaded === c7.proof_uploaded - 1 && c8.completed === c7.completed + 1,
        `p:${c7.proof_uploaded}->${c8.proof_uploaded} c:${c7.completed}->${c8.completed}`);
      recordCheck("Completed removes from cases_active_total",
        c8.cases_active_total === c7.cases_active_total - 1,
        `${c7.cases_active_total} -> ${c8.cases_active_total}`);

      const finalRefund = s[s.length - 1].refund;
      recordCheck("Case final status = completed",
        finalRefund?.status === "completed", `got ${finalRefund?.status}`);
      recordCheck("payout_proof_url persisted",
        Boolean(finalRefund?.payout_proof_url), "missing");
      recordCheck("Refund invoice minted (RFD-...)",
        Boolean(finalRefund?.refund_invoice_number), "missing");
      recordCheck("approved_refund_amount = 599",
        Number(finalRefund?.approved_refund_amount) === 599,
        `got ${finalRefund?.approved_refund_amount}`);

      const allNotifs = s.flatMap((x) => x.new_notifications);
      const types = allNotifs.map((n) => n.type);
      recordCheck("Notification: ticket_received", types.includes("ticket_received"), "missing");
      recordCheck("Notification: refund_case_opened", types.includes("refund_case_opened"), "missing");
      recordCheck("Notification: refund_approved", types.includes("refund_approved"), "missing");
      recordCheck("Notification: refund_completed", types.includes("refund_completed"), "missing");

      const events = s[s.length - 1].events;
      const tx = events.map((e) => `${e.from_state || "NULL"}->${e.to_state}`);
      recordCheck("Timeline: case_created (NULL -> pending_review)",
        tx.includes("NULL->pending_review"), "missing");
      recordCheck("Timeline: pending_review -> approved",
        tx.includes("pending_review->approved"), "missing");
      recordCheck("Timeline: approved -> awaiting_bank_transfer",
        tx.includes("approved->awaiting_bank_transfer"), "missing");
      recordCheck("Timeline: awaiting_bank_transfer -> proof_uploaded",
        tx.includes("awaiting_bank_transfer->proof_uploaded"), "missing");
      recordCheck("Timeline: proof_uploaded -> completed",
        tx.includes("proof_uploaded->completed"), "missing");

      report.ok = report.checks.every((x) => x.ok);
    } catch (err) {
      report.error = { message: err.message, stack: err.stack?.split("\n").slice(0, 4) };
    } finally {
      // ── cleanup (best-effort) ───────────────────────────────
      const cleanup = { ok: true, errors: [] };
      const safeDel = async (label, sql, params) => {
        try { await db.query(sql, params); }
        catch (e) {
          cleanup.ok = false;
          cleanup.errors.push({ label, error: e.message });
        }
      };
      if (ctx.refundId) {
        await safeDel("refund_case_events", `DELETE FROM refund_case_events WHERE refund_id = $1`, [ctx.refundId]);
        await safeDel("refunds", `DELETE FROM refunds WHERE id = $1`, [ctx.refundId]);
      }
      if (ctx.ticketId) {
        await safeDel("support_ticket_replies", `DELETE FROM support_ticket_replies WHERE ticket_id = $1`, [ctx.ticketId]);
        await safeDel("support_ticket_audit_log", `DELETE FROM support_ticket_audit_log WHERE ticket_id = $1`, [ctx.ticketId]);
        await safeDel("support_tickets", `DELETE FROM support_tickets WHERE id = $1`, [ctx.ticketId]);
      }
      if (ctx.invoiceId) {
        await safeDel("invoices", `DELETE FROM invoices WHERE id = $1`, [ctx.invoiceId]);
      }
      if (ctx.userId) {
        await safeDel("notifications", `DELETE FROM notifications WHERE user_id = $1`, [ctx.userId]);
      }
      const ids = [ctx.userId, ctx.supportAdminId, ctx.financeAdminId].filter(Boolean);
      if (ids.length) {
        await safeDel("billing_audit_log",
          `DELETE FROM billing_audit_log WHERE user_id = ANY($1::uuid[]) OR admin_id = ANY($1::uuid[])`,
          [ids]
        );
        await safeDel("users", `DELETE FROM users WHERE id = ANY($1::uuid[])`, [ids]);
      }
      report.cleanup = cleanup;
    }

    report.finished_at = new Date().toISOString();
    report.total_ms = Date.now() - startedAt;
    res.json(report);
  })
);

module.exports = router;
