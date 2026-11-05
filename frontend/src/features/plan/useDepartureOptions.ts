import { useQuery } from '@tanstack/react-query'
import { getDepartureOptions } from '../../api/endpoints'
import type { TripRequest } from '../../api/types'

/** Departure times over the next 48 h, re-rated with the same routes (loaded after the plan). */
export function useDepartureOptions(trip: TripRequest | null, enabled: boolean) {
  return useQuery({
    queryKey: ['departure-options', trip],
    queryFn: ({ signal }) => getDepartureOptions(trip!, signal),
    enabled: enabled && trip !== null,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
}
