const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// 🔒 Security: Allowed MIME types for upload (used by file-type validation)
// Expanded to cover iPhone HEIC/HEIF, legacy JFIF, AVIF, BMP, TIFF, MOV — common
// real-world camera/phone exports. The actual security check is magic-byte
// validation (validateFileMagicBytes), not the claimed MIME from the browser.
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
  'image/heic', 'image/heif', 'image/avif', 'image/bmp', 'image/tiff',
  'video/mp4', 'video/webm', 'video/quicktime'
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

// 🔒 Security: Sanitize filename to prevent path traversal and malicious names.
// Accepts the wider set of real-world camera/phone extensions; if no recognized
// extension is present we default to ".bin" so the file still saves under a safe
// random name and magic-byte validation later determines real type.
function sanitizeFilename(originalname) {
  let ext = path.extname(originalname || "").toLowerCase();

  const allowedExtensions = [
    '.jpg', '.jpeg', '.jfif', '.jpe',
    '.png', '.webp', '.gif',
    '.heic', '.heif',
    '.avif', '.bmp', '.tiff', '.tif',
    '.mp4', '.webm', '.mov', '.m4v'
  ];
  if (!ext || !allowedExtensions.includes(ext)) {
    // Don't reject yet — the post-upload magic-byte check is the real gate.
    // Keep the file as ".bin" so it still writes safely.
    ext = '.bin';
  }

  const randomName = crypto.randomBytes(16).toString('hex');
  return `${Date.now()}-${randomName}${ext}`;
}

// 🔒 Security: relaxed match — returns true if the claimed mime is plausible
// for the extension. We accept the well-known iPhone/Android quirks
// ("image/jpg" without the "e", JFIF, HEIC variants) without compromising
// safety because validateFileMagicBytes will run on the actual file bytes.
function validateMimeType(mimetype, ext) {
  const mt = (mimetype || "").toLowerCase();
  const e = (ext || "").toLowerCase();

  const mimeMap = {
    '.jpg':  ['image/jpeg', 'image/jpg', 'image/pjpeg'],
    '.jpeg': ['image/jpeg', 'image/jpg', 'image/pjpeg'],
    '.jpe':  ['image/jpeg', 'image/jpg'],
    '.jfif': ['image/jpeg', 'image/jpg'],
    '.png':  ['image/png', 'image/x-png'],
    '.webp': ['image/webp'],
    '.gif':  ['image/gif'],
    '.heic': ['image/heic', 'image/heif', 'image/jpeg', 'application/octet-stream'],
    '.heif': ['image/heif', 'image/heic', 'image/jpeg', 'application/octet-stream'],
    '.avif': ['image/avif', 'image/jpeg'],
    '.bmp':  ['image/bmp', 'image/x-ms-bmp'],
    '.tif':  ['image/tiff'],
    '.tiff': ['image/tiff'],
    '.mp4':  ['video/mp4', 'application/mp4', 'video/x-m4v'],
    '.m4v':  ['video/mp4', 'video/x-m4v'],
    '.webm': ['video/webm'],
    '.mov':  ['video/quicktime', 'video/mp4'],
  };

  const allowedMimes = mimeMap[e];
  if (!allowedMimes) return false;

  // Direct match
  if (allowedMimes.includes(mt)) return true;
  // Any image/* extension accepts any image/* mime (covers misreported mimes
  // from older browsers / WhatsApp / Outlook). Magic bytes still gate it.
  if (e.match(/^\.(jpg|jpeg|jpe|jfif|png|webp|gif|heic|heif|avif|bmp|tif|tiff)$/) && mt.startsWith('image/')) {
    return true;
  }
  return false;
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

// Lenient pre-upload filter — admit anything that LOOKS like an image/video.
// Final security gate is post-upload magic-byte validation (see validateFileMagicBytes
// usage in routes/listings.js). This avoids spurious rejections of HEIC/HEIF from
// iPhone, JFIF from Outlook, WhatsApp-mangled MIME, etc.
const fileFilter = (req, file, cb) => {
  const mt = (file.mimetype || "").toLowerCase();
  const ext = path.extname(file.originalname || "").toLowerCase();

  // Accept if claimed MIME is in our wider whitelist.
  if (ALLOWED_MIME_TYPES.has(mt)) return cb(null, true);

  // Accept if extension is recognized AND MIME at least starts with image/ or video/
  // (handles browsers/clients that send "application/octet-stream" for HEIC, etc.)
  const knownExt = /\.(jpg|jpeg|jpe|jfif|png|webp|gif|heic|heif|avif|bmp|tif|tiff|mp4|webm|mov|m4v)$/i;
  if (knownExt.test(ext) && (mt.startsWith('image/') || mt.startsWith('video/') || mt === 'application/octet-stream' || mt === '')) {
    return cb(null, true);
  }

  // Last-resort: be tolerant if MIME generically looks like image/video, even with unknown extension
  // — the magic-byte check downstream will reject if it's actually malicious.
  if (mt.startsWith('image/') || mt.startsWith('video/')) {
    return cb(null, true);
  }

  return cb(new Error(`نوع الملف غير مدعوم (${mt || ext || 'غير معروف'}). الأنواع المدعومة: JPG/PNG/HEIC/WebP/GIF/MP4.`), false);
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
