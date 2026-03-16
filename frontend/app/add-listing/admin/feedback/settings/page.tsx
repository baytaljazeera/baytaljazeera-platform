"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { Settings, Save, Loader2, AlertCircle } from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";

interface FeedbackSettingsData {
  enabled: boolean;
  showOnHomepage: boolean;
  showOnSearch: boolean;
  showOnMapPage: boolean;
  showOnPropertyDetails: boolean;
  displayMode: string;
  delaySeconds: number;
  frequency: string;
  headingText: string;
  thankYouMessage: string;
  successMessage: string;
  enableProblemQuestion: boolean;
  enableCommentField: boolean;
  adminEmailNotification: boolean;
  adminEmail: string;
}

const defaultSettings: FeedbackSettingsData = {
  enabled: true,
  showOnHomepage: true,
  showOnSearch: true,
  showOnMapPage: true,
  showOnPropertyDetails: true,
  displayMode: "inline",
  delaySeconds: 25,
  frequency: "once_per_session",
  headingText: "كيف كانت تجربتك؟",
  thankYouMessage: "شكراً لمساهمتك!",
  successMessage: "تم إرسال رأيك بنجاح.",
  enableProblemQuestion: true,
  enableCommentField: true,
  adminEmailNotification: false,
  adminEmail: "",
};

