/**
 * Omnichannel unified inbox API (omni_conversations / omni_messages + ticket thread merge).
 */
const express = require("express");
const db = require("../db");
const { authMiddleware, requireRoles } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");
const { getSupportTicketScope } = require("../utils/customerServiceScope");

const router = express.Router();

const DEPT_AR = {
  financial: "مالية",
  account: "حسابي/إداري",
  technical: "تقنية",
};

const OMNI_ROLES = [
  "super_admin",
  "admin",
  "support_admin",
  "finance_admin",
  "content_admin",
  "admin_manager",
];

function requireOmni(req, res, next) {
  return requireRoles(...OMNI_ROLES)(req, res, next);
}

/** Merge omni messages + support_ticket_replies for ticket-linked threads; sort by time. */
async function fetchMergedTimeline(omniId) {
  const oc = await db.query(`SELECT * FROM omni_conversations WHERE id = $1`, [omniId]);
  if (oc.rows.length === 0) return { oc: null, timeline: [] };
  const row = oc.rows[0];

  const omniMsgs = await db.query(
    `SELECT 
       'omni' AS entry_kind,
       m.id,
       m.sender_type,
       m.sender_id,
       COALESCE(u.name, 'مستخدم') AS sender_name,
       m.content,
       m.visibility::text AS visibility,
       m.created_at
     FROM omni_messages m
     LEFT JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = $1`,
    [omniId]
  );

  let ticketRows = { rows: [] };
  if (row.source_type === "ticket" && row.source_id) {
    ticketRows = await db.query(
      `SELECT 
         'ticket_reply' AS entry_kind,
         r.id,
         CASE
           WHEN r.sender_type = 'user' THEN 'user'
           WHEN r.sender_type = 'internal' THEN 'internal'
           ELSE 'admin'
         END AS sender_type,
         r.sender_id,
         COALESCE(u.name, 'مستخدم') AS sender_name,
         r.message AS content,
         CASE WHEN r.sender_type = 'internal' THEN 'internal_note' ELSE 'public' END AS visibility,
         r.created_at
       FROM support_ticket_replies r
       LEFT JOIN users u ON u.id = r.sender_id
       WHERE r.ticket_id = $1`,
      [row.source_id]
    );
  }

  const merged = [...omniMsgs.rows, ...ticketRows.rows].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
  return { oc: row, timeline: merged };
}

/** Enrich inbox row for list UI. */
async function buildInboxList() {
  const omniList = await db.query(`
    SELECT 
      oc.id,
      oc.source_type,
      oc.source_id,
      oc.status,
      oc.updated_at,
      oc.created_at,
      (
        SELECT m.content FROM omni_messages m 
        WHERE m.conversation_id = oc.id 
        ORDER BY m.created_at DESC LIMIT 1
      ) AS last_snippet
    FROM omni_conversations oc
    ORDER BY oc.updated_at DESC
    LIMIT 200
  `);

  const items = [];
  for (const r of omniList.rows) {
    let title = "محادثة";
    let subtitle = "";
    let aiSessionId = null;
    let ticketId = null;

    if (r.source_type === "feedback" && r.source_id) {
      title = `تغذية راجعة #${r.source_id}`;
      const fr = await db.query(
        `SELECT page_type, rating FROM feedback_responses WHERE id = $1`,
        [r.source_id]
      );
      if (fr.rows[0]) {
        subtitle = `صفحة: ${fr.rows[0].page_type || "—"} · تقييم: ${fr.rows[0].rating ?? "—"}`;
      }
      const t = await db.query(
        `SELECT id, source, source_ref FROM support_tickets 
         WHERE source_ref = $1 AND status NOT IN ('resolved', 'closed') ORDER BY created_at DESC LIMIT 1`,
        [`feedback:${r.source_id}`]
      );
      if (t.rows[0]) {
        ticketId = t.rows[0].id;
        if (t.rows[0].source === "ai_chatbot" && t.rows[0].source_ref) {
          aiSessionId = t.rows[0].source_ref;
        }
      }
    } else if (r.source_type === "ticket" && r.source_id) {
      const st = await db.query(
        `SELECT id, subject, source, source_ref, department FROM support_tickets WHERE id = $1`,
        [r.source_id]
      );
      if (st.rows[0]) {
        ticketId = st.rows[0].id;
        title = st.rows[0].subject || `تذكرة #${st.rows[0].id}`;
        const dept = st.rows[0].department;
        const deptTag = dept ? (DEPT_AR[dept] || dept) : "دعم";
        if (st.rows[0].source === "complaint_page") {
          subtitle = `شكوى — ${deptTag} · البريد الموحد`;
        } else if (st.rows[0].source === "ai_chatbot") {
          subtitle = `${deptTag} · تصعيد من الدعم الآلي`;
        } else {
          subtitle = `${deptTag} · تذكرة دعم`;
        }
        if (st.rows[0].source === "ai_chatbot" && st.rows[0].source_ref) {
          aiSessionId = st.rows[0].source_ref;
        }
      }
    }

    items.push({
      kind: "omni",
      omni_id: r.id,
      source_type: r.source_type,
      source_id: r.source_id,
      status: r.status,
      updated_at: r.updated_at,
      created_at: r.created_at,
      title,
      subtitle,
      last_snippet: r.last_snippet || "",
      ticket_id: ticketId,
      ai_session_id: aiSessionId,
    });
  }

  const pendingTickets = await db.query(`
    SELECT st.id, st.subject, st.source, st.source_ref, st.updated_at, st.user_id, st.department
    FROM support_tickets st
    WHERE st.source = 'ai_chatbot'
      AND st.status NOT IN ('resolved', 'closed')
      AND NOT EXISTS (
        SELECT 1 FROM omni_conversations oc 
        WHERE oc.source_type = 'ticket' AND oc.source_id = st.id
      )
    ORDER BY st.updated_at DESC
    LIMIT 50
  `);

  for (const t of pendingTickets.rows) {
    items.push({
      kind: "ticket_pending",
      omni_id: null,
      source_type: "ticket",
      source_id: t.id,
      status: "open",
      updated_at: t.updated_at,
      created_at: t.updated_at,
      title: t.subject || `تذكرة #${t.id}`,
      subtitle: `${t.department ? (DEPT_AR[t.department] || t.department) + " · " : ""}تصعيد من الدعم الآلي — لم تُفتح بعد في البريد الموحد`,
      last_snippet: "",
      ticket_id: t.id,
      ai_session_id: t.source_ref || null,
    });
  }

  items.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  return items;
}

