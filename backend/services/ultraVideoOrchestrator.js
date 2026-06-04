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
const { spawn } = require("child_process");
const { promisify } = require("util");
const stream = require("stream");
const pipeline = promisify(stream.pipeline);
const { GoogleGenAI } = require("@google/genai");
const cloudinaryService = require("./cloudinaryService");
const db = require("../db");

// ── Hybrid pipeline helpers (mirror Luxury orchestrator) ────────────
function ffmpegAvailable() {
  return new Promise((resolve) => {
    try {
      const ff = spawn("ffmpeg", ["-version"]);
      ff.on("error", () => resolve(false));
      ff.on("close", (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
}

async function downloadToTemp(url, suffix = ".mp4") {
  const tempDir = path.join(os.tmpdir(), "ultra-veo");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const dest = path.join(tempDir, `ux_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${suffix}`);
  const res = await axios.get(url, { responseType: "stream", timeout: 180000 });
  await pipeline(res.data, fs.createWriteStream(dest));
  return dest;
}

// Veo emits a silent video — no audio track at all. The concat filter
// below uses [0:a] (audio from input 0) which fails with "matches no
// streams" when input 0 has no audio. So before concat we pre-process
// the Veo clip and inject a silent stereo AAC track sized to match
// the video duration. The slideshow already has voice narration audio,
// so it's left untouched.
async function addSilentAudioTrack(inputPath) {
  const outPath = inputPath.replace(/\.mp4$/i, "_silent.mp4");
  const args = [
    "-y",
    "-i", inputPath,
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-c:v", "copy",
    "-c:a", "aac", "-b:a", "192k",
    "-shortest",          // truncate audio to video length
    "-movflags", "+faststart",
    outPath,
  ];
  await new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", args);
    let stderr = "";
    ff.stderr.on("data", (d) => { stderr += d.toString(); });
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`silent-audio injection failed (${code}): ${stderr.slice(-500)}`));
    });
  });
  return outPath;
}

