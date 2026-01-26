# قائمة التحقق من Deployment - Render
# Render Deployment Checklist

## ✅ قبل الـ Deployment / Before Deployment

### 1. التحقق من التغييرات / Check Changes

```bash
# تأكد من أن package-lock.json محدث
cd /Users/husseinbabsail/Desktop/projects/baytaljazeera-platform
npm install

# تحقق من التغييرات
git status
```

### 2. Commit التغييرات / Commit Changes

```bash
# أضف جميع الملفات المحدثة
git add .

# Commit
git commit -m "feat: Add SendGrid email service and fix Dockerfile

- Add @sendgrid/mail package
- Update emailService.js to use SendGrid
- Add welcome email on registration
- Improve Dockerfile with fallback mechanism
- Add SendGrid setup documentation"

# Push إلى GitHub
git push origin main
```

### 3. متغيرات البيئة المطلوبة / Required Environment Variables

تأكد من إضافة هذه المتغيرات في Render Dashboard:

```bash
# SendGrid (جديد)
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@baytaljazeera.com
SENDGRID_FROM_NAME=بيت الجزيرة
SENDGRID_REPLY_TO=support@baytaljazeera.com  # اختياري

# Existing variables (تأكد من وجودها)
SESSION_SECRET=your-session-secret
DATABASE_URL=postgresql://...
JWT_SECRET=your-jwt-secret
FRONTEND_URL=https://baytaljazeera.com
```

## 🔍 بعد الـ Deployment / After Deployment

### 1. تحقق من Logs

- اذهب إلى Render Dashboard → Logs
- ابحث عن: `✅ SendGrid initialized successfully`
- إذا رأيت: `⚠️ SENDGRID_API_KEY not set` - أضف المتغير

### 2. اختبار الإيميلات

1. **اختبار استعادة كلمة المرور:**
   - اذهب إلى `/forgot-password`
   - أدخل إيميل مسجل
   - تحقق من صندوق الوارد

2. **اختبار إيميل الترحيب:**
   - سجل مستخدم جديد
   - تحقق من صندوق الوارد

### 3. مراقبة SendGrid Dashboard

- اذهب إلى [sendgrid.com](https://sendgrid.com) → Activity
- تحقق من الإيميلات المرسلة
- تحقق من حالة الإرسال (delivered, bounced, etc.)

## ⚠️ استكشاف الأخطاء / Troubleshooting

### المشكلة: Build فاشل

**الحل:**
1. تحقق من أن `package-lock.json` موجود في GitHub
2. تحقق من Logs في Render لرؤية الخطأ المحدد
3. تأكد من أن Dockerfile محدث

### المشكلة: SendGrid not initialized

**الحل:**
1. أضف `SENDGRID_API_KEY` في Render Environment Variables
2. أعد تشغيل الخادم

### المشكلة: الإيميلات لا تصل

**الحل:**
1. تحقق من SendGrid Dashboard → Activity
2. تحقق من قائمة Suppressions
3. تحقق من صندوق Spam
4. تأكد من التحقق من الإيميل المرسل في SendGrid

---

**آخر تحديث:** 2025-01-XX
