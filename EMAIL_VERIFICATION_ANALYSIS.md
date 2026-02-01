# تحليل عميق: لماذا لا تظهر رسالة تأكيد الحساب عند الدخول ولماذا لا يصل إيميل التأكيد

**التاريخ:** 27 يناير 2026

---

## الجزء الأول: لماذا لا تظهر رسالة تطلب من الداخل تأكيد الحساب؟

### السبب 1: استجابة تسجيل الدخول لا تتضمن حالة التأكيد

**الملف:** `backend/routes/auth.js` (سطور 462–476)

عند تسجيل الدخول الناجح، الـ Backend يُرجع:

```javascript
user: {
  id: user.id,
  email: user.email,
  name: user.name,
  phone: user.phone,
  whatsapp: user.whatsapp,
  role: user.role,
}
```

**المشكلة:** لا يُرجع `emailVerified` ولا `email_verified_at`.  
الواجهة الأمامية تخزّن المستخدم بعد الدخول بدون معرفة إن كان البريد مؤكداً أم لا (`emailVerified` يبقى `undefined`).

---

### السبب 2: صفحة الدخول تعيد التوجيه للرئيسية مباشرة دون فحص التأكيد

**الملف:** `frontend/app/login/page.tsx` (سطور 47–52)

بعد نجاح الدخول:

```javascript
setSuccess("تم تسجيل الدخول بنجاح! جاري التحويل...");
setTimeout(() => {
  router.push("/");   // توجيه فوري للرئيسية
  router.refresh();
}, 1000);
```

**المشكلة:** لا يوجد أي فحص لـ `emailVerified` ولا توجيه لصفحة `/verify-email` ولا عرض رسالة "يرجى تأكيد بريدك الإلكتروني".

---

### السبب 3: لا يوجد حارس عام (Guard) للتأكيد بعد الدخول

- يوجد في المشروع:
  - **Backend:** Middleware اسمه `requireEmailVerification` يُرجع 403 مع `requiresVerification: true` و`email` عند محاولة عمل يتطلب تأكيد البريد.
  - **Frontend:** Hook اسمه `useEmailVerification` فيه `requireVerification()` الذي يوجّه إلى `/verify-email` إذا كان المستخدم غير مؤكد.

**المشكلة:**  
لا يُستدعى هذا المنطق في مكان مركزي (مثل Layout أو صفحة الرئيسية بعد الدخول).  
النتيجة: حتى لو استُبدل المستخدم لاحقاً من `/api/auth/me` (الذي يُرجع `emailVerified`)، لا يوجد مكان واحد يتحقق من عدم التأكيد ويعرض رسالة أو يوجّه لصفحة التأكيد.

---

### السبب 4: عدم معالجة 403 (يجب تأكيد البريد) بشكل موحّد في الواجهة

- الـ API يُرجع 403 مع `requiresVerification: true` و`email` عند استخدام routes محمية بـ `requireEmailVerification`.
- الـ Hook `handleApiResponse` في `useEmailVerification` يعرف كيف يتعامل مع هذا (توجيه لـ `/verify-email`).

**المشكلة:**  
لا يتم استدعاء `handleApiResponse` من طبقة واحدة مشتركة (مثلاً في `api.ts` أو في axios/fetch interceptor). كل صفحة أو طلب قد يتعامل مع 403 بشكل مختلف، فغالباً المستخدم يرى فقط "خطأ" أو "غير مصرح" بدلاً من رسالة واضحة وتوجيه لصفحة التأكيد.

---

## الجزء الثاني: لماذا لا يصل إيميل التأكيد؟

### السبب 1: إرسال الإيميل غير متزامن ولا يُبلّغ المستخدم بالفشل

**الملف:** `backend/routes/auth.js` (سطور 252–262)

بعد التسجيل:

```javascript
try {
  const emailResult = await sendEmailVerificationEmail(user.email, emailVerificationToken, user.name);
  if (emailResult.success) { ... }
  else {
    console.error(`❌ [Auth] Failed to send ...`, emailResult.error);
  }
} catch (emailErr) {
  console.error('❌ [Auth] Exception ...', emailErr);
  // Don't fail registration if email fails
}
res.cookie("token", token, ...).json({ ok: true, user: {...}, message: "تم إنشاء الحساب بنجاح" });
```

**المشكلة:**  
حتى لو فشل إرسال الإيميل، الاستجابة للمستخدم تبقى `ok: true` و"تم إنشاء الحساب بنجاح".  
المستخدم لا يعرف أن الإيميل لم يُرسل، ولا يوجد في الـ response حقل مثل `emailSent: false` أو رسالة تنبيه.

---

