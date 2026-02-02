"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L, { LatLngExpression } from "leaflet";
import {
  BedDouble,
  Bath,
  Square,
  MapPin,
  AlertTriangle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Heart,
  Navigation,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useSearchMapStore } from "@/lib/stores/searchMapStore";
import { getImageUrl } from "@/lib/imageUrl";
import { getCurrencySymbol, getCurrencyCodeByCountry } from "@/lib/stores/currencyStore";

export type MapListing = {
  id: string;
  title: string;
  description?: string;
  city?: string;
  district?: string;
  country?: string;
  currency_code?: string;
  price?: number;
  area?: number;
  bedrooms?: number;
  bathrooms?: number;
  latitude?: number | null;
  longitude?: number | null;
  image_url?: string;
  images?: string[];
  type?: string;
  purpose?: string;
  isFavorite?: boolean;
  deal_status?: string;
};

const DEAL_STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  active: { label: "نشط", bg: "#dcfce7", color: "#15803d" },
  negotiating: { label: "قيد التفاوض", bg: "#fef3c7", color: "#b45309" },
  sold: { label: "تمت الصفقة", bg: "#dbeafe", color: "#1d4ed8" },
  rented: { label: "تم التأجير", bg: "#dbeafe", color: "#1d4ed8" },
  archived: { label: "مؤرشف", bg: "#f3f4f6", color: "#4b5563" },
};

type MapClientProps = {
  listings: MapListing[];
  selectedCity?: string;
  selectedListingId?: string | null;
  onSelectListing?: (id: string) => void;
  onToggleFavorite?: (listingId: string, isFavorite: boolean) => void;
  showFavoriteButton?: boolean;
};

const DEFAULT_CENTER: LatLngExpression = [21.4225, 39.8262]; // مكة المكرمة
const DEFAULT_ZOOM = 10;

const CITY_CENTER: Record<string, LatLngExpression> = {
  "مكة المكرمة": [21.4225, 39.8262],
  "المدينة المنورة": [24.4672, 39.6024],
  "الطائف": [21.2703, 40.4158],
  "الهدا (الطائف)": [21.3547, 40.2497],
  "الشفا (الطائف)": [21.0833, 40.3167],
  جدة: [21.5433, 39.1728],
  ينبع: [24.0895, 38.0618],
  الرياض: [24.7136, 46.6753],
  الدمام: [26.4344, 50.1033],
  الخبر: [26.2794, 50.2083],
  الظهران: [26.2886, 50.114],
  تبوك: [28.3998, 36.5550],
  أبها: [18.2164, 42.5053],
  "السودة (أبها)": [18.2547, 42.3758],
  جازان: [16.8892, 42.5611],
  نجران: [17.4933, 44.1277],
  حائل: [27.5114, 41.7208],
  القصيم: [26.3489, 43.7668],
};

function getPos(listing: MapListing): LatLngExpression | null {
  const lat = typeof listing.latitude === "string" ? parseFloat(listing.latitude) : listing.latitude;
  const lng = typeof listing.longitude === "string" ? parseFloat(listing.longitude) : listing.longitude;
  
  // التحقق من صحة الإحداثيات ونطاقها
  if (typeof lat !== "number" || typeof lng !== "number" || isNaN(lat) || isNaN(lng)) {
    return null;
  }
  
  // التحقق من أن الإحداثيات ضمن النطاق الصحيح
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    console.warn(`Invalid coordinates for listing ${listing.id}:`, { lat, lng });
    return null;
  }
  
  return [lat, lng];
}

function formatPrice(price: number | undefined): string {
  if (!price) return "—";
  if (price >= 1000000) {
    const m = price / 1000000;
    return m % 1 === 0 ? `${m.toFixed(0)}M` : `${m.toFixed(1)}M`;
  }
  if (price >= 1000) {
    const k = price / 1000;
    return k % 1 === 0 ? `${k.toFixed(0)}` : `${k.toFixed(1)}`;
  }
  return price.toString();
}

function createPriceIcon(price: number | undefined, isSelected: boolean): L.DivIcon {
  const priceText = formatPrice(price);
  const bgColor = isSelected ? "#002845" : "#8B0000";
  const textColor = "#FFFFFF";
  const borderColor = isSelected ? "#D4AF37" : "transparent";
  
  const textLen = priceText.length;
  const paddingX = textLen <= 2 ? 6 : textLen <= 3 ? 5 : 4;
  const fontSize = textLen <= 3 ? 11 : 10;
  const iconWidth = Math.max(28, textLen * 7 + paddingX * 2);
  
  return L.divIcon({
    className: "custom-price-marker",
    html: `
      <div style="
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: ${bgColor};
        color: ${textColor};
        padding: 3px ${paddingX}px;
        border-radius: 6px;
        font-weight: 600;
        font-size: ${fontSize}px;
        white-space: nowrap;
        cursor: pointer;
        transition: all 0.15s ease;
        border: ${isSelected ? '2px' : '1px'} solid ${borderColor};
        box-shadow: 0 2px 4px rgba(0,0,0,0.25);
        font-family: system-ui, -apple-system, sans-serif;
        line-height: 1.2;
        ${isSelected ? 'transform: scale(1.1);' : ''}
      ">
        ${priceText}
      </div>
      <div style="
        width: 0;
        height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-top: 5px solid ${bgColor};
        margin: -1px auto 0;
      "></div>
    `,
    iconSize: [iconWidth, 28],
    iconAnchor: [iconWidth / 2, 28],
    popupAnchor: [0, -25],
  });
}

