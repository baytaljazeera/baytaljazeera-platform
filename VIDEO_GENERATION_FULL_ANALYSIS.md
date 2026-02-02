# تحليل شامل لأكواد توليد الفيديو — وسبب عدم العمل

## 1. تدفق التوليد (Flow)

### مسار أ: إعلان جديد (قبل النشر)
```
Frontend (listings/new) 
  → POST /api/listings/temp-images (رفع صور)
  → POST /api/ai/user/generate-video (imagePaths, بيانات العقار)
  → Backend يرد فوراً بـ operationId
  → Frontend يتابع GET /api/ai/user/video-status/:operationId كل 5 ثوانٍ
  → Backend يعالج في الخلفية: videoService → Python Worker → Cloudinary
  → عند الانتهاء: cache.set(video_op:xxx, { status: completed, videoUrl })
```

### مسار ب: إعادة توليد لإعلان منشور
```
Frontend (edit-listing أو listing/[id])
  → POST /api/listings/:id/regenerate-video
  → Backend يضيف للـ Queue (أو يعالج فوراً إذا لا Redis)
  → videoQueue / processVideoImmediately → videoService → Python Worker → Cloudinary
  → تحديث properties.video_status و video_url
```

---

## 2. الأكواد الرئيسية

### 2.1 Frontend — صفحة إضافة إعلان
**الملف:** `frontend/app/listings/new/page.tsx`

```javascript
// رفع صور مؤقتة
const uploadRes = await fetch(`${API_URL}/api/listings/temp-images`, {...});
const uploadedPaths = uploadData.paths || [];  // قد تكون Cloudinary URLs أو /uploads/...

// طلب توليد الفيديو
const res = await fetch(`${API_URL}/api/ai/user/generate-video`, {
  body: JSON.stringify({
    propertyType, purpose, city, district, price, title, description,
    imagePaths: uploadedPaths,  // ⚠️ قد تكون مسارات نسبية
    customPromoText, voice, template
  })
});

// إذا async: يرد operationId — نتابع الحالة
if (data.operationId) {
  await pollVideoStatus(data.operationId);  // كل 5 ثوانٍ لمدة 10 دقائق
}
```

### 2.2 Backend — رفع صور مؤقتة
**الملف:** `backend/routes/listings.js` (temp-images)

```javascript
// إذا Cloudinary مُعد: يرد روابط كاملة
paths.push(cloudinaryUrl);  // https://res.cloudinary.com/...

// إذا لا Cloudinary: يرد مسارات محلية
paths.push(`/uploads/listings/${file.filename}`);  // ⚠️ مسار نسبي
```

### 2.3 Backend — مسار توليد الفيديو
**الملف:** `backend/routes/ai.js` (user/generate-video)

```javascript
// التحقق من الباقة: support_level >= 2
if (supportLevel < 2) {
  return res.status(403).json({ error: "ميزة توليد الفيديو متاحة لمشتركي الباقات المميزة" });
}

// تنظيف مسارات الصور (إزالة :1 من نهاية الروابط)
cleanImages = imagePaths.map(url => url.replace(/:\d+$/, '').trim()).filter(Boolean);

// يرد فوراً ويُكمل في الخلفية
res.json({ success: true, operationId, status: "processing" });

(async () => {
  const result = await generateListingSlideshow(targetId, cleanImages, listingData, {...});
  await cache.set(`video_op:${operationId}`, { ...op, status: "completed", videoUrl: result.url }, 600);
})()
```

### 2.4 Backend — خدمة الفيديو
**الملف:** `backend/services/videoService.js`

```javascript
const PYTHON_WORKER_URL = process.env.PYTHON_WORKER_URL || 'http://127.0.0.1:8080';

// يرسل الصور كما هي إلى Python
const requestPayload = {
  images: imageUrls,  // ⚠️ إذا كانت /uploads/... فـ Python لا يستطيع تحميلها
  tier: 'tier2_business',
  ambience: 'birds',
  voice: voice || 'onyx',
  property: { id, title, location, price, details }
};

response = await axios.post(`${PYTHON_WORKER_URL}/generate`, requestPayload, {
  responseType: 'stream',
  timeout: 600000
});
```

### 2.5 Python Worker — تحميل الصور
**الملف:** `backend/video_worker/server.py`

```python
def download_image(url):
    if url.startswith('http'):
        # يحمّل عبر requests.get
        r = requests.get(url, timeout=30)
        ...
        return local_temp_path
    return url  # إذا ليس http: يُرجع المسار كما هو (يفترض ملف محلي)

# في generate():
for img in data.get('images', []):
    local_path = download_image(img)  # /uploads/... يُرجع كما هو
    if local_path:
        local_images.append(local_path)  # يُضاف /uploads/listings/xxx
```

### 2.6 Python Engine — التحقق من الصور
**الملف:** `backend/video_worker/video_engine.py`

