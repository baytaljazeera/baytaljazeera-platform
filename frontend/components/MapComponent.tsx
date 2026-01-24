"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { MapPin, Heart } from "lucide-react";

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
  isFavorite?: boolean;
};

type MapComponentProps = {
  markers: PropertyMarker[];
  center?: [number, number];
  zoom?: number;
  onMarkerClick?: (marker: PropertyMarker) => void;
  selectedMarkerId?: string;
  onToggleFavorite?: (markerId: string, isFavorite: boolean) => void;
  showFavoriteButton?: boolean;
};

function MapComponentInner({
  markers = [],
  center = [24.7136, 46.6753],
  zoom = 6,
  onMarkerClick,
  selectedMarkerId,
  onToggleFavorite,
  showFavoriteButton = true,
}: MapComponentProps) {
  const [leaflet, setLeaflet] = useState<any>(null);
  const [MapContainer, setMapContainer] = useState<any>(null);
  const [TileLayer, setTileLayer] = useState<any>(null);
  const [Marker, setMarker] = useState<any>(null);
  const [Popup, setPopup] = useState<any>(null);

  useEffect(() => {
    const loadLeaflet = async () => {
      try {
        // Dynamic import with proper error handling
        const L = (await import("leaflet")).default;
        await import("leaflet/dist/leaflet.css");
        
        const { MapContainer: MC, TileLayer: TL, Marker: M, Popup: P } = await import("react-leaflet");
        
        setLeaflet(L);
        setMapContainer(() => MC);
        setTileLayer(() => TL);
        setMarker(() => M);
        setPopup(() => P);
      } catch (error) {
        console.error("Failed to load Leaflet:", error);
      }
    };
    loadLeaflet();
  }, []);

  if (!leaflet || !MapContainer || !TileLayer || !Marker || !Popup) {
    return (
      <div className="w-full bg-gray-100 rounded-2xl flex items-center justify-center min-h-[500px]">
        <div className="text-center">
          <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-2 animate-pulse" />
          <p className="text-gray-500">جاري تحميل الخريطة...</p>
        </div>
      </div>
    );
  }

  const defaultIcon = leaflet.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

  const selectedIcon = leaflet.icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

  return (
    <MapContainer
      center={center as [number, number]}
      zoom={zoom}
      className="w-full h-full rounded-2xl z-0"
      style={{ minHeight: "500px" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {markers && markers.length > 0 ? (
        markers.map((marker) => (
          <Marker
            key={marker.id}
            position={[marker.lat, marker.lng]}
            icon={selectedMarkerId === marker.id ? selectedIcon : defaultIcon}
            eventHandlers={{
              click: () => onMarkerClick?.(marker),
            }}
          >
            <Popup>
              <div className="text-right p-2 min-w-[200px]" dir="rtl">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-bold text-[#002845] text-base flex-1">
                    {marker.title}
                  </h3>
                  {showFavoriteButton && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite?.(marker.id, !marker.isFavorite);
                      }}
                      className="flex-shrink-0 p-1 rounded-full hover:bg-gray-100 transition-colors"
                      title={marker.isFavorite ? "إزالة من المفضلة" : "إضافة للمفضلة"}
                    >
                      <Heart 
                        className={`w-5 h-5 ${
                          marker.isFavorite 
                            ? "fill-red-500 text-red-500" 
                            : "text-gray-400 hover:text-red-400"
                        }`} 
                      />
                    </button>
                  )}
                </div>
                <p className="text-sm text-gray-600 mb-2">
                  {marker.city}
                  {marker.district ? ` - ${marker.district}` : ""}
                </p>
                <p className="text-lg font-bold text-[#d4af37] mb-2">
                  {marker.price.toLocaleString("en-US")} ريال
                </p>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  {marker.bedrooms && <span>{marker.bedrooms} غرف</span>}
                  {marker.bathrooms && <span>{marker.bathrooms} حمامات</span>}
                  {marker.area && <span>{marker.area} م²</span>}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    marker.purpose === "بيع" 
                      ? "bg-green-100 text-green-700" 
                      : "bg-blue-100 text-blue-700"
                  }`}>
                    {marker.purpose === "بيع" ? "للبيع" : "للإيجار"}
                  </span>
                  <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                    {marker.type}
                  </span>
                </div>
              </div>
            </Popup>
          </Marker>
        ))
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <p className="text-gray-500">لا توجد عقارات في هذا الموقع</p>
        </div>
      )}
    </MapContainer>
  );
}

const MapComponent = dynamic(() => Promise.resolve(MapComponentInner), {
  ssr: false,
  loading: () => (
    <div className="w-full bg-gray-100 rounded-2xl flex items-center justify-center min-h-[500px]">
      <div className="text-center">
        <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-2 animate-pulse" />
        <p className="text-gray-500">جاري تحميل الخريطة...</p>
      </div>
    </div>
  ),
});

export default MapComponent;
