const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const stream = require('stream');
const pipeline = promisify(stream.pipeline);
const cloudinaryService = require('./cloudinaryService');
const db = require('../db');

const PYTHON_WORKER_URL = process.env.PYTHON_WORKER_URL || 'http://127.0.0.1:8080';

async function generateListingSlideshow(listingId, imageUrls, listingData) {
  try {
    if (!process.env.PYTHON_WORKER_URL) {
      console.warn('[VideoService] ⚠️ PYTHON_WORKER_URL not set - using localhost. Set to https://bayt-video-worker.onrender.com on Render.');
    }
    console.log(`🎬 [VideoService] Connecting to Python Engine at: ${PYTHON_WORKER_URL}`);
    
    if (!listingId.toString().startsWith('temp_')) {
      await db.query(`UPDATE properties SET video_status = 'processing' WHERE id = $1`, [listingId]);
    }

    const requestPayload = {
      images: imageUrls, 
      tier: 'tier2_business',
      ambience: 'birds',
      property: {
        id: listingId,
        title: listingData.title,
        location: `${listingData.city || ''} - ${listingData.district || ''}`,
        price: listingData.price,
        details: listingData.description
      }
    };

    let response;
    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        response = await axios({
          method: 'post',
          url: `${PYTHON_WORKER_URL}/generate`,
          data: requestPayload,
          responseType: 'stream',
          timeout: 300000
        });
        break;
      } catch (err) {
        const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout');
        const isConnRefused = err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT';
        if ((isTimeout || isConnRefused) && attempt < maxRetries) {
          console.warn(`[VideoService] Attempt ${attempt} failed (${err.message}), retrying in 15s (cold start?)...`);
          await new Promise(r => setTimeout(r, 15000));
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
    return { success: true, url: videoUrl };

  } catch (error) {
    const errMsg = error.response?.data?.error || error.message;
    const errCode = error.response?.status;
    console.error(`❌ [VideoService] Python Worker error:`, errMsg, errCode ? `(HTTP ${errCode})` : '');
    if (error.response?.data) console.error('[VideoService] Response:', JSON.stringify(error.response.data));
    if (!listingId.toString().startsWith('temp_')) {
      await db.query(`UPDATE properties SET video_status = 'failed' WHERE id = $1`, [listingId]);
    }
    throw error;
  }
}

module.exports = { generateListingSlideshow };
