// NASA GIBS imagery for the before/after burn scar comparison: which layer, which dates,
// which box. Pure logic (no React, no network). Layer ids and their date ranges were read
// from the GIBS WMTS capabilities and checked against the WMS endpoint on 15 Nov 2026.
import type { CalendarMonth, CalendarSource, FireEventWindow, Region, RegionId } from '../../types/contracts.ts'
import { monthKey } from './model.ts'

export type Spectral = 'swir' | 'true_color'
export type GibsSensor = 'modis_terra' | 'viirs_snpp' | 'viirs_noaa20'
/** [west, south, east, north] in degrees. */
export type Bbox = [number, number, number, number]

export const SPECTRAL_LABEL: Record<Spectral, string> = {
  swir: 'SWIR Burn Scar (False Color)',
  true_color: 'True Color',
}

export const SENSOR_LABEL: Record<GibsSensor, string> = {
  modis_terra: 'MODIS Terra',
  viirs_snpp: 'VIIRS S-NPP',
  viirs_noaa20: 'VIIRS NOAA-20',
}

/** GIBS layer ids. The VIIRS short-wave infrared layers are spelled with hyphens (M11-I2-I1). */
export const GIBS_LAYERS: Record<GibsSensor, Record<Spectral, string>> = {
  modis_terra: {
    true_color: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    swir: 'MODIS_Terra_CorrectedReflectance_Bands721',
  },
  viirs_snpp: {
    true_color: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
    swir: 'VIIRS_SNPP_CorrectedReflectance_BandsM11-I2-I1',
  },
  viirs_noaa20: {
    true_color: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor',
    swir: 'VIIRS_NOAA20_CorrectedReflectance_BandsM11-I2-I1',
  },
}

/** The record starts here; MODIS Terra imagery exists from this date on. */
export const FIRST_IMAGERY_DATE = '2000-11-01'
/**
 * First day with VIIRS S-NPP corrected-reflectance imagery in GIBS. The hotspot record uses
 * S-NPP from 20 Jan 2012, but GIBS serves no S-NPP imagery before this date (blank tiles),
 * so earlier dates are shown with MODIS Terra.
 */
export const SNPP_IMAGERY_FROM = '2015-11-24'
/** From here on the imagery is NOAA-20: S-NPP is no longer the reference sensor of the record. */
export const NOAA20_IMAGERY_FROM = '2026-08-01'
/** First day with NOAA-20 imagery in GIBS. */
const NOAA20_IMAGERY_FIRST = '2018-01-05'

/**
 * Sensor whose imagery is shown for one date. Chosen per image date, so a "before" and an
 * "after" on either side of a changeover each use a sensor that has imagery that day.
 * `source` is the month's calendar source: a NOAA-20/21 month is shown with NOAA-20.
 */
export function sensorForDate(date: string, source?: CalendarSource): GibsSensor {
  if (date < SNPP_IMAGERY_FROM) return 'modis_terra'
  if (date >= NOAA20_IMAGERY_FROM) return 'viirs_noaa20'
  if ((source === 'viirs_noaa20' || source === 'viirs_noaa21') && date >= NOAA20_IMAGERY_FIRST) return 'viirs_noaa20'
  return 'viirs_snpp'
}

export const layerFor = (date: string, spectral: Spectral, source?: CalendarSource): string =>
  GIBS_LAYERS[sensorForDate(date, source)][spectral]

const DAY_MS = 86_400_000

/** "2017-01-01", -20 → "2016-12-12". Returns the input unchanged when it is not an ISO date. */
export function shiftIsoDate(iso: string, days: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(t)) return iso
  return new Date(t + days * DAY_MS).toISOString().slice(0, 10)
}

/** ISO dates compare as strings. */
export const clampIsoDate = (iso: string, min: string, max: string): string => (iso < min ? min : iso > max ? max : iso)

export const todayIso = (now: Date = new Date()): string => now.toISOString().slice(0, 10)

