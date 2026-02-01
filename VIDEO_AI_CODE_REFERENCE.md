# مرجع كودات الفيديو المولد بالذكاء الاصطناعي - بيت الجزيرة

**آخر تحديث:** 31 يناير 2026

---

## 📁 الملفات الرئيسية

### 1. Video Worker (Python - جديد)
**المسار:** `backend/video_worker/`

| الملف | الوظيفة |
|-------|---------|
| `server.py` | Flask API - يستقبل طلبات توليد الفيديو، يحمّل الصور من URLs، يستدعي video_engine |
| `video_engine.py` | محرك الفيديو - يستخدم MoviePy + OpenAI TTS، Ken Burns effect، أصوات الطبيعة (birds/sea) |
| `requirements.txt` | flask, gunicorn, openai, moviepy, pillow, numpy, imageio, imageio-ffmpeg, requests |
| `Dockerfile` | بناء صورة Docker للـ Video Worker مع FFmpeg و Gunicorn |
| `assets/` | ملفات صوتية (birds.mp3, sea.mp3) للخلفية |

**API Video Worker:**
- `GET /health` — فحص صحة الخدمة
- `POST /generate` — توليد فيديو
  - Body: `{ images: [urls], tier, ambience, property: {id, title, location} }`
  - Returns: ملف MP4

**Tiers:**
- `tier1_safwa` — باقة الصفوة: zoom_factor 0.01, voice alloy, أسلوب عملي
- `tier2_business` — رجال الأعمال: zoom_factor 0.04, crossfade, voice onyx, أسلوب فخم

**Ambience:** `none` | `birds` | `sea`

---

### 2. Backend - Node.js

| الملف | الوظيفة |
|-------|---------|
| `backend/routes/ai.js` | مسارات AI - توليد فيديو شرائح، فيديو متقدم، قوالب |
| `backend/services/videoService.js` | `generateListingSlideshow()` — توليد فيديو للإعلان بعد النشر |
| `backend/services/advancedVideoService.js` | `createAdvancedSlideshow()` — FFmpeg، قوالب luxury/cinematic، تحميل صور من Cloudinary |
| `backend/routes/listings.js` | `/:id/regenerate-video` — إعادة توليد فيديو لإعلان منشور |
| `backend/services/planService.js` | `video_config` — إعدادات الفيديو لكل باقة (enabled, tier, ambience) |
| `backend/queues/index.js` | videoQueue — قائمة الفيديو، Worker يستدعي generateListingSlideshow |

**Migration:**
- `backend/migrations/20260130000000_add_video_config_to_plans.js` — إضافة عمود `video_config` لجدول plans

---

### 3. Frontend

| الملف | الوظيفة |
|-------|---------|
| `frontend/app/listings/new/page.tsx` | صفحة إضافة إعلان — توليد فيديو (handleGenerateVideo, handleGenerateSlideshowVideo) |
| `frontend/app/admin/plans/page.tsx` | لوحة الإدارة — إعدادات video_config لكل باقة (enabled, tier, ambience) |
| `frontend/app/admin/ai-center/page.tsx` | مركز الذكاء الاصطناعي |

---

## 🔄 تدفق توليد الفيديو

### المسار 1: من صفحة إضافة إعلان (قبل النشر)
1. المستخدم يرفع صور → `POST /api/listings/temp-images`
2. المستخدم يضغط "توليد الفيديو" → `handleGenerateVideo()`
3. Frontend يرسل → `POST /api/ai/user/generate-video` مع imagePaths, template, بيانات العقار
4. Backend (ai.js) يستدعي `createAdvancedSlideshow()` من advancedVideoService
5. الناتج: فيديو MP4 يُخزّن في `/uploads/videos/`

### المسار 2: إعادة توليد فيديو لإعلان منشور
1. المستخدم يضغط "إعادة إنشاء الفيديو" في صفحة الإعلان
2. `POST /api/listings/:id/regenerate-video`
3. Backend يضيف job إلى `videoQueue` (أو يعالج فوراً إذا Queue معطّل)
4. Worker يستدعي `generateListingSlideshow()` من videoService
5. videoService يحمّل الصور من Cloudinary، يولد نص ترويجي بـ AI، ينشئ فيديو بـ FFmpeg

### المسار 3: Video Worker (Python) — **غير متصل حالياً**
- Video Worker خدمة منفصلة (Flask + MoviePy + OpenAI TTS)
- الـ Backend الحالي **لا يستدعي** VIDEO_WORKER_URL
- للتوصيل: يحتاج إضافة كود في ai.js أو listings.js يستدعي `POST VIDEO_WORKER_URL/generate`

---

## ⚙️ إعدادات video_config (في plans)

```json
{
  "enabled": true,
  "tier": "tier1_safwa" | "tier2_business",
  "ambience": "none" | "birds" | "sea"
}
```

- **enabled:** تفعيل ميزة الفيديو للباقة
- **tier:** نمط الفيديو (صفوة vs رجال أعمال)
- **ambience:** خلفية صوتية (بدون، طيور، بحر)

---

## 📌 ملاحظات

1. **Video Worker (Python)** موجود في الكود لكن **غير مستخدم** من الـ Backend — يحتاج ربط عبر `VIDEO_WORKER_URL`
2. **advancedVideoService.js** يستخدم FFmpeg محلياً — يعمل على السيرفر مباشرة
3. **videoService.js** يستخدم `createSlideshowVideo` من ai.js (FFmpeg)
4. **handleGenerateSlideshowVideo** في frontend معطّل — يظهر رسالة "ميزة الفيديو من صورك متاحة بعد نشر الإعلان"
