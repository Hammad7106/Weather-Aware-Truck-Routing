const EARTH_RADIUS_MILES = 3958.7613
const toRad = (deg: number) => (deg * Math.PI) / 180

export interface LatLon {
  lat: number
  lon: number
}

export function haversineMiles(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Parse "39.74, -104.99" into a point, or null if the text is not a coordinate pair. */
export function parseCoordinates(text: string): LatLon | null {
  const match = text.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)$/)
  if (!match) return null
  const lat = Number(match[1])
  const lon = Number(match[2])
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null
}

export const formatCoordinates = ({ lat, lon }: LatLon) => `${lat.toFixed(4)}, ${lon.toFixed(4)}`

type LonLatPair = [number, number]

/** The point a given fraction (0–1) of the way along a [lon, lat] line, by distance. */
export function pointAlong(line: LonLatPair[], fraction: number): LonLatPair {
  if (line.length === 1) return line[0]
  const lengths = line
    .slice(1)
    .map((p, i) => haversineMiles({ lon: line[i][0], lat: line[i][1] }, { lon: p[0], lat: p[1] }))
  let remaining = lengths.reduce((a, b) => a + b, 0) * Math.min(1, Math.max(0, fraction))
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] ? Math.min(1, remaining / lengths[i]) : 0
      const [a, b] = [line[i], line[i + 1]]
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    }
    remaining -= lengths[i]
  }
  return line[line.length - 1]
}

/** [[west, south], [east, north]] of all points. */
export function boundsOf(points: LonLatPair[]): [LonLatPair, LonLatPair] {
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [lon, lat] of points) {
    west = Math.min(west, lon)
    east = Math.max(east, lon)
    south = Math.min(south, lat)
    north = Math.max(north, lat)
  }
  return [
    [west, south],
    [east, north],
  ]
}
