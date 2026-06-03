/**
 * Ultra (Veo) tier orchestrator — Tier 3 of the 3-tier video pipeline.
 *
 * Uses Google Gemini Veo (the model gated behind GEMINI_API_KEY) to generate
 * a short cinematic AI video from the listing's hero image + a luxury-real-estate
 * prompt. Result is uploaded to Cloudinary and the listing row is updated.
 *
 * This path was previously dead code — only the polling helper existed in
 * routes/ai.js (lines ~1858+) with no caller. This orchestrator wires the
 * actual `generateVideos` trigger and the upload step.
 *
 * Cost note: a single Veo generation costs ~$2–6 on Google's billing. The
 * route layer must gate this behind a bypass code (ULTRA_BYPASS_CODE) until
 * a paid plan ships.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const axios = require("axios");
const { GoogleGenAI } = require("@google/genai");
const cloudinaryService = require("./cloudinaryService");
const db = require("../db");

function getGenAI() {
  const key = process.env.GEMINI_API_KEY || process.env.Gemeni2 || process.env.Gemeni;
  if (!key) return null;
  return new GoogleGenAI({ apiKey: key });
}

function buildVeoPrompt(listingData) {
  const ptype = listingData.propertyType || listingData.type || "luxury property";
  const city = listingData.city || "";
  const purpose = listingData.purpose === "إيجار" ? "for rent" : "for sale";
  const features = [];
  if (listingData.hasPool) features.push("with infinity pool");
  if (listingData.hasGarden) features.push("with landscaped garden");
  if (listingData.bedrooms) features.push(`${listingData.bedrooms}-bedroom`);
  const featureStr = features.join(", ");
  return [
    "cinematic ultra-realistic real estate walkthrough",
    `inside a luxurious ${ptype} ${purpose}${city ? " in " + city : ""}`,
    featureStr,
    "slow gimbal-stabilized push-in through grand rooms",
    "warm golden-hour natural light spilling through tall windows",
    "premium marble finishes, designer furniture, no people, no text overlays",
    "shallow depth of field, color graded like a feature film",
  ]
    .filter(Boolean)
    .join(", ");
}

async function downloadVeoVideo(uri, apiKey, destPath) {
  // Try x-goog-api-key header first; fall back to query string per Google's quirks.
  let res = await axios.get(uri, {
    responseType: "arraybuffer",
    timeout: 180000,
    headers: { "x-goog-api-key": apiKey },
    validateStatus: () => true,
  });
  if (res.status !== 200) {
    const sep = uri.includes("?") ? "&" : "?";
    res = await axios.get(`${uri}${sep}key=${apiKey}`, {
      responseType: "arraybuffer",
      timeout: 180000,
      validateStatus: () => true,
    });
  }
  if (res.status !== 200) {
    throw new Error(`فشل تنزيل فيديو Veo من Google (status ${res.status}).`);
  }
  fs.writeFileSync(destPath, Buffer.from(res.data));
  return destPath;
}

/**
 * Main entry. Caller in routes/ai.js has already verified:
 *   - tier === "ultra"
 *   - ULTRA_BYPASS_CODE matched
 *   - genAI is configured
 * So we just do the work here.
 *
 * Returns: { url, tier:"ultra", durationSeconds, costEstimateUsd, prompt }
 */
