import type { ExpressionSpecification } from 'maplibre-gl'
import type { CorridorWeather, LonLat, RouteOption } from '../../api/types'
import { METRICS } from './metrics'

const EARTH_CIRCUMFERENCE_M = 40_075_016.686
const METERS_PER_MILE = 1609.344
/** MapLibre renders 512-pixel tiles. */
const TILE_SIZE = 512
/** The API accepts at most 1,500 points across all paths; stay well under it. */
const MAX_POINTS_PER_PATH = 400

/** Every route's line, thinned to a bounded number of points, for the corridor request. */
export function corridorPaths(routes: RouteOption[]): LonLat[][] {
  return routes.map((route) => {
    const step = Math.max(1, Math.ceil(route.geometry.length / MAX_POINTS_PER_PATH))
    const thinned = route.geometry.filter((_, i) => i % step === 0)
    const last = route.geometry[route.geometry.length - 1]
    if (thinned[thinned.length - 1] !== last) thinned.push(last)
    return thinned
  })
}

/**
 * One point feature per grid cell, with every hour of every metric as a flat property
 * (r0…r48, w0…, p0…, s0…). Moving the slider then only swaps a paint expression.
 */
export function corridorFeatures(
  corridor: CorridorWeather,
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: corridor.cells.map((cell, id) => {
      const properties: Record<string, number | null> = {}
      for (const metric of Object.values(METRICS)) {
        cell[metric.field].forEach((value, hour) => {
          properties[`${metric.prefix}${hour}`] = value
        })
      }
      return {
        type: 'Feature',
        id,
        properties,
        geometry: { type: 'Point', coordinates: [cell.lon, cell.lat] },
      }
    }),
  }
}

/** Screen pixels covered by `miles` at zoom 0 and the given latitude (Web Mercator). */
function pixelsAtZoom0(miles: number, latitude: number): number {
  const metersPerPixel = (EARTH_CIRCUMFERENCE_M * Math.cos((latitude * Math.PI) / 180)) / TILE_SIZE
  return (miles * METERS_PER_MILE) / metersPerPixel
}

/** A radius of `factor` × grid spacing, in pixels, that stays the same on the ground at any zoom. */
export function groundRadius(corridor: CorridorWeather, factor: number): ExpressionSpecification {
  const lats = corridor.cells.map((c) => c.lat)
  const midLat = lats.length ? (Math.min(...lats) + Math.max(...lats)) / 2 : 40
  const atZoom0 = pixelsAtZoom0(corridor.spacing_miles, midLat) * factor
  return ['interpolate', ['exponential', 2], ['zoom'], 0, atZoom0, 22, atZoom0 * 2 ** 22]
}

/**
 * Heatmap intensity that makes a uniform field show its true value instead of the sum of
 * overlapping kernels. MapLibre's kernel is a Gaussian with σ = radius / 3 and peak
 * 1/√(2π); summed over a square grid of spacing s with radius k·s, the density is about
 * weight × intensity × 2πσ²/(√(2π)·s²) = weight × intensity × 0.2785 · k².
 */
export function uniformIntensity(radiusFactor: number): number {
  return 1 / (0.2785 * radiusFactor ** 2)
}

export type TruckStatus = 'waiting' | 'driving' | 'arrived'

/** Where the truck is `seconds` after departure, using the route's per-vertex timing. */
export function truckPosition(
  route: RouteOption,
  seconds: number,
): { position: LonLat; status: TruckStatus } {
  const times = route.geometry_offsets_s
  const line = route.geometry
  if (seconds <= 0) return { position: line[0], status: seconds < 0 ? 'waiting' : 'driving' }
  if (seconds >= times[times.length - 1])
    return { position: line[line.length - 1], status: 'arrived' }

  let lo = 0
  let hi = times.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (times[mid] <= seconds) lo = mid
    else hi = mid
  }
  const span = times[hi] - times[lo]
  const t = span > 0 ? (seconds - times[lo]) / span : 0
  const [a, b] = [line[lo], line[hi]]
  return { position: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], status: 'driving' }
}

const HOUR_MS = 3_600_000

/** Slider hour 0: the departure rounded down to the hour, exactly as the API does it. */
export function corridorStart(departureIso: string): Date {
  return new Date(Math.floor(new Date(departureIso).getTime() / HOUR_MS) * HOUR_MS)
}

/** Seconds after departure that a slider hour represents. */
export function secondsAfterDeparture(departureIso: string, hour: number): number {
  const start = corridorStart(departureIso).getTime() + hour * HOUR_MS
  return (start - new Date(departureIso).getTime()) / 1000
}

/** Index of the checkpoint the truck has most recently passed, `seconds` after departure. */
export function checkpointAt(route: RouteOption, seconds: number): number {
  let index = 0
  for (const checkpoint of route.checkpoints) {
    if (checkpoint.eta_offset_s > seconds) break
    index = checkpoint.index
  }
  return index
}
