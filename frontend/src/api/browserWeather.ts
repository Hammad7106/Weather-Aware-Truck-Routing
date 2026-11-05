import { ApiError } from './client'
import { fetchForecasts, type CellForecast, type WeatherRequest } from './openMeteo'

export type WeatherPayload = { cells: CellForecast[] }
export type PlanStage = 'routes' | 'weather' | 'rating'

/** Each round can add cells (e.g. if a route changed); never loop forever. */
const MAX_ROUNDS = 3

/**
 * Send a request that needs weather. If the API answers 409 weather_required, fetch exactly
 * the cells and hours it asked for from Open-Meteo (with the visitor's own quota) and repeat
 * the request with them. When the server fetches weather itself, the first call just succeeds.
 */
export async function withBrowserWeather<T>(
  send: (weather: WeatherPayload | undefined) => Promise<T>,
  options: { signal?: AbortSignal; onStage?: (stage: PlanStage) => void } = {},
): Promise<T> {
  const cells = new Map<string, CellForecast>()
  for (let round = 0; round < MAX_ROUNDS; round++) {
    try {
      return await send(cells.size ? { cells: [...cells.values()] } : undefined)
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'weather_required') throw error
      const request = (error.body as { weather_request?: WeatherRequest } | null)?.weather_request
      if (!request) throw error
      options.onStage?.('weather')
      for (const forecast of await fetchForecasts(request, options.signal)) {
        cells.set(`${forecast.lat},${forecast.lon}`, forecast)
      }
      options.onStage?.('rating')
    }
  }
  throw new ApiError(
    502,
    'Could not get the forecast for this trip. Please try again.',
    'weather_unavailable',
  )
}
