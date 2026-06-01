// ─────────────────────────────────────────────────────────────────
// Shared map style definitions for the platform's Leaflet maps.
// Owner asked: "Customers want to see the real world like Google
// Maps — let them toggle between street and satellite imagery in
// both the listing view and the location picker."
//
// Tile sources are all free + commercial-OK with attribution:
//   - OSM Streets      → standard street view (current default)
//   - Esri Imagery     → satellite photos worldwide, no API key
//   - CARTO Voyager    → cleaner street design (gold accents look
//                        better than OSM's busy yellow roads)
//   - Hybrid           → Esri Imagery + Stamen Toner Labels overlay
//                        so the satellite isn't unreadable in cities
// ─────────────────────────────────────────────────────────────────

export type MapStyleKey =
  | "streets"      // OSM standard (busy, detailed, all labels)
  | "voyager"      // CARTO clean — easier on the eyes, premium feel
  | "satellite"    // Esri aerial — pure photo, no labels
  | "hybrid"       // Satellite + street labels overlay
  | "terrain";     // OpenTopoMap — elevation contours, good for rural / mountain plots

export interface MapStyleConfig {
  key: MapStyleKey;
  label: string;        // Arabic label shown in the toggle pill
  hint: string;         // tooltip
  url: string;          // primary tile URL
  overlayUrl?: string;  // optional second layer (for hybrid labels)
  attribution: string;
  maxZoom: number;
  subdomains?: string;
}

export const MAP_STYLES: Record<MapStyleKey, MapStyleConfig> = {
  streets: {
    key: "streets",
    label: "خريطة",
    hint: "العرض الكلاسيكي (شوارع وأسماء أحياء)",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
    subdomains: "abc",
  },
  voyager: {
    key: "voyager",
    label: "خريطة هادئة",
    hint: "تصميم أنظف وأخف ألواناً — مناسب لإبراز موقع العقار",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> · © <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20,
    subdomains: "abcd",
  },
  terrain: {
    key: "terrain",
    label: "تضاريس",
    hint: "صور طبيعية مع خطوط الارتفاع — مفيدة للأراضي والمزارع",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '© <a href="https://opentopomap.org">OpenTopoMap</a> · © <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    maxZoom: 17,
    subdomains: "abc",
  },
  satellite: {
    key: "satellite",
    label: "قمر صناعي",
    hint: "صور حقيقية للأرض من الأعلى — كما تراها على Google Maps",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    maxZoom: 19,
  },
  hybrid: {
    key: "hybrid",
    label: "هجين",
    hint: "صور القمر الصناعي + أسماء الشوارع فوقها",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    overlayUrl: "https://stamen-tiles-{s}.a.ssl.fastly.net/toner-labels/{z}/{x}/{y}.png",
    attribution: "Imagery © Esri · Labels © Stamen Design",
    maxZoom: 18,
    subdomains: "abcd",
  },
};

/** Order the toggle pills render in (full set — used in the
 *  location picker when adding a listing so the operator has every
 *  option). */
export const MAP_STYLE_ORDER: MapStyleKey[] = ["streets", "voyager", "satellite", "hybrid", "terrain"];

/** Compact set — used in customer-facing browse maps where we don't
 *  want to overwhelm with too many choices. Just the essentials. */
export const MAP_STYLE_ORDER_COMPACT: MapStyleKey[] = ["streets", "satellite", "hybrid"];

/** Persist + restore the user's choice across maps + sessions. */
const STORAGE_KEY = "bj.map.style.v1";

export function loadMapStylePreference(fallback: MapStyleKey = "streets"): MapStyleKey {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v && (Object.keys(MAP_STYLES) as MapStyleKey[]).includes(v as MapStyleKey)) {
      return v as MapStyleKey;
    }
  } catch { /* private mode etc. */ }
  return fallback;
}

export function saveMapStylePreference(style: MapStyleKey) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, style); } catch { /* ignore */ }
}