export default function FeedbackSettingsPage() {
  const [settings, setSettings] = useState<FeedbackSettingsData>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch(`${API_URL}/api/feedback/admin/settings`, {
          credentials: "include",
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.settings) setSettings({ ...defaultSettings, ...json.settings });
        }
      } catch {
        setMessage({ type: "error", text: "فشل تحميل الإعدادات" });
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/feedback/admin/settings`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("فشل الحفظ");
      setMessage({ type: "success", text: "تم حفظ الإعدادات بنجاح." });
    } catch {
      setMessage({ type: "error", text: "فشل حفظ الإعدادات" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-10 h-10 animate-spin text-[#D4AF37]" />
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <h1 className="text-2xl font-bold text-[#002845] flex items-center gap-2">
        <Settings className="w-7 h-7 text-[#D4AF37]" />
        إعدادات التغذية الراجعة
      </h1>

      {message && (
        <div
          className={`rounded-xl p-4 flex items-center gap-2 ${
            message.type === "success" ? "bg-green-500/10 text-green-800" : "bg-red-500/10 text-red-700"
          }`}
        >
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="font-medium">{message.text}</p>
        </div>
      )}

      <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <label className="font-bold text-[#002845]">تفعيل نظام التغذية الراجعة</label>
          <button
            type="button"
            role="switch"
            aria-checked={settings.enabled}
            onClick={() => setSettings((s) => ({ ...s, enabled: !s.enabled }))}
            className={`relative w-12 h-7 rounded-full transition ${
              settings.enabled ? "bg-[#D4AF37]" : "bg-slate-300"
            }`}
          >
            <span
              className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition ${
                settings.enabled ? "left-6" : "left-1"
              }`}
            />
          </button>
        </div>

        <div>
          <p className="font-bold text-[#002845] mb-3">الصفحات التي يظهر فيها النموذج</p>
          <div className="flex flex-wrap gap-4">
            {[
              { key: "showOnHomepage", label: "الرئيسية" },
              { key: "showOnSearch", label: "نتائج البحث" },
              { key: "showOnMapPage", label: "صفحة الخريطة" },
              { key: "showOnPropertyDetails", label: "تفاصيل العقار" },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings[key as keyof FeedbackSettingsData] as boolean}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, [key]: e.target.checked }))
                  }
                  className="rounded border-slate-300 text-[#D4AF37] focus:ring-[#D4AF37]"
                />
                <span className="text-[#002845]">{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="font-bold text-[#002845] block mb-2">وضع العرض</label>
          <select
            value={settings.displayMode}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                displayMode: e.target.value as "inline" | "floating" | "popup",
              }))
            }
            className="rounded-lg border border-slate-300 px-4 py-2 w-full max-w-xs"
          >
            <option value="inline">داخل الصفحة (Inline)</option>
            <option value="floating">عنصر عائم (Floating)</option>
            <option value="popup">نافذة منبثقة (Popup)</option>
          </select>
        </div>

        <div>
          <label className="font-bold text-[#002845] block mb-2">التأخير قبل الظهور (ثانية) — للعائم/منبثق</label>
          <input
            type="number"
            min={0}
            max={120}
            value={settings.delaySeconds}
            onChange={(e) =>
              setSettings((s) => ({ ...s, delaySeconds: parseInt(e.target.value, 10) || 0 }))
            }
            className="rounded-lg border border-slate-300 px-4 py-2 w-24"
          />
        </div>

        <div>
          <label className="font-bold text-[#002845] block mb-2">التردد</label>
          <select
            value={settings.frequency}
            onChange={(e) => setSettings((s) => ({ ...s, frequency: e.target.value }))}
            className="rounded-lg border border-slate-300 px-4 py-2 w-full max-w-xs"
          >
            <option value="every_visit">كل زيارة</option>
            <option value="once_per_session">مرة في الجلسة</option>
            <option value="once_per_7_days">مرة كل 7 أيام</option>
          </select>
        </div>

        <div>
          <label className="font-bold text-[#002845] block mb-2">عنوان النموذج</label>
          <input
            type="text"
            value={settings.headingText}
            onChange={(e) => setSettings((s) => ({ ...s, headingText: e.target.value }))}
            className="rounded-lg border border-slate-300 px-4 py-2 w-full max-w-md"
          />
        </div>
        <div>
          <label className="font-bold text-[#002845] block mb-2">رسالة الشكر</label>
          <input
            type="text"
            value={settings.thankYouMessage}
            onChange={(e) => setSettings((s) => ({ ...s, thankYouMessage: e.target.value }))}
            className="rounded-lg border border-slate-300 px-4 py-2 w-full max-w-md"
          />
        </div>
        <div>
          <label className="font-bold text-[#002845] block mb-2">رسالة النجاح بعد الإرسال</label>
          <input
            type="text"
            value={settings.successMessage}
            onChange={(e) => setSettings((s) => ({ ...s, successMessage: e.target.value }))}
            className="rounded-lg border border-slate-300 px-4 py-2 w-full max-w-md"
          />
        </div>

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.enableProblemQuestion}
              onChange={(e) =>
                setSettings((s) => ({ ...s, enableProblemQuestion: e.target.checked }))
              }
              className="rounded border-slate-300 text-[#D4AF37] focus:ring-[#D4AF37]"
            />
            <span className="text-[#002845]">إظهار سؤال «هل واجهت مشكلة؟»</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.enableCommentField}
              onChange={(e) =>
                setSettings((s) => ({ ...s, enableCommentField: e.target.checked }))
              }
              className="rounded border-slate-300 text-[#D4AF37] focus:ring-[#D4AF37]"
            />
            <span className="text-[#002845]">إظهار حقل التعليق</span>
          </label>
        </div>

        <div>
          <label className="font-bold text-[#002845] block mb-2">إشعار البريد للإدمن عند رد جديد</label>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.adminEmailNotification}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, adminEmailNotification: e.target.checked }))
                }
                className="rounded border-slate-300 text-[#D4AF37] focus:ring-[#D4AF37]"
              />
              <span className="text-[#002845]">تفعيل</span>
            </label>
            <input
              type="email"
              placeholder="البريد الإلكتروني للإدمن"
              value={settings.adminEmail}
              onChange={(e) => setSettings((s) => ({ ...s, adminEmail: e.target.value }))}
              className="rounded-lg border border-slate-300 px-4 py-2 w-64"
            />
          </div>
        </div>

        <div className="pt-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#D4AF37] text-[#002845] font-bold hover:bg-[#c49f2e] disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            حفظ الإعدادات
          </button>
        </div>
      </div>
    </div>
  );
}
