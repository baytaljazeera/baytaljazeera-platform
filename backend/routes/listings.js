const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { authMiddleware, requireRoles } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/asyncHandler');
const { upload, cleanupUploadedFiles, validateFileMagicBytes } = require('../config/multer');
const { 
  getFreePlan, 
  getActivePaidPlanForUser, 
  scheduleListingExpiryReminder 
} = require('../services/planService');
const { generateListingSlideshow } = require('../services/videoService');
const { uploadImage, uploadVideo, isCloudinaryConfigured } = require('../services/cloudinaryService');

const PROPERTY_IMAGES = {
  "2d165bb9-3feb-4632-b9f5-0f1ec0ff8d78": "/images/property1.jpg",
  "3e276cca-4fdc-5743-c0g6-1f2fd0hh9e89": "/images/property2.jpg",
  "4f387ddb-5ged-6854-d1h7-2g3ge1ii0f90": "/images/property3.jpg",
  "5g498eec-6hfe-7965-e2i8-3h4hf2jj1g01": "/images/property4.jpg",
  "6h509ffd-7igf-8a76-f3j9-4i5ig3kk2h12": "/images/property5.jpg",
};

router.get("/elite", asyncHandler(async (req, res) => {
  const { userLat, userLng, limit = 9 } = req.query;
  
  const CACHE_KEY = 'listings:elite';
  const CACHE_TTL = 30000; // 30 seconds
  
  const query = `
    SELECT 
      p.id, p.title, p.city, p.district, p.price, p.area, p.type, p.purpose,
      p.bedrooms, p.bathrooms, p.latitude, p.longitude, p.created_at,
      p.cover_image, p.images, p.is_featured, p.featured_at, p.featured_order,
      COALESCE(pl.name_ar, 'مجاني') as plan_name
    FROM properties p
    LEFT JOIN quota_buckets qb ON p.bucket_id = qb.id
    LEFT JOIN plans pl ON COALESCE(qb.plan_id, p.plan_id) = pl.id
    WHERE p.status = 'approved'
      AND (p.expires_at IS NULL OR p.expires_at > NOW())
      AND p.is_featured = true
    ORDER BY p.featured_order ASC, p.featured_at DESC NULLS LAST, p.created_at DESC
  `;
  
  const result = await db.cachedQuery(CACHE_KEY, query, [], CACHE_TTL);
  
  let listings = result.rows.map((row, idx) => ({
    ...row,
    image_url: row.cover_image || (row.images && row.images[0]) || `/images/property${(idx % 5) + 1}.jpg`
  }));
  
  if (userLat && userLng) {
    const lat = parseFloat(userLat);
    const lng = parseFloat(userLng);
    
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    };
    
    listings = listings.filter(l => l.latitude && l.longitude).map(listing => ({
      ...listing,
      distance: calculateDistance(lat, lng, parseFloat(listing.latitude), parseFloat(listing.longitude))
    })).sort((a, b) => a.distance - b.distance);
  }
  
  const limitNum = parseInt(limit) || 9;
  res.json(listings.slice(0, limitNum));
}));

router.post("/:id/toggle-featured", authMiddleware, asyncHandler(async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const userId = req.user.id;
    
    const listingId = parseInt(id, 10);
    if (isNaN(listingId) || listingId <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "معرف الإعلان غير صالح" });
    }
    
    const listing = await client.query(
      "SELECT * FROM properties WHERE id = $1 FOR UPDATE",
      [listingId]
    );
    
    if (listing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "الإعلان غير موجود" });
    }
    
    if (listing.rows[0].user_id !== userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: "غير مصرح لك بتعديل هذا الإعلان" });
    }
    
    if (listing.rows[0].status !== 'approved') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "يجب أن يكون الإعلان معتمداً أولاً" });
    }
    
    const currentFeatured = listing.rows[0].is_featured || false;
    const newFeatured = !currentFeatured;
    
    await client.query(
      `UPDATE properties 
       SET is_featured = $1, 
           featured_at = CASE WHEN $1 = true THEN NOW() ELSE NULL END,
           featured_order = CASE WHEN $1 = true THEN (SELECT COALESCE(MAX(featured_order), 0) + 1 FROM properties WHERE is_featured = true) ELSE 0 END
       WHERE id = $2`,
      [newFeatured, listingId]
    );
    
    await client.query('COMMIT');
    
    // Invalidate elite listings cache after feature toggle
    db.cache.invalidateFor('properties');
    
    res.json({ 
      success: true, 
      is_featured: newFeatured,
      message: newFeatured ? "تم إضافة إعلانك لقسم نخبة العقارات" : "تم إزالة إعلانك من قسم نخبة العقارات"
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

router.get("/", asyncHandler(async (req, res) => {
  const { city, page = 1, limit = 20 } = req.query;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
  const offset = (pageNum - 1) * limitNum;
  
  let baseQuery = `FROM properties WHERE status = 'approved' AND (expires_at IS NULL OR expires_at > NOW())`;
  const params = [];

  if (city) {
    params.push(city);
    baseQuery += ` AND city = $${params.length}`;
  }
  
  const CACHE_KEY = `listings:search:${city || 'all'}:${pageNum}:${limitNum}`;
  const CACHE_TTL = 60000;
  
  const dataParams = [...params, limitNum, offset];
  const dataQuery = `
    SELECT p.*, 
      (SELECT array_agg(url ORDER BY is_cover DESC, sort_order ASC) 
       FROM listing_media 
       WHERE listing_id = p.id AND (kind = 'image' OR kind IS NULL)) as media_images
    ${baseQuery.replace('FROM properties', 'FROM properties p')} 
    ORDER BY p.created_at DESC 
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
  
  const [countResult, result] = await Promise.all([
    db.cachedQuery(`${CACHE_KEY}:count`, countQuery, params, CACHE_TTL),
    db.cachedQuery(CACHE_KEY, dataQuery, dataParams, CACHE_TTL)
  ]);
  
  const total = parseInt(countResult.rows[0].total);
  
  const listings = result.rows.map((row, idx) => {
    const allImages = row.media_images?.length > 0 ? row.media_images : (row.images || []);
    return {
      ...row,
      image_url: row.cover_image || (allImages[0]) || PROPERTY_IMAGES[row.id] || `/images/property${(idx % 5) + 1}.jpg`,
      images: allImages,
      deal_status: row.deal_status || 'active'
    };
  });
  
  res.json({
    listings,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
      hasMore: pageNum * limitNum < total
    }
  });
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return res.status(400).json({ error: "معرف الإعلان غير صالح" });
  }
  
  const result = await db.query(
    `SELECT p.*, u.name as owner_name, u.phone as owner_phone
     FROM properties p
     LEFT JOIN users u ON p.user_id = u.id
     WHERE p.id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "الإعلان غير موجود" });
  }

  const listing = result.rows[0];
  
  let images = [];
  let videos = [];
  try {
    const mediaResult = await db.query(
      `SELECT id, url, kind, is_cover FROM listing_media WHERE listing_id = $1 ORDER BY is_cover DESC, sort_order ASC`,
      [id]
    );
    images = mediaResult.rows.filter(m => m.kind === 'image' || !m.kind);
    videos = mediaResult.rows.filter(m => m.kind === 'video');
    console.log(`[Listing ${id}] Found ${images.length} images and ${videos.length} videos from listing_media`);
    console.log(`[Listing ${id}] Image URLs:`, images.map(img => img.url));
    
    // Filter out local image paths that don't exist on server (Railway ephemeral filesystem)
    // Only keep Cloudinary URLs or valid local paths
    const { isCloudinaryConfigured } = require('../services/cloudinaryService');
    if (isCloudinaryConfigured()) {
      images = images.filter(img => {
        // Keep Cloudinary URLs
        if (img.url && (img.url.startsWith('http://') || img.url.startsWith('https://'))) {
          return true;
        }
        // Filter out local paths as they won't exist on Railway
        console.warn(`[Listing ${id}] Filtering out local image path (won't work on Railway):`, img.url);
        return false;
      });
      console.log(`[Listing ${id}] After filtering: ${images.length} images (Cloudinary only)`);
    }
  } catch (mediaErr) {
    console.error("Error fetching media:", mediaErr);
  }
  
  if (images.length === 0) {
    if (listing.cover_image) {
      images = [{ id: 'cover', url: listing.cover_image, is_cover: true }];
    } else if (listing.images && Array.isArray(listing.images) && listing.images.length > 0) {
      images = listing.images.map((url, idx) => ({
        id: `img-${idx}`,
        url: url,
        is_cover: idx === 0
      }));
    } else {
      const defaultImg = PROPERTY_IMAGES[listing.id] || `/images/property1.jpg`;
      images = [{ id: 'default', url: defaultImg, is_cover: true }];
    }
  }
  
  if (videos.length === 0 && listing.video_url) {
    videos = [{ id: 'video-main', url: listing.video_url, kind: 'video' }];
  }
  
  let eliteReservation = null;
  try {
    const eliteRes = await db.query(`
      SELECT esr.id, esr.slot_id, esr.status, esr.expires_at, esr.created_at,
             es.tier, es.row_num, es.col_num
      FROM elite_slot_reservations esr
      JOIN elite_slots es ON esr.slot_id = es.id
      WHERE esr.property_id = $1 AND esr.status IN ('confirmed', 'pending_approval')
      ORDER BY esr.created_at DESC
      LIMIT 1
    `, [id]);
    if (eliteRes.rows.length > 0) {
      eliteReservation = eliteRes.rows[0];
    }
  } catch (err) {
    console.error("Error fetching elite reservation:", err);
  }
  
  res.json({
    listing: {
      ...listing,
      images,
      videos,
      image_url: images[0]?.url || listing.cover_image || `/images/property1.jpg`,
      elite_reservation: eliteReservation
    }
  });
}));

