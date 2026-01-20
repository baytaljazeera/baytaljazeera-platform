const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const db = require('../db');
const { uploadVideo, isCloudinaryConfigured } = require('./cloudinaryService');

let createSlideshowVideo, generateDynamicPromoText, generatePromotionalText;

try {
  const aiModule = require('../routes/ai');
  createSlideshowVideo = aiModule.createSlideshowVideo;
  generateDynamicPromoText = aiModule.generateDynamicPromoText;
  generatePromotionalText = aiModule.generatePromotionalText;
} catch (err) {
  console.warn('AI module not available for video service');
}

// Download image from URL to local temp file
async function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    
    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Follow redirect
        downloadImage(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

// Prepare image paths - download from Cloudinary if needed
async function prepareImagePaths(imageUrls, listingId) {
  const tempDir = path.join(__dirname, '../../temp/images', listingId);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const localPaths = [];
  
  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    
    // If it's a local path, check if file exists
    if (url.startsWith('/uploads/')) {
      const localPath = path.join(__dirname, '../../public', url);
      if (fs.existsSync(localPath)) {
        localPaths.push(localPath);
        continue;
      }
    }
    
    // If it's a remote URL (Cloudinary), download it
    if (url.startsWith('http://') || url.startsWith('https://')) {
      try {
        const ext = path.extname(url.split('?')[0]) || '.jpg';
        const tempPath = path.join(tempDir, `img_${i}${ext}`);
        await downloadImage(url, tempPath);
        localPaths.push(tempPath);
        console.log(`[Slideshow] Downloaded image ${i + 1}: ${url}`);
      } catch (err) {
        console.warn(`[Slideshow] Failed to download image ${i}: ${err.message}`);
      }
    }
  }
  
  return localPaths;
}

// Cleanup temp files after video generation
function cleanupTempFiles(listingId) {
  const tempDir = path.join(__dirname, '../../temp/images', listingId);
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log(`[Slideshow] Cleaned up temp files for ${listingId}`);
  }
}

async function generateListingSlideshow(listingId, imageUrls, listingData) {
  try {
    console.log(`[Slideshow] Starting video generation for listing ${listingId}`);
    console.log(`[Slideshow] Image URLs: ${imageUrls.length} images`);
    
    // Prepare images - download from Cloudinary if needed
    const imagePaths = await prepareImagePaths(imageUrls, listingId);
    
    if (imagePaths.length === 0) {
      throw new Error('No images available for video generation');
    }
    
    console.log(`[Slideshow] Prepared ${imagePaths.length} images for video`);
    
    const videoDir = path.join(__dirname, "../../public/uploads/videos");
    if (!fs.existsSync(videoDir)) {
      fs.mkdirSync(videoDir, { recursive: true });
    }
    
    let promoText;
    try {
      if (generateDynamicPromoText) {
        promoText = await generateDynamicPromoText(listingData);
      } else {
        throw new Error('AI not available');
      }
    } catch (promoErr) {
      console.warn("[Slideshow] AI promo text failed, using static:", promoErr.message);
      if (generatePromotionalText) {
        promoText = generatePromotionalText(
          listingData.propertyType, 
          listingData.purpose, 
          listingData.city, 
          listingData.district, 
          listingData.price
        );
      } else {
        promoText = `${listingData.propertyType} ${listingData.purpose} في ${listingData.city}`;
      }
    }
    
    const videoFilename = `slideshow_${listingId}_${Date.now()}.mp4`;
    const videoPath = path.join(videoDir, videoFilename);
    let finalVideoUrl = `/uploads/videos/${videoFilename}`;
    
    if (createSlideshowVideo) {
      await createSlideshowVideo(imagePaths, videoPath, promoText, 20);
    }
    
    // Upload video to Cloudinary if configured
    if (isCloudinaryConfigured() && fs.existsSync(videoPath)) {
      console.log(`[Slideshow] Uploading video to Cloudinary...`);
      const cloudinaryResult = await uploadVideo(videoPath, 'videos');
      if (cloudinaryResult.success) {
        finalVideoUrl = cloudinaryResult.url;
        console.log(`[Slideshow] ✅ Video uploaded to Cloudinary: ${finalVideoUrl}`);
        // Delete local video file after successful upload
        fs.unlinkSync(videoPath);
      } else {
        console.warn(`[Slideshow] ⚠️ Cloudinary upload failed, keeping local: ${cloudinaryResult.error}`);
      }
    }
    
    // Cleanup temp files
    cleanupTempFiles(listingId);
    
    await db.query(
      `UPDATE properties SET video_url = $1, video_status = 'ready' WHERE id = $2`,
      [finalVideoUrl, listingId]
    );
    
    // Check if video already exists in media
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
    
    console.log(`[Slideshow] ✅ Video ready for listing ${listingId}: ${finalVideoUrl}`);
    return finalVideoUrl;
    
  } catch (error) {
    console.error(`[Slideshow] ❌ Error for listing ${listingId}:`, error.message);
    
    // Cleanup temp files on error too
    cleanupTempFiles(listingId);
    
    await db.query(
      `UPDATE properties SET video_status = 'failed' WHERE id = $1`,
      [listingId]
    ).catch(err => console.error("[Slideshow] Failed to update status:", err));
    
    throw error;
  }
}

module.exports = {
  generateListingSlideshow,
};
