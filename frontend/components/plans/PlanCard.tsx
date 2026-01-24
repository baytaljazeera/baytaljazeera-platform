"use client";

import React, { useMemo } from "react";
import type { CSSProperties } from "react";
import Image from "next/image";

export const PLAN_COLORS = {
  goldLight: "#fdf6db",
  goldDark: "#e5cf8b",
  blueDeep: "#002845",
  blueAccent: "#0a3d66",
  goldText: "#d4af37",
};

export type Feature = {
  text: string;
  included: boolean;
};

export type PlanCopy = {
  id: number;
  displayName: string;
  headline: string;
  features: Feature[];
  icon: string;
  price: number;
  currencySymbol?: string;
  isFreePlan?: boolean;
  topRibbonText?: string;
  topRibbonBgColor?: string;
  topRibbonTextColor?: string;
  badgePosition?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
  badgeShape?: "ribbon-3d" | "ribbon-flat" | "circle" | "rectangle" | "tag" | "medal" | "star";
  badgeFontSize?: number;
  badgeBgOpacity?: number;
  horizontalBadgeText?: string;
  horizontalBadgeBgColor?: string;
  horizontalBadgeTextColor?: string;
  headerBgColor?: string | null;
  headerTextColor?: string | null;
  bodyBgColor?: string | null;
  bodyTextColor?: string | null;
  headerBgOpacity?: number;
  bodyBgOpacity?: number;
  originalPrice?: number | null;
  discountedPrice?: number | null;
  discountPercentage?: number | null;
  appliedPromotion?: AppliedPromotion | null;
};

export type AppliedPromotion = {
  id: number;
  name_ar: string;
  type: string;
  badge_text?: string;
  badge_color?: string;
};

export type DBPlan = {
  id: number;
  name_ar: string;
  name_en: string;
  price: number;
  duration_days: number;
  max_listings: number;
  max_photos_per_listing: number;
  max_videos_per_listing: number;
  max_video_duration: number | null;
  show_on_map: boolean;
  ai_support_level: number;
  highlights_allowed: number;
  description: string;
  logo: string | null;
  icon: string | null;
  color: string;
  badge: string | null;
  visible: boolean;
  features: string[];
  sort_order: number;
  support_level: number;
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
  body_bg_color: string | null;
  body_text_color: string | null;
  header_bg_opacity: number;
  body_bg_opacity: number;
  seo_level: number;
  seo_feature_title: string | null;
  seo_feature_description: string | null;
  feature_display_order: {
    listings: number;
    photos: number;
    map: number;
    ai: number;
    video: number;
    elite: number;
    seo: number;
  } | string | null;
  original_price?: number | null;
  discounted_price?: number | null;
  discount_percentage?: number | null;
  discount_amount?: number | null;
  applied_promotion?: AppliedPromotion | null;
};


const AI_LABELS: Record<number, string> = {
  0: "ذكاء اصطناعي",
  1: "ذكاء اصطناعي أساسي",
  2: "ذكاء اصطناعي متقدم",
  3: "ذكاء اصطناعي متميز",
};

export const AI_DESCRIPTIONS: Record<number, string> = {
  0: "غير مشمول",
  1: "دعم فني ذكي + أسئلة شائعة",
  2: "دعم VIP + نصائح تسويقية",
  3: "مساعد شخصي + استشارات احترافية",
};

export const SEO_LABELS: Record<number, string> = {
  0: "تحسين محركات البحث SEO",
  1: "SEO أساسي",
  2: "SEO كامل + Schema",
};

export const SEO_DESCRIPTIONS: Record<number, string> = {
  0: "غير مشمول",
  1: "عنوان + وصف SEO محسّن",
  2: "SEO كامل + Schema + تحسين صور + فيديو",
};

const PLAN_ICON_DEFAULTS: Record<string, string> = {
  "الأساس": "/icons/plan-starter.jpeg",
  "التميّــز": "/icons/plan-premium.jpeg",
  "النخبة": "/icons/plan-intermediate.jpeg",
  "الملكي": "/icons/plan-competition.jpeg",
  "الإمبراطوري": "/icons/plan-business.jpeg",
  "الصفوة": "/icons/plan-business.jpeg",
  "كبار رجال الأعمال": "/icons/plan-competition.jpeg",
};

function normalizeHex(hex: string): string {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) {
    h = h.split("").map((c) => c + c).join("");
  }
  if (h.length < 6) {
    h = h.padEnd(6, "0");
  }
  return `#${h.slice(0, 6)}`;
}