router.put("/:id", authMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const {
    title, description, country, city, district, type, purpose,
    price, land_area, building_area, bedrooms, bathrooms, property_age,
    floor_number, direction, parking_spaces
  } = req.body;

  const checkResult = await db.query(
    `SELECT user_id, status FROM properties WHERE id = $1`,
    [id]
  );

  if (checkResult.rows.length === 0) {
    return res.status(404).json({ error: "الإعلان غير موجود" });
  }

  if (checkResult.rows[0].user_id !== userId) {
    return res.status(403).json({ error: "غير مصرح لك بتعديل هذا الإعلان" });
  }

  const parseIntOrNull = (val) => (val === '' || val === undefined || val === null) ? null : parseInt(val);
  const parseFloatOrNull = (val) => (val === '' || val === undefined || val === null) ? null : parseFloat(val);

  const previousStatus = checkResult.rows[0].status;
  const needsReview = previousStatus === 'approved';

  await db.query(
    `UPDATE properties SET
      title = $1, description = $2, country = $3, city = $4, district = $5, type = $6, purpose = $7,
      price = $8, land_area = $9, building_area = $10, bedrooms = $11, bathrooms = $12,
      property_age = $13, floor_number = $14, direction = $15, parking_spaces = $16,
      updated_at = NOW()
      ${needsReview ? ", status = 'in_review'" : ""}
    WHERE id = $17`,
    [
      title, description, country || null, city, district, type, purpose,
      parseFloatOrNull(price), parseFloatOrNull(land_area), parseFloatOrNull(building_area),
      parseIntOrNull(bedrooms), parseIntOrNull(bathrooms), parseIntOrNull(property_age),
      parseIntOrNull(floor_number), direction || null, parseIntOrNull(parking_spaces), id
    ]
  );

  res.json({ 
    success: true, 
    message: needsReview 
      ? "تم تحديث الإعلان وسيتم مراجعته من قبل الإدارة" 
      : "تم تحديث الإعلان بنجاح",
    needsReview
  });
}));

router.get("/:id/image-quota", authMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const propertyResult = await db.query(
    `SELECT p.*, pl.max_photos_per_listing
     FROM properties p
     LEFT JOIN plans pl ON p.plan_id = pl.id
     WHERE p.id = $1 AND p.user_id = $2`,
    [id, userId]
  );

  if (propertyResult.rows.length === 0) {
    return res.status(404).json({ error: "الإعلان غير موجود" });
  }

  const property = propertyResult.rows[0];
  const maxPhotos = property.max_photos_per_listing || 5;
  
  let currentImages = [];
  try {
    currentImages = typeof property.images === 'string' 
      ? JSON.parse(property.images) 
      : (property.images || []);
  } catch (e) {
    currentImages = [];
  }
  
  const currentCount = currentImages.length;
  const remainingSlots = Math.max(0, maxPhotos - currentCount);

  res.json({
    maxPhotos,
    currentCount,
    remainingSlots,
    canAddMore: remainingSlots > 0
  });
}));

