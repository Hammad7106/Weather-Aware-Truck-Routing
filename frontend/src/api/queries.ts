import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query'
import { geocode, getHealth, getRiskRules, planTrip, reverseGeocode } from './endpoints'
import type { TripRequest } from './types'

const HOUR = 60 * 60 * 1000

export const healthQuery = queryOptions({
  queryKey: ['health'],
  queryFn: ({ signal }) => getHealth(signal),
  // Free hosting tiers cold-start; keep trying for about a minute.
  retry: 5,
  retryDelay: (attempt) => Math.min(2000 * 2 ** attempt, 15000),
})

export const riskRulesQuery = queryOptions({
  queryKey: ['risk-rules'],
  queryFn: ({ signal }) => getRiskRules(signal),
  staleTime: Infinity,
})

export const reverseGeocodeQuery = (lat: number, lon: number) =>
  queryOptions({
    queryKey: ['reverse-geocode', lat.toFixed(4), lon.toFixed(4)],
    queryFn: ({ signal }) => reverseGeocode(lat, lon, signal),
    staleTime: 24 * HOUR,
  })

export function useGeocode(query: string) {
  const q = query.trim()
  return useQuery({
    queryKey: ['geocode', q.toLowerCase()],
    queryFn: ({ signal }) => geocode(q, signal),
    enabled: q.length >= 2,
    staleTime: HOUR,
    placeholderData: keepPreviousData,
    retry: false,
  })
}

export function usePlan(trip: TripRequest | null) {
  return useQuery({
    queryKey: ['plan', trip],
    queryFn: ({ signal }) => planTrip(trip!, signal),
    enabled: trip !== null,
    // Forecasts move slowly; re-opening the same trip within 5 minutes is instant.
    staleTime: 5 * 60 * 1000,
  })
}