### السبب 2: Gmail API قد لا تكون مضبوطة أو الـ Refresh Token منتهي

**الملف:** `backend/services/emailService.js`

- الإيميل يُرسل عبر Gmail API (وليس SendGrid).
- المتغيرات المطلوبة: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`.
- إذا نَقص أحدها، الدالة ترجع `success: false` و`error: 'Gmail API not configured'`.
- إذا انتهى أو أُلغي الـ Refresh Token، الكود يكتشف `invalid_grant` ويُرجع رسالة تنبيه.

**المشكلة:**  
في بيئة الإنتاج (مثلاً Render) إذا لم تُضبط هذه المتغيرات أو انتهى الـ token، الإيميل لا يُرسل، والخطأ يظهر فقط في سجلات السيرفر وليس للمستخدم.

---

### السبب 3: رابط التأكيد يعتمد على FRONTEND_URL

**الملف:** `backend/services/emailService.js` (سطر 250)

```javascript
const frontendUrl = process.env.FRONTEND_URL || 'https://baytaljazeera.com';
const verificationLink = `${frontendUrl}/verify-email?token=${verificationToken}`;
```

**المشكلة:**  
إذا كان `FRONTEND_URL` في السيرفر خاطئاً أو قديماً، الرابط في الإيميل سيوجه لمكان خاطئ. ذلك لا يمنع وصول الإيميل نفسه، لكنه يفسر عدم اكتمال عملية التأكيد من وجهة نظر المستخدم.

---

### السبب 4: الإيميل قد يصل إلى مجلد السبام

بعض مزودي البريد يضعون إيميلات التأكيد في السبام، خاصة إذا كان النطاق أو إعدادات SPF/DKIM غير مضبوطة. المستخدم قد لا يرى الإيميل في البريد الوارد.

---

## ملخص الأسباب

| المشكلة | السبب الجذري |
|--------|---------------|
| لا تظهر رسالة "تأكيد حسابك" بعد الدخول | 1) Login response لا يتضمن `emailVerified` 2) صفحة الدخول توجّه للرئيسية دون فحص التأكيد 3) لا Guard عام يوجّه غير المؤكدين لـ `/verify-email` 4) عدم معالجة موحّدة لـ 403 (requiresVerification) في الواجهة |
| لا يصل إيميل التأكيد | 1) فشل الإرسال لا يُعاد للمستخدم (response دائماً نجاح) 2) Gmail API غير مضبوطة أو Refresh Token منتهي 3) FRONTEND_URL خاطئ يفسد الرابط 4) الإيميل قد يكون في السبام |

---

## التوصيات للإصلاح

1. **في استجابة تسجيل الدخول:** إضافة `emailVerified: !!user.email_verified_at` (أو ما يعادله من قاعدة البيانات) إلى object الـ `user` المُرجَع من `/api/auth/login`.
2. **في صفحة الدخول:** بعد نجاح الدخول، إن كان `emailVerified === false` إما عرض رسالة "يرجى تأكيد بريدك الإلكتروني" مع زر يوجّه لـ `/verify-email` أو توجيه مباشر لـ `/verify-email?email=...`.
3. **حارس عام بعد الدخول:** في Layout أو في الصفحة الرئيسية (بعد استدعاء `checkAuth` أو `/api/auth/me`)، إذا كان المستخدم مسجلاً و`emailVerified === false` عرض بانر ثابت "يرجى تأكيد بريدك" مع رابط لـ `/verify-email`.
4. **معالجة 403 موحّدة:** في طبقة واحدة للطلبات (مثلاً في `api.ts` أو interceptor)، عند 403 ووجود `requiresVerification` و`email` في الجسم، توجيه المستخدم لـ `/verify-email?email=...` وعرض رسالة مناسبة.
5. **استجابة التسجيل:** عند فشل `sendEmailVerificationEmail` إرجاع حقل مثل `emailSent: false` ورسالة مناسبة (مثلاً "تم إنشاء الحساب لكن لم نتمكن من إرسال إيميل التأكيد، يمكنك طلب إعادة الإرسال من صفحة التأكيد") مع بقاء الحساب مخلوقاً.
6. **التحقق من الإنتاج:** التأكد من ضبط `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` و`FRONTEND_URL` في بيئة النشر، ومراجعة السجلات عند فشل الإرسال.

بعد تطبيق هذه النقاط، من المتوقع أن تظهر رسالة تأكيد الحساب للمستخدمين غير المؤكدين وأن يصبح سبب عدم وصول الإيميل واضحاً وقابلاً للمعالجة (إما إعداد Gmail أو إبلاغ المستخدم بأن الإيميل لم يُرسل).
