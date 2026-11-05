import { usePlan } from '../../api/queries'
import type { TripPlan } from '../../api/types'
import { usePlanner } from '../../store/planner'

/** The plan for the submitted trip (shared cache entry, so every caller sees the same data). */
export function useCurrentPlan() {
  const trip = usePlanner((s) => s.submittedTrip)
  return usePlan(trip)
}

/** The route shown in detail: the one the user picked, otherwise the recommended one. */
export function useSelectedRouteId(plan: TripPlan | undefined): string | null {
  const selected = usePlanner((s) => s.selectedRouteId)
  if (!plan) return null
  return plan.routes.some((r) => r.id === selected) ? selected : plan.recommendation.route_id
}
