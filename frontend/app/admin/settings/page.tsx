"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { Settings, Globe, Bell, Shield, Database, Save, RefreshCw, Loader2, AlertCircle, CheckCircle, Link as LinkIcon, Plus, Trash2 } from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";

interface FooterLink {
  href: string;
  label: string;
}

interface SettingsData {
  siteName: string;
  siteEmail: string;
  sitePhone: string;
  siteAddress: string;
  footerCities: string;
  quickLinksTitle: string;
  quickLinks: string;
  accountLinksTitle: string;
  accountLinks: string;
  maintenanceMode: boolean;
  allowRegistration: boolean;
  emailNotifications: boolean;
  smsNotifications: boolean;
  autoApproveListings: boolean;
  maxImagesPerListing: number;
  listingDuration: number;
}

const defaultSettings: SettingsData = {
  siteName: "بيت الجزيرة",
  siteEmail: "info@aqar.sa",
  sitePhone: "920000000",
  siteAddress: "المملكة العربية السعودية",
  footerCities: "الرياض,جدة,مكة المكرمة,المدينة المنورة,الدمام,الخبر,تبوك,أبها",
  quickLinksTitle: "روابط سريعة",
  quickLinks: JSON.stringify([
    { href: "/search", label: "البحث عن عقار" },
    { href: "/listings/new", label: "إضافة إعلان" },
    { href: "/plans", label: "الباقات والأسعار" }
  ]),
  accountLinksTitle: "الحساب",
  accountLinks: JSON.stringify([
    { href: "/login", label: "تسجيل الدخول" },
    { href: "/register", label: "إنشاء حساب" },
    { href: "/complaint", label: "تقديم شكوى" }
  ]),
  maintenanceMode: false,
  allowRegistration: true,
  emailNotifications: true,
  smsNotifications: false,
  autoApproveListings: false,
  maxImagesPerListing: 10,
  listingDuration: 30,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalSettings, setOriginalSettings] = useState<SettingsData>(defaultSettings);
  const [quickLinks, setQuickLinks] = useState<FooterLink[]>([]);
  const [accountLinks, setAccountLinks] = useState<FooterLink[]>([]);
  const [isMaintenanceActive, setIsMaintenanceActive] = useState(false);
  const [togglingMaintenance, setTogglingMaintenance] = useState(false);
  const [siteStatus, setSiteStatus] = useState<'normal' | 'maintenance' | 'coming_soon'>('normal');
  const [changingSiteStatus, setChangingSiteStatus] = useState(false);

  const parseLinks = (jsonString: string): FooterLink[] => {
    try {
      const parsed = JSON.parse(jsonString);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const updateQuickLink = (index: number, field: 'href' | 'label', value: string) => {
    const updated = [...quickLinks];
    updated[index] = { ...updated[index], [field]: value };
    setQuickLinks(updated);
    setSettings({ ...settings, quickLinks: JSON.stringify(updated) });
  };

  const addQuickLink = () => {
    const updated = [...quickLinks, { href: '/', label: '' }];
    setQuickLinks(updated);
    setSettings({ ...settings, quickLinks: JSON.stringify(updated) });
  };

  const removeQuickLink = (index: number) => {
    const updated = quickLinks.filter((_, i) => i !== index);
    setQuickLinks(updated);
    setSettings({ ...settings, quickLinks: JSON.stringify(updated) });
  };

  const updateAccountLink = (index: number, field: 'href' | 'label', value: string) => {
    const updated = [...accountLinks];
    updated[index] = { ...updated[index], [field]: value };
    setAccountLinks(updated);
    setSettings({ ...settings, accountLinks: JSON.stringify(updated) });
  };

  const addAccountLink = () => {
    const updated = [...accountLinks, { href: '/', label: '' }];
    setAccountLinks(updated);
    setSettings({ ...settings, accountLinks: JSON.stringify(updated) });
  };

  const removeAccountLink = (index: number) => {
    const updated = accountLinks.filter((_, i) => i !== index);
    setAccountLinks(updated);
    setSettings({ ...settings, accountLinks: JSON.stringify(updated) });
  };

  const getApiBase = () => API_URL;

  useEffect(() => {
    const initializeSettings = async () => {
      await checkMaintenanceStatus();
      await fetchSettings();
    };
    initializeSettings();
  }, []);

  useEffect(() => {
    const changed = JSON.stringify(settings) !== JSON.stringify(originalSettings);
    setHasChanges(changed);
  }, [settings, originalSettings]);

  const checkMaintenanceStatus = async () => {
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/settings/site-status`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        const status = data.status || 'normal';
        setSiteStatus(status);
        setIsMaintenanceActive(status === 'maintenance');
      }
    } catch (error) {
      console.error("Error checking site status:", error);
    }
  };

  const changeSiteStatus = async (newStatus: 'normal' | 'maintenance' | 'coming_soon') => {
    try {
      setChangingSiteStatus(true);
      setMessage(null);
      
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/settings/site-status`, {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
        body: JSON.stringify({ status: newStatus }),
      });
      
      if (res.ok) {
        setSiteStatus(newStatus);
        setIsMaintenanceActive(newStatus === 'maintenance');
        const statusLabels = {
          normal: 'الموقع مفتوح الآن',
          maintenance: 'تم تفعيل وضع الصيانة',
          coming_soon: 'تم تفعيل صفحة ترقب الافتتاح'
        };
        setMessage({ type: 'success', text: statusLabels[newStatus] });
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.error || 'حدث خطأ في تغيير حالة الموقع' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'حدث خطأ في الاتصال بالخادم' });
    } finally {
      setChangingSiteStatus(false);
    }
  };

  const toggleMaintenanceMode = async () => {
    try {
      setTogglingMaintenance(true);
      setMessage(null);
      
      const statusRes = await fetch(`${getApiBase()}/api/settings/maintenance-status`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      let currentStatus = isMaintenanceActive;
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        currentStatus = statusData.maintenanceMode === true;
      }
      
      const newValue = !currentStatus;
      
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/settings/maintenance-toggle`, {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
        body: JSON.stringify({ maintenanceMode: newValue }),
      });
      
      const data = await res.json();
      
      if (res.ok && data.ok) {
        setIsMaintenanceActive(newValue);
        setSettings(prev => ({ ...prev, maintenanceMode: newValue }));
        setOriginalSettings(prev => ({ ...prev, maintenanceMode: newValue }));
        setMessage({ 
          type: 'success', 
          text: newValue ? 'تم تفعيل وضع الصيانة' : 'تم إيقاف وضع الصيانة - الموقع مفتوح الآن' 
        });
        
        await checkMaintenanceStatus();
      } else {
        setMessage({ type: 'error', text: data.message || 'حدث خطأ في تغيير وضع الصيانة' });
      }
    } catch (error) {
      console.error("Error toggling maintenance:", error);
      setMessage({ type: 'error', text: 'حدث خطأ في الاتصال بالخادم' });
    } finally {
      setTogglingMaintenance(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/settings`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.settings) {
          const mergedSettings = { ...defaultSettings, ...data.settings };
          setSettings(mergedSettings);
          setOriginalSettings(mergedSettings);
          setQuickLinks(parseLinks(mergedSettings.quickLinks || '[]'));
          setAccountLinks(parseLinks(mergedSettings.accountLinks || '[]'));
          setIsMaintenanceActive(mergedSettings.maintenanceMode === true);
        }
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
      setMessage({ type: 'error', text: 'حدث خطأ في جلب الإعدادات' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage(null);
      
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/settings`, {
        method: "PUT",
        headers: getAuthHeaders(),
        credentials: "include",
        body: JSON.stringify(settings),
      });
      
      const data = await res.json();
      
      if (res.ok && data.ok) {
        setMessage({ type: 'success', text: 'تم حفظ الإعدادات بنجاح' });
        setOriginalSettings({ ...settings });
        setHasChanges(false);
      } else {
        setMessage({ type: 'error', text: data.message || 'حدث خطأ في حفظ الإعدادات' });
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      setMessage({ type: 'error', text: 'حدث خطأ في الاتصال بالخادم' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleReset = () => {
    setSettings({ ...originalSettings });
    setHasChanges(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-[#D4AF37] animate-spin mx-auto mb-4" />
          <p className="text-slate-500">جاري تحميل الإعدادات...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#002845]">إعدادات النظام</h1>
          <p className="text-sm text-slate-500 mt-1">تخصيص إعدادات المنصة</p>
        </div>
        <div className="flex items-center gap-3">
          {hasChanges && (
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 transition font-semibold"
            >
              <RefreshCw className="w-4 h-4" />
              إلغاء التغييرات
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition font-semibold ${
              saving
                ? "bg-slate-400 text-white cursor-not-allowed"
                : hasChanges
                ? "bg-[#D4AF37] text-[#002845] hover:bg-[#c9a432]"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                جاري الحفظ...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                حفظ التغييرات
              </>
            )}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`flex items-center gap-3 p-4 rounded-xl ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-green-600" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600" />
          )}
          <span className="font-medium">{message.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Globe className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-bold text-[#002845]">الإعدادات العامة</h2>
              <p className="text-xs text-slate-500">معلومات الموقع الأساسية</p>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">اسم الموقع</label>
              <input
                type="text"
                value={settings.siteName}
                onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                placeholder="أدخل اسم الموقع"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">البريد الإلكتروني</label>
              <input
                type="email"
                value={settings.siteEmail}
                onChange={(e) => setSettings({ ...settings, siteEmail: e.target.value })}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                placeholder="أدخل البريد الإلكتروني"
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">رقم الهاتف</label>
              <input
                type="tel"
                value={settings.sitePhone}
                onChange={(e) => setSettings({ ...settings, sitePhone: e.target.value })}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                placeholder="أدخل رقم الهاتف"
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">عنوان الموقع</label>
              <input
                type="text"
                value={settings.siteAddress}
                onChange={(e) => setSettings({ ...settings, siteAddress: e.target.value })}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                placeholder="مثال: المملكة العربية السعودية"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">مدن الفوتر</label>
              <textarea
                value={settings.footerCities || ''}
                onChange={(e) => setSettings({ ...settings, footerCities: e.target.value })}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37] min-h-[80px]"
                placeholder="أدخل المدن مفصولة بفاصلة (,)"
              />
              <p className="text-xs text-slate-500 mt-1">افصل بين المدن بفاصلة (,)</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
              <LinkIcon className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="font-bold text-[#002845]">روابط الفوتر</h2>
              <p className="text-xs text-slate-500">تخصيص الروابط التي تظهر في أسفل الصفحة</p>
            </div>
          </div>
          <div className="p-4 space-y-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">عنوان قسم الروابط السريعة</label>
                <input
                  type="text"
                  value={settings.quickLinksTitle || ''}
                  onChange={(e) => setSettings({ ...settings, quickLinksTitle: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                  placeholder="مثال: روابط سريعة"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">الروابط السريعة</label>
                {quickLinks.map((link, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={link.label}
                      onChange={(e) => updateQuickLink(index, 'label', e.target.value)}
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D4AF37] text-sm"
                      placeholder="العنوان (مثال: البحث عن عقار)"
                    />
                    <input
                      type="text"
                      value={link.href}
                      onChange={(e) => updateQuickLink(index, 'href', e.target.value)}
                      className="w-40 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D4AF37] text-sm"
                      placeholder="/search"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => removeQuickLink(index)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addQuickLink}
                  className="flex items-center gap-2 text-sm text-[#D4AF37] hover:text-[#002845] transition mt-2"
                >
                  <Plus className="w-4 h-4" />
                  إضافة رابط جديد
                </button>
              </div>
            </div>

            <hr className="border-slate-200" />

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">عنوان قسم الحساب</label>
                <input
                  type="text"
                  value={settings.accountLinksTitle || ''}
                  onChange={(e) => setSettings({ ...settings, accountLinksTitle: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                  placeholder="مثال: الحساب"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">روابط الحساب</label>
                {accountLinks.map((link, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={link.label}
                      onChange={(e) => updateAccountLink(index, 'label', e.target.value)}
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D4AF37] text-sm"
                      placeholder="العنوان (مثال: تسجيل الدخول)"
                    />
                    <input
                      type="text"
                      value={link.href}
                      onChange={(e) => updateAccountLink(index, 'href', e.target.value)}
                      className="w-40 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D4AF37] text-sm"
                      placeholder="/login"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => removeAccountLink(index)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addAccountLink}
                  className="flex items-center gap-2 text-sm text-[#D4AF37] hover:text-[#002845] transition mt-2"
                >
                  <Plus className="w-4 h-4" />
                  إضافة رابط جديد
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
              <Bell className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="font-bold text-[#002845]">الإشعارات</h2>
              <p className="text-xs text-slate-500">إعدادات الإشعارات والتنبيهات</p>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700">إشعارات البريد الإلكتروني</p>
                <p className="text-xs text-slate-500">إرسال تنبيهات عبر البريد</p>
              </div>
              <button
                onClick={() =>
                  setSettings({ ...settings, emailNotifications: !settings.emailNotifications })
                }
                className={`w-12 h-6 rounded-full transition relative ${
                  settings.emailNotifications ? "bg-green-500" : "bg-slate-300"
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-all ${
                    settings.emailNotifications ? "right-0.5" : "right-6"
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700">إشعارات SMS</p>
                <p className="text-xs text-slate-500">إرسال رسائل نصية</p>
              </div>
              <button
                onClick={() =>
                  setSettings({ ...settings, smsNotifications: !settings.smsNotifications })
                }
                className={`w-12 h-6 rounded-full transition relative ${
                  settings.smsNotifications ? "bg-green-500" : "bg-slate-300"
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-all ${
                    settings.smsNotifications ? "right-0.5" : "right-6"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
              <Shield className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h2 className="font-bold text-[#002845]">الأمان</h2>
              <p className="text-xs text-slate-500">إعدادات الأمان والصلاحيات</p>
            </div>
          </div>
          <div className="p-4 space-y-4">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">حالة الموقع</p>
                <p className="text-xs text-slate-500 mb-3">اختر حالة الموقع للزوار</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button
                  onClick={() => changeSiteStatus('normal')}
                  disabled={changingSiteStatus}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    siteStatus === 'normal'
                      ? 'border-green-500 bg-green-50'
                      : 'border-slate-200 hover:border-green-300'
                  } ${changingSiteStatus ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="text-3xl mb-2">🌐</div>
                  <p className="font-bold text-slate-800">موقع مفتوح</p>
                  <p className="text-xs text-slate-500">الموقع يعمل بشكل طبيعي</p>
                  {siteStatus === 'normal' && (
                    <span className="inline-block mt-2 text-xs px-2 py-1 bg-green-500 text-white rounded-full">
                      الحالة الحالية
                    </span>
                  )}
                </button>
                
                <button
                  onClick={() => changeSiteStatus('maintenance')}
                  disabled={changingSiteStatus}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    siteStatus === 'maintenance'
                      ? 'border-amber-500 bg-amber-50'
                      : 'border-slate-200 hover:border-amber-300'
                  } ${changingSiteStatus ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="text-3xl mb-2">🔧</div>
                  <p className="font-bold text-slate-800">وضع الصيانة</p>
                  <p className="text-xs text-slate-500">إغلاق الموقع للصيانة</p>
                  {siteStatus === 'maintenance' && (
                    <span className="inline-block mt-2 text-xs px-2 py-1 bg-amber-500 text-white rounded-full">
                      الحالة الحالية
                    </span>
                  )}
                </button>
                
                <button
                  onClick={() => changeSiteStatus('coming_soon')}
                  disabled={changingSiteStatus}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    siteStatus === 'coming_soon'
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-slate-200 hover:border-purple-300'
                  } ${changingSiteStatus ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="text-3xl mb-2">🎉</div>
                  <p className="font-bold text-slate-800">ترقب الافتتاح</p>
                  <p className="text-xs text-slate-500">صفحة الافتتاح الكبير</p>
                  {siteStatus === 'coming_soon' && (
                    <span className="inline-block mt-2 text-xs px-2 py-1 bg-purple-500 text-white rounded-full">
                      الحالة الحالية
                    </span>
                  )}
                </button>
              </div>
              {changingSiteStatus && (
                <div className="flex items-center justify-center gap-2 text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">جاري تغيير حالة الموقع...</span>
                </div>
              )}
            </div>
            <hr className="border-slate-200" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700">السماح بالتسجيل</p>
                <p className="text-xs text-slate-500">السماح للمستخدمين الجدد</p>
              </div>
              <button
                onClick={() =>
                  setSettings({ ...settings, allowRegistration: !settings.allowRegistration })
                }
                className={`w-12 h-6 rounded-full transition relative ${
                  settings.allowRegistration ? "bg-green-500" : "bg-slate-300"
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-all ${
                    settings.allowRegistration ? "left-0.5" : "left-6"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <p className="font-medium mb-1">ملاحظة مهمة:</p>
        <ul className="list-disc list-inside space-y-1 text-amber-700">
          <li><strong>موقع مفتوح:</strong> الموقع يعمل بشكل طبيعي للجميع</li>
          <li><strong>وضع الصيانة:</strong> يظهر للزوار صفحة "الموقع تحت الصيانة"</li>
          <li><strong>ترقب الافتتاح:</strong> يظهر للزوار صفحة "الافتتاح الكبير قريباً" مع عداد تنازلي</li>
          <li>لوحة الأدمن تبقى تعمل في جميع الحالات</li>
        </ul>
      </div>
    </div>
  );
}
