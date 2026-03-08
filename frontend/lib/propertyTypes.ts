export const RESIDENTIAL_TYPES: string[] = [
  "شقة",
  "فيلا",
  "دور",
  "دوبلكس",
  "قصر",
  "استوديو",
  "شاليه",
  "استراحة",
  "بيت شعبي",
  "عمارة سكنية",
  "أرض سكنية",
];

export const COMMERCIAL_TYPES: string[] = [
  "أرض تجارية",
  "محل",
  "مكتب",
  "معرض",
  "مستودع",
  "مزرعة",
  "فندق",
  "شقق فندقية",
  "مجمع تجاري",
  "مبنى تجاري",
  "برج تجاري",
  "مستشفى",
  "مجمع طبي",
  "عيادة طبية",
  "مطعم",
  "كوفي",
  "محطة بنزين",
];

export const ALL_PROPERTY_TYPES: string[] = [...RESIDENTIAL_TYPES, ...COMMERCIAL_TYPES];

export const LEGACY_ALIASES: Record<string, string> = {
  "apartment": "شقة",
  "villa": "فيلا",
  "land": "أرض سكنية",
  "building": "عمارة سكنية",
  "office": "مكتب",
  "shop": "محل",
  "warehouse": "مستودع",
  "farm": "مزرعة",
  "محل تجاري": "محل",
  "مجمع عيادات": "مجمع طبي",
  "أرض": "أرض سكنية",
  "عمارة": "عمارة سكنية",
};

export function normalizeType(type: string): string {
  return LEGACY_ALIASES[type] || type;
}

const residentialSet = new Set(RESIDENTIAL_TYPES);
const commercialSet = new Set(COMMERCIAL_TYPES);

export function isResidential(type: string): boolean {
  const normalized = normalizeType(type);
  return residentialSet.has(normalized);
}

export function isCommercial(type: string): boolean {
  const normalized = normalizeType(type);
  return commercialSet.has(normalized);
}

export const PROPERTY_SPECIALTIES: Record<string, string[]> = {
  "مجمع طبي": [
    "أسنان", "باطنية", "عيون", "جلدية", "أطفال", "عظام",
    "نساء وولادة", "أنف وأذن وحنجرة", "مسالك بولية", "قلب",
    "مختبر تحاليل", "أشعة", "صيدلية", "علاج طبيعي", "تغذية",
  ],
  "عيادة طبية": [
    "أسنان", "باطنية", "عيون", "جلدية", "أطفال", "عظام",
    "نساء وولادة", "أنف وأذن وحنجرة", "علاج طبيعي", "تغذية",
  ],
  "مستشفى": [
    "عام", "تخصصي", "نفسي", "تأهيل", "أطفال", "نساء وولادة",
    "عيون", "قلب", "أورام", "كلى",
  ],
  "فندق": [
    "5 نجوم", "4 نجوم", "3 نجوم", "شقق فندقية", "بوتيك", "منتجع",
  ],
  "مطعم": [
    "وجبات سريعة", "مأكولات شعبية", "مأكولات عالمية", "مأكولات بحرية",
    "حلويات ومخبوزات", "كافيه ومشروبات",
  ],
  "مجمع تجاري": [
    "مول تجاري", "سوق مفتوح", "محلات تجزئة", "مكاتب", "معارض",
  ],
};

export function getSpecialties(propertyType: string): string[] {
  return PROPERTY_SPECIALTIES[propertyType] || [];
}
