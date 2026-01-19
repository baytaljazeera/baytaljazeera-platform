"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  LayoutDashboard,
  FileText,
  AlertCircle,
  Headset,
  Users,
  Newspaper,
  UserPlus2,
  BrainCircuit,
  Settings,
  Crown,
  LogOut,
  CreditCard,
  Flag,
  MessageSquare,
  Shield,
  Wallet,
  Megaphone,
  DoorOpen,
  Loader2,
  Eye,
  MapPin,
  Building2,
  ChevronDown,
  ChevronLeft,
  Home,
  Briefcase,
  HeartHandshake,
  Cpu,
  Lock,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/authStore";

type LinkItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  isReport?: boolean;
  permissionKey: string;
  childRoutes?: string[];
};

type SidebarSection = {
  id: string;
  title: string;
  icon: typeof LayoutDashboard;
  colorClass: string;
  links: LinkItem[];
};

const sidebarSections: SidebarSection[] = [
  {
    id: 'executive',
    title: 'نظرة تنفيذية',
    icon: LayoutDashboard,
    colorClass: 'text-[#D4AF37]',
    links: [
      { 
        href: "/admin/dashboard", 
        label: "لوحة التحكم", 
        icon: LayoutDashboard,
        permissionKey: 'dashboard'
      },
    ]
  },
  {
    id: 'properties',
    title: 'إدارة العقارات',
    icon: Home,
    colorClass: 'text-blue-400',
    links: [
      { 
        href: "/admin/listings", 
        label: "الإعلانات", 
        icon: FileText,
        permissionKey: 'listings',
        childRoutes: ['/admin/elite-slots', '/admin/finance/listings']
      },
      { 
        href: "/admin/reports", 
        label: "بلاغات الإعلانات", 
        icon: Flag, 
        isReport: true,
        permissionKey: 'reports'
      },
      { 
        href: "/admin/featured-cities", 
        label: "المدن الأكثر طلبًا", 
        icon: MapPin,
        permissionKey: 'settings'
      },
    ]
  },
  {
    id: 'support',
    title: 'خدمة العملاء',
    icon: HeartHandshake,
    colorClass: 'text-emerald-400',
    links: [
      { 
        href: "/admin/customer-service", 
        label: "الشكاوى والدعم", 
        icon: Headset,
        permissionKey: 'support',
        childRoutes: ['/admin/complaints', '/admin/support']
      },
      { 
        href: "/admin/customer-conversations", 
        label: "مراقبة المحادثات", 
        icon: Eye,
        permissionKey: 'support'
      },
      { 
        href: "/admin/messages", 
        label: "المراسلات الداخلية", 
        icon: MessageSquare,
        permissionKey: 'messages'
      },
    ]
  },
  {
    id: 'finance',
    title: 'المالية والاشتراكات',
    icon: Wallet,
    colorClass: 'text-green-400',
    links: [
      { 
        href: "/admin/finance", 
        label: "المالية والمدفوعات", 
        icon: Wallet,
        permissionKey: 'finance'
      },
      { 
        href: "/admin/plans", 
        label: "إدارة الباقات", 
        icon: CreditCard,
        permissionKey: 'plans',
        childRoutes: ['/admin/plans/country-pricing']
      },
    ]
  },
  {
    id: 'marketing',
    title: 'النمو والتسويق',
    icon: Megaphone,
    colorClass: 'text-purple-400',
    links: [
      { 
        href: "/admin/marketing", 
        label: "التسويق والدعاية", 
        icon: Megaphone,
        permissionKey: 'marketing'
      },
      { 
        href: "/admin/news", 
        label: "شريط الأخبار", 
        icon: Newspaper,
        permissionKey: 'news'
      },
      { 
        href: "/admin/ambassador", 
        label: "سفراء البيت", 
        icon: Building2,
        permissionKey: 'ambassador'
      },
    ]
  },
  {
    id: 'system',
    title: 'النظام والحوكمة',
    icon: Lock,
    colorClass: 'text-slate-400',
    links: [
      { 
        href: "/admin/roles?tab=applications", 
        label: "طلبات الإدارة", 
        icon: UserPlus2,
        permissionKey: 'membership'
      },
      { 
        href: "/admin/ai-center", 
        label: "مركز الذكاء الاصطناعي", 
        icon: BrainCircuit,
        permissionKey: 'ai_center'
      },
      { 
        href: "/admin/users", 
        label: "إدارة العملاء", 
        icon: Users,
        permissionKey: 'users'
      },
      { 
        href: "/admin/roles", 
        label: "إدارة الصلاحيات", 
        icon: Shield,
        permissionKey: 'roles'
      },
      { 
        href: "/admin/settings", 
        label: "الإعدادات", 
        icon: Settings,
        permissionKey: 'settings'
      },
    ]
  },
];

