"use client";

import { Bell, UserCircle2, Search, Menu, X, Check, ExternalLink, Eye, EyeOff, Trash2, AlertTriangle, Headset, Banknote } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useAuthStore } from "@/lib/stores/authStore";

type Notification = {
  id: number;
  title: string;
  body: string;
  type?: string;
  link?: string;
  read_at?: string;
  created_at: string;
};

type AdminTopbarProps = {
  onMenuClick?: () => void;
};

const ROLE_NAMES: Record<string, string> = {
  super_admin: 'المدير العام',
  finance_admin: 'إدارة المالية',
  support_admin: 'الدعم الفني',
  content_admin: 'إدارة المحتوى',
  admin: 'مدير',
};

export default function AdminTopbar({ onMenuClick }: AdminTopbarProps) {
  const { user, isHydrated, hydrate } = useAuthStore();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [complaintsCount, setComplaintsCount] = useState(0);
  const [ticketsCount, setTicketsCount] = useState(0);
  const [pendingBankCount, setPendingBankCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isHydrated) {
      hydrate();
    }
  }, [isHydrated, hydrate]);

  useEffect(() => {
    fetchUnreadCount();
    fetchComplaintsCount();
    fetchTicketsCount();
    fetchPendingBankCount();
    const interval = setInterval(() => {
      fetchUnreadCount();
      fetchComplaintsCount();
      fetchTicketsCount();
      fetchPendingBankCount();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function fetchUnreadCount() {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/notifications/count", {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.unread || 0);
      }
    } catch (err) {
      console.error("Error fetching notification count:", err);
    }
  }

  async function fetchComplaintsCount() {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/account-complaints/count", {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setComplaintsCount(data.count || 0);
      }
    } catch (err) {
      // Silently fail - user may not have permission
    }
  }

  async function fetchTicketsCount() {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/support-tickets/count", {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setTicketsCount(data.count || 0);
      }
    } catch (err) {
      // Silently fail - mock data or user may not have permission
    }
  }

  async function fetchPendingBankCount() {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/refunds/pending-bank-count", {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setPendingBankCount(data.count || 0);
      }
    } catch (err) {
      // Silently fail - user may not have permission
    }
  }

  async function fetchNotifications() {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/notifications?limit=10", {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch (err) {
      console.error("Error fetching notifications:", err);
    } finally {
      setLoading(false);
    }
  }

  async function markAsRead(id: number) {
    try {
      const token = localStorage.getItem("token");
      await fetch("/api/notifications/read", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ids: [id] }),
      });
      setNotifications(notifications.map(n => 
        n.id === id ? { ...n, read_at: new Date().toISOString() } : n
      ));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Error marking as read:", err);
    }
  }

  async function markAllAsRead() {
    try {
      const token = localStorage.getItem("token");
      await fetch("/api/notifications/read-all", {
        method: "PATCH",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setNotifications(notifications.map(n => ({ ...n, read_at: new Date().toISOString() })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Error marking all as read:", err);
    }
  }

  async function dismissNotification(id: number) {
    try {
      const token = localStorage.getItem("token");
      await fetch(`/api/notifications/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setNotifications(notifications.filter(n => n.id !== id));
      const wasUnread = notifications.find(n => n.id === id && !n.read_at);
      if (wasUnread) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error("Error dismissing notification:", err);
    }
  }

  function toggleNotifications() {
    if (!showNotifications) {
      fetchNotifications();
    }
    setShowNotifications(!showNotifications);
  }

  function formatDate(dateStr: string) {
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
  }

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-3 md:px-6 md:py-4 shadow-sm sticky top-0 z-40">
      <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
        <button 
          className="md:hidden p-2.5 rounded-lg hover:bg-slate-100 active:bg-slate-200 touch-manipulation shrink-0"
          onClick={onMenuClick}
        >
          <Menu className="w-6 h-6 text-slate-600" />
        </button>
        
        <div className="min-w-0 flex-1">
          <h2 className="text-base md:text-lg font-bold text-[#002845] truncate">
            منطقة الإدارة
          </h2>
          <p className="text-xs md:text-sm text-slate-500 truncate">
            تحكم كامل في جميع أقسام المنصة
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="hidden md:flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-2">
          <Search className="w-4 h-4 text-slate-400" />
          <input 
            type="text"
            placeholder="بحث سريع..."
            className="bg-transparent text-sm w-32 focus:outline-none placeholder:text-slate-400"
          />
        </div>

        {/* شارة تذاكر الدعم - أزرق */}
        {ticketsCount > 0 && (
          <Link
            href="/admin/support"
            className="relative inline-flex h-10 md:h-9 items-center gap-1.5 px-2.5 md:px-3 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 transition touch-manipulation"
            title="تذاكر الدعم المفتوحة"
          >
            <Headset className="w-4 h-4 md:w-4 text-blue-600" />
            <span className="text-sm md:text-xs font-bold text-blue-700">{ticketsCount}</span>
          </Link>
        )}

        {/* شارة التحويلات البنكية المعلقة - أخضر */}
        {pendingBankCount > 0 && (
          <Link
            href="/admin/finance"
            className="relative inline-flex h-10 md:h-9 items-center gap-1.5 px-2.5 md:px-3 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 transition touch-manipulation"
            title="بانتظار التحويل البنكي"
          >
            <Banknote className="w-4 h-4 md:w-4 text-emerald-600" />
            <span className="text-sm md:text-xs font-bold text-emerald-700">{pendingBankCount}</span>
          </Link>
        )}

        {/* شارة الشكاوى - أصفر */}
        {complaintsCount > 0 && (
          <Link
            href="/admin/complaints"
            className="relative inline-flex h-10 md:h-9 items-center gap-1.5 px-2.5 md:px-3 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 active:bg-amber-200 transition touch-manipulation"
            title="الشكاوى المفتوحة"
          >
            <AlertTriangle className="w-4 h-4 md:w-4 text-amber-600" />
            <span className="text-sm md:text-xs font-bold text-amber-700">{complaintsCount}</span>
          </Link>
        )}

        <div className="relative" ref={dropdownRef}>
          <button 
            onClick={toggleNotifications}
            className="relative inline-flex h-10 w-10 md:h-9 md:w-9 items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 active:bg-slate-100 transition touch-manipulation"
          >
            <Bell className="w-5 h-5 md:w-4 md:h-4 text-slate-600" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] md:min-w-[16px] md:h-4 px-1 bg-red-500 text-white text-xs md:text-[9px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute left-0 top-14 md:top-12 w-[calc(100vw-2rem)] md:w-80 max-w-sm bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
              <div className="flex items-center justify-between p-4 md:p-3 border-b border-slate-100 bg-gradient-to-r from-[#002845] to-[#1a4a6e]">
                <h3 className="text-base md:text-sm font-bold text-white flex items-center gap-2">
                  <Bell className="w-5 h-5 md:w-4 md:h-4" />
                  الإشعارات
                </h3>
                {unreadCount > 0 && (
                  <button 
                    onClick={markAllAsRead}
                    className="text-xs md:text-[10px] text-white/80 hover:text-white active:text-white flex items-center gap-1 touch-manipulation px-2 py-1"
                  >
                    <Check className="w-4 h-4 md:w-3 md:h-3" />
                    قراءة الكل
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto">
                {loading ? (
                  <div className="p-6 text-center text-slate-400 text-sm">
                    جاري التحميل...
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="p-6 text-center">
                    <Bell className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm">لا توجد إشعارات</p>
                  </div>
                ) : (
                  notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-3 border-b border-slate-50 hover:bg-slate-50 transition group ${
                        !notification.read_at ? "bg-blue-50/50" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                          !notification.read_at ? "bg-blue-500 animate-pulse" : "bg-green-400"
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm md:text-xs font-bold text-[#002845] truncate flex-1">
                              {notification.title}
                            </p>
                            {notification.read_at && (
                              <span className="text-xs md:text-[9px] bg-green-100 text-green-700 px-2 py-1 md:px-1.5 md:py-0.5 rounded-full flex items-center gap-1 md:gap-0.5 shrink-0">
                                <Eye className="w-3 h-3 md:w-2.5 md:h-2.5" />
                                <span className="hidden md:inline">تم الإعلام</span>
                              </span>
                            )}
                          </div>
                          <p className="text-sm md:text-[11px] text-slate-500 line-clamp-2 mt-1 md:mt-0.5">
                            {notification.body}
                          </p>
                          <div className="flex items-center justify-between mt-2 md:mt-1.5">
                            <p className="text-xs md:text-[10px] text-slate-400">
                              {formatDate(notification.created_at)}
                            </p>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {!notification.read_at ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); markAsRead(notification.id); }}
                                  className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 hover:bg-green-100 text-green-600 text-[10px] font-medium transition"
                                  title="تم الإعلام"
                                >
                                  <Check className="w-3 h-3" />
                                  تم الإعلام
                                </button>
                              ) : (
                                <span className="text-[10px] text-green-500 flex items-center gap-1">
                                  <Check className="w-3 h-3" />
                                </span>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); dismissNotification(notification.id); }}
                                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 hover:bg-red-100 text-red-500 text-[10px] font-medium transition"
                                title="إزالة الإشعار"
                              >
                                <Trash2 className="w-3 h-3" />
                                إزالة
                              </button>
                              {notification.link && (
                                <Link 
                                  href={notification.link}
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#002845]/10 hover:bg-[#002845]/20 text-[#002845] text-[10px] font-medium transition"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  عرض
                                </Link>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <Link
                href="/inbox"
                className="block p-2.5 text-center text-xs font-medium text-[#002845] hover:bg-slate-50 border-t border-slate-100"
              >
                عرض كل الإشعارات
              </Link>
            </div>
          )}
        </div>

        <button className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 md:px-3 py-2 md:py-1.5 hover:bg-slate-50 active:bg-slate-100 transition touch-manipulation">
          <div className="w-8 h-8 md:w-7 md:h-7 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#B8860B] flex items-center justify-center shrink-0">
            <UserCircle2 className="w-5 h-5 md:w-4 md:h-4 text-[#002845]" />
          </div>
          <div className="hidden md:block text-right">
            <p className="text-sm md:text-xs font-bold text-[#002845] truncate max-w-[100px]">{user?.name || 'المدير'}</p>
            <p className="text-xs md:text-[9px] text-slate-500">{ROLE_NAMES[user?.role || ''] || 'مدير'}</p>
          </div>
        </button>
      </div>
    </header>
  );
}
