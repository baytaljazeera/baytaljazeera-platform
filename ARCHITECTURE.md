# Aqar Al-Jazeera V2 - Architecture Documentation
# توثيق بنية عقار الجزيرة V2

## System Architecture Diagram / مخطط بنية النظام

```mermaid
graph TD
  subgraph Client[العميل]
    U[متصفح العميل/المدير]
  end
  
  subgraph Frontend[Next.js 16 - الواجهة الأمامية]
    F1[الصفحات العامة<br/>الرئيسية، البحث، العقارات، الباقات، التسجيل]
    F2[منطقة العميل<br/>حسابي، المفضلة، الرسائل، عقاراتي]
    F3[غلاف لوحة التحكم<br/>AdminShell + Sidebar + Topbar]
    F4[وحدات الإدارة<br/>لوحة التحكم، العقارات، المالية، التسويق<br/>العضويات، الرسائل، البلاغات، الصلاحيات<br/>الدعم، المستخدمين، الشكاوى]
    F5[Zustand Auth Store<br/>إدارة حالة المصادقة]
  end
  
  subgraph Backend[Express API - الخادم]
    B1[مسارات المصادقة<br/>Auth Routes]
    B2[مسارات العقارات<br/>Listings + Media Upload]
    B3[الباقات والعضويات<br/>Plans & Membership]
    B4[API الصلاحيات<br/>Permissions]
    B5[APIs الرسائل<br/>User/Admin Messages]
    B6[المالية والتسويق<br/>Finance & Marketing]
    B7[الإشعارات والبلاغات<br/>Notifications & Reports]
    B8[لوحة تحكم المدير<br/>Admin Dashboard]
    MW[الوسيط<br/>authMiddleware<br/>adminMiddleware<br/>requireRoles]
  end
  
  subgraph DB[PostgreSQL - قاعدة البيانات]
    D1[users - المستخدمين]
    D2[admin_users - المديرين]
    D3[properties - العقارات]
    D4[listing_media - وسائط العقارات]
    D5[plans - الباقات]
    D6[user_plans - اشتراكات المستخدمين]
    D7[role_permissions - صلاحيات الأدوار]
    D8[messages - الرسائل]
    D9[notifications - الإشعارات]
    D10[listing_reports - بلاغات العقارات]
  end
  
  subgraph Integrations[التكاملات الخارجية]
    I1[Leaflet/OpenStreetMap<br/>الخرائط]
    I2[Multer<br/>رفع الملفات]
  end
  
  U -->|HTTPS| F1
  U --> F3
  F5 -->|JWT Cookie| F3
  F1 & F2 & F3 & F4 -->|fetch API| Backend
  Backend -->|التحقق| MW
  MW -->|استعلامات| DB
  B2 --> I2
  F2 -->|خرائط| I1
  F3 -->|تحكم الصلاحيات| B4
  B4 --> D7
  B5 --> D8
  B2 --> D3
  D3 --> D4
  B3 --> D5
  B3 --> D6
  B7 --> D9
  B7 --> D10
```

---

## Component Hierarchy / التسلسل الهرمي للمكونات

### Frontend Structure / بنية الواجهة الأمامية

```
frontend/
├── app/                              # Next.js App Router
│   ├── layout.tsx                    # التخطيط الرئيسي (Navbar, Footer)
│   ├── page.tsx                      # الصفحة الرئيسية
│   │
│   ├── (standalone)/                 # صفحات مستقلة
│   │   ├── admin-login/              # تسجيل دخول المديرين
│   │   └── request-access/           # طلب الانضمام
│   │
│   ├── admin/                        # لوحة تحكم الإدارة
│   │   ├── layout.tsx                # AdminShell
│   │   ├── dashboard/                # لوحة التحكم الرئيسية
│   │   ├── listings/                 # إدارة العقارات
│   │   ├── finance/                  # الإدارة المالية
│   │   ├── marketing/                # التسويق والتحليلات
│   │   ├── membership/               # إدارة العضويات
│   │   ├── messages/                 # رسائل العملاء
│   │   ├── reports/                  # البلاغات
│   │   ├── roles/                    # إدارة الصلاحيات
│   │   ├── support/                  # الدعم الفني
│   │   ├── users/                    # إدارة المستخدمين
│   │   ├── complaints/               # الشكاوى
│   │   ├── plans/                    # إدارة الباقات
│   │   └── news/                     # إدارة الأخبار
│   │
│   ├── listings/                     # صفحات العقارات
│   │   ├── page.tsx                  # قائمة العقارات
│   │   ├── [id]/                     # تفاصيل عقار
│   │   └── new/                      # إنشاء عقار جديد
│   │
│   ├── plans/                        # صفحة الباقات
│   ├── search/                       # البحث المتقدم
│   └── account/                      # حساب المستخدم
│
├── components/
│   ├── admin/                        # مكونات الإدارة
│   │   ├── AdminShell.tsx            # الغلاف الرئيسي
│   │   ├── AdminSidebar.tsx          # الشريط الجانبي
│   │   └── AdminTopbar.tsx           # الشريط العلوي
│   │
│   ├── ui/                           # مكونات واجهة المستخدم
│   └── sections/                     # أقسام الصفحات
│
└── lib/
    ├── stores/
    │   └── authStore.ts              # إدارة حالة المصادقة
    └── constants/
        └── planOptions.ts            # ثوابت الباقات
```

