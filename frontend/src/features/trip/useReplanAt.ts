import { useCallback } from 'react'
import { usePlanner } from '../../store/planner'
import { writeTripToUrl } from './urlState'

/** Re-plan the current trip with a different departure time (form, results and URL). */
export function useReplanAt() {
  return useCallback((departure: Date) => {
    const { submittedTrip, setDeparture, submit } = usePlanner.getState()
    if (!submittedTrip) return
    const next = { ...submittedTrip, departure_time: departure.toISOString() }
    setDeparture(next.departure_time)
    submit(next)
    writeTripToUrl(next)
  }, [])
}
