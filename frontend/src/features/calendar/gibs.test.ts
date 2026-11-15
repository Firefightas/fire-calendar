import { describe, expect, it } from 'vitest'
import type { CalendarMonth, FireEventWindow } from '../../types/contracts.ts'
import {
  FLAGSHIP_EVENTS,
  GIBS_LAYERS,
  buildGibsWmsUrl,
  buildGibsWmtsTileSource,
  clampIsoDate,
  defaultDates,
  eventFor,
  layerFor,
  monthSpan,
  polygonBbox,
  sensorForDate,
  shiftIsoDate,
  targetBbox,
  viewBbox,
} from './gibs.ts'

function month(year: number, m: number, over: Partial<CalendarMonth> = {}): CalendarMonth {
  return {
    year,
    month: m,
    modis_raw: 10,
    viirs_raw: null,
    harmonized: 40,
    is_estimated: true,
    is_nrt: false,
    median_m: 30,
    iqr_m: 10,
    anomaly_z: 1,
    unc_low: 30,
    unc_high: 50,
    source: 'modis_terra_aqua',
    ...over,
  }
}

const event: FireEventWindow = { bbox: [-65, -39, -64, -38], first_date: '2017-01-03', last_date: '2017-01-28' }

describe('sensor and layer routing', () => {
  it('uses MODIS Terra before VIIRS imagery exists in GIBS', () => {
    expect(sensorForDate('2001-01-15')).toBe('modis_terra')
    // The record uses S-NPP from 2012, but GIBS has no S-NPP imagery until 24 Nov 2015.
    expect(sensorForDate('2013-08-22', 'viirs_snpp')).toBe('modis_terra')
    expect(sensorForDate('2015-11-23', 'viirs_snpp')).toBe('modis_terra')
  })

  it('uses VIIRS S-NPP from 24 Nov 2015 through July 2026', () => {
    expect(sensorForDate('2015-11-24', 'viirs_snpp')).toBe('viirs_snpp')
    expect(sensorForDate('2026-07-31', 'viirs_snpp')).toBe('viirs_snpp')
  })

  it('uses VIIRS NOAA-20 from August 2026 and for NOAA-sourced months', () => {
    expect(sensorForDate('2026-08-01', 'viirs_snpp')).toBe('viirs_noaa20')
    expect(sensorForDate('2026-11-10')).toBe('viirs_noaa20')
    expect(sensorForDate('2026-07-20', 'viirs_noaa21')).toBe('viirs_noaa20')
    // A NOAA-sourced month never reaches back before NOAA-20 imagery exists.
    expect(sensorForDate('2017-06-01', 'viirs_noaa20')).toBe('viirs_snpp')
  })

  it('maps each sensor and spectral mode to its GIBS layer id', () => {
    expect(layerFor('2001-01-15', 'true_color')).toBe('MODIS_Terra_CorrectedReflectance_TrueColor')
    expect(layerFor('2001-01-15', 'swir')).toBe('MODIS_Terra_CorrectedReflectance_Bands721')
    expect(layerFor('2020-09-10', 'true_color')).toBe('VIIRS_SNPP_CorrectedReflectance_TrueColor')
    expect(layerFor('2020-09-10', 'swir')).toBe('VIIRS_SNPP_CorrectedReflectance_BandsM11-I2-I1')
    expect(layerFor('2026-09-10', 'true_color')).toBe('VIIRS_NOAA20_CorrectedReflectance_TrueColor')
    expect(layerFor('2026-09-10', 'swir')).toBe('VIIRS_NOAA20_CorrectedReflectance_BandsM11-I2-I1')
    expect(Object.keys(GIBS_LAYERS)).toHaveLength(3)
  })
})

describe('dates', () => {
  it('shifts ISO dates across month and year ends', () => {
    expect(shiftIsoDate('2017-01-01', -20)).toBe('2016-12-12')
    expect(shiftIsoDate('2020-02-28', 2)).toBe('2020-03-01')
    expect(shiftIsoDate('2021-12-25', 10)).toBe('2022-01-04')
    expect(shiftIsoDate('not a date', 3)).toBe('not a date')
  })

  it('clamps', () => {
    expect(clampIsoDate('2000-01-01', '2000-11-01', '2026-11-14')).toBe('2000-11-01')
    expect(clampIsoDate('2027-01-01', '2000-11-01', '2026-11-14')).toBe('2026-11-14')
    expect(clampIsoDate('2010-05-05', '2000-11-01', '2026-11-14')).toBe('2010-05-05')
  })

  it('knows the first and last day of a month', () => {
    expect(monthSpan({ year: 2020, month: 2 })).toEqual({ first: '2020-02-01', last: '2020-02-29' })
    expect(monthSpan({ year: 2021, month: 12 })).toEqual({ first: '2021-12-01', last: '2021-12-31' })
  })

  it('defaults to 20 days before the first hotspot and 10 days after the last', () => {
    const d = defaultDates(month(2017, 1), event, '2026-11-14')
    expect(d.before).toBe('2016-12-14')
    expect(d.after).toBe('2017-02-07')
    expect(d.verified).toBe(false)
  })

  it('prefers verified dates and says so only when both are present', () => {
    const both = { ...event, verified_before_date: '2016-12-02', verified_after_date: '2017-02-01' }
    expect(defaultDates(month(2017, 1), both, '2026-11-14')).toMatchObject({
      before: '2016-12-02',
      after: '2017-02-01',
      verified: true,
    })
    const one = { ...event, verified_after_date: '2017-02-01' }
    expect(defaultDates(month(2017, 1), one, '2026-11-14')).toMatchObject({
      before: '2016-12-14',
      after: '2017-02-01',
      verified: false,
    })
  })

  it('falls back to the month itself when there is no event', () => {
    const d = defaultDates(month(2010, 6), null, '2026-11-14')
    expect(d.before).toBe('2010-05-12')
    expect(d.after).toBe('2010-07-10')
  })

  it('clamps to the first imagery day and to the last data day', () => {
    expect(defaultDates(month(2000, 11), null, '2026-11-14').before).toBe('2000-11-01')
    const latest = defaultDates(month(2026, 11), null, '2026-11-14')
    expect(latest.after).toBe('2026-11-14')
    expect(latest.max).toBe('2026-11-14')
  })
})

