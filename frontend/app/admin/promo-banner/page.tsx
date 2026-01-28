"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";

export const dynamic = "force-dynamic";

import React, { useEffect, useState } from "react";
import { Loader2, Save, Gift, Eye, EyeOff, Sparkles, CreditCard } from "lucide-react";
import Link from "next/link";

interface BannerSettings {
  enabled: boolean;
  title: string;
  text: string;
  badge: string;
  freeMode: boolean;
}

export default function PromoBannerPage() {
  const [settings, setSettings] = useState<BannerSettings>({
    enabled: true,
    title: "عرض الإطلاق الخاص",
    text: "استمتع بجميع الباقات مجاناً حتى ألف عميل!",
    badge: "عرض محدود",
    freeMode: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_URL}/api/settings/promo-banner");
      const data = await res.json();
      if (data.ok && data.settings) {
        setSettings(data.settings);
      }
    } catch (err) {
      console.error("Error fetching settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/settings/promo-banner", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: "success", text: "تم حفظ الإعدادات بنجاح" });
      } else {
        setMessage({ type: "error", text: data.error || "حدث خطأ" });
      }
    } catch (err) {
      setMessage({ type: "error", text: "حدث خطأ في الاتصال" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <Loader2 className="h-8 w-8 animate-spin text-[#D4AF37]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-6" dir="rtl">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#D4AF37] to-[#B8860B]">
              <Gift className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">إعدادات بانر العرض الترويجي</h1>
              <p className="text-slate-400">تحكم في عرض الإطلاق وإعدادات الدفع</p>
            </div>
          </div>
          <Link
            href="/admin"
            className="rounded-xl bg-slate-800 px-4 py-2 text-slate-300 hover:bg-slate-700"
          >
            العودة للوحة التحكم
          </Link>
        </div>

        {message && (
          <div
            className={`mb-6 rounded-xl p-4 ${
              message.type === "success"
                ? "bg-green-500/20 text-green-400 border border-green-500/30"
                : "bg-red-500/20 text-red-400 border border-red-500/30"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="space-y-6">
          <div className="rounded-2xl bg-slate-800 p-6 border border-slate-700">
            <h2 className="mb-6 text-xl font-bold text-white flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#D4AF37]" />
              إعدادات البانر
            </h2>

            <div className="space-y-6">
              <div className="flex items-center justify-between rounded-xl bg-slate-700/50 p-4">
                <div className="flex items-center gap-3">
                  {settings.enabled ? (
                    <Eye className="h-5 w-5 text-green-400" />
                  ) : (
                    <EyeOff className="h-5 w-5 text-slate-400" />
                  )}
                  <div>
                    <p className="font-semibold text-white">إظهار البانر</p>
                    <p className="text-sm text-slate-400">عرض بانر العرض الترويجي في صفحة الباقات</p>
                  </div>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, enabled: !settings.enabled })}
                  className={`relative h-7 w-14 rounded-full transition-colors ${
                    settings.enabled ? "bg-green-500" : "bg-slate-600"
                  }`}
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-md transition-all ${
                      settings.enabled ? "right-1" : "left-1"
                    }`}
                  />
                </button>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  عنوان البانر
                </label>
                <input
                  type="text"
                  value={settings.title}
                  onChange={(e) => setSettings({ ...settings, title: e.target.value })}
                  className="w-full rounded-xl bg-slate-700 px-4 py-3 text-white border border-slate-600 focus:border-[#D4AF37] focus:outline-none"
                  placeholder="عرض الإطلاق الخاص"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  نص العرض
                </label>
                <input
                  type="text"
                  value={settings.text}
                  onChange={(e) => setSettings({ ...settings, text: e.target.value })}
                  className="w-full rounded-xl bg-slate-700 px-4 py-3 text-white border border-slate-600 focus:border-[#D4AF37] focus:outline-none"
                  placeholder="استمتع بجميع الباقات مجاناً حتى ألف عميل!"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  نص الشارة
                </label>
                <input
                  type="text"
                  value={settings.badge}
                  onChange={(e) => setSettings({ ...settings, badge: e.target.value })}
                  className="w-full rounded-xl bg-slate-700 px-4 py-3 text-white border border-slate-600 focus:border-[#D4AF37] focus:outline-none"
                  placeholder="عرض محدود"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-800 p-6 border border-slate-700">
            <h2 className="mb-6 text-xl font-bold text-white flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-[#D4AF37]" />
              إعدادات الدفع
            </h2>

            <div className="flex items-center justify-between rounded-xl bg-slate-700/50 p-4">
              <div className="flex items-center gap-3">
                <div
                  className={`h-10 w-10 rounded-full flex items-center justify-center ${
                    settings.freeMode ? "bg-green-500/20" : "bg-blue-500/20"
                  }`}
                >
                  <CreditCard
                    className={`h-5 w-5 ${settings.freeMode ? "text-green-400" : "text-blue-400"}`}
                  />
                </div>
                <div>
                  <p className="font-semibold text-white">وضع المجاني</p>
                  <p className="text-sm text-slate-400">
                    {settings.freeMode
                      ? "جميع الباقات مجانية - أزرار الدفع معطّلة"
                      : "الدفع مفعّل - العملاء يدفعون للباقات المدفوعة"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSettings({ ...settings, freeMode: !settings.freeMode })}
                className={`relative h-7 w-14 rounded-full transition-colors ${
                  settings.freeMode ? "bg-green-500" : "bg-blue-500"
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-md transition-all ${
                    settings.freeMode ? "right-1" : "left-1"
                  }`}
                />
              </button>
            </div>

            {settings.freeMode && (
              <div className="mt-4 rounded-xl bg-green-500/10 border border-green-500/20 p-4">
                <p className="text-sm text-green-400">
                  <strong>ملاحظة:</strong> عند تفعيل الوضع المجاني، سيتمكن العملاء من الاشتراك في
                  جميع الباقات بدون دفع. أوقف هذا الخيار عندما تريد تفعيل الدفع.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-gradient-to-l from-[#002845] to-[#01375e] p-6 border border-[#D4AF37]/20">
            <h3 className="mb-4 text-lg font-bold text-white">معاينة البانر</h3>
            {settings.enabled ? (
              <div className="rounded-xl bg-gradient-to-l from-[#002845]/90 via-[#01375e]/90 to-[#002845]/90 px-6 py-5">
                <div className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#D4AF37] to-[#B8860B]">
                      <Gift className="h-7 w-7 text-white" />
                    </div>
                  </div>
                  <div className="text-center sm:text-right">
                    <h2 className="text-xl font-bold text-white mb-1">
                      🎉 {settings.title}
                    </h2>
                    <p className="text-lg font-semibold text-[#D4AF37]">{settings.text}</p>
                  </div>
                  <div className="rounded-full bg-[#D4AF37]/20 px-4 py-2 border border-[#D4AF37]/30">
                    <span className="text-sm font-bold text-[#D4AF37]">{settings.badge}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-slate-700/50 p-6 text-center">
                <EyeOff className="mx-auto h-12 w-12 text-slate-500 mb-2" />
                <p className="text-slate-400">البانر مخفي حالياً</p>
              </div>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-[#D4AF37] to-[#B8860B] px-6 py-4 font-bold text-white shadow-lg hover:opacity-90 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Save className="h-5 w-5" />
                حفظ الإعدادات
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
