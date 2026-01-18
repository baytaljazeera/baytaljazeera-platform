"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { MapPin, Search, Loader2, Target } from "lucide-react";

interface Location {
  lat: number;
  lng: number;
  address?: string;
  city?: string;
  district?: string;
}

interface LeafletLocationPickerProps {
  onLocationSelect: (location: Location) => void;
  initialLocation?: { lat: number; lng: number };
  selectedCity?: string;
  selectedCountry?: string;
  className?: string;
}

const CITY_COORDINATES: { [key: string]: { lat: number; lng: number } } = {
  "الرياض": { lat: 24.7136, lng: 46.6753 },
  "جدة": { lat: 21.4858, lng: 39.1925 },
  "مكة المكرمة": { lat: 21.3891, lng: 39.8579 },
  "المدينة المنورة": { lat: 24.5247, lng: 39.5692 },
  "الدمام": { lat: 26.4207, lng: 50.0888 },
  "الخبر": { lat: 26.2172, lng: 50.1971 },
  "الظهران": { lat: 26.2361, lng: 50.0393 },
  "الطائف": { lat: 21.2854, lng: 40.4150 },
  "تبوك": { lat: 28.3998, lng: 36.5715 },
  "بريدة": { lat: 26.3292, lng: 43.9750 },
  "خميس مشيط": { lat: 18.3093, lng: 42.7338 },
  "أبها": { lat: 18.2164, lng: 42.5053 },
  "دبي": { lat: 25.2048, lng: 55.2708 },
  "أبوظبي": { lat: 24.4539, lng: 54.3773 },
  "الشارقة": { lat: 25.3463, lng: 55.4209 },
  "الكويت": { lat: 29.3759, lng: 47.9774 },
  "الدوحة": { lat: 25.2854, lng: 51.5310 },
  "المنامة": { lat: 26.2285, lng: 50.5860 },
  "مسقط": { lat: 23.5880, lng: 58.3829 },
  "القاهرة": { lat: 30.0444, lng: 31.2357 },
  "الإسكندرية": { lat: 31.2001, lng: 29.9187 },
  "بيروت": { lat: 33.8938, lng: 35.5018 },
  "إسطنبول": { lat: 41.0082, lng: 28.9784 },
  "أنقرة": { lat: 39.9334, lng: 32.8597 },
  "أنطاليا": { lat: 36.8969, lng: 30.7133 },
};

const COUNTRY_COORDINATES: { [key: string]: { lat: number; lng: number; zoom: number } } = {
  "المملكة العربية السعودية": { lat: 24.7136, lng: 46.6753, zoom: 6 },
  "السعودية": { lat: 24.7136, lng: 46.6753, zoom: 6 },
  "الإمارات العربية المتحدة": { lat: 25.2048, lng: 55.2708, zoom: 7 },
  "الإمارات": { lat: 25.2048, lng: 55.2708, zoom: 7 },
  "الكويت": { lat: 29.3759, lng: 47.9774, zoom: 9 },
  "قطر": { lat: 25.2854, lng: 51.5310, zoom: 9 },
  "البحرين": { lat: 26.2285, lng: 50.5860, zoom: 10 },
  "عُمان": { lat: 23.5880, lng: 58.3829, zoom: 6 },
  "عمان": { lat: 23.5880, lng: 58.3829, zoom: 6 },
  "مصر": { lat: 30.0444, lng: 31.2357, zoom: 6 },
  "لبنان": { lat: 33.8938, lng: 35.5018, zoom: 8 },
  "تركيا": { lat: 41.0082, lng: 28.9784, zoom: 6 },
};