describe('events', () => {
  it('takes the event from the calendar row first', () => {
    expect(eventFor('rio_negro', month(2017, 1, { peak_event: event }))).toEqual({ event, origin: 'calendar' })
  })

  it('falls back to the built-in flagship months, per region', () => {
    expect(eventFor('rio_negro', month(2017, 1)).origin).toBe('builtin')
    expect(eventFor('california', month(2020, 9)).event?.verified_after_date).toBe('2020-11-05')
    expect(eventFor('california', month(2017, 1))).toEqual({ event: null, origin: 'none' })
    expect(eventFor('romania', month(2020, 9)).origin).toBe('none')
  })

  it('keeps every built-in window well-formed', () => {
    for (const months of Object.values(FLAGSHIP_EVENTS)) {
      for (const [ym, e] of Object.entries(months ?? {})) {
        expect(e.bbox[0]).toBeLessThan(e.bbox[2])
        expect(e.bbox[1]).toBeLessThan(e.bbox[3])
        expect(e.first_date.startsWith(ym)).toBe(true)
        expect(e.last_date.startsWith(ym)).toBe(true)
        expect(e.verified_before_date! < e.first_date).toBe(true)
        expect(e.verified_after_date! > e.last_date).toBe(true)
      }
    }
  })
})

describe('boxes', () => {
  const region = { center: [-65.6, -39.3] as [number, number] }
  const polygon: GeoJSON.Polygon = {
    type: 'Polygon',
    coordinates: [[[-65.2, -39.1], [-65.0, -39.1], [-65.0, -38.9], [-65.2, -38.9], [-65.2, -39.1]]],
  }

  it('reads the box of a polygon', () => {
    expect(polygonBbox(polygon)).toEqual([-65.2, -39.1, -65.0, -38.9])
    expect(polygonBbox({ type: 'Polygon', coordinates: [] })).toBeNull()
  })

  it('prefers the drawn area, then the event, then the region centre', () => {
    expect(targetBbox(polygon, event, region)).toEqual({ bbox: [-65.2, -39.1, -65.0, -38.9], origin: 'drawn_area' })
    expect(targetBbox(null, event, region)).toEqual({ bbox: event.bbox, origin: 'event' })
    const centre = targetBbox(null, null, region)
    expect(centre.origin).toBe('region_center')
    expect(centre.bbox[2] - centre.bbox[0]).toBeCloseTo(0.8)
    expect(centre.bbox[3] - centre.bbox[1]).toBeCloseTo(0.6)
  })

  it('never requests less than 0.60° × 0.45°, and keeps the centre', () => {
    const [w, s, e, n] = viewBbox([-65.01, -39.01, -64.99, -38.99])
    expect(e - w).toBeGreaterThanOrEqual(0.6)
    expect(n - s).toBeGreaterThanOrEqual(0.45 - 1e-9)
    expect((w + e) / 2).toBeCloseTo(-65, 3)
    expect((s + n) / 2).toBeCloseTo(-39, 3)
  })

  it('pads by 1.25 and covers a 16:9 patch of ground', () => {
    const [w, s, e, n] = viewBbox([-66, -40, -62, -39])
    // 4° of longitude is the long side: 5° after padding, latitude follows from the aspect.
    expect(e - w).toBeCloseTo(5, 3)
    const ground = ((e - w) * Math.cos(((s + n) / 2) * (Math.PI / 180))) / (n - s)
    expect(ground).toBeCloseTo(16 / 9, 2)
    // A tall box is widened instead of cropped.
    const tall = viewBbox([-65.1, -41, -64.9, -38])
    expect(tall[3] - tall[1]).toBeCloseTo(3.75, 3)
    expect(tall[2] - tall[0]).toBeGreaterThan(3.75)
  })
})

describe('URLs', () => {
  it('builds a WMS GetMap URL', () => {
    expect(buildGibsWmsUrl('MODIS_Terra_CorrectedReflectance_Bands721', [-66, -40, -62, -38], '2001-02-07')).toBe(
      'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap' +
        '&LAYERS=MODIS_Terra_CorrectedReflectance_Bands721&SRS=EPSG:4326&BBOX=-66,-40,-62,-38' +
        '&WIDTH=960&HEIGHT=540&FORMAT=image/jpeg&TIME=2001-02-07',
    )
  })

  it('builds a WMTS tile source that stops at level 9', () => {
    const source = buildGibsWmtsTileSource('VIIRS_SNPP_CorrectedReflectance_TrueColor', '2020-09-10')
    expect(source.type).toBe('raster')
    expect(source.maxzoom).toBe(9)
    expect(source.tiles).toEqual([
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/2020-09-10/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpeg',
    ])
  })
})
