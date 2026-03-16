/**
 * User Feedback system - public and admin API
 * Bayt Al Jazeera
 */

const express = require("express");
const db = require("../db");
const { authMiddleware, requireRoles, optionalAuth } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();

const DEFAULT_SETTINGS = {
  enabled: true,
  showOnHomepage: true,
  showOnSearch: true,
  showOnMapPage: true,
  showOnPropertyDetails: true,
  displayMode: "inline",
  delaySeconds: 25,
  frequency: "once_per_session",
  headingText: "كيف كانت تجربتك؟",
  thankYouMessage: "شكراً لمساهمتك!",
  successMessage: "تم إرسال رأيك بنجاح.",
  enableProblemQuestion: true,
  enableCommentField: true,
  adminEmailNotification: false,
  adminEmail: "",
};

const SETTINGS_KEY = "main";

async function getFeedbackSettings() {
  const result = await db.query(
    `SELECT value FROM feedback_settings WHERE key = $1`,
    [SETTINGS_KEY]
  );
  if (result.rows.length === 0) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(result.rows[0].value || "{}") };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function setFeedbackSettings(settings) {
  const value = JSON.stringify(settings);
  await db.query(
    `INSERT INTO feedback_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [SETTINGS_KEY, value]
  );
}

// ----- Public endpoints -----

// GET /api/feedback/settings - widget reads this to know if/how to show
router.get(
  "/settings",
  asyncHandler(async (req, res) => {
    const settings = await getFeedbackSettings();
    if (!settings.enabled) {
      return res.json({ enabled: false, ...settings });
    }
    res.json({ enabled: true, ...settings });
  })
);

// GET /api/feedback/questions - optional ?pageType=home|search|search_map|listing
router.get(
  "/questions",
  asyncHandler(async (req, res) => {
    const pageType = req.query.pageType || "";
    const result = await db.query(
      `SELECT id, question_text_ar, question_type, options, is_required, sort_order
       FROM feedback_questions
       ORDER BY sort_order ASC, id ASC`
    );
    res.json({ questions: result.rows || [] });
  })
);

// POST /api/feedback - submit feedback (optional auth for user_id)
router.post(
  "/",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const settings = await getFeedbackSettings();
    if (!settings.enabled) {
      return res.status(400).json({ error: "نظام التغذية الراجعة غير مفعّل" });
    }

    const {
      rating,
      had_issue,
      comment,
      page_url,
      page_type,
      answers,
    } = req.body;

    const pageUrl = typeof page_url === "string" ? page_url.slice(0, 2048) : "";
    const pageType = ["home", "search", "search_map", "listing"].includes(page_type)
      ? page_type
      : "home";
    const deviceType = typeof req.body.device_type === "string"
      ? req.body.device_type.slice(0, 100)
      : null;
    const userId = req.user?.id || null;

    const insertResult = await db.query(
      `INSERT INTO feedback_responses
       (rating, had_issue, comment, page_url, page_type, device_type, user_id, answers)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, created_at`,
      [
        rating != null ? Math.min(5, Math.max(1, parseInt(rating, 10))) : null,
        had_issue === true || had_issue === "true" ? true : had_issue === false || had_issue === "false" ? false : null,
        typeof comment === "string" ? comment.slice(0, 2000) : null,
        pageUrl || null,
        pageType,
        deviceType,
        userId,
        answers && typeof answers === "object" ? JSON.stringify(answers) : null,
      ]
    );

    const row = insertResult.rows[0];

    // Optional: notify admin by email
    if (settings.adminEmailNotification && settings.adminEmail) {
      try {
        const emailService = require("../services/emailService");
        const ratingStr = rating != null ? `${rating}/5` : "—";
        const issueStr = had_issue === true ? "نعم" : had_issue === false ? "لا" : "—";
        const html = `
          <div dir="rtl" style="font-family: Arial; padding: 20px;">
            <h3>تغذية راجعة جديدة - بيت الجزيرة</h3>
            <p><strong>التقييم:</strong> ${ratingStr}</p>
            <p><strong>واجه مشكلة:</strong> ${issueStr}</p>
            <p><strong>صفحة:</strong> ${pageType} — ${pageUrl || "—"}</p>
            ${comment ? `<p><strong>تعليق:</strong> ${comment}</p>` : ""}
            <p><small>${new Date().toISOString()}</small></p>
          </div>
        `;
        await emailService.sendEmail(settings.adminEmail, "تغذية راجعة جديدة - بيت الجزيرة", html);
      } catch (e) {
        console.error("Feedback admin email error:", e.message);
      }
    }

    res.status(201).json({
      ok: true,
      id: row.id,
      message: settings.successMessage || DEFAULT_SETTINGS.successMessage,
    });
  })
);

// ----- Admin endpoints -----

const adminFeedback = (req, res, next) => {
  return requireRoles("super_admin", "admin", "support_admin")(req, res, next);
};

// GET /api/feedback/admin/settings
router.get(
  "/admin/settings",
  authMiddleware,
  adminFeedback,
  asyncHandler(async (req, res) => {
    const settings = await getFeedbackSettings();
    res.json({ ok: true, settings });
  })
);

// PUT /api/feedback/admin/settings
router.put(
  "/admin/settings",
  authMiddleware,
  adminFeedback,
  asyncHandler(async (req, res) => {
    const current = await getFeedbackSettings();
    const body = req.body || {};
    const settings = {
      enabled: body.enabled !== undefined ? !!body.enabled : current.enabled,
      showOnHomepage: body.showOnHomepage !== undefined ? !!body.showOnHomepage : current.showOnHomepage,
      showOnSearch: body.showOnSearch !== undefined ? !!body.showOnSearch : current.showOnSearch,
      showOnMapPage: body.showOnMapPage !== undefined ? !!body.showOnMapPage : current.showOnMapPage,
      showOnPropertyDetails: body.showOnPropertyDetails !== undefined ? !!body.showOnPropertyDetails : current.showOnPropertyDetails,
      displayMode: ["inline", "floating", "popup"].includes(body.displayMode) ? body.displayMode : current.displayMode,
      delaySeconds: typeof body.delaySeconds === "number" ? Math.max(0, Math.min(120, body.delaySeconds)) : current.delaySeconds,
      frequency: ["every_visit", "once_per_session", "once_per_7_days"].includes(body.frequency) ? body.frequency : current.frequency,
      headingText: typeof body.headingText === "string" ? body.headingText.slice(0, 200) : current.headingText,
      thankYouMessage: typeof body.thankYouMessage === "string" ? body.thankYouMessage.slice(0, 500) : current.thankYouMessage,
      successMessage: typeof body.successMessage === "string" ? body.successMessage.slice(0, 500) : current.successMessage,
      enableProblemQuestion: body.enableProblemQuestion !== undefined ? !!body.enableProblemQuestion : current.enableProblemQuestion,
      enableCommentField: body.enableCommentField !== undefined ? !!body.enableCommentField : current.enableCommentField,
      adminEmailNotification: body.adminEmailNotification !== undefined ? !!body.adminEmailNotification : current.adminEmailNotification,
      adminEmail: typeof body.adminEmail === "string" ? body.adminEmail.slice(0, 255) : (current.adminEmail || ""),
    };
    await setFeedbackSettings(settings);
    res.json({ ok: true, settings });
  })
);

// GET /api/feedback/admin/overview
router.get(
  "/admin/overview",
  authMiddleware,
  adminFeedback,
  asyncHandler(async (req, res) => {
    const [stats, byPage, recent, negative] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*)::int AS total,
          ROUND(AVG(rating)::numeric, 2) AS avg_rating
        FROM feedback_responses
      `),
      db.query(`
        SELECT page_type, COUNT(*)::int AS cnt
        FROM feedback_responses
        GROUP BY page_type
        ORDER BY cnt DESC
      `),
      db.query(`
        SELECT id, rating, had_issue, comment, page_type, page_url, created_at
        FROM feedback_responses
        ORDER BY created_at DESC
        LIMIT 15
      `),
      db.query(`
        SELECT comment FROM feedback_responses
        WHERE (rating IS NOT NULL AND rating <= 2) OR had_issue = true
        AND comment IS NOT NULL AND TRIM(comment) != ''
        ORDER BY created_at DESC
        LIMIT 20
      `),
    ]);

    res.json({
      ok: true,
      total: parseInt(stats.rows[0]?.total || 0, 10),
      avgRating: parseFloat(stats.rows[0]?.avg_rating || 0) || null,
      byPageType: (byPage.rows || []).map((r) => ({ pageType: r.page_type, count: r.cnt })),
      recent: recent.rows || [],
      negativeComments: (negative.rows || []).map((r) => r.comment).filter(Boolean),
    });
  })
);

