"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useRef, memo } from "react";
import { MapPin, Navigation } from "lucide-react";
import { useSearchMapStore } from "@/lib/stores/searchMapStore";

export type PropertyMarker = {
  id: string;
  title: string;
  city: string;
  district?: string;
  price: number;
  type: string;
  purpose: string;
  bedrooms?: number;
  bathrooms?: number;
  area?: number;
  lat: number;
  lng: number;
  image_url?: string;
  images?: string[];
  deal_status?: string;
};

type SyncedMapPaneProps = {
  markers: PropertyMarker[];
  onMarkerClick?: (marker: PropertyMarker) => void;
};

type MapControllerProps = {
  useMapHook: () => any;
  mapCenter: [number, number];
  mapZoom: number;
  mapVersion: number;
  suspended?: boolean;
};

const DEAL_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: "نشط", color: "text-green-700", bg: "bg-green-100" },
  negotiating: { label: "قيد التفاوض", color: "text-amber-700", bg: "bg-amber-100" },
  sold: { label: "تمت الصفقة", color: "text-blue-700", bg: "bg-blue-100" },
  rented: { label: "تم التأجير", color: "text-blue-700", bg: "bg-blue-100" },
  archived: { label: "مؤرشف", color: "text-gray-700", bg: "bg-gray-100" },
};

function PopupContent({ marker }: { marker: PropertyMarker }) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const allImages = marker.images?.length ? marker.images : (marker.image_url ? [marker.image_url] : []);
  const hasMultipleImages = allImages.length > 1;
  const statusConfig = DEAL_STATUS_CONFIG[marker.deal_status || "active"] || DEAL_STATUS_CONFIG.active;

  const nextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev + 1) % allImages.length);
  };

  const prevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev - 1 + allImages.length) % allImages.length);
  };

  return (
    <div className="text-right min-w-[260px] max-w-[300px]" dir="rtl">
      {allImages.length > 0 && (
        <div className="relative w-full aspect-[4/3] mb-2 rounded-lg overflow-hidden bg-gray-100">
          <img 
            src={allImages[currentImageIndex]} 
            alt={marker.title}
            className="w-full h-full object-cover object-center"
            loading="lazy"
          />
          {hasMultipleImages && (
            <>
              <button
                onClick={prevImage}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition text-sm"
              >
                ›
              </button>
              <button
                onClick={nextImage}
                className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition text-sm"
              >
                ‹
              </button>
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1">
                {allImages.map((_, idx) => (
                  <span
                    key={idx}
                    className={`w-1.5 h-1.5 rounded-full ${idx === currentImageIndex ? "bg-white" : "bg-white/50"}`}
                  />
                ))}
              </div>
            </>
          )}
          <span className={`absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full ${statusConfig.bg} ${statusConfig.color} font-medium`}>
            {statusConfig.label}
          </span>
        </div>
      )}
      {allImages.length === 0 && (
        <div className="flex justify-end mb-2">
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusConfig.bg} ${statusConfig.color} font-medium`}>
            {statusConfig.label}
          </span>
        </div>
      )}
      <h3 className="font-bold text-[#002845] text-sm mb-1 line-clamp-1">
        {marker.title}
      </h3>
      <p className="text-xs text-gray-500 mb-1">
        {marker.city}{marker.district ? ` - ${marker.district}` : ""}
      </p>
      <p className="text-base font-bold text-[#d4af37] mb-1">
        {marker.price.toLocaleString("en-US")} ريال
      </p>
      {/* سعر الدولار أسفل السعر الأساسي */}
      <p className="text-xs text-gray-500 mb-2">
        ≈ ${(marker.price / 3.75).toLocaleString("en-US", { maximumFractionDigits: 0 })} USD
      </p>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        {marker.bedrooms && <span>{marker.bedrooms} غرف</span>}
        {marker.bathrooms && <span>{marker.bathrooms} حمام</span>}
        {marker.area && <span>{marker.area} م²</span>}
      </div>
      <div className="flex gap-1.5 mt-2">
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
          marker.purpose === "بيع" 
            ? "bg-green-100 text-green-700" 
            : "bg-blue-100 text-blue-700"
        }`}>
          {marker.purpose === "بيع" ? "للبيع" : "للإيجار"}
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
          {marker.type}
        </span>
      </div>
    </div>
  );
}

