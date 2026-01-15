import { SortOption } from "./types";

// دالة بناء رابط الـ API - نستخدم مسار نسبي لأن Next.js rewrites يتولى تحويل الطلبات
export function getApiBase(): string {
  return "";
}

// أنواع العقار السكنية
export const RESIDENTIAL_TYPES: string[] = [
  "شقة",
  "فيلا",
  "دوبلكس",
  "قصر",
  "استوديو",
  "بيت شعبي",
  "شاليه",
  "عمارة سكنية",
];

// أنواع العقار التجارية
export const COMMERCIAL_TYPES: string[] = [
  "أرض تجارية",
  "محل تجاري",
  "مكتب",
  "معرض",
  "مستودع",
  "مزرعة",
  "فندق",
  "شقق فندقية",
  "مستشفى",
  "مجمع عيادات",
  "مطعم",
  "كوفي",
  "محطة بنزين",
  "برج تجاري",
];

// مدن المملكة
export const SAUDI_CITIES: string[] = [
  "مكة المكرمة",
  "المدينة المنورة",
  "الطائف",
  "الهدا (الطائف)",
  "الشفا (الطائف)",
  "جدة",
  "ينبع",
  "الرياض",
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
