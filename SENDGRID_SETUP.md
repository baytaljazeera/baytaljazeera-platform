# دليل إعداد SendGrid - بيت الجزيرة
# SendGrid Setup Guide - Bait Al-Jazeera

## 📧 نظرة عامة / Overview

تم تحديث النظام لاستخدام **SendGrid** لإرسال الإيميلات بدلاً من Gmail API. SendGrid يوفر:
- ✅ إرسال إيميلات موثوقة
- ✅ تتبع الإيميلات (delivery, opens, clicks)
- ✅ إحصائيات مفصلة
- ✅ دعم أفضل للإيميلات التسويقية

---

## 🚀 خطوات الإعداد / Setup Steps

### 1. إنشاء حساب SendGrid

1. اذهب إلى [sendgrid.com](https://sendgrid.com)
2. سجل حساب جديد (مجاني حتى 100 إيميل يومياً)
3. أكمل التحقق من الهوية

### 2. إنشاء API Key

1. بعد تسجيل الدخول، اذهب إلى **Settings** → **API Keys**
2. اضغط على **Create API Key**
3. اختر **Full Access** أو **Restricted Access** (يفضل Restricted)
4. إذا اخترت Restricted، تأكد من تفعيل:
   - ✅ **Mail Send** (Full Access)
5. انسخ الـ API Key (سيظهر مرة واحدة فقط!)

### 3. التحقق من الإيميل المرسل (Sender Verification)

#### أ. Single Sender Verification (للاختبار)
1. اذهب إلى **Settings** → **Sender Authentication**
2. اضغط على **Verify a Single Sender**
3. أدخل المعلومات:
   - **From Email**: `noreply@baytaljazeera.com` (أو الإيميل الخاص بك)
   - **From Name**: `بيت الجزيرة`
   - **Reply To**: `support@baytaljazeera.com` (اختياري)
4. أكمل التحقق من الإيميل

#### ب. Domain Authentication (للإنتاج - موصى به)
1. اذهب إلى **Settings** → **Sender Authentication**
2. اضغط على **Authenticate Your Domain**
3. أدخل النطاق: `baytaljazeera.com`
4. اتبع التعليمات لإضافة DNS records:
   - CNAME records
   - SPF record
   - DKIM records
5. بعد إضافة السجلات، اضغط **Verify**

### 4. إضافة متغيرات البيئة / Environment Variables

أضف المتغيرات التالية إلى ملف `.env` أو في إعدادات الخادم:

```bash
# SendGrid Configuration
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@baytaljazeera.com
SENDGRID_FROM_NAME=بيت الجزيرة
SENDGRID_REPLY_TO=support@baytaljazeera.com  # اختياري
```

#### للمنصات المختلفة:

**Railway:**
```bash
railway variables set SENDGRID_API_KEY=SG.xxxxx
railway variables set SENDGRID_FROM_EMAIL=noreply@baytaljazeera.com
railway variables set SENDGRID_FROM_NAME=بيت الجزيرة
```

**Render:**
- اذهب إلى Dashboard → Environment → Add Environment Variable

**Vercel (للـ Frontend - إذا احتجت):**
```bash
vercel env add SENDGRID_API_KEY
```

---

## 📋 الإيميلات المدعومة / Supported Emails

النظام يدعم الآن:

### 1. ✅ إعادة تعيين كلمة المرور
- **المسار:** `/api/auth/forgot-password`
- **الوظيفة:** `sendPasswordResetEmail()`
- **متى:** عندما ينسى المستخدم كلمة المرور

### 2. ✅ إيميل الترحيب
- **المسار:** `/api/auth/register`
- **الوظيفة:** `sendWelcomeEmail()`
- **متى:** عند تسجيل مستخدم جديد

### 3. 🔄 إيميلات إضافية (يمكن إضافتها لاحقاً)
- إشعارات الإعلانات
- إشعارات الرسائل
- إشعارات الدفع
- إشعارات الباقات

---

## 🧪 الاختبار / Testing

### اختبار إرسال إيميل استعادة كلمة المرور:

1. افتح `/forgot-password`
2. أدخل إيميل مسجل
3. تحقق من صندوق الوارد
4. تحقق من SendGrid Dashboard → **Activity** لرؤية حالة الإرسال

### اختبار إيميل الترحيب:

1. سجل مستخدم جديد
2. تحقق من صندوق الوارد
3. تحقق من SendGrid Dashboard

---

## 📊 مراقبة الإيميلات / Email Monitoring

### SendGrid Dashboard:

1. **Activity Feed**: رؤية جميع الإيميلات المرسلة
2. **Stats**: إحصائيات الإرسال (delivered, opened, clicked)
3. **Suppressions**: قائمة الإيميلات المحظورة

### في الكود:

جميع محاولات الإرسال يتم تسجيلها:
- ✅ نجاح: `📧 Email sent successfully to {email}`
- ❌ فشل: `❌ SendGrid email send error: {error}`

---

## ⚠️ استكشاف الأخطاء / Troubleshooting

### المشكلة: "SendGrid API key not configured"

**الحل:**
- تأكد من إضافة `SENDGRID_API_KEY` في متغيرات البيئة
- أعد تشغيل الخادم بعد إضافة المتغير

### المشكلة: "The from address does not match a verified Sender Identity"

**الحل:**
- تأكد من التحقق من الإيميل المرسل في SendGrid
- استخدم إيميل تم التحقق منه في `SENDGRID_FROM_EMAIL`

### المشكلة: الإيميلات لا تصل

**الحل:**
1. تحقق من SendGrid Dashboard → Activity
2. تحقق من حالة الإرسال (delivered, bounced, blocked)
3. تحقق من قائمة Suppressions
4. تحقق من صندوق Spam

### المشكلة: "Rate limit exceeded"

**الحل:**
- الخطة المجانية: 100 إيميل/يوم
- ترقية إلى خطة مدفوعة للحصول على المزيد

---

## 🔒 الأمان / Security

### أفضل الممارسات:

1. ✅ **لا تشارك API Key** أبداً
2. ✅ استخدم **Restricted Access** للـ API Keys
3. ✅ راجع API Keys بانتظام
4. ✅ استخدم **Domain Authentication** للإنتاج
5. ✅ فعّل **Two-Factor Authentication** على حساب SendGrid

### حماية API Key:

```bash
# ❌ لا تفعل هذا
git add .env

# ✅ استخدم .gitignore
echo ".env" >> .gitignore
```

---

## 📈 الترقية / Upgrading

### من Gmail API إلى SendGrid:

✅ **تم بالفعل!** النظام يستخدم SendGrid الآن.

### إضافة إيميلات جديدة:

1. أنشئ template في `emailService.js`:
```javascript
function getNewEmailTemplate(data) {
  return `<!DOCTYPE html>...`;
}

async function sendNewEmail(email, data) {
  const htmlBody = getNewEmailTemplate(data);
  const subject = 'عنوان الإيميل';
  return await sendEmail(email, subject, htmlBody);
}
```

2. استخدمها في الـ route:
```javascript
try {
  await sendNewEmail(user.email, data);
} catch (err) {
  console.error('Failed to send email:', err);
}
```

---

## 📞 الدعم / Support

- **SendGrid Documentation**: [docs.sendgrid.com](https://docs.sendgrid.com)
- **SendGrid Support**: [support.sendgrid.com](https://support.sendgrid.com)

---

## ✅ Checklist

- [ ] إنشاء حساب SendGrid
- [ ] إنشاء API Key
- [ ] التحقق من الإيميل المرسل (Single Sender أو Domain)
- [ ] إضافة متغيرات البيئة
- [ ] اختبار إرسال إيميل استعادة كلمة المرور
- [ ] اختبار إيميل الترحيب
- [ ] مراجعة SendGrid Dashboard

---

**آخر تحديث:** 2025-01-XX  
**الإصدار:** 1.0.0
