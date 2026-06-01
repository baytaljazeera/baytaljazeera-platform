"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";

export const dynamic = "force-dynamic";

import React, { useEffect, useState } from "react";
import { Loader2, CheckCircle2, Crown, ArrowLeft, Info, Globe, Gift, Users, Sparkles, Star, Building2, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  PLAN_COLORS,
  type PlanCopy,
  type DBPlan,
  PlanCard,
  mapDbPlanToPlanCopy,
} from "@/components/plans/PlanCard";
import { usePromotionStore } from "@/lib/promotionStore";

type Country = {
  code: string;
  name_ar: string;
  currency_code: string;
  currency_symbol: string;
};

const COUNTRY_FLAGS: Record<string, string> = {
  SA: "🇸🇦",
  AE: "🇦🇪",
  QA: "🇶🇦",
  KW: "🇰🇼",
  OM: "🇴🇲",
  BH: "🇧🇭",
  EG: "🇪🇬",
  TR: "🇹🇷",
  LB: "🇱🇧",
  INT: "🌍"
};

type InfoModalProps = {
  message: string;
  onClose: () => void;
};

function InfoModal({ message, onClose }: InfoModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#002845]/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-white/95 backdrop-blur-md p-6 shadow-2xl border border-blue-200" dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8]">
            <Info className="h-10 w-10 text-white" />
          </div>
          <h2 className="mb-3 text-2xl font-bold text-[#002845]">تنبيه</h2>
          <p className="text-lg text-slate-600 leading-relaxed">{message}</p>
        </div>

        <div className="text-center">
          <p className="mb-4 text-sm text-slate-500">
            يمكنك الترقية لباقة أعلى من صفحة الترقية
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-gradient-to-l from-[#002845] to-[#1a3a5c] px-4 py-3 font-semibold text-white transition hover:opacity-90"
          >
            حسناً
          </button>
          <button
            onClick={() => window.location.href = '/upgrade'}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-[#D4AF37] to-[#B8860B] px-4 py-3 font-semibold text-white transition hover:opacity-90"
          >
            صفحة الترقية
          </button>
        </div>
      </div>
    </div>
  );
}

type SubscriptionModalProps = {
  plan: PlanCopy;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
};

function SubscriptionModal({ plan, onClose, onConfirm, isLoading }: SubscriptionModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#002845]/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-white/95 backdrop-blur-md p-6 shadow-2xl border border-[#D4AF37]/20" dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#D4AF37] to-[#B8860B]">
            <Crown className="h-10 w-10 text-white" />
          </div>
          <h2 className="mb-2 text-2xl font-bold text-[#002845]">تأكيد الاشتراك</h2>
          <p className="text-slate-600">
            هل تريد الاشتراك في باقة <span className="font-bold text-[#D4AF37]">{plan.displayName}</span>؟
          </p>
        </div>

        <div className="mb-6 rounded-2xl bg-gradient-to-l from-[#002845]/5 to-[#D4AF37]/10 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-slate-600">الباقة:</span>
            <span className="font-bold text-[#002845]">{plan.displayName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600">السعر:</span>
            <div className="text-left">
              {plan.discountedPrice !== null && plan.discountedPrice !== undefined ? (
                <div className="flex flex-col items-end gap-1">
                  <span className="text-sm text-slate-400 line-through">
                    {plan.originalPrice} {plan.currencySymbol || "ريال"}
                  </span>
                  <span className="text-xl font-bold text-green-600">
                    {plan.discountedPrice === 0 ? "مجاني" : `${plan.discountedPrice} ${plan.currencySymbol || "ريال"}`}
                  </span>
                  {plan.discountPercentage && (
                    <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">
                      خصم {plan.discountPercentage}%
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-xl font-bold text-[#D4AF37]">
                  {plan.price === 0 ? "مجاني" : `${plan.price} ${plan.currencySymbol || "ريال"}`}
                </span>
              )}
            </div>
          </div>
        </div>

        {plan.price > 0 && !plan.isAutoConverted && (
          <p className="mb-4 text-center text-sm text-slate-500">
            سيتم تحويلك لصفحة الدفع الآمنة لإتمام عملية الاشتراك
          </p>
        )}

        {plan.isAutoConverted && plan.price > 0 && (
          <div className="mb-4 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 p-3 text-center text-xs font-bold leading-relaxed text-amber-900">
            ⏳ أسعار هذه الدولة قيد المراجعة من قبل الإدارة. سيتم تفعيل الشراء فور اعتماد السعر النهائي.
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 rounded-xl border-2 border-slate-200 px-4 py-3 font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            إلغاء
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading || (plan.isAutoConverted && plan.price > 0)}
            title={plan.isAutoConverted && plan.price > 0 ? "أسعار هذه الدولة قيد المراجعة" : ""}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-[#D4AF37] to-[#B8860B] px-4 py-3 font-semibold text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5" />
                {plan.isAutoConverted && plan.price > 0 ? "غير متاحة حالياً" : "تأكيد الاشتراك"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

type SuccessModalProps = {
  plan: PlanCopy;
  onGoToListings: () => void;
  onStayHere: () => void;
};

function SuccessModal({ plan, onGoToListings, onStayHere }: SuccessModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#002845]/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl bg-white/95 backdrop-blur-md p-6 shadow-2xl border border-green-200" dir="rtl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-green-600">
            <CheckCircle2 className="h-12 w-12 text-white" />
          </div>
          <h2 className="mb-2 text-2xl font-bold text-[#002845]">تم الاشتراك بنجاح!</h2>
          <p className="text-slate-600">
            تم تفعيل باقة <span className="font-bold text-[#D4AF37]">{plan.displayName}</span> على حسابك.
          </p>
        </div>

        <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-4">
          <p className="text-center text-sm text-green-700">
            يمكنك الآن إضافة إعلاناتك والاستفادة من جميع مميزات الباقة.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={onGoToListings}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-[#002845] to-[#01375e] px-4 py-3 font-semibold text-white transition hover:opacity-90"
          >
            <ArrowLeft className="h-5 w-5" />
            إضافة إعلان جديد
          </button>
          <button
            onClick={onStayHere}
            className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            البقاء في صفحة الباقات
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PlansPage() {
  const router = useRouter();
  const { hasBannerVisible } = usePromotionStore();
  const [plans, setPlans] = useState<PlanCopy[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<PlanCopy | null>(null);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [subscribedPlan, setSubscribedPlan] = useState<PlanCopy | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [detectedCountry, setDetectedCountry] = useState<Country | null>(null);
  const [currentCurrency, setCurrentCurrency] = useState({ code: "SAR", symbol: "ر.س" });

  useEffect(() => {
    const detectLocation = async () => {
      try {
        const geoRes = await fetch(`${API_URL}/api/geolocation/detect`);
        const geoData = await geoRes.json();
        if (geoData.country) {
          setDetectedCountry(geoData.country);
        }
      } catch (err) {
        console.error("Error detecting location:", err);
      }
    };
    detectLocation();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!detectedCountry) return;
      
      try {
        setLoading(true);
        const plansRes = await fetch(`/api/plans/by-country/${detectedCountry.code}`);
        const plansData = await plansRes.json();

        const currencySymbol = plansData.country?.currency_symbol || detectedCountry.currency_symbol || "ريال";
        if (plansData.country) {
          setCurrentCurrency({
            code: plansData.country.currency_code,
            symbol: currencySymbol
          });
        }

        // Carry through per-plan local_price, local_currency_symbol, and
        // is_auto_converted. Setting dbPlan.price = local_price lets the
        // headline / modal display the country-specific figure (the bug
        // we just fixed: /plans showed SAR base while /upgrade showed
        // auto-converted USD).
        const dbPlans: any[] = (plansData.plans || []).map((p: any) => ({
          ...p,
          price: p.local_price ?? p.price,
          is_auto_converted: p.is_auto_converted === true,
        }));

        const visibleSorted = dbPlans
          .filter((p) => p.visible)
          .sort((a, b) => a.sort_order - b.sort_order);

        setPlans(visibleSorted.map((p) =>
          mapDbPlanToPlanCopy(p as DBPlan, p.local_currency_symbol || currencySymbol)
        ));
      } catch (err) {
        console.error("Error fetching data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [detectedCountry]);

  const handleConfirmSubscription = async () => {
    if (!selectedPlan) return;
    
    setIsSubscribing(true);

    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

      const res = await fetch(`${API_URL}/api/plans/subscribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ planId: selectedPlan.id, countryCode: detectedCountry?.code || "SA" }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          toast.warning("يجب تسجيل الدخول أولاً");
          router.push("/login");
          return;
        }
        if (res.status === 403 && data.requiresVerification) {
          toast.warning("يجب تأكيد بريدك الإلكتروني أولاً");
          router.push(`/verify-email?email=${encodeURIComponent(data.email || "")}`);
          return;
        }
        setInfoMessage(data.error || "حدث خطأ أثناء الاشتراك");
        setSelectedPlan(null);
        return;
      }

      // إذا كان الـ Backend يطلب الدفع، توجيه لصفحة الدفع مع العملة المكتشفة
      if (data.requiresPayment) {
        setSelectedPlan(null);
        router.push(`/upgrade?planId=${selectedPlan.id}&country=${detectedCountry?.code || "SA"}`);
        return;
      }

      // الاشتراك تم بنجاح (مجاني أو بعرض ترويجي)
      if (data.ok) {
        setSubscribedPlan(selectedPlan);
        setSelectedPlan(null);
        setShowSuccess(true);
      }
    } catch (err: any) {
      console.error("Subscription error:", err);
      toast.error(err.message || "حدث خطأ أثناء الاشتراك");
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleGoToListings = () => {
    router.push("/listings/new");
  };

  const handleStayHere = () => {
    setShowSuccess(false);
    setSubscribedPlan(null);
  };

  const pageBgStyle = {
    background: "radial-gradient(circle at top center, #fef8e6, #f7e8b7, #eadda4)",
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={pageBgStyle}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: PLAN_COLORS.goldText }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-3 sm:px-4 py-10 sm:py-16 md:px-8" style={pageBgStyle} dir="rtl">
      <motion.div 
        className="mx-auto mb-10 sm:mb-16 max-w-3xl text-center px-2"
        animate={{ 
          marginTop: hasBannerVisible ? 120 : 0,
        }}
        transition={{ 
          type: "spring", 
          stiffness: 300, 
          damping: 30,
          duration: 0.4 
        }}
      >
        <h1 className="mb-3 sm:mb-4 text-2xl sm:text-4xl font-extrabold text-[#002845] drop-shadow-sm md:text-6xl">
          الباقات والأسعار
        </h1>
        <p className="text-sm sm:text-lg font-semibold text-[#002845]/80 md:text-xl mb-6">
          اختر الباقة المناسبة لطبيعة استخدامك، ويمكنك الترقية في أي وقت.
        </p>
        
        {detectedCountry && (
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm rounded-xl border border-[#D4AF37]/30 shadow-md">
            <Globe className="w-4 h-4 text-[#D4AF37]" />
            <span className="text-2xl">{COUNTRY_FLAGS[detectedCountry.code] || "🌍"}</span>
            <span className="font-medium text-[#002845]">{detectedCountry.name_ar}</span>
            <span className="text-sm text-gray-500">({currentCurrency.symbol})</span>
          </div>
        )}
      </motion.div>

      <div className="mx-auto grid max-w-[90rem] grid-cols-1 items-stretch justify-items-center gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-5">
        {plans.length === 0 ? (
          <div className="col-span-full text-center text-lg text-gray-500">
            لا توجد باقات متاحة حالياً
          </div>
        ) : (
          plans.map((plan) => (
            <div key={plan.id} className="w-full max-w-xs">
              <PlanCard plan={plan} onSelect={setSelectedPlan} />
            </div>
          ))
        )}
      </div>

      {/* قسم المميزات والبرامج */}
      <div className="mx-auto max-w-6xl mt-16 sm:mt-20 px-4">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-[#002845] mb-3">
            🎁 مزايا حصرية لك
          </h2>
          <p className="text-slate-600 text-sm sm:text-base">
            استفد من باقاتنا المتنوعة وبرامجنا الخاصة
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* بطاقة الباقة المجانية */}
          <motion.div
            whileHover={{ y: -5, scale: 1.02 }}
            className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-3xl p-6 border border-green-200 shadow-lg hover:shadow-xl transition-all"
          >
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center mb-4 shadow-md">
              <Gift className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-xl font-bold text-[#002845] mb-2">ابدأ مجاناً</h3>
            <p className="text-slate-600 text-sm mb-4 leading-relaxed">
              جرّب المنصة مع باقة الأساس المجانية. أعلن عن عقارك الأول بدون أي تكلفة واستمتع بتجربة كاملة.
            </p>
            <div className="flex items-center gap-2 text-green-600 font-medium text-sm">
              <Sparkles className="w-4 h-4" />
              <span>إعلان مجاني لمدة شهر</span>
            </div>
          </motion.div>

          {/* بطاقة برنامج السفراء */}
          <motion.div
            whileHover={{ y: -5, scale: 1.02 }}
            className="bg-gradient-to-br from-amber-50 to-yellow-100 rounded-3xl p-6 border border-amber-200 shadow-lg hover:shadow-xl transition-all relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-white text-xs font-bold px-4 py-1 rounded-br-xl">
              برنامج حصري
            </div>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#D4AF37] to-[#B8860B] flex items-center justify-center mb-4 shadow-md mt-4">
              <Users className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-xl font-bold text-[#002845] mb-2">كن سفير البيت 🏆</h3>
            <p className="text-slate-600 text-sm mb-4 leading-relaxed">
              انضم لبرنامج السفراء. ادعُ أصدقاءك واحصل على باقة رجال الأعمال مجاناً لمدة سنة كاملة!
            </p>
            <Link 
              href="/referral"
              className="inline-flex items-center gap-2 bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-white font-bold px-5 py-2.5 rounded-xl hover:shadow-lg transition text-sm"
            >
              <Star className="w-4 h-4" />
              انضم الآن
            </Link>
          </motion.div>

          {/* بطاقة نخبة العقارات */}
          <motion.div
            whileHover={{ y: -5, scale: 1.02 }}
            className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-3xl p-6 border border-blue-200 shadow-lg hover:shadow-xl transition-all"
          >
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#002845] to-[#1a3a5c] flex items-center justify-center mb-4 shadow-md">
              <Building2 className="w-7 h-7 text-[#D4AF37]" />
            </div>
            <h3 className="text-xl font-bold text-[#002845] mb-2">نخبة العقارات</h3>
            <p className="text-slate-600 text-sm mb-4 leading-relaxed">
              اجعل عقارك يتصدر الصفحة الرئيسية! احجز موقعك المميز وضاعف مشاهداتك 10 أضعاف.
            </p>
            <Link 
              href="/elite-booking"
              className="inline-flex items-center gap-2 bg-gradient-to-l from-[#002845] to-[#1a3a5c] text-white font-bold px-5 py-2.5 rounded-xl hover:shadow-lg transition text-sm"
            >
              <Crown className="w-4 h-4 text-[#D4AF37]" />
              احجز خانتك
            </Link>
          </motion.div>
        </div>

        {/* شريط الإحصائيات */}
        <div className="mt-12 bg-gradient-to-l from-[#002845] to-[#1a3a5c] rounded-3xl p-8 text-white">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div>
              <div className="text-3xl sm:text-4xl font-bold text-[#D4AF37] mb-1">+10K</div>
              <div className="text-sm text-white/80">عقار مُعلن</div>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl font-bold text-[#D4AF37] mb-1">+5K</div>
              <div className="text-sm text-white/80">مستخدم نشط</div>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl font-bold text-[#D4AF37] mb-1">9</div>
              <div className="text-sm text-white/80">دول مدعومة</div>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl font-bold text-[#D4AF37] mb-1">24/7</div>
              <div className="text-sm text-white/80">دعم فني</div>
            </div>
          </div>
        </div>
      </div>

      {selectedPlan && (
        <SubscriptionModal
          plan={selectedPlan}
          onClose={() => setSelectedPlan(null)}
          onConfirm={handleConfirmSubscription}
          isLoading={isSubscribing}
        />
      )}

      {showSuccess && subscribedPlan && (
        <SuccessModal
          plan={subscribedPlan}
          onGoToListings={handleGoToListings}
          onStayHere={handleStayHere}
        />
      )}

      {infoMessage && (
        <InfoModal
          message={infoMessage}
          onClose={() => setInfoMessage(null)}
        />
      )}
    </div>
  );
}
