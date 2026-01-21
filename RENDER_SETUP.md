# 🚀 إعداد Render.com - بديل Railway

## الخطوات السريعة:

### 1. إنشاء حساب على Render.com
- اذهب إلى: https://render.com
- سجل دخول بـ GitHub

### 2. إنشاء Web Service جديد
- اضغط "New" → "Web Service"
- اختر Repository: `baytaljazeera-platform`
- Branch: `main`

### 3. إعدادات الـ Service:
- **Name**: `baytaljazeera-backend`
- **Environment**: `Node`
- **Build Command**: `npm ci`
- **Start Command**: `node index.js`
- **Instance Type**: Free (للبداية) أو Starter ($7/شهر)

### 4. إضافة Environment Variables:
انسخ كل المتغيرات من Railway إلى Render:
- `DATABASE_URL`
- `SESSION_SECRET`
- `CLOUDINARY_URL` (أو `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`)
- `NEXT_PUBLIC_API_URL` (رابط Render الخاص بك)
- جميع المتغيرات الأخرى

### 5. إنشاء PostgreSQL Database:
- اضغط "New" → "PostgreSQL"
- اختر نفس Environment
- اربطه مع Web Service

### 6. بعد الـ Deployment:
- ستحصل على رابط مثل: `baytaljazeera-backend.onrender.com`
- حدّث `NEXT_PUBLIC_API_URL` في Vercel بهذا الرابط

## ✅ المميزات:
- ✅ سهل الاستخدام
- ✅ يدعم Dockerfile تلقائياً
- ✅ FFmpeg يعمل بدون مشاكل
- ✅ أقل تعقيداً من Railway

## 🔗 الروابط:
- Dashboard: https://dashboard.render.com
- Documentation: https://render.com/docs
