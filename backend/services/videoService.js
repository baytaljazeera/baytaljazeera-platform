const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');
const { execSync, spawnSync } = require('child_process');
const axios = require('axios');
const db = require('../db');
const { uploadVideo, isCloudinaryConfigured } = require('./cloudinaryService');
const replicateVideoService = require('./replicateVideoService');

const PYTHON_WORKER_URL = process.env.PYTHON_WORKER_URL || '';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';

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

function clamp(n, a, b) {
  const x = Number(n);
  if (!Number.isFinite(x)) return a;
  return Math.max(a, Math.min(b, x));
}

function computeDurationPerImage(imageCount, targetDurationSec) {
  const n = Math.max(2, Number(imageCount || 2));
  const target = clamp(targetDurationSec ?? 120, 8, 180);
  const dpi = Math.round(target / n);
  return clamp(dpi, 3, 20);
}

async function elevenLabsTTSToMp3(text, voiceId) {
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_API_KEY.trim()) {
    throw new Error('ELEVENLABS_API_KEY غير مضبوط');
  }
  const pronunciationDict = {
    'المحرق': 'المُحَرَّق',
    'محرق': 'مُحَرَّق',
    'المنامة': 'المَنامة',
    'الدمام': 'الدَّمّام',
    'جدة': 'جِدَّة',
    'مكة': 'مَكَّة',
    'المكرمة': 'المُكَرَّمة',
    'المنورة': 'المُنَوَّرة',
    'الرياض': 'الرِّياض',
    'الدوحة': 'الدَّوحة',
    'الشارقة': 'الشّارقة',
    'عجمان': 'عَجمان',
    'الفجيرة': 'الفُجيرة',
    'صلالة': 'صَلالة',
    'مسقط': 'مَسقط',
    'الكويت': 'الكُوَيت',
    'لاتفوت': 'لا تُفَوِّتْ',
    'لا تفوت': 'لا تُفَوِّتْ',
    'تفوت': 'تُفَوِّتْ',
    'الفرصة': 'الفُرصة',
    'فرصة': 'فُرصة',
    'الزهرة': 'الزَّهرة',
    'زهرة': 'زَهرة',
    'الزهراء': 'الزَّهراء',
    'النزهة': 'النُّزهة',
    'نزهة': 'نُزهة',
    'الروضة': 'الرَّوضة',
    'روضة': 'رَوضة',
    'الحمراء': 'الحَمراء',
    'العزيزية': 'العَزيزيّة',
    'السليمانية': 'السُّلَيمانيّة',
    'الشفاء': 'الشِّفاء',
    'النسيم': 'النَّسيم',
    'العليا': 'العُليا',
    'السلامة': 'السَّلامة',
    'الصفا': 'الصَّفا',
    'المروج': 'المُروج',
    'الياسمين': 'الياسَمين',
    'النرجس': 'النَّرجِس',
    'الملقا': 'المَلقا',
  };
  let processedText = String(text || '').trim()
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g, '');
  for (const [word, phonetic] of Object.entries(pronunciationDict)) {
    processedText = processedText.replace(new RegExp(word, 'g'), phonetic);
  }
  const cleanText = processedText.slice(0, 3000);
  if (!cleanText) throw new Error('نص الصوت فارغ');
  const v = String(voiceId || '').trim();
  if (!v || v.length < 10) throw new Error('voiceId غير صالح لـ ElevenLabs');

  console.log('[TTS] Clean text (no tashkeel):', cleanText.substring(0, 100) + '...');

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(v)}`;
  const outDir = path.join(os.tmpdir(), 'video-gen', 'tts');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `tts_${Date.now()}.mp3`);

  const res = await axios.post(
    url,
    {
      text: cleanText,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.6, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true }
    },
    {
      responseType: 'arraybuffer',
      timeout: 120000,
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY.trim(),
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      }
    }
  );

  fs.writeFileSync(outPath, Buffer.from(res.data));
  if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 2000) {
    throw new Error('فشل توليد الصوت من ElevenLabs');
  }
  console.log(`[TTS] Audio saved: ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
  return outPath;
}

function getAudioDuration(audioPath) {
  try {
    const result = spawnSync('ffprobe', [
      '-v', 'quiet', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', audioPath
    ], { encoding: 'utf8', timeout: 10000 });
    const dur = parseFloat(result.stdout?.trim());
    if (dur && dur > 0) {
      console.log(`[TTS] Audio duration: ${dur.toFixed(1)}s`);
      return dur;
    }
  } catch (e) {
    console.warn('[TTS] Could not get audio duration:', e.message);
  }
  return 0;
}

function muxAudioIntoVideo(videoPath, audioPath, outPath) {
  const r = spawnSync('ffmpeg', [
    '-y', '-i', videoPath, '-i', audioPath,
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
    '-shortest', '-movflags', '+faststart',
    outPath
  ], { stdio: 'ignore' });
  if (r.status !== 0) throw new Error('فشل دمج الصوت مع الفيديو');
  return outPath;
}

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