/** First and last day of a calendar month. */
export function monthSpan(m: { year: number; month: number }): { first: string; last: string } {
  const first = `${monthKey(m)}-01`
  const last = new Date(Date.UTC(m.year, m.month, 0)).toISOString().slice(0, 10)
  return { first, last }
}

/**
 * Built-in windows for the flagship months, used when the calendar row has no `peak_event`.
 * `bbox`, `first_date` and `last_date` are the dominant hotspot cluster of that month in the
 * region's `points.parquet` (0.1 degree grid, cells connected to the densest one). The two
 * verified dates were picked by looking at the GIBS SWIR imagery of that box day by day.
 */
export const FLAGSHIP_EVENTS: Partial<Record<RegionId, Record<string, FireEventWindow>>> = {
  rio_negro: {
    '2017-01': {
      bbox: [-65.165, -39.087, -63.152, -37.515],
      first_date: '2017-01-01',
      last_date: '2017-01-31',
      verified_before_date: '2016-12-02',
      verified_after_date: '2017-02-01',
    },
    '2016-12': {
      bbox: [-64.785, -40.733, -62.8, -38.34],
      first_date: '2016-12-05',
      last_date: '2016-12-31',
      verified_before_date: '2016-12-02',
      verified_after_date: '2017-01-13',
    },
    '2001-01': {
      bbox: [-66.805, -39.113, -63.828, -37.501],
      first_date: '2001-01-01',
      last_date: '2001-01-31',
      verified_before_date: '2000-12-07',
      verified_after_date: '2001-02-07',
    },
  },
  california: {
    '2021-08': {
      bbox: [-121.585, 39.89, -120.395, 40.633],
      first_date: '2021-08-01',
      last_date: '2021-08-31',
      verified_before_date: '2021-07-06',
      verified_after_date: '2021-10-02',
    },
    '2020-09': {
      bbox: [-119.536, 36.978, -119.01, 37.633],
      first_date: '2020-09-01',
      last_date: '2020-09-30',
      verified_before_date: '2020-08-06',
      verified_after_date: '2020-11-05',
    },
  },
}

export type EventOrigin = 'calendar' | 'builtin' | 'none'

/** The fire event window of a month: from the calendar row, else the built-in flagship table, else none. */
export function eventFor(
  regionId: RegionId,
  month: CalendarMonth,
): { event: FireEventWindow | null; origin: EventOrigin } {
  if (month.peak_event) return { event: month.peak_event, origin: 'calendar' }
  const builtin = FLAGSHIP_EVENTS[regionId]?.[monthKey(month)]
  return builtin ? { event: builtin, origin: 'builtin' } : { event: null, origin: 'none' }
}

export const BEFORE_LEAD_DAYS = 20
export const AFTER_LAG_DAYS = 10

export interface ImageryDates {
  before: string
  after: string
  /** True when both dates are curated cloud-free dates rather than offsets from the fire dates. */
  verified: boolean
  /** Dates can be stepped inside [min, max]. */
  min: string
  max: string
}

/**
 * Default imagery dates of a month: the verified dates when the event has them, otherwise
 * 20 days before the first hotspot and 10 days after the last one (the month's first and
 * last day when there is no event). Clamped to the days that have imagery.
 */
export function defaultDates(month: CalendarMonth, event: FireEventWindow | null, maxDate: string): ImageryDates {
  const span = monthSpan(month)
  const before = event?.verified_before_date ?? shiftIsoDate(event?.first_date ?? span.first, -BEFORE_LEAD_DAYS)
  const after = event?.verified_after_date ?? shiftIsoDate(event?.last_date ?? span.last, AFTER_LAG_DAYS)
  const max = maxDate < FIRST_IMAGERY_DATE ? FIRST_IMAGERY_DATE : maxDate
  return {
    before: clampIsoDate(before, FIRST_IMAGERY_DATE, max),
    after: clampIsoDate(after, FIRST_IMAGERY_DATE, max),
    verified: Boolean(event?.verified_before_date && event.verified_after_date),
    min: FIRST_IMAGERY_DATE,
    max,
  }
}

