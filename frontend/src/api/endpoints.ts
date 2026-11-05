import { apiRequest } from './client'
import type { CorridorWeather, LonLat, Place, RiskRules, TripPlan, TripRequest } from './types'

export interface HealthResponse {
  status: 'ok'
  routing_configured: boolean
}

export const getHealth = (signal?: AbortSignal) =>
  apiRequest<HealthResponse>('/api/health', { signal })

export const getRiskRules = (signal?: AbortSignal) =>
  apiRequest<RiskRules>('/api/risk-rules', { signal })

export const geocode = (q: string, signal?: AbortSignal) =>
  apiRequest<{ results: Place[] }>('/api/geocode', { query: { q }, signal }).then((r) => r.results)

export const reverseGeocode = (lat: number, lon: number, signal?: AbortSignal) =>
  apiRequest<{ result: Place }>('/api/reverse-geocode', { query: { lat, lon }, signal }).then(
    (r) => r.result,
  )

export const planTrip = (trip: TripRequest, signal?: AbortSignal) =>
  apiRequest<TripPlan>('/api/plan', { method: 'POST', body: trip, signal })

export const getCorridorWeather = (
  body: { paths: LonLat[][]; departure_time: string; load_weight_lb: number },
  signal?: AbortSignal,
) => apiRequest<CorridorWeather>('/api/corridor-weather', { method: 'POST', body, signal })

export const getTimeZone = (lat: number, lon: number, signal?: AbortSignal) =>
  apiRequest<{ timezone: string | null }>('/api/timezone', { query: { lat, lon }, signal }).then(
    (r) => r.timezone,
  )
