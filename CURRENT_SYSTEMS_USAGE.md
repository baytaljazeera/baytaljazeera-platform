# الأنظمة المستخدمة حالياً في المشروع - بيت الجزيرة

## جدول الأنظمة المستخدمة فعلياً

| النظام/التقنية | أساسي؟ | أين يُستخدم | الوصف |
|----------------|--------|-------------|-------|
| **Next.js 14** | ✅ نعم | `frontend/` | إطار عمل الواجهة الأمامية - جميع صفحات الموقع |
| **React 18** | ✅ نعم | `frontend/` | مكتبة بناء الواجهات - جميع المكونات |
| **TypeScript** | ✅ نعم | `frontend/`, `shared/` | لغة البرمجة - جميع ملفات `.tsx` و `.ts` |
| **Express.js 5** | ✅ نعم | `index.js`, `backend/routes/` | إطار عمل الخادم - جميع الـ API endpoints |
| **Node.js** | ✅ نعم | المشروع كله | بيئة التشغيل - تشغيل الكود على الخادم |
| **PostgreSQL** | ✅ نعم | `backend/db.js`, جميع الـ routes | قاعدة البيانات الرئيسية - تخزين جميع البيانات |
| **Redis (ioredis)** | ⚠️ مهم | `backend/config/redis.js` | التخزين المؤقت - تحسين الأداء، إدارة الجلسات |
| **Tailwind CSS** | ✅ نعم | `frontend/` | تصميم الواجهة - جميع صفحات الواجهة |
| **Leaflet** | ✅ نعم | `frontend/components/MapClient.tsx` | الخرائط - عرض الخرائط التفاعلية |
| **OpenStreetMap** | ✅ نعم | `frontend/components/MapClient.tsx` | بيانات الخرائط - توفير الخرائط |
| **JWT (jsonwebtoken)** | ✅ نعم | `backend/middleware/auth.js` | المصادقة - تسجيل الدخول والأمان |
| **Passport.js** | ⚠️ مهم | `backend/replit_auth/` | المصادقة المتقدمة - OAuth، Google Login |
| **Stripe** | ⚠️ مهم | `backend/routes/stripe.js`, `backend/services/stripeService.js` | المدفوعات - معالجة المدفوعات والاشتراكات |
| **Multer** | ✅ نعم | `backend/config/multer.js` | رفع الملفات - رفع الصور والفيديوهات |
| **Cloudinary** | ⚠️ مهم | `backend/services/cloudinaryService.js` | تخزين الوسائط - رفع الصور والفيديوهات إلى السحابة |
| **Knex.js** | ✅ نعم | `backend/knexfile.js`, `backend/migrations/` | إدارة قاعدة البيانات - Migrations والاستعلامات |
| **BullMQ** | ⚠️ مهم | `backend/queues/index.js` | قوائم الانتظار - معالجة المهام في الخلفية |
| **OpenAI API** | ⚠️ اختياري | `backend/routes/ai.js` | الذكاء الاصطناعي - إنشاء أوصاف العقارات، النصوص الترويجية |
| **Google Gemini** | ⚠️ اختياري | `backend/routes/ai.js` | الذكاء الاصطناعي - إنشاء الفيديوهات الترويجية، النصوص |
| **Gmail API (googleapis)** | ⚠️ مهم | `backend/services/emailService.js` | الإيميلات - إرسال إيميلات التحقق |
| **SendGrid** | ❌ غير مستخدم | - | غير مستخدم حالياً (تم استبداله بـ Gmail API) |
| **Zustand** | ✅ نعم | `frontend/lib/stores/` | إدارة الحالة - حالة التطبيق (currency, searchMap) |
| **Framer Motion** | ❌ غير مستخدم | - | غير مستخدم حالياً في الكود |
| **Radix UI** | ⚠️ مهم | `frontend/components/` | مكونات واجهة - مكونات UI متقدمة |
| **Lucide React** | ✅ نعم | `frontend/` | الأيقونات - جميع الأيقونات في الواجهة |
| **Recharts** | ❌ غير مستخدم | - | غير مستخدم حالياً في الكود |
| **Jest** | ⚠️ مهم | `backend/__tests__/` | الاختبارات - اختبار الـ API |
| **Vercel** | ⚠️ مهم | `frontend/vercel.json` | استضافة الواجهة - نشر الواجهة الأمامية |
| **Render/Railway** | ⚠️ مهم | `render.yaml`, `nixpacks.toml` | استضافة الخادم - نشر الـ Backend |
| **Docker** | ⚠️ اختياري | `Dockerfile` | الحاويات - نشر التطبيق |

