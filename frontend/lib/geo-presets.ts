export interface GeoPreset {
  center: [number, number];
  zoom: number;
  bounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
}

export const COUNTRY_PRESETS: Record<string, GeoPreset> = {
  SA: {
    center: [23.8859, 45.0792],
    zoom: 5,
    bounds: { north: 32.15, south: 16.38, east: 55.67, west: 34.57 }
  },
  AE: {
    center: [25.2048, 55.2708],
    zoom: 7,
    bounds: { north: 26.08, south: 22.63, east: 56.38, west: 51.58 }
  },
  KW: {
    center: [29.3759, 47.9774],
    zoom: 9,
    bounds: { north: 30.1, south: 28.52, east: 48.43, west: 46.55 }
  },
  QA: {
    center: [25.2854, 51.531],
    zoom: 9,
    bounds: { north: 26.18, south: 24.47, east: 51.68, west: 50.75 }
  },
  BH: {
    center: [26.0667, 50.5577],
    zoom: 10,
    bounds: { north: 26.33, south: 25.79, east: 50.82, west: 50.38 }
  },
  OM: {
    center: [21.4735, 55.9754],
    zoom: 6,
    bounds: { north: 26.39, south: 16.65, east: 59.84, west: 52.0 }
  },
  EG: {
    center: [26.8206, 30.8025],
    zoom: 6,
    bounds: { north: 31.67, south: 22.0, east: 36.9, west: 24.7 }
  },
  LB: {
    center: [33.8547, 35.8623],
    zoom: 8,
    bounds: { north: 34.69, south: 33.05, east: 36.62, west: 35.1 }
  },
  TR: {
    center: [38.9637, 35.2433],
    zoom: 6,
    bounds: { north: 42.11, south: 35.81, east: 44.82, west: 25.66 }
  }
};

export const CITY_PRESETS: Record<string, GeoPreset> = {
  "الرياض": { center: [24.7136, 46.6753], zoom: 11 },
  "جدة": { center: [21.4858, 39.1925], zoom: 11 },
  "مكة": { center: [21.4225, 39.8262], zoom: 12 },
  "المدينة": { center: [24.5247, 39.5692], zoom: 12 },
  "الدمام": { center: [26.4207, 50.0888], zoom: 12 },
  "دبي": { center: [25.2048, 55.2708], zoom: 11 },
  "أبوظبي": { center: [24.4539, 54.3773], zoom: 11 },
  "الكويت": { center: [29.3759, 47.9774], zoom: 11 },
  "الدوحة": { center: [25.2854, 51.531], zoom: 12 },
  "المنامة": { center: [26.2285, 50.5860], zoom: 13 },
  "مسقط": { center: [23.5880, 58.3829], zoom: 12 },
  "القاهرة": { center: [30.0444, 31.2357], zoom: 11 },
  "بيروت": { center: [33.8938, 35.5018], zoom: 13 },
  "إسطنبول": { center: [41.0082, 28.9784], zoom: 10 },
  "أنقرة": { center: [39.9334, 32.8597], zoom: 11 }
};

export const DEFAULT_LOCATION: GeoPreset = {
  center: [23.8859, 45.0792],
  zoom: 5
};
