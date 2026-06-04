/**
 * Video Cleanup Service — FFmpeg-only cinematic post-processing.
 *
 * Track B of the video pipeline (Track A is the image-based 3-tier AI
 * stack). Customer uploads a phone video; we polish it without any AI
 * regeneration cost:
 *
 *   stabilise (deshake)
 *      → denoise (hqdn3d)
 *      → sharpen (unsharp)
 *      → cinematic color grade (curves + colorbalance + eq, teal/orange)
 *      → letterbox to 2.35:1
 *      → narration audio overlay from t=0 (reuses slideshow's voice track)
 *      → premium text overlays (title + price, Amiri font, fade in/out)
 *      → Cloudinary upload
 *
 * Cost: ~$0.005 per video (just ElevenLabs voice). Time: 30-90 s.
 *
 * Deliberately stays inside built-in FFmpeg filters (deshake, hqdn3d,
 * unsharp, curves, colorbalance, eq) so it works on every standard
 * FFmpeg build — no need for vidstab or external LUT files.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const axios = require("axios");
const { spawn } = require("child_process");
const { promisify } = require("util");
const stream = require("stream");
const pipeline = promisify(stream.pipeline);

const cloudinaryService = require("./cloudinaryService");
const db = require("../db");
const {
  addTextOverlays,
  buildOverlayPlan,
  overlayVoiceOnVideo,
} = require("./luxuryVideoOrchestrator");

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
  const tempDir = path.join(os.tmpdir(), "cleanup-video");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const dest = path.join(tempDir, `cleanup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${suffix}`);
  const res = await axios.get(url, { responseType: "stream", timeout: 180000 });
  await pipeline(res.data, fs.createWriteStream(dest));
  return dest;
}

// Validate the final MP4 is actually playable: confirm there's a
// video stream with a non-zero duration. Cloudinary will happily
// upload a malformed file; the browser then says "corrupt". This
// check catches it before upload so we can fail with a clear error.
async function validatePlayableMp4(videoPath) {
  return new Promise((resolve) => {
    const ff = spawn("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=codec_name,width,height:format=duration",
      "-of", "default=noprint_wrappers=1:nokey=0",
      videoPath,
    ]);
    let out = "", err = "";
    ff.stdout.on("data", (d) => (out += d.toString()));
    ff.stderr.on("data", (d) => (err += d.toString()));
    ff.on("close", (code) => {
      if (code !== 0) {
        resolve({ ok: false, reason: `ffprobe exit ${code}: ${err.slice(-200)}` });
        return;
      }
      const hasCodec = /codec_name=h264|hevc|h265/i.test(out);
      const durMatch = out.match(/duration=([0-9.]+)/);
      const duration = durMatch ? parseFloat(durMatch[1]) : 0;
      const sizeBytes = (() => { try { return fs.statSync(videoPath).size; } catch { return 0; } })();
      if (!hasCodec) return resolve({ ok: false, reason: "no playable video stream", probe: out });
      if (duration < 0.5) return resolve({ ok: false, reason: `duration too short (${duration}s)`, probe: out });
      if (sizeBytes < 10_000) return resolve({ ok: false, reason: `file too small (${sizeBytes} bytes)`, probe: out });
      resolve({ ok: true, duration, sizeBytes, probe: out });
    });
    ff.on("error", (e) => resolve({ ok: false, reason: `ffprobe spawn: ${e.message}` }));
  });
}

async function probeDuration(videoPath) {
  return new Promise((resolve) => {
    const ff = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      videoPath,
    ]);
    let out = "";
    ff.stdout.on("data", (d) => (out += d.toString()));
    ff.on("close", () => {
      const sec = parseFloat(out.trim());
      resolve(Number.isFinite(sec) && sec > 0 ? sec : 30);
    });
    ff.on("error", () => resolve(30));
  });
}

// ─────────────────────────────────────────────────────────────────
// The cinematic visual pass. Single FFmpeg invocation chains every
// built-in filter so we re-encode once, not multiple times.
//
//   deshake             — stabilise mild hand-shake (built-in)
//   hqdn3d              — high-quality temporal denoise
//   unsharp             — sharpen edges back after denoise
//   curves              — Hollywood-style contrast S-curve
//   colorbalance        — push shadows teal, highlights warm orange
//   eq                  — bump saturation + small contrast nudge
//   crop+pad letterbox  — 2.35:1 cinematic aspect with black bars
//   scale + fps         — normalise to 1920x1080 30fps for join
// ─────────────────────────────────────────────────────────────────
async function applyCinematicGrade(inputPath, outputPath) {
  // Visual filter chain — REAL ESTATE optimised (June 2026).
  // Owner feedback after first run: 'too dark, no real change'.
  // Reworked to LIFT exposure instead of crushing blacks. Order:
  // denoise → sharpen → tone → subtle color → saturation → letterbox.
  //
  // The Hollywood teal/orange was too aggressive — real estate
  // viewers want to see the actual property colours, just brighter
  // and crisper. So now:
  //   - eq lifts brightness/gamma so dark phone footage looks naturally lit
  //   - colorbalance is SUBTLE (warm highlights only, no teal shadows)
  //   - hue saturation bump for vibrant but realistic colour
  //   - vignette adds a cinematic edge fall-off
  const visual = [
    "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30",
    "deshake=rx=16:ry=16",
    "hqdn3d=2:1:4:3",                         // lighter denoise — keep detail
    "unsharp=5:5:1.2:5:5:0.0",                // bit more edge punch
    // Lift exposure + lift midtones + warm slightly. Brightens dark
    // phone footage without crushing highlights.
    "eq=brightness=0.06:gamma=1.12:saturation=1.25:contrast=1.06",
    // Subtle warm grade — slightly warm highlights, no teal shadow
    // crush. Real estate looks better warm than cold.
    "colorbalance=rh=0.06:gh=0.03:bh=-0.02",
    "vignette=PI/5",                          // soft cinematic edge darkening
    // 2.35:1 cinematic letterbox: crop the middle 85% vertically,
    // then pad back to 1080 height with black top/bottom.
    "crop=iw:ih*0.85:0:ih*0.075,pad=iw:1080:0:(1080-ih)/2:black",
  ].join(",");

  const args = [
    "-y",
    "-i", inputPath,
    "-vf", visual,
    // Keep input audio for now (if any). Voice overlay step replaces
    // it cleanly later.
    // Constant framerate + universal pixel format protects against
    // browser "corrupt" errors on phone-camera / WhatsApp inputs.
    "-vsync", "cfr", "-r", "30",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-ac", "2",
    "-movflags", "+faststart",
    outputPath,
  ];

  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", args);
    let stderr = "";
    ff.stderr.on("data", (d) => (stderr += d.toString()));
    ff.on("close", (code) => {
      if (code === 0 && fs.existsSync(outputPath)) resolve(outputPath);
      else reject(new Error(`cinematic grade failed (${code}): ${stderr.slice(-600)}`));
    });
  });
}

/**
 * Main entry. Caller in routes/ai.js has already verified:
 *   - the customer is auth'd
 *   - seedVideoUrl points to their uploaded Cloudinary asset
 *
 * Returns: { url, durationSeconds, mode: "video_cleanup" }
 */
