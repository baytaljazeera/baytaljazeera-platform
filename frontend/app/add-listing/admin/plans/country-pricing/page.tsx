"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe, Save, RefreshCw, CheckCircle, AlertCircle,
  DollarSign, Edit2, Loader2, Wand2, Zap, Trash2, RotateCcw
} from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";
import { confirmDialog } from "@/components/ui/ConfirmDialog";

// ─── Approximate FX → SAR ──────────────────────────────────────────
// 1 SAR ≈ X (local currency). Used by the quick-fill buttons to
// pre-populate sensible defaults that the operator can then edit.
// Numbers match the seed table in backend/init.js (rates rounded to
// what a customer would actually see, e.g. 49 AED not 49.18). The
// operator always has the final say — these are just defaults.
const FX_PER_SAR: Record<string, number> = {
  SA: 1,        // Saudi Arabia — the reference
  AE: 0.98,     // UAE Dirham
  KW: 0.082,    // Kuwaiti Dinar
  QA: 0.97,     // Qatari Riyal
  BH: 0.10,     // Bahraini Dinar
  OM: 0.103,    // Omani Riyal
  EG: 13.07,    // Egyptian Pound
  LB: 23867,    // Lebanese Pound
  JO: 0.19,     // Jordanian Dinar
  IQ: 349,      // Iraqi Dinar
  YE: 67,       // Yemeni Rial
  SY: 3500,     // Syrian Pound
  MA: 2.66,     // Moroccan Dirham
  TR: 9.0,      // Turkish Lira (volatile — owner can override)
  INT: 0.267,   // International / USD fallback
};

// Round to "natural" customer-facing numbers: under 100 → whole
// integer; 100–1000 → nearest 5; >1000 → nearest 50. Avoids the
// awkward "49.18 AED" look.
function naturalRound(n: number): number {
  if (n === 0) return 0;
  if (n < 100) return Math.round(n);
  if (n < 1000) return Math.round(n / 5) * 5;
  return Math.round(n / 50) * 50;
}

function computeDefaultPrice(planPriceSAR: number, countryCode: string): number {
  const rate = FX_PER_SAR[countryCode];
  if (rate == null) return planPriceSAR; // fallback: same number
  return naturalRound(planPriceSAR * rate);
}

interface Plan {
  id: number;
  name_ar: string;
  price: number;
  sort_order: number;
}

interface Country {
  code: string;
  name_ar: string;
  currency_code: string;
  currency_symbol: string;
}

interface PriceEntry {
  id?: number;
  price: number;
  is_active: boolean;
}

interface PriceMatrix {
  [countryCode: string]: {
    code: string;
    name_ar: string;
    currency_code: string;
    currency_symbol: string;
    prices: {
      [planId: number]: PriceEntry;
    };
  };
}

// Was: const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
// Switched to the shared API_URL helper so empty NEXT_PUBLIC_API_URL
// (which would produce "/api/..." relative URLs that 404 against the
// Vercel host) cant slip through. Same pattern used everywhere else.

const COUNTRY_FLAGS: Record<string, string> = {
  SA: "🇸🇦",
  AE: "🇦🇪",
  QA: "🇶🇦",
  KW: "🇰🇼",
  OM: "🇴🇲",
  BH: "🇧🇭",
  EG: "🇪🇬",
  TR: "🇹🇷",
  LB: "🇱🇧"
};

