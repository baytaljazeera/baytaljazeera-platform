# 🚀 إعداد AWS App Runner - دليل شامل

## ✅ لماذا AWS App Runner؟
- ✅ يدعم Dockerfile مباشرة
- ✅ إدارة تلقائية (Scaling, Health Checks)
- ✅ موثوق وقابل للتوسع
- ✅ سعر معقول (~$5-10/شهر للاستخدام المتوسط)
- ✅ أسهل من EC2 مباشرة

---

## 📋 المتطلبات:
1. حساب AWS (مجاني 12 شهر)
2. Dockerfile (جاهز ✅)

---

## 🎯 الخطوات بالتفصيل:

### 1️⃣ إنشاء حساب AWS (إذا لم يكن موجود)
- اذهب إلى: https://aws.amazon.com
- سجل حساب جديد
- **ملاحظة**: احتاج بطاقة ائتمان لكن لن يخدموك ما لم تستخدم خدمات مدفوعة

### 2️⃣ فتح AWS Console
- اذهب إلى: https://console.aws.amazon.com
- ابحث عن "App Runner" في الـ search bar

### 3️⃣ إنشاء App Runner Service

#### أ) ابدأ بـ "Create service"
- اختر "Source code repository"
- اربط GitHub:
  - اضغط "Add new"
  - سجل دخول GitHub
  - اختر Repository: `baytaljazeera-platform`
  - Branch: `main`

#### ب) إعدادات Build:
- **Configuration source**: `Use a configuration file I push to source repository`
- **Config file path**: `.apprunner.yaml` (أو اتركه فارغ ليستخدم Dockerfile)

#### ج) إعدادات Deploy:
- **Service name**: `baytaljazeera-backend`
- **Virtual CPU**: `1 vCPU` (للبداية)
- **Memory**: `2 GB` (للبداية)
- **Port**: `8080`
- **Auto deploy**: `Yes` (يحدث تلقائياً عند push)

#### د) Environment Variables:
أضف جميع المتغيرات من Railway:
```
NODE_ENV=production
DATABASE_URL=your_postgres_url
SESSION_SECRET=your_secret
CLOUDINARY_URL=your_cloudinary_url
NEXT_PUBLIC_API_URL=your_app_runner_url
PORT=8080
```

### 4️⃣ إنشاء PostgreSQL Database (RDS)

#### أ) اذهب إلى RDS Console:
- ابحث عن "RDS" في AWS Console
- اضغط "Create database"

#### ب) إعدادات Database:
- **Engine**: PostgreSQL (أحدث نسخة)
- **Template**: Free tier (للبداية)
- **DB instance identifier**: `baytaljazeera-db`
- **Master username**: `admin`
- **Master password**: اختر كلمة سر قوية
- **DB instance class**: `db.t3.micro` (Free tier)
- **Storage**: `20 GB` (Free tier)
- **VPC**: Default VPC

#### ج) Security:
- **Public access**: `Yes` (للوصول من App Runner)
- **VPC security group**: اختر default أو أنشئ واحد جديد

#### د) بعد الإنشاء:
- انتظر 5-10 دقائق حتى يصبح `Available`
- انسخ `Endpoint` من RDS Dashboard
- استخدمه في `DATABASE_URL`:
  ```
  postgresql://admin:password@endpoint:5432/postgres
  ```

### 5️⃣ تحديث Environment Variables في App Runner:
- عد إلى App Runner Service
- Settings → Environment variables
- حدّث `DATABASE_URL` بالرابط من RDS

### 6️⃣ بعد Deployment:
- ستحصل على رابط مثل: `https://xxxxx.us-east-1.awsapprunner.com`
- حدّث `NEXT_PUBLIC_API_URL` في Vercel بهذا الرابط

---

## 💰 التكلفة التقريبية:
- **App Runner**: ~$0.007/hour = ~$5/شهر (عند الاستخدام المستمر)
- **RDS (Free tier)**: مجاني 12 شهر، ثم ~$15/شهر
- **الإجمالي**: مجاني 12 شهر، ثم ~$20/شهر

---

## 🔧 بدائل AWS أخرى:

### أ) AWS Elastic Beanstalk (أسهل قليلاً):
- يدعم Dockerfile
- إدارة تلقائية
- لكن أقل مرونة من App Runner

### ب) AWS EC2 + Docker (أصعب لكن أرخص):
- $5/شهر (t2.micro)
- يحتاج إعداد يدوي أكثر
- أفضل للتحكم الكامل

### ج) AWS Lightsail (الأسهل):
- $5-10/شهر
- بسيط جداً
- لكن أقل مرونة

---

## ✅ الخطوات التالية بعد الإعداد:
1. ✅ حدّث `NEXT_PUBLIC_API_URL` في Vercel
2. ✅ اختبر الـ API endpoints
3. ✅ راقب Logs في CloudWatch
4. ✅ ضبط Auto-scaling حسب الحاجة

---

## 🆘 إذا واجهت مشاكل:
- **CloudWatch Logs**: للتحقق من الأخطاء
- **App Runner Metrics**: لمراقبة الأداء
- **RDS Status**: تأكد أن Database `Available`

---

## 📚 روابط مفيدة:
- AWS App Runner Docs: https://docs.aws.amazon.com/apprunner
- AWS Free Tier: https://aws.amazon.com/free
- AWS Pricing Calculator: https://calculator.aws

---

**🎯 نصيحتي**: ابدأ بـ App Runner لأنه الأسهل والأكثر موثوقية. بعدها يمكنك الترقية حسب الحاجة!