// GET /api/admin/omni/inbox
router.get("/inbox", authMiddleware, requireOmni, asyncHandler(async (req, res) => {
  const items = await buildInboxList();
  res.json({ ok: true, items });
}));

// POST /api/admin/omni/ensure-ticket/:ticketId — create omni row for ticket if missing
router.post(
  "/ensure-ticket/:ticketId",
  authMiddleware,
  requireOmni,
  asyncHandler(async (req, res) => {
    const ticketId = parseInt(req.params.ticketId, 10);
    if (Number.isNaN(ticketId)) {
      return res.status(400).json({ error: "معرف التذكرة غير صالح" });
    }

    const sc = getSupportTicketScope(req.user.role, req.user.id, 2);
    const scopeSql = sc.clause ? ` AND ${sc.clause}` : "";
    const ticketCheck = await db.query(
      `SELECT id FROM support_tickets st WHERE st.id = $1${scopeSql}`,
      [ticketId, ...sc.params]
    );
    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ error: "التذكرة غير موجودة أو غير مسموح" });
    }

    const existing = await db.query(
      `SELECT id FROM omni_conversations WHERE source_type = 'ticket' AND source_id = $1`,
      [ticketId]
    );
    if (existing.rows.length > 0) {
      return res.json({ ok: true, omni_id: existing.rows[0].id, created: false });
    }

    const ins = await db.query(
      `INSERT INTO omni_conversations (source_type, source_id, status, created_at, updated_at)
       VALUES ('ticket', $1, 'open', NOW(), NOW())
       RETURNING id`,
      [ticketId]
    );
    res.json({ ok: true, omni_id: ins.rows[0].id, created: true });
  })
);

// GET /api/admin/omni/conversations/:id — detail + merged timeline
router.get(
  "/conversations/:id",
  authMiddleware,
  requireOmni,
  asyncHandler(async (req, res) => {
    const omniId = parseInt(req.params.id, 10);
    if (Number.isNaN(omniId)) {
      return res.status(400).json({ error: "معرف غير صالح" });
    }

    const { oc, timeline } = await fetchMergedTimeline(omniId);
    if (!oc) {
      return res.status(404).json({ error: "المحادثة غير موجودة" });
    }

    let ticket = null;
    let ai_session_id = null;
    if (oc.source_type === "ticket" && oc.source_id) {
      const tr = await db.query(
        `SELECT st.*, u.name AS user_name, u.email AS user_email
         FROM support_tickets st
         LEFT JOIN users u ON u.id = st.user_id
         WHERE st.id = $1`,
        [oc.source_id]
      );
      ticket = tr.rows[0] || null;
    } else if (oc.source_type === "feedback" && oc.source_id) {
      const tr = await db.query(
        `SELECT st.*, u.name AS user_name, u.email AS user_email
         FROM support_tickets st
         LEFT JOIN users u ON u.id = st.user_id
         WHERE st.source_ref = $1 AND st.status NOT IN ('resolved', 'closed')
         ORDER BY st.created_at DESC LIMIT 1`,
        [`feedback:${oc.source_id}`]
      );
      ticket = tr.rows[0] || null;
    }

    if (ticket?.source === "ai_chatbot" && ticket.source_ref) {
      ai_session_id = ticket.source_ref;
    }

    res.json({
      ok: true,
      conversation: oc,
      timeline,
      ticket,
      ai_session_id,
    });
  })
);