export default function CountryPricingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [priceMatrix, setPriceMatrix] = useState<PriceMatrix>({});
  const [editedPrices, setEditedPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  // Launch-free-mode master kill-switch. When ON, every plan is forced
  // to price=0 in the API response regardless of base + country prices.
  // The country pricing table below is PRESERVED — flipping back to
  // OFF instantly restores the configured pricing.
  const [launchFreeMode, setLaunchFreeMode] = useState(false);
  const [togglingLaunch, setTogglingLaunch] = useState(false);

  const fetchLaunchMode = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/settings/plans-launch-mode`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setLaunchFreeMode(Boolean(data.enabled));
      }
    } catch {
      /* silent — defaults to off */
    }
  }, []);

  const toggleLaunchMode = async () => {
    const next = !launchFreeMode;
    const ok = await confirmDialog({
      title: next ? "تفعيل وضع الإطلاق المجاني" : "إيقاف وضع الإطلاق المجاني",
      body: next
        ? "سيرى كل العملاء في العالم كل الباقات بسعر 0 فور إعادة تحميل صفحاتهم. أسعار الدول المضبوطة في الجدول أدناه لن تُحذف، وستعود لحظة إيقاف الوضع."
        : "ستعود الأسعار المضبوطة في الجدول أدناه لتظهر لكل العملاء فور إعادة تحميل صفحاتهم.",
      confirmText: next ? "فعّل وضع المجاني" : "أوقف الوضع",
      variant: next ? "warning" : "info",
    });
    if (!ok) return;
    setTogglingLaunch(true);
    try {
      const res = await fetch(`${API_URL}/api/settings/plans-launch-mode`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        if (res.status === 403) throw new Error("يتطلب صلاحية super_admin أو admin_manager");
        throw new Error(`فشل التبديل (HTTP ${res.status})`);
      }
      setLaunchFreeMode(next);
      setMessage({
        type: "success",
        text: next
          ? "تم تفعيل وضع الإطلاق المجاني — كل الباقات تظهر للعملاء بسعر 0 الآن"
          : "تم إيقاف وضع الإطلاق المجاني — عادت الأسعار المضبوطة كما هي",
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "فشل تبديل وضع الإطلاق",
      });
    } finally {
      setTogglingLaunch(false);
    }
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      // Bearer header is mandatory — Safari ITP drops the cross-
      // origin cookie, so credentials:"include" alone returns 401
      // and the user just sees "خطأ في جلب البيانات".
      const res = await fetch(`${API_URL}/api/plans/admin/country-prices`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        // Distinguish auth from server errors so the message is useful.
        if (res.status === 401) throw new Error("غير مصرح — سجّل دخول كـ super_admin أو admin_manager");
        if (res.status === 403) throw new Error("ليس لديك صلاحية لإدارة الباقات (يتطلب super_admin أو admin_manager)");
        throw new Error(`فشل الجلب (HTTP ${res.status})`);
      }

      const data = await res.json();
      setPlans(data.plans || []);
      setCountries(data.countries || []);
      setPriceMatrix(data.price_matrix || {});
      setEditedPrices({});
    } catch (err) {
      console.error("Error fetching data:", err);
      const text = err instanceof Error ? err.message : "خطأ في جلب البيانات";
      setMessage({ type: "error", text });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchLaunchMode();
  }, [fetchData, fetchLaunchMode]);

  const handlePriceChange = (countryCode: string, planId: number, value: string) => {
    const key = `${countryCode}-${planId}`;
    const numValue = parseFloat(value) || 0;
    setEditedPrices(prev => ({ ...prev, [key]: numValue }));
  };

  // Fill ONE cell with the FX-converted default. The cell goes into
  // the editedPrices map so the gold "edited" highlight + save flow
  // pick it up exactly like a manual edit.
  const fillCell = (countryCode: string, plan: Plan) => {
    const key = `${countryCode}-${plan.id}`;
    setEditedPrices((prev) => ({
      ...prev,
      [key]: computeDefaultPrice(Number(plan.price), countryCode),
    }));
  };

  // Fill an entire ROW (one country, all plans) with FX defaults.
  const fillRow = (countryCode: string) => {
    setEditedPrices((prev) => {
      const next = { ...prev };
      plans.forEach((plan) => {
        next[`${countryCode}-${plan.id}`] = computeDefaultPrice(Number(plan.price), countryCode);
      });
      return next;
    });
  };

  // Master fill — every cell in every country (except SA which is
  // the reference). Used by the big "fill all" button at the top so
  // the operator can start from a sensible matrix and tweak from
  // there instead of typing 70 numbers by hand.
  const fillAllCountries = () => {
    const next: Record<string, number> = { ...editedPrices };
    countries.forEach((c) => {
      if (c.code === "SA") return; // SA matches base SAR price; no override needed
      plans.forEach((plan) => {
        next[`${c.code}-${plan.id}`] = computeDefaultPrice(Number(plan.price), c.code);
      });
    });
    setEditedPrices(next);
  };

  const getCurrentPrice = (countryCode: string, planId: number): number => {
    const key = `${countryCode}-${planId}`;
    if (editedPrices[key] !== undefined) {
      return editedPrices[key];
    }
    return priceMatrix[countryCode]?.prices?.[planId]?.price || 0;
  };

  const hasChanges = Object.keys(editedPrices).length > 0;

  const saveAllPrices = async () => {
    if (!hasChanges) return;

    try {
      setSaving(true);
      
      const prices = Object.entries(editedPrices).map(([key, price]) => {
        const [country_code, plan_id] = key.split("-");
        return { country_code, plan_id: parseInt(plan_id), price };
      });

      const res = await fetch(`${API_URL}/api/plans/admin/country-prices/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({ prices })
      });

      if (!res.ok) {
        if (res.status === 401) throw new Error("غير مصرح — انتهت الجلسة، سجّل دخول مرة أخرى");
        if (res.status === 403) throw new Error("ليس لديك صلاحية لتعديل الأسعار (يتطلب super_admin أو admin_manager)");
        throw new Error(`فشل الحفظ (HTTP ${res.status})`);
      }

      const data = await res.json();
      setMessage({ type: "success", text: data.message || "تم حفظ الأسعار بنجاح" });
      fetchData();
    } catch (err) {
      console.error("Error saving:", err);
      const text = err instanceof Error ? err.message : "خطأ في حفظ الأسعار";
      setMessage({ type: "error", text });
    } finally {
      setSaving(false);
    }
  };

  // ─── Reset handlers ─────────────────────────────────────────────
  // Two granularities: wipe ONE country (trash icon on each row) or
  // wipe EVERY country (red button at top). Both call backend
  // endpoints that DELETE the rows then return rowCount. After
  // either, fetchData refreshes the matrix and editedPrices is
  // discarded so the operator starts from a clean slate.
  const [resetting, setResetting] = useState<string | null>(null);
  const resetCountry = async (countryCode: string, countryName: string) => {
    const ok = await confirmDialog({
      title: `تصفير أسعار ${countryName}`,
      body: `سيتم حذف كل overrides أسعار ${countryName}، وسيرى عملاء هذه الدولة الأسعار الأساسية بالريال السعودي بدلاً من السعر المحلي.`,
      confirmText: "صفّر الدولة",
      variant: "warning",
    });
    if (!ok) return;
    setResetting(countryCode);
    try {
      const res = await fetch(`${API_URL}/api/plans/admin/country-prices/clear-country`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ country_code: countryCode }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessage({ type: "success", text: `تم تصفير ${countryName} (${data.cleared} صف محذوف)` });
      setEditedPrices((prev) => {
        const next = { ...prev };
        plans.forEach((p) => { delete next[`${countryCode}-${p.id}`]; });
        return next;
      });
      fetchData();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "فشل التصفير" });
    } finally {
      setResetting(null);
    }
  };
  const resetAllCountries = async () => {
    const ok = await confirmDialog({
      title: "تصفير كل أسعار الدول",
      body: "سيتم حذف جميع overrides الأسعار لكل الدول. سيرى عملاء كل العالم الأسعار الأساسية بالريال السعودي. الأسعار الأساسية في الباقات نفسها لن تُحذف.",
      hint: "إجراء حوكمة عليا — لا يمكن التراجع عنه بضغطة",
      acknowledgeText: "أنا أفهم أن هذا الإجراء سيمسح كل أسعار الدول للأبد",
      confirmText: "صفّر كل الدول",
      variant: "danger",
      doubleConfirm: true,
    });
    if (!ok) return;
    setResetting("__ALL__");
    try {
      const res = await fetch(`${API_URL}/api/plans/admin/country-prices/clear-all`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessage({ type: "success", text: `تم تصفير كل الدول (${data.cleared} صف محذوف)` });
      setEditedPrices({});
      fetchData();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "فشل التصفير الشامل" });
    } finally {
      setResetting(null);
    }
  };

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#002845] to-[#001528] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#D4AF37] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#002845] to-[#001528] p-6" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-[#D4AF37] to-[#B8860B] rounded-xl shadow-lg">
                <Globe className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white">تسعير الباقات حسب الدولة</h1>
                <p className="text-gray-400 text-sm mt-1">حدد أسعار مخصصة لكل دولة بعملتها المحلية</p>
              </div>
            </div>

            <div className="flex gap-3">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={fetchData}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                تحديث
              </motion.button>

              {/* Master quick-fill: populate every country (except SA)
                  with the FX-converted default. Saves typing 70 cells.
                  The result lives in editedPrices so nothing is sent
                  to backend until the operator hits "حفظ التغييرات". */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={fillAllCountries}
                disabled={plans.length === 0 || countries.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-200 rounded-lg transition-colors disabled:opacity-50"
                title="املأ كل الدول بأسعار محوّلة من الريال السعودي (تقديرية، قابلة للتعديل)"
              >
                <Wand2 className="w-4 h-4" />
                تعبئة كل الدول من الريال
              </motion.button>

              {/* Master destructive: clears EVERY country_plan_prices
                  row. Two-step confirm in the handler. Restores all
                  customers worldwide to the base SAR price. */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={resetAllCountries}
                disabled={resetting !== null}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/15 hover:bg-red-500/30 border border-red-500/40 text-red-200 rounded-lg transition-colors disabled:opacity-50"
                title="حذف كل أسعار الدول — جميع العملاء يرون السعر الأساسي بالريال"
              >
                {resetting === "__ALL__" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                تصفير كل الدول
              </motion.button>

              <motion.button
                whileHover={{ scale: hasChanges ? 1.05 : 1 }}
                whileTap={{ scale: hasChanges ? 0.95 : 1 }}
                onClick={saveAllPrices}
                disabled={!hasChanges || saving}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-all ${
                  hasChanges
                    ? "bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white shadow-lg"
                    : "bg-gray-600 text-gray-400 cursor-not-allowed"
                }`}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                حفظ التغييرات
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* ─── MASTER KILL-SWITCH: launch-free-mode ─────────────────
            Single most important control on this page. When ON:
            EVERY plan shows price=0 to EVERY customer worldwide,
            regardless of the matrix below. The matrix values are
            PRESERVED — flipping OFF restores them instantly.
            Visual state changes dramatically by mode so the
            operator never wonders if it's on or off. */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mb-6 rounded-2xl border-2 p-5 transition-colors ${
            launchFreeMode
              ? "bg-gradient-to-br from-emerald-500/15 to-emerald-700/10 border-emerald-400"
              : "bg-white/5 border-white/15"
          }`}
        >
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-[260px]">
              <div className={`p-2.5 rounded-xl ${launchFreeMode ? "bg-emerald-500/30" : "bg-white/10"}`}>
                <Wand2 className={`w-6 h-6 ${launchFreeMode ? "text-emerald-200" : "text-gray-400"}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className={`text-lg font-bold ${launchFreeMode ? "text-emerald-100" : "text-white"}`}>
                    وضع الإطلاق المجاني — مفتاح رئيسي
                  </h3>
                  <span
                    className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                      launchFreeMode
                        ? "bg-emerald-400 text-emerald-950 border-emerald-300"
                        : "bg-slate-700 text-slate-300 border-slate-500"
                    }`}
                  >
                    {launchFreeMode ? "✓ مفعّل الآن" : "✗ معطّل الآن"}
                  </span>
                </div>
                <p className={`text-sm mt-2 leading-relaxed ${launchFreeMode ? "text-emerald-50" : "text-gray-300"}`}>
                  {launchFreeMode
                    ? "كل العملاء يرون كل الباقات بسعر 0 الآن (بغضّ النظر عن الجدول أدناه). الأسعار المضبوطة لم تُحذف — ستعود لحظة إيقاف هذا الوضع."
                    : "إذا فعّلت هذا الوضع، ستعرض كل الباقات بسعر 0 لكل العملاء فوراً. الأسعار المضبوطة في الجدول أدناه ستظل محفوظة، وستعود فور إيقاف الوضع."}
                </p>
              </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={toggleLaunchMode}
              disabled={togglingLaunch}
              className={`shrink-0 self-center flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm shadow-lg transition-all disabled:opacity-60 ${
                launchFreeMode
                  ? "bg-white text-emerald-700 hover:bg-emerald-50"
                  : "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-400 hover:to-emerald-500"
              }`}
            >
              {togglingLaunch ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {launchFreeMode ? "إيقاف وضع المجاني" : "تفعيل وضع المجاني للجميع"}
            </motion.button>
          </div>
        </motion.div>

        <AnimatePresence>
          {message && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${
                message.type === "success"
                  ? "bg-green-500/20 text-green-400 border border-green-500/30"
                  : "bg-red-500/20 text-red-400 border border-red-500/30"
              }`}
            >
              {message.type === "success" ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <AlertCircle className="w-5 h-5" />
              )}
              {message.text}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#D4AF37]/10 border-b border-white/10">
                  <th className="sticky right-0 bg-[#002845] z-10 px-4 py-4 text-right text-sm font-bold text-[#D4AF37] min-w-[150px]">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      الدولة / العملة
                    </div>
                  </th>
                  {plans.map((plan) => (
                    <th key={plan.id} className="px-4 py-4 text-center text-sm font-bold text-white min-w-[120px]">
                      <div className="flex flex-col items-center gap-1">
                        <span>{plan.name_ar}</span>
                        <span className="text-xs text-gray-400 font-normal">
                          (أساسي: {plan.price} ر.س)
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {countries.map((country, idx) => (
                  <motion.tr
                    key={country.code}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className={`border-b border-white/5 hover:bg-white/5 transition-colors ${
                      country.code === "SA" ? "bg-[#D4AF37]/5" : ""
                    }`}
                  >
                    <td className="sticky right-0 bg-[#002845] z-10 px-4 py-4">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{COUNTRY_FLAGS[country.code]}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-white">{country.name_ar}</div>
                          <div className="text-xs text-gray-400">
                            {country.currency_code} ({country.currency_symbol})
                          </div>
                        </div>
                        {country.code === "SA" && (
                          <span className="px-2 py-0.5 bg-[#D4AF37]/20 text-[#D4AF37] text-xs rounded-full">
                            المرجع
                          </span>
                        )}
                        {/* Row-level quick-fill: fills every plan cell
                            in THIS country with its FX default. Hidden
                            for SA because SA matches base SAR price. */}
                        {country.code !== "SA" && FX_PER_SAR[country.code] != null && (
                          <button
                            type="button"
                            onClick={() => fillRow(country.code)}
                            className="shrink-0 w-7 h-7 rounded-md bg-purple-500/15 hover:bg-purple-500/30 border border-purple-500/30 text-purple-200 flex items-center justify-center transition"
                            title={`املأ كل الباقات لـ ${country.name_ar} بأسعار محوّلة من الريال (×${FX_PER_SAR[country.code]})`}
                          >
                            <Wand2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {/* Per-country reset: trash icon clears every
                            stored override for this country. Visible
                            on every row including SA so the operator
                            can quickly wipe the leftover SA zeros
                            without having to find the master button. */}
                        <button
                          type="button"
                          onClick={() => resetCountry(country.code, country.name_ar)}
                          disabled={resetting === country.code}
                          className="shrink-0 w-7 h-7 rounded-md bg-red-500/10 hover:bg-red-500/30 border border-red-500/30 text-red-300 flex items-center justify-center transition disabled:opacity-50"
                          title={`تصفير أسعار ${country.name_ar} — حذف كل الـ overrides لهذه الدولة`}
                        >
                          {resetting === country.code ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                    {plans.map((plan) => {
                      const key = `${country.code}-${plan.id}`;
                      const hasEdit = editedPrices[key] !== undefined;
                      const currentPrice = getCurrentPrice(country.code, plan.id);
                      const originalPrice = priceMatrix[country.code]?.prices?.[plan.id]?.price;
                      
                      const suggested = computeDefaultPrice(Number(plan.price), country.code);
                      const showCellWand = country.code !== "SA" && FX_PER_SAR[country.code] != null;
                      return (
                        <td key={plan.id} className="px-4 py-4 text-center">
                          <div className="relative">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={currentPrice || ""}
                              onChange={(e) => handlePriceChange(country.code, plan.id, e.target.value)}
                              placeholder={country.code === "SA" ? String(plan.price) : String(suggested)}
                              className={`w-full max-w-[100px] mx-auto px-3 py-2 text-center rounded-lg border transition-all focus:outline-none focus:ring-2 focus:ring-[#D4AF37] ${
                                hasEdit
                                  ? "bg-[#D4AF37]/20 border-[#D4AF37] text-white"
                                  : originalPrice
                                    ? "bg-white/10 border-white/20 text-white"
                                    : "bg-white/5 border-white/10 text-gray-400"
                              }`}
                            />
                            {hasEdit && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="absolute -top-1 -left-1"
                              >
                                <Edit2 className="w-3 h-3 text-[#D4AF37]" />
                              </motion.div>
                            )}
                            {/* Cell-level quick-fill: bolt icon, sets
                                THIS cell to the FX default. Shown only
                                on non-SA cells with a known rate. */}
                            {showCellWand && (
                              <button
                                type="button"
                                onClick={() => fillCell(country.code, plan)}
                                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-purple-500/30 hover:bg-purple-500 border border-purple-400/50 text-white flex items-center justify-center transition opacity-60 hover:opacity-100"
                                title={`املأ بـ ${suggested} ${country.currency_symbol} (محوّل من ${plan.price} ر.س)`}
                              >
                                <Zap className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {country.currency_symbol}
                          </div>
                        </td>
                      );
                    })}
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl"
        >
          <div className="flex items-start gap-3">
            <DollarSign className="w-5 h-5 text-blue-400 mt-0.5" />
            <div className="text-sm text-blue-300">
              <strong>ملاحظة:</strong> الأسعار التي تدخلها هنا ستظهر للعملاء عند اختيار دولتهم. 
              إذا لم يتم تحديد سعر لدولة معينة، سيتم استخدام السعر الأساسي بالريال السعودي.
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
