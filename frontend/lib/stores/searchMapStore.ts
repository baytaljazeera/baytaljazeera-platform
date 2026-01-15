import { create } from 'zustand';
import { COUNTRY_PRESETS, CITY_PRESETS, DEFAULT_LOCATION, GeoPreset } from '../geo-presets';

// Helper to validate coordinates
const isValidCoords = (lat: number, lng: number): boolean => {
  return typeof lat === 'number' && typeof lng === 'number' &&
    !isNaN(lat) && !isNaN(lng) &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180;
};

const isValidZoom = (zoom: number): boolean => {
  return typeof zoom === 'number' && !isNaN(zoom) && zoom >= 1 && zoom <= 20;
};

// Safe default
const SAFE_CENTER: [number, number] = [24.7136, 46.6753]; // الرياض
const SAFE_ZOOM = 10;

interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

type MapTargetType = 'country' | 'city' | 'listing' | 'default';

interface MapTarget {
  type: MapTargetType;
  center: [number, number];
  zoom: number;
  bounds?: MapBounds | null;
  id?: string;
}

interface SearchMapStore {
  activeListingId: string | null;
  hoveredListingId: string | null;
  mapBounds: MapBounds | null;
  mapCenter: [number, number];
  mapZoom: number;
  mapVersion: number;
  
  setActiveListingId: (id: string | null) => void;
  setHoveredListingId: (id: string | null) => void;
  setMapBounds: (bounds: MapBounds | null) => void;
  setMapCenter: (center: [number, number]) => void;
  setMapZoom: (zoom: number) => void;
  
  flyToCountry: (countryCode: string) => void;
  flyToCity: (cityName: string) => void;
  flyToListing: (lat: number, lng: number, id: string) => void;
  flyToCoords: (lat: number, lng: number, zoom: number) => void;
  resetToDefault: () => void;
}

export const useSearchMapStore = create<SearchMapStore>((set, get) => ({
  activeListingId: null,
  hoveredListingId: null,
  mapBounds: null,
  mapCenter: DEFAULT_LOCATION.center,
  mapZoom: DEFAULT_LOCATION.zoom,
  mapVersion: 0,
  
  setActiveListingId: (id) => set({ activeListingId: id }),
  setHoveredListingId: (id) => set({ hoveredListingId: id }),
  setMapBounds: (bounds) => set({ mapBounds: bounds }),
  setMapCenter: (center) => {
    if (isValidCoords(center[0], center[1])) {
      set({ mapCenter: center, mapVersion: get().mapVersion + 1 });
    }
  },
  setMapZoom: (zoom) => {
    if (isValidZoom(zoom)) {
      set({ mapZoom: zoom });
    }
  },
  
  flyToCountry: (countryCode: string) => {
    const preset = COUNTRY_PRESETS[countryCode];
    if (preset && isValidCoords(preset.center[0], preset.center[1])) {
      set({ 
        mapCenter: preset.center, 
        mapZoom: isValidZoom(preset.zoom) ? preset.zoom : SAFE_ZOOM,
        mapBounds: preset.bounds || null,
        mapVersion: get().mapVersion + 1
      });
    }
  },
  
  flyToCity: (cityName: string) => {
    const preset = CITY_PRESETS[cityName];
    if (preset && isValidCoords(preset.center[0], preset.center[1])) {
      set({ 
        mapCenter: preset.center, 
        mapZoom: isValidZoom(preset.zoom) ? preset.zoom : SAFE_ZOOM,
        mapVersion: get().mapVersion + 1
      });
    }
  },
  
  flyToListing: (lat, lng, id) => {
    if (isValidCoords(lat, lng)) {
      set({ 
        mapCenter: [lat, lng], 
        activeListingId: id,
        mapZoom: 15,
        mapVersion: get().mapVersion + 1
      });
    }
  },
  
  flyToCoords: (lat, lng, zoom) => {
    if (isValidCoords(lat, lng)) {
      set({ 
        mapCenter: [lat, lng], 
        mapZoom: isValidZoom(zoom) ? zoom : SAFE_ZOOM,
        mapVersion: get().mapVersion + 1
      });
    }
  },
  
  resetToDefault: () => {
    set({ 
      mapCenter: DEFAULT_LOCATION.center, 
      mapZoom: DEFAULT_LOCATION.zoom,
      mapBounds: null,
      mapVersion: get().mapVersion + 1
    });
  }
}));