// ─────────────────────────────────────────────────────────────────
// Concat the Veo opener with the slideshow into one MP4.
//
// Audio design (June 2026 — owner-driven):
//   The narration must "ride along" from t=0 — the Veo cinematic
//   opener should play WITH the voiceover, not in silence followed
//   by the voice. So we:
//     • Concat ONLY the video streams (drop input 0's audio entirely
//       since Veo is silent, and drop input 1's audio as a concat
//       member since we want to use it standalone instead).
//     • Take the slideshow's audio track and start it at t=0 of the
//       concatenated video. Pad it with silence (apad) so it stretches
//       to the full combined length if narration is shorter.
//     • -shortest then truncates the (infinite) audio stream to the
//       video stream's length so the file ends cleanly.
//
//   Net effect for the viewer:
//     0s         8s                                       ~32s
//     |  Veo     |  slideshow                                |
//     |  narration ──────────────────────────────►  silence  |
//   The cinematic AI opener now has narration describing the
//   property — feels like one continuous video, not two glued
//   together.
// ─────────────────────────────────────────────────────────────────
async function concatVideosWithFfmpeg(openingPath, slideshowPath) {
  if (!fs.existsSync(openingPath)) throw new Error(`opening clip missing at ${openingPath}`);
  if (!fs.existsSync(slideshowPath)) throw new Error(`slideshow clip missing at ${slideshowPath}`);

  const outDir = path.dirname(slideshowPath);
  const outPath = path.join(outDir, `ultra_${Date.now()}.mp4`);

  const args = [
    "-y",
    "-i", openingPath,     // input 0: Veo opener (silent)
    "-i", slideshowPath,   // input 1: slideshow (carries the voice)
    "-filter_complex",
    // 1) Normalise both video streams to 1080p 30fps + stereo 44.1k.
    "[0:v]scale=1920:1080:force_original_aspect_ratio=decrease," +
    "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v0];" +
    "[1:v]scale=1920:1080:force_original_aspect_ratio=decrease," +
    "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v1];" +
    // 2) Concat video only — audio comes from the slideshow track
    //    standalone so it starts at t=0 instead of after the opener.
    "[v0][v1]concat=n=2:v=1:a=0[outv];" +
    // 3) Pull slideshow voice, normalise, reset PTS to 0, and pad
    //    with silence to infinity so the output isn't cut short.
    "[1:a]aresample=44100,aformat=channel_layouts=stereo," +
    "asetpts=PTS-STARTPTS,apad[outa]",
    "-map", "[outv]", "-map", "[outa]",
    "-shortest",  // audio is infinite via apad; this clamps to the video length
    "-c:v", "libx264", "-preset", "fast", "-crf", "22",
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    outPath,
  ];
  await new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", args);
    let stderr = "";
    ff.stderr.on("data", (d) => { stderr += d.toString(); });
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg concat failed (${code}): ${stderr.slice(-600)}`));
    });
  });
  return outPath;
}

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
    throw new Error("إعدادات خدمة الإنتاج السينمائي غير مكتملة على الخادم — تواصل مع الدعم.");
  }
  if (!Array.isArray(imageUrls) || imageUrls.length < 2) {
    throw new Error("الإنتاج السينمائي الخارق يحتاج صورتين على الأقل — الأولى للقطة AI الافتتاحية والباقي للسلايد شو الكامل بالصوت.");
  }

  // Multi-stage progress reporter. Caller may not pass one — guard with
  // a no-op so we never crash on a missing callback.
  const onProgress = typeof listingData?.onProgress === "function"
    ? listingData.onProgress
    : () => {};
  // 4 visible stages: 1/4 Veo, 2/4 Voice+Slideshow, 3/4 Merge, 4/4 Upload.
  onProgress({
    stage: "veo_starting",
    stageLabel: "1/4 — توليد اللقطة السينمائية الافتتاحية",
    stageIndex: 1,
    stageTotal: 4,
    percent: 2,
  });

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
  if (!apiKey) throw new Error("إعدادات خدمة الإنتاج السينمائي غير مكتملة على الخادم — تواصل مع الدعم.");

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
      // Max duration for Veo 2.0 generate-001 is 8 s. Longer clips
      // can be composed by concatenating with the FFmpeg slideshow
      // below, which carries voice narration and all the listing
      // photos — the Veo clip is just the cinematic opener.
      durationSeconds: 8,
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
  // Veo takes 3-8 minutes. Ramp the progress percent inside this stage
  // from 5 -> 55 over the expected window so the bar visibly creeps
  // forward even while Google is still grinding.
  const VEO_PROGRESS_FLOOR = 5;
  const VEO_PROGRESS_CEIL = 55;
  while (!result.done && Date.now() - pollStart < MAX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    // Estimate progress as elapsed / 5 minutes (the median Veo time),
    // clamped to the ceiling so we never claim "done" prematurely.
    const elapsedMs = Date.now() - pollStart;
    const veoPct = VEO_PROGRESS_FLOOR + Math.min(
      VEO_PROGRESS_CEIL - VEO_PROGRESS_FLOOR,
      Math.floor((elapsedMs / (5 * 60 * 1000)) * (VEO_PROGRESS_CEIL - VEO_PROGRESS_FLOOR))
    );
    onProgress({
      stage: "veo_polling",
      stageLabel: "1/4 — صناعة اللقطة السينمائية AI",
      stageIndex: 1,
      stageTotal: 4,
      percent: veoPct,
    });
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
    throw new Error("انتهت المهلة قبل اكتمال اللقطة السينمائية الافتتاحية (>8 دقائق). أعد المحاولة.");
  }
  if (result.error) {
    throw new Error(`Veo أرجع خطأ بعد الاكتمال: ${JSON.stringify(result.error)}`);
  }
  // The completed response shape from :predictLongRunning differs
  // from the older :generateVideos shape. Veo's actual payload sits
  // at one of these paths — try each in order:
  //   1. result.response.generatedVideos        (Vertex / older shape)
  //   2. result.response.generated_videos       (snake_case variant)
  //   3. result.response.generateVideoResponse.generatedSamples
  //   4. result.response.generateVideoResponse.generated_samples
  //   5. result.response.predictions
  //   6. result.response.candidates
  //   7. result.response.samples
  const resp = result.response || {};
  const candidates =
    resp.generatedVideos ||
    resp.generated_videos ||
    resp.generateVideoResponse?.generatedSamples ||
    resp.generateVideoResponse?.generated_samples ||
    resp.generate_video_response?.generated_samples ||
    resp.predictions ||
    resp.candidates ||
    resp.samples ||
    [];

  // Recursively walk the response tree to find any URI to a video.
  // Belt-and-braces — if Google changes the wrapper again the URL
  // still gets picked up so the orchestrator doesn't 500 silently.
  const sniffUri = (node, depth = 0) => {
    if (!node || depth > 6) return null;
    if (typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (const item of node) {
        const u = sniffUri(item, depth + 1);
        if (u) return u;
      }
      return null;
    }
    for (const key of ["uri", "url", "videoUri", "video_uri"]) {
      const v = node[key];
      if (typeof v === "string" && /^https?:\/\//.test(v) && /\.mp4|video|veo|generativelanguage/i.test(v)) {
        return v;
      }
    }
    for (const key of Object.keys(node)) {
      const u = sniffUri(node[key], depth + 1);
      if (u) return u;
    }
    return null;
  };

  let videoUri = null;
  if (candidates.length > 0) {
    const first = candidates[0];
    const videoData = first.video || first;
    videoUri = videoData?.uri || videoData?.url || videoData?.videoUri || sniffUri(first);
  }
  if (!videoUri) videoUri = sniffUri(resp);

  if (!videoUri) {
    // Surface the EXACT response keys we got, plus a 4000-char raw
    // sample, so the next failure tells us where Google parked the
    // video.
    const responseShape = {
      top_level_keys: Object.keys(resp),
      response_dot_response_keys: resp.response ? Object.keys(resp.response) : null,
      raw_truncated: JSON.stringify(resp).slice(0, 4000),
    };
    console.error("[Ultra/Veo] ❌ no video URI found — response shape:", JSON.stringify(responseShape));
    const err = new Error("لم نتمكّن من استلام اللقطة السينمائية من خدمة الإنتاج. تواصل مع الدعم — التفاصيل التقنية متاحة في الـ diagnostic.");
    err.diagnostic = {
      stage: "extract_video_uri",
      operation_name: operation?.name,
      response_shape: responseShape,
      candidates_found: candidates.length,
    };
    throw err;
  }

  // ─── Step 1 complete: Veo opening clip ready. Download to temp. ───
  const tempDir = path.join(os.tmpdir(), "ultra-veo");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const veoPath = path.join(tempDir, `veo_${listingId}_${Date.now()}.mp4`);
  await downloadVeoVideo(videoUri, apiKey, veoPath);
  console.log(`[Ultra/Veo] ✅ Opening clip downloaded (${(fs.statSync(veoPath).size / 1024 / 1024).toFixed(2)} MB)`);
  onProgress({
    stage: "veo_complete",
    stageLabel: "1/4 — اكتملت اللقطة السينمائية الافتتاحية",
    stageIndex: 1,
    stageTotal: 4,
    percent: 60,
  });

  // ─── Step 2: FFmpeg slideshow on the FULL image set + voice. ──────
  // Mirrors the Luxury hybrid pipeline. The Veo clip is just the
  // 8-second cinematic opener; the slideshow carries narration and
  // walks through every listing photo.
  if (!(await ffmpegAvailable())) {
    try { fs.unlinkSync(veoPath); } catch {}
    throw new Error("محرّك الدمج السينمائي غير متاح على الخادم — تواصل مع الدعم.");
  }
  console.log(`[Ultra/Veo] 🎬 Generating FFmpeg slideshow on ${imageUrls.length} images + voice…`);
  onProgress({
    stage: "slideshow",
    stageLabel: "2/4 — توليد السلايد شو والتعليق الصوتي",
    stageIndex: 2,
    stageTotal: 4,
    percent: 65,
  });
  const { generateListingSlideshow } = require("./videoService");
  const slideshowResult = await generateListingSlideshow(listingId, imageUrls, listingData);
  const slideshowUrl =
    slideshowResult?.url || (typeof slideshowResult === "string" ? slideshowResult : null);
  if (!slideshowUrl) {
    try { fs.unlinkSync(veoPath); } catch {}
    throw new Error("فشل توليد سلايد شو FFmpeg في مسار Ultra.");
  }
  console.log(`[Ultra/Veo] ✅ Slideshow URL: ${slideshowUrl}`);
  onProgress({
    stage: "slideshow_complete",
    stageLabel: "2/4 — اكتمل السلايد شو",
    stageIndex: 2,
    stageTotal: 4,
    percent: 80,
  });

  // ─── Step 3: Download slideshow + concat with Veo opener. ─────────
  const slideshowPath = await downloadToTemp(slideshowUrl, ".mp4");
  console.log(`[Ultra/Veo] 🧵 Concatenating Veo opener + slideshow…`);
  onProgress({
    stage: "merge",
    stageLabel: "3/4 — دمج اللقطتين",
    stageIndex: 3,
    stageTotal: 4,
    percent: 85,
  });
  let stitchedPath = null;
  let finalUrl = null;
  try {
    stitchedPath = await concatVideosWithFfmpeg(veoPath, slideshowPath);

    // ─── Step 4: Upload stitched final to Cloudinary. ───────────────
    onProgress({
      stage: "upload",
      stageLabel: "4/4 — رفع الفيديو النهائي",
      stageIndex: 4,
      stageTotal: 4,
      percent: 92,
    });
    const folder = `listings/${listingId}/promo/ultra`;
    const uploadResult = await cloudinaryService.uploadVideo(stitchedPath, folder);
    if (!uploadResult?.success || !uploadResult.url) {
      throw new Error(uploadResult?.error || "فشل رفع الفيديو الفاخر إلى Cloudinary");
    }
    finalUrl = uploadResult.url;

    if (!String(listingId).startsWith("temp_")) {
      await db
        .query(`UPDATE properties SET video_status = 'ready', video_url = $1 WHERE id = $2`, [finalUrl, listingId])
        .catch((e) => console.warn("[Ultra/Veo] DB update failed:", e.message));
    }
  } finally {
    // Cleanup all temp files no matter what.
    for (const p of [veoPath, slideshowPath, stitchedPath]) {
      if (p) {
        try { fs.unlinkSync(p); } catch {}
      }
    }
  }

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`[Ultra/Veo] 🏁 Done in ${elapsedSec}s — ${finalUrl}`);

  return {
    url: finalUrl,
    promoText: slideshowResult?.promoText || null,
    veoOpeningUri: videoUri,
    slideshowUrl,
    tier: "luxury",  // engine swap (June 2026): this orchestrator now powers Luxury
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