// POST /api/feedback/admin/summary - simple automatic analysis & suggestions
router.post(
  "/admin/summary",
  authMiddleware,
  adminFeedback,
  asyncHandler(async (req, res) => {
    const negative = await db.query(
      `
      SELECT page_type, rating, had_issue, comment, created_at
      FROM feedback_responses
      ORDER BY created_at DESC
      LIMIT 100
    `
    );

    const rows = negative.rows || [];
    if (rows.length === 0) {
      return res.json({
        ok: true,
        summary:
          "لا توجد حتى الآن بيانات كافية من تغذية راجعة المستخدمين لاستخلاص استنتاجات.",
        suggestions: [
          "استمر في جمع التغذية الراجعة من صفحات البحث وتفاصيل العقار.",
          "بعد وصول عدد أكبر من الردود يمكن تحليل الأنماط واقتراح تحسينات أدق.",
        ],
      });
    }

    const statsByPage = rows.reduce<Record<string, { total: number; low: number }>>(
      (acc, r) => {
        const key = r.page_type || "unknown";
        if (!acc[key]) acc[key] = { total: 0, low: 0 };
        acc[key].total += 1;
        if ((r.rating != null && r.rating <= 2) || r.had_issue === true) {
          acc[key].low += 1;
        }
        return acc;
      },
      {}
    );

    const parts: string[] = [];
    Object.entries(statsByPage).forEach(([page, v]) => {
      const label =
        page === "home"
          ? "الصفحة الرئيسية"
          : page === "search"
          ? "نتائج البحث"
          : page === "search_map"
          ? "خريطة البحث"
          : page === "listing"
          ? "تفاصيل العقار"
          : page;
      const lowRatio = v.total ? Math.round((v.low / v.total) * 100) : 0;
      parts.push(
        `${label}: عدد الردود ${v.total}، نسبة التقييمات المنخفضة أو وجود مشاكل تقريباً ${lowRatio}٪.`
      );
    });

    const suggestions: string[] = [];
    if ((statsByPage.search_map?.low || 0) > 0) {
      suggestions.push(
        "تحسين تجربة البحث بالخريطة (سرعة التحميل، وضوح النتائج، سهولة التحريك والتكبير)."
      );
    }
    if ((statsByPage.search?.low || 0) > 0) {
      suggestions.push(
        "مراجعة فلاتر البحث والنصوص التوضيحية حتى يصل المستخدم للنتيجة المناسبة بأقصر عدد نقرات."
      );
    }
    if ((statsByPage.listing?.low || 0) > 0) {
      suggestions.push(
        "مراجعة محتوى تفاصيل العقار (الصور، الوصف، المساحة، السعر) والتأكد من وضوحها للمستخدم."
      );
    }
    if (suggestions.length === 0) {
      suggestions.push(
        "استمر في جمع التغذية الراجعة؛ لا توجد أنماط سلبية قوية حالياً تستدعي تغييراً جذرياً."
      );
    }

    res.json({
      ok: true,
      summary:
        "تحليل تلقائي مبني على بيانات تغذية راجعة المستخدمين (بدون نموذج ذكاء اصطناعي خارجي حالياً): " +
        parts.join(" "),
      suggestions,
    });
  })
);

