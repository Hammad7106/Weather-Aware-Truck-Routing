import { useQuery } from '@tanstack/react-query'
import { getCorridorWeather } from '../../api/endpoints'
import type { TripPlan } from '../../api/types'
import { corridorPaths } from './corridor'

/** Hourly corridor weather for 0–48 h after departure, around all of a plan's routes. */
export function useCorridorWeather(plan: TripPlan | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['corridor', plan?.generated_at, plan?.departure_time, plan?.load_weight_lb],
    queryFn: ({ signal }) =>
      getCorridorWeather(
        {
          paths: corridorPaths(plan!.routes),
          departure_time: plan!.departure_time,
          load_weight_lb: plan!.load_weight_lb,
        },
        signal,
      ),
    enabled: enabled && plan !== undefined,
    // Forecasts update hourly at most; reopening the same trip reuses the data.
    staleTime: 10 * 60 * 1000,
  })
}
