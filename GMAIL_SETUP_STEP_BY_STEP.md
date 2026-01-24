# دليل إعداد Gmail API خطوة بخطوة
# Step-by-Step Gmail API Setup Guide

## 📋 الخطوة 1: إنشاء Google Cloud Project

1. اذهب إلى [Google Cloud Console](https://console.cloud.google.com/)
2. اضغط على **Select a project** في الأعلى
3. اضغط **New Project**
4. أدخل:
   - **Project name**: `Bayt Al Jazeera`
   - **Organization**: (اختر إذا كان متاحاً)
5. اضغط **Create**
6. انتظر حتى يتم إنشاء المشروع (30 ثانية تقريباً)

---

## 📋 الخطوة 2: تفعيل Gmail API

1. في Google Cloud Console، اذهب إلى **APIs & Services** → **Library**
2. في شريط البحث، اكتب: `Gmail API`
3. اضغط على **Gmail API** من النتائج
4. اضغط **Enable**
5. انتظر حتى يتم التفعيل (10-20 ثانية)

---

## 📋 الخطوة 3: إنشاء OAuth Consent Screen

1. اذهب إلى **APIs & Services** → **OAuth consent screen**
2. اختر **User Type**:
   - إذا كان `info@baytaljazeera.com` حساب Google Workspace → اختر **Internal**
   - إذا كان حساب Gmail عادي → اختر **External**
3. اضغط **Create**
4. املأ المعلومات:
   - **App name**: `بيت الجزيرة`
   - **User support email**: `info@baytaljazeera.com`
   - **Developer contact information**: `info@baytaljazeera.com`
5. اضغط **Save and Continue**
6. في **Scopes**:
   - اضغط **Add or Remove Scopes**
   - ابحث عن `https://mail.google.com/`
   - فعّله واضغط **Update**
   - اضغط **Save and Continue**
7. في **Test users** (إذا اخترت External):
   - اضغط **Add Users**
   - أدخل `info@baytaljazeera.com`
   - اضغط **Add**
   - اضغط **Save and Continue**
8. راجع المعلومات واضغط **Back to Dashboard**

---

## 📋 الخطوة 4: إنشاء OAuth 2.0 Credentials

1. اذهب إلى **APIs & Services** → **Credentials**
2. اضغط **Create Credentials** → **OAuth client ID**
3. إذا طُلب منك إكمال OAuth consent screen، اكمل الخطوة 3 أولاً
4. في **Application type**: اختر **Web application**
5. في **Name**: أدخل `Bayt Al Jazeera Email Service`
6. في **Authorized redirect URIs**: أضف:
   ```
   urn:ietf:wg:oauth:2.0:oob
   ```
7. اضغط **Create**
8. **انسخ و احفظ**:
   - **Client ID** (مثل: `123456789-abc...apps.googleusercontent.com`)
   - **Client Secret** (مثل: `GOCSPX-abc...`)
9. اضغط **OK**

---

## 📋 الخطوة 5: الحصول على Refresh Token

### الطريقة 1: استخدام OAuth 2.0 Playground (أسهل) ⭐

1. اذهب إلى [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. اضغط على **Settings** (⚙️) في الزاوية اليمنى العلوية
3. فعّل **Use your own OAuth credentials**
4. أدخل:
   - **OAuth Client ID**: (من الخطوة 4)
   - **OAuth Client secret**: (من الخطوة 4)
5. اضغط **Close**
6. في القائمة اليسرى، ابحث عن **Gmail API v1**
7. فعّل `https://mail.google.com/`
8. اضغط **Authorize APIs**
9. سجل دخول بحساب `info@baytaljazeera.com`
10. اضغط **Allow** للسماح بالصلاحيات
11. اضغط **Exchange authorization code for tokens**
12. **انسخ Refresh token** (يبدأ بـ `1//0...`)

### الطريقة 2: استخدام Node.js Script

1. افتح `scripts/get-gmail-token.js`
2. استبدل:
   ```javascript
   const CLIENT_ID = 'YOUR_CLIENT_ID_HERE.apps.googleusercontent.com';
   const CLIENT_SECRET = 'YOUR_CLIENT_SECRET_HERE';
   ```
   بالقيم من الخطوة 4
3. شغّل:
   ```bash
   node scripts/get-gmail-token.js
   ```
4. اتبع التعليمات في Console
5. **انسخ Refresh token** من الناتج

---

## 📋 الخطوة 6: إضافة المتغيرات في Render Dashboard

1. اذهب إلى [Render Dashboard](https://dashboard.render.com)
2. اختر Service: **baytaljazeera-backend**
3. اضغط على **Environment** في القائمة الجانبية
4. اضغط **Add Environment Variable**
5. أضف كل متغير على حدة:

   **المتغير 1:**
   - **Key**: `GMAIL_CLIENT_ID`
   - **Value**: (Client ID من الخطوة 4)
   - اضغط **Save**

   **المتغير 2:**
   - **Key**: `GMAIL_CLIENT_SECRET`
   - **Value**: (Client Secret من الخطوة 4)
   - اضغط **Save**

   **المتغير 3:**
   - **Key**: `GMAIL_REFRESH_TOKEN`
   - **Value**: (Refresh Token من الخطوة 5)
   - اضغط **Save**

   **المتغير 4:**
   - **Key**: `GMAIL_USER_EMAIL`
   - **Value**: `info@baytaljazeera.com`
   - اضغط **Save**

   **المتغير 5:**
   - **Key**: `GMAIL_FROM_NAME`
   - **Value**: `بيت الجزيرة`
   - اضغط **Save**

6. بعد إضافة جميع المتغيرات، Render سيعيد تشغيل الخادم تلقائياً

---

## ✅ الخطوة 7: التحقق من الإعداد

1. اذهب إلى Render Dashboard → **Logs**
2. ابحث عن:
   ```
   ✅ Gmail API initialized successfully
   ```
3. إذا رأيت:
   ```
   ⚠️ Gmail credentials not set. Email sending will be disabled.
   ```
   يعني أن أحد المتغيرات مفقود أو غير صحيح. راجع الخطوة 6.

---

## 🧪 اختبار النظام

1. سجل مستخدم جديد من الموقع
2. تحقق من صندوق الوارد لـ `info@baytaljazeera.com`
3. يجب أن تصلك رسالة تأكيد الإيميل
4. اضغط على رابط التأكيد
5. بعد التأكيد، يجب أن تصلك رسالة ترحيب

---

## 🐛 استكشاف الأخطاء

### المشكلة: "invalid_grant"
- **السبب**: Refresh Token غير صحيح أو منتهي
- **الحل**: احصل على Refresh Token جديد من الخطوة 5

### المشكلة: "unauthorized_client"
- **السبب**: Client ID أو Client Secret غير صحيح
- **الحل**: راجع الخطوة 4 وتأكد من نسخ القيم بشكل صحيح

### المشكلة: "insufficient permissions"
- **السبب**: Scope غير مفعّل
- **الحل**: تأكد من تفعيل `https://mail.google.com/` في OAuth consent screen

### المشكلة: "access_denied"
- **السبب**: لم يتم السماح بالصلاحيات
- **الحل**: تأكد من الضغط على "Allow" عند طلب الصلاحيات

---

## 📝 ملخص المتغيرات المطلوبة

```bash
GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REFRESH_TOKEN=your-refresh-token
GMAIL_USER_EMAIL=info@baytaljazeera.com
GMAIL_FROM_NAME=بيت الجزيرة
```

---

**آخر تحديث:** 2025-01-24
