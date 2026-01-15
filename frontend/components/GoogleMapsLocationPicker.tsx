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

interface GoogleMapsLocationPickerProps {
  onLocationSelect: (location: Location) => void;
  initialLocation?: { lat: number; lng: number };
  selectedCity?: string;
  selectedCountry?: string;
  className?: string;
}

const CITY_COORDINATES: { [key: string]: { lat: number; lng: number } } = {
  // السعودية
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
  "القطيف": { lat: 26.5652, lng: 50.0196 },
  "الجبيل": { lat: 27.0174, lng: 49.6225 },
  "حائل": { lat: 27.5114, lng: 41.7208 },
  "نجران": { lat: 17.4933, lng: 44.1277 },
  "ينبع": { lat: 24.0895, lng: 38.0618 },
  "الأحساء": { lat: 25.3837, lng: 49.5857 },
  "جازان": { lat: 16.8892, lng: 42.5611 },
  "عرعر": { lat: 30.9753, lng: 41.0382 },
  "سكاكا": { lat: 29.9697, lng: 40.2064 },
  "القريات": { lat: 31.3167, lng: 37.3667 },
  "الباحة": { lat: 20.0129, lng: 41.4677 },
  "الخرج": { lat: 24.1554, lng: 47.3344 },
  // الإمارات
  "دبي": { lat: 25.2048, lng: 55.2708 },
  "أبوظبي": { lat: 24.4539, lng: 54.3773 },
  "الشارقة": { lat: 25.3463, lng: 55.4209 },
  "عجمان": { lat: 25.4052, lng: 55.5136 },
  "رأس الخيمة": { lat: 25.7895, lng: 55.9432 },
  "الفجيرة": { lat: 25.1288, lng: 56.3265 },
  "أم القيوين": { lat: 25.5647, lng: 55.5532 },
  "العين": { lat: 24.1917, lng: 55.7606 },
  // الكويت
  "الكويت": { lat: 29.3759, lng: 47.9774 },
  "حولي": { lat: 29.3324, lng: 48.0273 },
  "الأحمدي": { lat: 29.0769, lng: 48.0838 },
  "الفروانية": { lat: 29.2733, lng: 47.9396 },
  "الجهراء": { lat: 29.3426, lng: 47.6581 },
  // قطر
  "الدوحة": { lat: 25.2854, lng: 51.5310 },
  "الوكرة": { lat: 25.1723, lng: 51.6030 },
  "الخور": { lat: 25.6804, lng: 51.5056 },
  "الريان": { lat: 25.2919, lng: 51.4235 },
  // البحرين
  "المنامة": { lat: 26.2285, lng: 50.5860 },
  "المحرق": { lat: 26.2572, lng: 50.6119 },
  "الرفاع": { lat: 26.1300, lng: 50.5550 },
  // عمان
  "مسقط": { lat: 23.5880, lng: 58.3829 },
  "صلالة": { lat: 17.0151, lng: 54.0924 },
  "صحار": { lat: 24.3643, lng: 56.7460 },
  "نزوى": { lat: 22.9333, lng: 57.5333 },
  // مصر
  "القاهرة": { lat: 30.0444, lng: 31.2357 },
  "الإسكندرية": { lat: 31.2001, lng: 29.9187 },
  "الجيزة": { lat: 30.0131, lng: 31.2089 },
  "شرم الشيخ": { lat: 27.9158, lng: 34.3300 },
  "الغردقة": { lat: 27.2579, lng: 33.8116 },
  // لبنان
  "بيروت": { lat: 33.8938, lng: 35.5018 },
  "طرابلس": { lat: 34.4367, lng: 35.8497 },
  "صيدا": { lat: 33.5633, lng: 35.3697 },
  "جونيه": { lat: 33.9808, lng: 35.6177 },
  // تركيا
  "إسطنبول": { lat: 41.0082, lng: 28.9784 },
  "أنقرة": { lat: 39.9334, lng: 32.8597 },
  "أنطاليا": { lat: 36.8969, lng: 30.7133 },
  "بورصة": { lat: 40.1885, lng: 29.0610 },
  "إزمير": { lat: 38.4192, lng: 27.1287 },
  "طرابزون": { lat: 41.0027, lng: 39.7168 },
  "ألانيا": { lat: 36.5432, lng: 31.9903 },
  "بودروم": { lat: 37.0343, lng: 27.4305 },
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
  "سلطنة عمان": { lat: 23.5880, lng: 58.3829, zoom: 6 },
  "مصر": { lat: 30.0444, lng: 31.2357, zoom: 6 },
  "لبنان": { lat: 33.8938, lng: 35.5018, zoom: 8 },
  "تركيا": { lat: 41.0082, lng: 28.9784, zoom: 6 },
};

