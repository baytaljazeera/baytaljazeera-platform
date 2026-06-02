"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  Crown,
  DoorOpen,
  Loader2,
  Shield,
  ChevronDown,
  Home,
  Bell,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/authStore";
import {
  adminSections as staticAdminSections,
  normalizeAdminPath,
  resolveAdminHref,
  type AdminLink,
  type AdminSection,
} from "./adminNavigation";
import { resolveIcon } from "./iconRegistry";

// Phase 1 — DB-driven sidebar fetched from /api/admin/sidebar-config.
// We hold the static array as a fallback so the sidebar never goes dark
// if the endpoint fails or the tables haven't been provisioned.

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://baytaljazeera-backend.onrender.com';

const allLinks: AdminLink[] = staticAdminSections.flatMap(section => section.links);

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
  feedbackNew: number;
  whatsappUnread: number;
  financeInboxNew: number;
  // True UNREAD customer messages in finance — drives the red badge.
  // Goes UP when customer sends, DOWN to 0 the moment finance opens
  // the ticket. Different from financeInboxNew which counts tickets.
  financeInboxUnread: number;
  executiveInboxNew: number;
};

export default function AdminSidebar({ isMobile = false, onNavigate }: AdminSidebarProps) {
  const rawPathname = usePathname();
  const pathname = normalizeAdminPath(rawPathname) || rawPathname || "";
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
    ambassadorWithdrawals: 0,
    feedbackNew: 0,
    whatsappUnread: 0,
    financeInboxNew: 0,
    financeInboxUnread: 0,
    executiveInboxNew: 0,
  });
  const [visibleSections, setVisibleSections] = useState<string[]>([]);
  const [loadingVisibility, setLoadingVisibility] = useState(true);
  // Dynamic sidebar config from the DB. null until the fetch completes;
  // we fall back to the static array if the fetch fails or returns no
  // sections (e.g., tables not provisioned yet).
  const [dynamicSections, setDynamicSections] = useState<AdminSection[] | null>(null);

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
    fetchWhatsAppUnread();
    fetchSidebarConfig();
    const interval = setInterval(fetchPendingCounts, 30000);
    const waInterval = setInterval(fetchWhatsAppUnread, 10000);
    return () => {
      clearInterval(interval);
      clearInterval(waInterval);
    };
  }, []);

  useEffect(() => {
    const src = dynamicSections || staticAdminSections;
    for (const section of src) {
      const hasActiveLink = section.links.some((link: AdminLink) => {
        const linkPath = link.href.split("?")[0];
        const isChildRoute = link.childRoutes?.some((route: string) => pathname === route || pathname.startsWith(route + "/"));
        const isDirectMatch = pathname === linkPath || pathname.startsWith(linkPath + "/");
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

  /**
   * Pull the user's effective sidebar config from the DB. Each link's icon
   * arrives as a STRING name (e.g., "Crown") and we resolve it locally via
   * the icon registry. On failure, dynamicSections stays null and the
   * static array continues to drive the sidebar.
   */
  async function fetchSidebarConfig() {
    try {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/api/admin/sidebar-config`, {
        credentials: 'include', headers, cache: 'no-store',
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.sections || data.sections.length === 0) return; // fallback signal
      // Normalize into the same AdminSection shape the static array uses,
      // resolving icon string names → components.
      const normalized: AdminSection[] = data.sections.map((s: any) => ({
        id: s.key,
        title: s.title,
        icon: resolveIcon(s.icon),
        colorClass: s.colorClass || "text-slate-400",
        links: (s.links || []).map((l: any) => ({
          href: l.href,
          label: l.label,
          icon: resolveIcon(l.icon),
          isReport: !!l.isReport,
          permissionKey: l.permissionKey || "dashboard",
          childRoutes: Array.isArray(l.childRoutes) ? l.childRoutes : undefined,
        })),
      }));
      setDynamicSections(normalized);
    } catch {
      // silent — fall back to the static array
    }
  }

  async function fetchVisibleSections() {
    try {
      setLoadingVisibility(true);
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/api/admin/sidebar-settings/visible`, { credentials: 'include', headers });
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

  async function fetchWhatsAppUnread() {
    try {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/api/admin/whatsapp/unread-count`, { credentials: 'include', headers });
      if (res.ok) {
        const data = await res.json();
        setPendingCounts(prev => ({ ...prev, whatsappUnread: data.count || 0 }));
      }
    } catch {}
  }

  async function fetchPendingCounts() {
    try {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/api/admin/pending-counts`, { credentials: 'include', headers });
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
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/api/auth/me`, { credentials: 'include', headers });
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
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/api/permissions/my-permissions`, { credentials: 'include', headers });
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
      router.push(resolveAdminHref(href));
      onNavigate?.();
    });
  }

  function toggleSection(sectionId: string) {
    setExpandedSections(prev => {
      const updated = prev.includes(sectionId) 
        ? []
        : [sectionId];
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
    // Executive inbox is reserved for the top of the org chart.
    const isExecutive = userRole === "super_admin" || userRole === "admin" || userRole === "admin_manager";

    // Prefer the DB-driven config when present; fall back to the frozen
    // TS array if the fetch hasn't completed or returned nothing yet.
    const sourceSections = dynamicSections || staticAdminSections;
    return sourceSections.map(section => {
      const filteredLinks = section.links.filter(link => {
        // HARD short-circuit for the recently-added inbox links. These
        // weren't part of the DB-driven "sidebar visibility settings"
        // when those settings were generated, so they'd otherwise get
        // hidden by the visibleSections.includes() check below — which
        // is the exact bug the owner reported (سوبر أدمن can't see
        // صندوق الإدارة العليا despite all permission gates passing).
        if (link.href === "/admin/executive-inbox") return isExecutive;
        // The legacy /admin/finance-inbox slug has been retired but the
        // sidebar entry now points at /admin/finance?tab=messages. Match
        // by prefix so the same visibility rule still applies to the new
        // href.
        if (link.href.startsWith("/admin/finance?tab=messages")
            || link.href === "/admin/finance-inbox") {
          return isSuperAdmin
            || userRole === "admin"
            || userRole === "finance_admin"
            || userPermissions.includes("finance");
        }
        // HR landing — visible to anyone with `membership` permission
        // (the same gate used by the underlying applications page) and
        // bypasses the DB visibility config since this section is new.
        if (link.href === "/admin/hr") {
          return isSuperAdmin || userPermissions.includes("membership");
        }

        const hasPermission =
          isSuperAdmin ||
          userPermissions.includes(link.permissionKey) ||
          (link.permissionKey === "support_internal" &&
            userPermissions.includes("messages"));
        if (!hasPermission) return false;

        if (loadingVisibility || visibleSections.length === 0) return true;
        const sectionKey = getSectionKeyFromHref(link.href);
        // Always show feedback + whatsapp even if not yet registered in sidebar visibility settings
        if (sectionKey === 'feedback' || sectionKey === 'whatsapp' || sectionKey === 'omni-inbox') return true;
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
    if (href === '/admin/messages' || href === '/admin/omni-inbox') return { newCount: pendingCounts.messagesNew, inProgressCount: 0 };
    if (href === '/admin/customer-service') return { newCount: pendingCounts.complaintsNew + pendingCounts.supportNew, inProgressCount: pendingCounts.complaintsInProgress + pendingCounts.supportInProgress };
    if (href === '/admin/finance') return { newCount: pendingCounts.refundsNew + pendingCounts.ambassadorWithdrawals, inProgressCount: pendingCounts.refundsInProgress };
    // Finance inbox sidebar badge: prefer the TRUE unread customer-message
    // count when there is one (drops to 0 the moment the operator opens
    // the ticket). Fall back to the legacy "tickets in inbox" count if
    // there are no unread messages — that way the row is never silent
    // when work is sitting there. Owner-driven: the previous behaviour
    // (always show ticket count) didn't decrease as the operator caught
    // up reading customer replies.
    if (href === '/admin/finance-inbox' || href.startsWith('/admin/finance?tab=messages')) {
      return {
        newCount: pendingCounts.financeInboxUnread > 0
          ? pendingCounts.financeInboxUnread
          : pendingCounts.financeInboxNew,
        inProgressCount: 0,
      };
    }
    if (href === '/admin/executive-inbox') return { newCount: pendingCounts.executiveInboxNew, inProgressCount: 0 };
    if (href === '/admin/ambassador') return { newCount: pendingCounts.ambassadorPending + pendingCounts.ambassadorWithdrawals, inProgressCount: 0 };
    if (href === '/admin/feedback/responses') return { newCount: pendingCounts.feedbackNew, inProgressCount: 0 };
    if (href === '/admin/whatsapp') return { newCount: pendingCounts.whatsappUnread, inProgressCount: 0 };
    return { newCount: 0, inProgressCount: 0 };
  };

  const getSectionTotalCount = (section: AdminSection): number => {
    return section.links.reduce((total, link) => {
      const { newCount, inProgressCount } = getCounts(link.href);
      return total + newCount + inProgressCount;
    }, 0);
  };

  const roleGradient = ROLE_COLORS[userRole] || ROLE_COLORS.admin;

  const sidebarClasses = isMobile
    ? "flex w-full h-full flex-col bg-transparent text-white pt-12"
    : "hidden w-72 flex-col bg-gradient-to-b from-[#001a2e] via-[#002845] to-[#003d5c] text-white md:flex shadow-xl sticky top-0 h-screen overflow-y-auto";

  const filteredSections = getFilteredSections();

  return (
    <aside className={sidebarClasses}>
      <div className="px-5 pb-4 pt-5 border-b border-[#D4AF37]/20">
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br ${roleGradient} shadow-lg`}>
            <Crown className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg md:text-base font-black bg-gradient-to-l from-[#D4AF37] to-[#F5E6B8] bg-clip-text text-transparent truncate">
              بيت الجزيرة
            </h1>
            <p className="text-xs md:text-[10px] text-[#D4AF37]/80 font-medium truncate">
              {ROLE_NAMES[userRole] || 'لوحة تحكم الإدارة'}
            </p>
          </div>
        </div>
        
        {userName && (
          <div className="mt-3 p-3 md:p-2.5 rounded-lg bg-white/5 border border-white/10">
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs md:text-[10px] text-white/60">مرحباً</p>
                <p className="text-base md:text-sm font-bold text-white truncate">{userName}</p>
              </div>
              <div className="flex items-center gap-2">
                <NotificationBell />
                <div className={`flex items-center gap-1 px-2.5 py-1.5 md:px-2 md:py-1 rounded-full bg-gradient-to-r ${roleGradient} text-xs md:text-[9px] font-bold shrink-0`}>
                  <Shield className="w-3 h-3 md:w-2.5 md:h-2.5" />
                  <span className="hidden md:inline">{ROLE_NAMES[userRole]}</span>
                </div>
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
                    className="w-full min-h-[48px] flex items-center gap-2.5 md:gap-2 px-3 md:px-3 py-3 md:py-2.5 text-mobile-base md:text-sm font-bold transition-all duration-200 hover:bg-white/5 active:bg-white/10 active:scale-95 rounded-lg group touch-manipulation"
                  >
                    <SectionIcon className={`w-5 h-5 md:w-4 md:h-4 ${section.colorClass} transition-transform duration-200 shrink-0`} />
                    <span className={`flex-1 text-right ${section.colorClass} truncate`}>{section.title}</span>
                    {sectionCount > 0 && (
                      <span className="min-w-[24px] h-6 md:min-w-[20px] md:h-5 flex items-center justify-center text-xs md:text-[10px] font-bold bg-red-500/20 text-red-400 rounded-full px-2 md:px-1.5 shrink-0">
                        {sectionCount}
                      </span>
                    )}
                    <ChevronDown 
                      className={`w-5 h-5 md:w-4 md:h-4 text-white/40 transition-transform duration-200 shrink-0 ${isExpanded ? 'rotate-180' : ''}`} 
                    />
                  </button>

                  <div className={`overflow-hidden transition-all duration-200 ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="pr-2 space-y-0.5 pb-2">
                      {section.links.map((item) => {
                        const Icon = item.icon;
                        const itemPath = item.href.split("?")[0];
                        const isChildRoute = item.childRoutes?.some(route => pathname === route || pathname.startsWith(route + "/"));
                        const belongsToOtherItem = allLinks.some(other => 
                          other.href !== item.href && 
                          other.childRoutes?.some(route => pathname === route || pathname.startsWith(route + "/"))
                        );
                        const isDirectMatch = pathname === itemPath || pathname.startsWith(itemPath + "/");
                        const active = isChildRoute || (isDirectMatch && !belongsToOtherItem);
                        const isNavigating = navigatingTo === item.href;

                        const { newCount, inProgressCount } = getCounts(item.href);
                        // Executive inbox gets a distinct gold treatment —
                        // it's a privileged surface and shouldn't blend in
                        // with the other support/finance links.
                        const isExecutiveLink = item.href === "/admin/executive-inbox";

                        return (
                          <button
                            key={item.href}
                            onClick={() => handleNavigation(item.href)}
                            disabled={isNavigating}
                            className={`w-full min-h-[48px] flex items-center gap-3 md:gap-2.5 rounded-lg px-3 md:px-3 py-3 md:py-2.5 text-mobile-base md:text-[13px] transition-all duration-150 cursor-pointer group/item touch-manipulation active:scale-95 ${
                              active
                                ? item.isReport
                                  ? "bg-gradient-to-l from-red-500/20 to-red-600/10 text-red-400 font-bold border-r-2 border-red-500"
                                  : isExecutiveLink
                                    ? "bg-gradient-to-l from-[#D4AF37]/30 to-[#D4AF37]/10 text-[#D4AF37] font-bold border-r-2 border-[#D4AF37]"
                                    : "bg-gradient-to-l from-[#D4AF37]/20 to-[#D4AF37]/5 text-[#D4AF37] font-bold border-r-2 border-[#D4AF37]"
                                : isNavigating
                                  ? "bg-white/10 text-white"
                                  : item.isReport
                                    ? "text-white/70 hover:bg-red-500/10 hover:text-red-400 active:bg-red-500/15"
                                    : isExecutiveLink
                                      ? "text-[#E8C882] hover:bg-[#D4AF37]/10 hover:text-[#D4AF37] active:bg-[#D4AF37]/15"
                                      : "text-white/70 hover:bg-white/5 hover:text-white active:bg-white/10"
                            }`}
                          >
                            {isNavigating ? (
                              <Loader2 className="w-5 h-5 md:w-4 md:h-4 animate-spin shrink-0" />
                            ) : (
                              <Icon className={`w-5 h-5 md:w-4 md:h-4 transition-transform duration-150 group-hover/item:scale-110 shrink-0 ${active || isExecutiveLink ? "" : "opacity-60"} ${isExecutiveLink && newCount > 0 ? "animate-pulse text-[#D4AF37]" : ""}`} />
                            )}
                            <span className="flex-1 text-right truncate">{item.label}</span>
                            <div className="flex items-center gap-1.5 md:gap-1 shrink-0">
                              {newCount > 0 && (
                                <span className={
                                  isExecutiveLink
                                    ? "unread-badge-breathe min-w-[22px] h-[22px] md:min-w-[18px] md:h-[18px] flex items-center justify-center text-xs md:text-[10px] font-bold bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] ring-2 ring-[#D4AF37]/40 rounded-full px-1.5 md:px-1 shadow-lg shadow-[#D4AF37]/40"
                                    : "unread-badge-breathe min-w-[22px] h-[22px] md:min-w-[18px] md:h-[18px] flex items-center justify-center text-xs md:text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 md:px-1 shadow-lg shadow-red-500/30"
                                }>
                                  {newCount > 99 ? '99+' : newCount}
                                </span>
                              )}
                              {inProgressCount > 0 && (
                                <span className="min-w-[22px] h-[22px] md:min-w-[18px] md:h-[18px] flex items-center justify-center text-xs md:text-[10px] font-bold bg-amber-500 text-white rounded-full px-1.5 md:px-1">
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

      <div className="border-t border-white/10 p-3 md:p-3 space-y-2 md:space-y-1.5">
        <button
          onClick={() => handleNavigation("/")}
          className="flex items-center justify-center gap-2.5 md:gap-2 w-full min-h-[48px] px-3 md:px-3 py-3 md:py-2 rounded-lg bg-[#D4AF37]/10 text-[#D4AF37] hover:bg-[#D4AF37]/20 active:bg-[#D4AF37]/30 active:scale-95 transition text-mobile-base md:text-sm font-medium touch-manipulation"
        >
          <Home className="w-5 h-5 md:w-4 md:h-4" />
          الموقع الرئيسي
        </button>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex items-center justify-center gap-2.5 md:gap-2 w-full min-h-[48px] px-3 md:px-3 py-3 md:py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 active:bg-red-500/30 active:scale-95 transition text-mobile-base md:text-sm font-medium disabled:opacity-50 touch-manipulation"
        >
          {loggingOut ? (
            <Loader2 className="w-5 h-5 md:w-4 md:h-4 animate-spin" />
          ) : (
            <DoorOpen className="w-5 h-5 md:w-4 md:h-4" />
          )}
          تسجيل الخروج
        </button>
      </div>
    </aside>
  );
}

/**
 * Sidebar bell — polls /api/notifications/count every 45s for the unread
 * badge. Clicking opens the notification center page. Polls (not WS) so
 * we don't open a long-lived connection from every admin tab — 45s is the
 * cache-friendly cadence the user can override by visiting the page.
 */
function NotificationBell() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function tick() {
      try {
        const res = await fetch(`${API_URL}/api/notifications/count`, {
          credentials: 'include',
          headers: (() => {
            const h: Record<string, string> = {};
            if (typeof document !== 'undefined') {
              const m = document.cookie.match(/(?:^|;\s*)token=([^;]+)/);
              if (m) h['Authorization'] = `Bearer ${decodeURIComponent(m[1])}`;
            }
            return h;
          })(),
        });
        if (res.ok) {
          const j = await res.json();
          if (alive) setUnread(Number(j?.unread || 0));
        }
      } catch {}
      if (alive) timer = setTimeout(tick, 45_000);
    }
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <Link
      href="/add-listing/admin/notifications"
      className="relative flex items-center justify-center w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 transition border border-white/10"
      title="مركز الإشعارات"
    >
      <Bell className="w-4 h-4 text-amber-300" />
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
