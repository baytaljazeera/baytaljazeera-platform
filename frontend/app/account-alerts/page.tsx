"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  Bell, AlertTriangle, Info, CheckCircle, 
  ArrowRight, Clock, Eye, RefreshCw 
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

type Alert = {
  id: number;
  alert_type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  admin_name: string | null;
};

export default function AccountAlertsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const getAuthHeaders = (): Record<string, string> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchAlerts = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/account/alerts`, { 
        credentials: "include",
        headers: getAuthHeaders()
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts || []);
        setUnreadCount(data.unread_count || 0);
      }
    } catch (err) {
      console.error("Error fetching alerts:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const markAsRead = async (alertId: number) => {
    try {
      await fetch(`${API_BASE}/api/account/alerts/${alertId}/read`, {
        method: "PATCH",
        credentials: "include",
        headers: getAuthHeaders()
      });
      setAlerts(prev => prev.map(a => 
        a.id === alertId ? { ...a, is_read: true } : a
      ));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Error marking as read:", err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetch(`${API_BASE}/api/account/alerts/mark-all-read`, {
        method: "PATCH",
        credentials: "include",
        headers: getAuthHeaders()
      });
      setAlerts(prev => prev.map(a => ({ ...a, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Error marking all as read:", err);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "warning":
        return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      case "info":
        return <Info className="w-5 h-5 text-blue-500" />;
      case "success":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      default:
        return <Bell className="w-5 h-5 text-slate-500" />;
    }
  };

  const getAlertBg = (type: string, isRead: boolean) => {
    if (isRead) return "bg-slate-50";
    switch (type) {
      case "warning":
        return "bg-amber-50 border-amber-200";
      case "info":
        return "bg-blue-50 border-blue-200";
      case "success":
        return "bg-green-50 border-green-200";
      default:
        return "bg-white";
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "الآن";
    if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    if (diffDays < 7) return `منذ ${diffDays} يوم`;
    return date.toLocaleDateString("ar-SA", { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white" dir="rtl">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link
          href="/account"
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-[#D4AF37] mb-6 transition"
        >
          <ArrowRight className="w-4 h-4" />
          العودة للحساب
        </Link>

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#D4AF37] to-amber-600 flex items-center justify-center">
              <Bell className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">تنبيهات الحساب</h1>
              <p className="text-sm text-slate-500">
                {unreadCount > 0 ? `${unreadCount} تنبيه غير مقروء` : "لا توجد تنبيهات جديدة"}
              </p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={fetchAlerts}
              className="p-2 text-slate-500 hover:text-[#D4AF37] hover:bg-slate-100 rounded-lg transition"
              title="تحديث"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition"
              >
                <Eye className="w-4 h-4" />
                تحديد الكل كمقروء
              </button>
            )}
          </div>
        </div>

        {alerts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <Bell className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">لا توجد تنبيهات</h3>
            <p className="text-sm text-slate-500">سيظهر هنا أي تنبيه من إدارة المنصة</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                onClick={() => !alert.is_read && markAsRead(alert.id)}
                className={`rounded-xl border p-4 transition cursor-pointer hover:shadow-md ${getAlertBg(alert.alert_type, alert.is_read)}`}
              >
                <div className="flex items-start gap-4">
                  <div className={`p-2 rounded-lg ${alert.is_read ? 'bg-slate-100' : 'bg-white shadow-sm'}`}>
                    {getAlertIcon(alert.alert_type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className={`font-semibold ${alert.is_read ? 'text-slate-600' : 'text-slate-800'}`}>
                        {alert.title}
                      </h3>
                      {!alert.is_read && (
                        <span className="px-2 py-0.5 bg-red-500 text-white text-[10px] rounded-full">جديد</span>
                      )}
                    </div>
                    
                    <p className={`text-sm leading-relaxed mb-2 ${alert.is_read ? 'text-slate-500' : 'text-slate-700'}`}>
                      {alert.message}
                    </p>
                    
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(alert.created_at)}
                      </span>
                      {alert.admin_name && (
                        <span>من: {alert.admin_name}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
