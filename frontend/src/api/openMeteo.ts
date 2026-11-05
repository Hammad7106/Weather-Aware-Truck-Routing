/**
 * Open-Meteo, called straight from the browser. The free tier is limited per IP address and
 * free hosting shares outgoing addresses between many apps, so weather is fetched here, with
 * each visitor's own quota, and handed to the API, which applies all the rules.
 */
import { ApiError } from './client'

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
/** Locations per request: keeps URLs short and matches the server's batching. */
const BATCH_SIZE = 100
const PARALLEL_BATCHES = 3

/** What the API asks for when it needs forecasts (409 weather_required). */
export interface WeatherRequest {
  cells: [lat: number, lon: number][]
  /** UTC hours in Open-Meteo's format, e.g. "2026-11-08T21:00". */
  start_hour: string
  end_hour: string
  /** Open-Meteo hourly variable names. */
  variables: string[]
}

/** One grid cell's hourly series, in the shape the API accepts. */
export interface CellForecast {
  lat: number
  lon: number
  /** Unix time (s) of the first hour. */
  start: number
  wind: (number | null)[]
  rain: (number | null)[]
  showers: (number | null)[]
  snow: (number | null)[]
  gust?: (number | null)[]
  temp?: (number | null)[]
  code?: (number | null)[]
}

const FIELD: Record<string, keyof CellForecast> = {
  wind_speed_10m: 'wind',
  wind_gusts_10m: 'gust',
  rain: 'rain',
  showers: 'showers',
  snowfall: 'snow',
  temperature_2m: 'temp',
  weather_code: 'code',
}

interface OpenMeteoLocation {
  hourly: Record<string, (number | null)[]> & { time: number[] }
}

/**
 * Convert one Open-Meteo location to the API's shape. The requested cell's coordinates are kept
 * (Open-Meteo snaps to its own model grid), because the API matches forecasts by cell.
 */
export function toCellForecast(
  cell: [number, number],
  location: OpenMeteoLocation,
  variables: string[],
): CellForecast {
  const forecast: CellForecast = {
    lat: cell[0],
    lon: cell[1],
    start: location.hourly.time[0] ?? 0,
    wind: [],
    rain: [],
    showers: [],
    snow: [],
  }
  for (const variable of variables) {
    const field = FIELD[variable]
    if (field) (forecast[field] as (number | null)[]) = location.hourly[variable] ?? []
  }
  return forecast
}

interface CachedSeries {
  start_hour: string
  end_hour: string
  variables: Set<string>
  forecast: CellForecast
}

/**
 * Session cache per grid cell. A stored series is reused for any request it covers (same or
 * fewer variables, same or shorter window), so departure options reuse the plan's forecasts.
 */
const cache = new Map<string, CachedSeries[]>()

const cellKey = (cell: [number, number]) => `${cell[0]},${cell[1]}`

function cached(cell: [number, number], request: WeatherRequest): CellForecast | undefined {
  // ISO hours in one format compare correctly as strings.
  return cache
    .get(cellKey(cell))
    ?.find(
      (entry) =>
        entry.start_hour <= request.start_hour &&
        entry.end_hour >= request.end_hour &&
        request.variables.every((v) => entry.variables.has(v)),
    )?.forecast
}

function remember(forecast: CellForecast, request: WeatherRequest) {
  const key = cellKey([forecast.lat, forecast.lon])
  const entry = {
    start_hour: request.start_hour,
    end_hour: request.end_hour,
    variables: new Set(request.variables),
    forecast,
  }
  cache.set(key, [...(cache.get(key) ?? []), entry])
}

async function fetchBatch(
  cells: [number, number][],
  request: WeatherRequest,
  signal?: AbortSignal,
): Promise<CellForecast[]> {
  const params = new URLSearchParams({
    latitude: cells.map((c) => c[0]).join(','),
    longitude: cells.map((c) => c[1]).join(','),
    hourly: request.variables.join(','),
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    temperature_unit: 'fahrenheit',
    timeformat: 'unixtime',
    timezone: 'GMT',
    start_hour: request.start_hour,
    end_hour: request.end_hour,
  })

  let response: Response
  try {
    response = await fetch(`${FORECAST_URL}?${params}`, { signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(
      0,
      'Could not reach the weather service. Check your connection.',
      'weather_unavailable',
    )
  }
  if (response.status === 429) {
    throw new ApiError(
      429,
      'The free weather service limit has been reached for your connection. Please try again in a few minutes.',
      'weather_quota',
    )
  }
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const reason = (payload as { reason?: string } | null)?.reason
    throw new ApiError(
      response.status,
      reason ?? 'The weather service returned an error.',
      'weather_unavailable',
    )
  }
  const locations = (Array.isArray(payload) ? payload : [payload]) as OpenMeteoLocation[]
  if (locations.length !== cells.length || locations.some((l) => !l?.hourly?.time)) {
    throw new ApiError(
      502,
      'The weather service returned an unexpected response.',
      'weather_unavailable',
    )
  }
  return locations.map((location, i) => toCellForecast(cells[i], location, request.variables))
}

/** Fetch every requested cell (batched, a few batches at a time; cached for the session). */
export async function fetchForecasts(
  request: WeatherRequest,
  signal?: AbortSignal,
): Promise<CellForecast[]> {
  const missing = request.cells.filter((cell) => !cached(cell, request))
  const batches: [number, number][][] = []
  for (let i = 0; i < missing.length; i += BATCH_SIZE)
    batches.push(missing.slice(i, i + BATCH_SIZE))

  for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
    const results = await Promise.all(
      batches.slice(i, i + PARALLEL_BATCHES).map((batch) => fetchBatch(batch, request, signal)),
    )
    for (const forecast of results.flat()) remember(forecast, request)
  }
  return request.cells.map((cell) => cached(cell, request)!)
}

/** IANA time zone of a point (e.g. "America/Edmonton"), or null. */
export async function fetchTimeZone(lat: number, lon: number, signal?: AbortSignal) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
    timezone: 'auto',
    forecast_days: '1',
  })
  const response = await fetch(`${FORECAST_URL}?${params}`, { signal })
  if (!response.ok) return null
  const zone = ((await response.json()) as { timezone?: unknown }).timezone
  return typeof zone === 'string' && zone.includes('/') ? zone : null
}
