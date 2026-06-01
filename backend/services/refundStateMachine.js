// ─────────────────────────────────────────────────────────────────────
// Refund Case state machine. Single source of truth for the 7-state
// lifecycle of refunds. Routes never UPDATE refunds.status directly —
// they call transitionCase() so guards run, events are written, and
// notifications fire in lockstep.
//
//   pending_review ──────────────► approved ────► awaiting_bank_transfer
//        │                            │                    │
//        │                            ▼                    ▼
//        ├──► waiting_customer_info ◄─┤            proof_uploaded
//        │         │                                       │
//        │         └► pending_review (info received)       ▼
//        ▼                                            completed [TERMINAL]
//   rejected [TERMINAL]
//
// Allowed transitions live in the ALLOWED matrix below. Guards live
// next to each transition (e.g. awaiting_bank_transfer requires bank
// details; completed requires payout_proof_url). Anything not in the
// matrix is a 4xx by design.
// ─────────────────────────────────────────────────────────────────────

const STATES = Object.freeze({
  PENDING_REVIEW: 'pending_review',
  WAITING_CUSTOMER_INFO: 'waiting_customer_info',
  APPROVED: 'approved',
  AWAITING_BANK_TRANSFER: 'awaiting_bank_transfer',
  PROOF_UPLOADED: 'proof_uploaded',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
});

const ALL_STATES = Object.freeze(Object.values(STATES));
const ACTIVE_STATES = Object.freeze([
  STATES.PENDING_REVIEW,
  STATES.WAITING_CUSTOMER_INFO,
  STATES.APPROVED,
  STATES.AWAITING_BANK_TRANSFER,
  STATES.PROOF_UPLOADED,
]);
const TERMINAL_STATES = Object.freeze([STATES.COMPLETED, STATES.REJECTED]);

// Matrix of allowed (from → [to]) transitions. Any transition not
// listed here is rejected at the service layer.
const ALLOWED = Object.freeze({
  [STATES.PENDING_REVIEW]: [
    STATES.WAITING_CUSTOMER_INFO,
    STATES.APPROVED,
    STATES.REJECTED,
  ],
  [STATES.WAITING_CUSTOMER_INFO]: [
    STATES.PENDING_REVIEW, // info received, re-review
    STATES.REJECTED,
  ],
  [STATES.APPROVED]: [
    STATES.WAITING_CUSTOMER_INFO, // accountant noticed gap before going to bank
    STATES.AWAITING_BANK_TRANSFER,
    STATES.REJECTED,
  ],
  [STATES.AWAITING_BANK_TRANSFER]: [
    STATES.PROOF_UPLOADED,
    // No rejection from this state — money is in motion or about to be.
  ],
  [STATES.PROOF_UPLOADED]: [
    STATES.COMPLETED,
    STATES.AWAITING_BANK_TRANSFER, // senior sends back if proof is bad
  ],
  [STATES.COMPLETED]: [], // terminal
  [STATES.REJECTED]: [],  // terminal
});

function canTransition(fromState, toState) {
  if (!fromState || !toState) return false;
  if (!ALLOWED[fromState]) return false;
  return ALLOWED[fromState].includes(toState);
}

function isActive(state) {
  return ACTIVE_STATES.includes(state);
}

function isTerminal(state) {
  return TERMINAL_STATES.includes(state);
}

// Guards: return null if OK, else an Arabic error string.
function guardTransition(toState, refund, payload = {}) {
  if (toState === STATES.APPROVED) {
    // Approval is the moment finance commits to a figure. We won't let
    // it happen without an explicit approved_refund_amount in the
    // payload (or already on the row from a previous approve cycle).
    const candidate = payload.approved_refund_amount != null
      ? Number(payload.approved_refund_amount)
      : (refund.approved_refund_amount != null ? Number(refund.approved_refund_amount) : null);
    if (candidate == null || !Number.isFinite(candidate) || candidate <= 0) {
      return "يجب تحديد المبلغ المعتمد للاسترداد قبل الموافقة.";
    }
    // Don't let finance approve more than the original transaction.
    if (refund.original_amount != null && candidate > Number(refund.original_amount)) {
      return `المبلغ المعتمد (${candidate} ر.س) يتجاوز قيمة المعاملة الأصلية (${refund.original_amount} ر.س).`;
    }
  }
  if (toState === STATES.AWAITING_BANK_TRANSFER) {
    if (!refund.bank_name || !refund.bank_account_iban || !refund.account_holder_name) {
      return "بيانات البنك ناقصة. حوّل القضية أولاً إلى \"بانتظار بيانات العميل\".";
    }
    if (refund.approved_refund_amount == null) {
      return "لا توجد قيمة معتمدة للاسترداد — يجب الاعتماد قبل بدء التحويل البنكي.";
    }
  }
  if (toState === STATES.PROOF_UPLOADED) {
    if (!payload.payout_proof_url && !refund.payout_proof_url) {
      return "يجب رفع صورة إثبات التحويل البنكي قبل الانتقال لهذه الحالة.";
    }
  }
  if (toState === STATES.COMPLETED) {
    if (!refund.payout_proof_url && !payload.payout_proof_url) {
      return "لا يمكن الإكمال بدون إيصال تحويل مرفوع.";
    }
  }
  if (toState === STATES.REJECTED) {
    const note = (payload.note || '').trim();
    if (!note) {
      return "يجب كتابة سبب الرفض في الملاحظة.";
    }
  }
  return null;
}

