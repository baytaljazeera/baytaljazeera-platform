# إعداد Gmail API لإرسال الإيميلات
# Gmail API Setup Guide

## 📋 المتطلبات / Requirements

1. حساب Gmail (info@baytaljazeera.com)
2. Google Cloud Console project
3. Gmail API مفعّل

## 🔧 خطوات الإعداد / Setup Steps

### 1. إنشاء Google Cloud Project

1. اذهب إلى [Google Cloud Console](https://console.cloud.google.com/)
2. أنشئ مشروع جديد أو اختر مشروع موجود
3. فعّل **Gmail API**:
   - اذهب إلى **APIs & Services** → **Library**
   - ابحث عن "Gmail API"
   - اضغط **Enable**

### 2. إنشاء OAuth 2.0 Credentials

1. اذهب إلى **APIs & Services** → **Credentials**
2. اضغط **Create Credentials** → **OAuth client ID**
3. إذا طُلب منك، أنشئ **OAuth consent screen**:
   - **User Type**: Internal (إذا كان حساب Google Workspace) أو External
   - **App name**: بيت الجزيرة
   - **User support email**: info@baytaljazeera.com
   - **Developer contact**: info@baytaljazeera.com
4. في **OAuth client ID**:
   - **Application type**: Web application
   - **Name**: Bayt Al Jazeera Email Service
   - **Authorized redirect URIs**: `urn:ietf:wg:oauth:2.0:oob` (للتطبيقات المثبتة)
5. احفظ **Client ID** و **Client Secret**

### 3. الحصول على Refresh Token

#### الطريقة 1: استخدام OAuth 2.0 Playground (موصى به)

1. اذهب إلى [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. اضغط على **Settings** (⚙️) في الزاوية اليمنى العلوية
3. فعّل **Use your own OAuth credentials**
4. أدخل **OAuth Client ID** و **Client Secret**
5. في القائمة اليسرى، ابحث عن **Gmail API v1**
6. اختر `https://mail.google.com/` scope
7. اضغط **Authorize APIs**
8. سجل دخول بحساب info@baytaljazeera.com
9. اضغط **Exchange authorization code for tokens**
10. انسخ **Refresh token**

#### الطريقة 2: استخدام Node.js Script

```javascript
const { google } = require('googleapis');
const readline = require('readline');

const oauth2Client = new google.auth.OAuth2(
  'YOUR_CLIENT_ID',
  'YOUR_CLIENT_SECRET',
  'urn:ietf:wg:oauth:2.0:oob'
);

const scopes = ['https://mail.google.com/'];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: scopes,
});

console.log('Authorize this app by visiting this url:', authUrl);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Enter the code from that page here: ', (code) => {
  rl.close();
  oauth2Client.getToken(code, (err, token) => {
    if (err) return console.error('Error retrieving access token', err);
    console.log('Refresh Token:', token.refresh_token);
  });
});
```

### 4. إضافة Environment Variables

أضف هذه المتغيرات في Render Dashboard أو `.env`:

```bash
# Gmail API Credentials
GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REFRESH_TOKEN=your-refresh-token
GMAIL_USER_EMAIL=info@baytaljazeera.com
GMAIL_FROM_NAME=بيت الجزيرة
```

## ✅ التحقق من الإعداد

بعد إضافة المتغيرات، أعد تشغيل الخادم. يجب أن ترى:

```
✅ Gmail API initialized successfully
```

## 🔒 الأمان / Security

- **لا تشارك** Client Secret أو Refresh Token
- استخدم Environment Variables فقط
- فعّل **2-Step Verification** على حساب Gmail
- راجع **OAuth consent screen** بانتظام

## 📧 أنواع الإيميلات المدعومة

- ✅ إيميل الترحيب (بعد تأكيد الإيميل)
- ✅ إيميل تأكيد الإيميل
- ✅ إعادة تعيين كلمة المرور
- ✅ إعادة إرسال رابط التأكيد

## 🐛 استكشاف الأخطاء / Troubleshooting

### المشكلة: "invalid_grant"
- **الحل**: Refresh Token قد انتهت صلاحيته. احصل على token جديد.

### المشكلة: "insufficient permissions"
- **الحل**: تأكد من تفعيل `https://mail.google.com/` scope

### المشكلة: "unauthorized_client"
- **الحل**: تأكد من صحة Client ID و Client Secret

---

**آخر تحديث:** 2025-01-24
