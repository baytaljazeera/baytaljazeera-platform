// نوع الإعلان القادم من /api/listings
export type Listing = {
  id: string;
  title: string;
  description?: string;
  city?: string;
  district?: string;
  type?: string;
  purpose?: string;
  price?: number;
  area?: number;
  bedrooms?: number;
  bathrooms?: number;
  usage?: string;
  lister_type?: string;
  image_url?: string;
  created_at?: string;
  has_pool?: boolean;
  has_garden?: boolean;
  has_elevator?: boolean;
  parking_spaces?: string;
};

// فلاتر البحث
export type Filters = {
  country?: string;
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  minArea?: number;
  maxArea?: number;
  bedrooms?: number;
  bathrooms?: number;
  listerType?: string;
  propertyTypes?: string[];
  searchText?: string;
  hasPool?: boolean;
  hasGarden?: boolean;
  hasElevator?: boolean;
  hasParking?: boolean;
};

// تبويبات
export type PurposeTab = "all" | "sell" | "rent";
export type UsageTab = "residential" | "commercial";
export type ActivePanel = "price" | "area" | "beds" | "baths" | "city" | "propertyType" | "usage" | "purpose" | "more" | "none";
export type SortOption =
  | "recommended"
  | "newest"
  | "oldest"
  | "price_high"
  | "price_low"
  | "area_high"
  | "area_low"
  | "beds_desc";

export type ViewMode = "list" | "map";
