"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, MapPin, Home, Building2, Landmark, X } from "lucide-react";
import { RangeSliderWithBox } from "./RangeSliderWithBox";
import { PriceSliderWithGradient } from "./PriceSliderWithGradient";

export type MapSearchFilters = {
  query?: string;
  city?: string;
  propertyType?: "شقة" | "فيلا" | "أرض" | "مكتب" | "محل" | "";
  purpose?: "بيع" | "إيجار" | "";
  priceRange?: [number, number];
  areaRange?: [number, number];
  bedrooms?: number;
  bathrooms?: number;
};

type MapSearchPanelProps = {
  filters: MapSearchFilters;
  onFiltersChange: (filters: MapSearchFilters) => void;
  resultCount?: number;
  isLoading?: boolean;
};

const cities = [
  "الرياض",
  "جدة",
  "مكة المكرمة",
  "المدينة المنورة",
  "الدمام",
  "الخبر",
  "الطائف",
  "تبوك",
  "أبها",
];

const propertyTypes = [
  { value: "شقة", icon: Building2, label: "شقة" },
  { value: "فيلا", icon: Home, label: "فيلا" },
  { value: "أرض", icon: MapPin, label: "أرض" },
  { value: "مكتب", icon: Landmark, label: "مكتب" },
];

export function MapSearchPanel({
  filters,
  onFiltersChange,
  resultCount = 0,
  isLoading = false,
}: MapSearchPanelProps) {
  const updateFilter = <K extends keyof MapSearchFilters>(
    key: K,
    value: MapSearchFilters[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFiltersChange({});
  };

  const hasActiveFilters =
    filters.query ||
    filters.city ||
    filters.propertyType ||
    filters.purpose ||
    (filters.priceRange && (filters.priceRange[0] > 0 || filters.priceRange[1] < 5000000));

  return (
    <div className="bg-white rounded-2xl shadow-lg p-4 md:p-6" dir="rtl">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#002845]">البحث في الخريطة</h2>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="text-red-500 hover:text-red-600 hover:bg-red-50"
            >
              <X className="w-4 h-4 ml-1" />
              مسح الفلاتر
            </Button>
          )}
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              placeholder="ابحث عن حي، شارع، أو معلم..."
              className="pr-10 h-11 text-base"
              value={filters.query || ""}
              onChange={(e) => updateFilter("query", e.target.value)}
            />
          </div>

          <select
            className="h-11 px-4 rounded-lg border border-gray-200 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#002845]/20"
            value={filters.city || ""}
            onChange={(e) => updateFilter("city", e.target.value)}
          >
            <option value="">كل المدن</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>

          <select
            className="h-11 px-4 rounded-lg border border-gray-200 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#002845]/20"
            value={filters.purpose || ""}
            onChange={(e) => updateFilter("purpose", e.target.value as MapSearchFilters["purpose"])}
          >
            <option value="">بيع / إيجار</option>
            <option value="بيع">للبيع</option>
            <option value="إيجار">للإيجار</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          {propertyTypes.map((type) => {
            const Icon = type.icon;
            const isSelected = filters.propertyType === type.value;
            return (
              <button
                key={type.value}
                onClick={() =>
                  updateFilter(
                    "propertyType",
                    isSelected ? "" : (type.value as MapSearchFilters["propertyType"])
                  )
                }
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  isSelected
                    ? "bg-[#002845] text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                <Icon className="w-4 h-4" />
                {type.label}
              </button>
            );
          })}
        </div>

        {/* Four Column Sliders Section */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-gradient-to-b from-blue-50 to-white rounded-lg p-4 border border-blue-100">
          {/* Price Slider with Gradient */}
          <div>
            <PriceSliderWithGradient
              label="السعر (ريال)"
              min={0}
              max={5000000}
              minValue={filters.priceRange?.[0] || 0}
              maxValue={filters.priceRange?.[1] || 5000000}
              onChange={(min, max) => updateFilter("priceRange", [min, max])}
              step={50000}
            />
          </div>

          {/* Area Slider */}
          <div>
            <RangeSliderWithBox
              label="المساحة (متر مربع)"
              min={0}
              max={1000}
              minValue={filters.areaRange?.[0] || 0}
              maxValue={filters.areaRange?.[1] || 1000}
              onChange={(min, max) => updateFilter("areaRange", [min, max])}
              step={10}
              suffix="م²"
            />
          </div>

          {/* Bedrooms Slider */}
          <div>
            <RangeSliderWithBox
              label="عدد الغرف"
              min={0}
              max={10}
              minValue={filters.bedrooms || 0}
              maxValue={filters.bedrooms || 10}
              onChange={(min, max) => updateFilter("bedrooms", Math.ceil(min))}
              step={1}
            />
          </div>

          {/* Bathrooms Slider */}
          <div>
            <RangeSliderWithBox
              label="دورات المياه"
              min={0}
              max={10}
              minValue={filters.bathrooms || 0}
              maxValue={filters.bathrooms || 10}
              onChange={(min, max) => updateFilter("bathrooms", Math.ceil(min))}
              step={1}
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <p className="text-sm text-gray-600">
            {isLoading ? (
              <span className="text-gray-400">جاري البحث...</span>
            ) : (
              <>
                تم العثور على{" "}
                <span className="font-bold text-[#002845]">{resultCount}</span> عقار
              </>
            )}
          </p>
          <Button className="bg-[#002845] hover:bg-[#001830] text-white px-6">
            <Search className="w-4 h-4 ml-2" />
            بحث
          </Button>
        </div>
      </div>
    </div>
  );
}
