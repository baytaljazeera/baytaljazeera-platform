"use client";

import { useEffect, useState, Suspense, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  PlusCircle, Package, Map, List, 
  User, LogOut, Heart, Bell, FileText, Menu, X,
  ChevronDown, Settings, Crown, MessageCircle, Receipt, Check, CheckCheck,
  Mail, CreditCard, AlertCircle, Home, Loader2, AlertTriangle, Building2
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/authStore";
import { useSiteSettingsStore } from "@/lib/stores/siteSettingsStore";
import LogoAdminModal from "./LogoAdminModal";
import MobileBottomSheet from "./MobileBottomSheet";

type Notification = {
  id: number;
  type: string;
  title: string;
  message: string;
  read_at?: string | null;
  related_id?: number;
  related_type?: string;
  created_at: string;
};

function NavbarContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentView = searchParams.get("view") || "map";
  
  const { user, isAuthenticated, logout, checkAuth, hydrate, isHydrated } = useAuthStore();
  const { settings: siteSettings, fetchSettings } = useSiteSettingsStore();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [ambassadorEnabled, setAmbassadorEnabled] = useState(true);
  const notificationRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  
  // شارات قائمة المستخدم
  const [userBadges, setUserBadges] = useState({
    listingsRejected: 0, listingsApproved: 0, listingsPending: 0,
    invoicesNew: 0,
    complaintsNew: 0, complaintsPending: 0,
    refundsNew: 0, refundsPending: 0,
    messagesNew: 0,
    ambassadorRewards: 0
  });
  
  const hideNavbarPaths = ['/admin', '/admin-login', '/request-access'];
  const shouldHideNavbar = hideNavbarPaths.some(path => pathname?.startsWith(path));

  useEffect(() => {
    hydrate();
    checkAuth();
  }, [hydrate, checkAuth]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // جلب حالة نظام السفراء
  useEffect(() => {
    async function checkAmbassadorStatus() {
      try {
        const res = await fetch("/api/ambassador/status");
        if (res.ok) {
          const data = await res.json();
          setAmbassadorEnabled(data.enabled);
        }
      } catch (err) {
        console.error("Error checking ambassador status:", err);
      }
    }
    checkAmbassadorStatus();
  }, []);

  useEffect(() => {
    async function fetchUnreadCounts() {
      if (!isAuthenticated) return;
      try {
        const [notifRes, msgRes, customerMsgRes, badgesRes, favRes] = await Promise.all([
          fetch("/api/notifications/unread-count", { credentials: "include" }),
          fetch("/api/messages/unread-count", { credentials: "include" }),
          fetch("/api/messages/customer-messages-unread-count", { credentials: "include" }),
          fetch("/api/account/pending-counts", { credentials: "include" }),
          fetch("/api/favorites/ids", { credentials: "include" })
        ]);
        if (notifRes.ok) {
          const notifData = await notifRes.json();
          setUnreadNotifications(notifData.count || 0);
        }
        let totalMessages = 0;
        if (msgRes.ok) {
          const msgData = await msgRes.json();
          totalMessages += msgData.count || 0;
        }
        if (customerMsgRes.ok) {
          const customerMsgData = await customerMsgRes.json();
          totalMessages += customerMsgData.count || 0;
        }
        setUnreadMessages(totalMessages);
        if (badgesRes.ok) {
          const badgesData = await badgesRes.json();
          setUserBadges(badgesData);
        }
        if (favRes.ok) {
          const favData = await favRes.json();
          setFavoritesCount(favData.ids?.length || 0);
        }
      } catch (err) {
        console.error("Error fetching unread counts:", err);
      }
    }
    fetchUnreadCounts();
    const interval = setInterval(fetchUnreadCounts, 30000);
    
    const handleNotificationsUpdated = () => fetchUnreadCounts();
    window.addEventListener('notificationsUpdated', handleNotificationsUpdated);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('notificationsUpdated', handleNotificationsUpdated);
    };
  }, [isAuthenticated]);

  // Fetch notifications when dropdown is opened
  useEffect(() => {
    async function fetchNotifications() {
      if (!showNotificationDropdown || !isAuthenticated) return;
      setLoadingNotifications(true);
      try {
        const res = await fetch("/api/notifications?limit=10", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setNotifications(data.notifications || []);
        }
      } catch (err) {
        console.error("Error fetching notifications:", err);
      } finally {
        setLoadingNotifications(false);
      }
    }
    fetchNotifications();
  }, [showNotificationDropdown, isAuthenticated]);

  // Close notification dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotificationDropdown(false);
      }
    }
    if (showNotificationDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showNotificationDropdown]);

  // Close user menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }
    if (showUserMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showUserMenu]);

  const markNotificationAsRead = async (id: number) => {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
        credentials: "include"
      });
      if (res.ok) {
        // Mark as read in local list (will be filtered out by the display)
        setNotifications(prev => prev.map(n => n.id === id ? {...n, read_at: new Date().toISOString()} : n));
        setUnreadNotifications(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error("Error marking notification as read:", err);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    // Mark as read first
    if (!notification.read_at) {
      markNotificationAsRead(notification.id);
    }
    
    // Navigate based on notification type - using correct app routes
    let href = "/inbox";
    if (notification.related_type === "message" || notification.type === "message") {
      href = "/messages"; // Messages page (no dynamic route)
    } else if (notification.related_type === "listing" && notification.related_id) {
      href = `/listing/${notification.related_id}`; // Note: /listing not /listings
    } else if (notification.related_type === "invoice" && notification.related_id) {
      href = `/invoices/${notification.related_id}`;
    } else if (notification.type === "upgrade" || notification.type === "subscription") {
      href = "/account";
    } else if (notification.type === "refund") {
      href = "/invoices";
    }
    
    setShowNotificationDropdown(false);
    router.push(href);
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "message": return <Mail className="w-4 h-4" />;
      case "upgrade":
      case "subscription": return <Crown className="w-4 h-4" />;
      case "invoice":
      case "payment":
      case "refund": return <CreditCard className="w-4 h-4" />;
      case "listing": return <Home className="w-4 h-4" />;
      default: return <Bell className="w-4 h-4" />;
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return "الآن";
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    if (hours < 24) return `منذ ${hours} ساعة`;
    if (days < 7) return `منذ ${days} يوم`;
    return date.toLocaleDateString("ar-SA");
  };

  const handleLogout = async () => {
    await logout();
    setShowUserMenu(false);
    router.push("/");
    router.refresh();
  };
  
  const isSearchPage = pathname === "/search";
  const nextView = currentView === "map" ? "list" : "map";
  const searchLabel = nextView === "map" ? "البحث على الخريطة" : "البحث بالقائمة";
  const searchHref = isSearchPage ? `/search?view=${nextView}` : `/search?view=map`;
  const SearchIcon = nextView === "map" ? Map : List;

  const staticNavItems = [
    { href: "/listings/new", label: "إضافة إعلان", icon: PlusCircle },
    { href: "/plans", label: "الباقات", icon: Package },
  ];

  const userMenuItems = [
    { href: "/account", label: "حسابي", icon: User },
    { href: "/favorites", label: "المفضلة", icon: Heart, badge: favoritesCount },
    { href: "/my-listings", label: "إعلاناتي", icon: FileText, badgeRejected: userBadges.listingsRejected, badgeApproved: userBadges.listingsApproved, badgePending: userBadges.listingsPending },
    { href: "/invoices", label: "فواتيري", icon: Receipt, badgeNew: userBadges.invoicesNew },
    { href: "/my-complaints", label: "شكاواي", icon: AlertTriangle, badgeNew: userBadges.complaintsNew, badgePending: userBadges.complaintsPending },
    { href: "/messages", label: "المراسلات", icon: MessageCircle, badge: unreadMessages },
    { href: "/inbox", label: "الإشعارات", icon: Bell, badge: unreadNotifications },
    ...(ambassadorEnabled ? [{ href: "/referral", label: "سفراء البيت", icon: Building2, badgeNew: userBadges.ambassadorRewards }] : []),
  ];

  const getTierName = (tier?: string) => {
    if (!tier) return null;
    const names: Record<string, string> = {
      entry: 'باقة المدخل',
      basic: 'الباقة الأساسية',
      featured: 'الباقة المميزة',
      royal: 'الباقة الملكية',
      enterprise: 'باقة العمل'
    };
    return names[tier] || tier;
  };

  if (shouldHideNavbar) {
    return null;
  }

  const renderAuthSection = () => {
    if (!isHydrated) {
      return (
        <div className="flex items-center gap-2 mr-2">
          <div className="w-24 h-10 bg-slate-200 rounded-xl animate-pulse" />
          <div className="w-24 h-10 bg-slate-100 rounded-xl animate-pulse" />
        </div>
      );
    }

    if (isAuthenticated && user) {
      return (
        <div className="flex items-center gap-2 mr-2">
          {/* Notification Bell with Dropdown */}
          <div className="relative" ref={notificationRef}>
            <button
              onClick={() => setShowNotificationDropdown(!showNotificationDropdown)}
              className="relative min-h-[44px] min-w-[44px] flex items-center justify-center p-2.5 rounded-xl bg-white/80 hover:bg-white transition-all shadow-sm hover:shadow-md border border-slate-100 touch-manipulation active:scale-95"
              aria-label={`الإشعارات${unreadNotifications > 0 ? ` (${unreadNotifications} غير مقروء)` : ''}`}
            >
              <Bell className="w-6 h-6 text-[#003366]" />
              {unreadNotifications > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-mobile-xs font-bold min-w-[22px] h-[22px] rounded-full flex items-center justify-center animate-pulse px-1.5">
                  {unreadNotifications > 99 ? '99+' : unreadNotifications}
                </span>
              )}
            </button>

            <AnimatePresence>
              {showNotificationDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 mt-2 w-[320px] max-w-[calc(100vw-32px)] bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-[50000]"
                >
                  {/* Header */}
                  <div className="px-4 py-3 bg-gradient-to-l from-[#003366] to-[#01375e] text-white flex items-center justify-between">
                    <h3 className="font-bold flex items-center gap-2">
                      <Bell className="w-4 h-4" />
                      الإشعارات
                    </h3>
                    {unreadNotifications > 0 && (
                      <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">
                        {unreadNotifications} جديد
                      </span>
                    )}
                  </div>

                  {/* Notifications List */}
                  <div className="max-h-80 overflow-y-auto">
                    {loadingNotifications ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-[#D4AF37]" />
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="py-8 text-center text-slate-500">
                        <Bell className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                        <p className="text-sm">لا توجد إشعارات</p>
                      </div>
                    ) : (
                      notifications.filter(n => !n.read_at).map((notification) => (
                        <div
                          key={notification.id}
                          className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition cursor-pointer border-b border-slate-50 last:border-0"
                        >
                          {/* Click to navigate */}
                          <div
                            onClick={() => handleNotificationClick(notification)}
                            className="flex items-start gap-3 flex-1 min-w-0"
                          >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                              notification.type === "message" ? "bg-blue-100 text-blue-600" :
                              notification.type === "upgrade" || notification.type === "subscription" ? "bg-amber-100 text-amber-600" :
                              notification.type === "refund" || notification.type === "payment" ? "bg-green-100 text-green-600" :
                              "bg-slate-100 text-slate-600"
                            }`}>
                              {getNotificationIcon(notification.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-[#003366] truncate">
                                {notification.title}
                              </p>
                              <p className="text-xs text-slate-500 line-clamp-2">
                                {notification.message}
                              </p>
                              <p className="text-[10px] text-slate-400 mt-1">
                                {formatTimeAgo(notification.created_at)}
                              </p>
                            </div>
                          </div>
                          
                          {/* Mark as read button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              markNotificationAsRead(notification.id);
                            }}
                            className="min-h-[44px] min-w-[44px] flex items-center justify-center p-1.5 rounded-full hover:bg-green-100 text-slate-400 hover:text-green-600 transition shrink-0 touch-manipulation active:scale-95"
                            title="تحديد كمقروء"
                            aria-label="تحديد كمقروء"
                          >
                            <Check className="w-5 h-5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Footer */}
                  <div className="px-4 py-2 bg-slate-50 border-t border-slate-100">
                    <Link
                      href="/inbox"
                      onClick={() => setShowNotificationDropdown(false)}
                      className="block text-center text-sm text-[#003366] font-medium hover:text-[#D4AF37] transition"
                    >
                      عرض جميع الإشعارات
                    </Link>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#003366] to-[#01375e] text-white hover:from-[#01375e] hover:to-[#003366] transition-all shadow-md"
            >
              <div className="w-8 h-8 rounded-full bg-[#D4AF37] flex items-center justify-center text-[#003366] font-bold text-sm">
                {user.name?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <span className="max-w-[100px] truncate">{user.name || 'مستخدم'}</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
            </button>

          <AnimatePresence>
            {showUserMenu && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute left-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-[50000]"
              >
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="text-sm font-bold text-[#003366] truncate">{user.name}</p>
                  <p className="text-xs text-slate-500 truncate">{user.email}</p>
                  {user.tier && (
                    <div className="flex items-center gap-1 mt-2">
                      <Crown className="w-3 h-3 text-[#D4AF37]" />
                      <span className="text-xs font-medium text-[#D4AF37]">
                        {getTierName(user.tier)}
                      </span>
                    </div>
                  )}
                </div>

                {userMenuItems.map((item) => {
                  const { href, label, icon: Icon, badge, badgeNew, badgePending, badgeRejected, badgeApproved } = item as any;
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setShowUserMenu(false)}
                      className={`flex items-center justify-between px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition ${
                        pathname === href ? 'bg-slate-50 text-[#003366] font-medium' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="w-4 h-4 text-[#D4AF37]" />
                        <span>{label}</span>
                      </div>
                  <div className="flex items-center gap-1.5">
                    {/* شارة مقبول - أخضر */}
                    {badgeApproved !== undefined && badgeApproved > 0 && (
                      <span className="bg-green-500 text-white text-mobile-xs font-bold px-2 py-1 rounded-full min-w-[22px] h-[22px] flex items-center justify-center">
                        {badgeApproved > 99 ? '99+' : badgeApproved}
                      </span>
                    )}
                    {/* شارة قيد الانتظار - أصفر */}
                    {badgePending !== undefined && badgePending > 0 && (
                      <span className="bg-yellow-500 text-black text-mobile-xs font-bold px-2 py-1 rounded-full min-w-[22px] h-[22px] flex items-center justify-center">
                        {badgePending > 99 ? '99+' : badgePending}
                      </span>
                    )}
                    {/* شارة غير مقبول - أحمر */}
                    {badgeRejected !== undefined && badgeRejected > 0 && (
                      <span className="bg-red-500 text-white text-mobile-xs font-bold px-2 py-1 rounded-full min-w-[22px] h-[22px] flex items-center justify-center">
                        {badgeRejected > 99 ? '99+' : badgeRejected}
                      </span>
                    )}
                    {/* شارة جديد - أحمر */}
                    {badgeNew !== undefined && badgeNew > 0 && (
                      <span className="bg-red-500 text-white text-mobile-xs font-bold px-2 py-1 rounded-full min-w-[22px] h-[22px] flex items-center justify-center animate-pulse">
                        {badgeNew > 99 ? '99+' : badgeNew}
                      </span>
                    )}
                    {/* شارة عادية (للرسائل والإشعارات) */}
                    {badge !== undefined && badge > 0 && (
                      <span className="bg-red-500 text-white text-mobile-xs font-bold px-2 py-1 rounded-full min-w-[22px] h-[22px] flex items-center justify-center">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </div>
                    </Link>
                  );
                })}

                {user.role === 'admin' && (
                  <Link
                    href="/admin/reports"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition"
                  >
                    <Settings className="w-4 h-4 text-[#D4AF37]" />
                    <span>لوحة التحكم</span>
                  </Link>
                )}

                <div className="border-t border-slate-100 mt-2 pt-2">
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition w-full"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>تسجيل الخروج</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 mr-2">
        <Link
          href="/login"
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#003366] to-[#01375e] text-white hover:from-[#01375e] hover:to-[#003366] transition-all font-semibold shadow-md"
        >
          تسجيل دخول
        </Link>
        <Link
          href="/register"
          className="px-4 py-2 rounded-xl border-2 border-[#003366] text-[#003366] hover:bg-[#003366] hover:text-white transition-all font-semibold"
        >
          حساب جديد
        </Link>
      </div>
    );
  };

  const renderMobileAuthSection = () => {
    if (!isHydrated) {
      return (
        <div className="border-t border-slate-100 pt-4 mt-2 space-y-2">
          <div className="h-12 bg-slate-200 rounded-xl animate-pulse" />
          <div className="h-12 bg-slate-100 rounded-xl animate-pulse" />
        </div>
      );
    }

    if (isAuthenticated && user) {
      return (
        <div className="border-t border-slate-100 pt-2 mt-2">
          <div className="px-4 py-2 mb-2">
            <p className="text-sm font-bold text-[#003366]">{user.name}</p>
            <p className="text-xs text-slate-500">{user.email}</p>
          </div>
          
          {userMenuItems.map((item) => {
            const { href, label, icon: Icon, badge, badgeNew, badgePending, badgeRejected, badgeApproved } = item as any;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setShowMobileMenu(false)}
                className="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-slate-50 transition"
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-5 h-5 text-[#D4AF37]" />
                  <span className="text-[#003366] font-medium">{label}</span>
                </div>
                <div className="flex items-center gap-1">
                  {/* أخضر = مقبول */}
                  {badgeApproved !== undefined && badgeApproved > 0 && (
                    <span className="bg-green-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                      {badgeApproved > 99 ? '99+' : badgeApproved}
                    </span>
                  )}
                  {/* أصفر = قيد الانتظار */}
                  {badgePending !== undefined && badgePending > 0 && (
                    <span className="bg-yellow-500 text-black text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                      {badgePending > 99 ? '99+' : badgePending}
                    </span>
                  )}
                  {/* أحمر = غير مقبول */}
                  {badgeRejected !== undefined && badgeRejected > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                      {badgeRejected > 99 ? '99+' : badgeRejected}
                    </span>
                  )}
                  {badgeNew !== undefined && badgeNew > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center animate-pulse">
                      {badgeNew > 99 ? '99+' : badgeNew}
                    </span>
                  )}
                  {badge !== undefined && badge > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}

          <button
            onClick={() => {
              handleLogout();
              setShowMobileMenu(false);
            }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-50 transition w-full text-red-600"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">تسجيل الخروج</span>
          </button>
        </div>
      );
    }

    return (
      <div className="border-t border-slate-100 pt-4 mt-2 space-y-2">
        <Link
          href="/login"
          onClick={() => setShowMobileMenu(false)}
          className="block w-full text-center px-4 py-3 rounded-xl bg-gradient-to-r from-[#003366] to-[#01375e] text-white font-semibold"
        >
          تسجيل دخول
        </Link>
        <Link
          href="/register"
          onClick={() => setShowMobileMenu(false)}
          className="block w-full text-center px-4 py-3 rounded-xl border-2 border-[#003366] text-[#003366] font-semibold"
        >
          حساب جديد
        </Link>
      </div>
    );
  };

  return (
    <>
      <LogoAdminModal
        open={adminModalOpen}
        onClose={() => setAdminModalOpen(false)}
      />

      <header 
        className="shadow-sm border-b border-slate-100 sticky top-0 z-[200] bg-white/95 backdrop-blur-sm" 
        dir="rtl"
        style={{
          backgroundImage: "url('/patterns/card-pattern.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 flex items-center justify-between h-14 sm:h-16 lg:h-20">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <button
              type="button"
              onClick={() => setAdminModalOpen(true)}
              className="relative hover:opacity-90 transition group shrink-0"
              aria-label={`شعار ${siteSettings.siteName} - اضغط لفتح بوابة الإدارة`}
            >
              <Image
                src="/logo.svg"
                alt={`شعار ${siteSettings.siteName}`}
                width={32}
                height={32}
                className="rounded-xl shadow-md group-hover:shadow-lg transition w-8 h-8 sm:w-10 sm:h-10"
              />
              <div className="absolute -bottom-1 -right-1 w-3 h-3 sm:w-4 sm:h-4 bg-gradient-to-br from-[#D4AF37] to-[#B8860B] rounded-full flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition">
                <Crown className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-[#002845]" />
              </div>
            </button>
            <Link
              href="/"
              className="text-lg sm:text-xl lg:text-2xl font-extrabold text-[#003366] tracking-tight hover:text-[#D4AF37] transition truncate"
            >
              {siteSettings.siteName}
            </Link>
          </div>

          {/* Mobile: Fixed buttons in header */}
          <div className="md:hidden flex items-center gap-2 ml-2 shrink-0">
            {/* Map/List Toggle Button */}
            {isSearchPage ? (
              <Link
                href={`/search?view=${nextView}`}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-[#4DB6A0] to-[#3A9A87] text-white shadow-md hover:shadow-lg transition-all active:scale-95"
              >
                <SearchIcon className="w-4 h-4" />
                <span className="text-xs font-semibold hidden sm:inline">{searchLabel}</span>
              </Link>
            ) : (
              <Link
                href="/search?view=map"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-[#4DB6A0] to-[#3A9A87] text-white shadow-md hover:shadow-lg transition-all active:scale-95"
              >
                <Map className="w-4 h-4" />
                <span className="text-xs font-semibold hidden sm:inline">الخريطة</span>
              </Link>
            )}
            
            {/* Add Listing Button */}
            <Link
              href="/listings/new"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-[#002845] shadow-md hover:shadow-lg transition-all active:scale-95 font-semibold"
            >
              <PlusCircle className="w-4 h-4" />
              <span className="text-xs hidden sm:inline">إضافة</span>
            </Link>
          </div>

        <nav className="hidden md:flex items-center gap-2 text-sm font-medium text-[#003366]">
          <div className="flex items-center bg-[#E8F5F0]/80 backdrop-blur-sm rounded-xl p-1 border border-[#5FBDAA]/30 shadow-sm">
            <Link
              href="/search?view=list"
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 ${
                isSearchPage && currentView === 'list'
                  ? 'bg-gradient-to-r from-[#4DB6A0] to-[#3A9A87] text-white shadow-md' 
                  : 'text-[#003366] hover:bg-white/80'
              }`}
            >
              <List className="w-4 h-4" />
              <span className="font-semibold">البحث بالقائمة</span>
            </Link>
            <Link
              href="/search?view=map"
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 ${
                isSearchPage && currentView === 'map'
                  ? 'bg-gradient-to-r from-[#4DB6A0] to-[#3A9A87] text-white shadow-md' 
                  : 'text-[#003366] hover:bg-white/80'
              }`}
            >
              <Map className="w-4 h-4" />
              <span className="font-semibold">البحث بالخريطة</span>
            </Link>
          </div>

          {staticNavItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-300 ease-out transform hover:scale-[1.02] bg-[#E8F5F0]/80 border border-[#5FBDAA]/30 ${
                pathname === href 
                  ? 'bg-gradient-to-r from-[#4DB6A0] to-[#3A9A87] text-white shadow-md' 
                  : 'text-[#003366] hover:bg-[#D4F1E8] active:scale-95'
              }`}
            >
              <Icon className={`w-4 h-4 transition-colors duration-300 ${pathname === href ? 'text-white' : 'text-[#4DB6A0]'}`} />
              <span className="font-semibold">{label}</span>
            </Link>
          ))}

          {renderAuthSection()}
        </nav>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden p-2 rounded-lg hover:bg-slate-100 transition shrink-0"
          onClick={() => setShowMobileMenu(!showMobileMenu)}
        >
          {showMobileMenu ? (
            <X className="w-6 h-6 text-[#003366]" />
          ) : (
            <Menu className="w-6 h-6 text-[#003366]" />
          )}
        </button>
      </div>

      <MobileBottomSheet
        isOpen={showMobileMenu}
        onClose={() => setShowMobileMenu(false)}
        title="القائمة الرئيسية"
        maxHeight="70vh"
      >
        <nav className="space-y-2">
          {staticNavItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setShowMobileMenu(false)}
              className={`flex items-center gap-3 min-h-[48px] px-4 py-3 rounded-xl transition-all duration-300 bg-[#E8F5F0] border border-[#5FBDAA]/30 touch-manipulation ${
                pathname === href 
                  ? 'bg-gradient-to-r from-[#4DB6A0] to-[#3A9A87] text-white shadow-sm' 
                  : 'hover:bg-[#D4F1E8] active:scale-95'
              }`}
            >
              <Icon className={`w-6 h-6 transition-colors ${pathname === href ? 'text-white' : 'text-[#4DB6A0]'}`} />
              <span className={`text-mobile-base font-semibold ${pathname === href ? 'text-white' : 'text-[#003366]'}`}>{label}</span>
            </Link>
          ))}

          {renderMobileAuthSection()}
        </nav>
      </MobileBottomSheet>

      </header>
    </>
  );
}

export default function Navbar() {
  return (
    <Suspense fallback={
      <header 
        className="shadow-sm border-b border-slate-100 sticky top-0 z-[200]" 
        dir="rtl"
        style={{
          backgroundImage: "url('/patterns/card-pattern.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-20">
          <div className="flex items-center gap-3">
            <div className="w-[52px] h-[52px] bg-slate-200 rounded-md animate-pulse" />
            <div className="w-32 h-6 bg-slate-200 rounded animate-pulse" />
          </div>
          <div className="hidden md:flex items-center gap-4">
            <div className="w-24 h-8 bg-slate-100 rounded-xl animate-pulse" />
            <div className="w-24 h-8 bg-slate-100 rounded-xl animate-pulse" />
            <div className="w-24 h-10 bg-slate-200 rounded-xl animate-pulse" />
          </div>
        </div>
      </header>
    }>
      <NavbarContent />
    </Suspense>
  );
}
