"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { MapPin } from "lucide-react";

// مكوّن الخريطة (اللي فوق)
const MapClient = dynamic(() => import("@/components/MapClient"), {
  ssr: false,
});

// نوع الإعلان (أضفت احتمالية وجود lat/lng أو latitude/longitude)
type Listing = {
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
  lat?: number | null;
  lng?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

// فلاتر البحث
type Filters = {
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  minArea?: number;
  maxArea?: number;
  bedrooms?: number;
  bathrooms?: number;
  listerType?: string;
  propertyTypes?: string[]; // أنواع العقار المختارة
  searchText?: string;
};

type PurposeTab = "all" | "sell" | "rent";
type UsageTab = "residential" | "commercial";
type ActivePanel =
  | "price"
  | "area"
  | "beds"
  | "city"
  | "propertyType"
  | "none";

// دالة بناء رابط الـ API - نستخدم مسار نسبي لأن Next.js rewrites يتولى تحويل الطلبات
function getApiBase(): string {
  return "";
}

// أنواع العقار السكنية
const RESIDENTIAL_TYPES: string[] = [
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
const COMMERCIAL_TYPES: string[] = [
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

// مدن المملكة (يمكن توسعتها)
const SAUDI_CITIES: string[] = [
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

// نفس الهيستوجرام للسعر/المساحة (شكل جمالي مثل Zillow)
const SLIDER_BARS: number[] = [5, 15, 25, 40, 55, 70, 80, 70, 60, 45, 30, 18, 10];

// سويتش قائمة / خريطة
function ViewToggle({ active }: { active: "list" | "map" }) {
  return (
    <div className="inline-flex rounded-full overflow-hidden border border-[#f6d879] bg-[#fdf6db] shadow-md">
      <Link
        href="/search"
        className={`px-6 py-2 text-sm font-bold flex items-center gap-1 ${
          active === "list"
            ? "bg-[#002845] text-white"
            : "bg-transparent text-[#002845]"
        }`}
      >
        <span className="text-xs">☰</span>
        <span>قائمة</span>
      </Link>
      <Link
        href="/map"
        className={`px-6 py-2 text-sm font-bold flex items-center gap-1 ${
          active === "map"
            ? "bg-[#002845] text-white"
            : "bg-transparent text-[#002845]"
        }`}
      >
        <MapPin className="w-4 h-4" />
        <span>خريطة</span>
      </Link>
    </div>
  );
}

export default function MapPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [purposeTab, setPurposeTab] = useState<PurposeTab>("all");
  const [usageTab, setUsageTab] = useState<UsageTab>("residential");
  const [activePanel, setActivePanel] = useState<ActivePanel>("none");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // جلب الإعلانات
  useEffect(() => {
    async function loadListings() {
      try {
        setIsLoading(true);
        setError(null);
        const apiBase = getApiBase();
        const res = await fetch(`${apiBase}/api/listings`);
        if (!res.ok) throw new Error("فشل في تحميل الإعلانات من الخادم");
        const data: Listing[] = await res.json();
        setListings(data);
      } catch (err) {
        console.error("Error loading listings:", err);
        setError("تعذّر تحميل الإعلانات، يرجى المحاولة لاحقًا.");
      } finally {
        setIsLoading(false);
      }
    }
    loadListings();
  }, []);

  // الفلترة (نفس ما استخدمناه في صفحة القائمة)
  const filteredListings = useMemo(() => {
    return listings.filter((item) => {
      let ok = true;

      const typeLower = (item.type || "").toLowerCase();

      // سكني / تجاري
      if (usageTab === "residential") {
        if (
          COMMERCIAL_TYPES.some((t) => typeLower.includes(t.toLowerCase()))
        ) {
          ok = false;
        }
      } else if (usageTab === "commercial") {
        if (
          !COMMERCIAL_TYPES.some((t) => typeLower.includes(t.toLowerCase()))
        ) {
          ok = false;
        }
      }

      // بيع / إيجار
      if (purposeTab === "sell" && item.purpose !== "بيع") ok = false;
      if (purposeTab === "rent" && item.purpose !== "إيجار") ok = false;

      // نوع العقار (متعدد)
      if (filters.propertyTypes && filters.propertyTypes.length > 0) {
        if (!item.type || !filters.propertyTypes.includes(item.type)) ok = false;
      }

      // المدينة
      if (filters.city && item.city) {
        if (item.city !== filters.city) ok = false;
      }

      // نوع المعلن (مستقبلاً)
      if (filters.listerType && item.lister_type) {
        if (item.lister_type !== filters.listerType) ok = false;
      }

      // السعر
      if (typeof filters.minPrice === "number" && item.price != null) {
        if (item.price < filters.minPrice) ok = false;
      }
      if (typeof filters.maxPrice === "number" && item.price != null) {
        if (item.price > filters.maxPrice) ok = false;
      }

      // المساحة
      if (typeof filters.minArea === "number" && item.area != null) {
        if (item.area < filters.minArea) ok = false;
      }
      if (typeof filters.maxArea === "number" && item.area != null) {
        if (item.area > filters.maxArea) ok = false;
      }

      // غرف النوم
      if (typeof filters.bedrooms === "number" && item.bedrooms != null) {
        if (item.bedrooms < filters.bedrooms) ok = false;
      }

      // دورات المياه
      if (typeof filters.bathrooms === "number" && item.bathrooms != null) {
        if (item.bathrooms < filters.bathrooms) ok = false;
      }

      // نص البحث
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

      return ok;
    });
  }, [listings, filters, purposeTab, usageTab]);

  const bgGradient =
    "radial-gradient(circle at top, #fdf6db 0, #f7e1b0 35%, #f3d28f 70%, #e4c27a 100%)";

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: bgGradient }}
      dir="rtl"
    >
      <div className="max-w-7xl mx-auto w-full py-8 px-4 md:px-8 space-y-4">
        {/* العنوان + السويتش */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-[#002845] mb-1">
              عرض العقارات على الخريطة
            </h1>
            <p className="text-sm md:text-base text-[#002845]/80 max-w-xl">
              استخدم نفس فلاتر البحث المتقدّم، وشاهد العقارات مباشرة على
              خريطة تفاعلية مع ظهور موقعك الحالي.
            </p>
          </div>
          <ViewToggle active="map" />
        </div>

        {/* شريط الفلاتر الرئيسي (نفس شريط صفحة البحث) */}
        <div className="rounded-full bg-[#002845] text-white px-4 py-3 md:px-6 md:py-4 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] space-y-3">
          <div className="flex flex-col md:flex-row gap-3 items-stretch">
            {/* سكني / تجاري */}
            <div className="flex-1">
              <label className="block text-xs text-[#fdf6db]/80 mb-1">
                طبيعة الاستخدام
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setUsageTab("residential");
                    setFilters((prev) => ({
                      ...prev,
                      propertyTypes: undefined,
                    }));
                  }}
                  className={`flex-1 rounded-full px-3 py-2 text-xs md:text-sm font-bold border transition ${
                    usageTab === "residential"
                      ? "bg-white text-[#002845] border-white"
                      : "bg-transparent text-white border-white/30 hover:bg-white/10"
                  }`}
                >
                  سكني
                </button>
                <button
                  onClick={() => {
                    setUsageTab("commercial");
                    setFilters((prev) => ({
                      ...prev,
                      propertyTypes: undefined,
                    }));
                  }}
                  className={`flex-1 rounded-full px-3 py-2 text-xs md:text-sm font-bold border transition ${
                    usageTab === "commercial"
                      ? "bg-[#f6d879] text-[#002845] border-[#f6d879]"
                      : "bg-transparent text-white border-white/30 hover:bg-white/10"
                  }`}
                >
                  تجاري
                </button>
              </div>
            </div>

            {/* بيع / إيجار */}
            <div className="flex-1">
              <label className="block text-xs text-[#fdf6db]/80 mb-1">
                العرض
              </label>
              <div className="flex gap-2">
                {[
                  { key: "all" as PurposeTab, label: "الكل" },
                  { key: "sell" as PurposeTab, label: "بيع" },
                  { key: "rent" as PurposeTab, label: "إيجار" },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setPurposeTab(tab.key)}
                    className={`flex-1 rounded-full px-3 py-2 text-xs md:text-sm font-bold border transition ${
                      purposeTab === tab.key
                        ? "bg-[#f6d879] text-[#002845] border-[#f6d879]"
                        : "bg-transparent text-white border-white/30 hover:bg-white/10"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* أزرار Panels */}
            <div className="flex-1 flex flex-wrap gap-2 md:justify-end">
              <FilterButton
                label="السعر"
                active={activePanel === "price"}
                onClick={() =>
                  setActivePanel(activePanel === "price" ? "none" : "price")
                }
              />
              <FilterButton
                label="المساحة"
                active={activePanel === "area"}
                onClick={() =>
                  setActivePanel(activePanel === "area" ? "none" : "area")
                }
              />
              <FilterButton
                label="غرف ودورات مياه"
                active={activePanel === "beds"}
                onClick={() =>
                  setActivePanel(activePanel === "beds" ? "none" : "beds")
                }
              />
              <FilterButton
                label="المدينة"
                active={activePanel === "city"}
                onClick={() =>
                  setActivePanel(activePanel === "city" ? "none" : "city")
                }
              />
              <FilterButton
                label="نوع العقار"
                active={activePanel === "propertyType"}
                onClick={() =>
                  setActivePanel(
                    activePanel === "propertyType" ? "none" : "propertyType"
                  )
                }
              />
            </div>
          </div>

          {/* حقل بحث عام */}
          <div>
            <input
              type="text"
              className="w-full rounded-full bg-white/10 border border-white/20 px-4 py-2 text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-[#f6d879]"
              placeholder="ابحث باسم المدينة، الحي، وصف العقار أو كلمة مفتاحية..."
              value={filters.searchText ?? ""}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  searchText: e.target.value,
                }))
              }
            />
          </div>
        </div>

        {/* Panels مثل Zillow */}
        <div className="relative mt-2 min-h-[0px]">
          {activePanel === "price" && (
            <PricePanel
              filters={filters}
              onChange={setFilters}
              onClose={() => setActivePanel("none")}
            />
          )}
          {activePanel === "area" && (
            <AreaPanel
              filters={filters}
              onChange={setFilters}
              onClose={() => setActivePanel("none")}
            />
          )}
          {activePanel === "beds" && (
            <BedsPanel
              filters={filters}
              onChange={setFilters}
              onClose={() => setActivePanel("none")}
            />
          )}
          {activePanel === "city" && (
            <CityPanel
              filters={filters}
              onChange={setFilters}
              onClose={() => setActivePanel("none")}
            />
          )}
          {activePanel === "propertyType" && (
            <PropertyTypePanel
              filters={filters}
              usageTab={usageTab}
              onChange={setFilters}
              onClose={() => setActivePanel("none")}
            />
          )}
        </div>

        {/* الخريطة نفسها */}
        <div className="mt-4">
          <div className="relative h-[70vh] rounded-3xl overflow-hidden border border-[#f6d879]/60 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.35)] bg-white">
            <MapClient listings={filteredListings} />

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

            {!isLoading && !error && filteredListings.length === 0 && (
              <div className="absolute inset-x-4 bottom-4 bg-white/95 border border-slate-200 rounded-2xl px-3 py-2 text-[11px] text-[#002845]/80 shadow-md text-center">
                لا توجد عقارات مطابقة لبحثك حاليًا، سيظهر فقط موقعك إن سمح
                المتصفح بذلك.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========== عناصر مساعدة للفلاتر ========== */

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
      className={`rounded-full border px-4 py-1.5 text-xs md:text-sm font-semibold flex items-center gap-1 transition ${
        active
          ? "bg-white text-[#002845] border-white"
          : "bg-white/10 text-white border-white/30 hover:bg-white/15"
      }`}
    >
      <span>{label}</span>
    </button>
  );
}

/* ---------- Panel السعر (سلايدر مزدوج + هيستوجرام) ---------- */

function PricePanel({
  filters,
  onChange,
  onClose,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  onClose: () => void;
}) {
  const MIN = 0;
  const MAX = 10_000_000;
  const STEP = 50_000;

  const minValue = filters.minPrice ?? MIN;
  const maxValue = filters.maxPrice ?? MAX;

  const minPercent = ((minValue - MIN) / (MAX - MIN)) * 100;
  const maxPercent = ((maxValue - MIN) / (MAX - MIN)) * 100;

  const formatPrice = (value: number) => {
    if (value >= MAX) return "١٠٬٠٠٠٬٠٠٠+ ريال";
    return `${value.toLocaleString("en-US")} ريال`;
  };

  const formatMinBubble = (value: number) =>
    value <= MIN ? "لا حد أدنى" : formatPrice(value);

  const formatMaxBubble = (value: number) =>
    value >= MAX ? "لا حد أعلى" : formatPrice(value);

  const handleMinSliderChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = Number(e.target.value);
    const currentMax = filters.maxPrice ?? MAX;
    const clamped = Math.min(raw, currentMax - STEP);
    const finalValue = Math.max(MIN, clamped);
    onChange({
      ...filters,
      minPrice: finalValue <= MIN ? undefined : finalValue,
    });
  };

  const handleMaxSliderChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = Number(e.target.value);
    const currentMin = filters.minPrice ?? MIN;
    const clamped = Math.max(raw, currentMin + STEP);
    const finalValue = Math.min(MAX, clamped);
    onChange({
      ...filters,
      maxPrice: finalValue >= MAX ? undefined : finalValue,
    });
  };

  const handleMinInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value ? Number(e.target.value) : undefined;
    if (value === undefined) {
      onChange({ ...filters, minPrice: undefined });
      return;
    }
    const safe = Math.max(
      MIN,
      Math.min(value, (filters.maxPrice ?? MAX) - STEP)
    );
    onChange({ ...filters, minPrice: safe <= MIN ? undefined : safe });
  };

  const handleMaxInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value ? Number(e.target.value) : undefined;
    if (value === undefined) {
      onChange({ ...filters, maxPrice: undefined });
      return;
    }
    const safe = Math.min(
      MAX,
      Math.max(value, (filters.minPrice ?? MIN) + STEP)
    );
    onChange({ ...filters, maxPrice: safe >= MAX ? undefined : safe });
  };

  return (
    <div className="absolute z-20 mt-2 w-full md:max-w-xl bg-white rounded-3xl shadow-xl border border-slate-100 px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-[#002845]">
          نطاق السعر (ريال سعودي)
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          إغلاق
        </button>
      </div>

      {/* الهيستوجرام + السلايدر */}
      <div className="mb-4">
        <div className="relative pt-2 pb-8 px-1">
          {/* الأعمدة */}
          <div className="flex items-end gap-[2px] h-16 mb-3">
            {SLIDER_BARS.map((h, i) => {
              const ratio =
                SLIDER_BARS.length <= 1 ? 0 : i / (SLIDER_BARS.length - 1);
              const percent = ratio * 100;
              const inRange =
                percent >= minPercent && percent <= maxPercent;

              return (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm overflow-hidden bg-transparent"
                >
                  <div
                    className={`w-full ${
                      inRange ? "bg-[#002845]" : "bg-[#f6d879]/60"
                    }`}
                    style={{
                      height: `${h}%`,
                      opacity: inRange ? 1 : 0.35,
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* المسار الخلفي */}
          <div className="absolute left-1 right-1 bottom-2 h-1.5 rounded-full bg-slate-200" />
          {/* المدى المحدد */}
          <div
            className="absolute bottom-2 h-1.5 rounded-full bg-[#002845]"
            style={{
              left: `${minPercent}%`,
              right: `${100 - maxPercent}%`,
            }}
          />

          {/* الفقاعة للحد الأدنى */}
          <div
            className="absolute bottom-7 px-2 py-1 rounded-full bg-white shadow-md border border-slate-200 text-[10px] font-semibold text-[#002845] whitespace-nowrap"
            style={{
              left: `${minPercent}%`,
              transform: "translateX(-50%)",
            }}
          >
            {formatMinBubble(minValue)}
          </div>

          {/* الفقاعة للحد الأعلى */}
          <div
            className="absolute bottom-7 px-2 py-1 rounded-full bg-white shadow-md border border-slate-200 text-[10px] font-semibold text-[#002845] whitespace-nowrap"
            style={{
              left: `${maxPercent}%`,
              transform: "translateX(-50%)",
            }}
          >
            {formatMaxBubble(maxValue)}
          </div>

          {/* سلايدر الحد الأدنى */}
          <input
            type="range"
            min={MIN}
            max={MAX}
            step={STEP}
            value={minValue}
            onChange={handleMinSliderChange}
            className="price-range-slider absolute inset-x-1 bottom-0 h-6"
          />
          {/* سلايدر الحد الأعلى */}
          <input
            type="range"
            min={MIN}
            max={MAX}
            step={STEP}
            value={maxValue}
            onChange={handleMaxSliderChange}
            className="price-range-slider absolute inset-x-1 bottom-0 h-6"
          />
        </div>

        {/* الأرقام تحت */}
        <div className="flex justify-between text-[11px] text-slate-600 mt-1">
          <span>{formatPrice(MIN)}</span>
          <span>{formatPrice(MAX)}</span>
        </div>
      </div>

      {/* حقول الإدخال */}
      <div className="flex gap-3">
        <div className="flex-1">
          <p className="text-[11px] font-semibold text-[#002845] mb-1">
            الحد الأدنى
          </p>
          <input
            type="number"
            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#f6d879]"
            placeholder="لا حد أدنى"
            value={filters.minPrice ?? ""}
            onChange={handleMinInputChange}
          />
        </div>
        <div className="flex-1">
          <p className="text-[11px] font-semibold text-[#002845] mb-1">
            الحد الأعلى
          </p>
          <input
            type="number"
            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#f6d879]"
            placeholder="لا حد أعلى"
            value={filters.maxPrice ?? ""}
            onChange={handleMaxInputChange}
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-[#002845] text-white text-xs px-5 py-1.5 font-semibold hover:bg-[#012846] transition"
        >
          تطبيق
        </button>
      </div>

      {/* ستايل السلايدر */}
      <style jsx global>{`
        .price-range-slider {
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
        }

        .price-range-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          height: 18px;
          width: 18px;
          border-radius: 9999px;
          background: #f6d879;
          border: 3px solid #002845;
          box-shadow: 0 0 0 3px rgba(0, 40, 69, 0.25);
          cursor: pointer;
          margin-top: -7px;
        }

        .price-range-slider::-moz-range-thumb {
          height: 18px;
          width: 18px;
          border-radius: 9999px;
          background: #f6d879;
          border: 3px solid #002845;
          box-shadow: 0 0 0 3px rgba(0, 40, 69, 0.25);
          cursor: pointer;
        }

        .price-range-slider::-webkit-slider-runnable-track {
          height: 4px;
          background: transparent;
        }

        .price-range-slider::-moz-range-track {
          height: 4px;
          background: transparent;
        }
      `}</style>
    </div>
  );
}

/* ---------- Panel المساحة (نفس الفكرة) ---------- */

function AreaPanel({
  filters,
  onChange,
  onClose,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  onClose: () => void;
}) {
  const MIN = 0;
  const MAX = 5_000; // عدّلها حسب أكبر مساحة عندك
  const STEP = 50;

  const minValue = filters.minArea ?? MIN;
  const maxValue = filters.maxArea ?? MAX;

  const minPercent = ((minValue - MIN) / (MAX - MIN)) * 100;
  const maxPercent = ((maxValue - MIN) / (MAX - MIN)) * 100;

  const formatArea = (value: number) => {
    if (value >= MAX) return `${MAX.toLocaleString("en-US")}+ م²`;
    return `${value.toLocaleString("en-US")} م²`;
  };

  const formatMinBubble = (value: number) =>
    value <= MIN ? "أي مساحة" : formatArea(value);

  const formatMaxBubble = (value: number) =>
    value >= MAX ? "أقصى مساحة" : formatArea(value);

  const handleMinSliderChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = Number(e.target.value);
    const currentMax = filters.maxArea ?? MAX;
    const clamped = Math.min(raw, currentMax - STEP);
    const finalValue = Math.max(MIN, clamped);
    onChange({
      ...filters,
      minArea: finalValue <= MIN ? undefined : finalValue,
    });
  };

  const handleMaxSliderChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = Number(e.target.value);
    const currentMin = filters.minArea ?? MIN;
    const clamped = Math.max(raw, currentMin + STEP);
    const finalValue = Math.min(MAX, clamped);
    onChange({
      ...filters,
      maxArea: finalValue >= MAX ? undefined : finalValue,
    });
  };

  const handleMinInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value ? Number(e.target.value) : undefined;
    if (value === undefined) {
      onChange({ ...filters, minArea: undefined });
      return;
    }
    const safe = Math.max(
      MIN,
      Math.min(value, (filters.maxArea ?? MAX) - STEP)
    );
    onChange({ ...filters, minArea: safe <= MIN ? undefined : safe });
  };

  const handleMaxInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value ? Number(e.target.value) : undefined;
    if (value === undefined) {
      onChange({ ...filters, maxArea: undefined });
      return;
    }
    const safe = Math.min(
      MAX,
      Math.max(value, (filters.minArea ?? MIN) + STEP)
    );
    onChange({ ...filters, maxArea: safe >= MAX ? undefined : safe });
  };

  return (
    <div className="absolute z-20 mt-2 w-full md:max-w-xl bg-white rounded-3xl shadow-xl border border-slate-100 px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-[#002845]">
          نطاق المساحة (متر مربع)
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          إغلاق
        </button>
      </div>

      <div className="mb-4">
        <div className="relative pt-2 pb-8 px-1">
          <div className="flex items-end gap-[2px] h-16 mb-3">
            {SLIDER_BARS.map((h, i) => {
              const ratio =
                SLIDER_BARS.length <= 1 ? 0 : i / (SLIDER_BARS.length - 1);
              const percent = ratio * 100;
              const inRange =
                percent >= minPercent && percent <= maxPercent;

              return (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm overflow-hidden bg-transparent"
                >
                  <div
                    className={`w-full ${
                      inRange ? "bg-[#002845]" : "bg-[#f6d879]/60"
                    }`}
                    style={{
                      height: `${h}%`,
                      opacity: inRange ? 1 : 0.35,
                    }}
                  />
                </div>
              );
            })}
          </div>

          <div className="absolute left-1 right-1 bottom-2 h-1.5 rounded-full bg-slate-200" />
          <div
            className="absolute bottom-2 h-1.5 rounded-full bg-[#002845]"
            style={{
              left: `${minPercent}%`,
              right: `${100 - maxPercent}%`,
            }}
          />

          <div
            className="absolute bottom-7 px-2 py-1 rounded-full bg-white shadow-md border border-slate-200 text-[10px] font-semibold text-[#002845] whitespace-nowrap"
            style={{
              left: `${minPercent}%`,
              transform: "translateX(-50%)",
            }}
          >
            {formatMinBubble(minValue)}
          </div>
          <div
            className="absolute bottom-7 px-2 py-1 rounded-full bg-white shadow-md border border-slate-200 text-[10px] font-semibold text-[#002845] whitespace-nowrap"
            style={{
              left: `${maxPercent}%`,
              transform: "translateX(-50%)",
            }}
          >
            {formatMaxBubble(maxValue)}
          </div>

          <input
            type="range"
            min={MIN}
            max={MAX}
            step={STEP}
            value={minValue}
            onChange={handleMinSliderChange}
            className="area-range-slider absolute inset-x-1 bottom-0 h-6"
          />
          <input
            type="range"
            min={MIN}
            max={MAX}
            step={STEP}
            value={maxValue}
            onChange={handleMaxSliderChange}
            className="area-range-slider absolute inset-x-1 bottom-0 h-6"
          />
        </div>

        <div className="flex justify-between text-[11px] text-slate-600 mt-1">
          <span>{formatArea(MIN)}</span>
          <span>{formatArea(MAX)}</span>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <p className="text-[11px] font-semibold text-[#002845] mb-1">
            الحد الأدنى للمساحة
          </p>
          <input
            type="number"
            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#f6d879]"
            placeholder="أي مساحة"
            value={filters.minArea ?? ""}
            onChange={handleMinInputChange}
          />
        </div>
        <div className="flex-1">
          <p className="text-[11px] font-semibold text-[#002845] mb-1">
            الحد الأعلى للمساحة
          </p>
          <input
            type="number"
            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#f6d879]"
            placeholder="أقصى مساحة"
            value={filters.maxArea ?? ""}
            onChange={handleMaxInputChange}
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-[#002845] text-white text-xs px-5 py-1.5 font-semibold hover:bg-[#012846] transition"
        >
          تطبيق
        </button>
      </div>

      <style jsx global>{`
        .area-range-slider {
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
        }

        .area-range-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          height: 18px;
          width: 18px;
          border-radius: 9999px;
          background: #f6d879;
          border: 3px solid #002845;
          box-shadow: 0 0 0 3px rgba(0, 40, 69, 0.25);
          cursor: pointer;
          margin-top: -7px;
        }

        .area-range-slider::-moz-range-thumb {
          height: 18px;
          width: 18px;
          border-radius: 9999px;
          background: #f6d879;
          border: 3px solid #002845;
          box-shadow: 0 0 0 3px rgba(0, 40, 69, 0.25);
          cursor: pointer;
        }

        .area-range-slider::-webkit-slider-runnable-track {
          height: 4px;
          background: transparent;
        }

        .area-range-slider::-moz-range-track {
          height: 4px;
          background: transparent;
        }
      `}</style>
    </div>
  );
}

/* ---------- Panel غرف النوم ودورات المياه ---------- */

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
  const bathOptions = [1, 2, 3, 4];

  return (
    <div className="absolute z-20 mt-2 w-full md:max-w-xl bg-white rounded-3xl shadow-xl border border-slate-100 px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-[#002845]">
          غرف النوم ودورات المياه
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          إغلاق
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold text-[#002845] mb-2">
            عدد غرف النوم (حد أدنى)
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...filters,
                  bedrooms: undefined,
                })
              }
              className={`px-3 py-1 rounded-full text-xs border ${
                !filters.bedrooms
                  ? "bg-[#f6d879] text-[#002845] border-[#f6d879]"
                  : "bg-white text-[#002845] border-slate-200"
              }`}
            >
              أي عدد
            </button>
            {bedOptions.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() =>
                  onChange({
                    ...filters,
                    bedrooms: n,
                  })
                }
                className={`px-3 py-1 rounded-full text-xs border ${
                  filters.bedrooms === n
                    ? "bg-[#002845] text-white border-[#002845]"
                    : "bg-white text-[#002845] border-slate-200"
                }`}
              >
                {n}+
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-[#002845] mb-2">
            عدد دورات المياه (حد أدنى)
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...filters,
                  bathrooms: undefined,
                })
              }
              className={`px-3 py-1 rounded-full text-xs border ${
                !filters.bathrooms
                  ? "bg-[#f6d879] text-[#002845] border-[#f6d879]"
                  : "bg-white text-[#002845] border-slate-200"
              }`}
            >
              أي عدد
            </button>
            {bathOptions.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() =>
                  onChange({
                    ...filters,
                    bathrooms: n,
                  })
                }
                className={`px-3 py-1 rounded-full text-xs border ${
                  filters.bathrooms === n
                    ? "bg-[#002845] text-white border-[#002845]"
                    : "bg-white text-[#002845] border-slate-200"
                }`}
              >
                {n}+
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-[#002845] text-white text-xs px-4 py-1.5 font-semibold hover:bg-[#012846] transition"
        >
          تطبيق
        </button>
      </div>
    </div>
  );
}

/* ---------- Panel اختيار المدينة ---------- */

function CityPanel({
  filters,
  onChange,
  onClose,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute z-20 mt-2 w-full md:max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 px-5 py-4 max-h-[320px] overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-[#002845]">اختيار المدينة</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          إغلاق
        </button>
      </div>
      <div className="space-y-1">
        <button
          type="button"
          className={`w-full text-right text-xs rounded-full px-3 py-1 ${
            !filters.city
              ? "bg-[#f6d879] text-[#002845]"
              : "bg-transparent text-[#002845]"
          }`}
          onClick={() =>
            onChange({
              ...filters,
              city: undefined,
            })
          }
        >
          كل المدن
        </button>
        {SAUDI_CITIES.map((city) => (
          <button
            key={city}
            type="button"
            className={`w-full text-right text-xs rounded-full px-3 py-1 hover:bg-[#fdf6db] ${
              filters.city === city ? "bg-[#f6d879]/60" : ""
            }`}
            onClick={() =>
              onChange({
                ...filters,
                city,
              })
            }
          >
            {city}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- Panel نوع العقار (متعدد) ---------- */

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
    <div className="absolute z-20 mt-2 w-full md:max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 px-5 py-4 max-h-[360px] overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-[#002845]">نوع العقار</h3>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={clearAll}
            className="text-[11px] text-slate-500 hover:text-slate-700"
          >
            إلغاء التحديد
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            إغلاق
          </button>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 mb-2">
        يمكنك اختيار أكثر من نوع معًا، تمامًا كما في Home Type في Zillow.
      </p>

      <div className="space-y-2">
        {typesToShow.map((type) => {
          const isChecked = selected.includes(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggleType(type)}
              className={`w-full flex items-center justify-between rounded-2xl border px-3 py-2 text-xs md:text-sm transition ${
                isChecked
                  ? "bg-[#002845] text-white border-[#002845]"
                  : "bg-white text-[#002845] border-slate-200 hover:bg-[#fdf6db]"
              }`}
            >
              <span>{type}</span>
              <span
                className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                  isChecked
                    ? "border-white bg-[#f6d879]"
                    : "border-slate-300 bg-white"
                }`}
              >
                {isChecked && (
                  <span className="block w-2 h-2 rounded-full bg-[#002845]" />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-[#002845] text-white text-xs px-4 py-1.5 font-semibold hover:bg-[#012846] transition"
        >
          تطبيق
        </button>
      </div>
    </div>
  );
}