router.post("/:id/add-images", authMiddleware, upload.fields([
  { name: 'images', maxCount: 20 }
]), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const propertyResult = await db.query(
    `SELECT p.*, pl.max_photos_per_listing
     FROM properties p
     LEFT JOIN plans pl ON p.plan_id = pl.id
     WHERE p.id = $1 AND p.user_id = $2`,
    [id, userId]
  );

  if (propertyResult.rows.length === 0) {
    cleanupUploadedFiles(req.files);
    return res.status(404).json({ error: "الإعلان غير موجود" });
  }

  const property = propertyResult.rows[0];
  const maxPhotos = property.max_photos_per_listing || 5;

  let currentImages = [];
  try {
    currentImages = typeof property.images === 'string' 
      ? JSON.parse(property.images) 
      : (property.images || []);
  } catch (e) {
    currentImages = [];
  }

  const newImages = req.files?.images || [];
  if (newImages.length === 0) {
    return res.status(400).json({ error: "لم يتم اختيار صور للرفع" });
  }

  const totalAfterUpload = currentImages.length + newImages.length;
  if (totalAfterUpload > maxPhotos) {
    cleanupUploadedFiles(req.files);
    return res.status(400).json({ 
      error: `لا يمكن إضافة ${newImages.length} صور. الحد الأقصى ${maxPhotos} صور ولديك ${currentImages.length} حالياً. يمكنك إضافة ${maxPhotos - currentImages.length} صور فقط`
    });
  }

  for (const file of newImages) {
    const fileData = file.path ? file.path : file.buffer;
    if (!fileData) {
      cleanupUploadedFiles(req.files);
      return res.status(400).json({ error: "لم يتم تحميل الملف بشكل صحيح" });
    }
    const result = await validateFileMagicBytes(fileData);
    if (!result.valid) {
      cleanupUploadedFiles(req.files);
      return res.status(400).json({ 
        error: "تم رفض ملف مشبوه - نوع الملف غير مدعوم أو مزور"
      });
    }
  }

  const newImageUrls = [];
  const isConfigured = isCloudinaryConfigured();
  
  console.log(`[Upload] Starting upload for listing ${id}:`);
  console.log(`[Upload] - Files to upload: ${newImages.length}`);
  console.log(`[Upload] - Cloudinary configured: ${isConfigured}`);
  
  if (isConfigured) {
    console.log('[Upload] ✅ Cloudinary is configured, uploading to Cloudinary...');
    for (let i = 0; i < newImages.length; i++) {
      const file = newImages[i];
      console.log(`[Upload] [${i + 1}/${newImages.length}] Processing file: ${file.originalname || file.filename}`);
      console.log(`[Upload]    Path: ${file.path}`);
      console.log(`[Upload]    Size: ${file.size ? (file.size / 1024).toFixed(2) + ' KB' : 'unknown'}`);
      
      // Validate file path exists
      if (!file.path) {
        console.error(`[Upload] ❌ File ${i + 1} has no path property`);
        cleanupUploadedFiles(req.files);
        return res.status(500).json({ error: 'خطأ في مسار الملف. يرجى المحاولة مرة أخرى.' });
      }
      
      const uploadResult = await uploadImage(file.path, 'listings');
      if (uploadResult.success) {
        console.log(`[Upload] ✅ [${i + 1}/${newImages.length}] Successfully uploaded to Cloudinary`);
        console.log(`[Upload]    URL: ${uploadResult.url}`);
        newImageUrls.push(uploadResult.url);
      } else {
        console.error(`[Upload] ❌ [${i + 1}/${newImages.length}] Failed to upload to Cloudinary`);
        console.error(`[Upload]    Error: ${uploadResult.error}`);
        console.error(`[Upload]    HTTP Code: ${uploadResult.http_code || 'N/A'}`);
        cleanupUploadedFiles(req.files);
        return res.status(500).json({ 
          error: `فشل رفع الصورة ${i + 1}: ${uploadResult.error || 'خطأ غير معروف'}` 
        });
      }
    }
    console.log(`[Upload] ✅ All ${newImages.length} images successfully uploaded to Cloudinary`);
    cleanupUploadedFiles(req.files);
  } else {
    console.warn('[Upload] ⚠️ Cloudinary NOT configured, using local storage');
    console.warn('[Upload] ⚠️ WARNING: Local files will be lost on server restart/redeploy');
    newImages.forEach((file, idx) => {
      const localPath = `/uploads/listings/${file.filename}`;
      console.log(`[Upload] [${idx + 1}/${newImages.length}] Using local path: ${localPath}`);
      newImageUrls.push(localPath);
    });
  }
  const updatedImages = [...currentImages, ...newImageUrls];

  const previousStatus = property.status;
  const needsReview = previousStatus === 'approved';

  await db.query(
    `UPDATE properties SET 
      images = $1::jsonb, 
      updated_at = NOW()
      ${needsReview ? ", status = 'in_review'" : ""}
    WHERE id = $2`,
    [JSON.stringify(updatedImages), id]
  );

  const currentMaxSort = await db.query(
    `SELECT COALESCE(MAX(sort_order), -1) as max_sort FROM listing_media WHERE listing_id = $1 AND kind = 'image'`,
    [id]
  );
  let sortOrder = (currentMaxSort.rows[0]?.max_sort || -1) + 1;

  for (const url of newImageUrls) {
    await db.query(
      `INSERT INTO listing_media (listing_id, url, kind, is_cover, sort_order)
       VALUES ($1, $2, 'image', false, $3)`,
      [id, url, sortOrder++]
    );
  }

  res.json({ 
    success: true, 
    message: needsReview 
      ? `تم إضافة ${newImages.length} صور وسيتم مراجعة الإعلان`
      : `تم إضافة ${newImages.length} صور بنجاح`,
    addedCount: newImages.length,
    totalImages: updatedImages.length,
    maxPhotos,
    remainingSlots: maxPhotos - updatedImages.length,
    needsReview
  });
}));

