# 🔧 إصلاح سريع لمشكلة Render Deployment

## المشكلة:
```
error: failed to solve: failed to read dockerfile: open Dockerfile: no such file or directory
```

## ✅ الحل السريع:

### الخيار 1: استخدام Dockerfile (موصى به)

تم تحديث `render.yaml` لاستخدام Dockerfile. الآن:

1. **Commit التغييرات:**
```bash
git add render.yaml Dockerfile package.json package-lock.json backend/services/emailService.js
git commit -m "fix: Update render.yaml for Docker deployment and add SendGrid"
git push
```

2. **في Render Dashboard:**
   - اذهب إلى Service → Settings
   - **Environment**: يجب أن يكون `Docker`
   - **Dockerfile Path**: `Dockerfile`
   - **Docker Context**: `.`

### الخيار 2: استخدام Nixpacks (بدون Docker)

إذا أردت استخدام Nixpacks بدلاً من Docker:

1. **احذف أو أعد تسمية Dockerfile:**
```bash
mv Dockerfile Dockerfile.docker
```

2. **تحديث render.yaml:**
```yaml
services:
  - type: web
    name: baytaljazeera-backend
    env: node
    buildCommand: npm ci
    startCommand: node index.js
```

3. **Commit:**
```bash
git add .
git commit -m "fix: Use Nixpacks instead of Docker"
git push
```

## 📝 ملاحظات:

- **الخيار 1 (Docker)** أفضل لأنه يدعم FFmpeg بشكل أفضل
- **الخيار 2 (Nixpacks)** أسهل لكن قد يحتاج إعدادات إضافية لـ FFmpeg

---

**تم التحديث:** 2025-01-24
