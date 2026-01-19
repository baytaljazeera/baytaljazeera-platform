const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

async function uploadImage(filePath, folder = 'listings') {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: `baytaljazeera/${folder}`,
      resource_type: 'image',
      transformation: [
        { quality: 'auto:good', fetch_format: 'auto' }
      ]
    });
    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height
    };
  } catch (error) {
    console.error('[Cloudinary] Upload error:', error);
    return { success: false, error: error.message };
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
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
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
  getOptimizedUrl,
  cloudinary
};
