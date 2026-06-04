/**
 * Luxury (Hybrid) tier orchestrator — Tier 2 of the 3-tier video pipeline.
 *
 *   1) Replicate (image-to-video, e.g. pixverse v3.5) generates a real 5-second
 *      AI camera move from the listing's first image.
 *   2) The existing FFmpeg slideshow pipeline (videoService.generateListingSlideshow)
 *      renders the rest of the listing photos with Ken Burns + ElevenLabs voice.
 *   3) Both clips are downloaded and concatenated locally with FFmpeg, then the
 *      final stitched MP4 is uploaded to Cloudinary and the listing row updated.
 *
 * The standard FFmpeg path is unchanged. The ElevenLabs voice config is also
 * unchanged — voice still rides on top of the slideshow segment exactly as
 * before; the opening clip is silent (cinematic intro, then narration begins).
 */

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const { promisify } = require("util");
const stream = require("stream");
const pipeline = promisify(stream.pipeline);

const replicateVideoService = require("./replicateVideoService");
const cloudinaryService = require("./cloudinaryService");
const db = require("../db");

function ffmpegAvailable() {
  // videoService already exports/tests this on startup. We re-check here so that
  // a hybrid call without ffmpeg fails loudly before burning a Replicate credit.
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
  const tempDir = path.join(os.tmpdir(), "luxury-video");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const dest = path.join(tempDir, `lx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${suffix}`);
  const res = await axios.get(url, { responseType: "stream", timeout: 120000 });
  await pipeline(res.data, fs.createWriteStream(dest));
  return dest;
}

function buildOpeningPrompt(listingData) {
  const ptype = listingData.propertyType || listingData.type || "luxury property";
  const city = listingData.city || "";
  const purpose = listingData.purpose === "إيجار" ? "for rent" : "for sale";
  const features = [];
  if (listingData.hasPool) features.push("with pool");
  if (listingData.hasGarden) features.push("with garden");
  const featureStr = features.join(" ");
  // English prompts work better with image-to-video models. Aim for slow,
  // gimbal-stabilized push-in — the only style that universally suits real estate.
  return [
    "cinematic slow camera push-in",
    `luxurious ${ptype} ${purpose}${city ? " in " + city : ""}`,
    featureStr,
    "warm golden-hour lighting, ultra-realistic, premium architecture",
    "smooth gimbal-stabilized motion, shallow depth of field, no people, no text",
  ]
    .filter(Boolean)
    .join(", ");
}

// Each scene gets a SLIGHTLY different camera move so the final video
// doesn't feel like 5 copies of the same push-in. Cycles through 5
// premium real-estate motion styles.
const SCENE_MOTIONS = [
  "slow cinematic push-in, gimbal-stabilized",
  "smooth left-to-right dolly across the room",
  "slow upward tilt revealing the ceiling and full height",
  "gentle orbital rotation around the focal subject",
  "slow pull-out reveal showing the wider space",
];

function buildScenePrompt(listingData, sceneIndex) {
  const motion = SCENE_MOTIONS[sceneIndex % SCENE_MOTIONS.length];
  const ptype = listingData.propertyType || listingData.type || "luxury property";
  const city = listingData.city || "";
  const features = [];
  if (listingData.hasPool) features.push("with pool");
  if (listingData.hasGarden) features.push("with garden");
  const featureStr = features.join(" ");
  return [
    motion,
    `luxury ${ptype}${city ? " in " + city : ""}`,
    featureStr,
    "warm golden-hour lighting, ultra-realistic, premium architecture",
    "shallow depth of field, no people, no text, no watermark",
  ]
    .filter(Boolean)
    .join(", ");
}

// Concat N AI clips (any count) into a single MP4. Each input gets
// normalised to 1920x1080 30fps for a seamless join. Audio is dropped
// (AI clips are silent); narration is overlaid afterwards.
async function concatManyClipsWithFfmpeg(clipPaths, outPath) {
  if (!Array.isArray(clipPaths) || clipPaths.length === 0) {
    throw new Error("لا توجد لقطات للدمج.");
  }
  if (clipPaths.length === 1) {
    // Single-clip "concat" — just normalise + copy.
    const args = [
      "-y",
      "-i", clipPaths[0],
      "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
      "-an",
      "-movflags", "+faststart",
      outPath,
    ];
    return new Promise((resolve, reject) => {
      const ff = spawn("ffmpeg", args);
      let stderr = "";
      ff.stderr.on("data", (d) => (stderr += d.toString()));
      ff.on("close", (code) => {
        if (code === 0 && fs.existsSync(outPath)) resolve(outPath);
        else reject(new Error(`ffmpeg single-clip pass failed: ${stderr.slice(-500)}`));
      });
    });
  }

  // Build the filter graph for N clips:
  //   [0:v]scale...[v0];[1:v]scale...[v1];...
  //   [v0][v1][v2][...]concat=n=N:v=1:a=0[outv]
  const inputArgs = [];
  for (const p of clipPaths) {
    inputArgs.push("-i", p);
  }
  const normalise = clipPaths
    .map(
      (_, i) =>
        `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${i}]`
    )
    .join(";");
  const concat = clipPaths.map((_, i) => `[v${i}]`).join("") +
    `concat=n=${clipPaths.length}:v=1:a=0[outv]`;
  const filter = normalise + ";" + concat;

  const args = [
    "-y",
    ...inputArgs,
    "-filter_complex", filter,
    "-map", "[outv]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
    "-an",
    "-movflags", "+faststart",
    outPath,
  ];
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", args);
    let stderr = "";
    ff.stderr.on("data", (d) => (stderr += d.toString()));
    ff.on("close", (code) => {
      if (code === 0 && fs.existsSync(outPath)) resolve(outPath);
      else reject(new Error(`ffmpeg N-clip concat failed (code ${code}): ${stderr.slice(-600)}`));
    });
  });
}

