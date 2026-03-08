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
