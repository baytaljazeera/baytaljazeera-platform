# إعداد Video Queue - بيت الجزيرة

## نظرة عامة

تم ربط توليد الفيديو بنظام **BullMQ** لمعالجة الطلبات في الخلفية دون إيقاف الـ API.

---

## كيف يعمل

```
المستخدم يضغط "إعادة إنشاء الفيديو"
        ↓
POST /api/listings/:id/regenerate-video
        ↓
videoQueue.add('listing-slideshow', { listingId, imageUrls, listingData })
        ↓
┌─────────────────────────────────────────────────────────┐
│  Redis متوفر؟                                            │
│  نعم → Job يُضاف للقائمة → Worker يلتقطه ويعالج         │
│  لا  → processVideoImmediately() يعالج فوراً              │
└─────────────────────────────────────────────────────────┘
        ↓
generateListingSlideshow() → FFmpeg → Cloudinary
```

---

## متطلبات التشغيل

### 1. Redis (للإنتاج)

- **Upstash** (مجاني): https://upstash.com
- أو **Redis محلي**: `redis://localhost:6379`

```bash
UPSTASH_REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379
```

### 2. تفعيل Queue في الإنتاج

في الإنتاج (`NODE_ENV=production`)، الـ Queue يعمل تلقائياً عند وجود Redis.

### 3. تفعيل Queue في التطوير (اختياري)

```bash
VIDEO_QUEUE_ENABLED=true
UPSTASH_REDIS_URL=rediss://...
```

---

## متغيرات البيئة

| المتغير | الوصف | افتراضي |
|---------|-------|---------|
| `UPSTASH_REDIS_URL` أو `REDIS_URL` | رابط Redis | - |
| `VIDEO_QUEUE_ENABLED` | تفعيل Queue في التطوير | `false` |
| `DISABLE_QUEUES` | تعطيل جميع القوائم | `false` |
| `NODE_ENV` | `production` = Queue مفعّل مع Redis | - |

---

## سلوك بدون Redis

عند عدم وجود Redis أو تعطيل القوائم:
- الطلب يُعالج **فوراً** عبر `processVideoImmediately`
- نفس النتيجة، لكن على نفس عملية الـ API (قد يبطئ الطلبات الأخرى)

---

## التوسع المستقبلي

- **زيادة Workers**: تشغيل عدة نسخ من التطبيق (كل نسخة لديها Worker)
- **Worker منفصل**: تشغيل عملية Node منفصلة كـ Worker فقط
- **Video Worker (Python)**: ربط خدمة Python المنفصلة لاحقاً