## التفاصيل حسب الاستخدام

### ✅ أنظمة أساسية (مستخدمة فعلياً)

#### Frontend
- **Next.js 14**: جميع صفحات الواجهة (`frontend/app/`)
- **React 18**: جميع المكونات (`frontend/components/`)
- **TypeScript**: جميع الملفات (`.tsx`, `.ts`)
- **Tailwind CSS**: تصميم جميع الصفحات
- **Zustand**: إدارة الحالة (`currencyStore`, `searchMapStore`)
- **Lucide React**: جميع الأيقونات في الواجهة
- **Leaflet**: الخرائط (`MapClient.tsx`, `SyncedMapPane.tsx`)

#### Backend
- **Express.js 5**: جميع الـ API routes (`backend/routes/`)
- **PostgreSQL**: قاعدة البيانات (`backend/db.js`)
- **Knex.js**: Migrations (`backend/migrations/`)
- **JWT**: المصادقة (`backend/middleware/auth.js`)
- **Multer**: رفع الملفات (`backend/config/multer.js`)

### ⚠️ أنظمة مهمة (مستخدمة فعلياً)

#### المدفوعات
- **Stripe**: 
  - `backend/routes/stripe.js` - معالجة المدفوعات
  - `backend/services/stripeService.js` - خدمات Stripe
  - `backend/services/stripeClient.js` - اتصال Stripe

#### التخزين والوسائط
- **Cloudinary**: 
  - `backend/services/cloudinaryService.js` - رفع الصور والفيديوهات
  - مستخدم في `backend/routes/listings.js` لرفع الوسائط

- **Redis**: 
  - `backend/config/redis.js` - التخزين المؤقت
  - مستخدم في `index.js` لتحسين الأداء

#### الإيميلات
- **Gmail API (googleapis)**: 
  - `backend/services/emailService.js` - إرسال الإيميلات
  - إرسال إيميلات التحقق

#### الذكاء الاصطناعي
- **OpenAI API**: 
  - `backend/routes/ai.js` - إنشاء أوصاف العقارات
  - إنشاء النصوص الترويجية
  - دعم العملاء بالذكاء الاصطناعي

- **Google Gemini**: 
  - `backend/routes/ai.js` - إنشاء الفيديوهات الترويجية
  - إنشاء النصوص الترويجية (بديل لـ OpenAI)

#### قوائم الانتظار
- **BullMQ**: 
  - `backend/queues/index.js` - معالجة المهام في الخلفية

#### المصادقة
- **Passport.js**: 
  - `backend/replit_auth/` - OAuth و Google Login

#### المكونات
- **Radix UI**: 
  - `frontend/components/` - مكونات UI متقدمة (Dialog, Dropdown, etc.)

#### الاختبارات
- **Jest**: 
  - `backend/__tests__/` - اختبار الـ API

#### الاستضافة
- **Vercel**: 
  - `frontend/vercel.json` - نشر الواجهة الأمامية

- **Render/Railway**: 
  - `render.yaml`, `nixpacks.toml` - نشر الـ Backend

### ❌ أنظمة غير مستخدمة (موجودة في package.json لكن غير مستخدمة)

- **SendGrid**: غير مستخدم (تم استبداله بـ Gmail API)
- **Framer Motion**: غير مستخدم في الكود الحالي
- **Recharts**: غير مستخدم في الكود الحالي

## ملخص الاستخدام الفعلي

### ✅ مستخدمة فعلياً (25 نظام)
1. Next.js 14
2. React 18
3. TypeScript
4. Express.js 5
5. Node.js
6. PostgreSQL
7. Redis
8. Tailwind CSS
9. Leaflet
10. OpenStreetMap
11. JWT
12. Multer
13. Knex.js
14. Zustand
15. Lucide React
16. Stripe
17. Cloudinary
18. BullMQ
19. OpenAI API
20. Google Gemini
21. Gmail API
22. Passport.js
23. Radix UI
24. Jest
25. Vercel/Render

### ❌ غير مستخدمة (3 أنظمة)
1. SendGrid
2. Framer Motion
3. Recharts

## التوصيات

1. **إزالة الأنظمة غير المستخدمة** من `package.json` لتقليل حجم المشروع
2. **Redis** مهم للأداء لكن يمكن الاستغناء عنه (يستخدم fallback memory cache)
3. **Cloudinary** مهم لتخزين الوسائط لكن يمكن استبداله بـ AWS S3
4. **Stripe** أساسي للعمل التجاري
5. **OpenAI/Gemini** اختياري - يمكن إزالة ميزات AI إذا لم تكن ضرورية
