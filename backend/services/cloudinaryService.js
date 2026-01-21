const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Support both CLOUDINARY_URL (single variable) and individual variables
if (process.env.CLOUDINARY_URL) {
  // CLOUDINARY_URL format: cloudinary://API_KEY:API_SECRET@CLOUD_NAME
  try {
    cloudinary.config(process.env.CLOUDINARY_URL);
    cloudinary.config({ secure: true });
    console.log('[Cloudinary] ✅ Configured via CLOUDINARY_URL');
  } catch (err) {
    console.error('[Cloudinary] ❌ Failed to configure via CLOUDINARY_URL:', err.message);
  }
} else {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  
  if (cloudName && apiKey && apiSecret) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true
    });
    console.log('[Cloudinary] ✅ Configured with cloud:', cloudName);
  } else {
    console.warn('[Cloudinary] ⚠️ Missing configuration variables');
  }
}

async function uploadImage(filePath, folder = 'listings') {
  try {
    // Validate file path exists
    if (!filePath) {
      console.error('[Cloudinary] ❌ No file path provided');
      return { success: false, error: 'No file path provided' };
    }
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error('[Cloudinary] ❌ File does not exist:', filePath);
      return { success: false, error: `File not found: ${path.basename(filePath)}` };
    }
    
    // Get file stats for logging
    const stats = fs.statSync(filePath);
    console.log(`[Cloudinary] 📤 Uploading image: ${path.basename(filePath)} (${(stats.size / 1024).toFixed(2)} KB) to folder: baytaljazeera/${folder}`);
    
    const result = await cloudinary.uploader.upload(filePath, {
      folder: `baytaljazeera/${folder}`,
      resource_type: 'image',
      transformation: [
        { quality: 'auto:good', fetch_format: 'auto' }
      ]
    });
    
    console.log(`[Cloudinary] ✅ Successfully uploaded: ${result.secure_url}`);
    console.log(`[Cloudinary]    Public ID: ${result.public_id}`);
    console.log(`[Cloudinary]    Dimensions: ${result.width}x${result.height}`);
    
    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height
    };
  } catch (error) {
    console.error('[Cloudinary] ❌ Upload error for file:', filePath);
    console.error('[Cloudinary] ❌ Error details:', {
      message: error.message,
      http_code: error.http_code,
      name: error.name
    });
    return { 
      success: false, 
      error: error.message || 'Unknown upload error',
      http_code: error.http_code,
      name: error.name
    };
  }
}

async function uploadVideo(filePath, folder = 'videos') {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: `baytaljazeera/${folder}`,
      resource_type: 'video',
      eager: [
        { quality: 'auto', format: 'mp4' }
      ],
      eager_async: true
    });
    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      duration: result.duration
    };
  } catch (error) {
    console.error('[Cloudinary] Video upload error:', error);
    return { success: false, error: error.message };
  }
}

async function uploadBuffer(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `baytaljazeera/${options.folder || 'listings'}`,
        resource_type: options.resourceType || 'image',
        transformation: options.transformation || [
          { quality: 'auto:good', fetch_format: 'auto' }
        ]
      },
      (error, result) => {
        if (error) {
          console.error('[Cloudinary] Buffer upload error:', error);
          resolve({ success: false, error: error.message });
        } else {
          resolve({
            success: true,
            url: result.secure_url,
            publicId: result.public_id,
            width: result.width,
            height: result.height
          });
        }
      }
    );
    uploadStream.end(buffer);
  });
}

async function deleteImage(publicId) {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return { success: result.result === 'ok' };
  } catch (error) {
    console.error('[Cloudinary] Delete error:', error);
    return { success: false, error: error.message };
  }
}

function isCloudinaryConfigured() {
  // Support both CLOUDINARY_URL and individual variables
  const hasCloudinaryUrl = !!process.env.CLOUDINARY_URL;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const hasIndividualVars = !!(cloudName && apiKey && apiSecret);
  const configured = hasCloudinaryUrl || hasIndividualVars;
  
  // Log configuration status on first check
  if (!isCloudinaryConfigured._logged) {
    isCloudinaryConfigured._logged = true;
    if (hasCloudinaryUrl) {
      console.log('[Cloudinary] ✅ Configured via CLOUDINARY_URL');
    } else if (hasIndividualVars) {
      console.log(`[Cloudinary] ✅ Configured with cloud: ${cloudName}`);
      console.log(`[Cloudinary]    API Key: ${apiKey ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` : 'MISSING'}`);
    } else {
      console.warn('[Cloudinary] ⚠️ NOT configured - missing secrets. Images will be stored locally.');
      console.warn('[Cloudinary] Missing variables:');
      if (!cloudName) console.warn('  - CLOUDINARY_CLOUD_NAME');
      if (!apiKey) console.warn('  - CLOUDINARY_API_KEY');
      if (!apiSecret) console.warn('  - CLOUDINARY_API_SECRET');
      console.warn('[Cloudinary] Add CLOUDINARY_URL or individual variables (CLOUD_NAME, API_KEY, API_SECRET)');
    }
  }
  
  return configured;
}

async function testCloudinaryConnection() {
  if (!isCloudinaryConfigured()) {
    return {
      success: false,
      error: 'Cloudinary is not configured',
      configured: false
    };
  }
  
  try {
    // Test connection by getting account details (lightweight operation)
    const result = await cloudinary.api.ping();
    console.log('[Cloudinary] ✅ Connection test successful');
    return {
      success: true,
      configured: true,
      status: result.status || 'connected',
      cloud_name: cloudinary.config().cloud_name
    };
  } catch (error) {
    console.error('[Cloudinary] ❌ Connection test failed:', error.message);
    return {
      success: false,
      configured: true, // Config exists but connection failed
      error: error.message,
      http_code: error.http_code
    };
  }
}

function getOptimizedUrl(url, options = {}) {
  if (!url || !url.includes('cloudinary.com')) {
    return url;
  }
  
  const { width, height, quality = 'auto', format = 'auto' } = options;
  
  let transformation = `q_${quality},f_${format}`;
  if (width) transformation += `,w_${width}`;
  if (height) transformation += `,h_${height}`;
  
  return url.replace('/upload/', `/upload/${transformation}/`);
}

module.exports = {
  uploadImage,
  uploadVideo,
  uploadBuffer,
  deleteImage,
  isCloudinaryConfigured,
  testCloudinaryConnection,
  getOptimizedUrl,
  cloudinary
};