### Backend Structure / بنية الخادم

```
backend/
├── routes/                           # مسارات API
│   ├── auth.js                       # المصادقة وتسجيل الدخول
│   ├── listings.js                   # العقارات
│   ├── plans.js                      # الباقات
│   ├── membership.js                 # العضويات
│   ├── messages.js                   # رسائل المستخدمين
│   ├── admin-messages.js             # رسائل المديرين
│   ├── finance.js                    # الإدارة المالية
│   ├── marketing.js                  # التسويق
│   ├── notifications.js              # الإشعارات
│   ├── permissions.js                # الصلاحيات
│   ├── favorites.js                  # المفضلة
│   └── account.js                    # الحساب
│
├── middleware/
│   └── auth.js                       # التحقق من المصادقة والصلاحيات
│
├── init.js                           # تهيئة قاعدة البيانات
└── db.js                             # اتصال PostgreSQL
```

---

## Database Schema / مخطط قاعدة البيانات

```mermaid
erDiagram
    users ||--o{ properties : "يملك"
    users ||--o{ user_plans : "يشترك"
    users ||--o{ messages : "يرسل"
    users ||--o{ favorites : "يفضل"
    users ||--o{ notifications : "يستلم"
    
    properties ||--o{ listing_media : "يحتوي"
    properties ||--o{ listing_reports : "يُبلّغ عنه"
    
    plans ||--o{ user_plans : "يشمل"
    
    admin_users ||--o{ admin_messages : "يرسل"
    admin_users }|--|| role_permissions : "له صلاحيات"

    users {
        serial id PK
        varchar name
        varchar email UK
        varchar password_hash
        varchar phone
        varchar status
        timestamp created_at
    }
    
    admin_users {
        serial id PK
        varchar name
        varchar email UK
        varchar password_hash
        varchar role
        timestamp created_at
    }
    
    properties {
        serial id PK
        int user_id FK
        varchar title
        text description
        varchar property_type
        varchar listing_type
        decimal price
        int bedrooms
        int bathrooms
        decimal area
        varchar city
        varchar district
        decimal latitude
        decimal longitude
        varchar status
        timestamp created_at
    }
    
    listing_media {
        serial id PK
        int listing_id FK
        varchar media_type
        varchar url
        int sort_order
    }
    
    plans {
        serial id PK
        varchar name
        decimal price
        int duration_days
        int listing_limit
        jsonb features
        boolean is_visible
        varchar color
        varchar logo_url
    }
    
    user_plans {
        serial id PK
        int user_id FK
        int plan_id FK
        timestamp start_date
        timestamp end_date
        varchar status
    }
    
    role_permissions {
        serial id PK
        varchar role
        varchar permission_key
        boolean is_granted
    }
    
    messages {
        serial id PK
        int sender_id FK
        int receiver_id FK
        text content
        boolean is_read
        timestamp created_at
    }
    
    notifications {
        serial id PK
        int user_id FK
        varchar type
        text content
        boolean is_read
        timestamp created_at
    }
    
    listing_reports {
        serial id PK
        int listing_id FK
        int reporter_id FK
        varchar reason
        text details
        varchar status
        timestamp created_at
    }
```

---

## Data Flows / تدفق البيانات

### 1. Authentication Flow / تدفق المصادقة

