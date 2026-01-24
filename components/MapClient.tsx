"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { BedDouble, Bath, MapPin, Square, AlertTriangle } from "lucide-react";

export type MapListing = {
  id: string;
  title: string;
  description?: string;
  city?: string;
  district?: string;
  price?: number;
  area?: number;
  bedrooms?: number;
  bathrooms?: number;
  latitude?: number;
  longitude?: number;
};

type MapClientProps = {
  listings: MapListing[];
  selectedCity?: string;
  activeListingId?: string | null; // العقار المحدد من الكرت
  onMarkerClick?: (id: string) => void; // نستخدمه لعمل highlight للكرت
};

const DEFAULT_CENTER: LatLngExpression = [23.8859, 45.0792];
const DEFAULT_ZOOM = 5;

// إحداثيات المدن (مختصر، تقريبية من مصادر جغرافية عامة) 
const CITY_CENTER: Record<string, LatLngExpression> = {
  "مكة المكرمة": [21.4266, 39.8256],
  "المدينة المنورة": [24.4686, 39.6142],
  "الطائف": [21.4333, 40.35],
  "الهدا (الطائف)": [21.3578, 40.2782],
  "الشفا (الطائف)": [21.0744, 40.3242],
  "جدة": [21.4925, 39.1776],
  "ينبع": [24.0895, 38.0618],
  "الرياض": [24.7136, 46.6753],
  "الدمام": [26.4344, 50.1033],
  "الخبر": [26.2794, 50.2083],
  "الظهران": [26.2886, 50.114],
  "تبوك": [28.3833, 36.5833],
  "أبها": [18.2164, 42.5053],
  "السودة (أبها)": [18.2717, 42.384],
  "جازان": [16.9097, 42.5679],
  "نجران": [17.4933, 44.1277],
  "حائل": [27.5219, 41.6907],
  "القصيم": [26.2078, 43.4837],
};

