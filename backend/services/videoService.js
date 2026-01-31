const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const stream = require('stream');
const pipeline = promisify(stream.pipeline);
const { uploadVideo, isCloudinaryConfigured } = require('./cloudinaryService');
const db = require('../db');

const PYTHON_WORKER_URL = process.env.PYTHON_WORKER_URL || null;

let pythonWorkerAvailable = false;

async function checkPythonWorker() {
  if (!PYTHON_WORKER_URL) {
    console.log('[VideoService] ⚠️ PYTHON_WORKER_URL not set, using FFmpeg fallback');
    return false;
  }
  
  try {
    const response = await axios.get(`${PYTHON_WORKER_URL}/health`, { timeout: 5000 });
    if (response.data && response.data.status === 'healthy') {
      console.log('[VideoService] ✅ Python Worker is available');
      return true;
    }
  } catch (err) {
    console.log('[VideoService] ⚠️ Python Worker unavailable:', err.message);
  }
  return false;
}

checkPythonWorker().then(available => { pythonWorkerAvailable = available; });

async function generateListingSlideshow(listingId, imageUrls, listingData) {
  try {
    console.log(`🎬 [VideoService] Starting AI Generation for Listing #${listingId}...`);
    
    await db.query(`UPDATE properties SET video_status = 'processing' WHERE id = $1`, [listingId]);

    const planRes = await db.query(`
      SELECT p.video_config FROM user_plans up
      JOIN plans p ON up.plan_id = p.id
      WHERE up.user_id = $1 AND up.status = 'active' LIMIT 1
    `, [listingData.userId || listingData.user_id || 0]);

    let config = { tier: 'tier1_safwa', ambience: 'none' };
    if (planRes.rows.length > 0 && planRes.rows[0].video_config) {
      config = planRes.rows[0].video_config;
    }

    pythonWorkerAvailable = await checkPythonWorker();

    if (pythonWorkerAvailable) {
      return await generateWithPython(listingId, imageUrls, listingData, config);
    } else {
      return await generateWithFFmpeg(listingId, imageUrls, listingData);
    }

  } catch (error) {
    console.error(`❌ [VideoService] Failed:`, error.message);
    await db.query(`UPDATE properties SET video_status = 'failed' WHERE id = $1`, [listingId]);
    throw error;
  }
}

async function generateWithPython(listingId, imageUrls, listingData, config) {
  console.log(`🐍 [VideoService] Using Python Engine...`);
  
  const response = await axios({
    method: 'post',
    url: `${PYTHON_WORKER_URL}/generate`,
    data: {
      images: imageUrls,
      tier: config.tier,
      ambience: config.ambience,
      property: {
        id: listingId,
        title: listingData.title || 'عقار مميز',
        location: `${listingData.city || ''} - ${listingData.district || ''}`,
        price: listingData.price,
        details: listingData.description ? listingData.description.substring(0, 100) : ''
      }
    },
    responseType: 'stream',
    timeout: 300000
  });

  const tempDir = path.join(__dirname, '../temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  
  const tempFilePath = path.join(tempDir, `video_${listingId}_${Date.now()}.mp4`);
  await pipeline(response.data, fs.createWriteStream(tempFilePath));
  
  console.log(`📦 [VideoService] Video received from Python. Size: ${fs.statSync(tempFilePath).size}`);

  let videoUrl = `/uploads/videos/video_${listingId}_${Date.now()}.mp4`;
  
  if (isCloudinaryConfigured()) {
    console.log(`☁️ [VideoService] Uploading to Cloudinary...`);
    const uploadResult = await uploadVideo(tempFilePath, `listings/${listingId}/promo`);
    videoUrl = uploadResult.secure_url || uploadResult.url;
  } else {
    const publicDir = path.join(__dirname, '../public/uploads/videos');
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
    const destPath = path.join(publicDir, path.basename(tempFilePath));
    fs.copyFileSync(tempFilePath, destPath);
    videoUrl = `/uploads/videos/${path.basename(tempFilePath)}`;
  }

  await db.query(
    `UPDATE properties SET video_status = 'ready', video_url = $1 WHERE id = $2`,
    [videoUrl, listingId]
  );

  if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

  console.log(`✅ [VideoService] Python Success! URL: ${videoUrl}`);
  return { success: true, url: videoUrl };
}

async function generateWithFFmpeg(listingId, imageUrls, listingData) {
  console.log(`🎥 [VideoService] Using FFmpeg Fallback...`);
  
  const { createAdvancedSlideshow } = require('./advancedVideoService');
  
  const videoDir = path.join(__dirname, '../public/uploads/videos');
  if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });
  
  const videoFilename = `promo_${listingId}_${Date.now()}.mp4`;
  const videoPath = path.join(videoDir, videoFilename);
  const videoUrl = `/uploads/videos/${videoFilename}`;

  const promoText = {
    topLine: listingData.title || 'عقار مميز',
    midLine: `${listingData.city || ''} - ${listingData.district || ''}`,
    bottomLine: listingData.price ? `${listingData.price.toLocaleString()} ر.س` : ''
  };

  await createAdvancedSlideshow(imageUrls, videoPath, promoText, {
    duration: 20,
    template: 'luxury',
    includeAudio: true
  });

  let finalUrl = videoUrl;
  
  if (isCloudinaryConfigured()) {
    console.log(`☁️ [VideoService] Uploading to Cloudinary...`);
    const uploadResult = await uploadVideo(videoPath, `listings/${listingId}/promo`);
    finalUrl = uploadResult.secure_url || uploadResult.url || videoUrl;
  }

  await db.query(
    `UPDATE properties SET video_status = 'ready', video_url = $1 WHERE id = $2`,
    [finalUrl, listingId]
  );

  console.log(`✅ [VideoService] FFmpeg Success! URL: ${finalUrl}`);
  return { success: true, url: finalUrl };
}

async function generateVideoForNewListing(imagePaths, listingData) {
  const tempId = `temp_${Date.now()}`;
  return generateListingSlideshow(tempId, imagePaths, listingData);
}

module.exports = { 
  generateListingSlideshow,
  generateVideoForNewListing,
  checkPythonWorker
};