async function generateUltraVeoVideo(listingId, imageUrls, listingData) {
  const startedAt = Date.now();
  const genAI = getGenAI();
  if (!genAI) {
    throw new Error("GEMINI_API_KEY غير مضبوط — لا يمكن استدعاء Veo.");
  }
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    throw new Error("Ultra (Veo) يحتاج صورة واحدة على الأقل لاستخدامها كإطار افتتاحي.");
  }

  const prompt = buildVeoPrompt(listingData);
  console.log(`[Ultra/Veo] ▶️  Starting Veo generation for listing ${listingId}`);
  console.log(`[Ultra/Veo]    prompt: ${prompt}`);
  console.log(`[Ultra/Veo]    seed image: ${imageUrls[0]}`);

  // Model name — Veo 3.0 generate is the current public ID; override via env if needed.
  const veoModel = process.env.VEO_MODEL || "veo-3.0-generate-001";

  // Veo requires the seed image as { bytesBase64Encoded, mimeType }, NOT a URL.
  // Download the hero image (max ~10MB to be safe), then base64-encode and detect
  // the MIME type from the Content-Type header. If the download fails for any
  // reason, fall back to text-only generation — Veo still produces a clip,
  // just without the listing's hero frame as conditioning.
  let imageInput = null;
  try {
    const imgRes = await axios.get(imageUrls[0], {
      responseType: "arraybuffer",
      timeout: 30000,
      maxContentLength: 10 * 1024 * 1024,
      validateStatus: () => true,
    });
    if (imgRes.status === 200 && imgRes.data) {
      const ct = String(imgRes.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      // Veo currently accepts JPEG and PNG. Normalize anything weird to JPEG —
      // Cloudinary serves listing images as JPEG by default, so this is safe.
      const mimeType = ct === "image/png" ? "image/png" : "image/jpeg";
      const bytesBase64Encoded = Buffer.from(imgRes.data).toString("base64");
      // Clean camelCase shape — we bypass the @google/genai SDK below and POST
      // directly to the REST endpoint, so the SDK's snake_case transform is no
      // longer in play. Veo's image-struct validator wants pure camelCase.
      imageInput = { bytesBase64Encoded, mimeType };
      console.log(`[Ultra/Veo]    seed image encoded: ${Math.round(bytesBase64Encoded.length / 1024)} KB base64, mime=${mimeType}`);
    } else {
      console.warn(`[Ultra/Veo]    seed image fetch returned ${imgRes.status} — falling back to text-only Veo.`);
    }
  } catch (e) {
    console.warn(`[Ultra/Veo]    seed image fetch failed (${e.message}) — falling back to text-only Veo.`);
  }

  // ─── Direct REST call (bypass @google/genai SDK) ─────────────────────────
  // The SDK silently transforms top-level keys to snake_case before posting,
  // which collides with Veo's image-struct validator that wants camelCase. So
  // we hit the REST endpoint with the canonical Vertex AI prediction shape
  // ({ instances:[...], parameters:{...} }) and pure camelCase keys.
  const apiKey = process.env.GEMINI_API_KEY || process.env.Gemeni2 || process.env.Gemeni;
  if (!apiKey) throw new Error("GEMINI_API_KEY غير مضبوط — لا يمكن استدعاء Veo.");

  // Veo on the Gemini API (generativelanguage.googleapis.com) uses
  // the :predictLongRunning verb, NOT :generateVideos. The latter
  // belongs to Vertex AI which uses a different auth surface. Using
  // the wrong verb returns a generic 404 HTML page (no JSON body)
  // which is what surfaced in the ultra-diagnostic probe.
  const startUrl = `https://generativelanguage.googleapis.com/v1beta/models/${veoModel}:predictLongRunning?key=${apiKey}`;
  const instance = imageInput ? { prompt, image: imageInput } : { prompt };
  const payload = {
    instances: [instance],
    parameters: {
      aspectRatio: "16:9",
      durationSeconds: 5,
      sampleCount: 1,
      personGeneration: "dont_allow",
    },
  };

  // Helper: attach the FULL Google response as a structured diagnostic
  // on the thrown Error so the route layer can surface it verbatim to
  // the operator without anything being swallowed.
  const tagErr = (err, diag) => {
    err.diagnostic = diag;
    return err;
  };

  let operation;
  try {
    const startRes = await axios.post(startUrl, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 60000,
      validateStatus: () => true,
    });
    if (startRes.status >= 400) {
      const body = typeof startRes.data === "string" ? startRes.data : JSON.stringify(startRes.data);
      const diag = {
        stage: "start",
        http_status: startRes.status,
        model: veoModel,
        request_endpoint: `models/${veoModel}:generateVideos`,
        google_response_body: startRes.data,
        google_error: startRes.data?.error || null,
        google_error_code: startRes.data?.error?.code || null,
        google_error_status: startRes.data?.error?.status || null,
        google_error_details: startRes.data?.error?.details || null,
        request_had_image: !!imageInput,
        request_payload_shape: {
          instances_count: payload.instances.length,
          parameters: payload.parameters,
        },
      };
      console.error("[Ultra/Veo] ❌ start failed:", JSON.stringify(diag));
      if (startRes.status === 403 || /permission/i.test(body)) {
        throw tagErr(new Error(`Veo رفض الطلب (403). الكود الكامل من Google أدناه.`), diag);
      }
      if (startRes.status === 404 || /not.found/i.test(body)) {
        throw tagErr(new Error(`موديل Veo (${veoModel}) غير متاح لحسابك. جرّب VEO_MODEL=veo-2.0-generate-001 في env. الكود الكامل من Google أدناه.`), diag);
      }
      throw tagErr(new Error(`فشل بدء توليد Veo (HTTP ${startRes.status}). الكود الكامل من Google أدناه.`), diag);
    }
    operation = startRes.data;
  } catch (e) {
    if (e.diagnostic) throw e; // already tagged
    const diag = {
      stage: "start_network",
      http_status: e.response?.status || null,
      model: veoModel,
      request_endpoint: `models/${veoModel}:generateVideos`,
      network_error: e.message || String(e),
      network_code: e.code || null,
      google_response_body: e.response?.data || null,
    };
    console.error("[Ultra/Veo] ❌ start network/exception:", JSON.stringify(diag));
    throw tagErr(new Error(`فشل بدء توليد Veo: ${e.message || e}`), diag);
  }

  if (!operation?.name) {
    throw new Error(`Veo لم يُرجع اسم عملية صالح. الاستجابة: ${JSON.stringify(operation).slice(0, 400)}`);
  }
  console.log(`[Ultra/Veo]    operation started: ${operation.name}`);

  // ─── REST polling — same operation name on v1beta/{name}?key=... ─────────
  const MAX_WAIT_MS = 8 * 60 * 1000;
  const POLL_INTERVAL = 8000;
  const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${operation.name}?key=${apiKey}`;
  let result = operation;
  const pollStart = Date.now();
  while (!result.done && Date.now() - pollStart < MAX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    try {
      const pollRes = await axios.get(pollUrl, {
        timeout: 30000,
        validateStatus: () => true,
      });
      if (pollRes.status >= 400) {
        const body = typeof pollRes.data === "string" ? pollRes.data : JSON.stringify(pollRes.data);
        throw new Error(`فشل استطلاع حالة Veo (status ${pollRes.status}): ${body}`);
      }
      result = pollRes.data;
      console.log(`[Ultra/Veo]    polling… done=${!!result.done}`);
    } catch (e) {
      throw new Error(`فشل استطلاع حالة Veo: ${e.message || e}`);
    }
  }
  if (!result.done) {
    throw new Error("انتهت المهلة قبل اكتمال فيديو Veo (>8 دقائق).");
  }
  if (result.error) {
    throw new Error(`Veo أرجع خطأ بعد الاكتمال: ${JSON.stringify(result.error)}`);
  }
  const generatedVideos = result.response?.generatedVideos || result.response?.generated_videos || [];
  if (generatedVideos.length === 0) {
    throw new Error("Veo أرجع نتيجة فارغة — لا يوجد فيديو في الاستجابة.");
  }

  const video = generatedVideos[0];
  const videoData = video.video || video;
  const videoUri = videoData?.uri || videoData?.url;
  if (!videoUri) {
    throw new Error("Veo لم يُرجع رابطاً صالحاً للفيديو.");
  }

  // Download to temp + upload to Cloudinary.
  // `apiKey` already declared above for the REST start/poll calls.
  const tempDir = path.join(os.tmpdir(), "ultra-veo");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const tempPath = path.join(tempDir, `veo_${listingId}_${Date.now()}.mp4`);
  await downloadVeoVideo(videoUri, apiKey, tempPath);

  let finalUrl = null;
  try {
    const folder = `listings/${listingId}/promo/ultra`;
    const uploadResult = await cloudinaryService.uploadVideo(tempPath, folder);
    if (!uploadResult?.success || !uploadResult.url) {
      throw new Error(uploadResult?.error || "فشل رفع فيديو Veo إلى Cloudinary");
    }
    finalUrl = uploadResult.url;

    if (!String(listingId).startsWith("temp_")) {
      await db
        .query(`UPDATE properties SET video_status = 'ready', video_url = $1 WHERE id = $2`, [finalUrl, listingId])
        .catch((e) => console.warn("[Ultra/Veo] DB update failed:", e.message));
    }
  } finally {
    try { fs.unlinkSync(tempPath); } catch {}
  }

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`[Ultra/Veo] 🏁 Done in ${elapsedSec}s — ${finalUrl}`);

  return {
    url: finalUrl,
    promoText: null,
    tier: "ultra",
    durationSeconds: parseFloat(elapsedSec),
    costEstimateUsd: "2-6",
    model: veoModel,
    prompt,
  };
}

module.exports = {
  generateUltraVeoVideo,
  buildVeoPrompt,
};
