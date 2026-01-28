"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { usePromotionStore } from "@/lib/promotionStore";

interface ActivePromotion {
  id: number;
  name: string;
  name_ar: string;
  slug: string;
  description?: string;
  description_ar?: string;
  promotion_type: string;
  discount_value?: number;
  duration_value?: number;
  duration_unit?: string;
  badge_text?: string;
  badge_color?: string;
  banner_enabled?: boolean;
  banner_text?: string;
  display_mode?: string;
  display_position?: string;
  background_color?: string;
  dismiss_type?: string;
  auto_dismiss_seconds?: number;
  animation_type?: string;
  target_pages?: string[];
  overlay_title?: string;
  overlay_description?: string;
  overlay_cta_text?: string;
  overlay_cta_url?: string;
  end_at?: string;
  seasonal_tag?: string;
}

const PROMO_TYPE_LABELS: Record<string, string> = {
  free_trial: "🎁 تجربة مجانية",
  free_plan: "💎 باقة مجانية",
  percentage_discount: "🔥 خصم حصري",
  fixed_discount: "✨ خصم مميز"
};

const SEASONAL_EMOJIS: Record<string, string> = {
  // مناسبات إسلامية عامة
  ramadan: "🌙",
  eid_fitr: "🎉",
  eid_adha: "🕌",
  hajj: "🕋",
  // مناسبات خليجية
  uae_national: "🇦🇪",
  uae_flag: "🇦🇪",
  kuwait_national: "🇰🇼",
  kuwait_liberation: "🇰🇼",
  qatar_national: "🇶🇦",
  qatar_sports: "⚽",
  bahrain_national: "🇧🇭",
  oman_national: "🇴🇲",
  oman_renaissance: "🇴🇲",
  saudi_national: "🇸🇦",
  saudi_founding: "🏰",
  // مناسبات عامة
  new_year: "🎊",
  summer: "☀️",
  winter: "❄️",
  back_to_school: "📚",
  launch: "🚀",
  special: "✨"
};

const getPromoEmoji = (promoType: string, seasonalTag?: string): string => {
  if (seasonalTag && SEASONAL_EMOJIS[seasonalTag]) {
    return SEASONAL_EMOJIS[seasonalTag];
  }
  switch (promoType) {
    case "free_trial": return "🎁";
    case "free_plan": return "💎";
    case "percentage_discount": return "🔥";
    case "fixed_discount": return "✨";
    default: return "🎯";
  }
};

const ANIMATION_VARIANTS: Record<string, any> = {
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 }
  },
  slide_down: {
    initial: { opacity: 0, y: -50 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -50 }
  },
  slide_up: {
    initial: { opacity: 0, y: 50 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 50 }
  },
  bounce: {
    initial: { opacity: 0, scale: 0.3 },
    animate: { opacity: 1, scale: 1, transition: { type: "spring", bounce: 0.5 } },
    exit: { opacity: 0, scale: 0.3 }
  },
  zoom: {
    initial: { opacity: 0, scale: 0.8 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.8 }
  },
  none: {
    initial: {},
    animate: {},
    exit: {}
  }
};

