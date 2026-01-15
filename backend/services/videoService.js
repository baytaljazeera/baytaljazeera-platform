const path = require('path');
const fs = require('fs');
const db = require('../db');

let createSlideshowVideo, generateDynamicPromoText, generatePromotionalText;

try {
  const aiModule = require('../routes/ai');
  createSlideshowVideo = aiModule.createSlideshowVideo;
  generateDynamicPromoText = aiModule.generateDynamicPromoText;
  generatePromotionalText = aiModule.generatePromotionalText;
} catch (err) {
  console.warn('AI module not available for video service');
}

async function generateListingSlideshow(listingId, imagePaths, listingData) {
  try {
    console.log(`[Slideshow] Starting video generation for listing ${listingId}`);
    
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
    const videoUrl = `/uploads/videos/${videoFilename}`;
    
    if (createSlideshowVideo) {
      await createSlideshowVideo(imagePaths, videoPath, promoText, 20);
    }
    
    await db.query(
      `UPDATE properties SET video_url = $1, video_status = 'ready' WHERE id = $2`,
      [videoUrl, listingId]
    );
    
    await db.query(
      `INSERT INTO listing_media (listing_id, url, kind, is_cover, sort_order) VALUES ($1, $2, 'video', false, 999)`,
      [listingId, videoUrl]
    );
    
    console.log(`[Slideshow] ✅ Video ready for listing ${listingId}: ${videoUrl}`);
    return videoUrl;
    
  } catch (error) {
    console.error(`[Slideshow] ❌ Error for listing ${listingId}:`, error.message);
    
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