function toAbsoluteImageUrls(paths) {
  const base = (process.env.BACKEND_URL || process.env.API_URL || 'https://baytaljazeera-backend.onrender.com').replace(/\/$/, '');
  return paths.map(p => {
    const url = typeof p === 'string' ? p.trim() : '';
    if (!url) return url;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/') && !url.startsWith('//')) return `${base}${url}`;
    return url;
  }).filter(Boolean);
}

async function generateListingSlideshow(listingId, imageUrls, listingData) {
  const startTime = Date.now();
  const MAX_PROCESSING_TIME = 10 * 60 * 1000; // 10 minutes timeout
  
  console.log(`[Video] ========================================`);
  console.log(`[Video] Starting video generation for listing ${listingId}`);
  console.log(`[Video] Image URLs count: ${imageUrls.length}`);
  console.log(`[Video] Replicate configured: ${replicateVideoService.isConfigured()}`);
  console.log(`[Video] FFmpeg available: ${ffmpegAvailable}`);
  console.log(`[Video] Cloudinary configured: ${isCloudinaryConfigured()}`);

  // الجودة العالية (صوت + تأثيرات):
  // سابقاً كنا نمر عبر Python Worker (PYTHON_WORKER_URL + /generate).
  // حالياً الاعتماد الأساسي على Replicate مباشرة، ويمكن إعادة تفعيل الـ Worker لاحقاً عبر USE_PYTHON_VIDEO_WORKER=1.
  const preferFastOnly = listingData.videoQuality === 'fast';
  const usePythonWorker = !!PYTHON_WORKER_URL && process.env.USE_PYTHON_VIDEO_WORKER === '1';
  const targetDurationSec = Number(listingData?.targetDurationSec ?? 120);
  if (usePythonWorker && !preferFastOnly && imageUrls.length >= 2) {
    const absoluteUrls = toAbsoluteImageUrls(imageUrls);
    const workerUrl = PYTHON_WORKER_URL.replace(/\/$/, '') + '/generate';
    console.log('[Video] 🎙️ Trying Python Worker (high quality: voice + effects)');
    try {
      const voice = ['onyx', 'ash', 'fable', 'echo', 'alloy'].includes(String(listingData.voice || '').toLowerCase())
        ? String(listingData.voice).toLowerCase()
        : 'onyx';
      const payload = {
        images: absoluteUrls.slice(0, 12),
        tier: 'tier2_business',
        ambience: 'none',
        voice,
        property: {
          id: String(listingId),
          title: listingData.title || 'عقار مميز',
          location: [listingData.city, listingData.district].filter(Boolean).join('، ') || listingData.city,
          price: listingData.price,
          details: listingData.description
        }
      };
      if (listingData.elevenlabsVoiceId && String(listingData.elevenlabsVoiceId).length > 10) {
        payload.elevenlabs_voice_id = String(listingData.elevenlabsVoiceId).trim();
      }
      const res = await axios.post(workerUrl, payload, { responseType: 'arraybuffer', timeout: 300000 }); // 5 دقائق للسماح بالتوليد الكامل
      const tempDir = path.join(os.tmpdir(), 'video-gen', 'worker');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      const tempPath = path.join(tempDir, `worker_${listingId}_${Date.now()}.mp4`);
      fs.writeFileSync(tempPath, res.data);
      if (isCloudinaryConfigured()) {
        const folder = `listings/${listingId}/promo`;
        const uploadResult = await uploadVideo(tempPath, folder);
        try { fs.unlinkSync(tempPath); } catch (_) {}
        if (uploadResult.success && uploadResult.url) {
          if (!String(listingId).startsWith('temp_')) {
            await db.query(`UPDATE properties SET video_status = 'ready', video_url = $1 WHERE id = $2`, [uploadResult.url, listingId]).catch(() => {});
          }
          console.log('[Video] ✅ Worker success:', uploadResult.url);
          let promoText = null;
          try {
            if (generateDynamicPromoText) promoText = await generateDynamicPromoText(listingData);
          } catch (_) {}
          return { url: uploadResult.url, promoText };
        }
      }
      throw new Error('فشل رفع الفيديو من Worker');
    } catch (workerErr) {
      if (!String(listingId).startsWith('temp_')) {
        await db.query(`UPDATE properties SET video_status = 'failed' WHERE id = $1`, [listingId]).catch(() => {});
      }
      const status = workerErr.response?.status;
      const data = workerErr.response?.data;
      const msg = data
        ? (typeof data === 'string' ? data : (data.error || workerErr.message))
        : workerErr.message || '';
      const isTimeout = workerErr.code === 'ECONNABORTED' || msg.includes('timeout');
      const isVoiceUnavailable = status === 503 || (msg && (msg.includes('OPENAI_API_KEY') || msg.includes('Voice not available')));
      if (isVoiceUnavailable) {
        throw new Error('التوليد بجودة عالية (صوت) غير مفعّل على الخادم. راجع إعدادات خدمة الفيديو (OPENAI_API_KEY) أو اختر «سريع فقط (صور بدون صوت)».');
      }
      if (isTimeout) {
        throw new Error('انتهت مهلة توليد الفيديو بجودة عالية (صوت). جرّب عدد صور أقل (3–8) أو اختر «سريع فقط».');
      }
      throw new Error('فشل توليد الفيديو بجودة عالية (صوت + تأثيرات). تحقق من خدمة الفيديو أو جرّب «سريع فقط (صور بدون صوت)».');
    }
  }

  // For "full" quality with FFmpeg available: use FFmpeg directly (Ken Burns effects + transitions)
  // For "fast" quality: use Replicate (basic slideshow, faster)
  const useFFmpegDirect = !preferFastOnly && ffmpegAvailable && createSlideshowVideo;

  if (!useFFmpegDirect && replicateVideoService.isConfigured()) {
    console.log(`[Video] 🚀 Using Replicate (fast slideshow mode)`);
    const absoluteUrls = toAbsoluteImageUrls(imageUrls);
    if (absoluteUrls.length < 2) {
      await db.query(`UPDATE properties SET video_status = 'failed' WHERE id = $1`, [listingId]).catch(() => {});
      throw new Error('يحتاج الفيديو صورتين على الأقل. تحقق من روابط الصور أو اختر 2–8 صور.');
    }
    if (!String(listingId).startsWith('temp_')) {
      await db.query(`UPDATE properties SET video_status = 'processing' WHERE id = $1`, [listingId]).catch(() => {});
    }
    try {
      const duration_per_image = computeDurationPerImage(absoluteUrls.length, targetDurationSec);
      const result = await replicateVideoService.generateSlideshowVideo(listingId, absoluteUrls, {
        duration_per_image,
        resolution: '1080p',
        maxWaitMs: 300000
      });
      let videoUrl = result.url;

      if (!String(listingId).startsWith('temp_')) {
        await db.query(
          `UPDATE properties SET video_status = 'ready', video_url = $1 WHERE id = $2`,
          [videoUrl, listingId]
        );
        const existingVideo = await db.query(
          `SELECT id FROM listing_media WHERE listing_id = $1 AND kind = 'video'`,
          [listingId]
        );
        if (existingVideo.rows.length > 0) {
          await db.query(
            `UPDATE listing_media SET url = $1 WHERE listing_id = $2 AND kind = 'video'`,
            [videoUrl, listingId]
          );
        } else {
          await db.query(
            `INSERT INTO listing_media (listing_id, url, kind, is_cover, sort_order) VALUES ($1, $2, 'video', false, 999)`,
            [listingId, videoUrl]
          );
        }
      }
      console.log('[Video] ✅ Replicate fast mode success:', videoUrl);
      return { url: videoUrl, promoText: null };
    } catch (err) {
      const msg = err?.message || '';
      const isReplicateFail = msg.includes('توكن Replicate') || msg.includes('401') || msg.includes('402') || msg.includes('رصيد');
      if (isReplicateFail) {
        console.warn('[Video] ⚠️ Replicate 401/402 — falling back to FFmpeg');
      }
      if (!isReplicateFail || !ffmpegAvailable) {
        if (!String(listingId).startsWith('temp_')) {
          await db.query(`UPDATE properties SET video_status = 'failed' WHERE id = $1`, [listingId]).catch(() => {});
        }
        throw err;
      }
      console.log('[Video] Using FFmpeg fallback after Replicate failure');
    }
  }

  if (useFFmpegDirect) {
    console.log('[Video] 🎬 Using FFmpeg (full quality: Ken Burns + transitions + voiceover)');
  }
  
  const isRealListing = !String(listingId).startsWith('temp_');

  // Check if video has been processing for too long (stuck)
  if (isRealListing) {
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
  }
  
  try {
    if (!ffmpegAvailable) {
      ffmpegAvailable = checkFFmpegAvailable();
      if (!ffmpegAvailable) {
        if (isRealListing) {
          await db.query(
            `UPDATE properties SET video_status = 'failed' WHERE id = $1`,
            [listingId]
          );
        }
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
    
    let audioPath = null;
    let audioDuration = 0;
    const maybeElevenVoiceId = String(listingData?.elevenlabsVoiceId || '').trim();
    const voiceIdFromUI = String(listingData?.voice || '').trim();
    const chosenElevenId =
      (maybeElevenVoiceId && maybeElevenVoiceId.length > 10) ? maybeElevenVoiceId :
      (voiceIdFromUI && voiceIdFromUI.length > 10) ? voiceIdFromUI : '';

    if (!preferFastOnly && chosenElevenId && ELEVENLABS_API_KEY && ELEVENLABS_API_KEY.trim()) {
      try {
        console.log('[Video] 🎙️ Step 1: Generating voiceover FIRST to determine video length...');
        const ttsText = promoText?.voiceScript
          || [
            promoText?.headline || promoText?.topLine || '',
            promoText?.subheadline || promoText?.midLine || '',
            promoText?.priceTag || promoText?.callToAction || ''
          ].filter(Boolean).join('. ');

        if (ttsText) {
          console.log('[Video] 📝 Voice script:', ttsText.substring(0, 100) + '...');
          if (promoText) promoText._voiceScript = ttsText;
          audioPath = await elevenLabsTTSToMp3(ttsText, chosenElevenId);
          audioDuration = getAudioDuration(audioPath);
          console.log(`[Video] ✅ Audio generated: ${audioDuration.toFixed(1)}s`);
        }
      } catch (ttsErr) {
        console.warn('[Video] ⚠️ ElevenLabs TTS failed, will create video without audio:', ttsErr.message);
        audioPath = null;
        audioDuration = 0;
      }
    } else {
      console.log('[Video] ℹ️ No ElevenLabs voiceId/key — creating video without audio.');
    }
    
    const duration = audioDuration > 10 ? Math.ceil(audioDuration) + 3 : clamp(targetDurationSec, 8, 180);
    console.log(`[Video] 🎬 Step 2: Creating video (${duration}s to match audio ${audioDuration.toFixed(1)}s)...`);
    console.log(`[Video] Output path: ${videoPath}`);
    
    try {
      await createSlideshowVideo(imagePaths, videoPath, promoText, duration);
      console.log(`[Video] ✅ Video created successfully`);
    } catch (ffmpegError) {
      console.error(`[Video] ❌ FFmpeg failed:`, ffmpegError.message);
      throw new Error(`FFmpeg video creation failed: ${ffmpegError.message}`);
    }
    
    let videoToUpload = videoPath;
    if (audioPath && fs.existsSync(audioPath)) {
      try {
        console.log('[Video] 🔊 Step 3: Merging audio with video...');
        const outWithAudio = path.join(videoDir, `slideshow_${listingId}_${Date.now()}_audio.mp4`);
        muxAudioIntoVideo(videoPath, audioPath, outWithAudio);
        try { fs.unlinkSync(audioPath); } catch (_) {}
        try { fs.unlinkSync(videoPath); } catch (_) {}
        videoToUpload = outWithAudio;
        console.log('[Video] ✅ Audio muxed successfully - video synced with voiceover');
      } catch (muxErr) {
        console.warn('[Video] ⚠️ Audio mux failed, using video without audio:', muxErr.message);
        try { if (audioPath) fs.unlinkSync(audioPath); } catch (_) {}
      }
    }

    if (!fs.existsSync(videoToUpload)) {
      throw new Error('Video file was not created');
    }
    
    const videoSize = fs.statSync(videoToUpload).size;
    console.log(`[Video] Video file size: ${(videoSize / 1024 / 1024).toFixed(2)} MB`);
    
    if (videoSize < 1000) {
      throw new Error('Video file is too small, generation may have failed');
    }
    
    if (isCloudinaryConfigured()) {
      console.log(`[Video] Uploading video to Cloudinary...`);
      try {
        const cloudinaryResult = await uploadVideo(videoToUpload, 'videos');
        if (cloudinaryResult.success) {
          finalVideoUrl = cloudinaryResult.url;
          console.log(`[Video] ✅ Video uploaded to Cloudinary: ${finalVideoUrl}`);
          try { fs.unlinkSync(videoToUpload); } catch (_) {}
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
    
    if (isRealListing) {
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
    }
    
    console.log(`[Video] ========================================`);
    console.log(`[Video] ✅ Video ready for listing ${listingId}: ${finalVideoUrl}`);
    return { url: finalVideoUrl, promoText };
    
  } catch (error) {
    console.error(`[Video] ========================================`);
    console.error(`[Video] ❌ Error for listing ${listingId}:`, error.message);
    console.error(`[Video] Stack:`, error.stack);
    
    cleanupTempFiles(String(listingId));
    
    if (isRealListing) {
      try {
        await db.query(
          `UPDATE properties SET video_status = 'failed' WHERE id = $1`,
          [listingId]
        );
        console.log(`[Video] Updated status to 'failed' in database`);
      } catch (dbErr) {
        console.error("[Video] Failed to update status:", dbErr.message);
      }
    }
    
    throw error;
  }
}

module.exports = {
  generateListingSlideshow,
  checkFFmpegAvailable,
};