export default function GlobalPromotions() {
  const pathname = usePathname();
  const [activePromos, setActivePromos] = useState<ActivePromotion[]>([]);
  const [dismissedBanners, setDismissedBanners] = useState<Set<number>>(new Set());
  const [dismissedOverlays, setDismissedOverlays] = useState<Set<number>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);
  const { setHasBannerVisible, setBannerHeight } = usePromotionStore();

  useEffect(() => {
    const fetchPromos = async () => {
      try {
        const res = await fetch(`${API_URL}/api/promotions/active`);
        const data = await res.json();
        if (data.ok && data.promotions) {
          setActivePromos(data.promotions);
        }
      } catch (err) {
        console.error("Error fetching promotions:", err);
      } finally {
        setLoaded(true);
      }
    };

    fetchPromos();
  }, []);

  const dismissBanner = useCallback((promoId: number) => {
    setDismissedBanners(prev => new Set([...prev, promoId]));
  }, []);

  const dismissOverlay = useCallback((promoId: number) => {
    setDismissedOverlays(prev => new Set([...prev, promoId]));
  }, []);

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];
    
    activePromos.forEach(promo => {
      const dismissType = promo.dismiss_type || "click";
      const autoSeconds = promo.auto_dismiss_seconds || 0;
      const displayMode = promo.display_mode || "banner";
      
      if ((dismissType === "timer" || dismissType === "both") && autoSeconds > 0) {
        if ((displayMode === "banner" || displayMode === "both") && promo.banner_enabled && !dismissedBanners.has(promo.id)) {
          const timer = setTimeout(() => {
            dismissBanner(promo.id);
          }, autoSeconds * 1000);
          timers.push(timer);
        }
        
        if ((displayMode === "fullpage" || displayMode === "both") && !dismissedOverlays.has(promo.id)) {
          const overlayTimer = setTimeout(() => {
            dismissOverlay(promo.id);
          }, autoSeconds * 1000);
          timers.push(overlayTimer);
        }
      }
    });
    
    return () => {
      timers.forEach(t => clearTimeout(t));
    };
  }, [activePromos, dismissedBanners, dismissedOverlays, dismissBanner, dismissOverlay]);

  const getAnimationVariant = (animType: string) => {
    return ANIMATION_VARIANTS[animType as keyof typeof ANIMATION_VARIANTS] || ANIMATION_VARIANTS.fade;
  };

  const isPageMatched = (targetPages: string[] | undefined): boolean => {
    if (!targetPages || targetPages.length === 0) return true;
    return targetPages.some(page => {
      if (page === "/") return pathname === "/";
      return pathname === page || pathname.startsWith(page + "/");
    });
  };

  const renderPromoBannerContent = (promo: ActivePromotion) => {
    const bgColor = promo.background_color || "#002845";
    const dismissType = promo.dismiss_type || "click";
    const showDismissButton = dismissType === "click" || dismissType === "both";

    return (
      <div className="relative overflow-hidden rounded-2xl p-1 shadow-2xl" style={{ background: `linear-gradient(to left, ${bgColor}, ${bgColor}dd, ${bgColor})` }}>
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyMTIsMTc1LDU1LDAuMDUpIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>
        <div className="relative rounded-xl px-6 py-5 sm:px-8 sm:py-6" style={{ backgroundColor: `${bgColor}e6` }}>
          {showDismissButton && (
            <button
              onClick={() => dismissBanner(promo.id)}
              className="absolute top-3 left-3 p-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5 text-white/70" />
            </button>
          )}
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full shadow-lg text-3xl" style={{ background: `linear-gradient(135deg, ${promo.badge_color || '#D4AF37'}, ${promo.badge_color || '#B8860B'}90)` }}>
                <span className="drop-shadow-lg">{getPromoEmoji(promo.promotion_type, promo.seasonal_tag)}</span>
              </div>
              <span className="text-2xl animate-pulse">✨</span>
            </div>
            <div className="text-center sm:text-right flex-1">
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-1">
                {promo.name_ar}
              </h2>
              <p className="text-lg sm:text-xl font-semibold" style={{ color: promo.badge_color || '#D4AF37' }}>
                {promo.description_ar || (
                  promo.promotion_type === "free_trial" ? `${promo.duration_value} ${promo.duration_unit === "days" ? "أيام" : promo.duration_unit === "weeks" ? "أسابيع" : "أشهر"} مجاناً! 🎉` :
                  promo.promotion_type === "percentage_discount" ? `🔥 خصم ${promo.discount_value}% على الباقات!` :
                  promo.promotion_type === "fixed_discount" ? `✨ خصم ${promo.discount_value} ر.س!` :
                  promo.promotion_type === "free_plan" ? "💎 جميع الباقات مجاناً!" : ""
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xl animate-bounce">🎯</span>
              <div className="rounded-full px-4 py-2 border" style={{ backgroundColor: `${promo.badge_color || '#D4AF37'}20`, borderColor: `${promo.badge_color || '#D4AF37'}50` }}>
                <span className="text-sm font-bold" style={{ color: promo.badge_color || '#D4AF37' }}>
                  {promo.badge_text || PROMO_TYPE_LABELS[promo.promotion_type]}
                </span>
              </div>
              {promo.end_at && (
                <div className="text-xs text-white/70 hidden sm:block">
                  ⏰ ينتهي: {new Date(promo.end_at).toLocaleDateString("ar-SA")}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderPromoOverlay = (promo: ActivePromotion) => {
    const bgColor = promo.background_color || "#002845";
    const badgeColor = promo.badge_color || "#D4AF37";
    const dismissType = promo.dismiss_type || "click";
    const animationType = promo.animation_type || "fade";
    const variants = getAnimationVariant(animationType);
    const showDismissButton = dismissType === "click" || dismissType === "both";
    const allowBackdropClose = dismissType !== "none";

    return (
      <motion.div
        key={`overlay-${promo.id}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={(e: React.MouseEvent) => {
          if (e.target === e.currentTarget && allowBackdropClose) {
            dismissOverlay(promo.id);
          }
        }}
      >
        <motion.div
          initial={variants.initial}
          animate={variants.animate}
          exit={variants.exit}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="relative max-w-lg w-full rounded-3xl overflow-hidden shadow-2xl"
          style={{ background: `linear-gradient(135deg, ${bgColor}, ${bgColor}dd)` }}
        >
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDIwIEwgNjAgMjAgTSAyMCAwIEwgMjAgNjAgTSAwIDQwIEwgNjAgNDAgTSA0MCAwIEwgNDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyMTIsMTc1LDU1LDAuMDgpIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-50"></div>
          
          {showDismissButton && (
            <button
              onClick={() => dismissOverlay(promo.id)}
              className="absolute top-4 left-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              aria-label="إغلاق"
            >
              <X className="w-6 h-6 text-white" />
            </button>
          )}

          <div className="relative p-8 sm:p-10 text-center">
            <div className="flex justify-center mb-6">
              <div 
                className="h-24 w-24 rounded-full flex items-center justify-center shadow-2xl text-5xl"
                style={{ background: `linear-gradient(135deg, ${badgeColor}, ${badgeColor}99)` }}
              >
                <span className="animate-bounce drop-shadow-lg">{getPromoEmoji(promo.promotion_type, promo.seasonal_tag)}</span>
              </div>
            </div>

            {promo.badge_text && (
              <div className="inline-block mb-4">
                <span 
                  className="px-5 py-2 rounded-full text-base font-bold shadow-lg"
                  style={{ backgroundColor: `${badgeColor}30`, color: badgeColor, border: `1px solid ${badgeColor}50` }}
                >
                  {promo.badge_text}
                </span>
              </div>
            )}

            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
              {promo.overlay_title || promo.name_ar}
            </h2>
            
            <p className="text-lg sm:text-xl mb-6" style={{ color: badgeColor }}>
              {promo.overlay_description || promo.description_ar || (
                promo.promotion_type === "free_trial" ? `🎉 استمتع بـ ${promo.duration_value} ${promo.duration_unit === "days" ? "أيام" : promo.duration_unit === "weeks" ? "أسابيع" : "أشهر"} مجاناً!` :
                promo.promotion_type === "percentage_discount" ? `🔥 خصم ${promo.discount_value}% على جميع الباقات!` :
                promo.promotion_type === "fixed_discount" ? `✨ وفر ${promo.discount_value} ر.س على اشتراكك!` :
                promo.promotion_type === "free_plan" ? "💎 جميع الباقات مجانية لفترة محدودة!" : ""
              )}
            </p>

            {promo.end_at && (
              <div className="mb-6 text-white/70 text-sm flex items-center justify-center gap-2">
                <span>⏰</span>
                <span>ينتهي العرض: {new Date(promo.end_at).toLocaleDateString("ar-SA")}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {promo.overlay_cta_url && promo.overlay_cta_text ? (
                <a
                  href={promo.overlay_cta_url}
                  className="px-8 py-3 rounded-xl font-bold text-lg transition-all hover:scale-105 shadow-lg"
                  style={{ backgroundColor: badgeColor, color: bgColor }}
                >
                  {promo.overlay_cta_text}
                </a>
              ) : (
                <button
                  onClick={() => dismissOverlay(promo.id)}
                  className="px-8 py-3 rounded-xl font-bold text-lg transition-all hover:scale-105 shadow-lg"
                  style={{ backgroundColor: badgeColor, color: bgColor }}
                >
                  استفد من العرض الآن
                </button>
              )}
              {showDismissButton && (
                <button
                  onClick={() => dismissOverlay(promo.id)}
                  className="px-6 py-3 rounded-xl font-medium text-white/80 hover:text-white transition-colors border border-white/20 hover:border-white/40"
                >
                  لاحقاً
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    );
  };

  const visibleBannerPromos = useMemo(() => activePromos.filter(p => {
    const displayMode = p.display_mode || "banner";
    if (displayMode !== "banner" && displayMode !== "both") return false;
    if (p.banner_enabled === false || dismissedBanners.has(p.id)) return false;
    return isPageMatched(p.target_pages);
  }), [activePromos, dismissedBanners, pathname]);

  const visibleOverlayPromos = useMemo(() => activePromos.filter(p => {
    const displayMode = p.display_mode || "banner";
    if (displayMode !== "fullpage" && displayMode !== "both") return false;
    if (dismissedOverlays.has(p.id)) return false;
    return isPageMatched(p.target_pages);
  }), [activePromos, dismissedOverlays, pathname]);

  const hasTopBanner = useMemo(() => 
    visibleBannerPromos.some(p => (p.display_position || "top_banner") === "top_banner"),
    [visibleBannerPromos]
  );

  useEffect(() => {
    setHasBannerVisible(hasTopBanner);
    if (!hasTopBanner) {
      setBannerHeight(0);
    }
  }, [hasTopBanner, setHasBannerVisible, setBannerHeight]);

  useEffect(() => {
    return () => {
      setHasBannerVisible(false);
      setBannerHeight(0);
    };
  }, []);

  if (!loaded) return null;
  if (visibleBannerPromos.length === 0 && visibleOverlayPromos.length === 0) return null;

  return (
    <>
      <AnimatePresence>
        {visibleOverlayPromos.slice(0, 1).map((promo) => renderPromoOverlay(promo))}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {visibleBannerPromos.slice(0, 1).map((promo) => {
          const position = promo.display_position || "top_banner";
          const isTop = position === "top_banner";
          return (
            <motion.div
              key={promo.id}
              ref={isTop ? bannerRef : undefined}
              initial={{ 
                opacity: 0, 
                y: isTop ? -100 : 100,
                scale: 0.95
              }}
              animate={{ 
                opacity: 1, 
                y: 0,
                scale: 1,
                transition: {
                  type: "spring",
                  stiffness: 260,
                  damping: 25,
                  mass: 1
                }
              }}
              exit={{ 
                opacity: 0, 
                y: isTop ? -100 : 100,
                scale: 0.95,
                transition: {
                  type: "spring",
                  stiffness: 300,
                  damping: 30
                }
              }}
              className={`fixed left-0 right-0 z-40 px-4 ${isTop ? "top-20" : "bottom-4"}`}
              onAnimationComplete={() => {
                if (bannerRef.current && isTop && hasTopBanner) {
                  setBannerHeight(bannerRef.current.offsetHeight + 24);
                }
              }}
            >
              <div className="max-w-4xl mx-auto">
                {renderPromoBannerContent(promo)}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </>
  );
}
