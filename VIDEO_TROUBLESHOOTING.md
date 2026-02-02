# استكشاف أخطاء توليد الفيديو

## أخطاء شائعة وحلولها

### 1. ERR_NAME_NOT_RESOLVED (لا يمكن حل اسم الخادم)

**السبب:** عنوان الـ API غير صحيح أو به خطأ إملائي.

**الحل:**
1. اذهب إلى **Vercel** → مشروعك → **Settings** → **Environment Variables**
2. تحقق من `NEXT_PUBLIC_API_URL` — يجب أن يكون **بالضبط**:
   ```
   https://baytaljazeera-backend.onrender.com
   ```
   ⚠️ انتبه: `backend` وليس `backen` (مع حرف d)
3. إذا غيرت القيمة، أعد نشر المشروع (Redeploy)

### 2. خطأ 500 (Internal Server Error)

**السبب:** خطأ في الباكند أو خدمة خارجية (مثل Python Worker).

**الحل:**
1. اذهب إلى **Render** → `baytaljazeera-backend` → **Logs**
2. ابحث عن رسائل الخطأ الحمراء
3. تحقق من `PYTHON_WORKER_URL` في Environment Variables على Render — يجب أن يشير إلى خدمة الفيديو (مثل `https://bayt-video-worker.onrender.com`)

### 3. خطأ 429 (Too Many Requests)

**السبب:** تجاوز حد الطلبات.

**الحل:** تم إصلاحه في التحديثات الأخيرة (استثناء video-status من الحد). تأكد من نشر آخر التعديلات.

### 4. "عملية التوليد غير موجودة أو انتهت صلاحيتها" (404)

**السبب:** بدون Redis، حالة العمليات تُفقد عند إعادة تشغيل الخادم.

**الحل:**
1. أنشئ حساب مجاني على [Upstash Redis](https://upstash.com)
2. أنشئ قاعدة Redis واحصل على `REDIS_URL`
3. أضف في **Render** → `baytaljazeera-backend` → **Environment**:
   ```
   REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379
   ```
4. أعد النشر

### 5. الفيديو عالق عند "جاري التوليد..."

**الأسباب المحتملة:**
- **Python Worker نائم** (Render Free): الخدمة تستغرق 2–5 دقائق للاستيقاظ
- **اتصال الباكند معطل**: تحقق من ERR_NAME_NOT_RESOLVED أعلاه
- **Redis غير مُعد**: العمليات تُفقد عند إعادة التشغيل

**الحل:**
1. انتظر حتى 10 دقائق في المحاولة الأولى (cold start)
2. تحقق من Logs على Render أثناء التوليد
3. أضف Redis كما في النقطة 4

---

## فحص سريع

افتح Console في المتصفح (F12) واكتب:
```javascript
console.log('API URL:', process.env.NEXT_PUBLIC_API_URL || 'https://baytaljazeera-backend.onrender.com');
```

إذا ظهر عنوان خاطئ أو فارغ، عدّل `NEXT_PUBLIC_API_URL` على Vercel.

---

## المتطلبات لتوليد الفيديو

| المتغير | أين | مطلوب |
|---------|-----|-------|
| `NEXT_PUBLIC_API_URL` | Vercel | نعم — `https://baytaljazeera-backend.onrender.com` |
| `PYTHON_WORKER_URL` | Render (backend) | نعم — رابط خدمة Python |
| `REDIS_URL` أو `UPSTASH_REDIS_URL` | Render (backend) | موصى به بشدة |
| `OPENAI_API_KEY` | Render (Python worker) | نعم — للتعليق الصوتي |
| `CLOUDINARY_*` | Render (backend) | نعم — لرفع الفيديو |