function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let timeoutId: NodeJS.Timeout;
  return ((...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
}

export default function LeafletLocationPicker({
  onLocationSelect,
  initialLocation,
  selectedCity,
  selectedCountry,
  className = "",
}: LeafletLocationPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const onLocationSelectRef = useRef(onLocationSelect);
  const isInitializedRef = useRef(false);

  const [isLoading, setIsLoading] = useState(true);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLocating, setIsLocating] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    onLocationSelectRef.current = onLocationSelect;
  }, [onLocationSelect]);

  const defaultCenter = useMemo(() => {
    if (initialLocation) return initialLocation;
    if (selectedCity && CITY_COORDINATES[selectedCity]) {
      return CITY_COORDINATES[selectedCity];
    }
    if (selectedCountry && COUNTRY_COORDINATES[selectedCountry]) {
      return { lat: COUNTRY_COORDINATES[selectedCountry].lat, lng: COUNTRY_COORDINATES[selectedCountry].lng };
    }
    return { lat: 24.7136, lng: 46.6753 };
  }, [initialLocation?.lat, initialLocation?.lng, selectedCity, selectedCountry]);

  const updateLocation = useCallback((lat: number, lng: number, address?: string, city?: string, district?: string) => {
    const location: Location = { lat, lng, address, city, district };
    setCurrentLocation(location);
    onLocationSelectRef.current(location);
  }, []);

  const debouncedReverseGeocode = useMemo(() => 
    debounce(async (lat: number, lng: number, updateFn: typeof updateLocation) => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=ar`,
          { headers: { 'User-Agent': 'BaitAlJazeera/1.0' } }
        );
        
        if (response.ok) {
          const data = await response.json();
          const address = data.address || {};
          const city = address.city || address.town || address.village || address.state || "";
          const district = address.suburb || address.neighbourhood || address.quarter || "";
          const fullAddress = data.display_name || "";
          updateFn(lat, lng, fullAddress, city, district);
        } else {
          updateFn(lat, lng);
        }
      } catch (error) {
        console.error("Geocoding error:", error);
        updateFn(lat, lng);
      }
    }, 500),
    []
  );

  const reverseGeocode = useCallback((lat: number, lng: number) => {
    debouncedReverseGeocode(lat, lng, updateLocation);
  }, [debouncedReverseGeocode, updateLocation]);

  useEffect(() => {
    if (mapInstanceRef.current && markerRef.current && leafletRef.current) {
      if (selectedCity && CITY_COORDINATES[selectedCity]) {
        const cityCoords = CITY_COORDINATES[selectedCity];
        mapInstanceRef.current.setView([cityCoords.lat, cityCoords.lng], 13, { animate: true });
        markerRef.current.setLatLng([cityCoords.lat, cityCoords.lng]);
        reverseGeocode(cityCoords.lat, cityCoords.lng);
      } else if (selectedCountry && COUNTRY_COORDINATES[selectedCountry]) {
        const countryCoords = COUNTRY_COORDINATES[selectedCountry];
        mapInstanceRef.current.setView([countryCoords.lat, countryCoords.lng], countryCoords.zoom, { animate: true });
        markerRef.current.setLatLng([countryCoords.lat, countryCoords.lng]);
      }
    }
  }, [selectedCity, selectedCountry, reverseGeocode]);

  useEffect(() => {
    if (isInitializedRef.current) return;
    
    const initMap = async () => {
      try {
        const L = (await import("leaflet")).default;
        await import("leaflet/dist/leaflet.css");
        
        leafletRef.current = L;

        if (!mapRef.current) return;
        isInitializedRef.current = true;

        const customIcon = L.divIcon({
          className: 'custom-marker',
          html: `<div style="
            width: 32px; 
            height: 32px; 
            background: #D4AF37; 
            border: 3px solid #002845; 
            border-radius: 50%; 
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
          "><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#002845" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        });

        const map = L.map(mapRef.current, {
          center: [defaultCenter.lat, defaultCenter.lng],
          zoom: 14,
          zoomControl: true,
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);

        const marker = L.marker([defaultCenter.lat, defaultCenter.lng], {
          icon: customIcon,
          draggable: true,
        }).addTo(map);

        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          reverseGeocode(pos.lat, pos.lng);
        });

        map.on("click", (e: any) => {
          marker.setLatLng(e.latlng);
          reverseGeocode(e.latlng.lat, e.latlng.lng);
        });

        mapInstanceRef.current = map;
        markerRef.current = marker;

        if (initialLocation) {
          reverseGeocode(initialLocation.lat, initialLocation.lng);
        }

        setIsLoading(false);
      } catch (error) {
        console.error("Error loading Leaflet:", error);
        setIsLoading(false);
      }
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        isInitializedRef.current = false;
      }
    };
  }, [defaultCenter, initialLocation, reverseGeocode]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    try {
      const countryCode = selectedCountry ? 
        (selectedCountry.includes("سعود") ? "sa" : 
         selectedCountry.includes("إمارات") ? "ae" :
         selectedCountry.includes("كويت") ? "kw" :
         selectedCountry.includes("قطر") ? "qa" :
         selectedCountry.includes("بحرين") ? "bh" :
         selectedCountry.includes("عمان") ? "om" :
         selectedCountry.includes("مصر") ? "eg" :
         selectedCountry.includes("لبنان") ? "lb" :
         selectedCountry.includes("تركيا") ? "tr" : "") : "";

      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}${countryCode ? `&countrycodes=${countryCode}` : ''}&limit=5&accept-language=ar`;
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'BaitAlJazeera/1.0' }
      });
      
      if (response.ok) {
        const results = await response.json();
        setSearchResults(results);
        setShowResults(true);
      }
    } catch (error) {
      console.error("Search error:", error);
    }
  };

  const selectSearchResult = (result: any) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    
    if (mapInstanceRef.current && markerRef.current) {
      mapInstanceRef.current.setView([lat, lng], 16, { animate: true });
      markerRef.current.setLatLng([lat, lng]);
      updateLocation(lat, lng, result.display_name);
    }
    
    setShowResults(false);
    setSearchQuery(result.display_name.split(",")[0]);
  };

  const handleGetCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      alert("المتصفح لا يدعم تحديد الموقع");
      return;
    }

    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        if (mapInstanceRef.current && markerRef.current) {
          mapInstanceRef.current.setView([lat, lng], 17, { animate: true });
          markerRef.current.setLatLng([lat, lng]);
          reverseGeocode(lat, lng);
        }

        setIsLocating(false);
      },
      (error) => {
        console.error("Location error:", error);
        alert("تعذر تحديد موقعك الحالي");
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [reverseGeocode]);

  return (
    <div className={`relative ${className}`} dir="rtl">
      <div className="mb-3 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="ابحث عن موقع..."
            className="w-full pr-11 pl-4 py-3 border-2 border-slate-200 rounded-xl focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 outline-none transition text-base"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            onFocus={() => searchResults.length > 0 && setShowResults(true)}
          />
          {showResults && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border-2 border-slate-200 rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
              {searchResults.map((result, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => selectSearchResult(result)}
                  className="w-full px-4 py-3 text-right hover:bg-slate-50 border-b border-slate-100 last:border-0 transition"
                >
                  <p className="text-sm text-slate-800 line-clamp-2">{result.display_name}</p>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleGetCurrentLocation}
          disabled={isLocating}
          className="w-full sm:w-auto px-4 py-3 bg-[#002845] text-white rounded-xl hover:bg-[#003356] transition flex items-center justify-center gap-2 disabled:opacity-50 text-base font-medium"
        >
          {isLocating ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Target className="w-5 h-5" />
          )}
          <span>موقعي الحالي</span>
        </button>
      </div>

      <div className="relative rounded-2xl overflow-hidden border-2 border-slate-200 shadow-lg">
        {isLoading && (
          <div className="absolute inset-0 bg-slate-100 flex items-center justify-center z-10">
            <div className="text-center">
              <Loader2 className="w-10 h-10 animate-spin text-[#D4AF37] mx-auto mb-2" />
              <p className="text-slate-600 text-sm">جاري تحميل الخريطة...</p>
            </div>
          </div>
        )}
        <div ref={mapRef} className="w-full h-[50vh] sm:h-[400px] min-h-[300px]" />
      </div>

      {currentLocation && (
        <div className="mt-3 p-3 sm:p-4 bg-gradient-to-l from-[#002845]/5 to-[#D4AF37]/10 rounded-xl border border-[#D4AF37]/30">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#D4AF37] flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#002845] mb-1">الموقع المحدد</p>
              <p className="text-xs text-slate-600 leading-relaxed break-words line-clamp-2">
                {currentLocation.address || "جاري تحديد العنوان..."}
              </p>
              <div className="flex flex-wrap gap-2 sm:gap-4 mt-2 text-xs text-slate-500">
                <span>العرض: {currentLocation.lat.toFixed(4)}</span>
                <span>الطول: {currentLocation.lng.toFixed(4)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <p className="mt-2 text-xs text-slate-500 text-center">
        اضغط على الخريطة أو اسحب المؤشر لتحديد الموقع
      </p>
    </div>
  );
}
