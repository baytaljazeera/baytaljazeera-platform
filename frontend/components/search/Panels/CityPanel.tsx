"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Filters } from "../types";
import { useSearchMapStore } from "@/lib/stores/searchMapStore";

interface Country {
  id: number;
  code: string;
  name_ar: string;
  name_en: string;
  flag_emoji: string;
  latitude: string;
  longitude: string;
  default_zoom: number;
}

interface City {
  id: number;
  name_ar: string;
  name_en: string;
  region_ar: string;
  is_popular: boolean;
  latitude: string | null;
  longitude: string | null;
  country_code: string;
  flag_emoji: string;
}

interface CityPanelProps {
  filters: Filters;
  onChange: (f: Filters) => void;
  onClose: () => void;
}

export function CityPanel({ filters, onChange, onClose }: CityPanelProps) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [searchResults, setSearchResults] = useState<City[]>([]);
  const [selectedCountryId, setSelectedCountryId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const { flyToCountry, flyToCity, flyToCoords, resetToDefault } = useSearchMapStore();

  useEffect(() => {
    fetch("/api/locations/countries")
      .then(res => res.json())
      .then(data => setCountries(data.countries || []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedCountryId) {
      setIsLoading(true);
      fetch(`/api/locations/cities?country_id=${selectedCountryId}`)
        .then(res => res.json())
        .then(data => {
          setCities(data.cities || []);
          setIsLoading(false);
        })
        .catch(() => setIsLoading(false));
    } else {
      fetch("/api/locations/cities?popular_only=true")
        .then(res => res.json())
        .then(data => setCities(data.cities || []))
        .catch(console.error);
    }
  }, [selectedCountryId]);

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.length < 1) {
      setSearchResults([]);
      return;
    }
    
    const url = selectedCountryId 
      ? `/api/locations/cities/search?q=${encodeURIComponent(query)}&country_id=${selectedCountryId}&limit=20`
      : `/api/locations/cities/search?q=${encodeURIComponent(query)}&limit=20`;
      
    try {
      const res = await fetch(url);
      const data = await res.json();
      setSearchResults(data.cities || []);
    } catch (err) {
      console.error(err);
    }
  }, [selectedCountryId]);

  const handleCountrySelect = (country: Country | null) => {
    if (country) {
      setSelectedCountryId(country.id);
      
      if (country.latitude && country.longitude) {
        const lat = parseFloat(country.latitude);
        const lng = parseFloat(country.longitude);
        const zoom = country.default_zoom || 6;
        flyToCoords(lat, lng, zoom);
      } else {
        flyToCountry(country.code);
      }
      
      onChange({ ...filters, country: country.name_ar, city: undefined });
    } else {
      setSelectedCountryId(null);
      resetToDefault();
      onChange({ ...filters, country: undefined, city: undefined });
    }
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleCitySelect = (city: City | null) => {
    if (city) {
      if (city.latitude && city.longitude) {
        const lat = parseFloat(city.latitude);
        const lng = parseFloat(city.longitude);
        flyToCoords(lat, lng, 12);
      } else {
        flyToCity(city.name_ar);
      }
      onChange({ ...filters, city: city.name_ar });
    } else {
      const selectedCountry = countries.find(c => c.id === selectedCountryId);
      if (selectedCountry?.latitude && selectedCountry?.longitude) {
        flyToCoords(
          parseFloat(selectedCountry.latitude), 
          parseFloat(selectedCountry.longitude), 
          selectedCountry.default_zoom || 6
        );
      }
      onChange({ ...filters, city: undefined });
    }
    onClose();
  };

  const displayCities = searchQuery.length > 0 ? searchResults : cities;
  const popularCities = displayCities.filter(c => c.is_popular);
  const otherCities = displayCities.filter(c => !c.is_popular);

  return (
    <div
      className="absolute top-full right-0 mt-1 z-[9999]"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="panel-animated bg-[#002845] rounded-xl shadow-lg border border-[#D4AF37]/40 p-3 w-[320px] max-h-[400px] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold text-[#D4AF37] flex items-center gap-1">
            <span>🌍</span> اختر الدولة والمدينة
          </h3>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="text-xs text-white/60 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-wrap gap-1 mb-2 justify-center">
          <button
            type="button"
            className={`text-[10px] rounded-full px-2 py-0.5 transition font-semibold flex items-center gap-1 ${
              !selectedCountryId ? "bg-[#D4AF37] text-[#002845]" : "bg-white/20 text-white hover:bg-white/30"
            }`}
            onClick={() => handleCountrySelect(null)}
          >
            🌐 الكل
          </button>
          {countries.map((country) => (
            <button
              key={country.id}
              type="button"
              className={`text-[10px] rounded-full px-2 py-0.5 transition font-semibold flex items-center gap-1 ${
                selectedCountryId === country.id ? "bg-[#D4AF37] text-[#002845]" : "bg-white/20 text-white hover:bg-white/30"
              }`}
              onClick={() => handleCountrySelect(country)}
            >
              {country.flag_emoji} {country.name_ar}
            </button>
          ))}
        </div>

        <div className="relative mb-2">
          <input
            type="text"
            placeholder="ابحث عن مدينة..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/50 focus:outline-none focus:border-[#D4AF37]"
            dir="rtl"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          <button
            type="button"
            className={`w-full text-right text-xs rounded-lg px-3 py-1.5 mb-1 transition font-semibold flex items-center gap-2 ${
              !filters.city ? "bg-[#D4AF37] text-[#002845]" : "bg-white/10 text-white hover:bg-white/20"
            }`}
            onClick={() => handleCitySelect(null)}
          >
            🏠 الكل
          </button>

          {isLoading ? (
            <div className="text-center py-4 text-white/50 text-xs">جاري التحميل...</div>
          ) : displayCities.length === 0 ? (
            <div className="text-center py-4 text-white/50 text-xs">
              {searchQuery ? `لا توجد نتائج لـ "${searchQuery}"` : "اختر دولة لعرض المدن"}
            </div>
          ) : (
            <>
              {popularCities.length > 0 && (
                <div className="mb-2">
                  <div className="text-[10px] text-[#D4AF37] mb-1 font-semibold">المدن الشعبية</div>
                  <div className="flex flex-wrap gap-1">
                    {popularCities.map((city) => (
                      <button
                        key={city.id}
                        type="button"
                        className={`text-[10px] rounded-full px-2 py-0.5 transition font-medium ${
                          filters.city === city.name_ar 
                            ? "bg-[#D4AF37] text-[#002845]" 
                            : "bg-white/20 text-white hover:bg-white/30"
                        }`}
                        onClick={() => handleCitySelect(city)}
                      >
                        {city.name_ar}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {otherCities.length > 0 && (
                <div>
                  <div className="text-[10px] text-white/60 mb-1">جميع المدن</div>
                  <div className="flex flex-wrap gap-1 max-h-[150px] overflow-y-auto">
                    {otherCities.map((city) => (
                      <button
                        key={city.id}
                        type="button"
                        className={`text-[10px] rounded-full px-2 py-0.5 transition font-medium ${
                          filters.city === city.name_ar 
                            ? "bg-[#D4AF37] text-[#002845]" 
                            : "bg-white/15 text-white/80 hover:bg-white/25"
                        }`}
                        onClick={() => handleCitySelect(city)}
                      >
                        {city.name_ar}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