// إصلاح أيقونة Leaflet الافتراضية 
if (typeof window !== "undefined") {
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

function MapInner({
  listings,
  selectedCity,
  activeListingId,
  onMarkerClick,
}: MapClientProps) {
  const map = useMap();
  const [userPosition, setUserPosition] = useState<LatLngExpression | null>(
    null
  );
  const [isLocating, setIsLocating] = useState(false);

  // كل الإعلانات اللي عندها إحداثيات
  const listingsWithCoords = useMemo(
    () =>
      listings.filter(
        (l) =>
          typeof l.latitude === "number" && typeof l.longitude === "number"
      ),
    [listings]
  );

  const markerPositions = useMemo(
    () =>
      listingsWithCoords.map(
        (l) => [l.latitude as number, l.longitude as number] as LatLngExpression
      ),
    [listingsWithCoords]
  );

  // 🔁 تحريك الخريطة حسب النتائج / المدينة / العقار المحدد
  useEffect(() => {
    if (!map) return;

    // لو فيه عقار محدد من الكرت ومعاه إحداثيات → نطير عليه مباشرة
    if (activeListingId) {
      const target = listingsWithCoords.find((l) => l.id === activeListingId);
      if (target && typeof target.latitude === "number") {
        const pos: LatLngExpression = [target.latitude, target.longitude!];
        map.flyTo(pos, 15, { duration: 0.7 });
        return;
      }
    }

    // لو عندنا مجموعة إعلانات → fitBounds
    if (markerPositions.length > 0) {
      const bounds = L.latLngBounds(markerPositions);
      map.fitBounds(bounds, { padding: [40, 40] });
      return;
    }

    // لو ما فيه إعلانات لكن فيه مدينة مختارة
    if (selectedCity && CITY_CENTER[selectedCity]) {
      map.flyTo(CITY_CENTER[selectedCity], 11);
      return;
    }

    // رجوع للوضع الافتراضي
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  }, [map, markerPositions, selectedCity, activeListingId, listingsWithCoords]);

  // زر "موقعي"
  const handleLocateMe = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      alert("المتصفح لا يدعم تحديد الموقع.");
      return;
    }

    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next: LatLngExpression = [
          pos.coords.latitude,
          pos.coords.longitude,
        ];
        setUserPosition(next);
        map.flyTo(next, 14);
        setIsLocating(false);
      },
      (err) => {
        console.error("Geolocation error", err);
        setIsLocating(false);
        alert("تعذر تحديد موقعك. تأكد من السماح للموقع في المتصفح.");
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 30000,
      }
    );
  };

  // دالة وهمية للإبلاغ (تربطها لاحقاً بـ API)
  const handleReport = (listingId: string) => {
    // هنا لاحقاً تربطها بـ /api/report أو تفتح مودال
    console.log("Report listing:", listingId);
    alert("تم استلام بلاغك على هذا الإعلان، سيتم مراجعته. 🤝");
  };

  return (
    <>
      {/* نقاط العقارات */}
      {listingsWithCoords.map((listing) => {
        const position: LatLngExpression = [
          listing.latitude as number,
          listing.longitude as number,
        ];

        const niceTitle =
          listing.description && listing.description.trim().length > 0
            ? listing.description
            : listing.title;

        const locationLine =
          listing.city && listing.district
            ? `${listing.city} – ${listing.district}`
            : listing.city || listing.district || "";

        const priceText =
          typeof listing.price === "number"
            ? `${listing.price.toLocaleString()} ريال`
            : "السعر عند التواصل";

        const isActive = activeListingId === listing.id;

        return (
          <Marker
            key={listing.id}
            position={position}
            eventHandlers={{
              click: () => {
                onMarkerClick?.(listing.id);
              },
            }}
          >
            <Popup>
              <div dir="rtl" className="space-y-1 text-xs max-w-[220px]">
                {/* وصف / عنوان جميل */}
                <div className="font-bold text-[#002845] text-sm">
                  {niceTitle}
                </div>

                {/* المدينة + الحي */}
                {locationLine && (
                  <div className="text-[11px] text-slate-500">
                    <MapPin className="inline-block w-3 h-3 ml-1" />
                    {locationLine}
                  </div>
                )}

                {/* غرف – دورات مياه – مساحة */}
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-700">
                  {listing.area && (
                    <span className="inline-flex items-center gap-1">
                      <Square className="w-3 h-3" />
                      <span>{listing.area} م²</span>
                    </span>
                  )}
                  {listing.bedrooms && (
                    <span className="inline-flex items-center gap-1">
                      <BedDouble className="w-3 ه-3" />
                      <span>{listing.bedrooms} غرف</span>
                    </span>
                  )}
                  {listing.bathrooms && (
                    <span className="inline-flex items-center gap-1">
                      <Bath className="w-3 h-3" />
                      <span>{listing.bathrooms} دورات مياه</span>
                    </span>
                  )}
                </div>

                {/* السعر */}
                <div className="mt-1 text-[13px] font-extrabold text-[#002845]">
                  {priceText}
                </div>

                {/* زر تفاصيل + زر إبلاغ */}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <Link
                    href={`/listing/${listing.id}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 rounded-full bg-[#002845] text-white px-3 py-1 text-[11px] font-semibold hover:bg-[#00182b] transition"
                  >
                    <span>عرض التفاصيل</span>
                    <MapPin className="w-3 h-3" />
                  </Link>

                  <button
                    type="button"
                    onClick={() => handleReport(listing.id)}
                    className="inline-flex items-center gap-1 rounded-full bg-red-50 text-red-700 px-2 py-1 text-[10px] border border-red-200 hover:bg-red-100 transition"
                  >
                    <AlertTriangle className="w-3 h-3" />
                    <span>إبلاغ</span>
                  </button>
                </div>

                {/* إشارة بسيطة لو هو العقار النشط */}
                {isActive && (
                  <div className="mt-1 text-[10px] text-[#002845] font-semibold">
                    هذا العقار محدد من القائمة ↓
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* موقع المستخدم */}
      {userPosition && (
        <Marker position={userPosition}>
          <Popup>
            <div dir="rtl" className="text-xs">
              هذا هو موقعك التقريبي 🌍
            </div>
          </Popup>
        </Marker>
      )}

      {/* زر موقعي */}
      <div className="leaflet-top leaflet-right pointer-events-none">
        <div className="leaflet-control pointer-events-auto">
          <button
            type="button"
            onClick={handleLocateMe}
            className="rounded-full bg-[#002845] text-white text-xs font-bold px-3 py-1.5 shadow-md hover:bg-[#00182b] active:scale-95 transition"
          >
            {isLocating ? "جاري تحديد موقعي..." : "موقعي 📍"}
          </button>
        </div>
      </div>
    </>
  );
}

export default function MapClient(props: MapClientProps) {
  const { listings, selectedCity, activeListingId, onMarkerClick } = props;

  return (
    <div className="w-full h-full bg-[#fdf6db]">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        scrollWheelZoom={true}
        className="w-full h-full"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <MapInner
          listings={listings}
          selectedCity={selectedCity}
          activeListingId={activeListingId}
          onMarkerClick={onMarkerClick}
        />
      </MapContainer>
    </div>
  );
}
