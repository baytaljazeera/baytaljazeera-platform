const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// 🔒 Security: Allowed MIME types for upload (used by file-type validation)
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm'
]);

// 🔒 Security: Use file-type library for robust magic byte detection
let fileTypeFromBuffer = null;
(async () => {
  try {
    const { fileTypeFromBuffer: ftfb } = await import('file-type');
    fileTypeFromBuffer = ftfb;
    console.log('✅ file-type library loaded for upload security');
  } catch (err) {
    console.warn('⚠️ file-type library not loaded, using fallback validation');
  }
})();

// 🔒 Security: Validate file using file-type library (server-side detection)
// Accepts either a file path (string) or a buffer directly
async function validateFileMagicBytes(filePathOrBuffer) {
  try {
    let buffer;
    const isBuffer = Buffer.isBuffer(filePathOrBuffer);
    
    if (isBuffer) {
      buffer = filePathOrBuffer;
    } else if (typeof filePathOrBuffer === 'string') {
      buffer = fs.readFileSync(filePathOrBuffer);
    } else {
      console.warn('[Multer] Invalid input to validateFileMagicBytes');
      return { valid: false, detectedType: null };
    }
    
    // Use file-type library if available (more robust)
    if (fileTypeFromBuffer) {
      const type = await fileTypeFromBuffer(buffer);
      if (!type) {
        console.warn('[Multer] file-type could not detect file type');
        return { valid: false, detectedType: null };
      }
      
      const isAllowed = ALLOWED_MIME_TYPES.has(type.mime);
      if (!isAllowed) {
        console.warn('[Multer] Detected type not allowed:', type.mime);
      }
      return { valid: isAllowed, detectedType: type.mime };
    }
    
    // Fallback: manual magic byte detection
    if (buffer.length < 12) {
      return { valid: false, detectedType: null };
    }
    
    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return { valid: true, detectedType: 'image/jpeg' };
    }
    
    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return { valid: true, detectedType: 'image/png' };
    }
    
    // GIF: GIF87a or GIF89a
    const gifSig = buffer.slice(0, 6).toString('ascii');
    if (gifSig === 'GIF87a' || gifSig === 'GIF89a') {
      return { valid: true, detectedType: 'image/gif' };
    }
    
    // WebP: RIFF....WEBP
    const riff = buffer.slice(0, 4).toString('ascii');
    const webp = buffer.slice(8, 12).toString('ascii');
    if (riff === 'RIFF' && webp === 'WEBP') {
      return { valid: true, detectedType: 'image/webp' };
    }
    
    // MP4: ftyp box at offset 4
    const ftyp = buffer.slice(4, 8).toString('ascii');
    if (ftyp === 'ftyp') {
      return { valid: true, detectedType: 'video/mp4' };
    }
    
    // WebM: 1A 45 DF A3
    if (buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3) {
      return { valid: true, detectedType: 'video/webm' };
    }
    
    console.warn('[Multer] Unknown file signature:', buffer.slice(0, 8).toString('hex'));
    return { valid: false, detectedType: null };
  } catch (err) {
    console.error('[Multer] Magic byte validation error:', err.message);
    return { valid: false, detectedType: null };
  }
}

// 🔒 Security: Sanitize filename to prevent path traversal and malicious names
function sanitizeFilename(originalname) {
  // Get extension safely
  const ext = path.extname(originalname).toLowerCase();
  
  // Validate extension against allowed list
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.webm'];
  if (!allowedExtensions.includes(ext)) {
    return null; // Invalid extension
  }
  
  // Generate secure random filename (no user input)
  const randomName = crypto.randomBytes(16).toString('hex');
  return `${Date.now()}-${randomName}${ext}`;
}

// 🔒 Security: Validate MIME type matches extension
function validateMimeType(mimetype, ext) {
  const mimeMap = {
    '.jpg': ['image/jpeg'],
    '.jpeg': ['image/jpeg'],
    '.png': ['image/png'],
    '.webp': ['image/webp'],
    '.gif': ['image/gif'],
    '.mp4': ['video/mp4'],
    '.webm': ['video/webm']
  };
  
  const allowedMimes = mimeMap[ext] || [];
  return allowedMimes.includes(mimetype);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../public/uploads/listings');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // 🔒 Security: Use sanitized filename
    const safeFilename = sanitizeFilename(file.originalname);
    if (!safeFilename) {
      return cb(new Error('امتداد الملف غير مدعوم'));
    }
    cb(null, safeFilename);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'];
  
  // 🔒 Security: Validate MIME type
  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error('نوع الملف غير مدعوم'), false);
  }
  
  // 🔒 Security: Validate extension matches MIME type
  const ext = path.extname(file.originalname).toLowerCase();
  if (!validateMimeType(file.mimetype, ext)) {
    return cb(new Error('نوع الملف لا يتطابق مع الامتداد'), false);
  }
  
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { 
    fileSize: 20 * 1024 * 1024, // 20MB max per file (increased from 10MB for better video support)
    files: 20, // Max 20 files per request (allows for 15 images + 1 video + buffer)
    fieldSize: 1024 * 1024 // 1MB max field size
  }
});

function cleanupUploadedFiles(files) {
  if (!files) return;
  const allFiles = [...(files.images || []), ...(files.video || [])];
  allFiles.forEach(file => {
    try {
      fs.unlinkSync(file.path);
    } catch (e) {
      console.error("Error cleaning up file:", file.path, e);
    }
  });
}

module.exports = {
  upload,
  cleanupUploadedFiles,
  validateFileMagicBytes,
};