// GET /api/feedback/admin/responses
router.get(
  "/admin/responses",
  authMiddleware,
  adminFeedback,
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 50, pageType, rating, search, from, to } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (pageType) {
      conditions.push(`page_type = $${idx++}`);
      params.push(pageType);
    }
    if (rating !== undefined && rating !== "") {
      const r = parseInt(rating, 10);
      if (!isNaN(r) && r >= 1 && r <= 5) {
        conditions.push(`rating = $${idx++}`);
        params.push(r);
      }
    }
    if (search && typeof search === "string" && search.trim()) {
      conditions.push(`(comment ILIKE $${idx} OR page_url ILIKE $${idx})`);
      params.push(`%${search.trim()}%`);
      idx++;
    }
    if (from) {
      conditions.push(`created_at >= $${idx++}`);
      params.push(from);
    }
    if (to) {
      conditions.push(`created_at <= $${idx++}`);
      params.push(to);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM feedback_responses ${where}`,
      params
    );
    const total = countResult.rows[0]?.total || 0;

    params.push(limitNum, offset);
    const listResult = await db.query(
      `SELECT id, rating, had_issue, comment, page_url, page_type, device_type, user_id, created_at
       FROM feedback_responses ${where}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      params
    );

    res.json({
      ok: true,
      items: listResult.rows || [],
      total,
      page: pageNum,
      limit: limitNum,
    });
  })
);

