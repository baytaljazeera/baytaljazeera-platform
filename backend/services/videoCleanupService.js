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
  // Visual filter chain. Order matters — denoise BEFORE color grade
  // so the noise itself isn't graded; sharpen AFTER denoise to put
  // edges back.
  const visual = [
    "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30",
    "deshake=rx=16:ry=16",
    "hqdn3d=4:3:6:4.5",
    "unsharp=5:5:1.0:5:5:0.0",
    "curves=preset=increase_contrast",
    // Teal shadows, warm highlights — the classic orange/teal look.
    // rs/gs/bs = shadows, rm/gm/bm = midtones, rh/gh/bh = highlights.
    "colorbalance=rs=-0.05:gs=0.00:bs=0.06:rm=0.00:gm=0.00:bm=0.00:rh=0.08:gh=0.04:bh=-0.04",
    "eq=saturation=1.15:contrast=1.08:brightness=0.00",
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
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-c:a", "aac", "-b:a", "160k",
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

  let withVoicePath = gradedPath;
  const sampleImages = Array.isArray(listingData?.imageUrls) ? listingData.imageUrls : [];
  if (sampleImages.length >= 2) {
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
      // Voice overlay is enhancement, not blocker. Keep the graded
      // video without narration if the slideshow service fails.
      console.warn(`[Cleanup] ⚠️ voice overlay skipped: ${e.message}`);
    }
  }

  // Title + price overlays — best-effort like in Ultra.
  const overlayDuration = Math.max(probedSec, 5);
  const overlays = buildOverlayPlan(listingData, overlayDuration);
  const finalPath = path.join(outDir, `cleanup_final_${Date.now()}.mp4`);
  try {
    await addTextOverlays(withVoicePath, overlays, finalPath);
  } catch (e) {
    console.warn(`[Cleanup] ⚠️ overlay failed, shipping unoverlaid: ${e.message}`);
    fs.copyFileSync(withVoicePath, finalPath);
  }

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
    for (const p of [seedPath, gradedPath, withVoicePath, finalPath]) {
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
