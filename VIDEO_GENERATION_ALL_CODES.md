# 📦 جميع أكواد توليد الفيديو - بيت الجزيرة

**ملف قابل للتحميل** — يحتوي على كل الكود المتعلق بتوليد الفيديو بالذكاء الاصطناعي.

**المسار:** `projects/baytaljazeera-platform/VIDEO_GENERATION_ALL_CODES.md`

---

## 📁 الفهرس

1. [backend/queues/index.js](#1-backendqueuesindexjs) — Video Queue
2. [backend/services/videoService.js](#2-backendservicesvideoservicejs) — توليد فيديو الإعلان
3. [backend/video_worker/server.py](#3-backendvideo_workerserverpy) — Video Worker (Python)
4. [backend/video_worker/video_engine.py](#4-backendvideo_workervideo_enginepy) — محرك الفيديو Python
5. [backend/video_worker/requirements.txt](#5-backendvideo_workerrequirementstxt)
6. [backend/routes/listings.js](#6-backendrouteslistingsjs) — مسار regenerate-video
7. [backend/migrations](#7-backendmigrations) — video_config
8. [backend/routes/ai.js](#8-backendroutesaijs) — createSlideshowVideo, generateDynamicPromoText
9. [backend/services/advancedVideoService.js](#9-backendservicesadvancedvideoservicejs) — قوالب الفيديو
10. [Frontend](#10-frontend) — handleGenerateVideo, handleRegenerateVideo

---

## 1. backend/queues/index.js

```javascript
// الأجزاء المتعلقة بالفيديو فقط
const { generateListingSlideshow } = require('../services/videoService');

const videoQueue = {
  async add(type, data, options = {}) {
    const queue = createQueue(QUEUE_NAMES.VIDEO);
    if (!queue) {
      console.log('🎬 Video queue disabled, processing immediately');
      return processVideoImmediately(type, data);
    }
    return queue.add(type, data, {
      attempts: 2,
      backoff: { type: 'fixed', delay: 5000 },
      ...options,
    });
  },
};

async function processVideoImmediately(type, data) {
  console.log(`🎬 Processing video immediately (queue disabled): ${type}`);
  if (type === 'listing-slideshow') {
    const { listingId, imageUrls, listingData } = data;
    if (!listingId || !imageUrls || !listingData) {
      console.error('[Video] Missing required data for listing-slideshow');
      return { success: false, error: 'Missing data' };
    }
    try {
      await generateListingSlideshow(listingId, imageUrls, listingData);
      return { success: true, processed: 'immediate' };
    } catch (err) {
      console.error('[Video] Immediate processing failed:', err.message);
      throw err;
    }
  }
  return { success: true, processed: 'immediate' };
}

// في initializeWorkers:
createWorker(QUEUE_NAMES.VIDEO, async (job) => {
  const { name, data } = job;
  console.log(`🎬 Processing video job: ${name}`);
  if (name === 'listing-slideshow') {
    const { listingId, imageUrls, listingData } = data;
    if (!listingId || !imageUrls || !listingData) {
      throw new Error('Missing required data for listing-slideshow');
    }
    await generateListingSlideshow(listingId, imageUrls, listingData);
    return { processed: true, listingId };
  }
  return { processed: true };
}, { concurrency: 2 });
```

---

## 2. backend/services/videoService.js

**الملف الكامل:** `backend/services/videoService.js`

- `checkFFmpegAvailable()` — فحص FFmpeg
- `downloadImage(url, destPath)` — تحميل صورة من URL
- `prepareImagePaths(imageUrls, listingId)` — تحضير مسارات الصور (محلي/Cloudinary)
- `cleanupTempFiles(listingId)` — تنظيف الملفات المؤقتة
- `generateListingSlideshow(listingId, imageUrls, listingData)` — الدالة الرئيسية:
  - فحص video_status (stuck)
  - تحميل الصور
  - توليد نص ترويجي بـ AI (generateDynamicPromoText)
  - إنشاء فيديو بـ createSlideshowVideo
  - رفع إلى Cloudinary
  - تحديث properties و listing_media

---

## 3. backend/video_worker/server.py

```python
"""
Flask API Server for BaytAlJazeera Video Worker
"""
import os
import requests
import tempfile
from flask import Flask, request, send_file, jsonify
from video_engine import generate_property_video

app = Flask(__name__)

def download_image(url):
    if url.startswith('http'):
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as tf:
                r = requests.get(url, timeout=30)
                r.raise_for_status()
                tf.write(r.content)
                return tf.name
        except Exception as e:
            print(f"Error downloading image {url}: {e}")
            return None
    return url

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy", "service": "video-worker"})

@app.route('/generate', methods=['POST'])
def generate():
    """
    Body: { images: [urls], tier, ambience, property: {id, title, location} }
    Returns: MP4 file
    """
    try:
        data = request.json
        if not data or not data.get('images'):
            return jsonify({"error": "No images provided"}), 400
        local_images = []
        for img in data.get('images', []):
            local_path = download_image(img)
            if local_path:
                local_images.append(local_path)
        if not local_images:
            return jsonify({"error": "Failed to download any images"}), 400
        output_path = generate_property_video(
            images=local_images,
            tier=data.get('tier', 'tier1_safwa'),
            ambience=data.get('ambience', 'none'),
            property_data=data.get('property', {})
        )
        for img in local_images:
            if img.startswith(tempfile.gettempdir()):
                try: os.remove(img)
                except: pass
        return send_file(output_path, mimetype='video/mp4', as_attachment=True,
            download_name=f"property_video_{data.get('property', {}).get('id', 'temp')}.mp4")
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)
```

---

## 4. backend/video_worker/video_engine.py

**الملف الكامل:** `backend/video_worker/video_engine.py`

- `VIDEO_CONFIG` — tier1_safwa, tier2_business
- `BaytVideoEngine` — generate_voiceover (OpenAI TTS), mix_audio (birds/sea), create_video
- `generate_property_video(images, tier, ambience, property_data)` — الدالة الرئيسية

---

## 5. backend/video_worker/requirements.txt

```
flask>=3.0.0
gunicorn>=21.2.0
openai>=1.0.0
moviepy>=1.0.3
pillow>=10.0.0
numpy>=1.24.0
imageio>=2.31.0
imageio-ffmpeg>=0.4.8
requests>=2.31.0
```

---

## 6. backend/routes/listings.js — مسار regenerate-video

```javascript
router.post("/:id/regenerate-video", authMiddlewareWithEmailCheck, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  // ... التحقق من الصلاحيات، support_level >= 3
  // ... جلب الصور من listing_media
  await db.query(`UPDATE properties SET video_status = 'processing' WHERE id = $1`, [id]);
  res.json({ success: true, message: "جاري إعادة إنشاء الفيديو من صورك...", status: "processing" });
  const listingData = { propertyType, purpose, city, district, price, title, description, bedrooms, bathrooms, landArea, buildingArea };
  videoQueue.add('listing-slideshow', { listingId: id, imageUrls, listingData }).catch(err => {
    console.error(`[Regenerate] ❌ Failed to queue video for listing ${id}:`, err.message);
    db.query(`UPDATE properties SET video_status = 'failed' WHERE id = $1`, [id]).catch(() => {});
  });
}));
```

---

## 7. backend/migrations/20260130000000_add_video_config_to_plans.js

```javascript
exports.up = async function(knex) {
  await knex.schema.alterTable('plans', (table) => {
    table.jsonb('video_config').defaultTo(JSON.stringify({
      enabled: false,
      tier: 'tier1_safwa',
      ambience: 'none'
    }));
  });
};

exports.down = async function(knex) {
  await knex.schema.alterTable('plans', (table) => {
    table.dropColumn('video_config');
  });
};
```

---

## 8. backend/routes/ai.js — الأجزاء المتعلقة بالفيديو

- `generateDynamicPromoText(listingData)` — Gemini/OpenAI → { headline, subheadline, priceTag }
- `generatePromotionalText(propertyType, purpose, city, district, price)` — fallback ثابت
- `buildAssFile(promoText, totalDuration, outPath)` — إنشاء ASS للنصوص العربية
- `createSlideshowVideo(imagePaths, outputPath, promoText, duration)` — FFmpeg شرائح + Ken Burns
- `POST /api/ai/user/generate-video` — توليد فيديو من صفحة إضافة إعلان (يستدعي createAdvancedSlideshow)
- `POST /api/ai/user/generate-slideshow-video` — فيديو شرائح (support_level >= 3)
- `POST /api/ai/user/generate-advanced-video` — فيديو متقدم مع قوالب

---

## 9. backend/services/advancedVideoService.js

- `VIDEO_TEMPLATES` — luxury, modern, classic, minimal, cinematic, premium, elegant
- `KEN_BURNS_PRESETS` — slow, dynamic, gentle, subtle, cinematic, premium, elegant
- `generateEnhancedPromoText(listingData, template)` — نص ترويجي بـ AI
- `buildAdvancedAssFile(promoText, totalDuration, outPath, template)` — ASS متقدم
- `createAdvancedSlideshow(imagePaths, outputPath, promoText, options)` — FFmpeg مع قوالب وموسيقى

---

## 10. Frontend

### handleGenerateVideo (frontend/app/listings/new/page.tsx)

```typescript
async function handleGenerateVideo() {
  // 1. رفع الصور → POST /api/listings/temp-images
  // 2. POST /api/ai/user/generate-video مع imagePaths, template, بيانات العقار
  const res = await fetch(`${API_URL}/api/ai/user/generate-video`, {
    method: "POST",
    body: JSON.stringify({ propertyType, purpose, city, district, price, landArea, buildingArea, bedrooms, bathrooms, title, description, hasPool, hasElevator, hasGarden, customPromoText, imagePaths: uploadedPaths, template: "luxury" })
  });
}
```

### handleRegenerateVideo (frontend/app/listing/[id]/page.tsx)

```typescript
async function handleRegenerateVideo() {
  const res = await fetch(`/api/listings/${listing.id}/regenerate-video`, {
    method: "POST",
    credentials: "include"
  });
  if (res.ok) {
    setListing(prev => prev ? { ...prev, video_status: 'processing' } : null);
  }
}
```

### Polling (كل 4 ثواني عند video_status === 'processing')

```typescript
useEffect(() => {
  if (listing?.video_status !== 'processing') return;
  const pollInterval = setInterval(async () => {
    const res = await fetch(`/api/listings/${listing.id}`);
    const data = await res.json();
    if (data.listing?.video_status === 'ready') {
      setListing(data.listing);
      clearInterval(pollInterval);
    } else if (data.listing?.video_status === 'failed') {
      setListing(data.listing);
      clearInterval(pollInterval);
    }
  }, 4000);
  return () => clearInterval(pollInterval);
}, [listing?.id, listing?.video_status]);
```

---

## 📌 ملخص الملفات

| الملف | الوظيفة |
|-------|---------|
| `backend/queues/index.js` | videoQueue، processVideoImmediately، Worker |
| `backend/services/videoService.js` | generateListingSlideshow |
| `backend/video_worker/server.py` | Flask API للـ Video Worker |
| `backend/video_worker/video_engine.py` | MoviePy + OpenAI TTS |
| `backend/routes/listings.js` | regenerate-video |
| `backend/routes/ai.js` | createSlideshowVideo، generateDynamicPromoText، user/generate-video |
| `backend/services/advancedVideoService.js` | createAdvancedSlideshow، قوالب |
| `backend/migrations/...video_config...` | إضافة video_config لـ plans |
| `frontend/app/listings/new/page.tsx` | handleGenerateVideo |
| `frontend/app/listing/[id]/page.tsx` | handleRegenerateVideo، Polling |
| `frontend/app/edit-listing/[id]/page.tsx` | handleRegenerateVideo |

---

**لتحميل الملف:** افتح المشروع في Cursor/VS Code، الملف موجود في جذر المشروع: `VIDEO_GENERATION_ALL_CODES.md`