router.delete("/:id/images/:imageIndex", authMiddleware, asyncHandler(async (req, res) => {
  const { id, imageIndex } = req.params;
  const userId = req.user.id;
  const index = parseInt(imageIndex);

  if (!Number.isFinite(index) || index < 0) {
    return res.status(400).json({ error: "رقم الصورة غير صالح" });
  }

  const propertyResult = await db.query(
    `SELECT * FROM properties WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );

  if (propertyResult.rows.length === 0) {
    return res.status(404).json({ error: "الإعلان غير موجود" });
  }

  const property = propertyResult.rows[0];
  let currentImages = [];
  try {
    currentImages = typeof property.images === 'string' 
      ? JSON.parse(property.images) 
      : (property.images || []);
  } catch (e) {
    currentImages = [];
  }

  if (index < 0 || index >= currentImages.length) {
    return res.status(400).json({ error: "رقم الصورة غير صحيح" });
  }

  if (currentImages.length <= 1) {
    return res.status(400).json({ error: "يجب الإبقاء على صورة واحدة على الأقل" });
  }

  const removedImageUrl = currentImages[index];
  currentImages.splice(index, 1);

  const previousStatus = property.status;
  const needsReview = previousStatus === 'approved';

  await db.query(
    `UPDATE properties SET 
      images = $1::jsonb,
      cover_image = $2,
      updated_at = NOW()
      ${needsReview ? ", status = 'in_review'" : ""}
    WHERE id = $3`,
    [JSON.stringify(currentImages), currentImages[0] || null, id]
  );

  await db.query(
    `DELETE FROM listing_media WHERE listing_id = $1 AND url = $2`,
    [id, removedImageUrl]
  );

  if (removedImageUrl.startsWith('/uploads/')) {
    const relativePath = removedImageUrl.replace(/^\/+/, '');
    const filePath = path.join(__dirname, '../../public', relativePath);
    fs.unlink(filePath, (err) => {
      if (err && err.code !== 'ENOENT') console.error('Error deleting image file:', err);
    });
  }

  res.json({ 
    success: true, 
    message: needsReview 
      ? "تم حذف الصورة وسيتم مراجعة الإعلان"
      : "تم حذف الصورة بنجاح",
    remainingImages: currentImages.length,
    needsReview
  });
}));

router.patch("/:id/images/cover", authMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { imageIndex } = req.body;
  const userId = req.user.id;

  const index = parseInt(imageIndex);
  if (!Number.isFinite(index) || index < 0) {
    return res.status(400).json({ error: "رقم الصورة غير صالح" });
  }

  const propertyResult = await db.query(
    `SELECT * FROM properties WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );

  if (propertyResult.rows.length === 0) {
    return res.status(404).json({ error: "الإعلان غير موجود" });
  }

  const property = propertyResult.rows[0];
  let currentImages = [];
  try {
    currentImages = typeof property.images === 'string' 
      ? JSON.parse(property.images) 
      : (property.images || []);
  } catch (e) {
    currentImages = [];
  }

  if (index >= currentImages.length) {
    return res.status(400).json({ error: "رقم الصورة غير صحيح" });
  }

  if (index === 0) {
    return res.json({ success: true, message: "هذه الصورة هي الغلاف بالفعل" });
  }

  const selectedImage = currentImages[index];
  currentImages.splice(index, 1);
  currentImages.unshift(selectedImage);

  await db.query(
    `UPDATE properties SET 
      images = $1::jsonb, 
      cover_image = $2,
      updated_at = NOW()
    WHERE id = $3`,
    [JSON.stringify(currentImages), selectedImage, id]
  );

  await db.query(
    `UPDATE listing_media SET is_cover = false WHERE listing_id = $1 AND kind = 'image'`,
    [id]
  );
  await db.query(
    `UPDATE listing_media SET is_cover = true, sort_order = 0 WHERE listing_id = $1 AND url = $2`,
    [id, selectedImage]
  );

  let sortOrder = 1;
  for (const imgUrl of currentImages.slice(1)) {
    await db.query(
      `UPDATE listing_media SET sort_order = $1 WHERE listing_id = $2 AND url = $3`,
      [sortOrder++, id, imgUrl]
    );
  }

  res.json({ 
    success: true, 
    message: "تم تعيين الصورة كغلاف بنجاح",
    newCoverImage: selectedImage
  });
}));

router.patch("/:id/status", authMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const userId = req.user.id;
  
  const checkResult = await db.query(
    `SELECT user_id FROM properties WHERE id = $1`,
    [id]
  );
  
  if (checkResult.rows.length === 0) {
    return res.status(404).json({ error: "الإعلان غير موجود" });
  }
  
  if (checkResult.rows[0].user_id !== userId) {
    return res.status(403).json({ error: "لا تملك صلاحية تعديل هذا الإعلان" });
  }
  
  const validStatuses = ['approved', 'hidden', 'pending'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: "حالة غير صالحة" });
  }
  
  await db.query(
    `UPDATE properties SET status = $1 WHERE id = $2`,
    [status, id]
  );
  
  // إذا تم إخفاء الإعلان، تحرير موقع النخبة تلقائيًا
  let eliteReleased = false;
  if (status === 'hidden') {
    const eliteRelease = await db.query(`
      UPDATE elite_slot_reservations 
      SET status = 'cancelled', updated_at = NOW(), admin_notes = 'تم الإلغاء تلقائياً بسبب إخفاء الإعلان من قبل المالك'
      WHERE property_id = $1 AND status IN ('confirmed', 'pending_approval')
      RETURNING slot_id
    `, [id]);
    eliteReleased = eliteRelease.rows.length > 0;
  }
  
  res.json({ 
    success: true, 
    message: eliteReleased 
      ? "تم إخفاء الإعلان وتحرير موقع النخبة - الموقع متاح الآن للآخرين" 
      : "تم تحديث حالة الإعلان",
    eliteReleased
  });
}));

// تحديث حالة الصفقة (نشط، قيد التفاوض، تمت الصفقة، مؤرشف)
router.patch("/:id/deal-status", authMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { dealStatus } = req.body;
  const userId = req.user.id;

  const validDealStatuses = ['active', 'negotiating', 'sold', 'rented', 'archived'];
  if (!validDealStatuses.includes(dealStatus)) {
    return res.status(400).json({ error: "حالة الصفقة غير صالحة" });
  }

  const checkResult = await db.query(
    `SELECT user_id, purpose FROM properties WHERE id = $1`,
    [id]
  );

  if (checkResult.rows.length === 0) {
    return res.status(404).json({ error: "الإعلان غير موجود" });
  }

  if (checkResult.rows[0].user_id !== userId) {
    return res.status(403).json({ error: "لا تملك صلاحية تعديل هذا الإعلان" });
  }

  const purpose = checkResult.rows[0].purpose;

  // التحقق من تناسق الحالة مع نوع العقار
  if (dealStatus === 'sold' && purpose === 'rent') {
    return res.status(400).json({ error: "لا يمكن تحديد 'تم البيع' لعقار معروض للإيجار" });
  }
  if (dealStatus === 'rented' && purpose === 'sale') {
    return res.status(400).json({ error: "لا يمكن تحديد 'تم التأجير' لعقار معروض للبيع" });
  }

  await db.query(
    `UPDATE properties SET deal_status = $1, deal_status_updated_at = NOW() WHERE id = $2`,
    [dealStatus, id]
  );

  // إذا تمت الصفقة، إخفاء الإعلان تلقائياً وتحرير موقع النخبة
  let autoHidden = false;
  let eliteReleased = false;
  if (dealStatus === 'sold' || dealStatus === 'rented') {
    await db.query(
      `UPDATE properties SET status = 'hidden' WHERE id = $1`,
      [id]
    );
    autoHidden = true;

    const eliteRelease = await db.query(`
      UPDATE elite_slot_reservations 
      SET status = 'cancelled', updated_at = NOW(), admin_notes = 'تم الإلغاء تلقائياً بسبب إتمام الصفقة'
      WHERE property_id = $1 AND status IN ('confirmed', 'pending_approval')
      RETURNING slot_id
    `, [id]);
    eliteReleased = eliteRelease.rows.length > 0;
  }

  const statusLabels = {
    'active': 'نشط',
    'negotiating': 'قيد التفاوض',
    'sold': 'تم البيع',
    'rented': 'تم التأجير',
    'archived': 'مؤرشف'
  };

  res.json({
    success: true,
    message: `تم تحديث حالة العقار إلى: ${statusLabels[dealStatus]}`,
    dealStatus,
    autoHidden,
    eliteReleased
  });
}));

