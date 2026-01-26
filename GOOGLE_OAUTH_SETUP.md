# إعداد Google OAuth
# Google OAuth Setup Guide

## 📋 المتطلبات

لتفعيل تسجيل الدخول عبر Google، تحتاج إلى:

1. **Google Cloud Console Project**
2. **OAuth 2.0 Client ID و Client Secret**
3. **متغيرات البيئة في Render**

---

## 🔧 الخطوة 1: إنشاء Google OAuth Credentials

### 1.1. اذهب إلى Google Cloud Console

1. افتح [Google Cloud Console](https://console.cloud.google.com/)
2. اختر أو أنشئ مشروع جديد
3. اذهب إلى **APIs & Services** → **Credentials**

### 1.2. إنشاء OAuth 2.0 Client ID

1. اضغط **+ CREATE CREDENTIALS** → **OAuth client ID**
2. إذا طُلب منك، أكمل **OAuth consent screen**:
   - **User Type**: External (للعامة)
   - **App name**: بيت الجزيرة (Bayt Al Jazeera)
   - **User support email**: info@baytaljazeera.com
   - **Developer contact**: info@baytaljazeera.com
   - **Scopes**: email, profile, openid
   - **Test users**: أضف إيميلات للاختبار (اختياري)

3. اختر **Application type**: **Web application**
4. أدخل **Name**: Bayt Al Jazeera OAuth
5. أضف **Authorized redirect URIs**:
   ```
   https://baytaljazeera-backend.onrender.com/api/auth/google/callback
   ```
   (استبدل `baytaljazeera-backend.onrender.com` بـ domain الخاص بك)

6. اضغط **CREATE**
7. **انسخ**:
   - **Client ID** (مثل: `123456789-abcdefg.apps.googleusercontent.com`)
   - **Client Secret** (مثل: `GOCSPX-abcdefghijklmnop`)

---

## 🔐 الخطوة 2: إضافة المتغيرات في Render

اذهب إلى Render Dashboard → **Environment** وأضف:

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=https://baytaljazeera-backend.onrender.com/api/auth/google/callback
BACKEND_URL=https://baytaljazeera-backend.onrender.com
```

**ملاحظات:**
- استبدل `your-client-id` و `your-client-secret` بالقيم من Google Cloud Console
- استبدل `baytaljazeera-backend.onrender.com` بـ domain الخاص بك
- `BACKEND_URL` يجب أن يكون URL الكامل للـ backend (مع `https://`)

---

## ✅ الخطوة 3: التحقق من الإعداد

بعد إضافة المتغيرات وإعادة التشغيل:

1. افتح Logs في Render
2. ابحث عن: `✅ Google OAuth configured`
3. جرّب تسجيل الدخول عبر Google من صفحة التسجيل

---

## 🧪 الاختبار

1. اذهب إلى: `https://baytaljazeera.com/register`
2. اضغط على **"تسجيل الدخول بـ Google"**
3. يجب أن يتم توجيهك إلى Google للسماح بالوصول
4. بعد الموافقة، يجب أن يتم تسجيل الدخول تلقائياً

---

## 🔒 الأمان

- **لا تشارك** Client ID و Client Secret مع أي شخص
- **لا ترفعها** إلى GitHub
- استخدم **Environment Variables** فقط في Render
- تأكد من أن **Authorized redirect URIs** صحيحة

---

## 🐛 استكشاف الأخطاء

### المشكلة: "redirect_uri_mismatch"

**السبب:** Redirect URI في Google Cloud Console لا يطابق `GOOGLE_CALLBACK_URL`

**الحل:**
1. تأكد من أن Redirect URI في Google Cloud Console مطابق تماماً لـ `GOOGLE_CALLBACK_URL`
2. يجب أن يكون بالضبط: `https://baytaljazeera-backend.onrender.com/api/auth/google/callback`

### المشكلة: "invalid_client"

**السبب:** Client ID أو Client Secret غير صحيح

**الحل:**
1. راجع Google Cloud Console → Credentials
2. تأكد من نسخ Client ID و Client Secret بشكل صحيح
3. تأكد من عدم وجود مسافات إضافية

### المشكلة: الأزرار لا تظهر

**السبب:** المتغيرات غير موجودة أو غير صحيحة

**الحل:**
1. تحقق من وجود `GOOGLE_CLIENT_ID` و `GOOGLE_CLIENT_SECRET` في Render
2. أعد تشغيل الخادم بعد إضافة المتغيرات

---

## 📝 ملاحظات

- **Google OAuth** يعمل الآن بشكل مستقل عن Replit Auth
- يمكن استخدامه على أي hosting (Render, Railway, AWS, etc.)
- **Apple Sign In** سيتم إضافته لاحقاً (يتطلب Apple Developer Account)

---

**آخر تحديث:** 2025-01-24
