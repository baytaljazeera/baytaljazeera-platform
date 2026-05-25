"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";

export const dynamic = 'force-dynamic';

import React, { JSX, useEffect, useMemo, useState, useRef, useCallback, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import dynamicImport from "next/dynamic";

const MapClient = dynamicImport(() => import("../../components/MapClient"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-100">
      <div className="text-center text-[#002845]/70">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#002845] mx-auto mb-2"></div>
        <span className="text-sm">جاري تحميل الخريطة...</span>
      </div>
    </div>
  ),
});

const SyncedMapPane = dynamicImport(() => import("../../components/search/SyncedMapPane"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-100">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#002845]"></div>
    </div>
  ),
});
import {
  Heart,
  MapPin,
  BedDouble,
  Bath,
  Square,
  ChevronDown,
  Map,
  List,
  X,
  SlidersHorizontal,
  Loader2,
} from "lucide-react";
import { useSearchMapStore } from "@/lib/stores/searchMapStore";
import { useCurrencyStore } from "@/lib/stores/currencyStore";
import type { PropertyMarker } from "@/components/search/SyncedMapPane";
import { getImageUrl } from "@/lib/imageUrl";
import MobileBottomSheet from "@/components/MobileBottomSheet";

// نوع الإعلان القادم من /api/listings
type Listing = {
  id: string;
  title: string;
  description?: string;
  country?: string; // الدولة
  city?: string;
  district?: string;
  type?: string; // شقة / فيلا / أرض / مجمع عيادات / ...
  purpose?: string; // بيع / إيجار
  price?: number;
  land_area?: number;
  building_area?: number;
  bedrooms?: number;
  bathrooms?: number;
  usage?: string; // سكني / تجاري (مستقبلاً)
  lister_type?: string; // مالك / وسيط / مكتب عقار (مستقبلاً)
  image_url?: string; // صورة الإعلان (الغلاف)
  cover_image?: string; // صورة الغلاف الصريحة من API
  images?: string[]; // جميع صور الإعلان
  created_at?: string; // تاريخ الإضافة
  has_pool?: boolean;
  has_garden?: boolean;
  has_elevator?: boolean;
  parking_spaces?: string;
  latitude?: number;
  longitude?: number;
  is_promotional?: boolean; // إعلان ترويجي/تجريبي
  deal_status?: string; // حالة الصفقة: active, negotiating, sold, rented, archived
  owner_phone?: string; // رقم هاتف المعلن (للواتساب)
  owner_name?: string;
};

// فلاتر البحث
type Filters = {
  country?: string;
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  minLandArea?: number;
  maxLandArea?: number;
  minBuildingArea?: number;
  maxBuildingArea?: number;
  bedrooms?: number;
  bathrooms?: number;
  listerType?: string;
  propertyTypes?: string[];
  searchText?: string;
  hasPool?: boolean;
  hasGarden?: boolean;
  hasElevator?: boolean;
  hasParking?: boolean;
  dealStatus?: string; // active, negotiating, sold, rented, archived
};

// تبويبات
type PurposeTab = "all" | "sell" | "rent";
type UsageTab = "all" | "residential" | "commercial";
type ActivePanel = "price" | "area" | "beds" | "baths" | "city" | "propertyType" | "usage" | "purpose" | "dealStatus" | "more" | "none";
type SortOption =
  | "recommended"
  | "newest"
  | "oldest"
  | "price_high"
  | "price_low"
  | "area_high"
  | "area_low"
  | "beds_desc";

type ViewMode = "list" | "map";

// دالة بناء رابط الـ API
function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL || "";
}

// ─── URL ↔ Filters ─────────────────────────────────────────────────────────
// تحويل قاموس الفلاتر إلى URLSearchParams (لمشاركة الرابط + رجوع آمن).
function filtersToSearchParams(filters: Filters, viewMode: ViewMode): URLSearchParams {
  const p = new URLSearchParams();
  if (viewMode) p.set("view", viewMode);
  if (filters.country) p.set("country", filters.country);
  if (filters.city) p.set("city", filters.city);
  if (filters.minPrice != null) p.set("minPrice", String(filters.minPrice));
  if (filters.maxPrice != null) p.set("maxPrice", String(filters.maxPrice));
  if (filters.minLandArea != null) p.set("minLandArea", String(filters.minLandArea));
  if (filters.maxLandArea != null) p.set("maxLandArea", String(filters.maxLandArea));
  if (filters.minBuildingArea != null) p.set("minBuildingArea", String(filters.minBuildingArea));
  if (filters.maxBuildingArea != null) p.set("maxBuildingArea", String(filters.maxBuildingArea));
  if (filters.bedrooms != null) p.set("bedrooms", String(filters.bedrooms));
  if (filters.bathrooms != null) p.set("bathrooms", String(filters.bathrooms));
  if (filters.listerType) p.set("listerType", filters.listerType);
  if (filters.propertyTypes && filters.propertyTypes.length > 0) {
    p.set("types", filters.propertyTypes.join(","));
  }
  if (filters.searchText) p.set("q", filters.searchText);
  if (filters.hasPool) p.set("pool", "1");
  if (filters.hasGarden) p.set("garden", "1");
  if (filters.hasElevator) p.set("elevator", "1");
  if (filters.hasParking) p.set("parking", "1");
  if (filters.dealStatus && filters.dealStatus !== "active") {
    p.set("dealStatus", filters.dealStatus);
  }
  return p;
}

