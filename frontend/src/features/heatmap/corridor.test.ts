import { describe, expect, it } from 'vitest'
import type { CorridorWeather, LonLat } from '../../api/types'
import { makeRoute } from '../../test/fixtures'
import {
  corridorFeatures,
  corridorPaths,
  corridorStart,
  groundRadius,
  secondsAfterDeparture,
  truckPosition,
  uniformIntensity,
} from './corridor'

describe('truckPosition', () => {
  // Three vertices one hour apart: [0,0] → [1,0] → [2,0].
  const route = makeRoute()

  it.each([
    [-60, [0, 0], 'waiting'],
    [0, [0, 0], 'driving'],
    [1800, [0.5, 0], 'driving'],
    [5400, [1.5, 0], 'driving'],
    [7200, [2, 0], 'arrived'],
    [99999, [2, 0], 'arrived'],
  ])('at %i s the truck is at %j (%s)', (seconds, position, status) => {
    const result = truckPosition(route, seconds)
    expect(result.status).toBe(status)
    expect(result.position[0]).toBeCloseTo((position as number[])[0], 6)
    expect(result.position[1]).toBeCloseTo((position as number[])[1], 6)
  })
})

describe('corridorPaths', () => {
  it('thins long routes but keeps both ends', () => {
    const geometry: LonLat[] = Array.from({ length: 1000 }, (_, i) => [i / 100, 40])
    const [path] = corridorPaths([makeRoute({ geometry })])

    expect(path.length).toBeLessThanOrEqual(401)
    expect(path[0]).toEqual(geometry[0])
    expect(path[path.length - 1]).toEqual(geometry[999])
  })

  it('leaves short routes alone', () => {
    const route = makeRoute()
    expect(corridorPaths([route])[0]).toEqual(route.geometry)
  })
})

describe('slider time', () => {
  it('starts at the departure hour, as the API does', () => {
    expect(corridorStart('2026-11-08T21:35:00Z').toISOString()).toBe('2026-11-08T21:00:00.000Z')
  })

  it('converts slider hours to time since departure', () => {
    const departure = '2026-11-08T21:35:00Z'
    expect(secondsAfterDeparture(departure, 0)).toBe(-35 * 60)
    expect(secondsAfterDeparture(departure, 1)).toBe(25 * 60)
  })
})

describe('heatmap calibration', () => {
  it('makes a uniform field show its true value, not the sum of overlapping kernels', () => {
    // MapLibre's heatmap kernel: weight × intensity × (1/√(2π)) × exp(−½·9·d²), d = dist/radius.
    const GAUSS_COEF = 0.3989422804014327
    const radiusFactor = 2
    const intensity = uniformIntensity(radiusFactor)

    // Density at a point in the middle of a large grid with spacing 1 and weight 1.
    let density = 0
    for (let i = -20; i <= 20; i++) {
      for (let j = -20; j <= 20; j++) {
        const d = Math.hypot(i, j) / radiusFactor
        if (d <= 1) density += intensity * GAUSS_COEF * Math.exp(-0.5 * 9 * d * d)
      }
    }
    expect(density).toBeCloseTo(1, 1)
  })

  it('scales the radius with the map so it stays fixed on the ground', () => {
    const corridor: CorridorWeather = {
      start_time: '2026-11-08T21:00:00Z',
      hours: 48,
      spacing_miles: 20,
      cells: [{ lon: -100, lat: 0, risk: [], wind: [], rain: [], snow: [] }],
    }
    const [, , , z0, r0, z22, r22] = groundRadius(corridor, 1) as unknown as number[]
    // 20 miles at the equator is 20/24901 of the world, which is 512 px wide at zoom 0.
    expect(r0).toBeCloseTo((20 / 24901.46) * 512, 3)
    expect([z0, z22]).toEqual([0, 22])
    expect(r22 / r0).toBe(2 ** 22)
  })
})

describe('corridorFeatures', () => {
  it('flattens every hour of every metric into feature properties', () => {
    const corridor: CorridorWeather = {
      start_time: '2026-11-08T21:00:00Z',
      hours: 1,
      spacing_miles: 10,
      cells: [
        { lon: -113, lat: 49.7, risk: [0, 3], wind: [12, 41.5], rain: [0, 0.1], snow: [null, 0] },
      ],
    }
    const [feature] = corridorFeatures(corridor).features

    expect(feature.id).toBe(0)
    expect(feature.geometry.coordinates).toEqual([-113, 49.7])
    expect(feature.properties).toMatchObject({ r0: 0, r1: 3, w1: 41.5, p1: 0.1, s0: null })
  })
})
