# مراجعة كود الفيديو - بيت الجزيرة

**تاريخ المراجعة:** 27 يناير 2026

---

## ✅ ما يعمل بشكل صحيح

### 1. تدفق إعادة توليد الفيديو (regenerate-video)

```
Frontend → POST /api/listings/:id/regenerate-video
         → videoQueue.add('listing-slideshow', {...})
         → [Queue مفعّل] Worker يلتقط Job → generateListingSlideshow()
         → [Queue معطّل] processVideoImmediately() → generateListingSlideshow()
         → FFmpeg → Cloudinary → تحديث DB (video_status: ready)
```

- **Polling:** Frontend يفحص `/api/listings/:id` كل 4 ثواني عند `video_status === 'processing'`
- **معالجة الأخطاء:** videoService يحدّث `video_status: 'failed'` عند الفشل
- **تنظيف:** cleanupTempFiles بعد كل عملية

### 2. videoService.js

- تحميل الصور من Cloudinary أو مسارات محلية
- توليد نص ترويجي بـ AI (Gemini/OpenAI) مع fallback ثابت
- إنشاء ASS للنصوص العربية
- رفع الفيديو إلى Cloudinary
- تحديث `properties` و `listing_media`

### 3. Queue (BullMQ)

- videoQueue.add مع fallback لـ processVideoImmediately عند تعطيل Queue
- Worker concurrency: 2
- محاولتان مع backoff ثابت 5 ثواني

---

## ⚠️ ملاحظات وتحسينات مقترحة

### 1. استيراد غير مستخدم في index.js

```javascript
// index.js سطر 30
const { generateListingSlideshow } = require("./backend/services/videoService");
```

**المشكلة:** لا يُستخدم — listings.js يستخدم videoQueue الآن.

**الحل:** إزالة هذا الاستيراد.

---

### 2. videoService — prepareImagePaths للمسارات المحلية

```javascript
// videoService.js سطر 98-99
if (url.startsWith('/uploads/')) {
  const localPath = path.join(__dirname, '../../public', url);
```

**ملاحظة:** `__dirname` = `backend/services/` → `../../public` = `public/` في جذر المشروع. صحيح إذا كانت الصور في `public/uploads/`.

**تحذير:** في الإنتاج (Render/Railway)، الملفات في `/uploads/` قد تكون مؤقتة. يُفضّل استخدام Cloudinary لجميع الصور في الإنتاج.

---

### 3. videoService — متغير غير مستخدم

```javascript
// videoService.js سطر 147
const startTime = Date.now();
```

**الحل:** إزالة أو استخدامه للـ logging (مدة المعالجة).

---

### 4. Video Worker (Python) — غير متصل

- موجود في `backend/video_worker/`
- Backend لا يستدعيه
- للتوصيل: إضافة `VIDEO_WORKER_URL` واستدعاء `POST /generate` من videoService عند توفرها

---

### 5. handleGenerateSlideshowVideo — معطّل

```javascript
// frontend/app/listings/new/page.tsx
setVideoError("ميزة الفيديو من صورك متاحة بعد نشر الإعلان. جرّب الفيديو السينمائي AI!");
return;
```

**الوضع الحالي:** يظهر رسالة ولا ينفّذ توليد فيديو.

**خيارات:**
- إبقاؤه معطّلاً (السلوك الحالي)
- تفعيله مع `POST /api/ai/user/generate-slideshow-video` إذا كان المسار جاهزاً

---

### 6. user/generate-video — لا يستخدم Queue

- المسار: `POST /api/ai/user/generate-video` (قبل النشر)
- يستدعي `createAdvancedSlideshow` مباشرة (متزامن)
- المستخدم ينتظر حتى انتهاء التوليد

**ملاحظة:** مقبول للفيديو قبل النشر لأنه طلب واحد. إذا زاد الحمل، يمكن نقله إلى Queue لاحقاً.

---

### 7. video_config من الباقة — غير مستخدم

- `plans.video_config` (enabled, tier, ambience) موجود في DB
- videoService و ai.js لا يقرآنها
- Video Worker (Python) مصمّم لاستخدام tier و ambience

**الحل عند ربط Video Worker:** جلب `video_config` من باقة المستخدم وتمريرها للـ Worker.

---

## 📋 ملخص الملفات

| الملف | الحالة |
|-------|--------|
| `backend/queues/index.js` | ✅ يعمل — Video Worker يستدعي generateListingSlideshow |
| `backend/services/videoService.js` | ✅ يعمل — تحميل، AI، FFmpeg، Cloudinary |
| `backend/routes/listings.js` | ✅ يعمل — يستخدم videoQueue |
| `backend/routes/ai.js` | ✅ يعمل — createSlideshowVideo، createAdvancedSlideshow |
| `backend/services/advancedVideoService.js` | ✅ يعمل — قوالب، Ken Burns |
| `backend/video_worker/` | ⚠️ غير متصل — يحتاج VIDEO_WORKER_URL |
| `frontend handleGenerateVideo` | ✅ يعمل — يستدعي user/generate-video |
| `frontend handleGenerateSlideshowVideo` | ⚠️ معطّل |
| `index.js` | ⚠️ استيراد غير مستخدم |

---

## 🔧 إصلاحات سريعة مقترحة

1. إزالة `generateListingSlideshow` من index.js
2. إزالة أو استخدام `startTime` في videoService.js
3. تحديث VIDEO_AI_CODE_REFERENCE.md ليعكس استخدام videoQueue