// Generate a human-readable case number once. Caller passes a Postgres
// client (inside a transaction) so an advisory lock can serialise
// number minting across instances.
async function mintCaseNumber(client, year = new Date().getFullYear()) {
  const lockId = 3000000 + year;
  await client.query(`SELECT pg_advisory_xact_lock($1)`, [lockId]);
  const seq = await client.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(case_number FROM 'RFC-\\d{4}-(\\d+)') AS INTEGER)), 0) + 1 AS next_num
     FROM refunds WHERE case_number LIKE $1`,
    [`RFC-${year}-%`]
  );
  const next = seq.rows[0].next_num;
  return `RFC-${year}-${String(next).padStart(6, '0')}`;
}

// Record a single event in refund_case_events. Best-effort: a failure
// here is logged but never blocks the underlying state change.
async function recordEvent(client, {
  refund_id, event_type, from_state, to_state,
  actor_user_id, actor_name, actor_role, note, payload,
}) {
  try {
    await client.query(
      `INSERT INTO refund_case_events
         (refund_id, event_type, from_state, to_state,
          actor_user_id, actor_name_snapshot, actor_role_snapshot,
          note, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        refund_id, event_type, from_state || null, to_state || null,
        actor_user_id || null, actor_name || null, actor_role || null,
        note || null, JSON.stringify(payload || {}),
      ]
    );
  } catch (e) {
    if (e && e.code !== '42P01') {
      console.warn('[refundStateMachine] recordEvent:', e.message);
    }
  }
}

// Compute due_at for a fresh approval. Owner's rule: customers are
// promised 4–6 business days, so the case clock targets 6 calendar days.
function computeDueAt(daysFromNow = 6) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d;
}

// Counters used by the Navbar / dashboard. Returns one row of counts.
async function fetchCounters(db) {
  const q = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending_review')         AS pending_review,
      COUNT(*) FILTER (WHERE status = 'waiting_customer_info')  AS waiting_customer_info,
      COUNT(*) FILTER (WHERE status = 'approved')               AS approved,
      COUNT(*) FILTER (WHERE status = 'awaiting_bank_transfer') AS awaiting_bank_transfer,
      COUNT(*) FILTER (WHERE status = 'proof_uploaded')         AS proof_uploaded,
      COUNT(*) FILTER (WHERE status IN ('pending_review','waiting_customer_info','approved','awaiting_bank_transfer','proof_uploaded')) AS active_total,
      COUNT(*) FILTER (WHERE status = 'completed')              AS completed,
      COUNT(*) FILTER (WHERE status = 'rejected')               AS rejected
    FROM refunds
  `);
  const inbox = await db.query(`
    SELECT COUNT(*)::int AS finance_inbox
    FROM support_tickets
    WHERE finance_inbox_state = 'in_inbox'
  `);
  const r = q.rows[0] || {};
  return {
    finance_inbox: parseInt(inbox.rows[0]?.finance_inbox || 0, 10),
    pending_review: parseInt(r.pending_review || 0, 10),
    waiting_customer_info: parseInt(r.waiting_customer_info || 0, 10),
    approved: parseInt(r.approved || 0, 10),
    awaiting_bank_transfer: parseInt(r.awaiting_bank_transfer || 0, 10),
    proof_uploaded: parseInt(r.proof_uploaded || 0, 10),
    cases_active_total: parseInt(r.active_total || 0, 10),
    completed: parseInt(r.completed || 0, 10),
    rejected: parseInt(r.rejected || 0, 10),
  };
}

module.exports = {
  STATES,
  ALL_STATES,
  ACTIVE_STATES,
  TERMINAL_STATES,
  ALLOWED,
  canTransition,
  isActive,
  isTerminal,
  guardTransition,
  mintCaseNumber,
  recordEvent,
  computeDueAt,
  fetchCounters,
};
