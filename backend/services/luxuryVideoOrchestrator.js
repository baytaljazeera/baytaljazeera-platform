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
  if (!Array.isArray(imageUrls) || imageUrls.length < 2) {
    throw new Error("اللقطة الفاخرة تحتاج صورتين على الأقل (الأولى تذهب لـ Replicate، الباقي سلايد شو).");
  }
  if (!replicateVideoService.isConfigured()) {
    throw new Error("REPLICATE_API_TOKEN غير مضبوط. لا يمكن توليد لقطة افتتاحية فاخرة بدونه.");
  }
  if (!(await ffmpegAvailable())) {
    throw new Error("FFmpeg غير متاح على الخادم — مطلوب لدمج اللقطة الافتتاحية مع السلايد شو.");
  }

  const startedAt = Date.now();
  console.log(`[Luxury] ▶️  Starting hybrid pipeline for listing ${listingId}`);
  console.log(`[Luxury]    images=${imageUrls.length}, first=${imageUrls[0]}`);

  // 1) Opening cinematic shot via Replicate (image-to-video).
  console.log("[Luxury] 🎥 Step 1/4 — generating opening shot via Replicate…");
  const openingPrompt = buildOpeningPrompt(listingData);
  const openingUrl = await replicateVideoService.generateOpeningShot(imageUrls[0], {
    prompt: openingPrompt,
    duration: 5,
    aspect_ratio: "16:9",
    quality: "720p",
    motion_mode: "smooth",
  });
  console.log("[Luxury] ✅ Opening shot URL:", openingUrl);

  // 2) Standard FFmpeg slideshow on the FULL image set (ElevenLabs voice path unchanged).
  console.log("[Luxury] 🎬 Step 2/4 — rendering FFmpeg slideshow + voice on all images…");
  const { generateListingSlideshow } = require("./videoService");
  const slideshowResult = await generateListingSlideshow(listingId, imageUrls, listingData);
  const slideshowUrl = slideshowResult?.url || (typeof slideshowResult === "string" ? slideshowResult : null);
  if (!slideshowUrl) {
    throw new Error("فشل توليد سلايد شو FFmpeg في المسار الفاخر.");
  }
  console.log("[Luxury] ✅ Slideshow URL:", slideshowUrl);

  // 3) Download both clips locally so ffmpeg can stitch them.
  console.log("[Luxury] ⬇️  Step 3/4 — downloading both clips for local concat…");
  const openingPath = await downloadToTemp(openingUrl, ".mp4");
  const slideshowPath = await downloadToTemp(slideshowUrl, ".mp4");

  // 4) Concat with FFmpeg + upload final to Cloudinary.
  console.log("[Luxury] 🧵 Step 4/4 — concatenating and uploading final hybrid…");
  let stitchedPath = null;
  let finalUrl = null;
  try {
    stitchedPath = await concatVideosWithFfmpeg(openingPath, slideshowPath);
    const folder = `listings/${listingId}/promo/luxury`;
    const uploadResult = await cloudinaryService.uploadVideo(stitchedPath, folder);
    if (!uploadResult?.success || !uploadResult.url) {
      throw new Error(uploadResult?.error || "فشل رفع الفيديو الفاخر إلى Cloudinary");
    }
    finalUrl = uploadResult.url;

    if (!String(listingId).startsWith("temp_")) {
      await db
        .query(`UPDATE properties SET video_status = 'ready', video_url = $1 WHERE id = $2`, [finalUrl, listingId])
        .catch((e) => console.warn("[Luxury] DB update failed:", e.message));
    }
  } finally {
    // Best-effort cleanup of temp files regardless of success/failure.
    for (const p of [openingPath, slideshowPath, stitchedPath]) {
      if (p) {
        try { fs.unlinkSync(p); } catch {}
      }
    }
  }

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`[Luxury] 🏁 Hybrid pipeline done in ${elapsedSec}s — ${finalUrl}`);

  return {
    url: finalUrl,
    promoText: slideshowResult?.promoText || null,
    openingShotUrl: openingUrl,
    slideshowUrl,
    tier: "luxury",
    durationSeconds: parseFloat(elapsedSec),
  };
}

module.exports = {
  generateHybridLuxuryVideo,
  buildOpeningPrompt,
  concatVideosWithFfmpeg,
};