// الاتجاه المعاكس: نقرأ URLSearchParams ونبني كائن Filters.
function searchParamsToFilters(sp: URLSearchParams): Filters {
  const out: Filters = { dealStatus: sp.get("dealStatus") || "active" };
  const num = (k: string) => {
    const v = sp.get(k);
    if (v == null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const country = sp.get("country"); if (country) out.country = country;
  const city = sp.get("city"); if (city) out.city = city;
  out.minPrice = num("minPrice");
  out.maxPrice = num("maxPrice");
  out.minLandArea = num("minLandArea");
  out.maxLandArea = num("maxLandArea");
  out.minBuildingArea = num("minBuildingArea");
  out.maxBuildingArea = num("maxBuildingArea");
  out.bedrooms = num("bedrooms");
  out.bathrooms = num("bathrooms");
  const lt = sp.get("listerType"); if (lt) out.listerType = lt;
  const types = sp.get("types"); if (types) out.propertyTypes = types.split(",").filter(Boolean);
  const q = sp.get("q"); if (q) out.searchText = q;
  if (sp.get("pool") === "1") out.hasPool = true;
  if (sp.get("garden") === "1") out.hasGarden = true;
  if (sp.get("elevator") === "1") out.hasElevator = true;
  if (sp.get("parking") === "1") out.hasParking = true;
  // remove undefined keys so equality checks stay clean
  Object.keys(out).forEach((k) => out[k as keyof Filters] === undefined && delete out[k as keyof Filters]);
  return out;
}

import { formatListingPriceByCountry as formatListingPrice } from "@/lib/stores/currencyStore";
import { RESIDENTIAL_TYPES, COMMERCIAL_TYPES, isCommercial, normalizeType } from "@/lib/propertyTypes";
import { SAUDI_CITIES, PRICE_HISTOGRAM, SORT_OPTIONS } from "@/components/search/constants";

// 🔁 سويتش قائمة / خريطة (تغيير عن طريق URL)
function ViewToggle({
  active,
  compact = false,
}: {
  active: ViewMode;
  compact?: boolean;
}) {
  return (
    <div className={`inline-flex rounded-full overflow-hidden border border-[#f6d879] bg-[#fffaf0] shadow-sm ${compact ? "text-[10px]" : "text-[10px] md:text-xs"}`}>
      <Link
        href="/search?view=list"
        className={`${compact ? "px-1.5 py-0.5" : "px-2 py-1"} font-semibold flex items-center gap-0.5 transition ${
          active === "list"
            ? "bg-[#002845] text-white"
            : "bg-transparent text-[#002845]"
        }`}
      >
        <span className="text-[10px]">☰</span>
        <span>قائمة</span>
      </Link>
      <Link
        href="/search?view=map"
        className={`${compact ? "px-1.5 py-0.5" : "px-2 py-1"} font-semibold flex items-center gap-0.5 transition ${
          active === "map"
            ? "bg-[#002845] text-white"
            : "bg-transparent text-[#002845]"
        }`}
      >
        <MapPin className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
        <span>خريطة</span>
      </Link>
    </div>
  );
}

// 🔘 FilterChip - زر فلتر موحد
function FilterChip({
  icon,
  label,
  active,
  onClick,
  title,
  maxLabelWidthClass = "max-w-[90px] sm:max-w-[120px]",
  variant = "default",
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  title?: string;
  maxLabelWidthClass?: string;
  variant?: "default" | "gold";
}) {
  const activeClasses =
    variant === "gold"
      ? "px-3.5 bg-[#D4AF37] text-[#002845] border-[#D4AF37]"
      : "px-3.5 bg-white text-[#002845] border-white";

  const inactiveClasses = "px-2.5 bg-white/15 text-white border-white/30 hover:bg-white/25";

  return (
    <button
      type="button"
      title={title ?? label}
      onClick={onClick}
      className={`rounded-full py-1.5 text-[10px] font-semibold border transition whitespace-nowrap flex items-center gap-1 ${
        active ? activeClasses : inactiveClasses
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className={`${maxLabelWidthClass} truncate`}>{label}</span>
    </button>
  );
}

function SortDropdown({
  value,
  onChange,
  compact = false,
}: {
  value: SortOption;
  onChange: (v: SortOption) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const active = SORT_OPTIONS.find((o) => o.value === value);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [open]);

  return (
    <div className={`relative ${compact ? "text-[10px]" : "text-[10px] md:text-xs"}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`inline-flex items-center gap-0.5 rounded-full border border-[#f6d879] bg-white font-semibold text-[#002845] shadow-sm hover:bg-[#fff5d8] transition ${
          compact ? "px-1.5 py-0.5" : "px-2 py-1"
        }`}
      >
        <span className={`truncate ${compact ? "max-w-[50px]" : "max-w-[70px] md:max-w-[90px]"}`}>
          {active?.label ?? "الأنسب"}
        </span>
        <ChevronDown className={compact ? "w-2.5 h-2.5 shrink-0" : "w-3 h-3 shrink-0"} />
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-48 rounded-xl bg-white shadow-xl border border-slate-100 py-1 z-[9999]">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`w-full flex flex-col items-end text-right px-3 py-1.5 transition ${
                value === opt.value
                  ? "bg-[#fff5d8] text-[#002845]"
                  : "bg-transparent text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span className="text-[11px] font-semibold">{opt.label}</span>
              {opt.subLabel && (
                <span className="text-[9px] text-slate-500">
                  {opt.subLabel}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// =================== صفحة البحث الرئيسية ===================

function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // Next.js types `useSearchParams()` as nullable; treat null as empty params.
  const safeParams: URLSearchParams = useMemo(() => {
    if (!searchParams) return new URLSearchParams();
    return new URLSearchParams(searchParams.toString());
  }, [searchParams]);
  const viewMode = (safeParams.get("view") || "map") as ViewMode; // ✅ قراءة من URL

  const [listings, setListings] = useState<Listing[]>([]);
  // Hydrate filters from URL on mount so a shared link / refresh keeps state.
  const [filters, setFilters] = useState<Filters>(() => searchParamsToFilters(safeParams));

  // Pagination state — backend already supports page/limit + hasMore.
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [purposeTab, setPurposeTab] = useState<PurposeTab>("all"); // سيتم تعيينه بناءً على الإعلانات
  const [purposeInitialized, setPurposeInitialized] = useState(false); // لتجنب إعادة التعيين
  const [usageTab, setUsageTab] = useState<UsageTab>("all");
  const [activePanel, setActivePanel] = useState<ActivePanel>("none");
  const [sortOption, setSortOption] = useState<SortOption>("recommended");
  const [isLoading, setIsLoading] = useState(true);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [mobileCities, setMobileCities] = useState<{id: number; name_ar: string; flag_emoji: string}[]>([]);
  const [mobileCitiesLoading, setMobileCitiesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const favoritesSet = useMemo(() => new Set(favorites), [favorites]);
  const [activeListingId, setActiveListingId] = useState<string | null>(null);
  const filterBarRef = useRef<HTMLDivElement>(null);
  const [searchInput, setSearchInput] = useState("");
  const [showMiniMap, setShowMiniMap] = useState(true);
  const listingsContainerRef = useRef<HTMLDivElement>(null);
  const [showPromoOverlay, setShowPromoOverlay] = useState(true);
  
  const { setActiveListingId: setStoreActiveId, setHoveredListingId, setMapCenter, flyToCountry, flyToCoords, resetToDefault } = useSearchMapStore();
  
  // ✅ كشف موقع الزائر تلقائيًا عند التحميل - فقط للانتقال على الخريطة بدون فلترة
  useEffect(() => {
    const detectUserLocation = async () => {
      try {
        const apiBase = getApiBase();
        const res = await fetch(`${apiBase}/api/geolocation/detect`);
        const data = await res.json();
        if (data.country?.code && 
            typeof data.country.lat === 'number' && !isNaN(data.country.lat) &&
            typeof data.country.lng === 'number' && !isNaN(data.country.lng)) {
          flyToCoords(data.country.lat, data.country.lng, data.country.zoom || 6);
        }
      } catch (err) {
        console.error("Error detecting location:", err);
      }
    };
    detectUserLocation();
  }, [flyToCoords]);
  
  // ✅ تحريك الخريطة عند تغيير فلتر الدولة
  useEffect(() => {
    const COUNTRY_NAME_TO_CODE: Record<string, string> = {
      "السعودية": "SA",
      "الإمارات": "AE",
      "الكويت": "KW",
      "قطر": "QA",
      "البحرين": "BH",
      "عمان": "OM",
      "مصر": "EG",
      "لبنان": "LB",
      "تركيا": "TR",
    };
    if (filters.country) {
      const countryCode = COUNTRY_NAME_TO_CODE[filters.country];
      if (countryCode) {
        flyToCountry(countryCode);
      }
    } else {
      resetToDefault();
    }
  }, [filters.country, flyToCountry, resetToDefault]);
  
  // ✅ جلب المدن للموبايل حسب الدولة المختارة
  useEffect(() => {
    const fetchMobileCities = async () => {
      setMobileCitiesLoading(true);
      try {
        const COUNTRY_NAME_TO_CODE: Record<string, string> = {
          "السعودية": "SA", "الإمارات": "AE", "الكويت": "KW", "قطر": "QA",
          "البحرين": "BH", "عمان": "OM", "مصر": "EG", "لبنان": "LB", "تركيا": "TR",
        };
        const countryCode = filters.country ? COUNTRY_NAME_TO_CODE[filters.country] : null;
        const url = countryCode 
          ? `/api/locations/cities?country_code=${countryCode}`
          : "/api/locations/cities?popular_only=true";
        const res = await fetch(url);
        const data = await res.json();
        setMobileCities(data.cities || []);
      } catch (err) {
        console.error("Error fetching mobile cities:", err);
      }
      setMobileCitiesLoading(false);
    };
    fetchMobileCities();
  }, [filters.country]);
  
  // ✅ Debounce للبحث النصي - 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters(f => ({ ...f, searchText: searchInput }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);
  
  // ✅ تزامن searchInput مع filters.searchText عند مسح الفلاتر
  useEffect(() => {
    if (filters.searchText === undefined || filters.searchText === "") {
      setSearchInput("");
    }
  }, [filters.searchText]);
  
  // ✅ إغلاق النوافذ عند النقر خارجها - useEffect واحد فقط
  useEffect(() => {
    if (activePanel === "none") return;
    
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Element;
      if (filterBarRef.current && !filterBarRef.current.contains(target)) {
        setActivePanel("none");
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [activePanel]);
  
  // ✅ إغلاق النوافذ بزر Escape
  useEffect(() => {
    if (activePanel === "none") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActivePanel("none");
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activePanel]);
  
  // نخبة العقارات
  const [eliteProperties, setEliteProperties] = useState<{
    id: string;
    property_id: string;
    title: string;
    city: string;
    district?: string;
    country?: string;
    price: number;
    land_area?: number;
    building_area?: number;
    type?: string;
    purpose?: string;
    bedrooms?: number;
    bathrooms?: number;
    image_url?: string;
    cover_image?: string;
    tier?: string;
    slot_id?: number;
    display_order?: number;
  }[]>([]);

  // المدن الأكثر طلبًا
  const [featuredCities, setFeaturedCities] = useState<{
    id: number;
    name_ar: string;
    name_en: string | null;
    country_code: string;
    country_name_ar: string | null;
    image_url: string | null;
    is_capital: boolean;
  }[]>([]);

  // (إزالة effect قديم كان يقرأ ?city من URL — الآن الـ initial state يقرأ كل الفلاتر من URL مرة واحدة عند الـ mount)

  // 🌟 جلب نخبة العقارات
  useEffect(() => {
    async function fetchEliteProperties() {
      try {
        const apiBase = getApiBase();
        const res = await fetch(`${apiBase}/api/elite-slots/featured-properties`);
        if (res.ok) {
          const data = await res.json();
          if (data.properties && Array.isArray(data.properties)) {
            setEliteProperties(data.properties.slice(0, 4));
          }
        }
      } catch {
        // صامت - لا نعرض خطأ للمستخدم
      }
    }
    fetchEliteProperties();
  }, []);

  // 🏙️ جلب المدن الأكثر طلبًا
  useEffect(() => {
    async function fetchFeaturedCities() {
      try {
        const apiBase = getApiBase();
        const res = await fetch(`${apiBase}/api/featured-cities?active_only=true`);
        if (res.ok) {
          const data = await res.json();
          if (data.cities && Array.isArray(data.cities)) {
            setFeaturedCities(data.cities.slice(0, 8));
          }
        }
      } catch {
        // صامت
      }
    }
    fetchFeaturedCities();
  }, []);

  // 🔴 جلب المفضلة من الخادم (فقط للمستخدمين المسجلين)
  useEffect(() => {
    async function fetchFavorites() {
      const apiBase = getApiBase();
      try {
        const res = await fetch(`${apiBase}/api/favorites/ids`, {
          credentials: "include",
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ids && Array.isArray(data.ids)) {
            setFavorites(data.ids);
          }
        }
        // لا نعرض خطأ إذا كان المستخدم غير مسجل
      } catch {
        // صامت - المستخدم غير مسجل أو خطأ في الاتصال
      }
    }
    fetchFavorites();
  }, []);

  // 🟢 جلب الإعلانات (صفحة أولى)
  useEffect(() => {
    async function loadFirstPage() {
      try {
        setIsLoading(true);
        setError(null);
        setPage(1);
        const apiBase = getApiBase();
        const cityParam = filters.city ? `&city=${encodeURIComponent(filters.city)}` : "";
        const res = await fetch(`${apiBase}/api/listings?page=1&limit=${PAGE_SIZE}${cityParam}`);
        if (!res.ok) throw new Error("فشل في تحميل الإعلانات من الخادم");
        const data = await res.json();
        const listingsArray: Listing[] = Array.isArray(data) ? data : (data.listings || []);
        setListings(listingsArray);
        setHasMore(Boolean(data?.pagination?.hasMore));

        // تعيين الـ tab الافتراضي بناءً على الإعلانات الموجودة
        if (!purposeInitialized && listingsArray.length > 0) {
          const hasSell = listingsArray.some((l: Listing) => l.purpose === "بيع" || l.purpose === "للبيع");
          const hasRent = listingsArray.some((l: Listing) => l.purpose === "إيجار" || l.purpose === "للإيجار");

          if (hasSell && !hasRent) {
            setPurposeTab("sell");
          } else if (hasRent && !hasSell) {
            setPurposeTab("rent");
          } else {
            setPurposeTab("sell"); // إذا كان هناك كلاهما، نبدأ بالبيع
          }
          setPurposeInitialized(true);
        }
      } catch (err) {
        console.error("Error loading listings:", err);
        setError("تعذّر تحميل الإعلانات، يرجى المحاولة لاحقًا.");
      } finally {
        setIsLoading(false);
      }
    }
    loadFirstPage();
  }, [filters.city, purposeInitialized]);

  // 🟢 تحميل صفحة إضافية (Load more)
  const loadMoreListings = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    try {
      setLoadingMore(true);
      const apiBase = getApiBase();
      const nextPage = page + 1;
      const cityParam = filters.city ? `&city=${encodeURIComponent(filters.city)}` : "";
      const res = await fetch(`${apiBase}/api/listings?page=${nextPage}&limit=${PAGE_SIZE}${cityParam}`);
      if (!res.ok) throw new Error("فشل في تحميل المزيد");
      const data = await res.json();
      const more: Listing[] = Array.isArray(data) ? data : (data.listings || []);
      setListings((prev) => {
        const seen = new Set(prev.map((l) => l.id));
        const deduped = more.filter((l) => !seen.has(l.id));
        return [...prev, ...deduped];
      });
      setHasMore(Boolean(data?.pagination?.hasMore));
      setPage(nextPage);
    } catch (err) {
      console.error("Error loading more listings:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [filters.city, page, hasMore, loadingMore]);

  // 🟢 مزامنة الفلاتر مع URL (debounced) — يجعل الرابط قابلاً للمشاركة وآمناً عند الـ refresh.
  useEffect(() => {
    const t = setTimeout(() => {
      const sp = filtersToSearchParams(filters, viewMode);
      const qs = sp.toString();
      const base = pathname || "/search";
      const target = qs ? `${base}?${qs}` : base;
      router.replace(target, { scroll: false });
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, viewMode]);


  // 🧠 فلترة + ترتيب الإعلانات
  const filteredListings = useMemo(() => {
    if (!Array.isArray(listings)) return [];
    const results = listings.filter((item) => {
      let ok = true;

      // 1) سكني / تجاري / الكل
      const itemType = item.type || "";
      if (usageTab === "residential") {
        if (isCommercial(itemType)) ok = false;
      } else if (usageTab === "commercial") {
        if (!isCommercial(itemType)) ok = false;
      }
      // usageTab === "all" → لا فلترة

      // 2) بيع / إيجار
      if (purposeTab === "sell" && item.purpose !== "بيع" && item.purpose !== "للبيع") ok = false;
      if (purposeTab === "rent" && item.purpose !== "إيجار" && item.purpose !== "للإيجار") ok = false;

      // 3) أنواع العقار
      if (filters.propertyTypes && filters.propertyTypes.length > 0) {
        if (!item.type || !filters.propertyTypes.includes(item.type)) {
          ok = false;
        }
      }

      // 4) الدولة - إذا تم اختيار دولة معينة، اعرض فقط إعلانات تلك الدولة
      // ملاحظة: الإعلانات القديمة بدون country تُعتبر سعودية
      if (filters.country) {
        const listingCountry = item.country || "السعودية";
        if (listingCountry !== filters.country) ok = false;
      }

      // 4b) المدينة - إذا تم اختيار مدينة معينة، اعرض فقط إعلانات تلك المدينة
      if (filters.city) {
        if (!item.city || item.city !== filters.city) ok = false;
      }

      // 5) نوع المعلن
      if (filters.listerType && item.lister_type) {
        if (item.lister_type !== filters.listerType) ok = false;
      }

      // 6) السعر
      if (typeof filters.minPrice === "number" && item.price != null) {
        if (item.price < filters.minPrice) ok = false;
      }
      if (typeof filters.maxPrice === "number" && item.price != null) {
        if (item.price > filters.maxPrice) ok = false;
      }

      // 7) مساحة الأرض
      if (typeof filters.minLandArea === "number" && item.land_area != null) {
        if (item.land_area < filters.minLandArea) ok = false;
      }
      if (typeof filters.maxLandArea === "number" && item.land_area != null) {
        if (item.land_area > filters.maxLandArea) ok = false;
      }

      // 7b) مساحة البناء
      if (typeof filters.minBuildingArea === "number" && item.building_area != null) {
        if (item.building_area < filters.minBuildingArea) ok = false;
      }
      if (typeof filters.maxBuildingArea === "number" && item.building_area != null) {
        if (item.building_area > filters.maxBuildingArea) ok = false;
      }

      // 8) عدد الغرف
      if (typeof filters.bedrooms === "number" && item.bedrooms != null) {
        if (item.bedrooms < filters.bedrooms) ok = false;
      }

      // 9) عدد دورات المياه
      if (typeof filters.bathrooms === "number" && item.bathrooms != null) {
        if (item.bathrooms < filters.bathrooms) ok = false;
      }

      // 10) نص البحث
      if (filters.searchText) {
        const q = filters.searchText.toLowerCase();
        const haystack = [
          item.title,
          item.description,
          item.city,
          item.district,
          item.type,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) ok = false;
      }

      // 11) المرافق
      if (filters.hasPool && !item.has_pool) ok = false;
      if (filters.hasGarden && !item.has_garden) ok = false;
      if (filters.hasElevator && !item.has_elevator) ok = false;
      if (filters.hasParking && (!item.parking_spaces || item.parking_spaces === "0")) ok = false;

      // 12) حالة العقار (الافتراضي: الكل)
      const dealStatusFilter = filters.dealStatus || "all";
      if (dealStatusFilter !== "all") {
        const itemStatus = item.deal_status || "active";
        if (itemStatus !== dealStatusFilter) ok = false;
      }

      return ok;
    });

    if (sortOption === "recommended") return results;

    const sorted = [...results];

    const compareNumberDesc = (
      a: number | undefined,
      b: number | undefined
    ) => {
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      return b - a;
    };

    const compareNumberAsc = (
      a: number | undefined,
      b: number | undefined
    ) => {
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      return a - b;
    };

    switch (sortOption) {
      case "newest":
        sorted.sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA;
        });
        break;
      case "oldest":
        sorted.sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateA - dateB;
        });
        break;
      case "price_high":
        sorted.sort((a, b) => compareNumberDesc(a.price, b.price));
        break;
      case "price_low":
        sorted.sort((a, b) => compareNumberAsc(a.price, b.price));
        break;
      case "area_high":
        sorted.sort((a, b) => compareNumberDesc(a.land_area, b.land_area));
        break;
      case "area_low":
        sorted.sort((a, b) => compareNumberAsc(a.land_area, b.land_area));
        break;
      case "beds_desc":
        sorted.sort((a, b) =>
          compareNumberDesc(a.bedrooms ?? undefined, b.bedrooms ?? undefined)
        );
        break;
    }

    return sorted;
  }, [listings, filters, purposeTab, usageTab, sortOption]);

  // 🗺 العقار المختار للمعاينة على الخريطة
  const selectedListing = useMemo(
    () => filteredListings.find((x) => x.id === activeListingId) ?? null,
    [filteredListings, activeListingId]
  );

  // 🗺 قائمة الإعلانات للخريطة مع isFavorite
  const mapListings = useMemo(
    () => filteredListings.map(l => ({ ...l, isFavorite: favoritesSet.has(l.id) })),
    [filteredListings, favoritesSet]
  );

  const handleUsageClick = (value: "residential" | "commercial") => {
    if (usageTab === "all") {
      setUsageTab(value);
    } else if (usageTab === value) {
      setUsageTab("all");
    } else {
      setUsageTab("all");
    }
    setFilters(prev => ({ ...prev, propertyTypes: undefined }));
  };

  const handlePurposeClick = (value: "sell" | "rent") => {
    if (purposeTab === "all") {
      setPurposeTab(value);
    } else if (purposeTab === value) {
      setPurposeTab("all");
    } else {
      setPurposeTab("all");
    }
  };

  async function toggleFavorite(id: string, isFavorite?: boolean): Promise<void> {
    const apiBase = getApiBase();
    
    try {
      // تحديث الحالة فوراً في الواجهة بناءً على isFavorite
      if (typeof isFavorite === 'boolean') {
        setFavorites((prev) => {
          if (isFavorite) {
            // إضافة إلى المفضلة
            if (!prev.includes(id)) {
              return [...prev, id];
            }
            return prev;
          } else {
            // إزالة من المفضلة
            return prev.filter((fid) => fid !== id);
          }
        });
      }
      
      // إرسال الطلب في الخلفية - دائماً نستخدم toggle API
      const res = await fetch(`${apiBase}/api/favorites/toggle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        credentials: "include",
        body: JSON.stringify({ listingId: id }),
      });
      
      if (res.ok) {
        const data = await res.json();
        // تحديث الحالة بناءً على الاستجابة من الخادم للتأكد من التزامن
        setFavorites((prev) => {
          if (data.favorited) {
            if (!prev.includes(id)) {
              return [...prev, id];
            }
            return prev;
          } else {
            return prev.filter((fid) => fid !== id);
          }
        });
        // إرسال حدث لتحديث عداد المفضلة في الـ Navbar
        window.dispatchEvent(new CustomEvent('favoritesUpdated'));
      } else if (res.status === 401) {
        window.location.href = "/login";
        // Rollback في حالة عدم التصريح
        if (typeof isFavorite === 'boolean') {
          setFavorites((prev) => {
            if (isFavorite) {
              return prev.filter((fid) => fid !== id);
            } else {
              if (!prev.includes(id)) {
                return [...prev, id];
              }
              return prev;
            }
          });
        }
        throw new Error("Unauthorized");
      } else {
        // Rollback في حالة الخطأ
        if (typeof isFavorite === 'boolean') {
          setFavorites((prev) => {
            if (isFavorite) {
              return prev.filter((fid) => fid !== id);
            } else {
              if (!prev.includes(id)) {
                return [...prev, id];
              }
              return prev;
            }
          });
        }
        const errorData = await res.json().catch(() => ({ error: "حدث خطأ" }));
        console.error("Toggle favorite error:", errorData);
        throw new Error(errorData.error || "فشل في تحديث المفضلة");
      }
    } catch (err) {
      console.error("Toggle favorite error:", err);
      // Rollback في حالة الخطأ
      if (typeof isFavorite === 'boolean') {
        setFavorites((prev) => {
          if (isFavorite) {
            return prev.filter((fid) => fid !== id);
          } else {
            if (!prev.includes(id)) {
              return [...prev, id];
            }
            return prev;
          }
        });
      }
      throw err;
    }
  }

  // ===== واجهة النتائج / الخريطة =====

  let content: JSX.Element;

  if (isLoading) {
    content = (
      <div className="text-center text-[#002845]/70 py-10 text-sm md:text-base">
        جاري تحميل الإعلانات...
      </div>
    );
  } else if (error) {
    content = (
      <div className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
        {error}
      </div>
    );
  } else if (viewMode === "list") {
    // 👁 عرض القائمة مع خريطة جانبية متزامنة
    const mapMarkers: PropertyMarker[] = filteredListings
      .filter(l => l.latitude && l.longitude)
      .map(l => ({
        id: l.id,
        title: l.title,
        city: l.city || "",
        district: l.district,
        price: l.price || 0,
        type: l.type || "",
        purpose: l.purpose || "",
        bedrooms: l.bedrooms,
        bathrooms: l.bathrooms,
        area: l.land_area,
        lat: typeof l.latitude === 'string' ? parseFloat(l.latitude) : l.latitude!,
        lng: typeof l.longitude === 'string' ? parseFloat(l.longitude) : l.longitude!,
        image_url: l.image_url,
        images: l.images,
        deal_status: l.deal_status,
      }));

    if (filteredListings.length === 0) {
      // بطاقات ترويجية جميلة عند عدم وجود نتائج
      const promoCards = [
        { id: 1, img: "/jeddah.jpg", tagline: "كن أول من يعلن عقاره هنا", highlight: "فرصة ذهبية", desc: "اجعل عقارك يظهر أمام آلاف الباحثين" },
        { id: 2, img: "/riyadh.jpg", tagline: "أعلن الآن واحصد النتائج", highlight: "عرض خاص", desc: "ضاعف فرص بيع أو تأجير عقارك" },
        { id: 3, img: "/madinah.jpg", tagline: "عقارك في دائرة الضوء", highlight: "مميز", desc: "ظهور حصري في نتائج البحث الأولى" },
        { id: 4, img: "/makkah.jpg", tagline: "انضم لنخبة المُعلنين", highlight: "نخبة", desc: "احجز مكانك بين أفضل العقارات" },
      ];
      
      content = (
        <div className="space-y-6">
          {/* رسالة رئيسية */}
          <div className="bg-gradient-to-l from-[#001A33] to-[#002845] rounded-3xl shadow-xl p-8 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-l from-[#D4AF37] to-[#B8860B]" />
            <div className="w-16 h-16 mx-auto rounded-full bg-[#D4AF37]/20 border-2 border-dashed border-[#D4AF37] flex items-center justify-center mb-4">
              <span className="text-3xl">🏠</span>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">
              لا توجد عقارات في هذه المنطقة حالياً
            </h3>
            <p className="text-[#D4AF37] text-sm mb-4">
              كن أول من يعلن ويحصل على ظهور حصري!
            </p>
            <Link 
              href="/listings/new"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#001A33] text-sm font-bold hover:shadow-lg transition"
            >
              <span>✨</span>
              أضف إعلانك الآن
            </Link>
          </div>
          
          {/* بطاقات ترويجية */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {promoCards.map((card) => (
              <Link
                key={card.id}
                href="/listings/new"
                className="relative bg-[#FBF7F0] rounded-2xl overflow-hidden shadow-md hover:shadow-xl hover:-translate-y-2 transition-all duration-300 cursor-pointer group"
              >
                <div className="relative h-40">
                  <Image
                    src={card.img}
                    alt={card.tagline}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover opacity-60 group-hover:opacity-40 transition-opacity"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#001A33]/90 via-[#001A33]/50 to-transparent" />
                  
                  <span className="absolute top-3 right-3 bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#001A33] text-[10px] px-2.5 py-1 rounded-full font-bold flex items-center gap-1">
                    <span>⭐</span>
                    {card.highlight}
                  </span>

                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                    <div className="w-12 h-12 rounded-full bg-[#D4AF37]/20 border-2 border-dashed border-[#D4AF37] flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                      <span className="text-xl">👑</span>
                    </div>
                    <h4 className="text-white font-bold text-sm mb-1 drop-shadow-lg">
                      {card.tagline}
                    </h4>
                    <p className="text-[#D4AF37] text-[10px] font-medium">
                      {card.desc}
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-gradient-to-l from-[#001A33] to-[#002845] text-center">
                  <p className="text-white/80 text-[10px]">
                    <span className="text-[#D4AF37] font-bold">اضغط</span> لإضافة إعلانك
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      );
    } else {
      content = (
        <div className="flex gap-4 relative">
          {/* 🏠 قائمة العقارات - 70% أو 100% حسب حالة الخريطة */}
          <div 
            ref={listingsContainerRef}
            className={`transition-all duration-300 ${showMiniMap ? 'w-full lg:w-[70%]' : 'w-full'}`}
          >
            <div className="grid gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
              {filteredListings.map((item) => {
                const currentIsFavorite = favoritesSet.has(item.id);
                return (
                  <PropertyCard
                    key={item.id}
                    listing={item}
                    isFavorite={currentIsFavorite}
                    onToggleFavorite={() => toggleFavorite(item.id, !currentIsFavorite)}
                    onHover={() => {
                      setActiveListingId(item.id);
                      setStoreActiveId(item.id);
                      if (item.latitude && item.longitude) {
                        const lat = typeof item.latitude === 'string' ? parseFloat(item.latitude) : item.latitude;
                        const lng = typeof item.longitude === 'string' ? parseFloat(item.longitude) : item.longitude;
                        setMapCenter([lat, lng]);
                      }
                    }}
                    isActive={activeListingId === item.id}
                  />
                );
              })}
            </div>

            {/* زر تحميل المزيد — يظهر فقط لما السيرفر يقول إن في صفحات إضافية */}
            {hasMore && (
              <div className="flex justify-center mt-6">
                <button
                  type="button"
                  onClick={loadMoreListings}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#002845] text-white font-bold shadow hover:bg-[#003366] disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {loadingMore ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      جاري التحميل...
                    </>
                  ) : (
                    <>
                      عرض المزيد
                      <span className="text-xs opacity-75">({listings.length} حتى الآن)</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* 🗺 خريطة جانبية متزامنة - 30% على الشاشات الكبيرة */}
          {showMiniMap && mapMarkers.length > 0 && (
            <div className="hidden lg:block w-[30%] sticky top-24 h-[calc(100vh-120px)] rounded-2xl overflow-hidden border border-[#D4AF37]/30 shadow-lg">
              <div className="absolute top-3 left-3 z-[1000]">
                <button
                  onClick={() => setShowMiniMap(false)}
                  className="p-2 bg-white/90 backdrop-blur-sm rounded-lg shadow-md hover:bg-white transition border border-slate-200"
                  title="إخفاء الخريطة"
                >
                  <X className="w-4 h-4 text-slate-600" />
                </button>
              </div>
              <SyncedMapPane 
                markers={mapMarkers}
                onMarkerClick={(marker) => {
                  setActiveListingId(marker.id);
                  const element = document.querySelector(`[data-listing-id="${marker.id}"]`);
                  element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
              />
            </div>
          )}

          {/* رسالة عند عدم توفر إحداثيات */}
          {showMiniMap && mapMarkers.length === 0 && filteredListings.length > 0 && (
            <div className="hidden lg:flex w-[30%] sticky top-24 h-[200px] rounded-2xl overflow-hidden border border-[#D4AF37]/30 shadow-lg bg-gradient-to-br from-slate-50 to-slate-100 items-center justify-center">
              <div className="text-center p-4">
                <span className="text-3xl mb-2 block">🗺️</span>
                <p className="text-sm text-slate-600">لا تتوفر إحداثيات لهذه العقارات</p>
                <button
                  onClick={() => setShowMiniMap(false)}
                  className="mt-2 text-xs text-[#D4AF37] hover:underline"
                >
                  إخفاء
                </button>
              </div>
            </div>
          )}

          {/* زر إظهار الخريطة - يظهر عند إخفائها */}
          {!showMiniMap && mapMarkers.length > 0 && (
            <button
              onClick={() => setShowMiniMap(true)}
              className="hidden lg:flex fixed left-4 bottom-4 z-50 items-center gap-2 px-4 py-3 bg-[#002845] text-white rounded-xl shadow-lg hover:bg-[#003366] transition"
            >
              <Map className="w-5 h-5" />
              <span className="font-semibold">إظهار الخريطة</span>
            </button>
          )}

          {/* زر الخريطة للموبايل - تصميم Zillow */}
          {mapMarkers.length > 0 && (
            <button
              onClick={() => window.location.href = '/search?view=map'}
              className="lg:hidden fixed left-1/2 -translate-x-1/2 bottom-6 z-50 flex items-center gap-2 px-6 py-3.5 bg-[#002845] text-white rounded-full shadow-2xl active:scale-95 transition font-bold text-sm"
            >
              <Map className="w-5 h-5" />
              <span>الخريطة</span>
            </button>
          )}
        </div>
      );
    }
  } else if (viewMode === "map") {
    // 🗺 عرض الخريطة فقط - شريط الفلاتر موحد في return
    content = (
      <div className="relative h-[calc(100vh-180px)] sm:h-[600px] md:h-[700px] lg:h-[800px] rounded-2xl sm:rounded-3xl overflow-hidden border border-slate-200 sm:border-[#f6d879]/60 shadow-lg sm:shadow-[0_10px_30px_-10px_rgba(0,0,0,0.35)] bg-white">
        <MapClient 
          listings={mapListings} 
          selectedCity={filters.city}
          selectedListingId={activeListingId}
          onSelectListing={(id) => setActiveListingId(id)}
          onToggleFavorite={(listingId, isFavorite) => {
            toggleFavorite(listingId, isFavorite);
          }}
          showFavoriteButton={true}
        />

        {isLoading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center text-[#002845]/80 text-sm font-semibold pointer-events-none">
            جاري تحميل الإعلانات...
          </div>
        )}

        {error && (
          <div className="absolute top-4 right-4 left-4 md:left-auto md:w-80 bg-white/95 border border-red-100 text-red-700 text-xs rounded-2xl px-3 py-2 shadow-lg">
            {error}
          </div>
        )}

        {!isLoading && !error && filteredListings.length === 0 && showPromoOverlay && (
          <div className="absolute inset-0 z-[1000] bg-gradient-to-b from-transparent via-[#001A33]/70 to-[#001A33]/95 backdrop-blur-sm flex flex-col items-center justify-center p-4 sm:p-6 transition-opacity duration-500 opacity-100">
            <div className="relative bg-gradient-to-br from-[#001A33] via-[#002845] to-[#001A33] rounded-3xl p-6 sm:p-10 max-w-lg w-full text-center shadow-2xl border border-[#D4AF37]/40 overflow-hidden transition-all duration-500 transform scale-100">
              {/* Background decoration */}
              <div className="absolute inset-0 bg-gradient-to-br from-[#D4AF37]/5 to-transparent pointer-events-none" />
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent" />
              
              {/* Close button - improved */}
              <button
                onClick={() => setShowPromoOverlay(false)}
                className="absolute top-4 left-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white transition-all duration-200 hover:scale-110 active:scale-95 shadow-lg border border-white/10"
                title="إغلاق"
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
              
              {/* Icon with animation */}
              <div className="relative w-24 h-24 mx-auto mb-6">
                <div className="absolute inset-0 rounded-full bg-[#D4AF37]/20 animate-ping opacity-75" />
                <div className="absolute inset-2 rounded-full bg-[#D4AF37]/30 animate-pulse" />
                <div className="relative w-full h-full rounded-full bg-gradient-to-br from-[#D4AF37]/30 to-[#B8860B]/30 border-2 border-dashed border-[#D4AF37] flex items-center justify-center shadow-lg backdrop-blur-sm">
                  <span className="text-5xl animate-bounce">🏠</span>
                </div>
              </div>
              
              {/* Title */}
              <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3 leading-tight">
                لا توجد عقارات في هذه المنطقة حالياً
              </h3>
              
              {/* Description */}
              <p className="text-[#D4AF37] text-base sm:text-lg mb-2 font-medium">
                كن أول من يعلن ويحصل على ظهور حصري! ✨
              </p>
              <p className="text-white/70 text-sm mb-8">
                ابدأ اليوم وتمتع بظهور مميز في نتائج البحث
              </p>
              
              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                <Link 
                  href="/listings/new"
                  className="group relative inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#001A33] font-bold hover:shadow-2xl transition-all duration-300 text-base sm:text-lg hover:scale-105 active:scale-95 overflow-hidden"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <span className="relative flex items-center gap-2">
                    <span className="text-xl animate-pulse">✨</span>
                    أضف إعلانك الآن
                  </span>
                </Link>
                
                <button
                  onClick={() => {
                    setFilters({});
                    setPurposeTab("all");
                    setShowPromoOverlay(false);
                  }}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white font-semibold text-sm transition-all duration-200 hover:scale-105 active:scale-95 border border-white/20"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  جرب فلتر آخر
                </button>
              </div>
              
              {/* Benefits list */}
              <div className="mt-8 pt-6 border-t border-white/10">
                <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm text-white/70">
                  <div className="flex items-center gap-2">
                    <span className="text-[#D4AF37]">✓</span>
                    <span>ظهور حصري</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[#D4AF37]">✓</span>
                    <span>أول النتائج</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[#D4AF37]">✓</span>
                    <span>وصول أفضل</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[#D4AF37]">✓</span>
                    <span>دعم فني</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* زر العودة للقائمة */}
        <button
          onClick={() => window.location.href = '/search?view=list'}
          className="absolute top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 bg-white/95 backdrop-blur text-[#002845] rounded-full shadow-lg active:scale-95 transition font-bold text-sm border border-slate-200"
        >
          <List className="w-4 h-4" />
          <span className="lg:inline hidden">القائمة</span>
        </button>
      </div>
    );
  } else {
    // fallback - shouldn't reach here
    content = (
      <div className="bg-white rounded-3xl shadow-md p-6 text-center text-[#002845]/80 text-sm md:text-base">
        عذراً، حدث خطأ غير متوقع.
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundImage: "url('/patterns/hero-2.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
      dir="rtl"
    >
      <div className="flex-1">
        <div className="max-w-7xl mx-auto w-full pt-3 pb-4 px-4 md:px-8 space-y-3">
          {/* شريط الفلاتر الرئيسي - موحد للخريطة والقائمة - sticky ملتصق بالـ navbar */}
          <div className="sticky top-[75px] z-[100]" ref={filterBarRef}>
            {/* 📱 شريط الجوال المبسط - فقط قائمة/خريطة + فلترة */}
            <div className="sm:hidden bg-[#002845] rounded-2xl shadow-lg border border-[#D4AF37]/30 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                {/* أزرار التبديل قائمة/خريطة */}
                <div className="flex items-center gap-1.5 bg-white/10 rounded-full p-1">
                  <Link
                    href="/search?view=list"
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition ${
                      viewMode === "list"
                        ? "bg-white text-[#002845]"
                        : "text-white/80"
                    }`}
                  >
                    <List className="w-4 h-4" />
                    <span>قائمة</span>
                  </Link>
                  <Link
                    href="/search?view=map"
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition ${
                      viewMode === "map"
                        ? "bg-white text-[#002845]"
                        : "text-white/80"
                    }`}
                  >
                    <Map className="w-4 h-4" />
                    <span>خريطة</span>
                  </Link>
                </div>

                {/* زر الفلترة مع عداد */}
                <button
                  type="button"
                  onClick={() => setShowMobileFilters(true)}
                  className="relative min-h-[44px] min-w-[44px] flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-[#D4AF37] text-[#002845] text-mobile-sm font-bold touch-manipulation active:scale-95"
                  aria-label="فتح الفلاتر"
                >
                  <SlidersHorizontal className="w-5 h-5" />
                  <span>فلترة</span>
                  {(() => {
                    const count = [
                      filters.city,
                      searchInput,
                      usageTab !== "all",
                      purposeTab !== "all",
                      filters.propertyTypes?.length,
                      filters.minPrice || filters.maxPrice,
                      filters.minLandArea || filters.maxLandArea,
                      filters.bedrooms,
                      filters.bathrooms,
                      filters.hasPool,
                      filters.hasGarden,
                      filters.hasElevator,
                      filters.hasParking,
                    ].filter(Boolean).length;
                    return count > 0 ? (
                      <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[22px] h-[22px] text-mobile-xs font-bold bg-red-500 text-white rounded-full px-1.5">{count > 99 ? '99+' : count}</span>
                    ) : null;
                  })()}
                </button>
              </div>
            </div>

            {/* 💻 شريط الديسكتوب الكامل */}
            <div className="hidden sm:block bg-[#002845] rounded-2xl shadow-lg border border-[#D4AF37]/30 px-4 py-3">
              {/* الصف الأول - الفلاتر الأساسية */}
              <div className="flex items-center gap-2 flex-wrap relative">
                {/* المدينة - أولاً */}
                <div className="relative">
                  <FilterChip
                    icon="📍"
                    label={filters.city || "المدينة"}
                    title={filters.city || "المدينة"}
                    active={!!filters.city}
                    maxLabelWidthClass="max-w-[120px] sm:max-w-[150px]"
                    onClick={() => setActivePanel(activePanel === "city" ? "none" : "city")}
                  />
                  {activePanel === "city" && (
                    <CityPanel filters={filters} onChange={setFilters} onClose={() => setActivePanel("none")} />
                  )}
                </div>

                {/* بحث */}
                <div className="w-32">
                  <input
                    type="text"
                    className="w-full rounded-full bg-white/15 border border-white/30 px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#D4AF37] placeholder:text-white/60 text-white"
                    placeholder="🔍 ابحث بالحي..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                </div>

                {/* طبيعة الاستخدام - Split Chip */}
                <div className="flex rounded-full overflow-hidden border border-[#D4AF37]/50 shadow-sm" style={{height: "34px"}}>
                  <button
                    onClick={() => handleUsageClick("residential")}
                    className={`flex items-center gap-1 px-3 text-xs font-bold transition touch-manipulation ${
                      usageTab === "all" || usageTab === "residential"
                        ? "bg-[#D4AF37] text-[#002845]"
                        : "bg-[#002845]/80 text-white/60 hover:text-white"
                    }`}
                  >
                    🏠 سكني
                  </button>
                  <div className="w-px bg-[#D4AF37]/40 self-stretch" />
                  <button
                    onClick={() => handleUsageClick("commercial")}
                    className={`flex items-center gap-1 px-3 text-xs font-bold transition touch-manipulation ${
                      usageTab === "all" || usageTab === "commercial"
                        ? "bg-[#D4AF37] text-[#002845]"
                        : "bg-[#002845]/80 text-white/60 hover:text-white"
                    }`}
                  >
                    🏢 تجاري
                  </button>
                </div>

                {/* نوع العرض + حالة الصفقة - مجموعة واحدة مهمة */}
                <div className="flex items-center gap-1 bg-gradient-to-l from-[#D4AF37]/20 to-[#D4AF37]/10 px-2 py-1 rounded-xl border border-[#D4AF37]/30">
                  {/* نوع العرض - Split Chip */}
                  <div className="flex rounded-lg overflow-hidden border border-[#D4AF37]/40" style={{height: "34px"}}>
                    <button
                      onClick={() => handlePurposeClick("sell")}
                      className={`flex items-center gap-1 px-3 text-xs font-bold transition touch-manipulation ${
                        purposeTab === "all" || purposeTab === "sell"
                          ? "bg-[#8B0000] text-white"
                          : "bg-transparent text-white/60 hover:text-white"
                      }`}
                    >
                      🏷️ بيع
                    </button>
                    <div className="w-px bg-[#D4AF37]/40 self-stretch" />
                    <button
                      onClick={() => handlePurposeClick("rent")}
                      className={`flex items-center gap-1 px-3 text-xs font-bold transition touch-manipulation ${
                        purposeTab === "all" || purposeTab === "rent"
                          ? "bg-[#0B6B4C] text-white"
                          : "bg-transparent text-white/60 hover:text-white"
                      }`}
                    >
                      🔑 إيجار
                    </button>
                  </div>

                  <span className="text-[#D4AF37]/50 text-xs">|</span>

                  {/* حالة الصفقة - dropdown مثل المدينة */}
                  <div className="relative">
                    <button
                      onClick={() => setActivePanel(activePanel === "dealStatus" ? "none" : "dealStatus")}
                      className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-1.5 ${
                        filters.dealStatus === "active" 
                          ? "bg-emerald-500 text-white" 
                          : filters.dealStatus === "negotiating"
                            ? "bg-amber-500 text-white"
                            : filters.dealStatus === "sold"
                              ? "bg-red-600 text-white"
                              : filters.dealStatus === "rented"
                                ? "bg-blue-600 text-white"
                                : "bg-white/20 text-white"
                      }`}
                    >
                      {filters.dealStatus === "active"
                        ? "✅ نشط"
                        : filters.dealStatus === "negotiating"
                          ? "🤝 قيد التفاوض"
                          : filters.dealStatus === "sold"
                            ? "✔️ تم البيع"
                            : filters.dealStatus === "rented"
                              ? "✔️ تم التأجير"
                              : filters.dealStatus === "all"
                                ? "📋 الكل"
                                : "📋 الحالة"}
                    </button>
                    {activePanel === "dealStatus" && (
                      <div className="absolute top-full right-0 mt-1 z-[9999]">
                        <div className="bg-[#002845] rounded-xl shadow-lg border border-[#D4AF37]/40 p-2">
                          <div className="flex gap-1.5">
                            {([
                              { value: "all", label: "📋 الكل", color: "bg-[#D4AF37] text-[#002845]" },
                              { value: "active", label: "✅ نشط", color: "bg-emerald-500 text-white" },
                              { value: "negotiating", label: "🤝 قيد التفاوض", color: "bg-amber-500 text-white" },
                              { value: "sold", label: "✔️ تم البيع", color: "bg-red-600 text-white" },
                              { value: "rented", label: "✔️ تم التأجير", color: "bg-blue-600 text-white" },
                            ] as const).map(status => (
                              <button
                                key={status.value}
                                onClick={() => { 
                                  setFilters(prev => ({ ...prev, dealStatus: status.value })); 
                                  setActivePanel("none"); 
                                }}
                                className={`px-3 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                                  filters.dealStatus === status.value 
                                    ? status.color 
                                    : "bg-white/20 text-white hover:bg-white/30"
                                }`}
                              >
                                {status.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* نوع العقار */}
                <div className="relative">
                  <FilterChip
                    icon="🏠"
                    label="النوع"
                    title="نوع العقار"
                    active={!!filters.propertyTypes?.length}
                    onClick={() => setActivePanel(activePanel === "propertyType" ? "none" : "propertyType")}
                  />
                  {activePanel === "propertyType" && (
                    <div className="absolute top-full right-0 mt-1 z-[9999]">
                      <PropertyTypePanel filters={filters} usageTab={usageTab} onChange={setFilters} onClose={() => setActivePanel("none")} />
                    </div>
                  )}
                </div>

                {/* السعر */}
                <div className="relative">
                  <FilterChip
                    icon="💰"
                    label="السعر"
                    title="السعر"
                    active={!!(filters.minPrice || filters.maxPrice)}
                    onClick={() => setActivePanel(activePanel === "price" ? "none" : "price")}
                  />
                  {activePanel === "price" && (
                    <div className="absolute top-full right-0 mt-1 z-[9999]">
                      <PricePanel key={purposeTab} filters={filters} purposeTab={purposeTab} onChange={setFilters} onClose={() => setActivePanel("none")} />
                    </div>
                  )}
                </div>

                {/* المساحة */}
                <div className="relative hidden sm:block">
                  <FilterChip
                    icon="📐"
                    label="المساحة"
                    title="المساحة"
                    active={!!(filters.minLandArea || filters.maxLandArea)}
                    onClick={() => setActivePanel(activePanel === "area" ? "none" : "area")}
                  />
                  {activePanel === "area" && (
                    <div className="absolute top-full right-0 mt-1 z-[9999]">
                      <AreaPanel filters={filters} onChange={setFilters} onClose={() => setActivePanel("none")} />
                    </div>
                  )}
                </div>

                {/* الغرف */}
                <div className="relative hidden sm:block">
                  <FilterChip
                    icon="🛏️"
                    label={filters.bedrooms ? `غرف: ${filters.bedrooms}+` : "غرف"}
                    title="عدد الغرف"
                    active={!!filters.bedrooms}
                    onClick={() => setActivePanel(activePanel === "beds" ? "none" : "beds")}
                  />
                  {activePanel === "beds" && (
                    <div className="absolute top-full right-0 mt-1 z-[9999]">
                      <BedsPanel filters={filters} onChange={setFilters} onClose={() => setActivePanel("none")} />
                    </div>
                  )}
                </div>

                {/* الحمامات */}
                <div className="relative hidden md:block">
                  <FilterChip
                    icon="🚿"
                    label={filters.bathrooms ? `حمام: ${filters.bathrooms}+` : "حمام"}
                    title="عدد الحمامات"
                    active={!!filters.bathrooms}
                    onClick={() => setActivePanel(activePanel === "baths" ? "none" : "baths")}
                  />
                  {activePanel === "baths" && (
                    <div className="absolute top-full right-0 mt-1 z-[9999]">
                      <BathsPanel filters={filters} onChange={setFilters} onClose={() => setActivePanel("none")} />
                    </div>
                  )}
                </div>

                {/* المزيد - المرافق */}
                <div className="relative">
                  <FilterChip
                    icon={
                      <span className="flex items-center gap-1">
                        <span>⚙️</span>
                        {[filters.hasPool, filters.hasGarden, filters.hasElevator, filters.hasParking].filter(Boolean).length > 0 && (
                          <span className="inline-flex items-center justify-center w-4 h-4 text-[8px] font-bold bg-[#002845] text-white rounded-full">
                            {[filters.hasPool, filters.hasGarden, filters.hasElevator, filters.hasParking].filter(Boolean).length}
                          </span>
                        )}
                      </span>
                    }
                    label="المزيد"
                    title="المزيد من الفلاتر"
                    active={!!(filters.hasPool || filters.hasGarden || filters.hasElevator || filters.hasParking)}
                    onClick={() => setActivePanel(activePanel === "more" ? "none" : "more")}
                  />
                  {activePanel === "more" && (
                    <div className="absolute top-full right-0 mt-1 z-[9999]">
                      <div className="bg-[#002845] rounded-xl shadow-lg border border-[#D4AF37]/40 p-2.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button onClick={() => setFilters(prev => ({ ...prev, hasPool: !prev.hasPool }))} className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${filters.hasPool ? "bg-[#D4AF37] text-[#002845]" : "bg-white/20 text-white hover:bg-white/30"}`}>🏊 مسبح</button>
                          <button onClick={() => setFilters(prev => ({ ...prev, hasGarden: !prev.hasGarden }))} className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${filters.hasGarden ? "bg-[#D4AF37] text-[#002845]" : "bg-white/20 text-white hover:bg-white/30"}`}>🌳 حديقة</button>
                          <button onClick={() => setFilters(prev => ({ ...prev, hasElevator: !prev.hasElevator }))} className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${filters.hasElevator ? "bg-[#D4AF37] text-[#002845]" : "bg-white/20 text-white hover:bg-white/30"}`}>🛗 مصعد</button>
                          <button onClick={() => setFilters(prev => ({ ...prev, hasParking: !prev.hasParking }))} className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${filters.hasParking ? "bg-[#D4AF37] text-[#002845]" : "bg-white/20 text-white hover:bg-white/30"}`}>🚗 مواقف</button>
                          {(filters.hasPool || filters.hasGarden || filters.hasElevator || filters.hasParking) && (
                            <button onClick={() => setFilters(prev => ({ ...prev, hasPool: undefined, hasGarden: undefined, hasElevator: undefined, hasParking: undefined }))} className="text-xs text-red-400 hover:text-red-300 font-semibold">✕ مسح</button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* زر إزالة الفلاتر */}
                {(filters.city || filters.propertyTypes?.length || filters.minPrice || filters.maxPrice || filters.minLandArea || filters.maxLandArea || filters.bedrooms || filters.bathrooms || filters.hasPool || filters.hasGarden || filters.hasElevator || filters.hasParking) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilters({
                        city: undefined,
                        propertyTypes: [],
                        minPrice: undefined,
                        maxPrice: undefined,
                        minLandArea: undefined,
                        maxLandArea: undefined,
                        minBuildingArea: undefined,
                        maxBuildingArea: undefined,
                        bedrooms: undefined,
                        bathrooms: undefined,
                        searchText: "",
                        hasPool: undefined,
                        hasGarden: undefined,
                        hasElevator: undefined,
                        hasParking: undefined,
                      });
                      setActivePanel("none");
                    }}
                    className="rounded-full px-3 py-2 text-xs font-semibold border border-red-400 text-red-400 bg-red-500/20 hover:bg-red-500/30 transition whitespace-nowrap"
                  >
                    ✕ إزالة
                  </button>
                )}

                {/* فاصل */}
                <div className="flex-1" />

                {/* الترتيب + العدد + العرض - في صف واحد */}
                <div className="flex items-center gap-2 shrink-0">
                  <SortDropdown value={sortOption} onChange={setSortOption} />
                  <span className="text-xs font-bold whitespace-nowrap bg-[#D4AF37] text-[#002845] px-2.5 py-1 rounded-full">
                    {filteredListings.length}
                  </span>
                  <ViewToggle active={viewMode} />
                </div>
              </div>
            </div>
          </div>

          {/* النتائج / الخريطة */}
          <div>{content}</div>

          {/* 📱 Mobile Filter Sheet */}
          <MobileBottomSheet
            isOpen={showMobileFilters}
            onClose={() => setShowMobileFilters(false)}
            title="تصفية النتائج"
            maxHeight="85vh"
          >
            <div className="space-y-6">
                
                {/* Filters Content */}
                <div className="space-y-6">
                  {/* الدولة */}
                  <div>
                    <h4 className="text-[#003366] text-mobile-base font-bold mb-3">🌍 الدولة</h4>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { code: "", name: "الكل", emoji: "🌐" },
                        { code: "السعودية", name: "السعودية", emoji: "🇸🇦" },
                        { code: "الإمارات", name: "الإمارات", emoji: "🇦🇪" },
                        { code: "الكويت", name: "الكويت", emoji: "🇰🇼" },
                        { code: "قطر", name: "قطر", emoji: "🇶🇦" },
                        { code: "البحرين", name: "البحرين", emoji: "🇧🇭" },
                        { code: "عمان", name: "عُمان", emoji: "🇴🇲" },
                        { code: "مصر", name: "مصر", emoji: "🇪🇬" },
                        { code: "لبنان", name: "لبنان", emoji: "🇱🇧" },
                        { code: "تركيا", name: "تركيا", emoji: "🇹🇷" },
                      ].map(country => (
                        <button
                          key={country.code}
                          onClick={() => setFilters(prev => ({ 
                            ...prev, 
                            country: country.code || undefined, 
                            city: undefined 
                          }))}
                          className={`min-h-[44px] px-4 py-2.5 rounded-xl text-mobile-sm font-semibold transition touch-manipulation active:scale-95 ${
                            (filters.country || "") === country.code 
                              ? "bg-[#D4AF37] text-[#002845]" 
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          {country.emoji} {country.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* المدينة - ديناميكية حسب الدولة */}
                  <div>
                    <h4 className="text-[#003366] text-mobile-base font-bold mb-3">📍 المدينة {filters.country && <span className="text-[#D4AF37]">({filters.country})</span>}</h4>
                    {mobileCitiesLoading ? (
                      <div className="flex justify-center py-4">
                        <div className="w-6 h-6 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2 max-h-[200px] overflow-y-auto">
                        <button
                          onClick={() => setFilters(prev => ({ ...prev, city: undefined }))}
                          className={`min-h-[44px] px-4 py-2.5 rounded-xl text-mobile-sm font-semibold transition touch-manipulation active:scale-95 ${
                            !filters.city 
                              ? "bg-[#D4AF37] text-[#002845]" 
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          🏠 كل المدن
                        </button>
                        {mobileCities.map(city => (
                          <button
                            key={city.id}
                            onClick={() => setFilters(prev => ({ ...prev, city: city.name_ar }))}
                            className={`min-h-[44px] px-4 py-2.5 rounded-xl text-mobile-sm font-semibold transition touch-manipulation active:scale-95 ${
                              filters.city === city.name_ar 
                                ? "bg-[#D4AF37] text-[#002845]" 
                                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            }`}
                          >
                            {city.flag_emoji} {city.name_ar}
                          </button>
                        ))}
                        {mobileCities.length === 0 && !mobileCitiesLoading && (
                          <p className="text-slate-500 text-mobile-sm w-full text-center py-4">اختر دولة لعرض المدن</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* البحث بالحي */}
                  <div>
                    <h4 className="text-[#003366] text-mobile-base font-bold mb-3">🔍 البحث بالحي</h4>
                    <input
                      type="text"
                      placeholder="ابحث بالحي أو الموقع..."
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      className="w-full min-h-[48px] bg-white border-2 border-slate-300 rounded-xl px-4 py-3 text-mobile-base text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:border-[#D4AF37] transition touch-manipulation"
                    />
                  </div>

                  {/* نوع الاستخدام - Split Chip */}
                  <div>
                    <h4 className="text-[#003366] text-mobile-base font-bold mb-3">🏢 طبيعة الاستخدام</h4>
                    <div className="flex rounded-2xl overflow-hidden border-2 border-[#D4AF37]/40 bg-slate-100" style={{minHeight: "52px"}}>
                      <button
                        onClick={() => handleUsageClick("residential")}
                        className={`flex-1 flex items-center justify-center gap-2 text-mobile-base font-bold transition touch-manipulation active:scale-95 ${
                          usageTab === "all" || usageTab === "residential"
                            ? "bg-[#D4AF37] text-[#002845]"
                            : "text-slate-500"
                        }`}
                      >
                        🏠 سكني
                      </button>
                      <div className="w-0.5 bg-[#D4AF37]/40 self-stretch" />
                      <button
                        onClick={() => handleUsageClick("commercial")}
                        className={`flex-1 flex items-center justify-center gap-2 text-mobile-base font-bold transition touch-manipulation active:scale-95 ${
                          usageTab === "all" || usageTab === "commercial"
                            ? "bg-[#D4AF37] text-[#002845]"
                            : "text-slate-500"
                        }`}
                      >
                        🏢 تجاري
                      </button>
                    </div>
                  </div>

                  {/* نوع العرض - Split Chip */}
                  <div>
                    <h4 className="text-[#003366] text-mobile-base font-bold mb-3">📋 نوع العرض</h4>
                    <div className="flex rounded-2xl overflow-hidden border-2 border-[#D4AF37]/40 bg-slate-100" style={{minHeight: "52px"}}>
                      <button
                        onClick={() => handlePurposeClick("sell")}
                        className={`flex-1 flex items-center justify-center gap-2 text-mobile-base font-bold transition touch-manipulation active:scale-95 ${
                          purposeTab === "all" || purposeTab === "sell"
                            ? "bg-[#8B0000] text-white"
                            : "text-slate-500"
                        }`}
                      >
                        🏷️ بيع
                      </button>
                      <div className="w-0.5 bg-[#D4AF37]/40 self-stretch" />
                      <button
                        onClick={() => handlePurposeClick("rent")}
                        className={`flex-1 flex items-center justify-center gap-2 text-mobile-base font-bold transition touch-manipulation active:scale-95 ${
                          purposeTab === "all" || purposeTab === "rent"
                            ? "bg-[#0B6B4C] text-white"
                            : "text-slate-500"
                        }`}
                      >
                        🔑 إيجار
                      </button>
                    </div>
                  </div>

                  {/* حالة الصفقة */}
                  <div>
                    <h4 className="text-[#003366] text-mobile-base font-bold mb-3">🤝 حالة الصفقة</h4>
                    <div className="flex flex-wrap gap-2">
                      {([
                        { value: "all", label: "📋 الكل" },
                        { value: "active", label: "✅ نشط" },
                        { value: "negotiating", label: "🤝 قيد التفاوض" },
                        { value: "sold", label: "✔️ تم البيع" },
                        { value: "rented", label: "✔️ تم التأجير" },
                      ] as const).map((status) => (
                        <button
                          key={status.value}
                          onClick={() => setFilters(prev => ({ ...prev, dealStatus: status.value }))}
                          className={`min-h-[44px] px-4 py-2.5 rounded-xl text-mobile-sm font-semibold transition touch-manipulation active:scale-95 ${
                            filters.dealStatus === status.value
                              ? "bg-[#D4AF37] text-[#002845]"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          {status.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* نوع العقار */}
                  <div>
                    <h4 className="text-[#003366] text-mobile-base font-bold mb-3">🏠 نوع العقار</h4>
                    <div className="flex flex-wrap gap-2">
                      {(usageTab === "residential" ? RESIDENTIAL_TYPES : usageTab === "commercial" ? COMMERCIAL_TYPES : [...RESIDENTIAL_TYPES, ...COMMERCIAL_TYPES]).map(type => (
                        <button
                          key={type}
                          onClick={() => {
                            setFilters(prev => {
                              const current = prev.propertyTypes || [];
                              const isSelected = current.includes(type);
                              return {
                                ...prev,
                                propertyTypes: isSelected 
                                  ? current.filter(t => t !== type) 
                                  : [...current, type]
                              };
                            });
                          }}
                          className={`min-h-[44px] px-4 py-2.5 rounded-xl text-mobile-sm font-semibold transition touch-manipulation active:scale-95 ${
                            filters.propertyTypes?.includes(type)
                              ? "bg-[#D4AF37] text-[#002845]"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* السعر */}
                  <div>
                    <h4 className="text-[#003366] text-mobile-base font-bold mb-3">💰 السعر</h4>
                    <div className="flex gap-3">
                      <input
                        type="number"
                        placeholder="من"
                        value={filters.minPrice ?? ""}
                        onChange={(e) => setFilters(prev => ({ ...prev, minPrice: e.target.value ? Number(e.target.value) : undefined }))}
                        className="flex-1 min-h-[48px] bg-white border-2 border-slate-300 rounded-xl px-4 py-3 text-mobile-base text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:border-[#D4AF37] transition touch-manipulation"
                      />
                      <input
                        type="number"
                        placeholder="إلى"
                        value={filters.maxPrice ?? ""}
                        onChange={(e) => setFilters(prev => ({ ...prev, maxPrice: e.target.value ? Number(e.target.value) : undefined }))}
                        className="flex-1 min-h-[48px] bg-white border-2 border-slate-300 rounded-xl px-4 py-3 text-mobile-base text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:border-[#D4AF37] transition touch-manipulation"
                      />
                    </div>
                  </div>

                  {/* المساحة */}
                  <div>
                    <h4 className="text-[#003366] text-mobile-base font-bold mb-3">📐 المساحة (م²)</h4>
                    <div className="flex gap-3">
                      <input
                        type="number"
                        placeholder="من"
                        value={filters.minLandArea ?? ""}
                        onChange={(e) => setFilters(prev => ({ ...prev, minLandArea: e.target.value ? Number(e.target.value) : undefined }))}
                        className="flex-1 min-h-[48px] bg-white border-2 border-slate-300 rounded-xl px-4 py-3 text-mobile-base text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:border-[#D4AF37] transition touch-manipulation"
                      />
                      <input
                        type="number"
                        placeholder="إلى"
                        value={filters.maxLandArea ?? ""}
                        onChange={(e) => setFilters(prev => ({ ...prev, maxLandArea: e.target.value ? Number(e.target.value) : undefined }))}
                        className="flex-1 min-h-[48px] bg-white border-2 border-slate-300 rounded-xl px-4 py-3 text-mobile-base text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:border-[#D4AF37] transition touch-manipulation"
                      />
                    </div>
                  </div>

                  {/* الغرف */}
                  <div>
                    <h4 className="text-[#003366] text-mobile-base font-bold mb-3">🛏️ عدد الغرف</h4>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setFilters(prev => ({ ...prev, bedrooms: undefined }))}
                        className={`min-h-[44px] px-4 py-2.5 rounded-xl text-mobile-sm font-semibold transition touch-manipulation active:scale-95 ${!filters.bedrooms ? "bg-[#D4AF37] text-[#002845]" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                      >
                        الكل
                      </button>
                      {[1, 2, 3, 4, 5].map(n => (
                        <button
                          key={n}
                          onClick={() => setFilters(prev => ({ ...prev, bedrooms: n }))}
                          className={`min-h-[44px] px-4 py-2.5 rounded-xl text-mobile-sm font-semibold transition touch-manipulation active:scale-95 ${filters.bedrooms === n ? "bg-[#D4AF37] text-[#002845]" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                        >
                          {n}+
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* الحمامات */}
                  <div>
                    <h4 className="text-[#003366] text-mobile-base font-bold mb-3">🚿 عدد الحمامات</h4>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setFilters(prev => ({ ...prev, bathrooms: undefined }))}
                        className={`min-h-[44px] px-4 py-2.5 rounded-xl text-mobile-sm font-semibold transition touch-manipulation active:scale-95 ${!filters.bathrooms ? "bg-[#D4AF37] text-[#002845]" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                      >
                        الكل
                      </button>
                      {[1, 2, 3, 4].map(n => (
                        <button
                          key={n}
                          onClick={() => setFilters(prev => ({ ...prev, bathrooms: n }))}
                          className={`min-h-[44px] px-4 py-2.5 rounded-xl text-mobile-sm font-semibold transition touch-manipulation active:scale-95 ${filters.bathrooms === n ? "bg-[#D4AF37] text-[#002845]" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                        >
                          {n}+
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* المرافق */}
                  <div>
                    <h4 className="text-[#003366] text-mobile-base font-bold mb-3">⚙️ المرافق</h4>
                    <div className="flex flex-wrap gap-2">
                      <button 
                        onClick={() => setFilters(prev => ({ ...prev, hasPool: !prev.hasPool }))} 
                        className={`min-h-[44px] px-4 py-2.5 rounded-xl text-mobile-sm font-semibold transition touch-manipulation active:scale-95 ${filters.hasPool ? "bg-[#D4AF37] text-[#002845]" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                      >
                        🏊 مسبح
                      </button>
                      <button 
                        onClick={() => setFilters(prev => ({ ...prev, hasGarden: !prev.hasGarden }))} 
                        className={`min-h-[44px] px-4 py-2.5 rounded-xl text-mobile-sm font-semibold transition touch-manipulation active:scale-95 ${filters.hasGarden ? "bg-[#D4AF37] text-[#002845]" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                      >
                        🌳 حديقة
                      </button>
                      <button 
                        onClick={() => setFilters(prev => ({ ...prev, hasElevator: !prev.hasElevator }))} 
                        className={`min-h-[44px] px-4 py-2.5 rounded-xl text-mobile-sm font-semibold transition touch-manipulation active:scale-95 ${filters.hasElevator ? "bg-[#D4AF37] text-[#002845]" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                      >
                        🛗 مصعد
                      </button>
                      <button 
                        onClick={() => setFilters(prev => ({ ...prev, hasParking: !prev.hasParking }))} 
                        className={`min-h-[44px] px-4 py-2.5 rounded-xl text-mobile-sm font-semibold transition touch-manipulation active:scale-95 ${filters.hasParking ? "bg-[#D4AF37] text-[#002845]" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                      >
                        🚗 مواقف
                      </button>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="sticky bottom-0 bg-white p-4 pb-6 border-t border-slate-200 flex gap-3 safe-area-inset-bottom -mx-6 -mb-4">
                  <button
                    onClick={() => {
                      setFilters({ dealStatus: "active" });
                      setUsageTab("all");
                      setPurposeTab("all");
                      setSearchInput("");
                    }}
                    className="flex-1 min-h-[48px] py-3 rounded-xl border-2 border-slate-300 text-slate-700 text-mobile-base font-semibold active:scale-95 transition touch-manipulation"
                  >
                    مسح الكل
                  </button>
                  <button
                    onClick={() => setShowMobileFilters(false)}
                    className="flex-1 min-h-[48px] py-3 rounded-xl bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] text-mobile-base font-bold shadow-lg active:scale-95 transition touch-manipulation"
                  >
                    عرض النتائج ({filteredListings.length})
                  </button>
                </div>
            </div>
          </MobileBottomSheet>

          {/* قسم نخبة العقارات - تصميم مطابق للصفحة الرئيسية */}
          <div className={`mt-8 mb-6 ${activePanel !== "none" ? "pointer-events-none" : ""}`}>
            <div className="bg-white rounded-2xl p-5 shadow-lg relative overflow-hidden">
              {/* العنوان */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[10px] font-semibold text-[#D4AF37] mb-0.5 flex items-center gap-1">
                    <span>👑</span> الاختيار الأفضل
                  </p>
                  <h3 className="text-lg font-extrabold text-[#003366]">نخبة العقارات المختارة</h3>
                  <p className="text-[10px] text-slate-500">خانات حصرية لرجال الأعمال والمستثمرين</p>
                </div>
                <Link 
                  href="/"
                  className="px-3 py-1.5 rounded-lg bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#001A33] text-[10px] font-bold hover:shadow-md transition flex items-center gap-1"
                >
                  <span>✨</span>
                  عرض الكل
                </Link>
              </div>

              {/* بطاقات العقارات بنفس تصميم الصفحة الرئيسية */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(() => {
                  const placeholderSlots = [
                    { id: 1, img: "/jeddah.jpg", tagline: "كن أول من يعرض عقاره هنا", highlight: "خانة VIP" },
                    { id: 2, img: "/madinah.jpg", tagline: "فرصتك لتكون في الواجهة", highlight: "مميز" },
                    { id: 3, img: "/taif.jpg", tagline: "اجعل عقارك يتصدر البحث", highlight: "الأكثر مشاهدة" },
                    { id: 4, img: "/riyadh.jpg", tagline: "احجز مكانك الآن", highlight: "فرصة ذهبية" },
                  ];
                  
                  type ElitePropertyType = typeof eliteProperties[0];
                  type PlaceholderType = { id: number; img: string; tagline: string; highlight: string };
                  
                  // استخدام display_order لتحديد موقع العقار في الشبكة
                  const propertyByDisplayOrder: Record<number, ElitePropertyType> = {};
                  eliteProperties.forEach((p) => {
                    const order = p.display_order || 1;
                    propertyByDisplayOrder[Number(order)] = p;
                  });
                  
                  const displaySlots: { type: 'property' | 'placeholder'; data: ElitePropertyType | PlaceholderType; index: number }[] = [];
                  
                  for (let i = 0; i < 4; i++) {
                    const displayOrder = i + 1;
                    const property = propertyByDisplayOrder[displayOrder];
                    
                    if (property) {
                      displaySlots.push({ type: 'property', data: property, index: i });
                    } else {
                      displaySlots.push({ type: 'placeholder', data: placeholderSlots[i], index: i });
                    }
                  }
                  
                  return displaySlots.map((slot) => {
                    if (slot.type === 'property') {
                      const prop = slot.data as ElitePropertyType;
                      return (
                        <Link
                          key={`elite-${prop.property_id}`}
                          href={`/listing/${prop.property_id}`}
                          className="relative bg-[#FBF7F0] rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 focus:shadow-xl focus:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 transition-all duration-300 cursor-pointer group active:scale-[0.98] touch-manipulation"
                        >
                          <div className="relative aspect-[4/3]">
                            <Image
                              src={getImageUrl(prop.cover_image || prop.image_url) || '/images/property1.jpg'}
                              alt={prop.title}
                              fill
                              sizes="(max-width: 768px) 50vw, 25vw"
                              className="object-cover group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#001A33]/90 via-[#001A33]/30 to-transparent" />
                            
                            <span className="absolute top-2 right-2 bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#001A33] text-[9px] px-2 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                              <span>⭐</span>
                              نخبة
                            </span>

                            <div className="absolute bottom-0 left-0 right-0 p-2">
                              <h4 className="text-white font-bold text-[11px] mb-0.5 drop-shadow-lg line-clamp-1">
                                {prop.title}
                              </h4>
                              <p className="text-white/80 text-[9px] flex items-center gap-0.5">
                                <span>📍</span>
                                {prop.city}
                              </p>
                            </div>
                          </div>

                          <div className="p-2 bg-gradient-to-l from-[#001A33] to-[#002845] flex justify-between items-center">
                            <p className="text-[#D4AF37] font-bold text-[11px]">
                              {formatListingPrice(prop.price, prop.country)}
                            </p>
                            {prop.land_area && (
                              <span className="text-white/70 text-[9px]">
                                {prop.land_area} م²
                              </span>
                            )}
                          </div>
                        </Link>
                      );
                    } else {
                      const ph = slot.data as PlaceholderType;
                      return (
                        <Link
                          key={`placeholder-${ph.id}`}
                          href="/elite-booking"
                          className="relative bg-[#FBF7F0] rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 focus:shadow-xl focus:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 transition-all duration-300 cursor-pointer group active:scale-[0.98] touch-manipulation"
                        >
                          <div className="relative aspect-[4/3]">
                            <Image
                              src={ph.img}
                              alt={ph.tagline}
                              fill
                              sizes="(max-width: 768px) 50vw, 25vw"
                              className="object-cover opacity-60 group-hover:opacity-40 transition-opacity"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#001A33]/90 via-[#001A33]/50 to-transparent" />
                            
                            <span className="absolute top-2 right-2 bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#001A33] text-[9px] px-2 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                              <span>⭐</span>
                              {ph.highlight}
                            </span>

                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2">
                              <div className="w-10 h-10 rounded-full bg-[#D4AF37]/20 border-2 border-dashed border-[#D4AF37] flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                <span className="text-lg">👑</span>
                              </div>
                              <h4 className="text-white font-bold text-[11px] mb-0.5 drop-shadow-lg">
                                {ph.tagline}
                              </h4>
                              <p className="text-[#D4AF37] text-[9px] font-medium">
                                اضغط للتفاصيل
                              </p>
                            </div>
                          </div>

                          <div className="p-2 bg-gradient-to-l from-[#001A33] to-[#002845] text-center">
                            <p className="text-white/80 text-[9px]">
                              خانة رقم <span className="text-[#D4AF37] font-bold">#{ph.id}</span> • متاحة الآن
                            </p>
                          </div>
                        </Link>
                      );
                    }
                  });
                })()}
              </div>
            </div>
          </div>

          {/* قسم المدن الأكثر طلبًا - يظهر فقط في عرض الخريطة */}
          {viewMode !== "list" && featuredCities.length > 0 && (
            <div className={`mt-6 mb-6 ${activePanel !== "none" ? "pointer-events-none" : ""}`}>
              <div className="bg-gradient-to-br from-slate-50 to-white rounded-2xl p-5 shadow-lg border border-slate-200 relative overflow-hidden">
                {/* نقش زخرفي خفيف */}
                <div className="absolute inset-0 opacity-5">
                  <div className="absolute top-0 left-0 w-40 h-40 bg-[#002845] rounded-full blur-3xl" />
                  <div className="absolute bottom-0 right-0 w-32 h-32 bg-[#D4AF37] rounded-full blur-2xl" />
                </div>
                
                {/* العنوان */}
                <div className="relative z-10 flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-[#002845] to-[#003366] rounded-xl flex items-center justify-center shadow-lg">
                      <span className="text-lg">🏙️</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-[#002845]">أكثر المدن طلبًا</h3>
                      <p className="text-[11px] text-slate-500">اكتشف العقارات في أشهر المدن</p>
                    </div>
                  </div>
                </div>

                {/* بطاقات المدن */}
                <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-8 gap-2">
                  {featuredCities.map((city) => (
                    <button
                      key={`city-${city.id}`}
                      onClick={() => {
                        setFilters(prev => ({ ...prev, city: city.name_ar }));
                        setSearchInput(city.name_ar);
                      }}
                      className="group relative bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all hover:-translate-y-0.5 border border-slate-100 hover:border-[#D4AF37]/50"
                    >
                      {/* الصورة */}
                      <div className="relative h-16 overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200">
                        {city.image_url ? (
                          <Image
                            src={city.image_url}
                            alt={city.name_ar}
                            fill
                            sizes="(max-width: 640px) 50vw, 12.5vw"
                            className="object-cover group-hover:scale-110 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-2xl opacity-40">🏙️</span>
                          </div>
                        )}
                        {/* تراكب */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                        
                        {/* شارة العاصمة */}
                        {city.is_capital && (
                          <div className="absolute top-1 right-1 bg-[#D4AF37] text-[#002845] text-[6px] font-bold px-1 py-0.5 rounded shadow">
                            ⭐ عاصمة
                          </div>
                        )}
                      </div>

                      {/* اسم المدينة */}
                      <div className="p-1.5 text-center">
                        <h4 className="text-[10px] font-bold text-[#002845] truncate">
                          {city.name_ar}
                        </h4>
                        <p className="text-[8px] text-slate-400 truncate">
                          {city.country_name_ar}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={
      <div
        dir="rtl"
        className="min-h-screen bg-gradient-to-b from-[#002845] via-[#123a64] to-[#fdf6db] flex items-center justify-center"
      >
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
      <SearchPage />
    </Suspense>
  );
}

// =================== المكوّنات الفرعية ===================

function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 md:px-4 py-1.5 text-[11px] md:text-sm font-semibold flex items-center gap-1 transition ${
        active
          ? "bg-white text-[#002845] border-white shadow-sm"
          : "bg-white/10 text-white border-white/30 hover:bg-white/15"
      }`}
    >
      <span>{label}</span>
    </button>
  );
}

// Panel السعر – ديناميكي حسب بيع/إيجار
function PricePanel({
  filters,
  purposeTab,
  onChange,
  onClose,
}: {
  filters: Filters;
  purposeTab: PurposeTab;
  onChange: (f: Filters) => void;
  onClose: () => void;
}) {
  const isRent = purposeTab === "rent";

  const MIN = 0;
  const MAX = isRent ? 2_000_000 : 10_000_000; // ✅ إيجار أقل
  const STEP = isRent ? 1_000 : 100_000; // ✅ خطوة أصغر للإيجار

  const [localMin, setLocalMin] = useState<number>(
    filters.minPrice != null
      ? Math.min(Math.max(filters.minPrice, MIN), MAX)
      : MIN
  );
  const [localMax, setLocalMax] = useState<number>(
    filters.maxPrice != null
      ? Math.min(Math.max(filters.maxPrice, MIN), MAX)
      : MAX
  );

  const formatArabic = (n: number) => {
    const arabic = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
    return n
      .toLocaleString("en-US")
      .replace(/\d/g, (d) => arabic[Number(d)] ?? d);
  };

  const applyChanges = () => {
    onChange({
      ...filters,
      minPrice: localMin <= MIN ? undefined : localMin,
      maxPrice: localMax >= MAX ? undefined : localMax,
    });
    onClose();
  };

  const maxBar = Math.max(...PRICE_HISTOGRAM);

  return (
    <div 
      className="panel-animated bg-[#002845] rounded-xl shadow-lg border border-[#D4AF37]/40 p-2.5 w-fit mx-auto"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex justify-between items-center mb-2 gap-3">
        <h3 className="text-[10px] font-bold text-[#D4AF37]">{isRent ? "الإيجار" : "السعر"}</h3>
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-[10px] text-white/60 hover:text-white" type="button">✕</button>
      </div>
      <div className="space-y-3 w-48">
        <div>
          <label className="block text-[10px] text-white/70 mb-1">أقل سعر</label>
          <input type="range" min={MIN} max={MAX} step={STEP} value={localMin}
            onChange={(e) => setLocalMin(Math.min(Number(e.target.value), localMax))}
            className="w-full h-1.5 bg-white/20 rounded-lg appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#D4AF37]"
          />
          <div className="text-center text-[10px] text-white">{localMin <= MIN ? "لا حد" : `${formatArabic(localMin)} ر.س`}</div>
        </div>
        <div>
          <label className="block text-[10px] text-white/70 mb-1">أعلى سعر</label>
          <input type="range" min={MIN} max={MAX} step={STEP} value={localMax}
            onChange={(e) => setLocalMax(Math.max(Number(e.target.value), localMin))}
            className="w-full h-1.5 bg-white/20 rounded-lg appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#D4AF37]"
          />
          <div className="text-center text-[10px] text-white">{localMax >= MAX ? "لا حد" : `${formatArabic(localMax)} ر.س`}</div>
        </div>
      </div>
      <div className="flex gap-2 mt-3 justify-center">
        <button onClick={() => { setLocalMin(MIN); setLocalMax(MAX); }} className="rounded-full border border-white/30 text-white text-[10px] px-3 py-1 hover:bg-white/10 transition" type="button">مسح</button>
        <button onClick={applyChanges} className="rounded-full bg-[#D4AF37] text-[#002845] text-[10px] px-3 py-1 font-semibold hover:bg-[#C5A028] transition" type="button">تأكيد</button>
      </div>
    </div>
  );
}

function AreaPanel({
  filters,
  onChange,
  onClose,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  onClose: () => void;
}) {
  const largeAreaQuickValues = [
    { value: 50000, label: "50 ألف+" },
    { value: 100000, label: "100 ألف+" },
    { value: 500000, label: "500 ألف+" },
    { value: 1000000, label: "1 مليون+" },
    { value: 5000000, label: "5 مليون+" },
  ];

  return (
    <div 
      className="panel-animated bg-[#002845] rounded-xl shadow-lg border border-[#D4AF37]/40 p-3 w-fit mx-auto"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2 gap-3">
        <h3 className="text-[10px] font-bold text-[#D4AF37]">المساحة (م²)</h3>
        <button type="button" onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-[10px] text-white/60 hover:text-white">✕</button>
      </div>
      <div className="space-y-2">
        <div>
          <p className="text-[9px] text-white/70 mb-1">مساحة الأرض</p>
          <div className="flex gap-2">
            <input type="number" className="w-20 rounded-lg border border-[#D4AF37]/40 bg-white/10 text-white px-2 py-1.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-[#D4AF37] placeholder:text-white/50" placeholder="أقل" value={filters.minLandArea ?? ""}
              onChange={(e) => onChange({ ...filters, minLandArea: e.target.value ? Number(e.target.value) : undefined })}
            />
            <input type="number" className="w-20 rounded-lg border border-[#D4AF37]/40 bg-white/10 text-white px-2 py-1.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-[#D4AF37] placeholder:text-white/50" placeholder="أكبر" value={filters.maxLandArea ?? ""}
              onChange={(e) => onChange({ ...filters, maxLandArea: e.target.value ? Number(e.target.value) : undefined })}
            />
          </div>
          <div className="mt-2">
            <p className="text-[8px] text-amber-400 mb-1">🏜️ مساحات ضخمة (أراضي/مزارع):</p>
            <div className="flex flex-wrap gap-1">
              {largeAreaQuickValues.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => onChange({ ...filters, minLandArea: item.value, maxLandArea: undefined })}
                  className={`text-[8px] rounded-full px-2 py-0.5 transition ${
                    filters.minLandArea === item.value && !filters.maxLandArea
                      ? "bg-amber-500 text-white"
                      : "bg-amber-500/20 text-amber-300 hover:bg-amber-500/40"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <p className="text-[9px] text-white/70 mb-1">مساحة البناء</p>
          <div className="flex gap-2">
            <input type="number" className="w-20 rounded-lg border border-[#D4AF37]/40 bg-white/10 text-white px-2 py-1.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-[#D4AF37] placeholder:text-white/50" placeholder="أقل" value={filters.minBuildingArea ?? ""}
              onChange={(e) => onChange({ ...filters, minBuildingArea: e.target.value ? Number(e.target.value) : undefined })}
            />
            <input type="number" className="w-20 rounded-lg border border-[#D4AF37]/40 bg-white/10 text-white px-2 py-1.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-[#D4AF37] placeholder:text-white/50" placeholder="أكبر" value={filters.maxBuildingArea ?? ""}
              onChange={(e) => onChange({ ...filters, maxBuildingArea: e.target.value ? Number(e.target.value) : undefined })}
            />
          </div>
        </div>
      </div>
      <div className="mt-2 flex justify-center gap-2">
        {(filters.minLandArea || filters.maxLandArea || filters.minBuildingArea || filters.maxBuildingArea) && (
          <button type="button" onClick={() => onChange({ ...filters, minLandArea: undefined, maxLandArea: undefined, minBuildingArea: undefined, maxBuildingArea: undefined })} className="text-[10px] text-red-400 hover:text-red-300">مسح</button>
        )}
        <button type="button" onClick={onClose} className="rounded-full bg-[#D4AF37] text-[#002845] text-[10px] px-3 py-1 font-semibold hover:bg-[#C5A028] transition">تطبيق</button>
      </div>
    </div>
  );
}

function BedsPanel({
  filters,
  onChange,
  onClose,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  onClose: () => void;
}) {
  const bedOptions = [1, 2, 3, 4, 5];

  return (
    <div 
      className="panel-animated bg-[#002845] rounded-xl shadow-lg border border-[#D4AF37]/40 p-2.5 w-fit mx-auto"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2 gap-3">
        <h3 className="text-[10px] font-bold text-[#D4AF37]">غرف النوم</h3>
        <button type="button" onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-[10px] text-white/60 hover:text-white">✕</button>
      </div>
      <div className="flex gap-1.5 justify-center">
        <button type="button" onClick={(e) => { e.stopPropagation(); onChange({ ...filters, bedrooms: undefined }); onClose(); }}
          className={`text-[10px] rounded-full px-2.5 py-1 transition font-semibold ${!filters.bedrooms ? "bg-[#D4AF37] text-[#002845]" : "bg-white/20 text-white hover:bg-white/30"}`}>
          الكل
        </button>
        {bedOptions.map((n) => (
          <button key={n} type="button" onClick={(e) => { e.stopPropagation(); onChange({ ...filters, bedrooms: n }); onClose(); }}
            className={`text-[10px] rounded-full px-2.5 py-1 transition font-semibold ${filters.bedrooms === n ? "bg-[#D4AF37] text-[#002845]" : "bg-white/20 text-white hover:bg-white/30"}`}>
            {n}+
          </button>
        ))}
      </div>
    </div>
  );
}

function BathsPanel({
  filters,
  onChange,
  onClose,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  onClose: () => void;
}) {
  const bathOptions = [1, 2, 3, 4, 5];

  return (
    <div 
      className="panel-animated bg-[#002845] rounded-xl shadow-lg border border-[#D4AF37]/40 p-2.5 w-fit mx-auto"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2 gap-3">
        <h3 className="text-[10px] font-bold text-[#D4AF37]">دورات المياه</h3>
        <button type="button" onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-[10px] text-white/60 hover:text-white">✕</button>
      </div>
      <div className="flex gap-1.5 justify-center">
        <button type="button" onClick={(e) => { e.stopPropagation(); onChange({ ...filters, bathrooms: undefined }); onClose(); }}
          className={`text-[10px] rounded-full px-2.5 py-1 transition font-semibold ${!filters.bathrooms ? "bg-[#D4AF37] text-[#002845]" : "bg-white/20 text-white hover:bg-white/30"}`}>
          الكل
        </button>
        {bathOptions.map((n) => (
          <button key={n} type="button" onClick={(e) => { e.stopPropagation(); onChange({ ...filters, bathrooms: n }); onClose(); }}
            className={`text-[10px] rounded-full px-2.5 py-1 transition font-semibold ${filters.bathrooms === n ? "bg-[#D4AF37] text-[#002845]" : "bg-white/20 text-white hover:bg-white/30"}`}>
            {n}+
          </button>
        ))}
      </div>
    </div>
  );
}

type Country = {
  id: number;
  code: string;
  name_ar: string;
  name_en: string;
  flag_emoji: string;
  region: string;
};

type City = {
  id: number;
  name_ar: string;
  name_en: string;
  region_ar?: string;
  country_code: string;
  country_name_ar: string;
  flag_emoji: string;
  is_popular?: boolean;
};

type CountryWithCoords = Country & {
  latitude?: string;
  longitude?: string;
  default_zoom?: number;
};

type CityWithCoords = City & {
  latitude?: string | null;
  longitude?: string | null;
};

function CityPanel({
  filters,
  onChange,
  onClose,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  onClose: () => void;
}) {
  const [countries, setCountries] = useState<CountryWithCoords[]>([]);
  const [cities, setCities] = useState<CityWithCoords[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CityWithCoords[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { flyToCoords, resetToDefault } = useSearchMapStore();

  useEffect(() => {
    const fetchCountriesAndDetectLocation = async () => {
      try {
        const [countriesRes, geoRes] = await Promise.all([
          fetch(`${API_URL}/api/locations/countries`),
          fetch(`${API_URL}/api/geolocation/detect`)
        ]);
        
        const data = await countriesRes.json();
        const countryList = data.countries || [];
        setCountries(countryList);
        
        const geoData = await geoRes.json();
        if (geoData.country?.code) {
          const matchedCountry = countryList.find(
            (c: CountryWithCoords) => c.code?.toUpperCase() === geoData.country.code
          );
          if (matchedCountry) {
            setSelectedCountry(matchedCountry.id);
            const lat = geoData.country.lat;
            const lng = geoData.country.lng;
            if (typeof lat === 'number' && !isNaN(lat) && typeof lng === 'number' && !isNaN(lng)) {
              flyToCoords(lat, lng, geoData.country.zoom || 6);
            }
            onChange({ ...filters, country: matchedCountry.name_ar, city: undefined });
          }
        }
      } catch (err) {
        console.error("Error fetching countries:", err);
      }
    };
    fetchCountriesAndDetectLocation();
  }, []);

  useEffect(() => {
    const fetchCities = async () => {
      setLoading(true);
      try {
        const url = selectedCountry 
          ? `/api/locations/cities?country_id=${selectedCountry}`
          : "/api/locations/cities?popular_only=true";
        const res = await fetch(url);
        const data = await res.json();
        setCities(data.cities || []);
      } catch (err) {
        console.error("Error fetching cities:", err);
      }
      setLoading(false);
    };
    fetchCities();
  }, [selectedCountry]);

  useEffect(() => {
    if (searchQuery.length < 1) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const url = selectedCountry
          ? `/api/locations/cities/search?q=${encodeURIComponent(searchQuery)}&country_id=${selectedCountry}&limit=15`
          : `/api/locations/cities/search?q=${encodeURIComponent(searchQuery)}&limit=15`;
        const res = await fetch(url);
        const data = await res.json();
        setSearchResults(data.cities || []);
      } catch (err) {
        console.error("Error searching cities:", err);
      }
      setIsSearching(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedCountry]);

  const handleCountrySelect = (country: CountryWithCoords | null) => {
    if (country) {
      setSelectedCountry(country.id);
      if (country.latitude && country.longitude) {
        const lat = parseFloat(country.latitude);
        const lng = parseFloat(country.longitude);
        const zoom = country.default_zoom || 6;
        if (!isNaN(lat) && !isNaN(lng)) {
          flyToCoords(lat, lng, zoom);
        }
      }
      // تحديث فلتر الدولة ومسح فلتر المدينة
      onChange({ ...filters, country: country.name_ar, city: undefined });
    } else {
      setSelectedCountry(null);
      resetToDefault();
      // مسح فلاتر الدولة والمدينة
      onChange({ ...filters, country: undefined, city: undefined });
    }
    setSearchQuery("");
  };

  const handleCitySelect = (city: CityWithCoords | null) => {
    if (city) {
      if (city.latitude && city.longitude) {
        const lat = parseFloat(city.latitude);
        const lng = parseFloat(city.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
          flyToCoords(lat, lng, 12);
        }
      }
      // تحديث فلتر المدينة والدولة معاً
      onChange({ ...filters, city: city.name_ar, country: city.country_name_ar });
    } else {
      const selectedCountryData = countries.find(c => c.id === selectedCountry);
      if (selectedCountryData?.latitude && selectedCountryData?.longitude) {
        const lat = parseFloat(selectedCountryData.latitude);
        const lng = parseFloat(selectedCountryData.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
          flyToCoords(lat, lng, selectedCountryData.default_zoom || 6);
        }
      }
      // مسح فلتر المدينة فقط وإبقاء الدولة
      onChange({ ...filters, city: undefined });
    }
    onClose();
  };

  const displayCities = searchQuery.length >= 1 ? searchResults : cities;

  return (
    <div
      className="absolute top-full right-0 mt-1 z-[9999]"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="panel-animated bg-[#002845] rounded-xl shadow-lg border border-[#D4AF37]/40 p-3 w-[320px]">
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-[11px] font-bold text-[#D4AF37]">🌍 اختر الدولة والمدينة</h3>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="text-[10px] text-white/60 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-wrap gap-1 mb-2.5">
          <button
            type="button"
            className={`text-[9px] rounded-full px-2 py-0.5 transition font-semibold flex items-center gap-0.5 ${
              !selectedCountry ? "bg-[#D4AF37] text-[#002845]" : "bg-white/15 text-white/80 hover:bg-white/25"
            }`}
            onClick={(e) => { e.stopPropagation(); handleCountrySelect(null); }}
          >
            🌐 الكل
          </button>
          {countries.map((country) => (
            <button
              key={country.id}
              type="button"
              className={`text-[9px] rounded-full px-2 py-0.5 transition font-semibold flex items-center gap-0.5 ${
                selectedCountry === country.id ? "bg-[#D4AF37] text-[#002845]" : "bg-white/15 text-white/80 hover:bg-white/25"
              }`}
              onClick={(e) => { e.stopPropagation(); handleCountrySelect(country); }}
            >
              {country.flag_emoji} {country.name_ar}
            </button>
          ))}
        </div>

        <div className="relative mb-2.5">
          <input
            ref={searchInputRef}
            type="text"
            className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-1.5 text-[11px] text-white placeholder:text-white/50 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
            placeholder="🔍 ابحث عن مدينة..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
          {isSearching && (
            <div className="absolute left-2 top-1/2 -translate-y-1/2">
              <div className="w-3 h-3 border border-[#D4AF37] border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>

        <div className="max-h-[180px] overflow-y-auto scrollbar-thin scrollbar-thumb-[#D4AF37]/30">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className={`text-[10px] rounded-full px-2.5 py-1 transition font-semibold ${
                !filters.city ? "bg-[#D4AF37] text-[#002845]" : "bg-white/20 text-white hover:bg-white/30"
              }`}
              onClick={(e) => { e.stopPropagation(); handleCitySelect(null); }}
            >
              🏠 الكل
            </button>

            {loading ? (
              <div className="w-full text-center py-3">
                <div className="w-4 h-4 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
            ) : displayCities.length === 0 && searchQuery ? (
              <div className="w-full text-center py-2 text-white/50 text-[10px]">
                لا توجد نتائج لـ "{searchQuery}"
              </div>
            ) : (
              displayCities.map((city) => (
                <button
                  key={city.id}
                  type="button"
                  className={`text-[10px] rounded-full px-2.5 py-1 transition font-semibold flex items-center gap-1 ${
                    filters.city === city.name_ar ? "bg-[#D4AF37] text-[#002845]" : "bg-white/20 text-white hover:bg-white/30"
                  }`}
                  onClick={(e) => { e.stopPropagation(); handleCitySelect(city); }}
                >
                  {!selectedCountry && <span className="opacity-70">{city.flag_emoji}</span>}
                  {city.name_ar}
                </button>
              ))
            )}
          </div>
        </div>

        {selectedCountry && !searchQuery && displayCities.length > 0 && (
          <div className="mt-2 pt-2 border-t border-white/10 text-[9px] text-white/40 text-center">
            {displayCities.length} مدينة في {countries.find(c => c.id === selectedCountry)?.name_ar}
          </div>
        )}
      </div>
    </div>
  );
}

function PropertyTypePanel({
  filters,
  usageTab,
  onChange,
  onClose,
}: {
  filters: Filters;
  usageTab: UsageTab;
  onChange: (f: Filters) => void;
  onClose: () => void;
}) {
  const selected = filters.propertyTypes ?? [];

  const toggleType = (type: string) => {
    const current = filters.propertyTypes ?? [];
    if (current.includes(type)) {
      onChange({
        ...filters,
        propertyTypes: current.filter((t) => t !== type),
      });
    } else {
      onChange({
        ...filters,
        propertyTypes: [...current, type],
      });
    }
  };

  const clearAll = () =>
    onChange({
      ...filters,
      propertyTypes: [],
    });

  const typesToShow =
    usageTab === "residential"
      ? RESIDENTIAL_TYPES
      : usageTab === "commercial"
      ? COMMERCIAL_TYPES
      : [...RESIDENTIAL_TYPES, ...COMMERCIAL_TYPES];

  return (
    <div 
      className="panel-animated bg-[#002845] rounded-xl shadow-lg border border-[#D4AF37]/40 p-2.5 w-fit mx-auto max-h-[200px] overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2 gap-3">
        <h3 className="text-[10px] font-bold text-[#D4AF37]">نوع العقار</h3>
        <div className="flex items-center gap-2">
          {selected.length > 0 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); clearAll(); }} className="text-[10px] text-red-400 hover:text-red-300">مسح</button>
          )}
          <button type="button" onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-[10px] text-white/60 hover:text-white">✕</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 justify-center">
        {typesToShow.map((type) => {
          const isChecked = selected.includes(type);
          return (
            <button
              key={type}
              type="button"
              onClick={(e) => { e.stopPropagation(); toggleType(type); }}
              className={`text-[10px] rounded-full px-2.5 py-1 transition font-semibold ${
                isChecked ? "bg-[#D4AF37] text-[#002845]" : "bg-white/20 text-white hover:bg-white/30"
              }`}
            >
              {type}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PropertyCard({
  listing,
  isFavorite,
  onToggleFavorite,
  onHover,
  isActive,
}: {
  listing: Listing;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onHover?: () => void;
  isActive?: boolean;
}) {
  const priceText = formatListingPrice(listing.price, listing.country);
  const isPromo = listing.is_promotional;

  // Build image gallery (cover first, then the rest, dedup, up to 5).
  const galleryImages: string[] = useMemo(() => {
    const list: string[] = [];
    const cover = listing.cover_image || listing.image_url;
    if (cover) list.push(cover);
    if (Array.isArray(listing.images)) {
      for (const u of listing.images) {
        if (u && !list.includes(u)) list.push(u);
      }
    }
    if (list.length === 0) {
      list.push(`/images/property${(parseInt(String(listing.id).slice(-2), 16) % 5) + 1}.jpg`);
    }
    return list.slice(0, 5);
  }, [listing.id, listing.cover_image, listing.image_url, listing.images]);

  const [imgIndex, setImgIndex] = useState(0);
  const imageSrc = getImageUrl(galleryImages[imgIndex]) || galleryImages[imgIndex];

  // Normalize phone for wa.me (strip non-digits; convert leading 0 → 966 Saudi default).
  const waPhone = useMemo(() => {
    if (!listing.owner_phone) return null;
    const digits = listing.owner_phone.replace(/[^0-9+]/g, "").replace(/^\+/, "").replace(/^0/, "966");
    return digits.length >= 8 ? digits : null;
  }, [listing.owner_phone]);

  // Single-click → open listing. (Removed the brittle double-click trick.)
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onHover?.();
    window.location.href = `/listing/${listing.id}`;
  };

  return (
    <div
      className={`group relative rounded-2xl sm:rounded-3xl overflow-hidden shadow-md sm:shadow-[0_10px_25px_-12px_rgba(0,0,0,0.3)] border flex flex-col cursor-pointer active:scale-[0.98] sm:hover:-translate-y-1 sm:hover:shadow-[0_16px_40px_-10px_rgba(0,0,0,0.45)] transition ${
        isPromo
          ? "bg-gradient-to-br from-[#002845] via-[#003d66] to-[#001830] border-[#D4AF37]/50 ring-1 ring-[#D4AF37]/30"
          : "bg-white"
      } ${
        isActive ? "ring-2 ring-[#f6d879] border-[#f6d879]" : isPromo ? "" : "border-slate-200 sm:border-[#f6d879]/70"
      }`}
      onClick={handleClick}
    >
      {/* شارة العرض الترويجي */}
      {isPromo && (
        <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-l from-[#D4AF37] via-[#f6d879] to-[#D4AF37] py-1.5 px-3 text-center">
          <span className="text-[#002845] text-xs font-bold tracking-wide">✨ عرض ترويجي - تجربة العرض ✨</span>
        </div>
      )}

      {/* صورة العقار */}
      <div className={`relative w-full overflow-hidden flex items-center justify-center ${isPromo ? 'mt-7' : ''}`} style={{aspectRatio: "4/3"}}>
        {isPromo ? (
          <div className="absolute inset-0 bg-gradient-to-br from-[#002845] via-[#003d66] to-[#001830] flex items-center justify-center">
            <div className="text-center p-4">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-[#D4AF37]/20 flex items-center justify-center">
                <MapPin className="w-8 h-8 text-[#D4AF37]" />
              </div>
              <p className="text-white/80 text-sm font-medium">{listing.city}</p>
              <p className="text-[#D4AF37] text-xs mt-1">{listing.type}</p>
            </div>
          </div>
        ) : (
          <>
            <img
              src={imageSrc}
              alt={listing.title}
              className="object-cover w-full h-full bg-slate-800"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://picsum.photos/400/250?random=${listing.id}`;
              }}
            />
            {/* أسهم سحب + نقاط (تظهر فقط لو عندنا أكثر من صورة) */}
            {galleryImages.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="الصورة السابقة"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setImgIndex((i) => (i - 1 + galleryImages.length) % galleryImages.length);
                  }}
                  className="absolute top-1/2 -translate-y-1/2 right-1.5 w-8 h-8 rounded-full bg-black/45 hover:bg-black/65 text-white flex items-center justify-center shadow-md transition opacity-0 group-hover:opacity-100 sm:opacity-100"
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="الصورة التالية"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setImgIndex((i) => (i + 1) % galleryImages.length);
                  }}
                  className="absolute top-1/2 -translate-y-1/2 left-1.5 w-8 h-8 rounded-full bg-black/45 hover:bg-black/65 text-white flex items-center justify-center shadow-md transition opacity-0 group-hover:opacity-100 sm:opacity-100"
                >
                  ›
                </button>
                <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-0.5 bg-black/40 rounded-full pointer-events-none">
                  {galleryImages.map((_, i) => (
                    <span
                      key={i}
                      className={`w-1.5 h-1.5 rounded-full transition ${i === imgIndex ? "bg-white" : "bg-white/40"}`}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* شارة السعر */}
        <div className={`absolute bottom-2 sm:bottom-3 right-2 sm:right-3 rounded-xl sm:rounded-full px-3 py-1.5 sm:py-1 text-sm sm:text-sm font-bold shadow-lg ${
          isPromo ? "bg-[#D4AF37] text-[#002845]" : "bg-[#002845]/90 backdrop-blur text-white"
        }`}>
          {priceText}
        </div>

        {/* نوع العرض - بيع/إيجار */}
        <div className={`absolute top-2 sm:top-3 right-2 sm:right-3 rounded-lg sm:rounded-full px-2.5 py-1 text-xs font-bold shadow ${
          isPromo ? "bg-white/20 text-white backdrop-blur" : "bg-[#D4AF37] text-[#002845]"
        }`}>
          {listing.purpose === 'sale' ? 'للبيع' : listing.purpose === 'rent' ? 'للإيجار' : listing.purpose || 'عقار'}
        </div>

        {/* زر القلب - مخفي للإعلانات الترويجية */}
        {!isPromo && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite();
            }}
            className="absolute top-2 sm:top-3 left-2 sm:left-3 w-10 h-10 sm:w-9 sm:h-9 rounded-full bg-white/95 flex items-center justify-center shadow-lg active:scale-90 transition"
          >
            {isFavorite ? (
              <Heart className="w-5 h-5 text-red-500 fill-red-500" />
            ) : (
              <Heart className="w-5 h-5 text-gray-400 hover:text-red-400" />
            )}
          </button>
        )}
      </div>

      {/* جسم الكرت */}
      <div className={`p-3 sm:p-4 flex flex-col gap-1.5 sm:gap-2 flex-1 ${isPromo ? '' : ''}`}>
        {/* العنوان */}
        <h2 className={`text-sm sm:text-base font-bold leading-snug line-clamp-2 ${
          isPromo ? "text-white" : "text-[#002845]"
        }`}>
          {listing.title}
        </h2>

        {/* الموقع */}
        <p className={`text-xs flex items-center gap-1 ${isPromo ? "text-white/70" : "text-slate-500"}`}>
          <MapPin className={`w-3.5 h-3.5 flex-shrink-0 ${isPromo ? "text-[#D4AF37]" : "text-[#D4AF37]"}`} />
          <span className="truncate">
            {listing.city || "مدينة غير محددة"}
            {listing.district && <span className={isPromo ? "text-white/50" : "text-slate-400"}> • {listing.district}</span>}
          </span>
        </p>

        {/* المواصفات */}
        <div className={`mt-1 flex items-center gap-3 text-xs ${isPromo ? "text-white/60" : "text-slate-600"}`}>
          {listing.bedrooms ? (
            <div className="flex items-center gap-1">
              <BedDouble className={`w-3.5 h-3.5 ${isPromo ? "text-[#D4AF37]/70" : "text-slate-400"}`} />
              <span className="font-medium">{listing.bedrooms}</span>
            </div>
          ) : null}
          {listing.bathrooms ? (
            <div className="flex items-center gap-1">
              <Bath className={`w-3.5 h-3.5 ${isPromo ? "text-[#D4AF37]/70" : "text-slate-400"}`} />
              <span className="font-medium">{listing.bathrooms}</span>
            </div>
          ) : null}
          {listing.land_area ? (
            <div className="flex items-center gap-1">
              <Square className={`w-3.5 h-3.5 ${isPromo ? "text-[#D4AF37]/70" : "text-slate-400"}`} />
              <span className="font-medium">{listing.land_area} م²</span>
            </div>
          ) : null}
        </div>

        {/* زر WhatsApp مباشر — يظهر فقط لو الإعلان حقيقي وعنده رقم */}
        {!isPromo && waPhone && (
          <a
            href={`https://wa.me/${waPhone}?text=${encodeURIComponent(
              `السلام عليكم، استفسار عن إعلانكم: ${listing.title}\n${typeof window !== "undefined" ? window.location.origin : "https://www.baytaljazeera.com"}/listing/${listing.id}`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-2 inline-flex items-center justify-center gap-1.5 w-full py-2 rounded-xl bg-gradient-to-r from-[#1B5E3A] to-[#2D7A4E] text-white text-xs font-bold shadow-sm hover:from-[#256B45] hover:to-[#3A8A5A] transition"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            تواصل عبر واتساب
          </a>
        )}

        {/* رسالة ترويجية */}
        {isPromo && (
          <div className="mt-2 pt-2 border-t border-white/10">
            <p className="text-[10px] text-[#D4AF37]/80 text-center">أضف إعلانك الآن واستفد من عروضنا المميزة</p>
          </div>
        )}
      </div>
    </div>
  );
}
