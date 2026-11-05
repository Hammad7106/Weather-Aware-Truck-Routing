import { useCallback } from 'react'
import { usePlanner } from '../../store/planner'
import { writeTripToUrl } from './urlState'
import { toTripRequest, validateDraft, type TripField } from './validation'

const FIELD_ORDER: TripField[] = ['origin', 'destination', 'departure', 'load', 'interval']

/**
 * Validate the form and plan the trip. On invalid input, show the errors and focus the first
 * bad field instead. Returns whether the trip was submitted.
 */
export function useSubmitTrip() {
  return useCallback((): boolean => {
    const { draft, setSubmitAttempted, submit } = usePlanner.getState()
    const errors = validateDraft(draft, new Date())
    const firstInvalid = FIELD_ORDER.find((field) => errors[field])
    if (firstInvalid) {
      setSubmitAttempted(true)
      document.getElementById(`field-${firstInvalid}`)?.focus()
      return false
    }
    const trip = toTripRequest(draft)
    submit(trip)
    writeTripToUrl(trip)
    return true
  }, [])
}