// Overlay a voice audio track on a silent video, padding silence at
// the end if voice is shorter than video. Voice starts at t=0.
async function overlayVoiceOnVideo(videoPath, voicePath, outPath) {
  const args = [
    "-y",
    "-i", videoPath,
    "-i", voicePath,
    "-filter_complex",
    "[1:a]aresample=44100,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS,apad[outa]",
    "-map", "0:v",
    "-map", "[outa]",
    "-shortest",
    "-c:v", "copy",
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    outPath,
  ];
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", args);
    let stderr = "";
    ff.stderr.on("data", (d) => (stderr += d.toString()));
    ff.on("close", (code) => {
      if (code === 0 && fs.existsSync(outPath)) resolve(outPath);
      else reject(new Error(`ffmpeg voice overlay failed (code ${code}): ${stderr.slice(-500)}`));
    });
  });
}

async function concatVideosWithFfmpeg(openingPath, slideshowPath) {
  if (!fs.existsSync(openingPath)) throw new Error(`opening clip missing at ${openingPath}`);
  if (!fs.existsSync(slideshowPath)) throw new Error(`slideshow clip missing at ${slideshowPath}`);

  const outDir = path.dirname(slideshowPath);
  const outPath = path.join(outDir, `hybrid_${Date.now()}.mp4`);

  // filter_complex re-encode — safest when input codecs/resolutions/framerates
  // differ between Replicate's MP4 and our FFmpeg output.
  // Audio is taken only from the slideshow track (opening clip is silent).
  const args = [
    "-y",
    "-i", openingPath,
    "-i", slideshowPath,
    "-filter_complex",
    "[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v0];" +
    "[1:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v1];" +
    "[v0][v1]concat=n=2:v=1:a=0[outv]",
    "-map", "[outv]",
    "-map", "1:a?",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "21",
    "-c:a", "aac",
    "-b:a", "160k",
    "-movflags", "+faststart",
    outPath,
  ];

  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", args);
    let stderr = "";
    ff.stderr.on("data", (d) => (stderr += d.toString()));
    ff.on("close", (code) => {
      if (code === 0 && fs.existsSync(outPath)) {
        resolve(outPath);
      } else {
        reject(new Error(`ffmpeg concat failed (code ${code}): ${stderr.slice(-600)}`));
      }
    });
  });
}

/**
 * Main entry — orchestrates the Luxury hybrid pipeline. Caller is responsible
 * for tier/quota/rate-limit checks (those live in routes/ai.js).
 *
 *   listingId   string — real listing UUID or `temp_<ts>` for ad-hoc generation.
 *   imageUrls   string[] — at least 2; first one is sent to Replicate.
 *   listingData object — same shape as videoService.generateListingSlideshow expects.
 *
 * Returns: { url, promoText, openingShotUrl, slideshowUrl, costEstimate }
 */
