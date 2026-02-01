# متغيرات البيئة المطلوبة في Render Dashboard
# Required Environment Variables for Render Dashboard

## 📧 Gmail API Variables (إيميلات)

أضف هذه المتغيرات في Render Dashboard → Service → Environment:

```bash
GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REFRESH_TOKEN=your-refresh-token
GMAIL_USER_EMAIL=info@baytaljazeera.com
GMAIL_FROM_NAME=بيت الجزيرة
```

### شرح كل متغير:

1. **GMAIL_CLIENT_ID**
   - من Google Cloud Console → Credentials → OAuth 2.0 Client ID
   - مثال: `123456789-abcdefghijklmnop.apps.googleusercontent.com`

2. **GMAIL_CLIENT_SECRET**
   - من نفس صفحة OAuth 2.0 Client ID
   - مثال: `GOCSPX-abcdefghijklmnopqrstuvwxyz`

3. **GMAIL_REFRESH_TOKEN**
   - من OAuth 2.0 Playground (راجع GMAIL_SETUP.md)
   - مثال: `1//0abcdefghijklmnopqrstuvwxyz-abcdefghijklmnop`

4. **GMAIL_USER_EMAIL**
   - الإيميل المرسل منه (info@baytaljazeera.com)
   - يجب أن يكون نفس الإيميل المستخدم في OAuth consent screen

5. **GMAIL_FROM_NAME**
   - الاسم الذي سيظهر في الإيميلات
   - مثال: `بيت الجزيرة`

---

## 🎬 Video Worker (توليد الفيديو)

**مطلوب** لتوليد الفيديو الترويجي بالذكاء الاصطناعي:

```bash
PYTHON_WORKER_URL=https://bayt-video-worker.onrender.com
```

- يجب إضافته في **baytaljazeera-backend** (وليس bayt-video-worker)
- بدون هذا المتغير، الـ backend يحاول الاتصال بـ localhost (يفشل على Render)

---

## 📋 خطوات الإضافة في Render:

1. اذهب إلى [Render Dashboard](https://dashboard.render.com)
2. اختر Service الخاص بك (`baytaljazeera-backend`)
3. اضغط على **Environment** في القائمة الجانبية
4. اضغط **Add Environment Variable**
5. أضف كل متغير على حدة:
   - **Key**: `GMAIL_CLIENT_ID`
   - **Value**: القيمة من Google Cloud Console
6. كرر الخطوة لكل متغير
7. بعد إضافة جميع المتغيرات، اضغط **Save Changes**
8. Render سيعيد تشغيل الخادم تلقائياً

---

## ✅ التحقق من الإعداد:

بعد إضافة المتغيرات وإعادة التشغيل، تحقق من Logs في Render:

```
✅ Gmail API initialized successfully
```

إذا رأيت:
```
⚠️ Gmail credentials not set. Email sending will be disabled.
```

يعني أن أحد المتغيرات مفقود أو غير صحيح.

---

## 🔒 أمان:

- **لا تشارك** هذه القيم مع أي شخص
- **لا ترفعها** إلى GitHub
- استخدم **Environment Variables** فقط في Render
- احفظ نسخة احتياطية من Refresh Token في مكان آمن

---

**آخر تحديث:** 2025-01-24
