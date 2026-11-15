import { describe, expect, it } from 'vitest'
import { compassPoint, parseCurrentWind, scenarioCentre } from './openMeteo.ts'

describe('Open-Meteo wind', () => {
  it('reads the current block', () => {
    const body = {
      current: { time: '2026-11-15T09:00', wind_speed_10m: 18.4, wind_direction_10m: 250, wind_gusts_10m: 35.6 },
    }
    expect(parseCurrentWind(body, -39.3, -65.6)).toEqual({
      fromDeg: 250,
      speedKmh: 18.4,
      gustKmh: 35.6,
      time: '2026-11-15T09:00',
      lat: -39.3,
      lon: -65.6,
    })
  })

  it('tolerates a missing gust and rejects a missing speed', () => {
    expect(parseCurrentWind({ current: { wind_speed_10m: 5, wind_direction_10m: 360 } }, 0, 0)).toMatchObject({
      fromDeg: 0,
      gustKmh: 0,
    })
    expect(() => parseCurrentWind({ current: { wind_direction_10m: 10 } }, 0, 0)).toThrow()
    expect(() => parseCurrentWind({}, 0, 0)).toThrow()
    expect(() => parseCurrentWind(null, 0, 0)).toThrow()
  })

  it('names compass points', () => {
    expect(compassPoint(0)).toBe('N')
    expect(compassPoint(90)).toBe('E')
    expect(compassPoint(250)).toBe('WSW')
    expect(compassPoint(359)).toBe('N')
  })

  it('centres on the drawn area, else on the grid', () => {
    const area: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [10, 40],
          [12, 40],
          [12, 42],
          [10, 42],
          [10, 40],
        ],
      ],
    }
    expect(scenarioCentre(area, [])).toEqual([41, 11])
    expect(
      scenarioCentre(null, [
        { lat: 1, lon: 2 },
        { lat: 3, lon: 6 },
      ]),
    ).toEqual([2, 4])
  })
})
