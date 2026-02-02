# التحقق من نشر bayt-video-worker على Render

## المشكلة
إذا كان النشر يفشل مع "Exited with status 1 while building"، تحقق من الإعدادات التالية.

## ⚠️ إعداد مهم جداً: Root Directory

**bayt-video-worker** يجب أن يستخدم مجلد مختلف عن الـ backend!

1. اذهب إلى [dashboard.render.com](https://dashboard.render.com)
2. اختر **bayt-video-worker**
3. اذهب إلى **Settings** → **Build & Deploy**
4. **Root Directory**: ضع `backend/video_worker` بالضبط
   - بدون هذا، Render سيستخدم Dockerfile الخاص بالـ backend (Node.js) وسيفشل البناء!
5. **Dockerfile Path**: اتركه فارغاً أو `Dockerfile` (سيستخدم backend/video_worker/Dockerfile)
6. **Branch**: `main`
7. **Auto-Deploy**: مفعّل

### 2. إعادة النشر يدوياً

1. في صفحة **bayt-video-worker**
2. اضغط **Manual Deploy** → **Deploy latest commit**
3. انتظر انتهاء النشر (قد يستغرق 5-10 دقائق)

### 3. التحقق من Logs بعد التوليد

بعد توليد فيديو، اذهب إلى **bayt-video-worker** → **Logs** وابحث عن:

```
[VideoEngine] Total duration: 90.0s, 6.0s per image
[VideoEngine] Actual video duration: 90.0s (target: 90.0s)
```

إذا رأيت أرقاماً أقل (مثل 20-30 ثانية)، فالخدمة تعمل بكود قديم.

### 4. إذا كان Root Directory مختلفاً

إذا كان bayt-video-worker يستخدم **Root Directory** مختلفاً:
- غيّره إلى `backend/video_worker`
- أو أنشئ خدمة جديدة تشير إلى هذا المجلد

## التحديثات الأخيرة (يجب أن تظهر في Logs)

- `padding=0 للحفاظ على المدة الكاملة` — بدون تداخل بين الصور
- `Total duration: X.Xs, Y.Ys per image` — مدة كل صورة
- `Actual video duration: X.Xs` — المدة الفعلية للفيديو
