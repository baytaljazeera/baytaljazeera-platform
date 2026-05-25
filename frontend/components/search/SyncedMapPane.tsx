"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useRef, memo, useCallback } from "react";
import { MapPin, Navigation, X, Bed, Bath, Maximize2, Key, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
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
  isClosing,
}: {
  marker: PropertyMarker | null;
  onClose: () => void;
  isMobile: boolean;
  isClosing: boolean;
}) {
  const [imgIdx, setImgIdx] = useState(0);

  useEffect(() => { setImgIdx(0); }, [marker?.id]);

  if (!marker) return null;

  const imgs = marker.images?.length ? marker.images : marker.image_url ? [marker.image_url] : [];
  const statusCfg = DEAL_STATUS_CONFIG[marker.deal_status || "active"] || DEAL_STATUS_CONFIG.active;
  const listingUrl = `/listing/${marker.id}`;

  // Mobile: top-anchored panel so it stays in view above the keyboard / footer.
  // Desktop: compact 280px card floating at top-right of the map — owner asked
  // for the preview to sit "في الأعلى" instead of dropping to the bottom.
  // Purpose-tinted background to give the card an at-a-glance identity:
  //   • بيع   → warm rose tint (ownership / home)
  //   • إيجار → light mint tint (flexibility / temporary stay)
  const isSale = marker.purpose === "بيع" || marker.purpose === "للبيع";
  const tintBg = isSale ? "bg-rose-50" : "bg-emerald-50";
  const tintBorder = isSale ? "border-rose-200" : "border-emerald-200";
  // Tween via inline classes: when isClosing flips true the card fades and
  // lifts slightly. Parent unmounts the marker ~180ms later so this animation
  // gets to play.
  const motionClass = isClosing
    ? "opacity-0 -translate-y-1 scale-[0.98]"
    : "opacity-100 translate-y-0 scale-100";
  return (
    <div
      className={`absolute z-[2000] map-sidebar-enter transition-all duration-200 ease-out ${motionClass} ${
        isMobile
          ? "left-0 right-0 top-0"
          : "right-3 top-3 w-[280px]"
      }`}
      dir="rtl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className={`relative ${tintBg} rounded-2xl shadow-2xl border ${tintBorder} overflow-hidden`}>
        {/* close */}
        <button
          onClick={onClose}
          className="absolute top-2 left-2 z-20 w-7 h-7 rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-black/75 transition backdrop-blur-sm"
          aria-label="إغلاق"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {/* image — short, doesn't dominate */}
        <a href={listingUrl} className="block relative w-full bg-gray-100" style={{ aspectRatio: "16/9" }}>
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
                  {/* SVG arrows (not bidi-flipped like the single-chevron chars
                      were under dir="rtl") — both point outward, away from the
                      image center. */}
                  <button
                    type="button"
                    aria-label="السابق"
                    onClick={(e) => { e.preventDefault(); setImgIdx((i) => (i - 1 + imgs.length) % imgs.length); }}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-black/75"
                  ><ChevronRight className="w-3.5 h-3.5" /></button>
                  <button
                    type="button"
                    aria-label="التالي"
                    onClick={(e) => { e.preventDefault(); setImgIdx((i) => (i + 1) % imgs.length); }}
                    className="absolute left-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-black/75"
                  ><ChevronLeft className="w-3.5 h-3.5" /></button>
                  <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1">
                    {imgs.map((_, i) => (
                      <span
                        key={i}
                        className={`w-1 h-1 rounded-full ${i === imgIdx ? "bg-white" : "bg-white/45"}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <MapPin className="w-8 h-8 text-gray-300" />
            </div>
          )}
          {/* status pill */}
          <span className={`absolute top-2 right-2 text-[9px] px-1.5 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.color} font-medium`}>
            {statusCfg.label}
          </span>
          {/* purpose pill on image — icon reinforces meaning at a glance:
              key for ownership/sale, calendar for time-bound rental */}
          <span className={`absolute bottom-2 right-2 text-[10px] px-2 py-0.5 rounded-full font-bold backdrop-blur-sm inline-flex items-center gap-1 ${
            isSale
              ? "bg-[#D4AF37] text-[#002845]"
              : "bg-emerald-600/90 text-white"
          }`}>
            {isSale ? <Key className="w-3 h-3" /> : <CalendarDays className="w-3 h-3" />}
            {isSale ? "للبيع" : "للإيجار"}
          </span>
        </a>

        {/* content — tight padding, no wasted vertical space */}
        <div className="p-3">
          <h3 className="font-bold text-[#002845] text-sm leading-snug line-clamp-2 mb-1">{marker.title}</h3>
          <p className="text-[11px] text-gray-500 flex items-center gap-1 mb-2">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">{marker.city}{marker.district ? ` · ${marker.district}` : ""}</span>
          </p>

          {/* price */}
          <div className="flex items-baseline gap-1 mb-2">
            <span className="text-lg font-bold text-[#D4AF37]">{marker.price.toLocaleString("en-US")}</span>
            <span className="text-[11px] text-gray-500">ريال</span>
          </div>

          {/* specs — small inline row */}
          <div className="flex gap-3 text-[11px] text-gray-600 mb-2.5">
            {marker.bedrooms ? (
              <span className="flex items-center gap-0.5"><Bed className="w-3.5 h-3.5" />{marker.bedrooms}</span>
            ) : null}
            {marker.bathrooms ? (
              <span className="flex items-center gap-0.5"><Bath className="w-3.5 h-3.5" />{marker.bathrooms}</span>
            ) : null}
            {marker.area ? (
              <span className="flex items-center gap-0.5"><Maximize2 className="w-3.5 h-3.5" />{marker.area} م²</span>
            ) : null}
          </div>

          {/* single primary CTA — no decorative emoji, smaller padding */}
          <a
            href={listingUrl}
            className="block w-full py-2 rounded-lg text-center text-xs font-bold bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] shadow hover:shadow-lg transition"
          >
            عرض تفاصيل الإعلان
          </a>
        </div>
      </div>
    </div>
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

/* ─── Map click handler — dismisses the sidebar on empty-area clicks ──────── */
const MapClickHandler = memo(function MapClickHandler({
  useMapEventsHook,
  onMapClick,
}: {
  useMapEventsHook: any;
  onMapClick: () => void;
}) {
  useMapEventsHook({ click: onMapClick });
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
  const [useMapEvents,  setUseMapEvents]  = useState<any>(null);

  const mapRef = useRef<any>(null);

  /* location */
  const [userLocation,    setUserLocation]    = useState<[number, number] | null>(null);
  const [isLocating,      setIsLocating]      = useState(false);
  const [locationEnabled, setLocationEnabled] = useState(false);

  /* sidebar + hover */
  const [selectedMarker, setSelectedMarker] = useState<PropertyMarker | null>(null);
  const [hoveredMarker,  setHoveredMarker]  = useState<PropertyMarker | null>(null);
  const [isMobile,       setIsMobile]       = useState(false);
  // Two-phase close: flip isClosing on, let the CSS transition play, then drop
  // the marker. Keeps the close gesture from feeling like a hard cut.
  const [isClosing,      setIsClosing]      = useState(false);
  const closeTimerRef                      = useRef<number | null>(null);

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
        // Calmer neighborhood-level zoom (~35% less tight than zoom 15) so
        // the surroundings stay visible when the user picks a listing.
        mapRef.current.flyTo([lat, lng], 12, { animate: true, duration: 1.0 });
      }
    }
  }, [activeListingId, markers]);

  /* load leaflet */
  useEffect(() => {
    (async () => {
      try {
        const L = (await import("leaflet")).default;
        await import("leaflet/dist/leaflet.css");
        const { MapContainer: MC, TileLayer: TL, Marker: M, Popup: P, useMap: UM, useMapEvents: UME } = await import("react-leaflet");
        setLeaflet(L);
        setMapContainer(() => MC);
        setTileLayer(() => TL);
        setMarker(() => M);
        setPopup(() => P);
        setUseMap(() => UM);
        setUseMapEvents(() => UME);
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

  /* close sidebar — animate out, then unmount */
  const closeSidebar = useCallback(() => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      setSelectedMarker(null);
      setActiveListingId(null);
      setIsClosing(false);
      closeTimerRef.current = null;
    }, 180);
  }, [setActiveListingId]);

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
  }, []);

  if (!leaflet || !MapContainer || !TileLayer || !Marker || !Popup || !useMap || !useMapEvents) {
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
        isClosing={isClosing}
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

        {/* Click on empty map area dismisses the sidebar. Leaflet's map-level
            click does NOT fire for marker clicks, so selecting a different
            listing still works without bouncing through a close→open cycle. */}
        <MapClickHandler useMapEventsHook={useMapEvents} onMapClick={closeSidebar} />

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
              click: () => {
                setSelectedMarker(marker);
                setActiveListingId(marker.id);
                onMarkerClick?.(marker);
                const lat = parseFloat(String(marker.lat));
                const lng = parseFloat(String(marker.lng));
                if (mapRef.current && Number.isFinite(lat) && Number.isFinite(lng)) {
                  // Match list-click behavior: calmer zoom that keeps context visible.
                  mapRef.current.flyTo([lat, lng], 12, { animate: true, duration: 1.0 });
                }
              },
              dblclick: () => {
                window.location.href = `/listing/${marker.id}`;
              },
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
