"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useRef, memo, useCallback } from "react";
import { MapPin, Navigation, X, Bed, Bath, Maximize2 } from "lucide-react";
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
  active:      { label: "نشط",          color: "text-green-700", bg: "bg-green-100" },
  negotiating: { label: "قيد التفاوض",  color: "text-amber-700", bg: "bg-amber-100" },
  sold:        { label: "تمت الصفقة",   color: "text-blue-700",  bg: "bg-blue-100"  },
  rented:      { label: "تم التأجير",   color: "text-blue-700",  bg: "bg-blue-100"  },
  archived:    { label: "مؤرشف",        color: "text-gray-700",  bg: "bg-gray-100"  },
};

/* ─── Sidebar ─────────────────────────────────────────────────────────────── */
function ListingSidebar({
  marker,
  onClose,
  isMobile,
}: {
  marker: PropertyMarker | null;
  onClose: () => void;
  isMobile: boolean;
}) {
  const [imgIdx, setImgIdx] = useState(0);

  useEffect(() => { setImgIdx(0); }, [marker?.id]);

  if (!marker) return null;

  const imgs = marker.images?.length ? marker.images : marker.image_url ? [marker.image_url] : [];
  const statusCfg = DEAL_STATUS_CONFIG[marker.deal_status || "active"] || DEAL_STATUS_CONFIG.active;
  const listingUrl = `/listing/${marker.id}`;

  return (
    <>
      {/* backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-[1999]"
        onClick={onClose}
      />

      {/* panel */}
      <div
        className={`absolute top-0 right-0 z-[2000] h-full bg-white shadow-2xl overflow-y-auto flex flex-col map-sidebar-enter ${
          isMobile ? "w-full" : "w-[320px]"
        }`}
        style={{ maxWidth: "100vw" }}
      >
        {/* close */}
        <button
          onClick={onClose}
          className="absolute top-3 left-3 z-10 w-8 h-8 rounded-full bg-white/90 shadow-md flex items-center justify-center hover:bg-gray-100 transition"
        >
          <X className="w-4 h-4 text-gray-700" />
        </button>

        {/* image */}
        <div className="relative w-full bg-gray-100 flex-shrink-0" style={{ aspectRatio: "16/10" }}>
          {imgs.length > 0 ? (
            <>
              <img
                src={imgs[imgIdx]}
                alt={marker.title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              {imgs.length > 1 && (
                <>
                  <button
                    onClick={() => setImgIdx((i) => (i - 1 + imgs.length) % imgs.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center text-base"
                  >›</button>
                  <button
                    onClick={() => setImgIdx((i) => (i + 1) % imgs.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center text-base"
                  >‹</button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {imgs.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setImgIdx(i)}
                        className={`w-1.5 h-1.5 rounded-full transition ${i === imgIdx ? "bg-white" : "bg-white/50"}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <MapPin className="w-12 h-12 text-gray-300" />
            </div>
          )}
          <span className={`absolute top-3 right-3 text-[10px] px-2 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.color} font-medium`}>
            {statusCfg.label}
          </span>
        </div>

        {/* content */}
        <div className="p-4 text-right flex flex-col flex-1" dir="rtl">
          <h3 className="font-bold text-[#002845] text-base mb-1 leading-snug">{marker.title}</h3>
          <p className="text-xs text-gray-500 mb-3 flex items-center gap-1 justify-end">
            <span>{marker.city}{marker.district ? ` - ${marker.district}` : ""}</span>
            <MapPin className="w-3 h-3" />
          </p>

          <div className="flex items-baseline gap-1 justify-end mb-0.5">
            <span className="text-2xl font-bold text-[#D4AF37]">{marker.price.toLocaleString("en-US")}</span>
            <span className="text-sm text-gray-500">ريال</span>
          </div>
          <p className="text-[11px] text-gray-400 mb-4 text-left">
            ≈ ${(marker.price / 3.75).toLocaleString("en-US", { maximumFractionDigits: 0 })} USD
          </p>

          {/* specs */}
          <div className="flex gap-3 justify-end mb-4 flex-wrap">
            {marker.bedrooms && (
              <div className="flex items-center gap-1 text-sm text-gray-600">
                <span>{marker.bedrooms} غرف</span>
                <Bed className="w-4 h-4" />
              </div>
            )}
            {marker.bathrooms && (
              <div className="flex items-center gap-1 text-sm text-gray-600">
                <span>{marker.bathrooms} حمام</span>
                <Bath className="w-4 h-4" />
              </div>
            )}
            {marker.area && (
              <div className="flex items-center gap-1 text-sm text-gray-600">
                <span>{marker.area} م²</span>
                <Maximize2 className="w-4 h-4" />
              </div>
            )}
          </div>

          {/* tags */}
          <div className="flex gap-2 justify-end mb-5">
            <span className={`text-xs px-3 py-1 rounded-full font-medium ${
              marker.purpose === "بيع" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
            }`}>
              {marker.purpose === "بيع" ? "للبيع" : "للإيجار"}
            </span>
            <span className="text-xs px-3 py-1 rounded-full bg-[#fdf8ec] text-[#8B6914] font-medium">
              {marker.type}
            </span>
          </div>

          {/* CTA */}
          <a
            href={listingUrl}
            className="w-full py-3 rounded-xl font-bold text-sm text-white mt-auto flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #D4AF37 0%, #B8860B 100%)",
              textDecoration: "none",
              color: "#fff",
              display: "flex",
            }}
          >
            🏠 عرض الإعلان كاملاً
          </a>
        </div>
      </div>
    </>
  );
}

/* ─── Hover mini preview (desktop only) ───────────────────────────────────── */
const HoverPreview = memo(function HoverPreview({ marker }: { marker: PropertyMarker | null }) {
  if (!marker) return null;
  return (
    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-[1500] pointer-events-none map-hover-enter">
      <div className="bg-white rounded-xl shadow-xl px-4 py-2.5 text-right min-w-[200px] border border-gray-100" dir="rtl">
        <p className="font-bold text-[#002845] text-xs line-clamp-1 mb-0.5">{marker.title}</p>
        <p className="text-[#D4AF37] font-bold text-sm">{marker.price.toLocaleString("en-US")} ريال</p>
        <p className="text-gray-400 text-[10px]">{marker.city}{marker.district ? ` - ${marker.district}` : ""}</p>
      </div>
    </div>
  );
});

/* ─── Map controller ──────────────────────────────────────────────────────── */
const MapController = memo(function MapController({
  useMapHook, mapCenter, mapZoom, mapVersion, suspended = false,
}: MapControllerProps) {
  const map = useMapHook();
  const lastVersionRef = useRef<number>(0);

  useEffect(() => {
    if (!map || suspended) return;
    try {
      const lat = parseFloat(String(mapCenter?.[0] ?? 24.7136));
      const lng = parseFloat(String(mapCenter?.[1] ?? 46.6753));
      const zoom = Math.floor(parseFloat(String(mapZoom ?? 10)));
      if (
        Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(zoom) &&
        lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && zoom >= 1 && zoom <= 20
      ) {
        if (mapVersion > lastVersionRef.current) {
          lastVersionRef.current = mapVersion;
          map.setView([lat, lng], zoom, { animate: true, duration: 0.5 });
        }
      }
    } catch (_) {}
  }, [map, mapCenter, mapZoom, mapVersion, suspended]);

  return null;
});

/* ─── Main inner component ────────────────────────────────────────────────── */
function SyncedMapPaneInner({ markers = [], onMarkerClick }: SyncedMapPaneProps) {
  /* leaflet dynamic imports */
  const [leaflet,       setLeaflet]       = useState<any>(null);
  const [MapContainer,  setMapContainer]  = useState<any>(null);
  const [TileLayer,     setTileLayer]     = useState<any>(null);
  const [Marker,        setMarker]        = useState<any>(null);
  const [Popup,         setPopup]         = useState<any>(null);
  const [useMap,        setUseMap]        = useState<any>(null);

  const mapRef = useRef<any>(null);

  /* location */
  const [userLocation,    setUserLocation]    = useState<[number, number] | null>(null);
  const [isLocating,      setIsLocating]      = useState(false);
  const [locationEnabled, setLocationEnabled] = useState(false);

  /* sidebar + hover */
  const [selectedMarker, setSelectedMarker] = useState<PropertyMarker | null>(null);
  const [hoveredMarker,  setHoveredMarker]  = useState<PropertyMarker | null>(null);
  const [isMobile,       setIsMobile]       = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const {
    activeListingId,
    hoveredListingId,
    mapCenter,
    mapZoom,
    mapVersion,
    setActiveListingId,
    setHoveredListingId,
  } = useSearchMapStore();

  /* location toggle */
  const handleLocationToggle = useCallback(() => {
    if (locationEnabled) { setLocationEnabled(false); return; }
    setIsLocating(true);
    if (!navigator.geolocation) { setIsLocating(false); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude, longitude } }) => {
        setUserLocation([latitude, longitude]);
        setLocationEnabled(true);
        setIsLocating(false);
        mapRef.current?.flyTo([latitude, longitude], 14, { animate: true, duration: 0.8 });
      },
      () => { setIsLocating(false); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, [locationEnabled]);

  /* fly to active marker from list */
  useEffect(() => {
    if (!activeListingId || !mapRef.current || !markers.length) return;
    const m = markers.find(x => x.id === activeListingId);
    if (m) {
      const lat = parseFloat(String(m.lat));
      const lng = parseFloat(String(m.lng));
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        mapRef.current.flyTo([lat, lng], 15, { animate: true, duration: 0.8 });
      }
    }
  }, [activeListingId, markers]);

  /* load leaflet */
  useEffect(() => {
    (async () => {
      try {
        const L = (await import("leaflet")).default;
        await import("leaflet/dist/leaflet.css");
        const { MapContainer: MC, TileLayer: TL, Marker: M, Popup: P, useMap: UM } = await import("react-leaflet");
        setLeaflet(L);
        setMapContainer(() => MC);
        setTileLayer(() => TL);
        setMarker(() => M);
        setPopup(() => P);
        setUseMap(() => UM);
      } catch (e) { console.error("Leaflet load failed", e); }
    })();
  }, []);

  /* remove leaflet branding buttons */
  useEffect(() => {
    const clean = () => {
      document.querySelectorAll('button, [role="button"]').forEach(btn => {
        if (btn.textContent?.trim() === "N" && btn.closest(".leaflet-container"))
          (btn as HTMLElement).style.display = "none";
      });
      document.querySelectorAll(".leaflet-control-compass, .leaflet-control-rotate")
        .forEach(el => ((el as HTMLElement).style.display = "none"));
    };
    const t = setInterval(clean, 1000);
    clean();
    return () => clearInterval(t);
  }, [leaflet]);

  /* marker click handler */
  const handleMarkerClick = useCallback((marker: PropertyMarker) => {
    setSelectedMarker(marker);
    setActiveListingId(marker.id);
    onMarkerClick?.(marker);
    if (mapRef.current) {
      const lat = parseFloat(String(marker.lat));
      const lng = parseFloat(String(marker.lng));
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        mapRef.current.flyTo([lat, lng], 15, { animate: true, duration: 0.6 });
      }
    }
  }, [onMarkerClick, setActiveListingId]);

  /* double-click → navigate instantly */
  const handleMarkerDblClick = useCallback((marker: PropertyMarker) => {
    window.location.href = `/listing/${marker.id}`;
  }, []);

  /* close sidebar */
  const closeSidebar = useCallback(() => {
    setSelectedMarker(null);
    setActiveListingId(null);
  }, [setActiveListingId]);

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

  /* ── icons ── */
  const mkIcon = (color: string, size: number, border: string, shadow: string, extra = "") =>
    leaflet.divIcon({
      className: "",
      html: `<div style="
        background:${color};border:${border};border-radius:50%;
        width:${size}px;height:${size}px;
        display:flex;align-items:center;justify-content:center;
        box-shadow:${shadow};${extra}
      ">
        <svg width="${size * 0.5}" height="${size * 0.5}" viewBox="0 0 24 24" fill="${size >= 38 ? "#002845" : "#D4AF37"}">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
        </svg>
      </div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size],
      popupAnchor: [0, -size],
    });

  const defaultIcon = mkIcon(
    "linear-gradient(135deg,#002845 0%,#001a2c 100%)", 32,
    "2px solid #D4AF37", "0 4px 12px rgba(0,0,0,0.3)"
  );
  const activeIcon = mkIcon(
    "linear-gradient(135deg,#D4AF37 0%,#b8962e 100%)", 42,
    "3px solid #fff", "0 6px 20px rgba(212,175,55,0.6)",
    "animation:mapPulse 1.5s ease-in-out infinite;"
  );
  const hoveredIcon = mkIcon(
    "linear-gradient(135deg,#10B981 0%,#059669 100%)", 36,
    "2px solid #fff", "0 4px 16px rgba(16,185,129,0.4)",
    "transform:scale(1.1);"
  );

  const getIcon = (id: string) => {
    if (activeListingId === id || selectedMarker?.id === id) return activeIcon;
    if (hoveredListingId === id) return hoveredIcon;
    return defaultIcon;
  };

  const DEFAULT_CENTER: [number, number] = [24.7136, 46.6753];
  const safeCenter: [number, number] = (
    Array.isArray(mapCenter) && mapCenter.length === 2 &&
    !isNaN(mapCenter[0]) && !isNaN(mapCenter[1]) &&
    mapCenter[0] >= -90 && mapCenter[0] <= 90 &&
    mapCenter[1] >= -180 && mapCenter[1] <= 180
  ) ? mapCenter : DEFAULT_CENTER;
  const safeZoom = typeof mapZoom === "number" && !isNaN(mapZoom) ? mapZoom : 10;

  const userLocIcon = leaflet.divIcon({
    className: "",
    html: `<div style="width:20px;height:20px;background:#3B82F6;border:3px solid white;border-radius:50%;
      box-shadow:0 0 0 8px rgba(59,130,246,0.25),0 2px 8px rgba(0,0,0,0.3);
      animation:locationPulse 2s ease-out infinite;"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

  return (
    <div className="relative w-full h-full">
      {/* location button */}
      <button
        onClick={handleLocationToggle}
        disabled={isLocating}
        className={`absolute bottom-4 left-4 z-[1000] w-11 h-11 rounded-full shadow-lg flex items-center justify-center border-2 transition-colors ${
          locationEnabled ? "bg-blue-500 text-white border-blue-400" : "bg-white text-gray-600 hover:bg-gray-50 border-gray-200"
        } ${isLocating ? "animate-pulse" : ""}`}
        title={locationEnabled ? "إيقاف تتبع الموقع" : "عرض موقعي"}
      >
        <Navigation className={`w-5 h-5 ${locationEnabled ? "fill-current rotate-45" : ""}`} />
      </button>

      {/* hover preview — desktop only */}
      {!isMobile && !selectedMarker && (
        <HoverPreview marker={hoveredMarker} />
      )}

      {/* sidebar */}
      <ListingSidebar
        marker={selectedMarker}
        onClose={closeSidebar}
        isMobile={isMobile}
      />

      <MapContainer
        center={safeCenter}
        zoom={safeZoom}
        className="w-full h-full rounded-xl z-0"
        style={{ minHeight: "100%" }}
        ref={mapRef}
        doubleClickZoom={false}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapController
          useMapHook={useMap}
          mapCenter={safeCenter}
          mapZoom={safeZoom}
          mapVersion={mapVersion}
          suspended={locationEnabled}
        />

        {/* user location */}
        {userLocation && (
          <Marker position={userLocation} icon={userLocIcon} opacity={locationEnabled ? 1 : 0}>
            <Popup>
              <div className="text-center text-sm font-medium text-blue-600" dir="rtl">📍 موقعك الحالي</div>
            </Popup>
          </Marker>
        )}

        {/* property markers */}
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            position={[marker.lat, marker.lng]}
            icon={getIcon(marker.id)}
            eventHandlers={{
              click: () => handleMarkerClick(marker),
              dblclick: () => handleMarkerDblClick(marker),
              mouseover: () => { if (!isMobile) { setHoveredListingId(marker.id); setHoveredMarker(marker); } },
              mouseout:  () => { if (!isMobile) { setHoveredListingId(null); setHoveredMarker(null); } },
            }}
          />
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
