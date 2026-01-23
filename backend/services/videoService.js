const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');
const db = require('../db');
const { uploadVideo, isCloudinaryConfigured } = require('./cloudinaryService');

let createSlideshowVideo, generateDynamicPromoText, generatePromotionalText;
let ffmpegAvailable = false;

try {
  const aiModule = require('../routes/ai');
  createSlideshowVideo = aiModule.createSlideshowVideo;
  generateDynamicPromoText = aiModule.generateDynamicPromoText;
  generatePromotionalText = aiModule.generatePromotionalText;
} catch (err) {
  console.warn('[Video] AI module not available for video service');
}

function checkFFmpegAvailable() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    console.log('[Video] ✅ FFmpeg is available');
    return true;
  } catch (err) {
    console.error('[Video] ❌ FFmpeg is NOT available in PATH');
    return false;
  }
}

ffmpegAvailable = checkFFmpegAvailable();

async function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    
    const request = protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(destPath);
        downloadImage(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
    });
    
    request.on('error', (err) => {
      file.close();
      fs.unlink(destPath, () => {});
      reject(err);
    });
    
    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

async function prepareImagePaths(imageUrls, listingId) {
  const tempDir = path.join(os.tmpdir(), 'video-gen', listingId);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const localPaths = [];
  
  console.log(`[Video] Processing ${imageUrls.length} images for listing ${listingId}`);
  
  if (imageUrls.length === 0) {
    throw new Error('No images provided for video generation');
  }
  
  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    
    if (!url || url.trim() === '') {
      console.warn(`[Video] Skipping empty image URL at index ${i}`);
      continue;
    }
    
    if (url.startsWith('/uploads/')) {
      const localPath = path.join(__dirname, '../../public', url);
      if (fs.existsSync(localPath)) {
        localPaths.push(localPath);
        console.log(`[Video] Using local image ${i + 1}: ${url}`);
        continue;
      } else {
        console.warn(`[Video] Local image not found: ${url}`);
      }
    }
    
    if (url.startsWith('http://') || url.startsWith('https://')) {
      try {
        const urlPath = url.split('?')[0];
        let ext = path.extname(urlPath);
        if (!ext || ext.length > 5) ext = '.jpg';
        const tempPath = path.join(tempDir, `img_${i}${ext}`);
        
        console.log(`[Video] Downloading image ${i + 1} from Cloudinary...`);
        await downloadImage(url, tempPath);
        
        if (fs.existsSync(tempPath) && fs.statSync(tempPath).size > 0) {
          localPaths.push(tempPath);
          console.log(`[Video] ✅ Downloaded image ${i + 1}: ${fs.statSync(tempPath).size} bytes`);
        } else {
          console.warn(`[Video] ⚠️ Downloaded file is empty or missing: ${tempPath}`);
        }
      } catch (err) {
        console.error(`[Video] ❌ Failed to download image ${i + 1}: ${err.message}`);
      }
    }
  }
  
  console.log(`[Video] Successfully prepared ${localPaths.length}/${imageUrls.length} images`);
  return localPaths;
}

function cleanupTempFiles(listingId) {
  try {
    const tempDir = path.join(os.tmpdir(), 'video-gen', listingId);
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log(`[Video] Cleaned up temp files for ${listingId}`);
    }
  } catch (err) {
    console.warn(`[Video] Failed to cleanup temp files: ${err.message}`);
  }
}