async function generateHybridLuxuryVideo(listingId, imageUrls, listingData) {
  // Owner decision (June 2026): the Ultra tier is FULL multi-scene AI.
  // Each listing image generates its own cinematic AI clip; they
  // concatenate into one polished video with narration laid over the
  // top from t=0. This is what justifies the premium price tag.
  if (!Array.isArray(imageUrls) || imageUrls.length < 2) {
    throw new Error("الإنتاج السينمائي الخارق يحتاج صورتين على الأقل لتوليد لقطات AI متعدّدة.");
  }
  if (!replicateVideoService.isConfigured()) {
    throw new Error("إعدادات خدمة الإنتاج السينمائي الخارق غير مكتملة على الخادم — تواصل مع الدعم.");
  }
  if (!(await ffmpegAvailable())) {
    throw new Error("محرّك الدمج السينمائي غير متاح على الخادم — تواصل مع الدعم.");
  }

  // Cost cap: each AI clip is ~\$0.30. We cap at 6 scenes so even a
  // listing with 20 photos doesn't burn \$6 on a single video. Owner
  // can raise this via env if desired.
  const MAX_SCENES = Number(process.env.ULTRA_MAX_SCENES) || 6;
  const scenes = imageUrls.slice(0, MAX_SCENES);

  const onProgress = typeof listingData?.onProgress === "function"
    ? listingData.onProgress
    : () => {};

  // Total stages: N AI clip generations + voice gen + concat + voice
  // overlay + upload = N + 4. We report stage indices accordingly.
  const stageTotal = scenes.length + 4;
  const startedAt = Date.now();
  console.log(`[Ultra] ▶️  Multi-scene AI pipeline — ${scenes.length} clips × ~\$0.30 each`);
  console.log(`[Ultra]    listingId=${listingId}, total stages=${stageTotal}`);

  onProgress({
    stage: "ultra_starting",
    stageLabel: `1/${stageTotal} — تحضير ${scenes.length} لقطات AI سينمائية`,
    stageIndex: 1,
    stageTotal,
    percent: 2,
  });

  // ─── Step 1..N: Generate one AI clip per image. ──────────────────
  //
  // Replicate rate-limits aggressive concurrent submissions with
  // 429 ("Too Many Requests"). To stay under it we run a SMALL
  // worker pool (default 2, env-tunable via ULTRA_REPLICATE_CONCURRENCY)
  // instead of firing all N at once via Promise.all. We also retry
  // each clip up to MAX_RETRIES on 429, sleeping using the
  // Retry-After header when Replicate provides one.
  //
  // Wall-clock at concurrency=2 for N=6 clips ≈ 3 batches × per-clip
  // time. Each clip takes 3-5 min on pixverse v3.5, so total ≈
  // 10-15 min. Acceptable for the premium tier.

  const CONCURRENCY = Number(process.env.ULTRA_REPLICATE_CONCURRENCY) || 2;
  const MAX_RETRIES = 3;

  // Per-clip generator with backoff on 429. Other errors bubble up
  // immediately so the whole pipeline fails fast on a real problem.
  const generateClipWithRetry = async (imgUrl, i) => {
    const prompt = buildScenePrompt(listingData, i);
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const url = await replicateVideoService.generateOpeningShot(imgUrl, {
          prompt,
          duration: 5,
          aspect_ratio: "16:9",
          quality: "720p",
          motion_mode: "smooth",
        });
        return url;
      } catch (e) {
        if (e?.replicate429 && attempt < MAX_RETRIES - 1) {
          // Back off: prefer the server's Retry-After hint, fall back
          // to exponential (15 s, 30 s, 60 s).
          const baseDelay = (e.retryAfterSec ? e.retryAfterSec : (15 * Math.pow(2, attempt))) * 1000;
          // Add small jitter so two scenes don't wake up simultaneously.
          const delayMs = baseDelay + Math.floor(Math.random() * 1500);
          console.warn(`[Ultra] ⏳ Clip ${i + 1}: 429 received — backing off ${Math.round(delayMs / 1000)} s (attempt ${attempt + 1}/${MAX_RETRIES})`);
          onProgress({
            stage: "ultra_rate_limited",
            stageLabel: `إبطاء مؤقت بسبب ازدحام الخدمة — إعادة المحاولة بعد ${Math.round(delayMs / 1000)} ث`,
            stageIndex: i + 1,
            stageTotal,
            percent: 5 + Math.round((i / scenes.length) * 55),
          });
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        throw e;
      }
    }
    throw new Error(`فشل توليد اللقطة رقم ${i + 1} بعد ${MAX_RETRIES} محاولات بسبب ازدحام الخدمة. حاول لاحقاً.`);
  };

  // Bounded-concurrency worker pool. Each worker pulls indices off
  // a shared queue and processes them in arrival order — output is
  // collected in `clipUrls` indexed by the original scene position.
  console.log(`[Ultra] 🎥 Generating ${scenes.length} AI clips at concurrency=${CONCURRENCY}…`);
  const clipUrls = new Array(scenes.length);
  let nextIdx = 0;
  let completed = 0;
  const worker = async () => {
    while (true) {
      const i = nextIdx++;
      if (i >= scenes.length) return;
      const url = await generateClipWithRetry(scenes[i], i);
      clipUrls[i] = url;
      completed += 1;
      const pct = 5 + Math.round((completed / scenes.length) * 55);
      onProgress({
        stage: "ultra_clip_done",
        stageLabel: `${completed}/${stageTotal} — اكتملت لقطة AI رقم ${completed} من ${scenes.length}`,
        stageIndex: completed,
        stageTotal,
        percent: pct,
      });
      console.log(`[Ultra] ✅ Clip ${completed}/${scenes.length}: ${url}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, scenes.length) }, worker));

  // ─── Step N+1: Generate the voice narration. ─────────────────────
  // We reuse videoService.generateListingSlideshow which produces a
  // slideshow video WITH narration audio baked in. We don't care
  // about the slideshow VIDEO — we extract its audio track for
  // overlay on the AI clips. This avoids duplicating the entire
  // ElevenLabs/OpenAI TTS plumbing.
  onProgress({
    stage: "ultra_voice",
    stageLabel: `${scenes.length + 1}/${stageTotal} — توليد التعليق الصوتي`,
    stageIndex: scenes.length + 1,
    stageTotal,
    percent: 65,
  });
  console.log("[Ultra] 🗣️  Generating narration via slideshow service…");
  const { generateListingSlideshow } = require("./videoService");
  const slideshowResult = await generateListingSlideshow(listingId, imageUrls, listingData);
  const voiceSourceUrl =
    slideshowResult?.url || (typeof slideshowResult === "string" ? slideshowResult : null);
  if (!voiceSourceUrl) {
    throw new Error("فشل توليد التعليق الصوتي للإنتاج السينمائي الخارق.");
  }

  // ─── Step N+2: Download every AI clip + the voice-source video. ──
  const clipPaths = await Promise.all(clipUrls.map((u) => downloadToTemp(u, ".mp4")));
  const voiceSourcePath = await downloadToTemp(voiceSourceUrl, ".mp4");

  // ─── Step N+3: Concat all AI clips (video only). ─────────────────
  onProgress({
    stage: "ultra_concat",
    stageLabel: `${scenes.length + 2}/${stageTotal} — دمج اللقطات السينمائية`,
    stageIndex: scenes.length + 2,
    stageTotal,
    percent: 80,
  });
  const outDir = path.dirname(voiceSourcePath);
  const concatPath = path.join(outDir, `ultra_concat_${Date.now()}.mp4`);
  await concatManyClipsWithFfmpeg(clipPaths, concatPath);
  console.log(`[Ultra] ✅ Concatenated ${clipPaths.length} clips into ${concatPath}`);

  // ─── Step N+4: Overlay narration on the concatenated video. ──────
  onProgress({
    stage: "ultra_voice_overlay",
    stageLabel: `${scenes.length + 3}/${stageTotal} — تركيب التعليق الصوتي`,
    stageIndex: scenes.length + 3,
    stageTotal,
    percent: 88,
  });
  const withVoicePath = path.join(outDir, `ultra_final_${Date.now()}.mp4`);
  await overlayVoiceOnVideo(concatPath, voiceSourcePath, withVoicePath);
  console.log("[Ultra] ✅ Voice overlaid:", withVoicePath);

  // ─── Step N+5: Upload to Cloudinary + persist on the listing row. ─
  onProgress({
    stage: "ultra_upload",
    stageLabel: `${stageTotal}/${stageTotal} — رفع الفيديو النهائي`,
    stageIndex: stageTotal,
    stageTotal,
    percent: 95,
  });
  let finalUrl = null;
  try {
    const folder = `listings/${listingId}/promo/ultra`;
    const uploadResult = await cloudinaryService.uploadVideo(withVoicePath, folder);
    if (!uploadResult?.success || !uploadResult.url) {
      throw new Error(uploadResult?.error || "فشل رفع الإنتاج السينمائي الخارق إلى Cloudinary");
    }
    finalUrl = uploadResult.url;

    if (!String(listingId).startsWith("temp_")) {
      await db
        .query(`UPDATE properties SET video_status = 'ready', video_url = $1 WHERE id = $2`, [finalUrl, listingId])
        .catch((e) => console.warn("[Ultra] DB update failed:", e.message));
    }
  } finally {
    // Best-effort cleanup of ALL temp files.
    for (const p of [...clipPaths, voiceSourcePath, concatPath, withVoicePath]) {
      if (p) {
        try { fs.unlinkSync(p); } catch {}
      }
    }
  }

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`[Ultra] 🏁 Multi-scene AI pipeline done in ${elapsedSec}s — ${finalUrl}`);

  return {
    url: finalUrl,
    promoText: slideshowResult?.promoText || null,
    aiClipUrls: clipUrls,
    sceneCount: scenes.length,
    tier: "ultra",  // engine swap (June 2026): Replicate-powered Ultra tier
    durationSeconds: parseFloat(elapsedSec),
    costEstimateUsd: (scenes.length * 0.3).toFixed(2),
  };
}

module.exports = {
  generateHybridLuxuryVideo,
  buildOpeningPrompt,
  buildScenePrompt,
  concatVideosWithFfmpeg,
  concatManyClipsWithFfmpeg,
  overlayVoiceOnVideo,
};