function FitToView({ listings, selectedCity, selectedListingId }: MapClientProps) {
  const map = useMap();
  const lastCityRef = useRef<string | undefined>(undefined);
  const lastVersionRef = useRef<number>(0);
  const mapCenter = useSearchMapStore((s) => s.mapCenter);
  const mapZoom = useSearchMapStore((s) => s.mapZoom);
  const mapVersion = useSearchMapStore((s) => s.mapVersion);

  const coords = useMemo(
    () => listings.map((l) => getPos(l)).filter(Boolean) as LatLngExpression[],
    [listings]
  );

  // استمع لتغييرات الـ store باستخدام mapVersion
  useEffect(() => {
    if (!map || !mapCenter) return;
    
    // التحقق من صحة الإحداثيات قبل استخدامها
    const [lat, lng] = mapCenter;
    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
      console.warn('Invalid mapCenter coordinates:', mapCenter);
      // إعادة تعيين إلى القيمة الافتراضية الآمنة
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }
    
    // التحقق من أن الإحداثيات ضمن النطاق الصحيح
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      console.warn('MapCenter coordinates out of range:', mapCenter);
      // إعادة تعيين إلى القيمة الافتراضية الآمنة
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }
    
    // التحقق من صحة mapZoom
    const safeZoom = (typeof mapZoom === 'number' && !isNaN(mapZoom) && mapZoom >= 1 && mapZoom <= 20) 
      ? mapZoom 
      : DEFAULT_ZOOM;
    
    if (mapVersion > lastVersionRef.current) {
      lastVersionRef.current = mapVersion;
      try {
        map.flyTo([lat, lng], safeZoom, { duration: 0.8 });
      } catch (error) {
        console.error('Error in map.flyTo:', error);
        // Fallback إلى setView في حالة الخطأ
        map.setView([lat, lng], safeZoom);
      }
    }
  }, [map, mapCenter, mapZoom, mapVersion]);

  // fallback للـ selectedCity من CITY_CENTER الثابت
  useEffect(() => {
    if (!map) return;

    if (selectedCity && selectedCity !== lastCityRef.current && CITY_CENTER[selectedCity]) {
      lastCityRef.current = selectedCity;
      const cityCenter = CITY_CENTER[selectedCity];
      // التحقق من صحة إحداثيات المدينة
      if (Array.isArray(cityCenter) && cityCenter.length === 2) {
        const [lat, lng] = cityCenter;
        if (typeof lat === 'number' && typeof lng === 'number' && 
            !isNaN(lat) && !isNaN(lng) &&
            lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          try {
            map.flyTo(cityCenter, 12, { duration: 0.5, easeLinearity: 0.3 });
          } catch (error) {
            console.error('Error flying to city:', error);
            map.setView(cityCenter, 12);
          }
        } else {
          console.warn('Invalid city center coordinates:', cityCenter);
          map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
        }
      }
      return;
    }

    // إذا لم يتم اختيار مدينة، نبقى على مكة المكرمة (الافتراضي)
    if (!selectedCity && !lastCityRef.current && mapVersion === 0) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    }
  }, [map, coords, selectedCity, listings, mapVersion]);

  return null;
}