const MapController = memo(function MapController({ useMapHook, mapCenter, mapZoom, mapVersion, suspended = false }: MapControllerProps) {
  const map = useMapHook();
  const lastVersionRef = useRef<number>(0);
  
  useEffect(() => {
    if (!map || suspended) return;
    
    try {
      const lat = parseFloat(String(mapCenter?.[0] ?? 24.7136));
      const lng = parseFloat(String(mapCenter?.[1] ?? 46.6753));
      const zoom = Math.floor(parseFloat(String(mapZoom ?? 10)));
      
      if (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(zoom) &&
          lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && zoom >= 1 && zoom <= 20) {
        if (mapVersion > lastVersionRef.current) {
          lastVersionRef.current = mapVersion;
          map.setView([lat, lng], zoom, { animate: true, duration: 0.5 });
        }
      }
    } catch (error) {
      // Silently ignore map errors
    }
  }, [map, mapCenter, mapZoom, mapVersion, suspended]);
  
  return null;
});

function SyncedMapPaneInner({ markers = [], onMarkerClick }: SyncedMapPaneProps) {
  const [leaflet, setLeaflet] = useState<any>(null);
  const [MapContainer, setMapContainer] = useState<any>(null);
  const [TileLayer, setTileLayer] = useState<any>(null);
  const [Marker, setMarker] = useState<any>(null);
  const [Popup, setPopup] = useState<any>(null);
  const [useMap, setUseMap] = useState<any>(null);
  const [CircleMarker, setCircleMarker] = useState<any>(null);
  const mapRef = useRef<any>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationEnabled, setLocationEnabled] = useState(false);
  
  const { 
    activeListingId, 
    hoveredListingId, 
    mapCenter, 
    mapZoom,
    mapVersion,
    setMapBounds 
  } = useSearchMapStore();

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

  useEffect(() => {
    const loadLeaflet = async () => {
      try {
        const L = (await import("leaflet")).default;
        await import("leaflet/dist/leaflet.css");
        const { MapContainer: MC, TileLayer: TL, Marker: M, Popup: P, useMap: UM, CircleMarker: CM } = await import("react-leaflet");
        
        setLeaflet(L);
        setMapContainer(() => MC);
        setTileLayer(() => TL);
        setMarker(() => M);
        setPopup(() => P);
        setUseMap(() => UM);
        setCircleMarker(() => CM);
      } catch (error) {
        console.error("Failed to load Leaflet:", error);
      }
    };
    loadLeaflet();
  }, []);

  useEffect(() => {
    const removeNButton = () => {
      const buttons = document.querySelectorAll('button, [role="button"]');
      buttons.forEach(btn => {
        const text = btn.textContent?.trim();
        if (text === 'N' && btn.closest('.leaflet-container')) {
          (btn as HTMLElement).style.display = 'none';
        }
      });
      const controls = document.querySelectorAll('.leaflet-control-compass, .leaflet-control-rotate');
      controls.forEach(el => (el as HTMLElement).style.display = 'none');
    };
    const timer = setInterval(removeNButton, 1000);
    removeNButton();
    return () => clearInterval(timer);
  }, [leaflet]);

  useEffect(() => {
    if (!activeListingId || !mapRef.current || !markers.length) return;
    
    const activeMarker = markers.find(m => m.id === activeListingId);
    if (activeMarker && activeMarker.lat && activeMarker.lng) {
      const lat = parseFloat(String(activeMarker.lat));
      const lng = parseFloat(String(activeMarker.lng));
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        mapRef.current.flyTo([lat, lng], 15, { animate: true, duration: 0.8 });
      }
    }
  }, [activeListingId, markers]);

  if (!leaflet || !MapContainer || !TileLayer || !Marker || !Popup || !useMap) {
    return (
      <div className="w-full h-full bg-[#001a2c] rounded-xl flex items-center justify-center">
        <div className="text-center">
          <MapPin className="w-10 h-10 text-[#D4AF37] mx-auto mb-2 animate-pulse" />
          <p className="text-white/60 text-sm">جاري تحميل الخريطة...</p>
        </div>
      </div>
    );
  }

  const defaultIcon = leaflet.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background: linear-gradient(135deg, #002845 0%, #001a2c 100%);
      border: 2px solid #D4AF37;
      border-radius: 50%;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    ">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#D4AF37">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
      </svg>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });

  const activeIcon = leaflet.divIcon({
    className: 'custom-marker-active',
    html: `<div style="
      background: linear-gradient(135deg, #D4AF37 0%, #b8962e 100%);
      border: 3px solid #fff;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 6px 20px rgba(212,175,55,0.5);
      animation: pulse 1.5s infinite;
    ">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="#002845">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
      </svg>
    </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40],
  });

  const hoveredIcon = leaflet.divIcon({
    className: 'custom-marker-hovered',
    html: `<div style="
      background: linear-gradient(135deg, #10B981 0%, #059669 100%);
      border: 2px solid #fff;
      border-radius: 50%;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 16px rgba(16,185,129,0.4);
      transform: scale(1.1);
    ">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
      </svg>
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });

  const getMarkerIcon = (markerId: string) => {
    if (activeListingId === markerId) return activeIcon;
    if (hoveredListingId === markerId) return hoveredIcon;
    return defaultIcon;
  };

  // القيم الافتراضية الآمنة للخريطة (الرياض)
  const DEFAULT_CENTER: [number, number] = [24.7136, 46.6753];
  const DEFAULT_ZOOM = 10;
  
  // التحقق من صحة الإحداثيات
  const safeCenter: [number, number] = (
    Array.isArray(mapCenter) && 
    mapCenter.length === 2 && 
    !isNaN(mapCenter[0]) && 
    !isNaN(mapCenter[1]) &&
    mapCenter[0] >= -90 && mapCenter[0] <= 90 &&
    mapCenter[1] >= -180 && mapCenter[1] <= 180
  ) ? mapCenter : DEFAULT_CENTER;
  
  const safeZoom = (typeof mapZoom === 'number' && !isNaN(mapZoom) && mapZoom >= 1 && mapZoom <= 20) 
    ? mapZoom 
    : DEFAULT_ZOOM;

  const userLocationIcon = leaflet?.divIcon({
    className: 'user-location-marker',
    html: `<div style="
      width: 20px;
      height: 20px;
      background: #3B82F6;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 0 0 8px rgba(59,130,246,0.3), 0 2px 8px rgba(0,0,0,0.3);
      animation: locationPulse 2s ease-out infinite;
    "></div>
    <style>
      @keyframes locationPulse {
        0% { box-shadow: 0 0 0 0 rgba(59,130,246,0.4), 0 2px 8px rgba(0,0,0,0.3); }
        70% { box-shadow: 0 0 0 20px rgba(59,130,246,0), 0 2px 8px rgba(0,0,0,0.3); }
        100% { box-shadow: 0 0 0 0 rgba(59,130,246,0), 0 2px 8px rgba(0,0,0,0.3); }
      }
    </style>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

  return (
    <div className="relative w-full h-full">
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
        center={safeCenter}
        zoom={safeZoom}
        className="w-full h-full rounded-xl z-0"
        style={{ minHeight: "100%" }}
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapController useMapHook={useMap} mapCenter={safeCenter} mapZoom={safeZoom} mapVersion={mapVersion} suspended={locationEnabled} />
        
        {/* User Location Marker - always render but control visibility */}
        {userLocation && Marker && userLocationIcon && (
          <Marker 
            position={userLocation} 
            icon={userLocationIcon}
            opacity={locationEnabled ? 1 : 0}
          >
            <Popup>
              <div className="text-center text-sm font-medium text-blue-600" dir="rtl">
                📍 موقعك الحالي
              </div>
            </Popup>
          </Marker>
        )}
        
        {markers.map((marker) => (
        <Marker
          key={marker.id}
          position={[marker.lat, marker.lng]}
          icon={getMarkerIcon(marker.id)}
          eventHandlers={{
            click: () => onMarkerClick?.(marker),
          }}
        >
          <Popup>
            <PopupContent marker={marker} />
          </Popup>
        </Marker>
      ))}
      </MapContainer>
    </div>
  );
}

const SyncedMapPane = dynamic(() => Promise.resolve(SyncedMapPaneInner), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-[#001a2c] rounded-xl flex items-center justify-center">
      <div className="text-center">
        <MapPin className="w-10 h-10 text-[#D4AF37] mx-auto mb-2 animate-pulse" />
        <p className="text-white/60 text-sm">جاري تحميل الخريطة...</p>
      </div>
    </div>
  ),
});

export default SyncedMapPane;
