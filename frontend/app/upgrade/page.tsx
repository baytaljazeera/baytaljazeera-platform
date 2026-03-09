"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";

export const dynamic = 'force-dynamic';

import React, { useEffect, useState, Suspense } from "react";
import { 
  Loader2, CheckCircle2, CreditCard, Building2, ArrowLeft, 
  Crown, Sparkles, Star, Shield, ArrowUpRight, FileText, Mail,
  XCircle, AlertTriangle
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

type Plan = {
  id: number;
  name_ar: string;
  name_en: string;
  price: number;
  duration_days: number;
  max_listings: number;
  max_photos_per_listing: number;
  max_videos_per_listing: number;
  show_on_map: boolean;
  highlights_allowed: number;
  icon: string;
  logo: string;
  color: string;
  badge: string | null;
  sort_order: number;
  custom_icon: string | null;
  badge_enabled: boolean;
  badge_text: string | null;
  badge_position: string;
  badge_shape: string;
  badge_bg_color: string;
  badge_text_color: string;
  badge_font_size: number;
  badge_bg_opacity: number;
  horizontal_badge_enabled: boolean;
  horizontal_badge_text: string | null;
  horizontal_badge_bg_color: string;
  horizontal_badge_text_color: string;
  header_bg_color: string | null;
  header_text_color: string | null;
  header_bg_opacity: number;
  body_bg_color: string | null;
  body_text_color: string | null;
  body_bg_opacity: number;
  features: string[] | null;
  currency?: string;
  currencySymbol?: string;
};

type CurrentPlan = {
  id: number;
  name: string;
  price: number;
};

type UpgradeData = {
  currentPlan: CurrentPlan | null;
  newPlan: Plan & { name: string };
  pricing: {
    total: string;
    currency: string;
    currencySymbol?: string;
  };
};

type PaymentResult = {
  success: boolean;
  message: string;
  payment: {
    id: number;
    transactionId: string;
    amount: string;
    status: string;
  };
  invoice: {
    id: number;
    number: string;
    total: string;
    currency?: string;
    currencySymbol?: string;
  };
  newPlan: {
    id: number;
    name: string;
    endDate: string;
  };
  currency?: string;
  currencySymbol?: string;
  emailSent?: boolean;
  emailTo?: string;
  promotionApplied?: {
    id: number;
    name: string;
    discountAmount: string;
  } | null;
};

function UpgradePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams.get("planId");
  const countryParam = searchParams.get("country");

  const [loading, setLoading] = useState(true);
  const [availableUpgrades, setAvailableUpgrades] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(planId ? parseInt(planId) : null);
  const [upgradeData, setUpgradeData] = useState<UpgradeData | null>(null);
  const [step, setStep] = useState<"select" | "review" | "payment" | "success">("select");
  const [processing, setProcessing] = useState(false);
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(null);
  const [countryCode, setCountryCode] = useState<string>(countryParam || "SA");

  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCvv] = useState("");
  const [cardName, setCardName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"credit_card" | "bank_transfer">("credit_card");
  
  const [errorModal, setErrorModal] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: "",
    message: ""
  });
  
  const showError = (title: string, message: string) => {
    setErrorModal({ open: true, title, message });
  };

  useEffect(() => {
    const detectAndFetch = async () => {
      // Check email verification first
      try {
        const meRes = await fetch(`${API_URL}/api/auth/me`, { credentials: "include", headers: getAuthHeaders() });
        const meData = await meRes.json();
        if (meData.user && !meData.user.emailVerified) {
          router.push(`/verify-email?email=${encodeURIComponent(meData.user.email)}`);
          return;
        }
      } catch (err) {
        console.error("Error checking auth:", err);
      }
      
      if (!countryParam) {
        try {
          const geoRes = await fetch(`${API_URL}/api/geolocation/detect`);
          const geoData = await geoRes.json();
          if (geoData.country?.code) {
            setCountryCode(geoData.country.code);
          }
        } catch (err) {
          console.error("Error detecting location:", err);
        }
      }
      fetchAvailableUpgrades();
    };
    detectAndFetch();
  }, []);

  useEffect(() => {
    if (selectedPlanId && step === "review") {
      fetchUpgradeDetails(selectedPlanId);
    }
  }, [selectedPlanId, step]);

  async function fetchAvailableUpgrades() {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/payments/available-upgrades?country=${countryCode}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      
      if (res.status === 401) {
        router.push("/login");
        return;
      }

      const data = await res.json();
      setAvailableUpgrades(data.availableUpgrades || []);
      
      if (planId && data.availableUpgrades?.length > 0) {
        const targetPlan = data.availableUpgrades.find((p: Plan) => p.id === parseInt(planId));
        if (targetPlan) {
          setSelectedPlanId(targetPlan.id);
          setStep("review");
        }
      }
    } catch (error) {
      console.error("Error fetching upgrades:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchUpgradeDetails(planId: number) {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/payments/initiate-upgrade`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ planId, countryCode }),
      });

      const data = await res.json();
      if (res.ok) {
        setUpgradeData(data.upgrade);
      } else {
        showError("خطأ في الترقية", data.error || "خطأ في جلب تفاصيل الترقية");
        setStep("select");
      }
    } catch (error) {
      console.error("Error fetching upgrade details:", error);
    }
  }

  async function handleFreeActivation() {
    if (!selectedPlanId) return;
    setProcessing(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/payments/process-payment`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          planId: selectedPlanId,
          paymentMethod: "free",
          countryCode,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setPaymentResult(data);
        setStep("success");
      } else {
        showError("خطأ في التفعيل", data.error || "خطأ في تفعيل الباقة");
      }
    } catch (error) {
      console.error("Free activation error:", error);
      showError("خطأ في الاتصال", "حدث خطأ أثناء تفعيل الباقة. يرجى المحاولة مرة أخرى.");
    } finally {
      setProcessing(false);
    }
  }

  async function handlePayment() {
    if (!selectedPlanId) return;
    
    if (paymentMethod === "credit_card") {
      if (!cardNumber || !cardExpiry || !cardCvv || !cardName) {
        showError("بيانات ناقصة", "يرجى ملء جميع بيانات البطاقة");
        return;
      }
    }

    setProcessing(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/payments/process-payment`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          planId: selectedPlanId,
          paymentMethod,
          countryCode,
          cardNumber: cardNumber.replace(/\s/g, ""),
          cardExpiry,
          cardCvv,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setPaymentResult(data);
        setStep("success");
      } else {
        showError("فشل الدفع", data.error || "خطأ في معالجة الدفع");
      }
    } catch (error) {
      console.error("Payment error:", error);
      showError("خطأ في الاتصال", "حدث خطأ أثناء معالجة الدفع. يرجى المحاولة مرة أخرى.");
    } finally {
      setProcessing(false);
    }
  }

  function formatCardNumber(value: string) {
    const v = value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || "";
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    return parts.length ? parts.join(" ") : value;
  }

  function formatExpiry(value: string) {
    const v = value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
    if (v.length >= 2) {
      return v.substring(0, 2) + "/" + v.substring(2, 4);
    }
    return v;
  }

  const getPlanIcon = (plan: Plan) => {
    if (plan.custom_icon) {
      return <img src={plan.custom_icon} alt={plan.name_ar} className="w-12 h-12 object-cover rounded-xl" />;
    }
    if (plan.logo) return <span className="text-4xl">{plan.logo}</span>;
    if (plan.sort_order >= 3) return <Crown className="w-10 h-10" />;
    if (plan.sort_order >= 2) return <Star className="w-10 h-10" />;
    return <Sparkles className="w-10 h-10" />;
  };
  
  const getBadgePositionClass = (position: string, hasHorizontalBadge: boolean) => {
    const topOffset = hasHorizontalBadge ? 'top-12' : 'top-3';
    switch (position) {
      case 'top-left': return `${topOffset} right-20`;
      case 'top-right': return `${topOffset} right-3`;
      case 'bottom-left': return 'bottom-3 right-20';
      case 'bottom-right': return 'bottom-3 right-3';
      default: return `${topOffset} right-20`;
    }
  };
  
  const getBadgeShapeClass = (shape: string) => {
    switch (shape) {
      case 'circle': return 'rounded-full px-3 py-2';
      case 'rectangle': return 'rounded-md px-3 py-1';
      case 'tag': return 'rounded-full px-4 py-1';
      case 'ribbon': return 'rounded-sm px-4 py-1 -rotate-45 origin-top-left';
      default: return 'rounded-full px-3 py-1';
    }
  };
  
  const hexToRgba = (hex: string, opacity: number) => {
    if (!hex) return 'rgba(0,0,0,0)';
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return hex;
    return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${opacity / 100})`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#fef8e6] to-[#f7e8b7] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fef8e6] to-[#f7e8b7]" dir="rtl">
      
      <div className="container mx-auto px-4 py-8 pt-24">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <button 
              onClick={() => {
                if (step === "review") setStep("select");
                else if (step === "payment") setStep("review");
                else router.back();
              }}
              className="p-2 rounded-full bg-white/50 hover:bg-white transition"
            >
              <ArrowLeft className="w-5 h-5 text-[#002845]" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-[#002845]">ترقية الباقة</h1>
              <div className="flex gap-2 mt-2">
                <div className={`h-1 w-16 rounded ${step === "select" || step === "review" || step === "payment" || step === "success" ? "bg-[#D4AF37]" : "bg-gray-300"}`} />
                <div className={`h-1 w-16 rounded ${step === "review" || step === "payment" || step === "success" ? "bg-[#D4AF37]" : "bg-gray-300"}`} />
                <div className={`h-1 w-16 rounded ${step === "payment" || step === "success" ? "bg-[#D4AF37]" : "bg-gray-300"}`} />
                <div className={`h-1 w-16 rounded ${step === "success" ? "bg-[#D4AF37]" : "bg-gray-300"}`} />
              </div>
            </div>
          </div>

          {step === "select" && (
            <div className="bg-white rounded-3xl shadow-xl p-6">
              <h2 className="text-xl font-bold text-[#002845] mb-6">اختر الباقة المطلوبة</h2>
              
              {availableUpgrades.length === 0 ? (
                <div className="text-center py-12">
                  <Crown className="w-16 h-16 text-[#D4AF37] mx-auto mb-4" />
                  <p className="text-lg text-slate-600">أنت على أعلى باقة متاحة!</p>
                  <button 
                    onClick={() => router.push("/")}
                    className="mt-4 px-6 py-2 bg-[#002845] text-white rounded-xl hover:opacity-90"
                  >
                    العودة للرئيسية
                  </button>
                </div>
              ) : (
                <div className="grid gap-4">
                  {availableUpgrades.map((plan) => (
                    <div 
                      key={plan.id}
                      onClick={() => {
                        setSelectedPlanId(plan.id);
                        setStep("review");
                      }}
                      className={`relative p-5 rounded-2xl border-2 cursor-pointer transition-all hover:shadow-lg overflow-hidden ${
                        selectedPlanId === plan.id 
                          ? "border-[#D4AF37]" 
                          : "border-slate-200 hover:border-[#D4AF37]/50"
                      }`}
                      style={{
                        backgroundColor: plan.body_bg_color 
                          ? hexToRgba(plan.body_bg_color, plan.body_bg_opacity || 100)
                          : selectedPlanId === plan.id ? '#fef8e6' : 'white'
                      }}
                    >
                      {plan.badge_enabled && plan.badge_text && (
                        <span 
                          className={`absolute ${getBadgePositionClass(plan.badge_position, !!(plan.horizontal_badge_enabled && plan.horizontal_badge_text))} ${getBadgeShapeClass(plan.badge_shape)} text-xs font-bold z-10`}
                          style={{ 
                            backgroundColor: hexToRgba(plan.badge_bg_color || '#D4AF37', plan.badge_bg_opacity || 100),
                            color: plan.badge_text_color || '#FFFFFF',
                            fontSize: plan.badge_font_size ? `${plan.badge_font_size}px` : '12px'
                          }}>
                          {plan.badge_text}
                        </span>
                      )}
                      
                      {plan.horizontal_badge_enabled && plan.horizontal_badge_text && (
                        <div 
                          className="absolute top-0 left-0 right-0 px-3 py-1 text-center text-sm font-bold"
                          style={{ 
                            backgroundColor: plan.horizontal_badge_bg_color || '#D4AF37',
                            color: plan.horizontal_badge_text_color || '#FFFFFF'
                          }}>
                          {plan.horizontal_badge_text}
                        </div>
                      )}
                      
                      <div className={`flex items-center gap-4 ${plan.horizontal_badge_enabled && plan.horizontal_badge_text ? 'mt-6' : ''}`}>
                        <div 
                          className="w-16 h-16 rounded-2xl flex items-center justify-center text-white shrink-0"
                          style={{ backgroundColor: plan.color || "#002845" }}
                        >
                          {getPlanIcon(plan)}
                        </div>
                        
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-[#002845]">
                            {plan.name_ar}
                          </h3>
                          <div className="flex flex-wrap gap-2 mt-1 text-sm text-[#002845]/80">
                            <span>{plan.max_listings} إعلان</span>
                            <span>•</span>
                            <span>{plan.max_photos_per_listing} صور</span>
                            {plan.show_on_map && <span className="text-green-700 font-medium">• ظهور على الخريطة</span>}
                          </div>
                        </div>
                        
                        <div className="text-left">
                          <div className="text-2xl font-bold text-[#002845]">
                            {plan.price} {plan.currencySymbol || "ريال"}
                          </div>
                          <div className="text-xs text-[#002845]/70">
                            {plan.duration_days} يوم
                          </div>
                        </div>
                        
                        <ArrowUpRight className="w-6 h-6 text-[#002845]" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === "review" && upgradeData && (
            <div className="bg-white rounded-3xl shadow-xl p-6">
              <h2 className="text-xl font-bold text-[#002845] mb-6">مراجعة الترقية</h2>
              
              <div className="grid md:grid-cols-2 gap-6 mb-6">
                {upgradeData.currentPlan && (
                  <div className="p-4 rounded-2xl bg-slate-100 border border-slate-200">
                    <div className="text-sm text-slate-500 mb-2">الباقة الحالية</div>
                    <div className="text-lg font-bold text-[#002845]">{upgradeData.currentPlan.name}</div>
                    <div className="text-slate-600">{upgradeData.currentPlan.price} {upgradeData.pricing.currencySymbol || "ريال"}</div>
                  </div>
                )}
                
                <div className="p-4 rounded-2xl bg-gradient-to-br from-[#D4AF37]/20 to-[#D4AF37]/5 border-2 border-[#D4AF37]">
                  <div className="text-sm text-[#D4AF37] mb-2">الباقة الجديدة</div>
                  <div className="text-lg font-bold text-[#002845]">{upgradeData.newPlan.name}</div>
                  <div className="text-[#D4AF37] font-bold">{upgradeData.newPlan.price} {upgradeData.pricing.currencySymbol || "ريال"}</div>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="font-bold text-[#002845] mb-3">مميزات الباقة الجديدة:</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span>{upgradeData.newPlan.max_listings} إعلانات</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span>{upgradeData.newPlan.max_photos_per_listing} صور لكل إعلان</span>
                  </div>
                  {upgradeData.newPlan.max_videos_per_listing > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span>{upgradeData.newPlan.max_videos_per_listing} فيديو لكل إعلان</span>
                    </div>
                  )}
                  {upgradeData.newPlan.show_on_map && (
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span>ظهور على الخريطة</span>
                    </div>
                  )}
                  {upgradeData.newPlan.highlights_allowed > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span>{upgradeData.newPlan.highlights_allowed} تمييزات</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 mb-6">
                <h3 className="font-bold text-[#002845] mb-3">ملخص الفاتورة</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between font-bold text-lg">
                    <span>الإجمالي</span>
                    <span className="text-[#D4AF37]">{upgradeData.pricing.total} {upgradeData.pricing.currencySymbol || "ريال"}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                {parseFloat(upgradeData.pricing.total) === 0 ? (
                  <button
                    onClick={handleFreeActivation}
                    disabled={processing}
                    className="flex-[2] py-4 bg-gradient-to-l from-[#0B6B4C] to-[#085239] text-white rounded-xl font-bold hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {processing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        جاري التفعيل...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        تفعيل الباقة مجاناً
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => setStep("payment")}
                    className="flex-[2] py-4 bg-gradient-to-l from-[#002845] to-[#01375e] text-white rounded-xl font-bold hover:opacity-90 transition flex items-center justify-center gap-2"
                  >
                    <CreditCard className="w-5 h-5" />
                    المتابعة للدفع
                  </button>
                )}
                <button
                  onClick={() => router.push("/plans")}
                  className="flex-1 py-4 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition flex items-center justify-center gap-2"
                >
                  إلغاء
                  <ArrowLeft className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {step === "payment" && upgradeData && (
            <div className="bg-white rounded-3xl shadow-xl p-6">
              <h2 className="text-xl font-bold text-[#002845] mb-6">معلومات الدفع</h2>
              
              <div className="flex gap-4 mb-6">
                <button
                  onClick={() => setPaymentMethod("credit_card")}
                  className={`flex-1 p-4 rounded-xl border-2 transition ${
                    paymentMethod === "credit_card" 
                      ? "border-[#D4AF37] bg-[#fef8e6]" 
                      : "border-slate-200"
                  }`}
                >
                  <CreditCard className="w-6 h-6 mx-auto mb-2" />
                  <div className="text-sm font-medium">بطاقة ائتمان</div>
                </button>
                <button
                  onClick={() => setPaymentMethod("bank_transfer")}
                  className={`flex-1 p-4 rounded-xl border-2 transition ${
                    paymentMethod === "bank_transfer" 
                      ? "border-[#D4AF37] bg-[#fef8e6]" 
                      : "border-slate-200"
                  }`}
                >
                  <Building2 className="w-6 h-6 mx-auto mb-2" />
                  <div className="text-sm font-medium">تحويل بنكي</div>
                </button>
              </div>

              {paymentMethod === "credit_card" ? (
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">اسم حامل البطاقة</label>
                    <input
                      type="text"
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value)}
                      placeholder="الاسم كما يظهر على البطاقة"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">رقم البطاقة</label>
                    <input
                      type="text"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                      placeholder="0000 0000 0000 0000"
                      maxLength={19}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 outline-none font-mono"
                      dir="ltr"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">تاريخ الانتهاء</label>
                      <input
                        type="text"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                        placeholder="MM/YY"
                        maxLength={5}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 outline-none font-mono"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">CVV</label>
                      <input
                        type="text"
                        value={cardCvv}
                        onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        placeholder="123"
                        maxLength={4}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 outline-none font-mono"
                        dir="ltr"
                      />
                    </div>
                  </div>
                  
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                    <Shield className="w-4 h-4 inline-block ml-1" />
                    هذا وضع تجريبي - استخدم أي بيانات بطاقة للتجربة
                  </div>
                </div>
              ) : (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6">
                  <h4 className="font-bold text-blue-800 mb-2">معلومات التحويل البنكي</h4>
                  <div className="space-y-1 text-sm text-blue-700">
                    <p>البنك: البنك الأهلي السعودي</p>
                    <p>اسم الحساب: شركة بيت الجزيرة</p>
                    <p>رقم الآيبان: SA00 0000 0000 0000 0000 0000</p>
                  </div>
                  <p className="mt-3 text-xs text-blue-600">
                    سيتم تفعيل اشتراكك خلال 24 ساعة من استلام التحويل
                  </p>
                </div>
              )}

              <div className="bg-slate-50 rounded-2xl p-4 mb-6">
                <div className="flex justify-between font-bold text-lg">
                  <span>المبلغ المطلوب</span>
                  <span className="text-[#D4AF37]">{upgradeData.pricing.total} {upgradeData.pricing.currencySymbol || "ريال"}</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handlePayment}
                  disabled={processing}
                  className="flex-[2] py-4 bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-white rounded-xl font-bold hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {processing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      جاري معالجة الدفع...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      تأكيد الدفع
                    </>
                  )}
                </button>
                <button
                  onClick={() => router.push("/plans")}
                  disabled={processing}
                  className="flex-1 py-4 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  إلغاء
                  <ArrowLeft className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {step === "success" && paymentResult && (
            <div className="bg-white rounded-3xl shadow-xl p-8 text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-12 h-12 text-white" />
              </div>
              
              <h2 className="text-2xl font-bold text-[#002845] mb-2">تمت الترقية بنجاح! 🎉</h2>
              <p className="text-slate-600 mb-6">
                تم تفعيل باقة <span className="font-bold text-[#D4AF37]">{paymentResult.newPlan.name}</span> على حسابك
              </p>

              {paymentResult.invoice ? (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-6 text-right">
                  <h3 className="font-bold text-green-800 mb-3 flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    تفاصيل الفاتورة
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-green-700">رقم الفاتورة:</span>
                      <span className="font-mono font-bold">{paymentResult.invoice.number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-green-700">رقم العملية:</span>
                      <span className="font-mono text-xs">{paymentResult.payment.transactionId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-green-700">المبلغ الإجمالي:</span>
                      <span className="font-bold text-[#D4AF37]">{paymentResult.invoice.total} {paymentResult.currencySymbol || upgradeData?.pricing?.currencySymbol || "ريال"}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-6 text-right">
                  <h3 className="font-bold text-green-800 mb-3 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    تفاصيل التفعيل
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-green-700">رقم العملية:</span>
                      <span className="font-mono text-xs">{paymentResult.payment.transactionId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-green-700">الحالة:</span>
                      <span className="font-bold text-green-600">تم التفعيل مجاناً</span>
                    </div>
                  </div>
                </div>
              )}

              {paymentResult.invoice && paymentResult.emailSent && (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6 flex items-center gap-3">
                  <Mail className="w-6 h-6 text-blue-600" />
                  <div className="text-right">
                    <div className="font-bold text-blue-800">تم إرسال الفاتورة</div>
                    <div className="text-sm text-blue-600">{paymentResult.emailTo}</div>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3">
                {paymentResult.invoice && (
                  <button
                    onClick={() => router.push(`/invoices/${paymentResult.invoice.id}`)}
                    className="w-full py-3 bg-gradient-to-l from-[#002845] to-[#01375e] text-white rounded-xl font-bold hover:opacity-90 transition flex items-center justify-center gap-2"
                  >
                    <FileText className="w-5 h-5" />
                    عرض الفاتورة
                  </button>
                )}
                <button
                  onClick={() => router.push("/listings/new")}
                  className="w-full py-3 bg-[#D4AF37] text-white rounded-xl font-bold hover:opacity-90 transition"
                >
                  إضافة إعلان جديد
                </button>
                <button
                  onClick={() => router.push("/")}
                  className="w-full py-3 border-2 border-slate-200 text-slate-600 rounded-xl font-medium hover:bg-slate-50 transition"
                >
                  العودة للرئيسية
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {errorModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 bg-red-50">
              <div className="w-16 h-16 rounded-full bg-red-100 mx-auto mb-4 flex items-center justify-center">
                <XCircle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-[#002845] text-center mb-2">
                {errorModal.title}
              </h3>
              <p className="text-slate-600 text-center text-sm">
                {errorModal.message}
              </p>
            </div>
            <div className="p-4">
              <button
                onClick={() => setErrorModal({ open: false, title: "", message: "" })}
                className="w-full py-3 bg-gradient-to-l from-[#002845] to-[#01375e] text-white rounded-xl font-bold hover:opacity-90 transition"
              >
                حسناً
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function UpgradePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-[#002845] via-[#123a64] to-[#fdf6db] flex items-center justify-center py-12 px-4" dir="rtl">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-[#002845] to-[#123a64] rounded-full flex items-center justify-center shadow-lg">
            <svg className="animate-spin h-10 w-10 text-[#f6d879]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          <p className="text-[#002845]">جاري التحميل...</p>
        </div>
      </div>
    }>
      <UpgradePageContent />
    </Suspense>
  );
}
