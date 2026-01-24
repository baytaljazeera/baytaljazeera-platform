# الخطوات التالية - Next Steps

## ✅ ما تم إنجازه:

1. ✅ استبدال SendGrid بـ Gmail API
2. ✅ إضافة تأكيد الإيميل عند التسجيل
3. ✅ إضافة اختيار البلد لرقم الجوال
4. ✅ إنشاء صفحة تأكيد الإيميل
5. ✅ إضافة المتغيرات في Render Dashboard

---

## 📋 الخطوات المتبقية:

### 1. Commit و Push التغييرات إلى GitHub

```bash
cd /Users/husseinbabsail/Desktop/projects/baytaljazeera-platform

git add .
git commit -m "feat: Replace SendGrid with Gmail API and add email verification

- Replace SendGrid with Gmail API for email sending
- Add email verification on registration
- Add country selector for phone number
- Create email verification page
- Fix React Error #310 in search page
- Fix MapClient syntax error
- Update render.yaml for Docker deployment"

git push origin main
```

### 2. انتظار Deployment في Render

- بعد الـ push، Render سيكتشف التغييرات تلقائياً
- سيبدأ deployment جديد
- انتظر حتى يكتمل (2-5 دقائق)

### 3. التحقق من Logs

بعد اكتمال الـ deployment، اذهب إلى Render → Logs وابحث عن:

```
✅ Gmail API initialized successfully
```

إذا رأيت:
```
⚠️ Gmail credentials not set. Email sending will be disabled.
```

يعني أن أحد المتغيرات مفقود. راجع Render Dashboard → Environment.

---

## 🧪 اختبار النظام

### اختبار 1: تسجيل مستخدم جديد

1. اذهب إلى `/register`
2. سجل مستخدم جديد بإيميل حقيقي
3. تحقق من صندوق الوارد
4. يجب أن تصلك رسالة تأكيد الإيميل من `info@baytaljazeera.com`

### اختبار 2: تأكيد الإيميل

1. اضغط على رابط التأكيد في الإيميل
2. يجب أن يتم تأكيد الإيميل بنجاح
3. بعد التأكيد، يجب أن تصلك رسالة ترحيب

### اختبار 3: اختيار البلد لرقم الجوال

1. في صفحة التسجيل، جرب اختيار دول مختلفة
2. تأكد من أن رقم الجوال يتم حفظه مع رمز البلد

---

## 📝 ملخص المتغيرات المطلوبة

تأكد من وجود هذه المتغيرات في Render Dashboard:

1. `GMAIL_CLIENT_ID`
2. `GMAIL_CLIENT_SECRET`
3. `GMAIL_REFRESH_TOKEN`
4. `GMAIL_USER_EMAIL` = `info@baytaljazeera.com`
5. `GMAIL_FROM_NAME` = `بيت الجزيرة`

---

## 🐛 استكشاف الأخطاء

### المشكلة: لا تظهر رسالة Gmail API في Logs

**الحل:**
- تأكد من commit و push التغييرات
- انتظر حتى يكتمل deployment جديد
- تحقق من أن `emailService.js` محدث

### المشكلة: "invalid_grant"

**الحل:**
- احصل على Refresh Token جديد من OAuth 2.0 Playground
- حدّث `GMAIL_REFRESH_TOKEN` في Render

### المشكلة: لا تصل الإيميلات

**الحل:**
- تحقق من صندوق Spam
- تأكد من أن Refresh Token صحيح
- راجع Logs للأخطاء

---

**آخر تحديث:** 2025-01-24
