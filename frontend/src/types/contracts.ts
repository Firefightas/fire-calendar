// TypeScript mirror of contracts/*.schema.json (owner: P1).
// Change only together with the schemas. P5 and P6 import from here.

export type RegionId = "rio_negro" | "california" | "romania" | (string & {});

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

export interface FireEventWindow {
  /** [west, south, east, north] padded cluster bounding box in degrees */
  bbox: [number, number, number, number];
  /** First detected hotspot date in this month's dominant cluster ("YYYY-MM-DD") */
  first_date: string;
  /** Last detected hotspot date in this month's dominant cluster ("YYYY-MM-DD") */
  last_date: string;
  /** Optional curated cloud-free pre-fire imagery date ("YYYY-MM-DD") */
  verified_before_date?: string;
  /** Optional curated cloud-free post-fire imagery date ("YYYY-MM-DD") */
  verified_after_date?: string;
  /** Optional human-readable event label */
  label?: string;
}

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
  /** Display as "IQR Anomaly Score (Z_IQR)". Never "sigma". */
  anomaly_z: number;
  unc_low: number;
  unc_high: number;
  source: CalendarSource;
  /** Optional dominant fire cluster for NASA GIBS before/after burn scar imagery. */
  peak_event?: FireEventWindow;
}

export interface Calendar {
  region_id: RegionId;
  area_label?: string;
  unit: "active_fire_cell_days";
  scale: "SNPP_VIIRS_EQ";
  is_mock: boolean;
  generated_at: string;
  first_month: string; // "YYYY-MM"
  last_month: string;
  baseline_years: [number, number];
  months: CalendarMonth[];
}

/** "Raw Unharmonized" toggle = naive satellite switch: VIIRS when present, else MODIS. */
export const rawValue = (m: CalendarMonth): number | null => m.viirs_raw ?? m.modis_raw;

export const ANOMALY_LABEL = "IQR Anomaly Score (Z_IQR)";

export interface MonthlyFactor {
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
  target_scale: "SNPP_VIIRS_EQ";
  fit_years: [number, number];
  test_years: [number, number];
  /** Held-out 2021–2025 error, cell-days: show in the UI validation badge. */
  test_mae: number;
  terra_only_factor: number;
  noaa20_factor: number;
  noaa21_factor: number;
  monthly_factors: MonthlyFactor[];
  test_mape?: number;
  raw_step_ratio?: number;
  harmonized_step_ratio?: number;
  diagnostics?: Record<string, unknown>;
}

export type AssetType = "village" | "farm" | "river" | "forest" | "grassland" | "none";

export interface SandboxCell {
  h3: string;
  lat: number;
  lon: number;
  /** ESA WorldCover code: 10 tree, 20 shrub, 30 grass, 40 crop, 50 built, 60 bare, 80 water, ... */
  landcover: number;
  /** 10→forest, 20/30→grassland, 40→farm, 50→village, 80→river, else none */
  asset_type: AssetType;
  burnable: boolean;
  elevation_m: number;
  slope_deg: number;
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

/** GET /api/nrt → GeoJSON FeatureCollection of points with these properties. */
export interface NrtHotspotProps {
  satellite: "terra" | "aqua" | "noaa20" | "noaa21";
  date: string;
  time: string;
  confidence_class: "low" | "nominal" | "high";
  frp: number;
  daynight: "D" | "N";
}

export const SANDBOX_BANNER =
  "Illustrative Counterfactual Scenario Tool — Driven by Harmonized FIRMS Fuel History, ESA WorldCover & Open-Meteo (Not an Operational Forecast)";