```python
for i, img_path in enumerate(self.images):
    if not os.path.exists(img_path):  # /uploads/... غير موجود على سيرفر Python!
        print(f"[VideoEngine] ⚠️ Image not found: {img_path}")
        continue
    ...
if not clips:
    raise ValueError("No valid images found to create video")  # ❌ فشل
```

### 2.7 Redis / Cache
**الملف:** `backend/config/redis.js` + `backend/routes/ai.js`

```javascript
// video_op يُخزّن في Redis أو memory
await cache.set(`video_op:${operationId}`, opData, 600);

// بدون Redis: memory cache — يُفقد عند إعادة تشغيل السيرفر
// Frontend يتابع → 404 "عملية التوليد غير موجودة أو انتهت صلاحيتها"
```

### 2.8 Queue (BullMQ)
**الملف:** `backend/queues/index.js`

```javascript
// بدون Redis: videoQueue.add يستدعي processVideoImmediately
// مع Redis: يضيف للـ Queue ويُعالج Worker

videoQueue.add('listing-slideshow', { listingId, imageUrls, listingData });
```

---

## 3. أسباب فشل التوليد

### السبب 1: مسارات الصور النسبية (أهم احتمال)
**المشكلة:** عند عدم استخدام Cloudinary، `temp-images` يرد مسارات مثل `/uploads/listings/xxx.jpg`.

- الباكند يمرّرها كما هي إلى Python Worker.
- Python Worker يعمل على خدمة منفصلة (مثلاً bayt-video-worker).
- المسار `/uploads/listings/xxx.jpg` غير موجود على سيرفر Python.
- النتيجة: `Image not found` → `No valid images found to create video`.

**الحل:** ✅ تم تنفيذه في `videoService.js` — الدالة `toAbsoluteImageUrls` تحوّل المسارات النسبية تلقائياً قبل الإرسال لـ Python.

---

### السبب 2: PYTHON_WORKER_URL غير مضبوط
**المشكلة:** على Render، إذا لم يُضبط `PYTHON_WORKER_URL`، الكود يستخدم `http://127.0.0.1:8080`.

- Python Worker يعمل على خدمة أخرى.
- الطلب يذهب إلى localhost على سيرفر الباكند → فشل الاتصال.

**الحل:** إضافة في Render → baytaljazeera-backend → Environment:

```
PYTHON_WORKER_URL=https://bayt-video-worker.onrender.com
```

(أو الرابط الفعلي لخدمة الفيديو على Render)

---

### السبب 3: Redis غير مُعد
**المشكلة:** حالة العملية `video_op:xxx` تُخزّن في الذاكرة فقط.

- عند إعادة تشغيل السيرفر تُفقد البيانات.
- طلبات `video-status` ترجع 404.

**الحل:** إضافة Redis (مثلاً Upstash):

```
REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379
```

---

### السبب 4: support_level غير كافٍ
**المشكلة:** توليد الفيديو يتطلب `support_level >= 2` (في generate-video) و `>= 3` (في regenerate-video).

- إذا كانت الباقات كلها `support_level = 0`، الطلب يُرفض بـ 403.

**الحل:** التأكد من وجود باقة بـ `support_level >= 2` في جدول `plans` وتفعيلها للمستخدم.

---

### السبب 5: Python Worker نائم (Cold Start)
**المشكلة:** على Render المجاني، الخدمة تتوقف بعد فترة.

- أول طلب يستغرق 2–5 دقائق للاستيقاظ.
- قد يحدث timeout قبل اكتمال التوليد.

**الحل:** زيادة عدد المحاولات والتأخير في `videoService.js` (موجود جزئياً)، أو ترقية الخطة.

---

### السبب 6: Queue لا يعمل (regenerate-video)
**المشكلة:** بدون Redis، `videoQueue.add` يستدعي `processVideoImmediately`.

- إذا كان هناك خطأ في `processVideoImmediately` أو في `generateListingSlideshow`، الفيديو لا يُولَّد.

**الحل:** مراجعة Logs على Render عند استدعاء regenerate-video.

---

## 4. فحص سريع

| العنصر | أين | القيمة المتوقعة |
|--------|-----|-----------------|
| `PYTHON_WORKER_URL` | Render (backend) | `https://bayt-video-worker.onrender.com` |
| `REDIS_URL` | Render (backend) | رابط Upstash أو Redis |
| `BACKEND_URL` أو `API_URL` | Render (backend) | `https://baytaljazeera-backend.onrender.com` |
| `OPENAI_API_KEY` | Render (Python worker) | مفتاح OpenAI للتعليق الصوتي |
| `CLOUDINARY_*` | Render (backend) | إعدادات Cloudinary |
| `support_level` | plans | ≥ 2 للفيديو، ≥ 3 لإعادة التوليد |

---

## 5. التوصيات

1. **تحويل المسارات النسبية إلى روابط كاملة** قبل إرسال الصور إلى Python Worker.
2. **التأكد من ضبط `PYTHON_WORKER_URL`** على Render.
3. **تفعيل Redis** لتخزين حالة العمليات.
4. **مراجعة Logs** على Render (backend و video worker) عند كل محاولة توليد فيديو.