function LocateControl() {
  const map = useMap();
  const [isLoading, setIsLoading] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const markerRef = useRef<L.Marker | null>(null);

  const toggleLocation = () => {
    if (isActive) {
      if (markerRef.current) {
        map.removeLayer(markerRef.current);
        markerRef.current = null;
      }
      setIsActive(false);
      return;
    }

    if (!navigator.geolocation) {
      alert("المتصفح لا يدعم تحديد الموقع.");
      return;
    }

    setIsLoading(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const center: LatLngExpression = [pos.coords.latitude, pos.coords.longitude];
        map.flyTo(center, 15, { duration: 0.8 });

        if (markerRef.current) {
          map.removeLayer(markerRef.current);
        }

        const userIcon = L.divIcon({
          className: "user-location-marker",
          html: `<div style="
            width: 16px;
            height: 16px;
            background: #3B82F6;
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 8px rgba(59,130,246,0.5);
            animation: pulse 2s infinite;
          "></div>
          <style>
            @keyframes pulse {
              0% { box-shadow: 0 0 0 0 rgba(59,130,246,0.4); }
              70% { box-shadow: 0 0 0 10px rgba(59,130,246,0); }
              100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); }
            }
          </style>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });

        markerRef.current = new L.Marker(center, { icon: userIcon }).addTo(map);

        setIsLoading(false);
        setIsActive(true);
      },
      () => {
        alert("تعذر تحديد موقعك.");
        setIsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  return (
    <button
      type="button"
      onClick={toggleLocation}
      className={`absolute z-[1000] bottom-4 left-4 w-10 h-10 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center border ${
        isActive 
          ? 'bg-[#3B82F6] border-[#3B82F6]' 
          : 'bg-white border-gray-200 hover:bg-gray-50'
      }`}
      title={isActive ? "إخفاء موقعي" : "عرض موقعي"}
    >
      {isLoading ? (
        <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isActive ? "white" : "#374151"} strokeWidth="2">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isActive ? "white" : "#374151"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="3 11 22 2 13 21 11 13 3 11"/>
        </svg>
      )}
    </button>
  );
}

function ImageCarousel({ images, title }: { images: string[]; title: string }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };
  
  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  if (images.length === 0) return null;

  return (
    <div className="relative w-full h-40 bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden">
      <img
        src={images[currentIndex]}
        alt={title}
        className="w-full h-full object-cover"
        loading="lazy"
        onError={(e) => { 
          (e.target as HTMLImageElement).src = "https://via.placeholder.com/300x200?text=صورة+العقار";
        }}
      />
      
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
      
      {images.length > 1 && (
        <>
          <button
            onClick={handlePrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 bg-white/95 rounded-full flex items-center justify-center shadow-lg hover:bg-white transition"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-slate-700" />
          </button>
          <button
            onClick={handleNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 bg-white/95 rounded-full flex items-center justify-center shadow-lg hover:bg-white transition"
          >
            <ChevronRight className="w-3.5 h-3.5 text-slate-700" />
          </button>
          
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 bg-black/30 px-2 py-1 rounded-full">
            {images.map((_, idx) => (
              <div
                key={idx}
                className={`w-1.5 h-1.5 rounded-full transition ${
                  idx === currentIndex ? "bg-white" : "bg-white/50"
                }`}
              />
            ))}
          </div>

          {/* عداد الصور */}
          <div className="absolute top-2 right-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full">
            {currentIndex + 1}/{images.length}
          </div>
        </>
      )}
    </div>
  );
}

function ListingPopupCard({ 
  listing, 
  onToggleFavorite,
  showFavoriteButton = true 
}: { 
  listing: MapListing;
  onToggleFavorite?: (listingId: string, isFavorite: boolean) => void;
  showFavoriteButton?: boolean;
}) {
  const [imgIndex, setImgIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [lastTap, setLastTap] = useState<number>(0);
  const [imgError, setImgError] = useState(false);
  const [isFavorite, setIsFavorite] = useState(listing.isFavorite || false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [modalImgIndex, setModalImgIndex] = useState(0);
  const favoriteButtonRef = useRef<HTMLButtonElement>(null);
  
  // Update isFavorite when listing.isFavorite changes
  useEffect(() => {
    setIsFavorite(listing.isFavorite || false);
  }, [listing.isFavorite]);
  
  // دالة لتحديث المفضلة - نستخدمها في جميع الأحداث
  const handleToggleFavorite = useCallback((e?: React.MouseEvent | React.TouchEvent) => {
    if (e) {
      // منع الانتشار إلى Leaflet فقط - لا نمنع السلوك الافتراضي
      e.stopPropagation();
      if (e.nativeEvent) {
        e.nativeEvent.stopImmediatePropagation();
        e.nativeEvent.stopPropagation();
      }
    }
    
    // تحديث الحالة فوراً - بدون أي تأخير أو popup
    const newFavoriteState = !isFavorite;
    setIsFavorite(newFavoriteState);
    listing.isFavorite = newFavoriteState;
    
    // إرسال الطلب في الخلفية
    if (onToggleFavorite) {
      onToggleFavorite(listing.id, newFavoriteState).catch((error) => {
        console.error("Error toggling favorite:", error);
        // Rollback on error
        setIsFavorite(!newFavoriteState);
        listing.isFavorite = !newFavoriteState;
      });
    }
    
    return false;
  }, [isFavorite, listing, onToggleFavorite]);

  const allImages = (
    listing.images && listing.images.length > 0
      ? listing.images
      : listing.image_url
      ? [listing.image_url]
      : []
  ).map(img => getImageUrl(img));

  const hasImages = allImages.length > 0;

  const locationLine = listing.city
    ? listing.district
      ? `${listing.city}، ${listing.district}`
      : listing.city
    : "";

  const formatPriceWithCurrency = (price: number | string | undefined | null, country?: string, currencyCode?: string) => {
    let numPrice: number | undefined;

    if (typeof price === "string") {
      const parsed = parseFloat(price);
      if (!Number.isNaN(parsed)) numPrice = parsed;
    } else if (typeof price === "number") {
      numPrice = price;
    }

    // استخدم currency_code من الإعلان إذا متوفر، وإلا احسب من الدولة
    const code = currencyCode || getCurrencyCodeByCountry(country);
    const symbol = getCurrencySymbol(code);

    if (numPrice && numPrice > 0) {
      if (numPrice >= 1_000_000) {
        return `${(numPrice / 1_000_000).toFixed(1)} مليون ${symbol}`;
      }
      return `${numPrice.toLocaleString("ar-SA")} ${symbol}`;
    }
    return "السعر غير محدد";
  };

  const priceText = formatPriceWithCurrency(listing.price, listing.country, listing.currency_code);

  const goPrev = (e?: React.MouseEvent | React.TouchEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (e && 'nativeEvent' in e) {
      (e as React.MouseEvent).nativeEvent.stopImmediatePropagation();
    }
    if (!hasImages) return;
    setImgIndex((prev) => (prev === 0 ? allImages.length - 1 : prev - 1));
    setLastTap(0); // إلغاء double-tap detection
  };

  const goNext = (e?: React.MouseEvent | React.TouchEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (e && 'nativeEvent' in e) {
      (e as React.MouseEvent).nativeEvent.stopImmediatePropagation();
    }
    if (!hasImages) return;
    setImgIndex((prev) => (prev === allImages.length - 1 ? 0 : prev + 1));
    setLastTap(0); // إلغاء double-tap detection
  };

  const onTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    if (distance > 50) goNext();
    if (distance < -50) goPrev();
    setTouchEnd(null);
    setTouchStart(null);
  };

  const stopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
  };

  // Double tap/click لفتح overlay التفاصيل (مثل Zillow) - بدون تغيير الشاشة
  const handleImageDoubleTap = () => {
    setModalImgIndex(imgIndex);
    setShowDetailModal(true);
  };

  const handleImageClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    const now = Date.now();
    if (now - lastTap < 300) {
      // Double tap detected
      handleImageDoubleTap();
    }
    setLastTap(now);
  };

  const showNavButtons = hasImages && allImages.length > 1;

  const popupContentRef = useRef<HTMLDivElement>(null);
  
  // استخدام Leaflet's disableClickPropagation لمنع Leaflet من اعتراض الأحداث
  useEffect(() => {
    if (popupContentRef.current) {
      L.DomEvent.disableClickPropagation(popupContentRef.current);
      L.DomEvent.disableScrollPropagation(popupContentRef.current);
    }
  }, []);

  return (
    <div
      ref={popupContentRef}
      dir="rtl"
      onMouseDown={(e) => {
        // السماح للأحداث بالوصول إلى زر المفضلة - لا نمنعها
        const target = e.target as HTMLElement;
        if (target.closest('.popup-favorite-btn')) {
          // لا نفعل شيء - نترك الأحداث تصل إلى الزر
          return;
        }
        // منع الانتشار فقط للأحداث الأخرى
        stopPropagation(e);
      }}
      onClick={(e) => {
        // السماح للأحداث بالوصول إلى زر المفضلة - لا نمنعها
        const target = e.target as HTMLElement;
        if (target.closest('.popup-favorite-btn')) {
          // لا نفعل شيء - نترك الأحداث تصل إلى الزر
          return;
        }
        // منع الانتشار فقط للأحداث الأخرى
        stopPropagation(e);
      }}
      onDoubleClick={stopPropagation}
      style={{
        width: 300,
        margin: "-8px -12px -10px -12px",
        borderRadius: 16,
        backgroundColor: "#ffffff",
        boxShadow: "0 10px 25px rgba(0,0,0,0.18)",
        border: "2px solid #D4AF37",
        cursor: "default",
        position: "relative",
      }}
    >
      {/* منطقة الصورة / السلايدر - wrapper خارجي للأزرار - double click/tap للتفاصيل */}
      <div 
        style={{ position: "relative", width: "100%", height: 180, touchAction: "pan-y", cursor: "pointer" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={(e) => {
          onTouchEnd(e);
          handleImageClick(e);
        }}
        onDoubleClick={handleImageDoubleTap}
      >
        {/* الصورة */}
        <div style={{ 
          position: "absolute", 
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "#1a1a1a", 
          borderRadius: "14px 14px 0 0", 
          overflow: "hidden" 
        }}>
          {hasImages && !imgError ? (
            <img
              key={`${listing.id}-img-${imgIndex}`}
              src={allImages[imgIndex]}
              alt={listing.title || "صورة العقار"}
              loading="eager"
              draggable={false}
              onError={() => setImgError(true)}
              style={{ 
                width: "100%", 
                height: "100%", 
                objectFit: "cover",
                userSelect: "none",
                pointerEvents: "none",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                color: "#9ca3af",
                background: "linear-gradient(135deg, #01273C 0%, #0B6B4C 100%)",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 32 }}>🏠</span>
              <span>{imgError ? "الصورة غير متاحة" : "لا توجد صور"}</span>
            </div>
          )}
        </div>

        {/* شريط علوي: badges يسار + قلب يمين */}
        <div style={{ 
          position: "absolute", 
          top: 0, 
          left: 0, 
          right: 0, 
          padding: "8px 10px",
          background: "linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          borderRadius: "14px 14px 0 0",
          zIndex: 20,
        }}>
          {/* زر القلب - أعلى يمين */}
          {showFavoriteButton && (
            <button
              ref={favoriteButtonRef}
              type="button"
              className="popup-favorite-btn"
              onMouseDown={(e) => {
                // منع الانتشار إلى Leaflet فقط
                e.stopPropagation();
                if (e.nativeEvent) {
                  e.nativeEvent.stopImmediatePropagation();
                  e.nativeEvent.stopPropagation();
                }
                // تحديث الحالة فوراً بدون preventDefault
                const newFavoriteState = !isFavorite;
                setIsFavorite(newFavoriteState);
                listing.isFavorite = newFavoriteState;
                // إرسال الطلب في الخلفية
                if (onToggleFavorite) {
                  onToggleFavorite(listing.id, newFavoriteState).catch((error) => {
                    console.error("Error toggling favorite:", error);
                    setIsFavorite(!newFavoriteState);
                    listing.isFavorite = !newFavoriteState;
                  });
                }
                return false;
              }}
              onClick={(e) => {
                // منع الانتشار إلى Leaflet فقط
                e.stopPropagation();
                if (e.nativeEvent) {
                  e.nativeEvent.stopImmediatePropagation();
                  e.nativeEvent.stopPropagation();
                }
                // تحديث الحالة فوراً بدون preventDefault
                const newFavoriteState = !isFavorite;
                setIsFavorite(newFavoriteState);
                listing.isFavorite = newFavoriteState;
                // إرسال الطلب في الخلفية
                if (onToggleFavorite) {
                  onToggleFavorite(listing.id, newFavoriteState).catch((error) => {
                    console.error("Error toggling favorite:", error);
                    setIsFavorite(!newFavoriteState);
                    listing.isFavorite = !newFavoriteState;
                  });
                }
                return false;
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (e.nativeEvent) {
                  e.nativeEvent.stopImmediatePropagation();
                  e.nativeEvent.stopPropagation();
                }
                handleToggleFavorite(e);
                return false;
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
                e.preventDefault();
                e.nativeEvent.stopImmediatePropagation();
                if (e.cancelable) {
                  e.cancelBubble = true;
                }
                return false;
              }}
              style={{
                width: 36,
                height: 36,
                minWidth: 36,
                minHeight: 36,
                borderRadius: "50%",
                border: "2px solid #fff",
                backgroundColor: isFavorite ? "#ef4444" : "rgba(107, 114, 128, 0.7)", // رمادي افتراضي
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
                zIndex: 10001,
                position: "relative",
                transition: "all 0.2s ease",
                boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
              }}
              onMouseEnter={(e) => {
                if (!isFavorite) {
                  e.currentTarget.style.backgroundColor = "rgba(107, 114, 128, 0.9)"; // رمادي أغمق عند hover
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = isFavorite ? "#ef4444" : "rgba(107, 114, 128, 0.7)"; // رمادي افتراضي
              }}
              title={isFavorite ? "إزالة من المفضلة" : "إضافة للمفضلة"}
            >
              <Heart 
                size={18} 
                fill={isFavorite ? "#fff" : "none"}
                color={isFavorite ? "#fff" : "#9ca3af"} // رمادي للقلب غير المحفوظ
                style={{
                  pointerEvents: "none",
                }}
              />
            </button>
          )}
          {!showFavoriteButton && <div />}
          
          {/* badges */}
          <div style={{ display: "flex", gap: 6 }}>
            {(() => {
              const status = listing.deal_status || "active";
              const config = DEAL_STATUS_CONFIG[status] || DEAL_STATUS_CONFIG.active;
              return (
                <span style={{
                  backgroundColor: config.bg,
                  color: config.color,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: 20,
                }}>
                  {config.label}
                </span>
              );
            })()}
            {listing.purpose && (
              <span style={{
                backgroundColor: listing.purpose === "بيع" || listing.purpose === "للبيع" ? "#dc2626" : "#F5DEB3",
                color: listing.purpose === "بيع" || listing.purpose === "للبيع" ? "#fff" : "#8B4513",
                fontSize: 11,
                fontWeight: 700,
                padding: "4px 10px",
                borderRadius: 20,
                border: listing.purpose === "بيع" || listing.purpose === "للبيع" ? "none" : "1px solid #D4AF37",
              }}>
                {listing.purpose === "بيع" || listing.purpose === "للبيع" ? "بيع" : "إيجار"}
              </span>
            )}
          </div>
        </div>

        {/* أزرار التنقل - خارج الـ overflow container */}
        {showNavButtons && (
          <>
            <button
              type="button"
              onClick={goPrev}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              aria-label="الصورة السابقة"
              className="popup-nav-btn"
              style={{
                position: "absolute",
                top: 90,
                right: 4,
                width: 20,
                height: 20,
                borderRadius: "50%",
                border: "1.5px solid #D4AF37",
                backgroundColor: "#01273C",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                zIndex: 9999,
                boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
              }}
            >
              <ChevronRight size={12} color="#D4AF37" strokeWidth={2} />
            </button>

            <button
              type="button"
              onClick={goNext}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              aria-label="الصورة التالية"
              className="popup-nav-btn"
              style={{
                position: "absolute",
                top: 90,
                left: 4,
                width: 20,
                height: 20,
                borderRadius: "50%",
                border: "1.5px solid #D4AF37",
                backgroundColor: "#01273C",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                zIndex: 9999,
                boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
              }}
            >
              <ChevronLeft size={12} color="#D4AF37" strokeWidth={2} />
            </button>
          </>
        )}

        {/* نقاط التنقل - أسفل الصورة */}
        {showNavButtons && (
          <div 
            className="popup-dots-container"
            style={{
              position: "absolute",
              bottom: 10,
              left: 0,
              right: 0,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 5,
              zIndex: 100,
            }}
          >
            {allImages.map((_img, i) => (
              <button
                key={i}
                type="button"
                className="popup-dot-btn"
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); setImgIndex(i); }}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                style={{
                  width: i === imgIndex ? 18 : 8,
                  height: 8,
                  borderRadius: 8,
                  border: "none",
                  backgroundColor: i === imgIndex ? "#D4AF37" : "rgba(255,255,255,0.6)",
                  cursor: "pointer",
                  padding: 0,
                  transition: "all 0.2s",
                  boxShadow: i === imgIndex ? "0 0 4px rgba(212,175,55,0.5)" : "none",
                }}
              />
            ))}
            {/* عداد الصور */}
            <span style={{
              marginRight: 8,
              fontSize: 10,
              color: "#fff",
              backgroundColor: "rgba(0,0,0,0.5)",
              padding: "2px 6px",
              borderRadius: 10,
            }}>
              {imgIndex + 1}/{allImages.length}
            </span>
          </div>
        )}
        
      </div>

      {/* الجسم - معلومات العقار */}
      <div style={{ padding: "10px 12px 12px 12px", direction: "rtl" }}>
        {/* السعر */}
        <div
          style={{
            fontSize: 14,
            fontWeight: 800,
            color: "#002845",
            marginBottom: 2,
          }}
        >
          {priceText}
        </div>
        {/* سعر الدولار أسفل السعر الأساسي */}
        {(() => {
          let numPrice: number | undefined;
          if (typeof listing.price === "string") {
            const parsed = parseFloat(listing.price);
            if (!Number.isNaN(parsed)) numPrice = parsed;
          } else if (typeof listing.price === "number") {
            numPrice = listing.price;
          }
          if (numPrice && numPrice > 0) {
            const usdPrice = numPrice / 3.75; // سعر الدولار = 3.75 ريال
            return (
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: "#6b7280",
                  marginBottom: 4,
                }}
              >
                ≈ ${usdPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })} USD
              </div>
            );
          }
          return null;
        })()}

        {/* المواصفات: غرف – حمامات – مساحة */}
        <div
          style={{
            display: "flex",
            gap: 8,
            fontSize: 11,
            color: "#4b5563",
            marginBottom: 4,
            direction: "rtl",
          }}
        >
          {listing.bedrooms != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <BedDouble size={11} />
              <span>{listing.bedrooms} غرف</span>
            </div>
          )}
          {listing.bathrooms != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <Bath size={11} />
              <span>{listing.bathrooms} حمام</span>
            </div>
          )}
          {listing.area != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <Square size={11} />
              <span>{listing.area} م²</span>
            </div>
          )}
        </div>

        {/* العنوان */}
        {listing.title && (
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#111827",
              marginBottom: 2,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical" as const,
              overflow: "hidden",
              direction: "rtl",
              textAlign: "right",
            }}
          >
            {listing.title}
          </div>
        )}

        {/* الموقع */}
        {locationLine && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              color: "#6b7280",
              direction: "rtl",
            }}
          >
            <MapPin size={12} />
            <span>{locationLine}</span>
          </div>
        )}

        {/* تلميح النقر المزدوج */}
        <div
          style={{
            marginTop: 6,
            fontSize: 9,
            color: "#9ca3af",
            textAlign: "center",
          }}
        >
          انقر مرتين على الصورة لمعاينة التفاصيل
        </div>
      </div>

      {/* Overlay تفاصيل العقار (مثل Zillow) - يفتح عند double-click دون تغيير الشاشة */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal} dir="rtl">
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0" showCloseButton>
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="text-xl font-bold text-[#002845] text-right">
              {listing.title}
            </DialogTitle>
            <DialogDescription className="text-right pt-1">
              {locationLine && (
                <span className="flex items-center gap-2 text-slate-600">
                  <MapPin size={14} />
                  {locationLine}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* معرض الصور */}
          <div className="relative w-full aspect-[16/10] bg-slate-100 rounded-t-lg overflow-hidden">
            {hasImages && allImages.length > 0 ? (
              <>
                <img
                  src={allImages[modalImgIndex]}
                  alt={listing.title || "صورة العقار"}
                  className="w-full h-full object-cover"
                />
                {allImages.length > 1 && (
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {allImages.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setModalImgIndex(i)}
                        className={`w-2 h-2 rounded-full transition-all ${
                          i === modalImgIndex ? "bg-[#D4AF37] w-6" : "bg-white/70"
                        }`}
                        aria-label={`صورة ${i + 1}`}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                <span className="text-4xl">🏠</span>
                <span>لا توجد صور</span>
              </div>
            )}
          </div>

          {/* التفاصيل */}
          <div className="p-4 space-y-3">
            <div className="text-2xl font-black text-[#002845]">{priceText}</div>
            {listing.price && listing.price > 0 && (
              <div className="text-sm text-slate-500">
                ≈ ${(listing.price / 3.75).toLocaleString("en-US", { maximumFractionDigits: 0 })} USD
              </div>
            )}
            <div className="flex gap-4 text-sm text-slate-600">
              {listing.bedrooms != null && (
                <span className="flex items-center gap-1">
                  <BedDouble size={16} /> {listing.bedrooms} غرف
                </span>
              )}
              {listing.bathrooms != null && (
                <span className="flex items-center gap-1">
                  <Bath size={16} /> {listing.bathrooms} حمام
                </span>
              )}
              {listing.area != null && (
                <span className="flex items-center gap-1">
                  <Square size={16} /> {listing.area} م²
                </span>
              )}
            </div>
            {listing.description && (
              <p className="text-sm text-slate-600 line-clamp-3 text-right">
                {listing.description}
              </p>
            )}
            <Link
              href={`/listing/${listing.id}`}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white font-bold hover:opacity-90 transition"
            >
              <ExternalLink size={18} />
              عرض التفاصيل الكاملة
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ListingMarker({
  listing,
  onSelectListing,
  onToggleFavorite,
  showFavoriteButton = true,
}: {
  listing: MapListing;
  onSelectListing?: (id: string) => void;
  onToggleFavorite?: (listingId: string, isFavorite: boolean) => void;
  showFavoriteButton?: boolean;
}) {
  const pos = getPos(listing);
  const markerRef = useRef<L.Marker | null>(null);

  const icon = useMemo(() => createPriceIcon(listing.price, false), [listing.price]);

  if (!pos) return null;

  return (
    <Marker
      position={pos}
      ref={markerRef}
      icon={icon}
      eventHandlers={{ 
        click: (e) => {
          // منع الانتقال إذا كان النقر على زر المفضلة
          const target = e.originalEvent.target as HTMLElement;
          if (target.closest('.popup-favorite-btn')) {
            e.originalEvent.stopPropagation();
            e.originalEvent.preventDefault();
            e.originalEvent.stopImmediatePropagation();
            return;
          }
          onSelectListing?.(listing.id);
        }
      }}
    >
      <Popup 
        className="clean-popup" 
        maxWidth={280} 
        minWidth={260}
        eventHandlers={{
          click: (e) => {
            // منع الانتقال عند النقر على زر المفضلة
            const target = e.originalEvent.target as HTMLElement;
            if (target.closest('.popup-favorite-btn')) {
              e.originalEvent.stopPropagation();
              e.originalEvent.preventDefault();
              e.originalEvent.stopImmediatePropagation();
              return false;
            }
          },
          mousedown: (e) => {
            // منع الانتقال عند mousedown على زر المفضلة
            const target = e.originalEvent.target as HTMLElement;
            if (target.closest('.popup-favorite-btn')) {
              e.originalEvent.stopPropagation();
              e.originalEvent.preventDefault();
              e.originalEvent.stopImmediatePropagation();
              return false;
            }
          }
        }}
      >
        <ListingPopupCard 
          listing={listing} 
          onToggleFavorite={onToggleFavorite}
          showFavoriteButton={showFavoriteButton}
        />
      </Popup>
    </Marker>
  );
}

function UserLocationMarker({ userLocation, visible }: { userLocation: [number, number] | null; visible: boolean }) {
  const userIcon = L.divIcon({
    className: 'user-location-marker',
    html: `<div style="
      width: 20px;
      height: 20px;
      background: #3B82F6;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 0 0 8px rgba(59,130,246,0.3), 0 2px 8px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

  if (!userLocation) return null;
  
  return (
    <Marker position={userLocation} icon={userIcon} opacity={visible ? 1 : 0}>
      <Popup>
        <div className="text-center text-sm font-medium text-blue-600" dir="rtl">
          📍 موقعك الحالي
        </div>
      </Popup>
    </Marker>
  );
}

export default function MapClient({
  listings,
  selectedCity,
  selectedListingId,
  onSelectListing,
  onToggleFavorite,
  showFavoriteButton = true,
}: MapClientProps) {
  const [isMounted, setIsMounted] = useState(false);
  const mapId = useRef(`map-${Math.random().toString(36).substr(2, 9)}`);
  const mapRef = useRef<L.Map | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationEnabled, setLocationEnabled] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleLocationToggle = () => {
    if (locationEnabled) {
      setLocationEnabled(false);
      return;
    }
    
    setIsLocating(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation([latitude, longitude]);
          setLocationEnabled(true);
          setIsLocating(false);
          if (mapRef.current) {
            mapRef.current.stop();
            mapRef.current.flyTo([latitude, longitude], 14, { animate: true, duration: 0.8 });
          }
        },
        (error) => {
          console.error("Location error:", error);
          setIsLocating(false);
          alert("تعذر الحصول على موقعك. تأكد من تفعيل خدمات الموقع.");
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    } else {
      setIsLocating(false);
      alert("المتصفح لا يدعم تحديد الموقع");
    }
  };

  const validListings = useMemo(() => 
    listings.filter((l) => {
      const lat = typeof l.latitude === "string" ? parseFloat(l.latitude) : l.latitude;
      const lng = typeof l.longitude === "string" ? parseFloat(l.longitude) : l.longitude;
      
      // التحقق من صحة الإحداثيات ونطاقها
      if (typeof lat !== "number" || typeof lng !== "number" || isNaN(lat) || isNaN(lng)) {
        return false;
      }
      
      // التحقق من أن الإحداثيات ضمن النطاق الصحيح
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        console.warn(`Invalid coordinates for listing ${l.id}:`, { lat, lng });
        return false;
      }
      
      return true;
    }),
    [listings]
  );

  if (!isMounted) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 animate-pulse flex items-center justify-center rounded-3xl">
        <div className="text-slate-400 text-sm">جاري تحميل الخريطة...</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative" style={{ zIndex: 1 }}>
      {/* Location Toggle Button */}
      <button
        onClick={handleLocationToggle}
        disabled={isLocating}
        className={`absolute bottom-4 left-4 z-[1000] w-11 h-11 rounded-full shadow-lg flex items-center justify-center transition-colors duration-200 border-2 ${
          locationEnabled 
            ? 'bg-blue-500 text-white border-blue-400' 
            : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-200'
        } ${isLocating ? 'animate-pulse' : ''}`}
        title={locationEnabled ? "إيقاف تتبع الموقع" : "عرض موقعي"}
      >
        <Navigation className={`w-5 h-5 ${locationEnabled ? 'fill-current rotate-45' : ''}`} />
      </button>

      <MapContainer
        key={mapId.current}
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        scrollWheelZoom={true}
        zoomControl={false}
        className="w-full h-full rounded-3xl"
        style={{ zIndex: 1 }}
        ref={mapRef}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />

        <FitToView
          listings={validListings}
          selectedCity={selectedCity}
          selectedListingId={selectedListingId}
        />

        {validListings.map((l) => (
          <ListingMarker
            key={l.id}
            listing={l}
            onSelectListing={onSelectListing}
            onToggleFavorite={onToggleFavorite}
            showFavoriteButton={showFavoriteButton}
          />
        ))}
        
        {/* User Location Marker - always render but control visibility */}
        {userLocation && <UserLocationMarker userLocation={userLocation} visible={locationEnabled} />}
      </MapContainer>
    </div>
  );
}
