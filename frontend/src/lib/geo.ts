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