```mermaid
sequenceDiagram
    participant U as المستخدم
    participant F as Next.js
    participant A as Express API
    participant D as PostgreSQL
    
    U->>F: تسجيل الدخول
    F->>A: POST /api/auth/login
    A->>D: التحقق من البيانات
    D-->>A: بيانات المستخدم
    A-->>F: JWT Cookie + بيانات المستخدم
    F->>F: تخزين في Zustand
    F-->>U: توجيه للصفحة المطلوبة
```

### 2. Listing Creation Flow / تدفق إنشاء عقار

```mermaid
sequenceDiagram
    participant U as المستخدم
    participant F as Next.js
    participant A as Express API
    participant M as Multer
    participant D as PostgreSQL
    
    U->>F: إنشاء عقار جديد
    F->>A: POST /api/listings/create
    A->>D: التحقق من حد الباقة
    D-->>A: عدد العقارات الحالية
    A->>M: رفع الصور
    M-->>A: مسارات الملفات
    A->>D: حفظ العقار + الوسائط
    D-->>A: تأكيد الحفظ
    A-->>F: نجاح + بيانات العقار
    F-->>U: توجيه لصفحة العقار
```

### 3. Admin Permission Flow / تدفق صلاحيات المدير

```mermaid
sequenceDiagram
    participant SA as Super Admin
    participant F as Next.js
    participant A as Express API
    participant D as PostgreSQL
    
    SA->>F: فتح صفحة الصلاحيات
    F->>A: GET /api/permissions/list
    A->>D: جلب الصلاحيات
    D-->>A: قائمة الصلاحيات لكل دور
    A-->>F: البيانات
    F-->>SA: عرض الجدول
    
    SA->>F: تعديل صلاحية
    F->>A: PUT /api/permissions/role/:role
    A->>D: تحديث role_permissions
    D-->>A: تأكيد التحديث
    A-->>F: نجاح
    F-->>SA: تحديث الواجهة
```

---

## Key Features Architecture / بنية الميزات الرئيسية

### Role-Based Access Control (RBAC) / التحكم بالوصول حسب الأدوار

| الدور | الوصف | الصلاحيات الافتراضية |
|-------|-------|---------------------|
| `super_admin` | المدير العام | جميع الصلاحيات |
| `finance_admin` | مدير المالية | لوحة التحكم، الرسائل، المالية، العضويات، الباقات |
| `support_admin` | مدير الدعم | لوحة التحكم، الرسائل، الشكاوى، الدعم |
| `content_admin` | مدير المحتوى | لوحة التحكم، الرسائل، العقارات، البلاغات، الأخبار |

### Permission Keys / مفاتيح الصلاحيات

| المفتاح | الوصف |
|---------|-------|
| `dashboard` | لوحة التحكم |
| `messages` | الرسائل |
| `listings` | إدارة العقارات |
| `reports` | البلاغات |
| `users` | إدارة المستخدمين |
| `roles` | إدارة الصلاحيات |
| `support` | الدعم الفني |
| `complaints` | الشكاوى |
| `finance` | الإدارة المالية |
| `marketing` | التسويق |
| `membership` | العضويات |
| `plans` | الباقات |
| `news` | الأخبار |

---

## Technology Stack / التقنيات المستخدمة

| الطبقة | التقنية |
|--------|---------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Backend | Express.js 5.x, Node.js |
| Database | PostgreSQL (Neon) |
| Authentication | JWT, bcrypt |
| State Management | Zustand |
| Maps | Leaflet, react-leaflet, OpenStreetMap |
| File Upload | Multer |
| Styling | Tailwind CSS, RTL Support |

---

## Security Measures / إجراءات الأمان

1. **JWT في httpOnly Cookies** - لمنع هجمات XSS
2. **bcrypt** - لتشفير كلمات المرور
3. **Middleware للتحقق** - على كل المسارات المحمية
4. **RBAC متعدد المستويات** - للتحكم الدقيق بالصلاحيات
5. **التحقق من صحة البيانات** - على الخادم والعميل

---

## External Integrations / التكاملات الخارجية

| الخدمة | الاستخدام |
|--------|----------|
| OpenStreetMap | عرض الخرائط التفاعلية |
| Leaflet | مكتبة الخرائط |
| Neon PostgreSQL | قاعدة البيانات السحابية |

---

*آخر تحديث: ديسمبر 2025*
