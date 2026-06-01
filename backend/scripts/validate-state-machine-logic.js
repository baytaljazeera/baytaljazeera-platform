// Pure-logic validation of refundStateMachine.js — no DB required.
// Exercises the transition matrix + guards as a state graph,
// covering both legal moves and every rejection rule.

const sm = require("../services/refundStateMachine");

let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log("  ✅", label); }
  else    { fail++; console.log("  ❌", label, "—", detail); }
}
function section(title) { console.log("\n═══ " + title + " ═══"); }

// ── 1. Allowed transitions ─────────────────────────────────────
section("Allowed transitions (canTransition returns true)");
const ALLOWED = [
  ["pending_review", "waiting_customer_info"],
  ["pending_review", "approved"],
  ["pending_review", "rejected"],
  ["waiting_customer_info", "pending_review"],
  ["waiting_customer_info", "rejected"],
  ["approved", "waiting_customer_info"],
  ["approved", "awaiting_bank_transfer"],
  ["approved", "rejected"],
  ["awaiting_bank_transfer", "proof_uploaded"],
  ["proof_uploaded", "completed"],
  ["proof_uploaded", "awaiting_bank_transfer"],
];
for (const [from, to] of ALLOWED) {
  check(`${from} → ${to}`, sm.canTransition(from, to), `expected true`);
}

// ── 2. Illegal transitions (must reject) ───────────────────────
section("Illegal transitions (canTransition returns false)");
const ILLEGAL = [
  ["pending_review", "awaiting_bank_transfer"],   // can't skip approved
  ["pending_review", "proof_uploaded"],
  ["pending_review", "completed"],
  ["approved", "proof_uploaded"],                  // must go via awaiting
  ["approved", "completed"],
  ["awaiting_bank_transfer", "approved"],
  ["awaiting_bank_transfer", "rejected"],          // no reject after money in motion
  ["awaiting_bank_transfer", "completed"],
  ["completed", "rejected"],                       // terminal
  ["completed", "pending_review"],
  ["rejected", "pending_review"],                  // terminal
  ["rejected", "approved"],
];
for (const [from, to] of ILLEGAL) {
  check(`${from} ↛ ${to} blocked`, !sm.canTransition(from, to), `expected false`);
}

// ── 3. Guards ──────────────────────────────────────────────────
section("Guards reject under bad input");

// approved guard
check("→ approved without approved_refund_amount → rejected",
  sm.guardTransition("approved", { approved_refund_amount: null, original_amount: 599 }, {}) !== null,
  "guard should fire");
check("→ approved with zero approved_refund_amount → rejected",
  sm.guardTransition("approved", { approved_refund_amount: null, original_amount: 599 }, { approved_refund_amount: 0 }) !== null,
  "guard should fire");
check("→ approved with amount > original → rejected",
  sm.guardTransition("approved", { approved_refund_amount: null, original_amount: 599 }, { approved_refund_amount: 1000 }) !== null,
  "guard should fire");
check("→ approved with valid amount ≤ original → allowed",
  sm.guardTransition("approved", { approved_refund_amount: null, original_amount: 599 }, { approved_refund_amount: 599 }) === null,
  "guard should NOT fire");

// awaiting_bank_transfer guard
check("→ awaiting_bank_transfer without bank info → rejected",
  sm.guardTransition("awaiting_bank_transfer", { bank_name: null, bank_account_iban: null, account_holder_name: null, approved_refund_amount: 599 }, {}) !== null,
  "guard should fire");
check("→ awaiting_bank_transfer without approved_refund_amount → rejected",
  sm.guardTransition("awaiting_bank_transfer", { bank_name: "X", bank_account_iban: "Y", account_holder_name: "Z", approved_refund_amount: null }, {}) !== null,
  "guard should fire");
check("→ awaiting_bank_transfer with full data → allowed",
  sm.guardTransition("awaiting_bank_transfer", { bank_name: "Al Rajhi", bank_account_iban: "SA00", account_holder_name: "X", approved_refund_amount: 599 }, {}) === null,
  "guard should NOT fire");