async function generateCleanupVideo(listingId, seedVideoUrl, listingData = {}) {
  if (!seedVideoUrl || typeof seedVideoUrl !== "string") {
    throw new Error("التنظيف السينمائي يحتاج رابط فيديو مرفوع.");
  }
  if (!(await ffmpegAvailable())) {
    throw new Error("محرّك التنظيف السينمائي غير متاح على الخادم — تواصل مع الدعم.");
  }

  const onProgress = typeof listingData?.onProgress === "function"
    ? listingData.onProgress
    : () => {};

  const startedAt = Date.now();
  console.log(`[Cleanup] ▶️  Cinematic cleanup for listing ${listingId}`);

  // 4-stage progress for the UI's existing N/M stage bar.
  onProgress({
    stage: "cleanup_download",
    stageLabel: "1/4 — تنزيل الفيديو المرفوع",
    stageIndex: 1,
    stageTotal: 4,
    percent: 5,
  });

  // ─── Step 1: Download the seed video to disk. ──────────────────
  const seedPath = await downloadToTemp(seedVideoUrl, ".mp4");
  const probedSec = await probeDuration(seedPath);
  console.log(`[Cleanup] ✅ downloaded ${(fs.statSync(seedPath).size / 1024 / 1024).toFixed(2)} MB, ${probedSec.toFixed(1)} s`);

  // ─── Step 2: Cinematic visual pass. ────────────────────────────
  onProgress({
    stage: "cleanup_grade",
    stageLabel: "2/4 — تثبيت + تدرّج لوني سينمائي",
    stageIndex: 2,
    stageTotal: 4,
    percent: 30,
  });
  const outDir = path.dirname(seedPath);
  const gradedPath = path.join(outDir, `graded_${Date.now()}.mp4`);
  await applyCinematicGrade(seedPath, gradedPath);
  console.log(`[Cleanup] ✅ visual grade applied: ${gradedPath}`);

  // ─── Step 3: Add voice narration + text overlays. ─────────────
  // We reuse the slideshow service to generate the narration audio
  // track. Its output video is discarded; we only want the voice.
  // Need at least 2 images for the slideshow service — fall back to
  // a "no voice" path if the customer didn't provide images at all.
  onProgress({
    stage: "cleanup_voice",
    stageLabel: "3/4 — توليد التعليق الصوتي والعناوين",
    stageIndex: 3,
    stageTotal: 4,
    percent: 60,
  });

  // Voice narration: cleanup mode no longer requires uploaded images.
  // We generate the script directly from listingData and call
  // ElevenLabs TTS — same pipeline the slideshow service uses, just
  // skipping the slideshow video output. Result is a standalone
  // MP3 we mux on top of the graded video.
  //
  // Two real bugs fixed in the previous attempt:
  //   1. elevenLabsTTSToMp3() returns a FILE PATH (string), not a
  //      Buffer. The old code did .then((buf) => writeFileSync(buf))
  //      which wrote the path STRING as bytes into a new file —
  //      producing a 30-byte "mp3" that broke the whole overlay
  //      step.
  //   2. The function rejects when voiceId is < 10 chars. The
  //      cleanup UI was sending OpenAI voice names (4-6 chars)
  //      which made the call throw immediately. We now apply the
  //      same length check the slideshow service uses, and skip
  //      narration gracefully if no valid Eleven ID is present.
  let withVoicePath = gradedPath;
  let voiceMp3Path = null;
  try {
    const { elevenLabsTTSToMp3 } = require("./videoService");
    const { generateDynamicPromoText, generatePromotionalText } = require("../routes/ai");

    const maybeElevenId = String(listingData?.elevenlabsVoiceId || "").trim();
    const voiceFromUi = String(listingData?.voice || "").trim();
    const chosenElevenId =
      maybeElevenId.length >= 10
        ? maybeElevenId
        : voiceFromUi.length >= 10
          ? voiceFromUi
          : "";

    if (!chosenElevenId) {
      console.log("[Cleanup] ℹ️ no ElevenLabs voice ID — skipping narration (will ship silent).");
    } else {
      let voiceScript = "";
      try {
        const promo = await generateDynamicPromoText(listingData);
        voiceScript =
          promo?.voiceScript ||
          promo?._voiceScript ||
          [promo?.headline, promo?.subheadline, promo?.callToAction].filter(Boolean).join(" — ");
      } catch (e) {
        console.warn("[Cleanup] dynamic promo text failed, using deterministic:", e.message);
      }
      if (!voiceScript) {
        const t = generatePromotionalText(
          listingData?.propertyType,
          listingData?.purpose,
          listingData?.city,
          listingData?.district,
          listingData?.price
        );
        voiceScript = [t?.headline, t?.subheadline, t?.callToAction].filter(Boolean).join(" — ");
      }
      if (voiceScript && voiceScript.trim().length > 0) {
        // elevenLabsTTSToMp3 writes to its own temp path and RETURNS
        // that path. Use it directly — don't rewrap it.
        voiceMp3Path = await elevenLabsTTSToMp3(voiceScript.slice(0, 800), chosenElevenId);
        withVoicePath = path.join(outDir, `voiced_${Date.now()}.mp4`);
        // loopVideo:true → if the customer's phone clip is shorter
        // than the narration (the common case for 8-15 s WhatsApp
        // clips with a 25 s script), the video loops seamlessly so
        // every word gets a frame. Output ends at narration end.
        await overlayVoiceOnVideo(gradedPath, voiceMp3Path, withVoicePath, { loopVideo: true });
        console.log("[Cleanup] ✅ ElevenLabs narration overlaid:", withVoicePath);
      }
    }
  } catch (e) {
    // Voice is enhancement, not blocker. Ship the graded silent video
    // if narration fails for any reason.
    console.warn("[Cleanup] ⚠️ voice narration skipped:", e.message);
    // Reset withVoicePath in case the overlay step exploded mid-way
    // and left a partial file.
    withVoicePath = gradedPath;
  }

  // Legacy fallback: if customer happened to upload images too, the
  // slideshow path can still feed voice as well. Kept for back-compat.
  const sampleImages = Array.isArray(listingData?.imageUrls) ? listingData.imageUrls : [];
  if (withVoicePath === gradedPath && sampleImages.length >= 2) {
    try {
      const { generateListingSlideshow } = require("./videoService");
      const slideshowResult = await generateListingSlideshow(listingId, sampleImages.slice(0, 4), listingData);
      const voiceSourceUrl =
        slideshowResult?.url || (typeof slideshowResult === "string" ? slideshowResult : null);
      if (voiceSourceUrl) {
        const voiceSourcePath = await downloadToTemp(voiceSourceUrl, ".mp4");
        withVoicePath = path.join(outDir, `voiced_${Date.now()}.mp4`);
        await overlayVoiceOnVideo(gradedPath, voiceSourcePath, withVoicePath);
        try { fs.unlinkSync(voiceSourcePath); } catch {}
      }
    } catch (e) {
      console.warn(`[Cleanup] ⚠️ voice overlay skipped: ${e.message}`);
    }
  }

  // Title + price overlays — best-effort like in Ultra.
  // Use the ACTUAL voiced-video duration for overlay timing — not
  // the source phone-clip duration. After looping, the output is
  // roughly the narration length; pricing the outro overlay against
  // the original 8 s phone clip would land it at t≈2 s instead of
  // the actual finish.
  const voicedDurationSec = await probeDuration(withVoicePath).catch(() => probedSec);
  const overlayDuration = Math.max(voicedDurationSec, 5);
  console.log(`[Cleanup] overlay timing budget: ${overlayDuration.toFixed(1)}s (source=${probedSec.toFixed(1)}s, voiced=${voicedDurationSec.toFixed(1)}s)`);
  const overlays = buildOverlayPlan(listingData, overlayDuration);
  const finalPath = path.join(outDir, `cleanup_final_${Date.now()}.mp4`);
  try {
    await addTextOverlays(withVoicePath, overlays, finalPath);
  } catch (e) {
    console.warn(`[Cleanup] ⚠️ overlay failed, shipping unoverlaid: ${e.message}`);
    fs.copyFileSync(withVoicePath, finalPath);
  }

  // ─── Validate before upload ──────────────────────────────────
  // ffprobe the output — codec + duration + file size. If anything
  // is off (browser would say "corrupt"), throw a clear error
  // instead of shipping a broken file the customer can't play.
  const probe = await validatePlayableMp4(finalPath);
  if (!probe.ok) {
    console.error("[Cleanup] ❌ output failed validation:", probe.reason, probe.probe || "");
    throw new Error(
      `الفيديو الناتج غير صالح للمعاينة (${probe.reason}). جرّب فيديو بصيغة MP4 قياسية أو تواصل مع الدعم.`
    );
  }
  console.log(`[Cleanup] ✅ output valid: ${probe.duration?.toFixed(1)}s, ${(probe.sizeBytes / 1024 / 1024).toFixed(2)} MB`);

  // ─── Step 4: Upload to Cloudinary + persist on the listing row.
  onProgress({
    stage: "cleanup_upload",
    stageLabel: "4/4 — رفع الفيديو النهائي",
    stageIndex: 4,
    stageTotal: 4,
    percent: 90,
  });
  let finalUrl = null;
  try {
    const folder = `listings/${listingId}/promo/cleanup`;
    const uploadResult = await cloudinaryService.uploadVideo(finalPath, folder);
    if (!uploadResult?.success || !uploadResult.url) {
      throw new Error(uploadResult?.error || "فشل رفع الفيديو النهائي إلى Cloudinary");
    }
    finalUrl = uploadResult.url;

    if (!String(listingId).startsWith("temp_")) {
      await db
        .query(`UPDATE properties SET video_status = 'ready', video_url = $1 WHERE id = $2`, [finalUrl, listingId])
        .catch((e) => console.warn("[Cleanup] DB update failed:", e.message));
    }
  } finally {
    // Cleanup ALL temp files.
    for (const p of [seedPath, gradedPath, withVoicePath, voiceMp3Path, finalPath]) {
      if (p) {
        try { fs.unlinkSync(p); } catch {}
      }
    }
  }

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`[Cleanup] 🏁 done in ${elapsedSec}s — ${finalUrl}`);

  return {
    url: finalUrl,
    mode: "video_cleanup",
    durationSeconds: parseFloat(elapsedSec),
    sourceDurationSeconds: probedSec,
    costEstimateUsd: "0.005",  // ElevenLabs voice only; FFmpeg is free
  };
}

module.exports = {
  generateCleanupVideo,
  applyCinematicGrade,
};
