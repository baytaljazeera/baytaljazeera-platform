# 🔧 دليل إعداد Gmail API - خطوة بخطوة

## المشروع الحالي
`crested-acumen-485321-t5`

---

## الخطوة 1: التحقق من OAuth Client ID

### 1.1 اذهب إلى Credentials
- من القائمة الجانبية، اضغط على **"Clients"** (أو اذهب مباشرة إلى: APIs & Services → Credentials)

### 1.2 تحقق من OAuth 2.0 Client IDs
- ابحث عن OAuth 2.0 Client ID موجود
- إذا لم تجد، أنشئ واحد جديد (انظر الخطوة 2)

---

## الخطوة 2: إنشاء OAuth 2.0 Client ID (إذا لم يكن موجود)

### 2.1 إنشاء Client ID
1. اضغط **"+ CREATE CREDENTIALS"**
2. اختر **"OAuth client ID"**
3. إذا طُلب منك، أكمل OAuth consent screen أولاً

### 2.2 إعداد OAuth Consent Screen
1. **User Type:** اختر "External" (للتطبيقات الخارجية)
2. **App name:** `بيت الجزيرة` أو `Baytaljazeera`
3. **User support email:** اختر إيميلك
4. **Developer contact:** أدخل إيميلك
5. اضغط **"SAVE AND CONTINUE"**

### 2.3 إضافة Scopes (مهم جداً!)
1. في "Scopes"، اضغط **"+ ADD OR REMOVE SCOPES"**
2. ابحث عن: `gmail.send`
3. تأكد من اختيار:
   - ✅ `https://www.googleapis.com/auth/gmail.send`
4. اضغط **"UPDATE"** ثم **"SAVE AND CONTINUE"**

### 2.4 إنشاء Client ID
1. **Application type:** اختر **"Desktop app"** أو **"Web application"**
2. **Name:** `Baytaljazeera Gmail API`
3. اضغط **"CREATE"**
4. **انسخ Client ID و Client Secret** واحفظهما

---

## الخطوة 3: الحصول على Refresh Token

### 3.1 استخدام OAuth 2.0 Playground (أسهل طريقة)

1. اذهب إلى: https://developers.google.com/oauthplayground/

2. في الجانب الأيسر، ابحث عن **"Gmail API v1"**
   - ✅ اختر: `https://www.googleapis.com/auth/gmail.send`

3. اضغط **"Authorize APIs"**
   - سيسألك عن الحساب، اختر الحساب المرتبط بـ `info@baytaljazeera.com`
   - اضغط **"Allow"**

4. اضغط **"Exchange authorization code for tokens"**
   - ستحصل على:
     - **Access token**
     - **Refresh token** ← هذا ما نحتاجه!

5. **انسخ Refresh Token** واحفظه

---

## الخطوة 4: تحديث Environment Variables في Render

### 4.1 اذهب إلى Render Dashboard
1. اختر Service: `baytaljazeera-backend`
2. اضغط **"Environment"**

### 4.2 أضف/حدث هذه المتغيرات:

```
GMAIL_CLIENT_ID=YOUR_CLIENT_ID_HERE
GMAIL_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
GMAIL_REFRESH_TOKEN=YOUR_REFRESH_TOKEN_HERE
GMAIL_USER_EMAIL=info@baytaljazeera.com
GMAIL_FROM_NAME=بيت الجزيرة
```

### 4.3 احفظ التغييرات
- Render سيعيد تشغيل الـ service تلقائياً

---

## الخطوة 5: التحقق من النتيجة

### 5.1 افتح Logs في Render
بعد إعادة التشغيل، ابحث عن:

**✅ نجاح:**
```
✅ [EmailService] Refresh token is valid, access token obtained
✅ [EmailService] Gmail API initialized successfully!
```

**❌ فشل:**
```
❌ [EmailService] Refresh token test failed: invalid_grant
```

### 5.2 جرّب تسجيل مستخدم جديد
1. سجّل مستخدم جديد بإيميل حقيقي
2. افتح Logs مباشرة
3. ابحث عن:
   ```
   ✅ [EmailService] Email sent successfully to ...
   ```

---

## المشاكل الشائعة

### ❌ "invalid_grant" error
**السبب:** Refresh token منتهي أو غير صحيح

**الحل:** أنشئ refresh token جديد من OAuth Playground

### ❌ "insufficient_permissions" error
**السبب:** Scope `gmail.send` غير موجود

**الحل:** تأكد من إضافة `gmail.send` scope في OAuth consent screen

### ❌ "invalid_client" error
**السبب:** Client ID أو Client Secret خاطئ

**الحل:** تحقق من القيم في Render Environment Variables

---

## ملاحظات مهمة

1. **Refresh Token لا ينتهي** (إلا إذا حذفته أو غيرت كلمة المرور)
2. **Access Token ينتهي** (لكن يتم تحديثه تلقائياً)
3. **تأكد من استخدام الحساب الصحيح** (`info@baytaljazeera.com`) عند الحصول على refresh token

---

## رابط سريع

- **OAuth Playground:** https://developers.google.com/oauthplayground/
- **Google Cloud Console:** https://console.cloud.google.com/
- **Render Dashboard:** https://dashboard.render.com/