export function adjustColor(color: string, amount: number): string {
  const hex = normalizeHex(color).replace("#", "");
  const r = Math.max(0, Math.min(255, parseInt(hex.slice(0, 2), 16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(hex.slice(2, 4), 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(hex.slice(4, 6), 16) + amount));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function hexToRgba(hex: string, opacityPercent: number): string {
  const clean = normalizeHex(hex).replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const alpha = Math.max(0, Math.min(100, opacityPercent)) / 100;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function formatVideoDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return "";
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} دقيقة`;
  }
  return `${seconds} ثانية`;
}

function FeatureItem({ feature, isFreePlan, textColor }: { feature: Feature; isFreePlan?: boolean; textColor?: string }) {
  const color = textColor || (isFreePlan ? "#002845" : "#1e293b");
  return (
    <li className="flex items-start gap-2" style={{ color }}>
      {feature.included ? (
        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white text-xs">✓</span>
      ) : (
        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500 text-white text-xs">✕</span>
      )}
      <span className={`flex-1 text-sm font-semibold leading-snug ${feature.included ? "" : "opacity-60 line-through"}`}>
        {feature.text}
      </span>
    </li>
  );
}

type CornerBadgeProps = {
  text: string;
  position?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
  shape?: "ribbon-3d" | "ribbon-flat" | "circle" | "rectangle" | "tag" | "medal" | "star";
  bgColor?: string;
  textColor?: string;
  fontSize?: number;
  bgOpacity?: number;
};

function CornerBadge({
  text,
  position = "top-right",
  shape = "ribbon-3d",
  bgColor = PLAN_COLORS.goldDark,
  textColor = PLAN_COLORS.blueDeep,
  fontSize = 16,
  bgOpacity = 100,
}: CornerBadgeProps) {
  const posClass = useMemo(() => {
    switch (position) {
      case "top-left": return "-top-4 -left-2";
      case "bottom-left": return "-bottom-4 -left-2";
      case "bottom-right": return "-bottom-4 -right-2";
      case "top-right":
      default: return "-top-4 -right-2";
    }
  }, [position]);

  const isRight = position.includes("right");
  const isTop = position.includes("top");
  const base = hexToRgba(bgColor, bgOpacity);
  const light = hexToRgba(adjustColor(bgColor, 30), bgOpacity);
  const dark = hexToRgba(adjustColor(bgColor, -20), bgOpacity);

  if (shape === "ribbon-3d" || shape === "ribbon-flat") {
    const is3D = shape === "ribbon-3d";
    const bodyStyle: CSSProperties = {
      background: is3D ? `linear-gradient(180deg, ${light} 0%, ${base} 40%, ${dark} 100%)` : base,
      color: textColor,
      padding: `${Math.max(8, fontSize * 0.6)}px ${Math.max(20, fontSize * 1.4)}px`,
      fontSize,
      fontWeight: 800,
      letterSpacing: "1px",
      position: "relative",
      borderRadius: isRight ? "4px 0 0 4px" : "0 4px 4px 0",
      border: "2px solid rgba(255,255,255,0.4)",
      boxShadow: is3D ? "0 4px 12px rgba(0,0,0,0.35), inset 0 2px 0 rgba(255,255,255,0.5)" : "0 3px 8px rgba(0,0,0,0.25)",
    };

    return (
      <div className={`absolute z-30 ${posClass}`}>
        <div
          style={{
            position: "absolute",
            [isRight ? "left" : "right"]: "-12px",
            [isTop ? "bottom" : "top"]: "-8px",
            width: 0,
            height: 0,
            borderStyle: "solid",
            borderWidth: isRight
              ? isTop ? "0 12px 12px 0" : "12px 12px 0 0"
              : isTop ? "0 0 12px 12px" : "12px 0 0 12px",
            borderColor: isRight
              ? isTop ? `transparent ${dark} transparent transparent` : `${dark} ${dark} transparent transparent`
              : isTop ? `transparent transparent transparent ${dark}` : `${dark} transparent transparent ${dark}`,
            zIndex: -1,
          }}
        />
        <div style={bodyStyle}>
          {is3D && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: bodyStyle.borderRadius,
                background: "linear-gradient(180deg, rgba(255,255,255,0.6) 0%, transparent 40%)",
                opacity: 0.6,
                pointerEvents: "none",
              }}
            />
          )}
          <span style={{ position: "relative", zIndex: 1 }}>{text}</span>
        </div>
      </div>
    );
  }

  if (shape === "medal" || shape === "star") {
    const size = Math.max(50, fontSize * 3.2);
    const innerSize = size * 0.72;
    return (
      <div className={`absolute z-30 ${posClass}`}>
        <div
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            background: `radial-gradient(circle at 30% 20%, #ffffff 0%, ${light} 40%, ${base} 70%, ${dark} 100%)`,
            boxShadow: "0 10px 22px rgba(0,0,0,0.35), inset 0 2px 0 rgba(255,255,255,0.8)",
            border: "3px solid rgba(255,255,255,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <div
            style={{
              width: innerSize,
              height: innerSize,
              borderRadius: "50%",
              background: `radial-gradient(circle at 30% 20%, #fff 0%, ${adjustColor(bgColor, 10)} 60%, ${adjustColor(bgColor, -20)} 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: textColor,
              fontWeight: 800,
              fontSize,
              textAlign: "center",
              padding: 6,
            }}
          >
            {text}
          </div>
        </div>
      </div>
    );
  }

  const baseStyle: CSSProperties = (() => {
    switch (shape) {
      case "circle":
        return {
          background: `radial-gradient(circle at 30% 20%, #fff 0%, ${base} 60%, ${dark} 100%)`,
          color: textColor,
          width: Math.max(54, fontSize * 3.5),
          height: Math.max(54, fontSize * 3.5),
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize,
          fontWeight: 800,
          textAlign: "center",
          padding: 6,
          boxShadow: "0 6px 16px rgba(0,0,0,0.3)",
          border: "3px solid rgba(255,255,255,0.7)",
        };
      case "rectangle":
        return {
          background: base,
          color: textColor,
          padding: `${fontSize * 0.5}px ${fontSize * 1.1}px`,
          borderRadius: 10,
          fontSize,
          fontWeight: 800,
          boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
          border: "2px solid rgba(255,255,255,0.5)",
        };
      case "tag":
        return {
          background: base,
          color: textColor,
          padding: `${fontSize * 0.5}px ${fontSize * 1.4}px`,
          borderRadius: position.includes("left") ? "0 14px 14px 0" : "14px 0 0 14px",
          fontSize,
          fontWeight: 800,
          boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
        };
      default:
        return {
          background: `linear-gradient(135deg, ${light} 0%, ${dark} 100%)`,
          color: textColor,
          padding: `${fontSize * 0.6}px ${fontSize * 1.4}px`,
          fontSize,
          fontWeight: 800,
          letterSpacing: "1px",
          boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
          border: "2px solid rgba(255,255,255,0.4)",
        };
    }
  })();

  return (
    <div className={`absolute z-30 ${posClass}`} style={baseStyle}>
      {text}
    </div>
  );
}

export function mapDbPlanToPlanCopy(dbPlan: DBPlan, currencySymbol: string = "ريال"): PlanCopy {
  const normalizeArabic = (str: string) =>
    str.replace(/[\u064B-\u065F\u0670]/g, "").replace(/[\u0640]/g, "").replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "").trim();

  let designIcon: string | undefined = PLAN_ICON_DEFAULTS[dbPlan.name_ar];
  if (!designIcon) {
    const simpleName = normalizeArabic(dbPlan.name_ar);
    const matchingKey = Object.keys(PLAN_ICON_DEFAULTS).find((key) => normalizeArabic(key) === simpleName);
    designIcon = matchingKey ? PLAN_ICON_DEFAULTS[matchingKey] : undefined;
  }
  const iconPath = dbPlan.custom_icon || designIcon || "/icons/plan-starter.jpeg";

  const videoText = dbPlan.max_videos_per_listing > 0
    ? `فيديو (${dbPlan.max_videos_per_listing} ${dbPlan.max_videos_per_listing > 1 ? "فيديوهات" : "فيديو"}${dbPlan.max_video_duration ? ` - ${formatVideoDuration(dbPlan.max_video_duration)}` : ""})`
    : "فيديو";

  const aiText = dbPlan.ai_support_level > 0 ? AI_LABELS[dbPlan.ai_support_level] || "ذكاء اصطناعي" : "ذكاء اصطناعي";
  const elitePropertiesText = "نخبة العقارات المختارة";
  const seoLevel = dbPlan.seo_level || 0;
  const seoText = seoLevel > 0 ? SEO_LABELS[seoLevel] || "SEO" : "تحسين محركات البحث SEO";

  const defaultOrder = { listings: 1, photos: 2, map: 3, ai: 4, video: 5, elite: 6, seo: 7 };
  const rawOrder = dbPlan.feature_display_order;
  const order = typeof rawOrder === "string" ? JSON.parse(rawOrder) : (rawOrder || defaultOrder);

  const featuresWithOrder: Array<{ key: string; feature: Feature; order: number }> = [
    { key: "listings", feature: { text: `${dbPlan.max_listings} إعلان`, included: true }, order: order.listings ?? 1 },
    { key: "photos", feature: { text: `حتى ${dbPlan.max_photos_per_listing} صور`, included: true }, order: order.photos ?? 2 },
    { key: "map", feature: { text: `ظهور على الخريطة`, included: dbPlan.show_on_map }, order: order.map ?? 3 },
    { key: "ai", feature: { text: aiText, included: dbPlan.ai_support_level > 0 }, order: order.ai ?? 4 },
    { key: "video", feature: { text: videoText, included: dbPlan.max_videos_per_listing > 0 }, order: order.video ?? 5 },
    { key: "elite", feature: { text: elitePropertiesText, included: (dbPlan.support_level || 0) > 0 }, order: order.elite ?? 6 },
    { key: "seo", feature: { text: seoText, included: seoLevel > 0 }, order: order.seo ?? 7 },
  ];

  featuresWithOrder.sort((a, b) => a.order - b.order);
  const baseFeatures: Feature[] = featuresWithOrder.map(f => f.feature);

  const extraFeatures = dbPlan.features?.map<Feature>((t) => ({ text: t, included: true })) || [];

  const headline = dbPlan.price === 0
    ? `إعلان واحد لمدة ${dbPlan.duration_days} يوم (مجاني)`
    : `${dbPlan.max_listings} إعلان لمدة شهر (${Math.round(dbPlan.price)} ${currencySymbol})`;

  const plan: PlanCopy = {
    id: dbPlan.id,
    displayName: dbPlan.name_ar,
    headline,
    features: [...baseFeatures, ...extraFeatures],
    icon: iconPath,
    price: dbPlan.price,
    currencySymbol,
    isFreePlan: dbPlan.price === 0,
    headerBgOpacity: dbPlan.header_bg_opacity ?? 100,
    bodyBgOpacity: dbPlan.body_bg_opacity ?? 100,
    headerBgColor: dbPlan.header_bg_color,
    headerTextColor: dbPlan.header_text_color,
    bodyBgColor: dbPlan.body_bg_color,
    bodyTextColor: dbPlan.body_text_color,
  };

  if (dbPlan.badge_enabled && dbPlan.badge_text) {
    plan.topRibbonText = dbPlan.badge_text;
    plan.topRibbonBgColor = dbPlan.badge_bg_color || PLAN_COLORS.goldDark;
    plan.topRibbonTextColor = dbPlan.badge_text_color || PLAN_COLORS.blueDeep;
    plan.badgePosition = (dbPlan.badge_position as CornerBadgeProps["position"]) || "top-right";
    plan.badgeShape = (dbPlan.badge_shape as CornerBadgeProps["shape"]) || "ribbon-3d";
    plan.badgeFontSize = dbPlan.badge_font_size || 16;
    plan.badgeBgOpacity = dbPlan.badge_bg_opacity ?? 100;
  }

  if (dbPlan.horizontal_badge_enabled && dbPlan.horizontal_badge_text) {
    plan.horizontalBadgeText = dbPlan.horizontal_badge_text;
    plan.horizontalBadgeBgColor = dbPlan.horizontal_badge_bg_color || PLAN_COLORS.goldDark;
    plan.horizontalBadgeTextColor = dbPlan.horizontal_badge_text_color || PLAN_COLORS.blueDeep;
  }

  if (dbPlan.discounted_price != null && dbPlan.original_price != null) {
    plan.originalPrice = dbPlan.original_price;
    plan.discountedPrice = dbPlan.discounted_price;
    plan.discountPercentage = dbPlan.discount_percentage;
    plan.appliedPromotion = dbPlan.applied_promotion;
    plan.price = dbPlan.discounted_price;
  }

  return plan;
}

export function PlanCard({ plan, onSelect }: { plan: PlanCopy; onSelect?: (plan: PlanCopy) => void }) {
  const isFree = plan.isFreePlan;

  const headerBg = plan.headerBgColor != null
    ? hexToRgba(plan.headerBgColor, plan.headerBgOpacity ?? 100)
    : isFree
    ? hexToRgba("#E8F5E9", plan.headerBgOpacity ?? 100)
    : `linear-gradient(to bottom, ${PLAN_COLORS.goldLight}, ${PLAN_COLORS.goldDark})`;

  const headerStyle: CSSProperties = typeof headerBg === "string" && headerBg.startsWith("linear-gradient")
    ? { backgroundImage: headerBg }
    : { backgroundColor: headerBg as string };

  const bodyBg = plan.bodyBgColor != null
    ? hexToRgba(plan.bodyBgColor, plan.bodyBgOpacity ?? 100)
    : isFree
    ? hexToRgba("#D0E8D8", plan.bodyBgOpacity ?? 100)
    : "#FFFDF5";

  const bodyStyle: CSSProperties = { backgroundColor: bodyBg };
  const headerTextColor = plan.headerTextColor || (isFree ? "#002845" : "#002845");
  const bodyTextColor = plan.bodyTextColor || (isFree ? "#002845" : "#1e293b");

  const horizontalBadgeBgStyle: CSSProperties = plan.horizontalBadgeBgColor
    ? { backgroundColor: plan.horizontalBadgeBgColor }
    : { backgroundImage: `linear-gradient(to right, ${PLAN_COLORS.goldDark}, ${PLAN_COLORS.goldLight}, ${PLAN_COLORS.goldDark})` };

  const horizontalBadgeTextColor = plan.horizontalBadgeTextColor || PLAN_COLORS.blueDeep;
  const borderStyle: CSSProperties = isFree ? { border: "4px solid #1B5E20" } : { border: "3px solid #D4AF37" };

  return (
    <div
      className="relative flex h-full flex-col overflow-visible rounded-[30px] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.3)] transition-transform hover:-translate-y-2"
      style={{ ...borderStyle, backgroundColor: bodyBg }}
    >
      {plan.topRibbonText && (
        <CornerBadge
          text={plan.topRibbonText}
          position={plan.badgePosition}
          shape={plan.badgeShape}
          bgColor={plan.topRibbonBgColor}
          textColor={plan.topRibbonTextColor}
          fontSize={plan.badgeFontSize}
          bgOpacity={plan.badgeBgOpacity}
        />
      )}

      <div className="flex flex-1 flex-col overflow-hidden rounded-[26px]">
        <div className="relative flex flex-col items-center border-b-4 border-white/40 p-5 pb-12 text-center" style={headerStyle}>
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/40 bg-white/20 p-1 shadow-md">
            <div className="relative h-full w-full overflow-hidden rounded-full">
              {plan.icon && (
                <Image 
                  src={plan.icon} 
                  alt={plan.displayName} 
                  width={64} 
                  height={64} 
                  className="object-cover w-full h-full" 
                  unoptimized
                />
              )}
            </div>
          </div>
          <h2 className="mb-1 text-xl font-extrabold" style={{ color: headerTextColor }}>{plan.displayName}</h2>
          
          {plan.originalPrice != null && plan.discountedPrice != null ? (
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-2">
                <span className="text-sm line-through opacity-60" style={{ color: headerTextColor }}>
                  {Math.round(plan.originalPrice)} {plan.currencySymbol || "ريال"}
                </span>
                {plan.discountPercentage != null && plan.discountPercentage > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-500 text-white animate-pulse">
                    -{Math.round(plan.discountPercentage)}%
                  </span>
                )}
              </div>
              <p className="text-lg font-extrabold" style={{ color: plan.appliedPromotion?.badge_color || "#22c55e" }}>
                {plan.discountedPrice === 0 ? "مجاناً!" : `${Math.round(plan.discountedPrice)} ${plan.currencySymbol || "ريال"}`}
              </p>
            </div>
          ) : (
            <p className="text-xs font-bold leading-tight" style={{ color: headerTextColor }}>{plan.headline}</p>
          )}

          {plan.horizontalBadgeText && (
            <div className="absolute -bottom-5 inset-x-8 z-10 flex h-10 items-center justify-center rounded-xl shadow-md" style={horizontalBadgeBgStyle}>
              <span className="text-sm font-bold" style={{ color: horizontalBadgeTextColor }}>{plan.horizontalBadgeText}</span>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col p-5 -mt-1" style={{ ...bodyStyle, paddingTop: plan.horizontalBadgeText ? 36 : 44 }}>
          <ul className="flex-1 space-y-2.5 text-right">
            {plan.features.map((feature, idx) => (
              <FeatureItem key={idx} feature={feature} isFreePlan={isFree} textColor={bodyTextColor} />
            ))}
          </ul>

          <div className="mt-4">
            {onSelect ? (
              <button
                onClick={() => onSelect(plan)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl py-2.5 text-sm font-bold shadow-md transition-all hover:shadow-lg active:scale-[0.98]"
                style={{
                  backgroundColor: isFree ? PLAN_COLORS.goldText : PLAN_COLORS.blueDeep,
                  color: isFree ? PLAN_COLORS.blueDeep : "#ffffff",
                }}
              >
                اختيار هذه الباقة
              </button>
            ) : (
              <div className="rounded-2xl bg-white/60 py-2.5 text-center text-xs font-semibold text-slate-600">
                هذه معاينة للباقة
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