export const IMAGE_WIDTH = 960
export const IMAGE_HEIGHT = 540
export const BBOX_PAD = 1.25
export const MIN_LON_SPAN = 0.6
export const MIN_LAT_SPAN = 0.45
/** Box around the region centre when nothing better is known. */
const CENTER_BOX: [number, number] = [0.8, 0.6]

const round4 = (v: number): number => Math.round(v * 10_000) / 10_000

export function polygonBbox(polygon: GeoJSON.Polygon): Bbox | null {
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const ring of polygon.coordinates) {
    for (const [lon, lat] of ring) {
      w = Math.min(w, lon)
      e = Math.max(e, lon)
      s = Math.min(s, lat)
      n = Math.max(n, lat)
    }
  }
  return Number.isFinite(w) && Number.isFinite(s) && Number.isFinite(e) && Number.isFinite(n) ? [w, s, e, n] : null
}

export type BboxOrigin = 'drawn_area' | 'event' | 'region_center'

/** What the imagery should frame: the drawn area, else the month's fire event, else the region centre. */
export function targetBbox(
  polygon: GeoJSON.Polygon | null,
  event: FireEventWindow | null,
  region: Pick<Region, 'center'>,
): { bbox: Bbox; origin: BboxOrigin } {
  const drawn = polygon ? polygonBbox(polygon) : null
  if (drawn) return { bbox: drawn, origin: 'drawn_area' }
  if (event) return { bbox: event.bbox, origin: 'event' }
  const [lon, lat] = region.center
  return {
    bbox: [lon - CENTER_BOX[0] / 2, lat - CENTER_BOX[1] / 2, lon + CENTER_BOX[0] / 2, lat + CENTER_BOX[1] / 2],
    origin: 'region_center',
  }
}

/**
 * The box actually requested: the target padded 1.25×, at least 0.60° × 0.45° (the imagery
 * is 250–375 m per pixel, so a smaller box would only be blown-up pixels), then widened on
 * one axis so the ground it covers has the image's 16:9 shape and nothing is stretched.
 */
export function viewBbox(target: Bbox, aspect: number = IMAGE_WIDTH / IMAGE_HEIGHT): Bbox {
  const [w, s, e, n] = target
  const cx = (w + e) / 2
  const cy = Math.min(Math.max((s + n) / 2, -85), 85)
  let lon = Math.max((e - w) * BBOX_PAD, MIN_LON_SPAN)
  let lat = Math.max((n - s) * BBOX_PAD, MIN_LAT_SPAN)
  const k = Math.cos((cy * Math.PI) / 180)
  if ((lon * k) / lat < aspect) lon = (lat * aspect) / k
  else lat = (lon * k) / aspect
  return [round4(cx - lon / 2), round4(cy - lat / 2), round4(cx + lon / 2), round4(cy + lat / 2)]
}

export const GIBS_WMS_ENDPOINT = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi'

/** Unauthenticated GIBS WMS GetMap URL for one layer, box and day. */
export function buildGibsWmsUrl(
  layer: string,
  bbox: Bbox,
  date: string,
  width: number = IMAGE_WIDTH,
  height: number = IMAGE_HEIGHT,
): string {
  return (
    `${GIBS_WMS_ENDPOINT}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=${layer}&SRS=EPSG:4326` +
    `&BBOX=${bbox.join(',')}&WIDTH=${width}&HEIGHT=${height}&FORMAT=image/jpeg&TIME=${date}`
  )
}

export const GIBS_TILE_MATRIX_SET = 'GoogleMapsCompatible_Level9'
export const GIBS_MAX_ZOOM = 9

/** MapLibre raster source for a GIBS layer on one day. Level 9 is the deepest tile level these layers have. */
export function buildGibsWmtsTileSource(layer: string, date: string) {
  return {
    type: 'raster' as const,
    tiles: [
      `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${date}/${GIBS_TILE_MATRIX_SET}/{z}/{y}/{x}.jpeg`,
    ],
    tileSize: 256,
    minzoom: 0,
    maxzoom: GIBS_MAX_ZOOM,
    attribution: 'Imagery: NASA EOSDIS GIBS',
  }
}
