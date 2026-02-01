# Environment Variables Example

## Gmail API (Email Service)

```bash
# Gmail API Credentials
GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REFRESH_TOKEN=your-refresh-token
GMAIL_USER_EMAIL=info@baytaljazeera.com
GMAIL_FROM_NAME=بيت الجزيرة
```

## Other Required Variables

```bash
# Database
DATABASE_URL=postgresql://...

# JWT & Session
JWT_SECRET=your-jwt-secret
SESSION_SECRET=your-session-secret

# Frontend URL
FRONTEND_URL=https://baytaljazeera.com

# Redis (للقوائم والـ Video Queue)
# Upstash: https://upstash.com أو Redis محلي
UPSTASH_REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379
# أو
REDIS_URL=redis://localhost:6379

# Video Worker (مطلوب لتوليد الفيديو على Render)
# رابط خدمة bayt-video-worker على Render
PYTHON_WORKER_URL=https://bayt-video-worker.onrender.com

# Video Queue (اختياري - للتطوير)
# لتفعيل قائمة الفيديو في بيئة التطوير
VIDEO_QUEUE_ENABLED=true

# تعطيل جميع القوائم
# DISABLE_QUEUES=true
```

---

**ملاحظة:** استبدل `your-*` بالقيم الفعلية من Google Cloud Console.
