# Bait Al-Jazeera (بيت الجزيرة)

## Overview
Bait Al-Jazeera is a **Gulf-wide (GCC)** real estate marketplace serving Saudi Arabia, UAE, Kuwait, Qatar, Bahrain, and Oman. The platform provides a sophisticated, user-friendly experience with a luxury, Islamic/royal aesthetic. It offers premium subscription plans, advanced property search with interactive maps, and AI-powered features. The platform focuses on comprehensive property transactions, elite property showcases, quota management, and a robust admin system for finance, marketing, and user management, with a vision to become a leading real estate platform across the Gulf region.

## User Preferences
- **CRITICAL: Push to GitHub after every change** - Railway/Vercel deploy from GitHub, NOT Replit. Always run `git push origin main` after completing any task.
- **Gulf-wide platform** (NOT Saudi-only) - content must be neutral for all GCC countries
- Luxury, premium design aesthetic
- Arabic RTL interface
- Gulf Luxury color palette: Desert Gold (#D4AF37), Gulf Navy (#01273C), Royal Emerald (#0B6B4C)
- Clear pricing hierarchy
- Responsive, mobile-friendly design
- Plans ordered from cheapest to most premium
- Visual feature comparison (checkmarks/X marks)
- Unified feature ordering across all plans
- GPS Integration: User location displayed as blue marker on map (موقعك 📍)
- Custom Property Images: Real images stored and mapped to properties by ID
- Comprehensive Cities Database: Deep search covering 343 cities across 9 countries (133 Saudi, 24 UAE, 18 Kuwait, 12 Qatar, 16 Bahrain, 20 Oman, 50 Egypt, 22 Lebanon, 48 Turkey)
- Map Auto-Navigation: Map automatically flies to selected country/city location with appropriate zoom level
- Local Currency Display: When selecting a non-Saudi country, prices are automatically converted and displayed in local currency (TRY, EGP, LBP, AED, KWD, QAR, BHD, OMR)
- Multi-Currency Property Pricing: Listing detail pages show prices in local currency with USD conversion using daily-updated exchange rates
- Automatic Geolocation Detection: Visitors' location is detected via IP (ip-api.com) to auto-select country on plans page and fly map to their location on search page. Falls back to Saudi Arabia for localhost/unsupported countries

## System Architecture
The application comprises a Node.js/Express.js backend and a Next.js 16 + React 19 frontend, designed with a luxury, Arabic RTL, and responsive UI/UX using a gold and navy color scheme.

### UI/UX Decisions
- **Design Aesthetic**: Luxury, Islamic/royal, gold and navy color scheme with radial gradients, optimized for Arabic RTL.
- **Responsiveness**: Fully responsive and mobile-friendly across devices.
- **Plan Display**: Clear pricing hierarchy, visual feature indicators, and dynamic feature lists using ribbons and badges.
- **Admin Interface**: Dynamic sidebar filtering based on roles, role badges, and consistent status color system (Red, Amber, Green, Gray).
- **Design System**: A centralized, token-based design system (`frontend/lib/design-tokens.ts`) for consistent styling.
- **Premium UI Components**: Custom components for skeletons, empty states, loading spinners, and animated cards.

### Technical Implementations
- **Frontend**: Utilizes Next.js 16, React 19, TypeScript, Tailwind CSS, Leaflet for interactive maps, and Zustand for state management. Features include multi-step forms and messaging systems.
- **Backend**: Built with Express.js 5.x, following a modular architecture with layers for config, services, scheduler, and routes. It includes JWT authentication, RESTful APIs, and Multer for file uploads.
    - **Code Quality**: Emphasizes high code quality with centralized utilities for database queries (`queryHelpers.js`), pagination (`validatePagination` middleware), error handling (`asyncHandler`), and unified pricing/currency logic (`pricingService.js`).
    - **Service Layer Architecture**: Centralized business logic in dedicated services:
        - `planService.js`: Plan CRUD with validation (PLAN_VALIDATION_RULES), transactions, audit logging, and race condition protection (FOR UPDATE locking). Includes automatic propagation of plan changes to subscribers:
          - `duration_days` changes propagate to user_plans and quota_buckets
          - `max_listings` changes propagate to quota_buckets
          - `show_on_map` and `seo_level` changes propagate to active properties
          - Price changes flag `countryPricesNeedReview` for admin review
          - Significant changes trigger async batch notifications to subscribers
        - `promotionService.js`: Unified promotion logic with caching and discount calculations
        - `loggerService.js`: Structured logging (request/error/audit/security/performance)
- **Core Features**:
    - **Property Management**: Includes fields for `land_area` and `building_area`, with a "Large Area Mode" for large parcels.
    - **Advanced Property Search**: Comprehensive filters and interactive map synchronized with a list view.
    - **Subscription & Quota System**: Admin CRUD for plans, customer-facing display, and a quota system for listing allowances.
    - **Elite Properties Showcase**: Homepage section for premium listings with a booking system for 9 slots, auto-release on hide, and promotional cards for empty slots.
    - **Search Page Promotional System (Frontend-only)**: Features full-screen promotional overlays and promotional cards when no search results are found, encouraging users to list.
    - **Featured Cities System**: Admin-managed "Most Requested Cities" displayed in the search sidebar with filtering functionality.
    - **AI-Powered Features**: Integrates OpenAI and Gemini for an admin AI center, customer chatbot, smart pricing, marketing tips, AI conversation analysis, and AI-powered SEO generation.
    - **Advanced Video Generation System**: Professional property video creation with:
      - 4 video templates: Luxury (فاخر), Modern (عصري), Classic (كلاسيكي), Minimal (بسيط)
      - Ken Burns effects with template-specific motion styles (slow, dynamic, gentle, subtle)
      - Professional transitions: fade, dissolve, wipeleft, slideup, circleopen, radial
      - AI-generated promotional text with strong marketing copy
      - Ambient background audio generated dynamically per template mood (elegant, upbeat, warm, calm)
      - Arabic RTL text support with proper reshaping and glow effects
      - Endpoints: GET `/api/ai/video-templates`, POST `/api/ai/user/generate-advanced-video`
    - **SEO as Paid Feature**: Tiered SEO features (Level 0, 1, 2) with AI-generated content, Schema.org JSON-LD, and dynamic meta tags.
    - **Admin Systems**: Comprehensive administration for listing reports, finance, marketing analytics, RBAC, user management, payments, invoicing, and refunds.
    - **Enhanced Billing System**: Supports partial refunds, multiple partial refunds per invoice, complaint-invoice linking, and a full chargeback management system with audit logging.
    - **Conversation Monitoring**: Admin interface for real-time customer-to-customer message monitoring, AI-powered risk detection, and flagging.
    - **Account Alerts System**: Customer notification system for admin warnings and unread counts.
    - **Advertiser Rating & Reputation System**: Comprehensive review system including 1-5 star ratings, automated approval for positive reviews, manual review for negative, trusted badges, and reward points.
    - **Marketing & Advertising System**: Marketing automation for customer segmentation, email campaigns, WhatsApp campaigns (Twilio integration), Google Review integration, and retargeting.
    - **Advanced Promotions Engine**: Flexible system for promotion types (free_trial, discount), seasonal tags, usage limits, plan targeting, time-limited campaigns, and admin management, with direct integration into pricing and payment flows.
    - **Referral System**: Customer referral program where each user gets a unique code (AQR + 6 chars). When 10 users register with their code, they receive a free 1-year Business subscription. Features include: automatic code generation on registration, self-referral prevention, referral tracking, automatic reward granting, customer-facing referral page, and admin statistics.
    - **Ambassador Admin Dashboard**: Comprehensive admin interface for managing the ambassador program with three main sections: Overview (statistics, top ambassadors, referral/redemption line chart for last 14 days), Requests (approve/reject reward claims), and Settings (configure reward thresholds and values, enable/disable entire system). Invoice pages now display referrer information (ambassador name and code) with visual indicators. Main admin dashboard includes ambassador statistics section with interactive charts tracking referrals and redemptions over time. Features a global system toggle in Settings tab allowing super admins to enable/disable the entire ambassador program - when disabled, the referral link is hidden from customer navigation, the customer referral page shows a "program unavailable" message, and all customer API endpoints return 503. Referral requirements system: admin can configure `require_first_listing` which marks referrals as `pending_listing` until the referred user creates their first property listing, then auto-completes the referral and updates ambassador stats.
    - **Customer Referral Page**: Customer-facing page at `/referral` showing user's ambassador code, progress towards rewards, and instructions on how to share and earn. Accessible via user account dropdown menu. Features interactive 3D building with clickable floors - collapsed/flagged floors can be clicked to view collapse reason and removed to allow rebuilding.
    - **Sidebar Visibility Control**: Admin settings page at `/admin/settings/sidebar` allowing super admins to show/hide sidebar menu sections dynamically. Protected sections (dashboard, settings) cannot be hidden. Changes apply to all admins immediately and are logged in audit trail.

### System Design Choices
- **Database**: PostgreSQL on Neon, managed with Knex.js migrations.
- **Caching**: Upstash Redis for caching with automatic fallback and smart invalidation; in-memory caching for dashboard stats.
- **Task Queues**: BullMQ for background job processing (emails, video, AI tasks).
- **Exchange Rates**: Daily-updated exchange rates stored in a database table via a cron job using exchangerate-api.com.
- **Performance**: Optimized with indexes, connection pooling, query optimization (e.g., CTE + UNION ALL patterns), and Redis caching for frequently accessed data.
- **Security**: Enterprise-grade security measures including:
    - JWT in httpOnly cookies with mandatory `JWT_SECRET`
    - Hardened Helmet CSP (removed unsafe-eval, restricted sources)
    - Admin audit logging with comprehensive trail
    - Tiered rate limiting (general, auth, strict)
    - Strong password policy (12+ chars) with account lockout
    - Input sanitization (XSS, prototype pollution prevention)
    - CSRF protection with timing-safe comparison
    - Secure file upload (randomized names, magic byte validation)
    - Path traversal prevention in media generation
    - Text sanitization for FFmpeg/ASS injection prevention
- **Monitoring & Observability**: Health check endpoint and structured request logging.
- **Memory Management**: Automatic cleanup of video operations.
- **Scalability**: Designed with clear separation of concerns and modular features.

## External Dependencies
- **Database**: PostgreSQL (Neon)
- **Mapping**: Leaflet, `react-leaflet`, OpenStreetMap
- **Styling**: Tailwind CSS
- **Authentication**: JWT + bcrypt, Replit Auth (Google, Apple, GitHub, X, Email/Password)
- **State Management**: Zustand
- **AI**: OpenAI (via Replit AI Integrations), Google Veo (via Gemini API)
- **WhatsApp Marketing**: Twilio
- **Task Scheduling**: node-cron
- **Testing**: Jest + Supertest