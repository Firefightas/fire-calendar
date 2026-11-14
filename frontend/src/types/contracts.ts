// TypeScript mirror of contracts/*.schema.json (owner: P1).
// Change only together with the schemas. P5 and P6 import from here.

export type RegionId = string;

export interface Region {
  id: RegionId;
  name: string;
  country: string;
  hemisphere: "north" | "south";
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
  /** [lon, lat] */
  center: [number, number];
  default_zoom: number;
  note?: string;
}

export interface RegionsFile {
  regions: Region[];
}

export type CalendarSource =
  | "modis_terra"
  | "modis_terra_aqua"
  | "viirs_snpp"
  | "viirs_noaa20"
  | "viirs_noaa21";

export interface CalendarMonth {
  year: number;
  month: number; // 1..12
  modis_raw: number | null;
  viirs_raw: number | null;
  /** Value on the common S-NPP-VIIRS-equivalent scale (default view). */
  harmonized: number;
  /** Converted from MODIS: show with a marker (hatching/dot). */
  is_estimated: boolean;
  /** Near-real-time data, may still change. */
  is_nrt: boolean;
  median_m: number;
  iqr_m: number;
  anomaly_z: number;
  unc_low: number;
  unc_high: number;
  source: CalendarSource;
}

export interface Calendar {
  region_id: RegionId;
  area_label?: string;
  unit: "active_fire_cell_days";
  scale: "viirs_snpp_equivalent";
  is_mock: boolean;
  generated_at: string;
  first_month: string; // "YYYY-MM"
  last_month: string;
  baseline_years?: [number, number];
  months: CalendarMonth[];
}

/** Raw toggle = naive satellite switch: VIIRS when present, else MODIS. */
export const rawValue = (m: CalendarMonth): number | null => m.viirs_raw ?? m.modis_raw;

export interface CalibrationMonth {
  month: number;
  factor: number;
  cv: number;
  n_years: number;
  fallback?: boolean;
}

export interface Calibration {
  region_id: RegionId;
  is_mock: boolean;
  generated_at: string;
  method: string;
  reference_sensor: "viirs_snpp";
  fit_years: [number, number];
  test_years: [number, number];
  sensors: {
    sensor: "modis_terra" | "modis_aqua" | "modis_terra_aqua" | "viirs_noaa20" | "viirs_noaa21";
    overlap?: [string, string];
    monthly: CalibrationMonth[];
  }[];
  validation: {
    test_mae: number;
    test_mape: number;
    raw_step_ratio: number;
    harmonized_step_ratio: number;
  };
}

export interface SandboxCell {
  h3: string;
  /** ESA WorldCover code */
  landcover: number;
  burnable: boolean;
  elevation_m: number;
  burn_count: number;
  years_since_last_fire: number | null;
}

export interface SandboxGrid {
  region_id: RegionId;
  is_mock: boolean;
  h3_resolution: 7;
  landcover_classes?: Record<string, string>;
  cells: SandboxCell[];
}

export interface AreaQuery {
  region_id: RegionId;
  polygon: GeoJSON.Polygon;
  start: string; // "YYYY-MM"
  end: string;
  area_label?: string;
}
