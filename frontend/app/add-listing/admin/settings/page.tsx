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
  invoiceSystemEnabled: boolean;
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
  invoiceSystemEnabled: false,
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

  // Pricing/billing connections — pulled from /api/plans/free-pricing-
  // diagnostic. Surfaces the relationship between this page's invoice
  // toggle and the live state of plan pricing, so the operator can see
  // at a glance whether "invoices off but customers see مجاناً" is a
  // contradiction (it isn't — free plans don't generate invoices).
  interface BillingDiagnostic {
    master_switch: { enabled: boolean };
    free_promotions: Array<{ id: number; name_ar?: string; promotion_type: string; discount_value?: number }>;
    zero_country_prices: { by_country: Record<string, { country_name_ar: string; zero_count: number }> };
    any_active: boolean;
  }
  const [billingDiag, setBillingDiag] = useState<BillingDiagnostic | null>(null);

  // Invoice diagnostic — what the new /admin/invoice-diagnostic
  // endpoint returns. Surfaces orphan payments (completed > 0 with
  // no invoice) so the owner can one-click backfill instead of
  // hunting through Render logs.
  interface InvoiceRecentRow {
    payment_id: number;
    created_at: string;
    user: { id: string; name: string; email: string };
    plan: string | null;
    amount: string;
    currency: string;
    status: string;
    transaction_id: string;
    invoice: { id: number; number: string; total: string } | null;
    reason_no_invoice: string | null;
  }
  interface InvoiceDiagnostic {
    invoice_system_enabled: boolean;
    stats: { total_payments: number; completed: number; completed_paid: number; total_invoices: number };
    orphans_in_recent: number;
    recent_payments: InvoiceRecentRow[];
  }
  const [invDiag, setInvDiag] = useState<InvoiceDiagnostic | null>(null);
  const [invDiagLoading, setInvDiagLoading] = useState(false);
  const [backfillingId, setBackfillingId] = useState<number | null>(null);

  const fetchInvoiceDiagnostic = async () => {
    setInvDiagLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/payments/admin/invoice-diagnostic`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (r.ok) setInvDiag(await r.json());
    } catch { /* silent */ }
    finally { setInvDiagLoading(false); }
  };

  const backfillInvoice = async (paymentId: number) => {
    setBackfillingId(paymentId);
    try {
      const r = await fetch(`${API_URL}/api/payments/admin/backfill-invoice/${paymentId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setMessage({ type: "success", text: data.message || "تم إنشاء الفاتورة" });
      await fetchInvoiceDiagnostic();
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "فشل" });
    } finally { setBackfillingId(null); }
  };

  useEffect(() => {
    let alive = true;
    fetch(`${API_URL}/api/plans/free-pricing-diagnostic`, {
      credentials: "include",
      headers: getAuthHeaders(),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (alive) setBillingDiag(d); })
      .catch(() => { /* silent */ });
    if (alive) fetchInvoiceDiagnostic();
    return () => { alive = false; };
  }, []);

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
            <hr className="border-slate-200" />
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-slate-700">نظام الفواتير</p>
                  {/* Explicit status pill — no more guessing from a color */}
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                      settings.invoiceSystemEnabled
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    {settings.invoiceSystemEnabled ? "✓ مفعّل الآن" : "✗ معطّل الآن"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  عند التفعيل، تُنشأ فاتورة تلقائياً لكل عملية دفع (لا تشمل الباقات المجانية).
                </p>
                {!settings.invoiceSystemEnabled && (
                  <p className="text-[11px] text-amber-700 mt-2 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                    <strong>قبل التفعيل:</strong> تأكّد من تسجيل الشركة (سجل تجاري + الرقم الضريبي) وربط بوابة الدفع، وإلا ستُنشأ فواتير بدون كيان قانوني يدعمها.
                  </p>
                )}
                {settings.invoiceSystemEnabled && (
                  <p className="text-[11px] text-emerald-700 mt-2 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                    <strong>الآن:</strong> كل دفعة جديدة بقيمة &gt; 0 ستُولّد فاتورة في صفحة الفواتير تلقائياً.
                  </p>
                )}
              </div>
              <button
                onClick={() =>
                  setSettings({ ...settings, invoiceSystemEnabled: !settings.invoiceSystemEnabled })
                }
                className={`shrink-0 mt-0.5 w-12 h-6 rounded-full transition relative ${
                  settings.invoiceSystemEnabled ? "bg-green-500" : "bg-slate-300"
                }`}
                title={settings.invoiceSystemEnabled ? "اضغط للتعطيل" : "اضغط للتفعيل"}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-all ${
                    settings.invoiceSystemEnabled ? "left-0.5" : "left-6"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* ─── Pricing × Billing relationship panel ───────────────────
          The owner kept finding "invoices off" + "customers see مجاناً"
          and assumed they contradicted. They don't — invoices are
          per-payment, free plans never trigger payment. This panel
          spells out the relationship + lists every active free-
          pricing source so it's obvious why no invoices are firing
          even when the toggle is OFF. Links to the deactivation
          controls on the plans page so the operator doesn't have
          to navigate manually. */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-lg bg-blue-50">
            <LinkIcon className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#002845]">العلاقة بين الفواتير والأسعار</h3>
            <p className="text-xs text-slate-500 mt-0.5">كيف يتفاعل مفتاح الفواتير مع حالة الباقات الفعلية</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div className={`rounded-lg p-3 border ${settings.invoiceSystemEnabled ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
            <div className="text-xs font-bold text-slate-700 mb-1">١) نظام الفواتير</div>
            <div className={`text-sm font-bold ${settings.invoiceSystemEnabled ? "text-emerald-700" : "text-slate-500"}`}>
              {settings.invoiceSystemEnabled ? "✓ مفعّل" : "✗ معطّل"}
            </div>
            <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
              يُنشئ فاتورة لكل دفعة فعلية. <strong>لا يعمل على الباقات المجانية</strong> لأنه لا توجد دفعة من الأصل.
            </p>
          </div>
          <div className={`rounded-lg p-3 border ${billingDiag?.any_active ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
            <div className="text-xs font-bold text-slate-700 mb-1">٢) حالة عرض الباقات للعملاء</div>
            <div className={`text-sm font-bold ${billingDiag?.any_active ? "text-amber-700" : "text-emerald-700"}`}>
              {billingDiag?.any_active ? "🎁 تُعرض مجاناً" : "💳 تُعرض بأسعارها"}
            </div>
            <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
              {billingDiag?.any_active
                ? <>هذي الحالة تأتي من مصادر منفصلة عن مفتاح الفواتير. الفواتير لا تُولَّد لأن لا توجد دفعة.</>
                : <>كل باقة مدفوعة تُعرض بسعرها. عند الدفع، يُنشأ {settings.invoiceSystemEnabled ? "فاتورة تلقائياً" : "إيصال بدون فاتورة (لأن المفتاح معطّل)"}.</>}
            </p>
          </div>
        </div>

        {/* List every active free-pricing source */}
        {billingDiag?.any_active && (
          <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-3 space-y-2">
            <div className="text-xs font-bold text-amber-900">
              لماذا تُعرض الباقات مجاناً الآن؟ (المصادر الفعّالة)
            </div>
            <ul className="text-[12px] text-amber-800 space-y-1.5">
              {billingDiag.master_switch.enabled && (
                <li>🔑 <strong>المفتاح الرئيسي للإطلاق المجاني</strong> — مفعّل</li>
              )}
              {billingDiag.free_promotions.map((p) => (
                <li key={p.id}>
                  🎁 <strong>عرض ترويجي:</strong> {p.name_ar || `#${p.id}`}
                  {p.discount_value ? ` — خصم ${p.discount_value}%` : ""} ({p.promotion_type})
                </li>
              ))}
              {Object.entries(billingDiag.zero_country_prices.by_country).map(([code, info]) => (
                <li key={code}>
                  🌍 <strong>أسعار {info.country_name_ar}</strong> — {info.zero_count} باقة بسعر 0
                </li>
              ))}
            </ul>
            <a
              href="/add-listing/admin/plans"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-900 underline hover:text-amber-700 mt-1"
            >
              ← افتح لوحة إدارة الباقات لإيقاف هذه المصادر
            </a>
          </div>
        )}

        {/* The "no conflict" reassurance the owner needs */}
        <div className="mt-3 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2.5 leading-relaxed">
          <strong>لا تضارب:</strong> مفتاح الفواتير + حالة عرض الباقات نظامان منفصلان. الفواتير تعتمد على وجود <strong>دفعة فعلية</strong>. لو الباقات مجانية، لن تُنشأ فواتير حتى لو فعّلت المفتاح — وهذا السلوك الصحيح.
        </div>
      </div>

      {/* ─── Invoice diagnostic panel ──────────────────────────────
          Shows recent payments and which ones have/dont have invoices.
          Orphans (completed paid payment with no invoice) get a
          one-click "إنشاء فاتورة" button. Built after the operator
          ran a paid test and saw no invoice — without this panel
          they had no way to know if the issue was data, gating,
          or a silent error. */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-emerald-50">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-[#002845]">تشخيص الفواتير</h3>
              <p className="text-xs text-slate-500 mt-0.5">آخر 50 دفعة + قابلية إنشاء فواتير متأخرة</p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchInvoiceDiagnostic}
            disabled={invDiagLoading}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition disabled:opacity-60"
          >
            {invDiagLoading ? "..." : "تحديث"}
          </button>
        </div>

        {invDiag && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
                <div className="text-[10px] text-slate-500">المفتاح</div>
                <div className={`text-sm font-bold ${invDiag.invoice_system_enabled ? "text-emerald-700" : "text-slate-500"}`}>
                  {invDiag.invoice_system_enabled ? "✓ مفعّل" : "✗ معطّل"}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
                <div className="text-[10px] text-slate-500">دفعات ناجحة (مدفوعة)</div>
                <div className="text-sm font-bold text-[#002845]">{invDiag.stats.completed_paid}</div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
                <div className="text-[10px] text-slate-500">إجمالي الفواتير</div>
                <div className="text-sm font-bold text-[#002845]">{invDiag.stats.total_invoices}</div>
              </div>
              <div className={`rounded-lg border p-2.5 ${invDiag.orphans_in_recent > 0 ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
                <div className="text-[10px] text-slate-600">يتيمة بلا فاتورة (آخر 50)</div>
                <div className={`text-sm font-bold ${invDiag.orphans_in_recent > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                  {invDiag.orphans_in_recent}
                </div>
              </div>
            </div>

            {/* Recent payments table */}
            {invDiag.recent_payments.length === 0 ? (
              <div className="text-center text-sm text-slate-500 py-6 bg-slate-50 rounded-lg">
                لا توجد أي دفعات بعد. عند أول دفعة حقيقية، ستظهر هنا.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-[11px]">
                    <tr>
                      <th className="px-2 py-2 text-right">#</th>
                      <th className="px-2 py-2 text-right">العميل</th>
                      <th className="px-2 py-2 text-right">الباقة</th>
                      <th className="px-2 py-2 text-right">المبلغ</th>
                      <th className="px-2 py-2 text-right">الحالة</th>
                      <th className="px-2 py-2 text-right">الفاتورة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invDiag.recent_payments.slice(0, 15).map((row) => {
                      const isOrphan = row.status === "completed" && Number(row.amount) > 0 && !row.invoice;
                      return (
                        <tr key={row.payment_id} className={`border-t border-slate-100 ${isOrphan ? "bg-amber-50" : ""}`}>
                          <td className="px-2 py-2 text-[11px] text-slate-500">{row.payment_id}</td>
                          <td className="px-2 py-2 text-[12px]">
                            <div className="font-medium text-[#002845]">{row.user.name || "—"}</div>
                            <div className="text-[10px] text-slate-500">{row.user.email}</div>
                          </td>
                          <td className="px-2 py-2 text-[12px] text-slate-700">{row.plan || "—"}</td>
                          <td className="px-2 py-2 text-[12px] font-bold whitespace-nowrap">
                            {row.amount} {row.currency}
                          </td>
                          <td className="px-2 py-2 text-[11px]">
                            <span className={`px-1.5 py-0.5 rounded-full font-bold ${
                              row.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                              row.status === "pending" ? "bg-amber-100 text-amber-700" :
                              "bg-slate-100 text-slate-700"
                            }`}>{row.status}</span>
                          </td>
                          <td className="px-2 py-2 text-[11px]">
                            {row.invoice ? (
                              <span className="text-emerald-700 font-bold">✓ {row.invoice.number}</span>
                            ) : (
                              <div className="flex items-start gap-2">
                                <div className="text-amber-700">{row.reason_no_invoice}</div>
                                {isOrphan && (
                                  <button
                                    type="button"
                                    onClick={() => backfillInvoice(row.payment_id)}
                                    disabled={backfillingId === row.payment_id}
                                    className="shrink-0 px-2 py-1 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded disabled:opacity-60"
                                  >
                                    {backfillingId === row.payment_id ? "..." : "إنشاء فاتورة"}
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-3 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2.5 leading-relaxed">
              <strong>أسباب شائعة لعدم إنشاء فاتورة:</strong> ١) المفتاح كان معطّلاً وقت الدفع — يمكن إنشاؤها لاحقاً بزر "إنشاء فاتورة". ٢) مبلغ الدفعة = 0 (باقة مجانية أو عرض 100%) — السلوك الصحيح، لا فاتورة تُنشأ. ٣) الدفعة لم تكتمل بعد.
            </div>
          </>
        )}
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