const allLinks: LinkItem[] = sidebarSections.flatMap(section => section.links);

const ROLE_NAMES: Record<string, string> = {
  super_admin: 'المدير العام',
  finance_admin: 'إدارة المالية',
  support_admin: 'الدعم الفني',
  content_admin: 'إدارة المحتوى',
  admin: 'مدير',
  user: 'مستخدم',
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'from-[#FFD700] to-[#FFA500]',
  finance_admin: 'from-[#4CAF50] to-[#2E7D32]',
  support_admin: 'from-[#2196F3] to-[#1565C0]',
  content_admin: 'from-[#9C27B0] to-[#6A1B9A]',
  admin: 'from-[#D4AF37] to-[#B8860B]',
};

type AdminSidebarProps = {
  isMobile?: boolean;
  onNavigate?: () => void;
};

type PendingCounts = {
  listingsNew: number;
  reportsNew: number;
  membershipNew: number;
  refundsNew: number;
  complaintsNew: number;
  supportNew: number;
  messagesNew: number;
  ambassadorPending: number;
  ambassadorWithdrawals: number;
  listingsInProgress: number;
  reportsInProgress: number;
  membershipInProgress: number;
  refundsInProgress: number;
  complaintsInProgress: number;
  supportInProgress: number;
};

export default function AdminSidebar({ isMobile = false, onNavigate }: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [userRole, setUserRole] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [loadingPermissions, setLoadingPermissions] = useState(true);
  const [expandedSections, setExpandedSections] = useState<string[]>(['executive']);
  const [pendingCounts, setPendingCounts] = useState<PendingCounts>({
    listingsNew: 0, listingsInProgress: 0,
    reportsNew: 0, reportsInProgress: 0,
    membershipNew: 0, membershipInProgress: 0,
    refundsNew: 0, refundsInProgress: 0,
    complaintsNew: 0, complaintsInProgress: 0,
    supportNew: 0, supportInProgress: 0,
    messagesNew: 0,
    ambassadorPending: 0,
    ambassadorWithdrawals: 0
  });
  const [visibleSections, setVisibleSections] = useState<string[]>([]);
  const [loadingVisibility, setLoadingVisibility] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('admin_sidebar_expanded');
    if (saved) {
      try {
        setExpandedSections(JSON.parse(saved));
      } catch {}
    }
  }, []);

  useEffect(() => {
    fetchCurrentUser();
    fetchPendingCounts();
    fetchVisibleSections();
    const interval = setInterval(fetchPendingCounts, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    for (const section of sidebarSections) {
      const hasActiveLink = section.links.some(link => {
        const isChildRoute = link.childRoutes?.some(route => pathname === route || pathname.startsWith(route + "/"));
        const isDirectMatch = pathname === link.href || pathname.startsWith(link.href + "/");
        return isChildRoute || isDirectMatch;
      });
      if (hasActiveLink && !expandedSections.includes(section.id)) {
        setExpandedSections(prev => {
          const updated = [...prev, section.id];
          localStorage.setItem('admin_sidebar_expanded', JSON.stringify(updated));
          return updated;
        });
        break;
      }
    }
  }, [pathname]);

  async function fetchVisibleSections() {
    try {
      setLoadingVisibility(true);
      const res = await fetch('/api/admin/sidebar-settings/visible', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setVisibleSections(data.visible_sections || []);
      }
    } catch (err) {
      console.error('Error fetching sidebar visibility:', err);
    } finally {
      setLoadingVisibility(false);
    }
  }

  async function fetchPendingCounts() {
    try {
      const res = await fetch('/api/admin/pending-counts', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPendingCounts(data);
      }
    } catch (err) {
      console.error('Error fetching pending counts:', err);
    }
  }

  useEffect(() => {
    if (userRole) {
      fetchUserPermissions();
    }
  }, [userRole]);

  useEffect(() => {
    if (!isPending) {
      setNavigatingTo(null);
    }
  }, [isPending]);

  async function fetchCurrentUser() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const user = data.user || data;
        setUserRole(user.role || '');
        setUserName(user.name || '');
      }
    } catch (err) {
      console.error('Error fetching user:', err);
    }
  }

  async function fetchUserPermissions() {
    try {
      setLoadingPermissions(true);
      const res = await fetch('/api/permissions/my-permissions', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUserPermissions(data.permissions || []);
      }
    } catch (err) {
      console.error('Error fetching permissions:', err);
    } finally {
      setLoadingPermissions(false);
    }
  }

  const { logout } = useAuthStore();

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      window.location.href = '/admin-login';
    } catch (err) {
      console.error('Error logging out:', err);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/admin-login';
    }
  }

  function handleNavigation(href: string) {
    if (pathname === href) {
      onNavigate?.();
      return;
    }
    setNavigatingTo(href);
    startTransition(() => {
      router.push(href);
      onNavigate?.();
    });
  }

  function toggleSection(sectionId: string) {
    setExpandedSections(prev => {
      const updated = prev.includes(sectionId) 
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId];
      localStorage.setItem('admin_sidebar_expanded', JSON.stringify(updated));
      return updated;
    });
  }

  const isSuperAdmin = userRole === 'super_admin' || userRole === 'admin';
  
  const getSectionKeyFromHref = (href: string): string => {
    const match = href.match(/\/admin\/([^/]+)/);
    return match ? match[1] : '';
  };

  const getFilteredSections = () => {
    return sidebarSections.map(section => {
      const filteredLinks = section.links.filter(link => {
        const hasPermission = isSuperAdmin || userPermissions.includes(link.permissionKey);
        if (!hasPermission) return false;
        
        if (loadingVisibility || visibleSections.length === 0) return true;
        const sectionKey = getSectionKeyFromHref(link.href);
        return visibleSections.includes(sectionKey);
      });
      return { ...section, links: filteredLinks };
    }).filter(section => section.links.length > 0);
  };

  const getCounts = (href: string): { newCount: number; inProgressCount: number } => {
    if (href === '/admin/listings') return { newCount: pendingCounts.listingsNew, inProgressCount: pendingCounts.listingsInProgress };
    if (href === '/admin/reports') return { newCount: pendingCounts.reportsNew, inProgressCount: pendingCounts.reportsInProgress };
    if (href === '/admin/roles?tab=applications') return { newCount: pendingCounts.membershipNew, inProgressCount: pendingCounts.membershipInProgress };
    if (href === '/admin/roles') return { newCount: pendingCounts.membershipNew, inProgressCount: pendingCounts.membershipInProgress };
    if (href === '/admin/messages') return { newCount: pendingCounts.messagesNew, inProgressCount: 0 };
    if (href === '/admin/customer-service') return { newCount: pendingCounts.complaintsNew + pendingCounts.supportNew, inProgressCount: pendingCounts.complaintsInProgress + pendingCounts.supportInProgress };
    if (href === '/admin/finance') return { newCount: pendingCounts.refundsNew, inProgressCount: pendingCounts.refundsInProgress };
    if (href === '/admin/ambassador') return { newCount: pendingCounts.ambassadorPending + pendingCounts.ambassadorWithdrawals, inProgressCount: 0 };
    return { newCount: 0, inProgressCount: 0 };
  };

  const getSectionTotalCount = (section: SidebarSection): number => {
    return section.links.reduce((total, link) => {
      const { newCount, inProgressCount } = getCounts(link.href);
      return total + newCount + inProgressCount;
    }, 0);
  };

  const roleGradient = ROLE_COLORS[userRole] || ROLE_COLORS.admin;

  const sidebarClasses = isMobile
    ? "flex w-full h-full flex-col bg-transparent text-white pt-12"
    : "hidden w-72 flex-col bg-gradient-to-b from-[#001a2e] via-[#002845] to-[#003d5c] text-white md:flex shadow-xl";

  const filteredSections = getFilteredSections();

  return (
    <aside className={sidebarClasses}>
      <div className="px-5 pb-4 pt-5 border-b border-[#D4AF37]/20">
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br ${roleGradient} shadow-lg`}>
            <Crown className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-black bg-gradient-to-l from-[#D4AF37] to-[#F5E6B8] bg-clip-text text-transparent">
              بيت الجزيرة
            </h1>
            <p className="text-[10px] text-[#D4AF37]/80 font-medium">
              {ROLE_NAMES[userRole] || 'لوحة تحكم الإدارة'}
            </p>
          </div>
        </div>
        
        {userName && (
          <div className="mt-3 p-2.5 rounded-lg bg-white/5 border border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-white/60">مرحباً</p>
                <p className="text-sm font-bold text-white truncate">{userName}</p>
              </div>
              <div className={`flex items-center gap-1 px-2 py-1 rounded-full bg-gradient-to-r ${roleGradient} text-[9px] font-bold`}>
                <Shield className="w-2.5 h-2.5" />
                {ROLE_NAMES[userRole]}
              </div>
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 p-3 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {loadingPermissions ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-[#D4AF37]" />
          </div>
        ) : (
          <div className="space-y-2">
            {filteredSections.map((section) => {
              const SectionIcon = section.icon;
              const isExpanded = expandedSections.includes(section.id);
              const sectionCount = getSectionTotalCount(section);

              return (
                <div key={section.id} className="rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggleSection(section.id)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-bold transition-all duration-200 hover:bg-white/5 rounded-lg group"
                  >
                    <SectionIcon className={`w-4 h-4 ${section.colorClass} transition-transform duration-200`} />
                    <span className={`flex-1 text-right ${section.colorClass}`}>{section.title}</span>
                    {sectionCount > 0 && (
                      <span className="min-w-[20px] h-5 flex items-center justify-center text-[10px] font-bold bg-red-500/20 text-red-400 rounded-full px-1.5">
                        {sectionCount}
                      </span>
                    )}
                    <ChevronDown 
                      className={`w-4 h-4 text-white/40 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} 
                    />
                  </button>

                  <div className={`overflow-hidden transition-all duration-200 ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="pr-2 space-y-0.5 pb-2">
                      {section.links.map((item) => {
                        const Icon = item.icon;
                        const isChildRoute = item.childRoutes?.some(route => pathname === route || pathname.startsWith(route + "/"));
                        const belongsToOtherItem = allLinks.some(other => 
                          other.href !== item.href && 
                          other.childRoutes?.some(route => pathname === route || pathname.startsWith(route + "/"))
                        );
                        const isDirectMatch = pathname === item.href || pathname.startsWith(item.href + "/");
                        const active = isChildRoute || (isDirectMatch && !belongsToOtherItem);
                        const isNavigating = navigatingTo === item.href;

                        const { newCount, inProgressCount } = getCounts(item.href);

                        return (
                          <button
                            key={item.href}
                            onClick={() => handleNavigation(item.href)}
                            disabled={isNavigating}
                            className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-all duration-150 cursor-pointer group/item ${
                              active 
                                ? item.isReport
                                  ? "bg-gradient-to-l from-red-500/20 to-red-600/10 text-red-400 font-bold border-r-2 border-red-500"
                                  : "bg-gradient-to-l from-[#D4AF37]/20 to-[#D4AF37]/5 text-[#D4AF37] font-bold border-r-2 border-[#D4AF37]"
                                : isNavigating 
                                  ? "bg-white/10 text-white"
                                  : item.isReport
                                    ? "text-white/70 hover:bg-red-500/10 hover:text-red-400"
                                    : "text-white/70 hover:bg-white/5 hover:text-white"
                            }`}
                          >
                            {isNavigating ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Icon className={`w-4 h-4 transition-transform duration-150 group-hover/item:scale-110 ${active ? "" : "opacity-60"}`} />
                            )}
                            <span className="flex-1 text-right">{item.label}</span>
                            <div className="flex items-center gap-1">
                              {newCount > 0 && (
                                <span className="min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-1 shadow-lg shadow-red-500/30">
                                  {newCount > 99 ? '99+' : newCount}
                                </span>
                              )}
                              {inProgressCount > 0 && (
                                <span className="min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-amber-500 text-white rounded-full px-1">
                                  {inProgressCount}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {isExpanded && section.id !== filteredSections[filteredSections.length - 1]?.id && (
                    <div className="h-px bg-gradient-to-l from-transparent via-[#D4AF37]/20 to-transparent mx-3 mt-1" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </nav>

      <div className="border-t border-white/10 p-3 space-y-1.5">
        <button
          onClick={() => handleNavigation("/")}
          className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg bg-[#D4AF37]/10 text-[#D4AF37] hover:bg-[#D4AF37]/20 transition text-sm font-medium"
        >
          <Home className="w-4 h-4" />
          الموقع الرئيسي
        </button>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition text-sm font-medium disabled:opacity-50"
        >
          {loggingOut ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <DoorOpen className="w-4 h-4" />
          )}
          تسجيل الخروج
        </button>
      </div>
    </aside>
  );
}