const COUNTRY_CODES: { [key: string]: string } = {
  "المملكة العربية السعودية": "sa",
  "السعودية": "sa",
  "الإمارات العربية المتحدة": "ae",
  "الإمارات": "ae",
  "الكويت": "kw",
  "قطر": "qa",
  "البحرين": "bh",
  "عُمان": "om",
  "عمان": "om",
  "سلطنة عمان": "om",
  "مصر": "eg",
  "لبنان": "lb",
  "تركيا": "tr",
};

declare global {
  interface Window {
    google: any;
    initGoogleMapsCallback?: () => void;
  }
}

function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let timeoutId: NodeJS.Timeout;
  return ((...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
}

export default function GoogleMapsLocationPicker({
  onLocationSelect,
  initialLocation,
  selectedCity,
  selectedCountry,
  className = "",
}: GoogleMapsLocationPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const autocompleteRef = useRef<any>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const onLocationSelectRef = useRef(onLocationSelect);
  const isInitializedRef = useRef(false);

  const [isLoading, setIsLoading] = useState(true);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    onLocationSelectRef.current = onLocationSelect;
  }, [onLocationSelect]);

  const defaultCenter = useMemo(() => {
    if (initialLocation) return initialLocation;
    // أولاً: البحث عن المدينة المختارة
    if (selectedCity && CITY_COORDINATES[selectedCity]) {
      return CITY_COORDINATES[selectedCity];
    }
    // ثانياً: البحث عن الدولة المختارة
    if (selectedCountry && COUNTRY_COORDINATES[selectedCountry]) {
      return { lat: COUNTRY_COORDINATES[selectedCountry].lat, lng: COUNTRY_COORDINATES[selectedCountry].lng };
    }
    return { lat: 24.7136, lng: 46.6753 }; // الرياض كافتراضي
  }, [initialLocation?.lat, initialLocation?.lng, selectedCity, selectedCountry]);

  // تحديث قيود البحث في Autocomplete عند تغيير الدولة
  useEffect(() => {
    if (autocompleteRef.current && selectedCountry) {
      const countryCode = COUNTRY_CODES[selectedCountry] || "sa";
      try {
        autocompleteRef.current.setComponentRestrictions({ country: countryCode });
      } catch (e) {
        console.log("Could not update autocomplete restrictions");
      }
    }
  }, [selectedCountry]);

  const extractAddressComponents = useCallback((place: any) => {
    const components = place.address_components || [];
    let city = "";
    let district = "";

    components.forEach((comp: any) => {
      if (comp.types.includes("locality") || comp.types.includes("administrative_area_level_1")) {
        city = comp.long_name;
      }
      if (comp.types.includes("sublocality") || comp.types.includes("neighborhood")) {
        district = comp.long_name;
      }
    });

    return { city, district };
  }, []);

  const updateLocation = useCallback((lat: number, lng: number, address?: string, city?: string, district?: string) => {
    const location: Location = { lat, lng, address, city, district };
    setCurrentLocation(location);
    onLocationSelectRef.current(location);
  }, []);

  const debouncedReverseGeocode = useMemo(() => 
    debounce(async (lat: number, lng: number, updateFn: typeof updateLocation) => {
      try {
        // Use Nominatim (OpenStreetMap) for reverse geocoding - free and no API key needed
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=ar`,
          {
            headers: {
              'User-Agent': 'AqarAlJazeera/1.0'
            }
          }
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

  // تحديث الخريطة عند تغيير المدينة أو الدولة - مع حركة سلسة
  useEffect(() => {
    if (mapInstanceRef.current && markerRef.current) {
      if (selectedCity && CITY_COORDINATES[selectedCity]) {
        const cityCoords = CITY_COORDINATES[selectedCity];
        mapInstanceRef.current.panTo(cityCoords);
        setTimeout(() => {
          mapInstanceRef.current?.setZoom(13);
        }, 300);
        markerRef.current.setPosition(cityCoords);
        reverseGeocode(cityCoords.lat, cityCoords.lng);
      } else if (selectedCountry && COUNTRY_COORDINATES[selectedCountry]) {
        const countryCoords = COUNTRY_COORDINATES[selectedCountry];
        const coords = { lat: countryCoords.lat, lng: countryCoords.lng };
        mapInstanceRef.current.panTo(coords);
        setTimeout(() => {
          mapInstanceRef.current?.setZoom(countryCoords.zoom);
        }, 300);
        markerRef.current.setPosition(coords);
      }
    }
  }, [selectedCity, selectedCountry, reverseGeocode]);

  const initializeMap = useCallback(() => {
    if (!mapRef.current || !window.google || isInitializedRef.current) return;
    isInitializedRef.current = true;

    const map = new window.google.maps.Map(mapRef.current, {
      center: defaultCenter,
      zoom: 14,
      mapTypeControl: true,
      mapTypeControlOptions: {
        style: window.google.maps.MapTypeControlStyle.DROPDOWN_MENU,
        position: window.google.maps.ControlPosition.TOP_LEFT,
      },
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: true,
      gestureHandling: "greedy",
      styles: [
        {
          featureType: "poi",
          elementType: "labels",
          stylers: [{ visibility: "off" }],
        },
      ],
    });

    const marker = new window.google.maps.Marker({
      position: defaultCenter,
      map,
      draggable: true,
      animation: window.google.maps.Animation.DROP,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 12,
        fillColor: "#D4AF37",
        fillOpacity: 1,
        strokeColor: "#002845",
        strokeWeight: 3,
      },
    });

    marker.addListener("dragend", () => {
      const position = marker.getPosition();
      if (position) {
        reverseGeocode(position.lat(), position.lng());
      }
    });

    map.addListener("click", (e: any) => {
      const latLng = e.latLng;
      marker.setPosition(latLng);
      reverseGeocode(latLng.lat(), latLng.lng());
    });

    if (searchInputRef.current) {
      const countryCode = selectedCountry ? COUNTRY_CODES[selectedCountry] || "sa" : "sa";
      const autocomplete = new window.google.maps.places.Autocomplete(searchInputRef.current, {
        componentRestrictions: { country: countryCode },
        fields: ["formatted_address", "geometry", "address_components"],
        types: ["geocode", "establishment"],
      });

      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (place.geometry && place.geometry.location) {
          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();

          map.setCenter({ lat, lng });
          map.setZoom(16);
          marker.setPosition({ lat, lng });

          const { city, district } = extractAddressComponents(place);
          updateLocation(lat, lng, place.formatted_address, city, district);
        }
      });

      autocompleteRef.current = autocomplete;
    }

    mapInstanceRef.current = map;
    markerRef.current = marker;

    if (initialLocation) {
      reverseGeocode(initialLocation.lat, initialLocation.lng);
    }

    setIsLoading(false);
  }, [defaultCenter, extractAddressComponents, initialLocation, reverseGeocode, updateLocation, selectedCountry]);

  const loadGoogleMapsScript = useCallback(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      console.error("Google Maps API key not found");
      setIsLoading(false);
      return;
    }

    if (window.google && window.google.maps) {
      initializeMap();
      return;
    }

    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      existingScript.addEventListener("load", initializeMap);
      return;
    }

    window.initGoogleMapsCallback = initializeMap;

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGoogleMapsCallback&language=ar&region=SA`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, [initializeMap]);

  useEffect(() => {
    loadGoogleMapsScript();

    return () => {
      if (window.initGoogleMapsCallback) {
        delete window.initGoogleMapsCallback;
      }
    };
  }, [loadGoogleMapsScript]);

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
          mapInstanceRef.current.setCenter({ lat, lng });
          mapInstanceRef.current.setZoom(17);
          markerRef.current.setPosition({ lat, lng });
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
            ref={searchInputRef}
            type="text"
            placeholder="ابحث عن موقع..."
            className="w-full pr-11 pl-4 py-3 sm:py-3 border-2 border-slate-200 rounded-xl focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 outline-none transition text-base"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
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
