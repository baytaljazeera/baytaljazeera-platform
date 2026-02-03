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

async function getLatestVersion() {
  const [owner, name] = REPLICATE_MODEL.split('/');
  try {
    const { data } = await axios.get(
      `${REPLICATE_BASE}/models/${owner}/${name}`,
      {
        headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` },
        timeout: 10000,
      }
    );
    const version = data.latest_version?.id;
    if (!version) throw new Error('Replicate: لا يوجد إصدار للنموذج');
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
  const maxWait = 120000;
  const pollInterval = 2000;
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
  });

  const folder = `listings/${listingId}/promo`;
  const finalUrl = await downloadAndUploadToCloudinary(videoUrl, folder);
  return { success: true, url: finalUrl };
}

module.exports = {
  isConfigured,
  runSlideshow,
  generateSlideshowVideo,
};