// POST /api/admin/omni/conversations/:id/messages
router.post(
  "/conversations/:id/messages",
  authMiddleware,
  requireOmni,
  asyncHandler(async (req, res) => {
    const omniId = parseInt(req.params.id, 10);
    if (Number.isNaN(omniId)) {
      return res.status(400).json({ error: "معرف غير صالح" });
    }

    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    if (!content) {
      return res.status(400).json({ error: "النص مطلوب" });
    }

    const visRaw = req.body?.visibility;
    const visibility =
      visRaw === "internal_note" ? "internal_note" : "public";

    const oc = await db.query(`SELECT * FROM omni_conversations WHERE id = $1`, [omniId]);
    if (oc.rows.length === 0) {
      return res.status(404).json({ error: "المحادثة غير موجودة" });
    }
    const conv = oc.rows[0];

    const msg = await db.query(
      `INSERT INTO omni_messages (conversation_id, sender_type, sender_id, content, visibility, created_at)
       VALUES ($1, 'admin', $2, $3, $4::omni_message_visibility, NOW())
       RETURNING *`,
      [omniId, req.user.id, content, visibility]
    );

    await db.query(`UPDATE omni_conversations SET updated_at = NOW() WHERE id = $1`, [omniId]);

    if (visibility === "public") {
      let ticketId = null;
      let customerId = null;

      if (conv.source_type === "ticket" && conv.source_id) {
        ticketId = conv.source_id;
        const tu = await db.query(`SELECT user_id FROM support_tickets WHERE id = $1`, [ticketId]);
        customerId = tu.rows[0]?.user_id;
      } else if (conv.source_type === "feedback" && conv.source_id) {
        const t = await db.query(
          `SELECT id, user_id FROM support_tickets 
           WHERE source_ref = $1 AND status NOT IN ('resolved', 'closed')
           ORDER BY created_at DESC LIMIT 1`,
          [`feedback:${conv.source_id}`]
        );
        if (t.rows[0]) {
          ticketId = t.rows[0].id;
          customerId = t.rows[0].user_id;
        }
      }

      if (ticketId && customerId) {
        await db.query(
          `INSERT INTO support_ticket_replies (ticket_id, sender_id, sender_type, message)
           VALUES ($1, $2, 'admin', $3)`,
          [ticketId, req.user.id, content]
        );
        await db.query(`UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`, [ticketId]);

        try {
          const subj = await db.query(`SELECT subject FROM support_tickets WHERE id = $1`, [ticketId]);
          const sub = subj.rows[0]?.subject || "تذكرتك";
          await db.query(
            `INSERT INTO notifications (user_id, title, body, type, link, created_at)
             VALUES ($1, $2, $3, 'support_reply', $4, NOW())`,
            [
              customerId,
              "رد جديد من الدعم",
              `تم الرد على «${sub}»`,
              `/account/my-tickets?open=${ticketId}`,
            ]
          );
        } catch (e) {
          console.error("[omni] customer notify:", e.message);
        }
      }
    }

    const sender = await db.query(`SELECT name FROM users WHERE id = $1`, [req.user.id]);
    const row = msg.rows[0];
    res.status(201).json({
      ok: true,
      message: {
        ...row,
        sender_name: sender.rows[0]?.name || "مشرف",
      },
    });
  })
);

// GET /api/admin/omni/ai-context/:sessionId — read-only AI chat log for handoff panel
router.get(
  "/ai-context/:sessionId",
  authMiddleware,
  requireOmni,
  asyncHandler(async (req, res) => {
    const sessionId = req.params.sessionId;
    if (!sessionId || String(sessionId).length > 200) {
      return res.status(400).json({ error: "معرف الجلسة غير صالح" });
    }

    const result = await db.query(
      `SELECT id, session_id, user_message, ai_response, escalated, escalate_reason, created_at
       FROM ai_chat_logs
       WHERE session_id = $1
       ORDER BY created_at ASC
       LIMIT 500`,
      [sessionId]
    );

    res.json({ ok: true, logs: result.rows });
  })
);

module.exports = router;
