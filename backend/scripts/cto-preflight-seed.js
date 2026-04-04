#!/usr/bin/env node
/**
 * CTO pre-flight: demo AI ticket + chat log link, and orphan flagged_conversation row.
 * Run from repo root: node backend/scripts/cto-preflight-seed.js
 * Safe to re-run: uses fixed session id and upserts / skips duplicates where possible.
 */

const fs = require('fs');
const path = require('path');
(function loadEnv() {
  const p = path.join(__dirname, '../../.env');
  if (!fs.existsSync(p)) return;
  const content = fs.readFileSync(p, 'utf8');
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
})();

const db = require('../db');

const DEMO_SESSION = 'cto-preflight-demo-session-2026';

async function main() {
  const client = await db.pool.connect();
  try {
    const ticketUser = await client.query(
      `SELECT id FROM users WHERE role = 'user' ORDER BY created_at ASC LIMIT 1`
    );
    if (ticketUser.rows.length === 0) {
      console.error('❌ Need at least one user-role account for demo ticket.');
      process.exit(1);
    }
    const customerId = ticketUser.rows[0].id;

    const existingLog = await client.query(
      `SELECT id FROM ai_chat_logs WHERE session_id = $1 LIMIT 1`,
      [DEMO_SESSION]
    );
    if (existingLog.rows.length === 0) {
      await client.query(
        `INSERT INTO ai_chat_logs (session_id, user_message, ai_response, escalated, escalate_reason, created_at)
         VALUES ($1, $2, $3, true, $4, NOW())`,
        [
          DEMO_SESSION,
          'مرحباً، أريد استفساراً عن الاشتراك والمميزات.',
          'يمكنني مساعدتك في الباقات. هل تريد التفاصيل؟',
          'طلب تصعيد',
        ]
      );
      console.log('✅ Inserted ai_chat_logs row for session:', DEMO_SESSION);
    } else {
      console.log('ℹ️ ai_chat_logs already has session:', DEMO_SESSION);
    }

    const ticketNo = `TKT-CTO-DEMO-${new Date().getFullYear()}-${String(DEMO_SESSION).slice(-8)}`;
    const existingTicket = await client.query(
      `SELECT id FROM support_tickets WHERE source_ref = $1 LIMIT 1`,
      [DEMO_SESSION]
    );

    if (existingTicket.rows.length === 0) {
      await client.query(
        `INSERT INTO support_tickets (
          user_id, ticket_number, category, priority, subject, description, status, source, source_ref,
          department, auto_assigned_role, sla_hours
        )
        VALUES (
          $1, $2, 'ai_escalation', 'medium',
          'تصعيد تجريبي (CTO) — سياق الذكاء الاصطناعي',
          $3, 'new', 'ai_chatbot', $4,
          'technical', 'support_admin', 24
        )`,
        [
          customerId,
          ticketNo,
          `بيانات تجريبية للـ CTO. session_id: ${DEMO_SESSION}`,
          DEMO_SESSION,
        ]
      );
      console.log('✅ Created demo support_ticket linked to ai_chat_logs session:', DEMO_SESSION);
    } else {
      console.log('ℹ️ Demo ticket already exists for session:', DEMO_SESSION);
    }

    await client.query(
      `INSERT INTO omni_conversations (source_type, source_id, status, created_at, updated_at)
       SELECT 'ticket', st.id, 'open', NOW(), NOW()
       FROM support_tickets st
       WHERE st.source_ref = $1
       AND NOT EXISTS (
         SELECT 1 FROM omni_conversations oc
         WHERE oc.source_type = 'ticket' AND oc.source_id = st.id
       )
       LIMIT 1`,
      [DEMO_SESSION]
    );

    const triplet = await client.query(`
      WITH props AS (
        SELECT id FROM properties ORDER BY created_at DESC LIMIT 30
      )
      SELECT u1.id AS u1, u2.id AS u2, p.id AS listing_id
      FROM users u1
      JOIN users u2 ON u1.id < u2.id AND u1.role = 'user' AND u2.role = 'user'
      CROSS JOIN props p
      WHERE NOT EXISTS (
        SELECT 1 FROM listing_messages lm
        WHERE lm.listing_id = p.id
        AND LEAST(lm.sender_id, lm.recipient_id) = LEAST(u1.id, u2.id)
        AND GREATEST(lm.sender_id, lm.recipient_id) = GREATEST(u1.id, u2.id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM flagged_conversations fc
        WHERE fc.user1_id = LEAST(u1.id, u2.id)
        AND fc.user2_id = GREATEST(u1.id, u2.id)
        AND fc.listing_id = p.id
      )
      LIMIT 1
    `);

    if (triplet.rows.length === 0) {
      console.warn(
        '⚠️ Could not find a (user1, user2, listing) triplet with no listing_messages; skip orphan flag.'
      );
    } else {
      const { u1, u2, listing_id: listingId } = triplet.rows[0];
      await client.query(
        `INSERT INTO flagged_conversations (
          user1_id, user2_id, listing_id, flag_type, flag_reason, ai_analysis, ai_risk_score, status, created_at
        ) VALUES (
          LEAST($1::uuid, $2::uuid), GREATEST($1::uuid, $2::uuid), $3,
          'suspicious', 'CTO pre-flight: orphan flag (no listing_messages for this triplet)',
          '{}', 50, 'pending', NOW()
        )`,
        [u1, u2, listingId]
      );
      console.log('✅ Created orphan flagged_conversation (ghost triplet — no listing_messages).');
    }

    console.log('\n✅ CTO pre-flight seed completed.');
  } finally {
    client.release();
  }
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
