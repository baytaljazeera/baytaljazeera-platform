"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe, Save, RefreshCw, CheckCircle, AlertCircle,
  DollarSign, Edit2, Loader2, Wand2, Zap
} from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";

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
  }, [fetchData]);

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
