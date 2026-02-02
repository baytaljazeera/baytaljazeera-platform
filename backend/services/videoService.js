const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const stream = require('stream');
const pipeline = promisify(stream.pipeline);
const cloudinaryService = require('./cloudinaryService');
const db = require('../db');

const PYTHON_WORKER_URL = process.env.PYTHON_WORKER_URL || 'http://127.0.0.1:8080';

async function generateListingSlideshow(listingId, imageUrls, listingData, options = {}) {
  try {
    const { script, voice, overlayPhrases } = options;
    if (!process.env.PYTHON_WORKER_URL) {
      console.warn('[VideoService] ⚠️ PYTHON_WORKER_URL not set - using localhost. Set to https://bayt-video-worker.onrender.com on Render.');
    }
    console.log(`🎬 [VideoService] Connecting to Python Engine at: ${PYTHON_WORKER_URL}`);
    console.log(`[VideoService] Sending ${imageUrls.length} images, script: ${script ? 'yes' : 'no'}, overlay_phrases: ${overlayPhrases?.length || 0}`);
    
    if (!listingId.toString().startsWith('temp_')) {
      await db.query(`UPDATE properties SET video_status = 'processing' WHERE id = $1`, [listingId]);
    }

    const requestPayload = {
      images: imageUrls, 
      tier: 'tier2_business',
      ambience: 'birds',
      voice: voice || 'onyx',
      property: {
        id: listingId,
        title: listingData.title,
        location: `${listingData.city || ''} - ${listingData.district || ''}`,
        price: listingData.price,
        details: listingData.description
      }
    };
    if (script && typeof script === 'string' && script.trim()) {
      requestPayload.script = script.trim();
    }
    if (Array.isArray(overlayPhrases) && overlayPhrases.length > 0) {
      requestPayload.overlay_phrases = overlayPhrases.filter(p => typeof p === 'string' && p.trim()).slice(0, 8);
    }

    let response;
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        response = await axios({
          method: 'post',
          url: `${PYTHON_WORKER_URL}/generate`,
          data: requestPayload,
          responseType: 'stream',
          timeout: 600000
        });
        break;
      } catch (err) {
        const status = err.response?.status;
        const is502 = status === 502;
        const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout');
        const isConnRefused = err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT';
        const shouldRetry = (isTimeout || isConnRefused || is502) && attempt < maxRetries;
        if (shouldRetry) {
          const delay = is502 ? 30000 : 15000; // 502: انتظار أطول (cold start على Render)
          console.warn(`[VideoService] Attempt ${attempt} failed (${status || err.message}), retrying in ${delay/1000}s...`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          throw err;
        }
      }
    }

    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const tempFilePath = path.join(tempDir, `video_${listingId}_${Date.now()}.mp4`);
    
    await pipeline(response.data, fs.createWriteStream(tempFilePath));
    
    console.log(`☁️ [VideoService] Uploading to Cloudinary...`);
    const uploadResult = await cloudinaryService.uploadVideo(tempFilePath, `listings/${listingId}/promo`);

    const videoUrl = uploadResult.url || uploadResult.secure_url;
    if (!uploadResult.success || !videoUrl) {
      throw new Error(uploadResult.error || 'فشل رفع الفيديو إلى Cloudinary');
    }

    if (!listingId.toString().startsWith('temp_')) {
      await db.query(
        `UPDATE properties SET video_status = 'ready', video_url = $1 WHERE id = $2`,
        [videoUrl, listingId]
      );
      try {
        await db.query(`INSERT INTO listing_media (listing_id, url, type, created_at) VALUES ($1, $2, 'video', NOW())`, [listingId, videoUrl]);
      } catch (e) {}
    }

    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    
    console.log(`✅ [VideoService] Success! Video URL: ${videoUrl}`);
    return { success: true, url: videoUrl, promoText: script ? { headline: script } : undefined };

  } catch (error) {
    const errCode = error.response?.status;
    const rawErr = error.response?.data?.error ?? error.message;
    let errMsg = typeof rawErr === 'string' ? rawErr : (error.message || '');
    if (typeof error.response?.data === 'string') {
      errMsg = errMsg || `HTTP ${errCode || 'error'}`;
    }
    console.error(`❌ [VideoService] Python Worker error:`, errMsg, errCode ? `(HTTP ${errCode})` : '');
    // تجنب JSON.stringify على بيانات قد تحتوي circular refs (مثل 502)
    if (error.response?.data && typeof error.response.data === 'object') {
      try {
        console.error('[VideoService] Response:', JSON.stringify(error.response.data));
      } catch (_) {
        console.error('[VideoService] Response: (non-serializable)');
      }
    } else if (typeof error.response?.data === 'string') {
      console.error('[VideoService] Response:', error.response.data.substring(0, 200));
    }
    if (!listingId.toString().startsWith('temp_')) {
      await db.query(`UPDATE properties SET video_status = 'failed' WHERE id = $1`, [listingId]);
    }
    // رمي رسالة خطأ نظيفة قابلة للتسلسل (تجنب circular structure في cache)
    const userMsg = errCode === 502
      ? 'محرك الفيديو غير متاح حالياً (قد يكون قيد التشغيل). يرجى المحاولة بعد دقيقة.'
      : (errMsg || `فشل الاتصال بمحرك الفيديو (${errCode || 'unknown'})`);
    throw new Error(userMsg);
  }
}

module.exports = { generateListingSlideshow };