// DELETE /api/feedback/admin/responses/:id
router.delete(
  "/admin/responses/:id",
  authMiddleware,
  adminFeedback,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "معرف غير صالح" });
    const result = await db.query(`DELETE FROM feedback_responses WHERE id = $1 RETURNING id`, [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "الرد غير موجود" });
    res.json({ ok: true, deleted: id });
  })
);

// GET /api/feedback/admin/responses/export
router.get(
  "/admin/responses/export",
  authMiddleware,
  adminFeedback,
  asyncHandler(async (req, res) => {
    const { pageType, rating, from, to } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;
    if (pageType) { conditions.push(`page_type = $${idx++}`); params.push(pageType); }
    if (rating !== undefined && rating !== "") {
      const r = parseInt(rating, 10);
      if (!isNaN(r) && r >= 1 && r <= 5) { conditions.push(`rating = $${idx++}`); params.push(r); }
    }
    if (from) { conditions.push(`created_at >= $${idx++}`); params.push(from); }
    if (to) { conditions.push(`created_at <= $${idx++}`); params.push(to); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await db.query(
      `SELECT id, rating, had_issue, comment, page_url, page_type, device_type, created_at
       FROM feedback_responses ${where} ORDER BY created_at DESC`,
      params
    );

    const rows = result.rows || [];
    const header = "id,rating,had_issue,comment,page_url,page_type,device_type,created_at";
    const escape = (v) => {
      if (v == null) return "";
      const s = String(v).replace(/"/g, '""');
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
    };
    const csv = [header, ...rows.map((r) =>
      [r.id, r.rating, r.had_issue, r.comment, r.page_url, r.page_type, r.device_type, r.created_at].map(escape).join(",")
    )].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=feedback-responses.csv");
    res.send("\uFEFF" + csv);
  })
);

// GET /api/feedback/admin/questions
router.get(
  "/admin/questions",
  authMiddleware,
  adminFeedback,
  asyncHandler(async (req, res) => {
    const result = await db.query(
      `SELECT id, question_text_ar, question_type, options, is_required, sort_order, created_at, updated_at
       FROM feedback_questions ORDER BY sort_order ASC, id ASC`
    );
    res.json({ ok: true, questions: result.rows || [] });
  })
);

// POST /api/feedback/admin/questions
router.post(
  "/admin/questions",
  authMiddleware,
  adminFeedback,
  asyncHandler(async (req, res) => {
    const { question_text_ar, question_type, options, is_required, sort_order } = req.body || {};
    if (!question_text_ar || typeof question_text_ar !== "string" || !question_text_ar.trim()) {
      return res.status(400).json({ error: "نص السؤال مطلوب" });
    }
    const validTypes = ["rating", "yes_no", "short_text", "multiple_choice"];
    const qType = validTypes.includes(question_type) ? question_type : "short_text";
    const opts = options && Array.isArray(options) ? options : null;
    const required = !!is_required;
    const order = typeof sort_order === "number" ? sort_order : 0;

    const result = await db.query(
      `INSERT INTO feedback_questions (question_text_ar, question_type, options, is_required, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, question_text_ar, question_type, options, is_required, sort_order, created_at, updated_at`,
      [question_text_ar.trim().slice(0, 500), qType, opts ? JSON.stringify(opts) : null, required, order]
    );
    res.status(201).json({ ok: true, question: result.rows[0] });
  })
);

// PUT /api/feedback/admin/questions/:id
router.put(
  "/admin/questions/:id",
  authMiddleware,
  adminFeedback,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "معرف غير صالح" });
    const { question_text_ar, question_type, options, is_required, sort_order } = req.body || {};
    const validTypes = ["rating", "yes_no", "short_text", "multiple_choice"];
    const updates = [];
    const params = [];
    let idx = 1;
    if (question_text_ar !== undefined) {
      updates.push(`question_text_ar = $${idx++}`);
      params.push(typeof question_text_ar === "string" ? question_text_ar.trim().slice(0, 500) : "");
    }
    if (question_type !== undefined) {
      updates.push(`question_type = $${idx++}`);
      params.push(validTypes.includes(question_type) ? question_type : "short_text");
    }
    if (options !== undefined) {
      updates.push(`options = $${idx++}`);
      params.push(Array.isArray(options) ? JSON.stringify(options) : null);
    }
    if (is_required !== undefined) {
      updates.push(`is_required = $${idx++}`);
      params.push(!!is_required);
    }
    if (sort_order !== undefined) {
      updates.push(`sort_order = $${idx++}`);
      params.push(typeof sort_order === "number" ? sort_order : 0);
    }
    if (updates.length === 0) return res.status(400).json({ error: "لا يوجد شيء لتحديثه" });
    updates.push(`updated_at = NOW()`);
    params.push(id);
    const result = await db.query(
      `UPDATE feedback_questions SET ${updates.join(", ")} WHERE id = $${idx} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "السؤال غير موجود" });
    res.json({ ok: true, question: result.rows[0] });
  })
);

// DELETE /api/feedback/admin/questions/:id
router.delete(
  "/admin/questions/:id",
  authMiddleware,
  adminFeedback,
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "معرف غير صالح" });
    const result = await db.query(`DELETE FROM feedback_questions WHERE id = $1 RETURNING id`, [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "السؤال غير موجود" });
    res.json({ ok: true, deleted: id });
  })
);

// PUT /api/feedback/admin/questions/reorder
router.put(
  "/admin/questions/reorder",
  authMiddleware,
  adminFeedback,
  asyncHandler(async (req, res) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "المصفوفة ids مطلوبة" });
    }
    for (let i = 0; i < ids.length; i++) {
      const id = parseInt(ids[i], 10);
      if (isNaN(id)) continue;
      await db.query(`UPDATE feedback_questions SET sort_order = $1, updated_at = NOW() WHERE id = $2`, [i, id]);
    }
    res.json({ ok: true });
  })
);

module.exports = router;
