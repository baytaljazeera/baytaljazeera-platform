import { SortOption } from "./types";
export { RESIDENTIAL_TYPES, COMMERCIAL_TYPES, ALL_PROPERTY_TYPES, isResidential, isCommercial } from "@/lib/propertyTypes";

export function getApiBase(): string {
  return "";
}

// مدن المملكة (الترتيب: مكة، المدينة، جدة، الطائف، الرياض ثم الباقي)
export const SAUDI_CITIES: string[] = [
  "مكة المكرمة",
  "المدينة المنورة",
  "جدة",
  "الطائف",
  "الهدا (الطائف)",
  "الشفا (الطائف)",
  "الرياض",
  "ينبع",
  "الدمام",
  "الخبر",
  "الظهران",
  "تبوك",
  "أبها",
  "السودة (أبها)",
  "جازان",
  "نجران",
  "حائل",
  "القصيم",
];

// هيستوجرام شكلي
export const PRICE_HISTOGRAM: number[] = [
  2, 4, 6, 9, 12, 9, 7, 11, 15, 18, 16, 13, 10, 9, 11, 14, 12, 9, 6, 4, 3, 2,
];

// منيو الترتيب
export const SORT_OPTIONS: {
  value: SortOption;
  label: string;
  subLabel?: string;
}[] = [
  {
    value: "recommended",
    label: "الأنسب لك",
    subLabel: "ترتيب افتراضي",
  },
  {
    value: "newest",
    label: "الأحدث أولاً",
    subLabel: "أحدث الإعلانات",
  },
  {
    value: "oldest",
    label: "الأقدم أولاً",
    subLabel: "أقدم الإعلانات",
  },
  {
    value: "price_high",
    label: "السعر: الأعلى",
    subLabel: "من الأعلى للأدنى",
  },
  {
    value: "price_low",
    label: "السعر: الأدنى",
    subLabel: "من الأدنى للأعلى",
  },
  {
    value: "area_high",
    label: "المساحة: الأكبر",
  },
  {
    value: "area_low",
    label: "المساحة: الأصغر",
  },
  {
    value: "beds_desc",
    label: "أكثر عدد غرف",
  },
];