async function generateListingSlideshow(listingId, imageUrls, listingData) {
  const startTime = Date.now();
  const MAX_PROCESSING_TIME = 10 * 60 * 1000; // 10 minutes timeout
  
  console.log(`[Video] ========================================`);
  console.log(`[Video] Starting video generation for listing ${listingId}`);
  console.log(`[Video] Image URLs count: ${imageUrls.length}`);
  console.log(`[Video] FFmpeg available: ${ffmpegAvailable}`);
  console.log(`[Video] Cloudinary configured: ${isCloudinaryConfigured()}`);
  
  // Check if video has been processing for too long (stuck)
  try {
    const stuckCheck = await db.query(
      `SELECT video_status, updated_at FROM properties WHERE id = $1`,
      [listingId]
    );
    if (stuckCheck.rows.length > 0) {
      const status = stuckCheck.rows[0].video_status;
      const updatedAt = stuckCheck.rows[0].updated_at;
      if (status === 'processing' && updatedAt) {
        const timeSinceUpdate = Date.now() - new Date(updatedAt).getTime();
        const minutesStuck = Math.round(timeSinceUpdate / 1000 / 60);
        if (timeSinceUpdate > MAX_PROCESSING_TIME) {
          console.warn(`[Video] ⚠️ Video has been processing for ${minutesStuck} minutes, resetting to failed`);
          await db.query(
            `UPDATE properties SET video_status = 'failed' WHERE id = $1`,
            [listingId]
          );
          throw new Error(`Video generation timeout - process took too long (${minutesStuck} minutes)`);
        } else if (minutesStuck > 5) {
          console.warn(`[Video] ⚠️ Video has been processing for ${minutesStuck} minutes, this is taking longer than expected`);
        }
      }
    }
  } catch (checkErr) {
    if (checkErr.message.includes('timeout')) {
      throw checkErr;
    }
    console.warn(`[Video] Could not check stuck status:`, checkErr.message);
  }
  
  try {
    if (!ffmpegAvailable) {
      ffmpegAvailable = checkFFmpegAvailable();
      if (!ffmpegAvailable) {
        await db.query(
          `UPDATE properties SET video_status = 'failed' WHERE id = $1`,
          [listingId]
        );
        throw new Error('FFmpeg is not available on this server. Please install FFmpeg.');
      }
    }
    
    if (!createSlideshowVideo) {
      throw new Error('Video creation module is not available');
    }
    
    const imagePaths = await prepareImagePaths(imageUrls, String(listingId));
    
    if (imagePaths.length === 0) {
      throw new Error('No images available for video generation - all downloads failed');
    }
    
    if (imagePaths.length < 3) {
      console.warn(`[Video] Only ${imagePaths.length} images available, video quality may be reduced`);
    }
    
    console.log(`[Video] Prepared ${imagePaths.length} images for video`);
    
    const videoDir = path.join(os.tmpdir(), 'video-gen', 'output');
    if (!fs.existsSync(videoDir)) {
      fs.mkdirSync(videoDir, { recursive: true });
    }
    
    let promoText;
    try {
      if (generateDynamicPromoText) {
        console.log(`[Video] Attempting to generate AI promo text...`);
        promoText = await generateDynamicPromoText(listingData);
        console.log(`[Video] ✅ Generated AI promo text:`, JSON.stringify(promoText, null, 2));
      } else {
        console.warn("[Video] ⚠️ generateDynamicPromoText not available, using fallback");
        throw new Error('AI not available');
      }
    } catch (promoErr) {
      console.warn("[Video] ⚠️ AI promo text failed, using static:", promoErr.message);
      if (generatePromotionalText) {
        promoText = generatePromotionalText(
          listingData.propertyType, 
          listingData.purpose, 
          listingData.city, 
          listingData.district, 
          listingData.price
        );
        console.log(`[Video] Using static promo text:`, promoText);
      } else {
        promoText = `${listingData.propertyType || 'عقار'} ${listingData.purpose || 'للبيع'} في ${listingData.city || 'المدينة'}`;
        console.log(`[Video] Using basic promo text:`, promoText);
      }
    }
    
    const videoFilename = `slideshow_${listingId}_${Date.now()}.mp4`;
    const videoPath = path.join(videoDir, videoFilename);
    let finalVideoUrl = `/uploads/videos/${videoFilename}`;
    
    console.log(`[Video] Creating slideshow video...`);
    console.log(`[Video] Output path: ${videoPath}`);
    
    try {
      await createSlideshowVideo(imagePaths, videoPath, promoText, 20);
      console.log(`[Video] ✅ Video created successfully`);
    } catch (ffmpegError) {
      console.error(`[Video] ❌ FFmpeg failed:`, ffmpegError.message);
      throw new Error(`FFmpeg video creation failed: ${ffmpegError.message}`);
    }
    
    if (!fs.existsSync(videoPath)) {
      throw new Error('Video file was not created');
    }
    
    const videoSize = fs.statSync(videoPath).size;
    console.log(`[Video] Video file size: ${(videoSize / 1024 / 1024).toFixed(2)} MB`);
    
    if (videoSize < 1000) {
      throw new Error('Video file is too small, generation may have failed');
    }
    
    if (isCloudinaryConfigured()) {
      console.log(`[Video] Uploading video to Cloudinary...`);
      try {
        const cloudinaryResult = await uploadVideo(videoPath, 'videos');
        if (cloudinaryResult.success) {
          finalVideoUrl = cloudinaryResult.url;
          console.log(`[Video] ✅ Video uploaded to Cloudinary: ${finalVideoUrl}`);
          fs.unlinkSync(videoPath);
        } else {
          console.error(`[Video] ❌ Cloudinary upload failed: ${cloudinaryResult.error}`);
          throw new Error(`Cloudinary upload failed: ${cloudinaryResult.error}`);
        }
      } catch (uploadErr) {
        console.error(`[Video] ❌ Upload error:`, uploadErr.message);
        throw new Error(`Failed to upload video: ${uploadErr.message}`);
      }
    } else {
      console.warn(`[Video] ⚠️ Cloudinary not configured, video will be lost on redeploy!`);
    }
    
    cleanupTempFiles(String(listingId));
    
    await db.query(
      `UPDATE properties SET video_url = $1, video_status = 'ready' WHERE id = $2`,
      [finalVideoUrl, listingId]
    );
    
    const existingVideo = await db.query(
      `SELECT id FROM listing_media WHERE listing_id = $1 AND kind = 'video'`,
      [listingId]
    );
    
    if (existingVideo.rows.length > 0) {
      await db.query(
        `UPDATE listing_media SET url = $1 WHERE listing_id = $2 AND kind = 'video'`,
        [finalVideoUrl, listingId]
      );
    } else {
      await db.query(
        `INSERT INTO listing_media (listing_id, url, kind, is_cover, sort_order) VALUES ($1, $2, 'video', false, 999)`,
        [listingId, finalVideoUrl]
      );
    }
    
    console.log(`[Video] ========================================`);
    console.log(`[Video] ✅ Video ready for listing ${listingId}: ${finalVideoUrl}`);
    return finalVideoUrl;
    
  } catch (error) {
    console.error(`[Video] ========================================`);
    console.error(`[Video] ❌ Error for listing ${listingId}:`, error.message);
    console.error(`[Video] Stack:`, error.stack);
    
    cleanupTempFiles(String(listingId));
    
    try {
      await db.query(
        `UPDATE properties SET video_status = 'failed' WHERE id = $1`,
        [listingId]
      );
      console.log(`[Video] Updated status to 'failed' in database`);
    } catch (dbErr) {
      console.error("[Video] Failed to update status:", dbErr.message);
    }
    
    throw error;
  }
}

module.exports = {
  generateListingSlideshow,
  checkFFmpegAvailable,
};
