/**
 * Replicate API — توليد فيديو سلايدشو من صور (بدون تحميل على سيرفرك، يقلل Timeout/OOM)
 * النموذج: lucataco/image-to-video-slideshow
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const stream = require('stream');
const pipeline = promisify(stream.pipeline);
const cloudinaryService = require('./cloudinaryService');

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const REPLICATE_MODEL = 'lucataco/image-to-video-slideshow';
// Image-to-video model used for the Luxury-tier "opening cinematic shot".
// pixverse v3.5 is affordable (~$0.20-0.40 per 5s 720p) and supports first-frame conditioning.
// Override via REPLICATE_OPENING_MODEL env var if you want to try kling/minimax/seedance.
const REPLICATE_OPENING_MODEL = process.env.REPLICATE_OPENING_MODEL || 'pixverse/pixverse-v3.5';
const REPLICATE_BASE = 'https://api.replicate.com/v1';

const REPLICATE_401_MSG = 'توكن Replicate غير صالح أو غير مضبوط. تحقق من REPLICATE_API_TOKEN في Environment على Render.';
const REPLICATE_402_MSG = 'حساب Replicate يحتاج رصيد أو تفعيل الدفع. تحقق من replicate.com أو سيتم المحاولة بالطريقة البديلة.';

function isConfigured() {
  return !!REPLICATE_API_TOKEN;
}

function wrapReplicateErr(err) {
  const status = err.response?.status;
  const msg = err.message || '';
  if (status === 401 || (msg && msg.includes('401'))) {
    throw new Error(REPLICATE_401_MSG);
  }
  if (status === 402 || (msg && msg.includes('402'))) {
    throw new Error(REPLICATE_402_MSG);
  }
  throw err;
}

async function getLatestVersion(modelSlug = REPLICATE_MODEL) {
  const [owner, name] = modelSlug.split('/');
  try {
    const { data } = await axios.get(
      `${REPLICATE_BASE}/models/${owner}/${name}`,
      {
        headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` },
        timeout: 10000,
      }
    );
    const version = data.latest_version?.id;
    if (!version) throw new Error(`Replicate: لا يوجد إصدار للنموذج ${modelSlug}`);
    return version;
  } catch (e) {
    wrapReplicateErr(e);
  }
}

async function runSlideshow(imageUrls, options = {}) {
  if (!isConfigured()) {
    throw new Error('REPLICATE_API_TOKEN غير مضبوط. أضفه في Environment على Render.');
  }
  if (!imageUrls || imageUrls.length < 2) {
    throw new Error('يحتاج سلايدشو على الأقل صورتين');
  }
  if (imageUrls.length > 50) {
    imageUrls = imageUrls.slice(0, 50);
  }

  const version = await getLatestVersion();
  const input = {
    images: imageUrls,
    duration_per_image: options.duration_per_image ?? 4,
    aspect_ratio: options.aspect_ratio ?? '16:9',
    resolution: options.resolution ?? '1080p',
    transition_type: options.transition_type ?? 'fade',
    frame_rate: options.frame_rate ?? 30,
    zoom_speed: options.zoom_speed ?? 0.03,
    ken_burns: options.ken_burns !== undefined ? options.ken_burns : true,
    transition_duration: options.transition_duration ?? 1.0,
  };

  let prediction;
  try {
    const res = await axios.post(
      `${REPLICATE_BASE}/predictions`,
      { version, input },
      {
        headers: {
          Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );
    prediction = res.data;
  } catch (e) {
    wrapReplicateErr(e);
  }

  let id = prediction.id;
  let status = prediction.status;
  let output = prediction.output;
  const maxWait = options.maxWaitMs || 300000;
  const pollInterval = 3000;
  const start = Date.now();

  while (status !== 'succeeded' && status !== 'failed' && status !== 'canceled' && Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, pollInterval));
    try {
      const { data: next } = await axios.get(`${REPLICATE_BASE}/predictions/${id}`, {
        headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` },
      });
      status = next.status;
      output = next.output;
      if (next.error) {
        throw new Error(`Replicate: ${next.error}`);
      }
    } catch (e) {
      wrapReplicateErr(e);
    }
  }

  if (status !== 'succeeded' || !output) {
    throw new Error(status === 'failed' ? (output?.detail || 'فشل توليد الفيديو على Replicate') : 'انتهت المهلة قبل اكتمال الفيديو');
  }

  const videoUrl = typeof output === 'string' ? output : (output?.url || output?.video || output);
  if (!videoUrl) {
    throw new Error('Replicate لم يُرجع رابط فيديو');
  }

  return videoUrl;
}

async function downloadAndUploadToCloudinary(videoUrl, folder) {
  const tempDir = path.join(__dirname, '../temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const tempFile = path.join(tempDir, `replicate_${Date.now()}.mp4`);

  const auth = REPLICATE_API_TOKEN ? { Authorization: `Bearer ${REPLICATE_API_TOKEN}` } : {};
  const res = await axios({ method: 'get', url: videoUrl, responseType: 'stream', timeout: 60000, headers: auth });
  await pipeline(res.data, fs.createWriteStream(tempFile));

  const uploadResult = await cloudinaryService.uploadVideo(tempFile, folder);
  if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);

  if (!uploadResult.success || !uploadResult.url) {
    throw new Error(uploadResult.error || 'فشل رفع الفيديو إلى Cloudinary');
  }
  return uploadResult.url;
}

async function generateSlideshowVideo(listingId, imageUrls, options = {}) {
  const videoUrl = await runSlideshow(imageUrls, {
    duration_per_image: options.duration_per_image ?? 4,
    aspect_ratio: '16:9',
    resolution: options.resolution ?? '1080p',
    transition_type: 'fade',
    frame_rate: 30,
    ken_burns: true,
    zoom_speed: 0.03,
    transition_duration: 1.0,
  });

  const folder = `listings/${listingId}/promo`;
  const finalUrl = await downloadAndUploadToCloudinary(videoUrl, folder);
  return { success: true, url: finalUrl };
}

// ─── Luxury-tier opening shot: real image-to-video (pixverse v3.5 by default) ──────
// Generates a 5-second cinematic camera move from a single hero image. Used as the
// opening sequence in the hybrid Luxury pipeline; the rest of the listing video
// is still rendered as FFmpeg slideshow for cost efficiency.
async function generateOpeningShot(imageUrl, options = {}) {
  if (!isConfigured()) {
    throw new Error('REPLICATE_API_TOKEN غير مضبوط. أضفه في Environment على Render قبل تجربة المستوى الفاخر.');
  }
  if (!imageUrl || typeof imageUrl !== 'string') {
    throw new Error('opening shot يحتاج رابط صورة واحدة على الأقل.');
  }

  const modelSlug = options.model || REPLICATE_OPENING_MODEL;
  const version = await getLatestVersion(modelSlug);

  // Conservative, real-estate-friendly defaults. The schema below targets
  // pixverse v3.5 but most common fields (prompt/image/duration/aspect_ratio)
  // are shared by kling/minimax too — if the user switches model via env var,
  // we'll surface the schema error from Replicate clearly.
  const prompt = options.prompt
    || 'cinematic slow camera push-in, luxury real estate interior, soft warm golden-hour lighting, ultra-realistic, premium architecture, no people, smooth gimbal-stabilized motion';
  const input = {
    prompt,
    image: imageUrl,
    aspect_ratio: options.aspect_ratio || '16:9',
    duration: options.duration || 5,           // pixverse supports 5 or 8s
    quality: options.quality || '720p',        // 720p balances cost and look; 1080p costs more
    motion_mode: options.motion_mode || 'smooth',
    negative_prompt: options.negative_prompt || 'blurry, low quality, distorted, watermark, people, hands, faces',
  };

  let prediction;
  try {
    const res = await axios.post(
      `${REPLICATE_BASE}/predictions`,
      { version, input },
      {
        headers: {
          Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 20000,
      }
    );
    prediction = res.data;
  } catch (e) {
    wrapReplicateErr(e);
  }

  let id = prediction.id;
  let status = prediction.status;
  let output = prediction.output;
  const maxWait = options.maxWaitMs || 360000; // 6 minutes — image-to-video can be slow
  const pollInterval = 4000;
  const start = Date.now();

  while (status !== 'succeeded' && status !== 'failed' && status !== 'canceled' && Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, pollInterval));
    try {
      const { data: next } = await axios.get(`${REPLICATE_BASE}/predictions/${id}`, {
        headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` },
      });
      status = next.status;
      output = next.output;
      if (next.error) {
        throw new Error(`Replicate opening-shot: ${next.error}`);
      }
    } catch (e) {
      wrapReplicateErr(e);
    }
  }

  if (status !== 'succeeded' || !output) {
    throw new Error(
      status === 'failed'
        ? (typeof output === 'string' ? output : (output?.detail || 'فشل توليد اللقطة الافتتاحية'))
        : 'انتهت المهلة قبل اكتمال اللقطة الافتتاحية'
    );
  }

  const videoUrl = typeof output === 'string' ? output : (output?.url || output?.video || output?.[0]);
  if (!videoUrl) {
    throw new Error('Replicate opening-shot لم يُرجع رابط فيديو صالح.');
  }
  console.log(`[Replicate] ✅ Opening shot generated via ${modelSlug}: ${videoUrl}`);
  return videoUrl;
}

module.exports = {
  isConfigured,
  runSlideshow,
  generateSlideshowVideo,
  generateOpeningShot,
  downloadAndUploadToCloudinary,
};
