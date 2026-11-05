import { withBrowserWeather, type PlanStage } from './browserWeather'
import { apiRequest } from './client'
import type {
  CorridorWeather,
  DepartureOptions,
  LonLat,
  Place,
  RiskRules,
  TripPlan,
  TripRequest,
} from './types'

export interface HealthResponse {
  status: 'ok'
  routing_configured: boolean
  weather_source: 'client' | 'server'
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

export const planTrip = (
  trip: TripRequest,
  signal?: AbortSignal,
  onStage?: (stage: PlanStage) => void,
) => {
  onStage?.('routes')
  return withBrowserWeather(
    (weather) =>
      apiRequest<TripPlan>('/api/plan', { method: 'POST', body: { ...trip, weather }, signal }),
    { signal, onStage },
  )
}

export const getDepartureOptions = (trip: TripRequest, signal?: AbortSignal) =>
  withBrowserWeather(
    (weather) =>
      apiRequest<DepartureOptions>('/api/departure-options', {
        method: 'POST',
        body: { ...trip, weather },
        signal,
      }),
    { signal },
  )

export const getCorridorWeather = (
  body: { paths: LonLat[][]; departure_time: string; load_weight_lb: number },
  signal?: AbortSignal,
) =>
  withBrowserWeather(
    (weather) =>
      apiRequest<CorridorWeather>('/api/corridor-weather', {
        method: 'POST',
        body: { ...body, weather },
        signal,
      }),
    { signal },
  )
