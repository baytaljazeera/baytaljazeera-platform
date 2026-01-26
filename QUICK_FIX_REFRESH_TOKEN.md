# 🔧 إصلاح سريع: Refresh Token منتهي

## المشكلة
```
❌ [EmailService] Refresh token test failed: invalid_grant
error_description: 'Token has been expired or revoked.'
```

## الحل السريع (5 دقائق)

### 1. اذهب إلى OAuth Playground
https://developers.google.com/oauthplayground/

### 2. اختر Gmail API Scope
- في الجانب الأيسر، ابحث عن **"Gmail API v1"**
- ✅ اختر: `https://www.googleapis.com/auth/gmail.send`

### 3. استخدم OAuth Credentials الخاصة بك
- في الجانب الأيمن، اضغط **"Use your own OAuth credentials"**
- أدخل:
  - **OAuth Client ID:** `973423639067-sl0romjarr5t7ckrc1k8kcbesbsjn4hf.apps.googleusercontent.com`
  - **OAuth Client secret:** (انسخه من Google Cloud Console → Clients → baytaljazeera-gmail)

### 4. Authorize
- اضغط **"Authorize APIs"**
- اختر الحساب: `info@baytaljazeera.com`
- اضغط **"Allow"**

### 5. احصل على Refresh Token
- اضغط **"Exchange authorization code for tokens"**
- انسخ **Refresh token** (القيمة الطويلة)

### 6. حدث Render
- Render Dashboard → Service → Environment
- ابحث عن `GMAIL_REFRESH_TOKEN`
- استبدل القيمة القديمة بالجديدة
- احفظ

### 7. تحقق من Logs
بعد إعادة التشغيل، ابحث عن:
```
✅ [EmailService] Refresh token is valid, access token obtained
✅ [EmailService] Gmail API initialized successfully!
```

## Client ID الموجود
```
973423639067-sl0romjarr5t7ckrc1k8kcbesbsjn4hf.apps.googleusercontent.com
```

## رابط سريع
- **OAuth Playground:** https://developers.google.com/oauthplayground/
- **Google Cloud Console:** https://console.cloud.google.com/apis/credentials?project=crested-acumen-485321-t5
