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
    console.log(`🎬 [VideoService] Connecting to Python Engine at: ${PYTHON_WORKER_URL}`);
    
    if (!listingId.toString().startsWith('temp_')) {
      await db.query(`UPDATE properties SET video_status = 'processing' WHERE id = $1`, [listingId]);
    }

    const response = await axios({
      method: 'post',
      url: `${PYTHON_WORKER_URL}/generate`,
      data: {
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
      },
      responseType: 'stream',
      timeout: 300000
    });

    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const tempFilePath = path.join(tempDir, `video_${listingId}_${Date.now()}.mp4`);
    
    await pipeline(response.data, fs.createWriteStream(tempFilePath));
    
    console.log(`☁️ [VideoService] Uploading to Cloudinary...`);
    const uploadResult = await cloudinaryService.uploadVideo(tempFilePath, `listings/${listingId}/promo`);

    if (!listingId.toString().startsWith('temp_')) {
      await db.query(
        `UPDATE properties SET video_status = 'ready', video_url = $1 WHERE id = $2`,
        [uploadResult.secure_url, listingId]
      );
      try {
        await db.query(`INSERT INTO listing_media (listing_id, url, type, created_at) VALUES ($1, $2, 'video', NOW())`, [listingId, uploadResult.secure_url]);
      } catch (e) {}
    }

    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    
    console.log(`✅ [VideoService] Success! Video URL: ${uploadResult.secure_url}`);
    return { success: true, url: uploadResult.secure_url };

  } catch (error) {
    console.error(`❌ [VideoService] Error connecting to Python Worker:`, error.message);
    if (!listingId.toString().startsWith('temp_')) {
      await db.query(`UPDATE properties SET video_status = 'failed' WHERE id = $1`, [listingId]);
    }
    throw error;
  }
}

module.exports = { generateListingSlideshow };