// الحصول على حالة الصفقة الحالية
router.get("/:id/deal-status", authMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const result = await db.query(
    `SELECT deal_status, deal_status_updated_at, purpose FROM properties WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "الإعلان غير موجود" });
  }

  const property = result.rows[0];

  res.json({
    dealStatus: property.deal_status || 'active',
    updatedAt: property.deal_status_updated_at,
    purpose: property.purpose
  });
}));

router.delete("/:id", authMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return res.status(400).json({ error: "معرف الإعلان غير صالح" });
  }
  
  const checkResult = await db.query(
    `SELECT user_id FROM properties WHERE id = $1`,
    [id]
  );
  
  if (checkResult.rows.length === 0) {
    return res.status(404).json({ error: "الإعلان غير موجود" });
  }
  
  if (checkResult.rows[0].user_id !== userId) {
    return res.status(403).json({ error: "لا تملك صلاحية حذف هذا الإعلان" });
  }
  
  // Delete related data first
  await db.query(`DELETE FROM listing_media WHERE listing_id = $1`, [id]);
  await db.query(`DELETE FROM elite_slot_reservations WHERE property_id = $1`, [id]);
  await db.query(`DELETE FROM properties WHERE id = $1`, [id]);
  
  res.json({ success: true, message: "تم حذف الإعلان بنجاح" });
}));

router.post("/:id/regenerate-video", authMiddleware, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return res.status(400).json({ error: "معرف الإعلان غير صالح" });
  }
  
  const listingResult = await db.query(
    `SELECT * FROM properties WHERE id = $1`,
    [id]
  );
  
  if (listingResult.rows.length === 0) {
    return res.status(404).json({ error: "الإعلان غير موجود" });
  }
  
  const listing = listingResult.rows[0];
  if (listing.user_id !== userId) {
    return res.status(403).json({ error: "لا تملك صلاحية تعديل هذا الإعلان" });
  }
  
  const userPlanResult = await db.query(`
    SELECT p.support_level, p.name_ar
    FROM user_plans up
    JOIN plans p ON up.plan_id = p.id
    WHERE up.user_id = $1 AND up.status = 'active'
      AND (up.expires_at IS NULL OR up.expires_at > NOW())
    ORDER BY p.support_level DESC
    LIMIT 1
  `, [userId]);
  
  const userSupportLevel = userPlanResult.rows[0]?.support_level || 0;
  
  if (userSupportLevel < 3) {
    return res.status(403).json({ error: "هذه الميزة متاحة لمشتركي باقة كبار رجال الأعمال فقط" });
  }
  
  const mediaResult = await db.query(
    `SELECT url FROM listing_media WHERE listing_id = $1 AND kind = 'image' ORDER BY sort_order`,
    [id]
  );
  
  if (mediaResult.rows.length === 0) {
    return res.status(400).json({ error: "لا توجد صور للإعلان" });
  }
  
  // Get image URLs - can be local paths or Cloudinary URLs
  const imageUrls = mediaResult.rows.map(row => row.url);
  
  await db.query(
    `UPDATE properties SET video_status = 'processing' WHERE id = $1`,
    [id]
  );
  
  res.json({ 
    success: true, 
    message: "جاري إعادة إنشاء الفيديو من صورك...",
    status: "processing"
  });
  
  // Generate video asynchronously (don't block response)
  generateListingSlideshow(id, imageUrls, {
    propertyType: listing.type,
    purpose: listing.purpose,
    city: listing.city,
    district: listing.district,
    price: listing.price,
    title: listing.title,
    description: listing.description,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    landArea: listing.land_area,
    buildingArea: listing.building_area
  }).catch(err => {
    console.error(`[Regenerate] ❌ Failed for listing ${id}:`, err.message);
    console.error(`[Regenerate] Stack:`, err.stack);
    // Status already set to 'failed' in generateListingSlideshow
  });
}));

router.post("/", asyncHandler(async (req, res) => {
  const {
    userId, title, description, city, district, type, purpose,
    price, area, bedrooms, bathrooms, latitude, longitude,
  } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "يجب توفير userId لربط الإعلان بالمستخدم." });
  }

  const paidPlan = await getActivePaidPlanForUser(userId);
  let plan;
  let planSource;
  let expiresAt;

  if (paidPlan) {
    plan = paidPlan;
    planSource = "paid";

    const countResult = await db.query(
      `SELECT COUNT(*)::int AS cnt FROM properties
       WHERE user_id = $1 AND plan_id = $2
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId, plan.id]
    );

    const activeCount = countResult.rows[0]?.cnt ?? 0;

    if (activeCount >= plan.max_listings) {
      return res.status(403).json({
        error: "تم الوصول إلى الحد الأعلى للإعلانات في باقتك الحالية.",
        message: `باقتك "${plan.name_ar}" تسمح لك بـ ${plan.max_listings} إعلان نشط.`,
      });
    }

    expiresAt = plan.expires_at || null;
  } else {
    plan = await getFreePlan();
    planSource = "free";

    if (!plan) {
      return res.status(500).json({ error: "لم يتم العثور على الباقة المجانية" });
    }

    const countResult = await db.query(
      `SELECT COUNT(*)::int AS cnt FROM properties
       WHERE user_id = $1 AND plan_id = $2
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId, plan.id]
    );

    const activeCount = countResult.rows[0]?.cnt ?? 0;

    if (activeCount >= plan.max_listings) {
      return res.status(403).json({
        error: "لديك إعلان مجاني نشط حالياً.",
        message: "يمكنك نشر إعلان مجاني جديد بعد انتهاء الإعلان الحالي، أو الترقية لإحدى الباقات المدفوعة.",
      });
    }

    expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + plan.duration_days);
  }

  const insertResult = await db.query(
    `INSERT INTO properties
      (user_id, title, description, city, district, type, purpose,
       price, area, bedrooms, bathrooms, latitude, longitude,
       status, created_at, expires_at, plan_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending', NOW(), $14, $15)
     RETURNING *`,
    [userId, title, description, city, district, type, purpose,
     price, area, bedrooms, bathrooms, latitude, longitude, expiresAt, plan.id]
  );

  const newListing = insertResult.rows[0];

  try {
    await scheduleListingExpiryReminder(userId, newListing, plan);
  } catch (remErr) {
    console.error("Error scheduling notification:", remErr);
  }

  res.status(201).json({
    listing: newListing,
    plan: { id: plan.id, name_ar: plan.name_ar, source: planSource },
  });
}));

router.post("/create", authMiddleware, upload.fields([
  { name: 'images', maxCount: 20 },
  { name: 'video', maxCount: 1 }
]), asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const listingData = JSON.parse(req.body.listing || '{}');
  
  const {
    title, description, country, city, district, purpose,
    price, landArea, buildingArea, bedrooms, bathrooms, latitude, longitude,
    usageType, formattedAddress, propertyAge, floorNumber, direction,
    parkingSpaces, hasPool, hasElevator, hasGarden
  } = listingData;
  
  const propertyType = listingData.propertyType || listingData.type;
  const bucketId = listingData.bucketId;
  
  // Parse selectedImageIndices from FormData (for video generation)
  let selectedImageIndices = [];
  if (req.body.selectedImageIndices) {
    try {
      selectedImageIndices = typeof req.body.selectedImageIndices === 'string' 
        ? JSON.parse(req.body.selectedImageIndices)
        : req.body.selectedImageIndices;
      console.log(`[Create Listing] Selected images for video:`, selectedImageIndices);
    } catch (err) {
      console.warn(`[Create Listing] Failed to parse selectedImageIndices:`, err.message);
    }
  }

  const requiredFields = { 
    title, country, city, district, propertyType, purpose, usageType,
    price: Number(price), landArea: Number(landArea), 
    bedrooms: Number(bedrooms), bathrooms: Number(bathrooms) 
  };
  
  const missingFields = Object.entries(requiredFields)
    .filter(([key, value]) => {
      if (['price', 'landArea', 'bedrooms', 'bathrooms'].includes(key)) {
        return isNaN(value) || value < 0;
      }
      return !value;
    })
    .map(([key]) => key);

  if (missingFields.length > 0) {
    cleanupUploadedFiles(req.files);
    return res.status(400).json({ error: "حقول مطلوبة ناقصة", missingFields });
  }

  if (!latitude || !longitude) {
    cleanupUploadedFiles(req.files);
    return res.status(400).json({ error: "يرجى تحديد موقع العقار على الخريطة" });
  }

  const images = req.files?.images || [];
  if (images.length === 0) {
    cleanupUploadedFiles(req.files);
    return res.status(400).json({ error: "يرجى رفع صورة واحدة على الأقل" });
  }

  const videos = req.files?.video || [];
  const allFiles = [...images, ...videos];
  for (const file of allFiles) {
    const result = await validateFileMagicBytes(file.path);
    if (!result.valid) {
      cleanupUploadedFiles(req.files);
      return res.status(400).json({ 
        error: "تم رفض ملف مشبوه - نوع الملف غير مدعوم أو مزور",
        errorEn: "File rejected - unsupported or forged file type"
      });
    }
    if (result.detectedType !== file.mimetype) {
      console.warn(`[Security] MIME mismatch: claimed ${file.mimetype}, detected ${result.detectedType} for ${file.path}`);
    }
  }

  let selectedBucket = null;
  let plan = null;
  let planSource = "bucket";
  let expiresAt = null;

  if (bucketId) {
    const bucketResult = await db.query(`
      SELECT qb.*, p.name_ar as plan_name, p.max_photos_per_listing,
             p.max_videos_per_listing, p.duration_days
      FROM quota_buckets qb
      JOIN plans p ON qb.plan_id = p.id
      WHERE qb.id = $1 AND qb.user_id = $2 AND qb.active = true
    `, [bucketId, userId]);
    
    if (bucketResult.rows.length > 0) {
      const bucket = bucketResult.rows[0];
      const now = new Date();
      
      if (bucket.expires_at && new Date(bucket.expires_at) <= now) {
        cleanupUploadedFiles(req.files);
        return res.status(403).json({
          error: "رصيد الباقة المحدد منتهي الصلاحية",
          needsUpgrade: true
        });
      }
      
      const remaining = bucket.total_slots - bucket.used_slots;
      if (remaining <= 0) {
        cleanupUploadedFiles(req.files);
        return res.status(403).json({
          error: "لا يوجد رصيد متبقي في هذه الباقة",
          needsUpgrade: true
        });
      }
      
      selectedBucket = bucket;
      
      const maxPhotos = bucket.max_photos_per_listing || 5;
      if (images.length > maxPhotos) {
        cleanupUploadedFiles(req.files);
        return res.status(400).json({
          error: `الحد الأقصى للصور في باقة "${bucket.plan_name}" هو ${maxPhotos} صورة`
        });
      }
      
      const maxVideos = bucket.max_videos_per_listing || 0;
      if (videos.length > 0 && maxVideos === 0) {
        cleanupUploadedFiles(req.files);
        return res.status(400).json({
          error: `باقة "${bucket.plan_name}" لا تدعم رفع الفيديو`
        });
      }
      
      const planResult = await db.query(`SELECT * FROM plans WHERE id = $1`, [bucket.plan_id]);
      plan = planResult.rows[0];
      
      const durationDays = plan.duration_days || 30;
      const listingExpiry = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
      const bucketExpiry = bucket.expires_at ? new Date(bucket.expires_at) : null;
      expiresAt = bucketExpiry && bucketExpiry < listingExpiry ? bucketExpiry : listingExpiry;
    }
  }

  if (!selectedBucket) {
    const autoResult = await db.query(`
      SELECT qb.*, p.name_ar as plan_name, p.max_photos_per_listing,
             p.max_videos_per_listing, p.duration_days
      FROM quota_buckets qb
      JOIN plans p ON qb.plan_id = p.id
      WHERE qb.user_id = $1 AND qb.active = true
        AND (qb.expires_at IS NULL OR qb.expires_at > NOW())
        AND qb.used_slots < qb.total_slots
      ORDER BY qb.expires_at ASC NULLS LAST, qb.created_at ASC
      LIMIT 1
    `, [userId]);

    if (autoResult.rows.length > 0) {
      selectedBucket = autoResult.rows[0];
      
      const maxPhotos = selectedBucket.max_photos_per_listing || 5;
      if (images.length > maxPhotos) {
        cleanupUploadedFiles(req.files);
        return res.status(400).json({
          error: `الحد الأقصى للصور في باقة "${selectedBucket.plan_name}" هو ${maxPhotos} صورة`
        });
      }
      
      const maxVideos = selectedBucket.max_videos_per_listing || 0;
      if (videos.length > 0 && maxVideos === 0) {
        cleanupUploadedFiles(req.files);
        return res.status(400).json({
          error: `باقة "${selectedBucket.plan_name}" لا تدعم رفع الفيديو`
        });
      }
      
      const planResult = await db.query(`SELECT * FROM plans WHERE id = $1`, [selectedBucket.plan_id]);
      plan = planResult.rows[0];
      
      const durationDays = plan.duration_days || 30;
      const listingExpiry = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
      const bucketExpiry = selectedBucket.expires_at ? new Date(selectedBucket.expires_at) : null;
      expiresAt = bucketExpiry && bucketExpiry < listingExpiry ? bucketExpiry : listingExpiry;
    }
  }

  if (!selectedBucket) {
    const paidPlan = await getActivePaidPlanForUser(userId);
    
    if (paidPlan) {
      plan = paidPlan;
      planSource = "paid";

      if (plan.expires_at && new Date(plan.expires_at) < new Date()) {
        cleanupUploadedFiles(req.files);
        return res.status(403).json({
          error: "باقتك منتهية الصلاحية",
          needsUpgrade: true
        });
      }

      const countResult = await db.query(
        `SELECT COUNT(*)::int AS cnt FROM properties
         WHERE user_id = $1 AND plan_id = $2
         AND status NOT IN ('deleted', 'rejected')
         AND (expires_at IS NULL OR expires_at > NOW())`,
        [userId, plan.id]
      );

      const activeCount = countResult.rows[0]?.cnt ?? 0;

      if (activeCount >= plan.max_listings) {
        cleanupUploadedFiles(req.files);
        return res.status(403).json({
          error: "تم الوصول إلى الحد الأعلى للإعلانات",
          needsUpgrade: true
        });
      }

      const maxPhotos = plan.max_photos_per_listing || 5;
      if (images.length > maxPhotos) {
        cleanupUploadedFiles(req.files);
        return res.status(400).json({
          error: `الحد الأقصى للصور في باقتك هو ${maxPhotos} صورة`
        });
      }

      const maxVideos = plan.max_videos_per_listing || 0;
      if (videos.length > 0 && maxVideos === 0) {
        cleanupUploadedFiles(req.files);
        return res.status(400).json({ error: "باقتك لا تدعم رفع الفيديو" });
      }

      const durationDays = plan.duration_days || 30;
      const listingExpiry = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
      const planExpiry = plan.expires_at ? new Date(plan.expires_at) : null;
      expiresAt = planExpiry && planExpiry < listingExpiry ? planExpiry : listingExpiry;
    } else {
      plan = await getFreePlan();
      planSource = "free";

      if (!plan) {
        cleanupUploadedFiles(req.files);
        return res.status(500).json({ error: "لم يتم العثور على الباقة المجانية" });
      }

      const countResult = await db.query(
        `SELECT COUNT(*)::int AS cnt FROM properties
         WHERE user_id = $1 AND plan_id = $2
         AND status NOT IN ('deleted', 'rejected')
         AND (expires_at IS NULL OR expires_at > NOW())`,
        [userId, plan.id]
      );

      const activeCount = countResult.rows[0]?.cnt ?? 0;

      if (activeCount >= plan.max_listings) {
        cleanupUploadedFiles(req.files);
        return res.status(403).json({
          error: "لديك إعلان مجاني نشط حالياً",
          needsUpgrade: true
        });
      }

      const maxPhotos = plan.max_photos_per_listing || 5;
      if (images.length > maxPhotos) {
        cleanupUploadedFiles(req.files);
        return res.status(400).json({
          error: `الحد الأقصى للصور في الباقة المجانية هو ${maxPhotos} صورة`
        });
      }

      const maxVideos = plan.max_videos_per_listing || 0;
      if (videos.length > 0 && maxVideos === 0) {
        cleanupUploadedFiles(req.files);
        return res.status(400).json({ error: "الباقة المجانية لا تدعم رفع الفيديو" });
      }

      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + plan.duration_days);
    }
  }

  const imageUrls = [];
  const isConfigured = isCloudinaryConfigured();
  
  console.log(`[Create Listing] Starting image upload:`);
  console.log(`[Create Listing] - Files to upload: ${images.length}`);
  console.log(`[Create Listing] - Cloudinary configured: ${isConfigured}`);
  if (selectedImageIndices.length > 0) {
    console.log(`[Create Listing] - Selected images for video: ${selectedImageIndices.join(', ')} (${selectedImageIndices.length} images)`);
  } else {
    console.log(`[Create Listing] - Using all images for video generation`);
  }
  
  if (isConfigured) {
    console.log('[Create Listing] ✅ Cloudinary is configured, uploading to Cloudinary...');
    for (let i = 0; i < images.length; i++) {
      const file = images[i];
      console.log(`[Create Listing] [${i + 1}/${images.length}] Processing: ${file.originalname || file.filename}`);
      console.log(`[Create Listing]    Path: ${file.path}`);
      
      if (!file.path) {
        console.error(`[Create Listing] ❌ File ${i + 1} has no path property`);
        cleanupUploadedFiles(req.files);
        return res.status(500).json({ error: 'خطأ في مسار الملف. يرجى المحاولة مرة أخرى.' });
      }
      
      const uploadResult = await uploadImage(file.path, 'listings');
      if (uploadResult.success) {
        console.log(`[Create Listing] ✅ [${i + 1}/${images.length}] Uploaded: ${uploadResult.url}`);
        imageUrls.push(uploadResult.url);
      } else {
        console.error(`[Create Listing] ❌ [${i + 1}/${images.length}] Failed: ${uploadResult.error}`);
        cleanupUploadedFiles(req.files);
        return res.status(500).json({ 
          error: `فشل رفع الصورة ${i + 1}: ${uploadResult.error || 'خطأ غير معروف'}` 
        });
      }
    }
    console.log(`[Create Listing] ✅ All ${images.length} images uploaded to Cloudinary`);
  } else {
    console.warn('[Create Listing] ⚠️ Cloudinary NOT configured, using local storage');
    images.forEach((file, idx) => {
      const localPath = `/uploads/listings/${file.filename}`;
      console.log(`[Create Listing] [${idx + 1}/${images.length}] Local path: ${localPath}`);
      imageUrls.push(localPath);
    });
  }
  const coverImage = imageUrls[0];

  let videoUrl = null;
  if (videos.length > 0) {
    if (isCloudinaryConfigured()) {
      console.log('[Cloudinary] ✅ Uploading video to Cloudinary');
      const videoResult = await uploadVideo(videos[0].path, 'videos');
      if (videoResult.success) {
        console.log('[Cloudinary] ✅ Video uploaded:', videoResult.url);
        videoUrl = videoResult.url;
      } else {
        console.error('[Cloudinary] ❌ Failed to upload video:', videoResult.error);
        cleanupUploadedFiles(req.files);
        return res.status(500).json({ error: 'فشل رفع الفيديو. يرجى المحاولة مرة أخرى.' });
      }
    } else {
      console.log('[Cloudinary] ⚠️ Not configured for video, using local storage');
      videoUrl = `/uploads/listings/${videos[0].filename}`;
    }
  } else if (req.body.aiVideoUrl) {
    videoUrl = req.body.aiVideoUrl;
  }
  
  if (isCloudinaryConfigured()) {
    cleanupUploadedFiles(req.files);
  }

  let newListing;
  const client = await db.connect();
  
  try {
    await client.query('BEGIN');
    
    if (selectedBucket) {
      const lockResult = await client.query(
        `SELECT * FROM quota_buckets WHERE id = $1 AND user_id = $2 AND active = true FOR UPDATE`,
        [selectedBucket.id, userId]
      );
      
      if (lockResult.rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        cleanupUploadedFiles(req.files);
        return res.status(403).json({ error: "الباقة المحددة غير متاحة", needsUpgrade: true });
      }
      
      const lockedBucket = lockResult.rows[0];
      const remaining = lockedBucket.total_slots - lockedBucket.used_slots;
      
      if (remaining <= 0) {
        await client.query('ROLLBACK');
        client.release();
        cleanupUploadedFiles(req.files);
        return res.status(403).json({ error: "لا يوجد رصيد متبقي", needsUpgrade: true });
      }
      
      if (lockedBucket.expires_at && new Date(lockedBucket.expires_at) <= new Date()) {
        await client.query('ROLLBACK');
        client.release();
        cleanupUploadedFiles(req.files);
        return res.status(403).json({ error: "الباقة المحددة منتهية الصلاحية", needsUpgrade: true });
      }
    }
    
    const insertResult = await client.query(
      `INSERT INTO properties
        (user_id, title, description, country, city, district, type, purpose,
         price, land_area, building_area, bedrooms, bathrooms, latitude, longitude,
         usage_type, formatted_address, property_age, floor_number, direction, parking_spaces,
         has_pool, has_elevator, has_garden,
         images, video_url, cover_image, status, plan_id, bucket_id, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
               $16, $17, $18, $19, $20, $21, $22, $23, $24, $25::jsonb, $26, $27, 'pending', $28, $29, $30, NOW())
       RETURNING *`,
      [userId, title, description || '', country || 'السعودية', city, district, propertyType, purpose,
       price, landArea || null, buildingArea || null, bedrooms, bathrooms, latitude, longitude,
       usageType || 'سكني', formattedAddress || '', propertyAge || null, floorNumber || null, direction || null, parkingSpaces || null,
       hasPool || false, hasElevator || false, hasGarden || false,
       JSON.stringify(imageUrls), videoUrl, coverImage, plan.id, 
       selectedBucket ? selectedBucket.id : null, expiresAt]
    );

    newListing = insertResult.rows[0];

    if (selectedBucket) {
      await client.query(
        `UPDATE quota_buckets SET used_slots = used_slots + 1, updated_at = NOW() WHERE id = $1`,
        [selectedBucket.id]
      );
    }
    
    await client.query('COMMIT');
  } catch (txErr) {
    await client.query('ROLLBACK');
    cleanupUploadedFiles(req.files);
    throw txErr;
  } finally {
    client.release();
  }

  for (let i = 0; i < imageUrls.length; i++) {
    await db.query(
      `INSERT INTO listing_media (listing_id, url, kind, is_cover, sort_order)
       VALUES ($1, $2, 'image', $3, $4)`,
      [newListing.id, imageUrls[i], i === 0, i]
    );
  }

  if (videoUrl) {
    await db.query(
      `INSERT INTO listing_media (listing_id, url, kind, is_cover, sort_order)
       VALUES ($1, $2, 'video', false, 999)`,
      [newListing.id, videoUrl]
    );
  }

  try {
    await scheduleListingExpiryReminder(userId, newListing, plan);
  } catch (remErr) {
    console.error("Error scheduling notification:", remErr);
  }

  // تحويل الإحالات المعلقة (pending_listing) إلى completed عند إضافة أول إعلان
  try {
    const pendingReferral = await db.query(
      `SELECT r.id, r.referrer_id FROM referrals r
       WHERE r.referred_id = $1 AND r.status = 'pending_listing'
       LIMIT 1`,
      [userId]
    );
    
    if (pendingReferral.rows.length > 0) {
      const referral = pendingReferral.rows[0];
      
      // تحويل الإحالة إلى completed
      await db.query(
        `UPDATE referrals SET status = 'completed', updated_at = NOW() WHERE id = $1`,
        [referral.id]
      );
      
      // تحديث عداد الإحالات للسفير
      await db.query(
        `UPDATE users SET referral_count = referral_count + 1, updated_at = NOW() WHERE id = $1`,
        [referral.referrer_id]
      );
      
      console.log(`📨 Referral ${referral.id} converted to completed after first listing by user ${userId}`);
    }
  } catch (refErr) {
    console.error("Error processing pending referral:", refErr);
  }

  if (!videoUrl && imageUrls.length > 0) {
    await db.query(
      `UPDATE properties SET video_status = 'processing' WHERE id = $1`,
      [newListing.id]
    );
    
    // Use selected images if provided, otherwise use all images
    const imagesToUse = selectedImageIndices.length > 0 
      ? selectedImageIndices.map((idx) => imageUrls[idx]).filter(Boolean)
      : imageUrls;
    
    console.log(`[Create Listing] Video generation: using ${imagesToUse.length} images (${selectedImageIndices.length > 0 ? 'selected' : 'all'})`);
    
    // Only generate if we have images to use
    if (imagesToUse.length > 0) {
      generateListingSlideshow(newListing.id, imagesToUse, {
        title, city, district, propertyType, purpose, price, description
      }).catch(err => {
        console.error("Background slideshow generation error:", err);
      });
    } else {
      console.warn(`[Create Listing] No images available for video generation`);
    }
  }

  res.status(201).json({
    success: true,
    message: "تم إنشاء الإعلان بنجاح وسيتم مراجعته قريباً",
    listing: newListing,
    videoStatus: !videoUrl && imageUrls.length > 0 ? 'processing' : null,
    plan: { id: plan.id, name_ar: plan.name_ar, source: planSource }
  });
}));

module.exports = router;
