# إصلاح مشكلة Dockerfile على Render
# Render Dockerfile Fix

## 🔴 المشكلة / Problem

```
error: failed to solve: failed to read dockerfile: open Dockerfile: no such file or directory
error: exit status 1
```

## ✅ الحل / Solution

تم تحديث `render.yaml` لاستخدام Dockerfile بشكل صحيح.

### التغييرات / Changes:

1. **تحديث render.yaml:**
   - تغيير `env: node` إلى `env: docker`
   - إضافة `dockerfilePath: ./Dockerfile`
   - إضافة `dockerContext: .`
   - إزالة `buildCommand` و `startCommand` (لأن Dockerfile يحتوي على CMD)

## 📋 خطوات الإصلاح / Fix Steps

### 1. Commit التغييرات

```bash
git add render.yaml Dockerfile
git commit -m "fix: Update render.yaml to use Dockerfile correctly"
git push
```

### 2. في Render Dashboard

إذا كان Service موجود بالفعل:

1. اذهب إلى **Settings** → **Build & Deploy**
2. تأكد من:
   - **Environment**: `Docker`
   - **Dockerfile Path**: `Dockerfile` (أو `./Dockerfile`)
   - **Docker Context**: `.` (root directory)

3. أو احذف Service وأنشئه من جديد:
   - **New** → **Web Service**
   - اختر Repository
   - **Environment**: `Docker`
   - Render سيكتشف Dockerfile تلقائياً

### 3. التحقق من Dockerfile

تأكد من أن Dockerfile موجود في الجذر:
```bash
ls -la Dockerfile
```

## 🔍 استكشاف الأخطاء / Troubleshooting

### إذا استمرت المشكلة:

1. **تحقق من أن Dockerfile موجود في GitHub:**
   ```bash
   git ls-files | grep Dockerfile
   ```

2. **تحقق من محتوى Dockerfile:**
   ```bash
   cat Dockerfile
   ```

3. **اختبار Dockerfile محلياً:**
   ```bash
   docker build -t baytaljazeera-test .
   ```

### بديل: استخدام Nixpacks (بدون Docker)

إذا أردت استخدام Nixpacks بدلاً من Docker:

1. احذف أو أعد تسمية Dockerfile:
   ```bash
   mv Dockerfile Dockerfile.backup
   ```

2. استخدم `nixpacks.toml` الموجود

3. في render.yaml:
   ```yaml
   env: node
   ```

---

**آخر تحديث:** 2025-01-XX
