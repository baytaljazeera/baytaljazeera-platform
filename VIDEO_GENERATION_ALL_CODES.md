# 🎬 أكواد توليد الفيديو - مرجع كامل

جميع الملفات والأكواد المتعلقة بميزة توليد الفيديو الترويجي في منصة بيت الجزيرة.

---

## 1. الباكند (Backend)

### 1.1 خدمة الفيديو الرئيسية (Python Worker)
**الملف:** `backend/services/videoService.js`

- يستدعي **Python Worker** على `PYTHON_WORKER_URL` (مثلاً `https://bayt-video-worker.onrender.com`).
- يحوّل مسارات الصور النسبية (`/uploads/...`) إلى روابط كاملة حتى يستطيع الـ Worker تحميلها.
- يرسل طلب `POST` إلى `/generate` مع: `images`, `tier`, `ambience`, `voice`, `property`, `script`, `overlay_phrases`.
- يستقبل الفيديو كـ stream، يحفظه مؤقتاً، يرفعه إلى **Cloudinary**، يحدّث `properties.video_status` و `video_url` و `listing_media`.

**المتغيرات المهمة:**
- `PYTHON_WORKER_URL` — رابط سيرفس Python (محرك الفيديو).
- `BACKEND_URL` أو `API_URL` — لتحويل `/uploads/...` إلى روابط كاملة.

---

### 1.2 طابور الفيديو (Queue)
**الملف:** `backend/queues/index.js`

- **videoQueue.add('listing-slideshow', { listingId, imageUrls, listingData })** يُستخدم من مسار إعادة توليد الفيديو.
- إذا كان Redis غير مضبوط، تُنفَّذ المعالجة فوراً عبر **processVideoImmediately** التي تستدعي **generateListingSlideshow** من `videoService.js`.
- الـ Worker يستدعي نفس **generateListingSlideshow(listingId, imageUrls, listingData)**.

---

### 1.3 مسارات الـ API (Routes)

#### توليد فيديو من صفحة إعلان جديد
**الملف:** `backend/routes/ai.js`

- **POST `/api/ai/user/generate-video`** (بعد authMiddleware):
  - يتحقق من **support_level >= 2** (باقة النخبة أو أعلى).
  - يقبل: `propertyType`, `purpose`, `city`, `district`, `price`, `title`, `imagePaths`, `listingId`, `description`, `voice`, `customPromoText`.
  - يرجع فوراً **operationId** (مثل `py_xxx`) لتجنب timeout؛ الفرونت يتابع الحالة عبر **video-status**.
  - في الخلفية: يولد نص التعليق الصوتي (**generateVoiceoverScript**)، عبارات الـ overlay (**generateOverlayPhrases**)، وإذا وُجد نص مخصص يضيف التشكيل (**addTashkeelToText**)، ثم يستدعي **generateListingSlideshow** مع `script`, `voice`, `overlayPhrases`.
  - النتيجة تُحفظ في الـ cache (Redis): `video_op:${operationId}` → `{ status, videoUrl, promoText }`.

#### استعلام حالة التوليد (Polling)
**الملف:** `backend/routes/ai.js`

- **GET `/api/ai/user/video-status/:operationId`** (بعد authMiddleware):
  - يقرأ من الـ cache `video_op:${operationId}` (عمليات Python) أو من `videoOperations` (إن وُجد).
  - يتحقق من أن `opData.userId === req.user.id`.
  - يرجع: `status` (processing | completed | error)، وإذا completed: `videoUrl`, `promoText`، و`elapsedSeconds` أثناء المعالجة.

#### رفع صور مؤقتة للفيديو
**الملف:** `backend/routes/listings.js`

- **POST `/api/listings/temp-images`** (بعد authMiddlewareWithEmailCheck، مع multer `upload.array('images', 20)`):
  - يرفع الصور إلى Cloudinary إن وُجد، وإلا يحفظها محلياً.
  - يرجع **paths**: مصفوفة روابط (Cloudinary أو `/uploads/listings/xxx`).

#### إعادة توليد فيديو لإعلان منشور
**الملف:** `backend/routes/listings.js`

- **POST `/api/listings/:id/regenerate-video`** (بعد authMiddlewareWithEmailCheck):
  - يتحقق من ملكية الإعلان و**support_level >= 3** (كبار رجال الأعمال).
  - يجلب صور الإعلان من `listing_media` (kind = 'image').
  - يقبل **selectedImageIndices** (اختياري) لاختيار صور معينة.
  - يحدّث `properties.video_status = 'processing'`.
  - يرد فوراً ثم يضيف المهمة: **videoQueue.add('listing-slideshow', { listingId: id, imageUrls, listingData })**.

#### إعادة تعيين حالة الفيديو (إداري/مالك)
**الملف:** `backend/routes/listings.js`

- **POST `/api/listings/:id/reset-video-status`**: يضع `video_status = NULL`, `video_url = NULL` للإعلان.

---

### 1.4 توليد النص والعبارات (Gemini)
**الملف:** `backend/routes/ai.js`

- **generateOverlayPhrases(listingData)**  
  يطلب من Gemini 6–8 عبارات قصيرة (2–4 كلمات) للعرض فوق الصور، ويرجع مصفوفة strings.

- **generateVoiceoverScript(listingData)**  
  يطلب نصاً صوتياً مُشكّلاً (35–45 ثانية) للتعليق الصوتي.

- **addTashkeelToText(text)**  
  يضيف التشكيل للنص المخصص لتحسين النطق الآلي.

هذه الدوال تُستدعى من داخل **POST /api/ai/user/generate-video** قبل استدعاء **generateListingSlideshow**.

---

### 1.5 رفع الفيديو إلى Cloudinary
**الملف:** `backend/services/cloudinaryService.js`