// proof_uploaded guard
check("→ proof_uploaded without payout_proof_url → rejected",
  sm.guardTransition("proof_uploaded", { payout_proof_url: null }, {}) !== null,
  "guard should fire");
check("→ proof_uploaded with payout_proof_url in payload → allowed",
  sm.guardTransition("proof_uploaded", { payout_proof_url: null }, { payout_proof_url: "x.png" }) === null,
  "guard should NOT fire");
check("→ proof_uploaded with payout_proof_url already on row → allowed",
  sm.guardTransition("proof_uploaded", { payout_proof_url: "existing.png" }, {}) === null,
  "guard should NOT fire");

// completed guard
check("→ completed without proof anywhere → rejected",
  sm.guardTransition("completed", { payout_proof_url: null }, {}) !== null,
  "guard should fire");
check("→ completed with proof on row → allowed",
  sm.guardTransition("completed", { payout_proof_url: "x.png" }, {}) === null,
  "guard should NOT fire");

// rejected guard
check("→ rejected without note → rejected",
  sm.guardTransition("rejected", {}, { note: "" }) !== null,
  "guard should fire");
check("→ rejected with whitespace-only note → rejected",
  sm.guardTransition("rejected", {}, { note: "   " }) !== null,
  "guard should fire");
check("→ rejected with non-empty note → allowed",
  sm.guardTransition("rejected", {}, { note: "duplicate charge" }) === null,
  "guard should NOT fire");

// ── 4. Helpers ─────────────────────────────────────────────────
section("Helpers");
check("ACTIVE_STATES contains 5 entries",
  sm.ACTIVE_STATES.length === 5, `got ${sm.ACTIVE_STATES.length}`);
check("TERMINAL_STATES = [completed, rejected]",
  sm.TERMINAL_STATES.includes("completed") && sm.TERMINAL_STATES.includes("rejected") && sm.TERMINAL_STATES.length === 2,
  JSON.stringify(sm.TERMINAL_STATES));
check("isActive('approved') = true",
  sm.isActive("approved"), "");
check("isActive('completed') = false",
  !sm.isActive("completed"), "");
check("isTerminal('rejected') = true",
  sm.isTerminal("rejected"), "");
check("isTerminal('pending_review') = false",
  !sm.isTerminal("pending_review"), "");

// ── 5. computeDueAt ────────────────────────────────────────────
section("computeDueAt");
{
  const d = sm.computeDueAt(6);
  const days = Math.round((d.getTime() - Date.now()) / 86400000);
  check("computeDueAt(6) ≈ +6 days", days >= 5 && days <= 7, `got ${days}`);
}

// ── 6. Full happy-path walk through ALLOWED matrix ─────────────
section("Walkthrough: pending_review → completed (every step canTransition)");
const path = [
  ["pending_review", "approved"],
  ["approved", "awaiting_bank_transfer"],
  ["awaiting_bank_transfer", "proof_uploaded"],
  ["proof_uploaded", "completed"],
];
let cur = "pending_review";
for (const [, next] of path) {
  check(`${cur} → ${next}`, sm.canTransition(cur, next), "blocked");
  cur = next;
}
check("Final state is completed", cur === "completed", `cur=${cur}`);

// ── 7. Waiting-info detour ─────────────────────────────────────
section("Waiting-info detour: pending_review → waiting → pending_review → approved");
let p = "pending_review";
const detour = [
  ["pending_review", "waiting_customer_info"],
  ["waiting_customer_info", "pending_review"],
  ["pending_review", "approved"],
];
for (const [from, to] of detour) {
  check(`${from} → ${to}`, p === from && sm.canTransition(from, to), `cur=${p}`);
  p = to;
}

// ── done ───────────────────────────────────────────────────────
console.log("\n" + "═".repeat(60));
console.log(`  ${pass} passed   ${fail} failed`);
console.log("═".repeat(60));
process.exit(fail === 0 ? 0 : 1);
