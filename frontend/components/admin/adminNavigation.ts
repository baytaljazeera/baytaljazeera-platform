import {
  LayoutDashboard,
  FileText,
  Headset,
  Users,
  Newspaper,
  UserPlus2,
  BrainCircuit,
  Settings,
  CreditCard,
  Flag,
  MessageSquare,
  Shield,
  Wallet,
  Megaphone,
  Eye,
  MapPin,
  Building2,
  Home,
  HeartHandshake,
  Lock,
  MessageCirclePlus,
  RotateCcw,
  MessageCircle,
  Inbox,
  Crown,
  Bell,
  Activity,
} from "lucide-react";

export type AdminLink = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  isReport?: boolean;
  permissionKey: string;
  childRoutes?: string[];
};

export type AdminSection = {
  id: string;
  title: string;
  icon: typeof LayoutDashboard;
  colorClass: string;
  links: AdminLink[];
};

export const adminSections: AdminSection[] = [
  {
    id: "executive",
    title: "نظرة تنفيذية",
    icon: LayoutDashboard,
    colorClass: "text-[#D4AF37]",
    links: [
      {
        href: "/admin/dashboard",
        label: "لوحة التحكم",
        icon: LayoutDashboard,
        permissionKey: "dashboard",
      },
      {
        // Reserved for the top of the org chart only. Visibility is also
        // hard-gated by role in AdminSidebar (super_admin / admin) — the
        // permissionKey here is just so it shows in nav when role matches.
        href: "/admin/executive-inbox",
        label: "صندوق الإدارة العليا",
        icon: Crown,
        permissionKey: "executive_inbox",
      },
      {
        // Executive operational board — KPIs, bottlenecks, SLA health,
        // complaints heatmap. Role-gated same way as executive-inbox.
        href: "/admin/executive-overview",
        label: "اللوحة التنفيذية",
        icon: Activity,
        permissionKey: "executive_inbox",
      },
      {
        // Personal — every admin's own notification center.
        href: "/admin/notifications",
        label: "مركز الإشعارات",
        icon: Bell,
        permissionKey: "dashboard",
      },
    ],
  },
  {
    id: "properties",
    title: "إدارة العقارات",
    icon: Home,
    colorClass: "text-blue-400",
    links: [
      {
        href: "/admin/listings",
        label: "الإعلانات",
        icon: FileText,
        permissionKey: "listings",
        childRoutes: ["/admin/elite-slots", "/admin/finance/listings"],
      },
      {
        href: "/admin/reports",
        label: "بلاغات الإعلانات",
        icon: Flag,
        isReport: true,
        permissionKey: "reports",
      },
      {
        href: "/admin/featured-cities",
        label: "المدن الأكثر طلبًا",
        icon: MapPin,
        permissionKey: "settings",
      },
    ],
  },
  {
    id: "support",
    title: "خدمة العملاء",
    icon: HeartHandshake,
    colorClass: "text-emerald-400",
    links: [
      {
        href: "/admin/customer-service",
        label: "الشكاوى والدعم",
        icon: Headset,
        permissionKey: "support",
        childRoutes: ["/admin/complaints", "/admin/support"],
      },
      {
        href: "/admin/omni-inbox",
        label: "البريد الموحد",
        icon: Inbox,
        permissionKey: "support_internal",
        childRoutes: ["/admin/messages"],
      },
      {
        href: "/admin/customer-conversations",
        label: "مراقبة المحادثات",
        icon: Eye,
        permissionKey: "support",
      },
    ],
  },
  {
    id: "feedback",
    title: "تجربة المستخدم",
    icon: MessageCirclePlus,
    colorClass: "text-amber-400",
    links: [
      { href: "/admin/feedback/overview", label: "نظرة عامة", icon: LayoutDashboard, permissionKey: "support" },
      { href: "/admin/feedback/responses", label: "الردود", icon: MessageSquare, permissionKey: "support" },
      { href: "/admin/feedback/settings", label: "إعدادات التغذية الراجعة", icon: Settings, permissionKey: "support" },
      { href: "/admin/feedback/questions", label: "إدارة الأسئلة", icon: FileText, permissionKey: "support" },
    ],
  },
  {
    id: "finance",
    title: "المالية والاشتراكات",
    icon: Wallet,
    colorClass: "text-green-400",
    links: [
      {
        href: "/admin/finance-inbox",
        label: "صندوق الوصول المالي",
        icon: Inbox,
        permissionKey: "finance",
      },
      {
        href: "/admin/finance",
        label: "المالية والمدفوعات",
        icon: Wallet,
        permissionKey: "finance",
      },
      {
        href: "/admin/plans",
        label: "إدارة الباقات",
        icon: CreditCard,
        permissionKey: "plans",
        childRoutes: ["/admin/plans/country-pricing"],
      },
    ],
  },
  {
    id: "marketing",
    title: "النمو والتسويق",
    icon: Megaphone,
    colorClass: "text-purple-400",
    links: [
      {
        href: "/admin/marketing",
        label: "التسويق والدعاية",
        icon: Megaphone,
        permissionKey: "marketing",
      },
      {
        href: "/admin/whatsapp",
        label: "واتساب",
        icon: MessageCircle,
        permissionKey: "marketing",
      },
      {
        href: "/admin/news",
        label: "شريط الأخبار",
        icon: Newspaper,
        permissionKey: "news",
      },
      {
        href: "/admin/ambassador",
        label: "سفراء البيت",
        icon: Building2,
        permissionKey: "ambassador",
      },
    ],
  },
  {
    // Standalone HR section — moved out of "System & Governance" so the
    // hiring workflow (applications, employees, contracts later) lives
    // next to its own domain instead of being buried under settings.
    id: "hr",
    title: "الموارد البشرية",
    icon: Users,
    colorClass: "text-pink-400",
    links: [
      {
        href: "/admin/hr",
        label: "نظرة عامة",
        icon: Users,
        permissionKey: "membership",
      },
      {
        // Phase 4 — applications live inside /admin/hr/employees now.
        // Sidebar link points there directly instead of redirecting
        // through the legacy /admin/roles?tab=applications route.
        href: "/admin/hr/employees",
        label: "طلبات التوظيف",
        icon: UserPlus2,
        permissionKey: "membership",
      },
    ],
  },
  {
    id: "system",
    title: "النظام والحوكمة",
    icon: Lock,
    colorClass: "text-slate-400",
    links: [
      {
        href: "/admin/ai-center",
        label: "مركز الذكاء الاصطناعي",
        icon: BrainCircuit,
        permissionKey: "ai_center",
      },
      {
        href: "/admin/users",
        label: "إدارة العملاء",
        icon: Users,
        permissionKey: "users",
      },
      {
        href: "/admin/roles",
        label: "إدارة الصلاحيات",
        icon: Shield,
        permissionKey: "roles",
      },
      {
        href: "/admin/settings",
        label: "الإعدادات",
        icon: Settings,
        permissionKey: "settings",
      },
      {
        href: "/admin/reset-data",
        label: "تصفير التجارب",
        icon: RotateCcw,
        permissionKey: "settings",
      },
    ],
  },
];

export function normalizeAdminPath(pathname?: string | null): string {
  if (!pathname) return "";
  return pathname.replace("/add-listing/admin", "/admin");
}

export function resolveAdminHref(href: string): string {
  if (href.startsWith("/admin/") || href === "/admin") {
    return `/add-listing${href}`;
  }
  return href;
}
