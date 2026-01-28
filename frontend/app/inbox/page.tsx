"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, Check, CheckCheck, ExternalLink } from "lucide-react";

type Notification = {
  id: number;
  title: string;
  body: string;
  type?: string;
  link?: string;
  read_at?: string;
  created_at: string;
};

export default function InboxPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
  }, []);

  async function fetchNotifications() {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/notifications`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        return;
      }

      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function markAsRead(ids: number[]) {
    try {
      const token = localStorage.getItem("token");
      await fetch(`${API_URL}/api/notifications/read`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ids }),
      });

      setNotifications(
        notifications.map((n) =>
          ids.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n
        )
      );
      
      window.dispatchEvent(new CustomEvent('notificationsUpdated'));
    } catch (err) {
      console.error(err);
    }
  }

  async function markAllAsRead() {
    try {
      const token = localStorage.getItem("token");
      await fetch(`${API_URL}/api/notifications/read-all`, {
        method: "PATCH",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      setNotifications(
        notifications.map((n) => ({ ...n, read_at: new Date().toISOString() }))
      );
      
      window.dispatchEvent(new CustomEvent('notificationsUpdated'));
    } catch (err) {
      console.error(err);
    }
  }

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen bg-gradient-to-b from-[#002845] to-[#fdf6db] flex items-center justify-center">
        <div className="text-white text-lg">جاري التحميل...</div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-[#002845] via-[#123a64] to-[#fdf6db] py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
            <Bell className="w-6 h-6" />
            صندوق الوارد
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                {unreadCount}
              </span>
            )}
          </h1>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-1 text-white/80 hover:text-white text-sm"
            >
              <CheckCheck className="w-4 h-4" />
              تحديد الكل كمقروء
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center">
            <Bell className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600">لا توجد رسائل حتى الآن</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`bg-white rounded-2xl border px-4 py-4 transition ${
                  n.read_at
                    ? "border-slate-200"
                    : "border-[#f6d879] shadow-lg"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-[#002845]">{n.title || "تنبيه"}</h3>
                      {!n.read_at && (
                        <span className="w-2 h-2 bg-[#f6d879] rounded-full"></span>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 mt-1">{n.body}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                      <span>
                        {new Date(n.created_at).toLocaleString("en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                      {n.link && (
                        <Link
                          href={n.link}
                          className="text-[#002845] hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          فتح
                        </Link>
                      )}
                    </div>
                  </div>

                  {!n.read_at && (
                    <button
                      onClick={() => markAsRead([n.id])}
                      className="p-2 hover:bg-slate-100 rounded-lg"
                      title="تحديد كمقروء"
                    >
                      <Check className="w-4 h-4 text-green-600" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