- **uploadVideo(filePath, folder)**  
  يرفع ملف فيديو محلي إلى Cloudinary بـ `resource_type: 'video'` داخل مجلد `baytaljazeera/${folder}` (مثلاً `listings/${listingId}/promo`)، ويرجع `{ success, url, publicId, duration }`.

---

### 1.6 خدمة الفيديو المتقدمة (FFmpeg محلي - اختياري)
**الملف:** `backend/services/advancedVideoService.js`

- قوالب (luxury, modern, classic, minimal, cinematic, premium, elegant) مع Ken Burns وانتقالات وعناوين ASS.
- **generateEnhancedPromoText(listingData, template)** — نص ترويجي عبر OpenAI.
- **createAdvancedSlideshow(imagePaths, outputPath, promoText, options)** — يبني فيديو محلياً بـ FFmpeg (صور، ترانزشن، ترجمة ASS، صوت بيئة).
- تُستخدم إذا أردت توليد فيديو على الباكند بدون Python Worker؛ التدفق الحالي يعتمد على **videoService.js** + Python Worker.

---

## 2. محرك الفيديو (Python Worker)

### 2.1 سيرفر Flask
**الملف:** `backend/video_worker/server.py`

- **GET `/health`**: فحص صحة للسيرفس (مثل Render).
- **POST `/generate`** (JSON):
  - **images**: مصفوفة روابط صور (يجب أن تكون URLs قابلة للتحميل).
  - **tier**, **ambience**, **property**, **script**, **voice**, **overlay_phrases**.
  - يحمّل كل صورة إلى ملف مؤقت، يستدعي **generate_property_video** من `video_engine.py`، يحذف الملفات المؤقتة، ويرجع الملف الفيديو (video/mp4) كـ attachment.

### 2.2 محرك الفيديو (MoviePy + OpenAI TTS)
**الملف:** `backend/video_worker/video_engine.py`

- **BaytVideoEngine**:
  - **generate_voiceover()**: إن لم يُمرَّر `script` يولد نصاً عبر GPT، ثم ينشئ صوتاً عبر **OpenAI TTS** (tts-1-hd) ويحفظه كـ MP3.
  - **smart_crop_to_16_9(clip)**: قص ذكي 16:9 (1280x720).
  - **create_text_overlay(text, duration)**: ترجمة عربية أسفل الفيديو (خط DejaVu إن وُجد).
  - **create_video()**: تجميع الصور مع Ken Burns، crossfade، صوت + خلفية (ambience)، ترجمة overlay، ثم **write_videofile** (libx264, aac).

- **generate_property_video(images, tier, ambience, property_data, script, voice, overlay_phrases)**  
  دالة الاختصار التي تنشئ **BaytVideoEngine** وتستدعي **create_video()**.

**المتغيرات المهمة:**  
- `OPENAI_API_KEY` (للـ TTS ونص التعليق إن لم يُمرَّر).

---

## 3. الفرونتند (Frontend)

### 3.1 صفحة إعلان جديد
**الملف:** `frontend/app/listings/new/page.tsx`

- رفع الصور للفيديو: **POST** `${API_URL}/api/listings/temp-images` (FormData مع `images`).
- توليد الفيديو: **POST** `${API_URL}/api/ai/user/generate-video` (JSON) مع:  
  `propertyType`, `purpose`, `city`, `district`, `price`, `title`, `description`, `imagePaths` (من نتيجة temp-images), `voice`, `customPromoText`, إلخ.
- إذا الرد يحتوي **operationId** (بدون videoUrl)، يتم استدعاء **pollVideoStatus(operationId)**:
  - **GET** `${API_URL}/api/ai/user/video-status/${operationId}` كل 5 ثوانٍ (حتى 120 محاولة).
  - عند `status === "completed"` يتم تعيين **videoResult** و **videoPromoText**.
- الناتج يمكن ربطه بالإعلان عند الحفظ (مثلاً `aiVideoUrl`).

### 3.2 صفحة تعديل الإعلان
**الملف:** `frontend/app/edit-listing/[id]/page.tsx`

- **استدعاء إعادة التوليد:** **POST** `/api/listings/${listingId}/regenerate-video` مع (اختياري) `selectedImageIndices`.
- **Polling حالة الفيديو:** كل 4 ثوانٍ **GET** `/api/listings/${listing.id}` والتحقق من `video_status === 'ready'` أو `'failed'`.
- واجهة: اختيار صور للفيديو (تحديد الكل / إلغاء)، ثم زر "إنشاء / إعادة إنشاء الفيديو"، وعرض حالات `processing` و `ready`.

---

## 4. الأمان والحدود
**الملف:** `backend/config/security.js`

- استثناء مسار **video-status** من rate limit (لتقليل رفض طلبات الـ polling):  
  `skip: (req) => req.path?.includes('/user/video-status/')`.

---

## 5. ملخص التدفق

1. **إعلان جديد (صفحة new):**  
   رفع صور → temp-images → generate-video → operationId → polling video-status → عرض videoUrl.

2. **إعلان منشور (تعديل):**  
   regenerate-video → video_status = processing → Queue أو فوري → videoService → Python Worker → Cloudinary → video_status = ready، والفرونت يحدّث عبر polling GET listing.

3. **المتطلبات:**
   - **توليد من صفحة جديدة:** support_level >= 2، ووجود **PYTHON_WORKER_URL** و (للحالة غير المتزامنة) **Redis** لـ cache عملية التوليد.
   - **إعادة التوليد:** support_level >= 3، وRedis اختياري (إن لم يكن موجوداً تُنفَّذ المهمة فوراً).

هذا الملف يلخّص **كامل الأكواد والمسارات المتعلقة بتوليد الفيديو** في المشروع.
