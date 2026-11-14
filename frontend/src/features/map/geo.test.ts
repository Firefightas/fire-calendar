import { getResolution } from 'h3-js'
import { describe, expect, it } from 'vitest'
import type { NrtHotspotProps } from '../../types/contracts.ts'
import {
  bboxPolygon,
  boxAround,
  clampBbox,
  cleanPolygon,
  isValidLatLon,
  polygonAreaKm2,
  polygonBbox,
  polygonInBbox,
} from './geo.ts'
import type { Bbox } from './geo.ts'
import { binHotspots } from './hexbin.ts'

const RIO_NEGRO: Bbox = [-71.9, -42.0, -62.8, -37.5]

describe('polygon helpers', () => {
  it('builds a closed ring from a bbox and reads the bbox back', () => {
    const p = bboxPolygon(RIO_NEGRO)
    expect(p.coordinates[0]).toHaveLength(5)
    expect(p.coordinates[0][0]).toEqual(p.coordinates[0][4])
    expect(polygonBbox(p)).toEqual(RIO_NEGRO)
  })

  it('accepts areas inside the region and rejects any vertex outside', () => {
    expect(polygonInBbox(boxAround(-39.3, -65.6, 10), RIO_NEGRO)).toBe(true)
    expect(polygonInBbox(boxAround(-37.5, -65.6, 10), RIO_NEGRO)).toBe(false)
  })

  it('rounds coordinates and closes an open ring', () => {
    const open: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[1.1234567, 2], [3, 2], [3, 4]]] }
    expect(cleanPolygon(open).coordinates[0]).toEqual([[1.12346, 2], [3, 2], [3, 4], [1.12346, 2]])
  })

  it('measures area: a 20 km box is about 400 km² in either hemisphere', () => {
    for (const [lat, lon] of [[-39.3, -65.6], [45.9, 25.0]]) {
      const km2 = polygonAreaKm2(boxAround(lat, lon, 10))
      expect(km2).toBeGreaterThan(390)
      expect(km2).toBeLessThan(410)
    }
  })

  it('validates coordinates and clamps a viewport to a legal bbox', () => {
    expect(isValidLatLon(-39.3, -65.6)).toBe(true)
    expect(isValidLatLon(91, 0)).toBe(false)
    expect(isValidLatLon(Number.NaN, 0)).toBe(false)
    expect(clampBbox([-200, -95, 190, 91])).toEqual([-180, -90, 180, 90])
  })
})

describe('binHotspots', () => {
  const props = (satellite: NrtHotspotProps['satellite'], frp: number): NrtHotspotProps => ({
    satellite,
    date: '2026-11-14',
    time: '17:30',
    confidence_class: 'nominal',
    frp,
    daynight: 'D',
  })
  const point = (lon: number, lat: number, p: NrtHotspotProps): GeoJSON.Feature<GeoJSON.Point, NrtHotspotProps> => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: p,
  })

  it('groups detections into res-7 hexes and sums FRP', () => {
    const bins = binHotspots({
      type: 'FeatureCollection',
      features: [
        point(-65.6, -39.3, props('noaa20', 5)),
        point(-65.6001, -39.3001, props('noaa21', 7)),
        point(-64.0, -40.0, props('aqua', 3)),
      ],
    })
    expect(bins).toHaveLength(2)
    expect(bins.find((b) => b.count === 2)).toMatchObject({ frpSum: 12, satellites: ['noaa20', 'noaa21'] })
    expect(getResolution(bins[0].h3)).toBe(7)
  })
})
