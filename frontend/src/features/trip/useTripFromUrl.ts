import { useEffect } from 'react'
import { roundUp, toLocalInputValue } from '../../lib/time'
import { usePlanner } from '../../store/planner'
import { draftFromSearch } from './urlState'
import { toTripRequest, validateDraft } from './validation'

/**
 * Restore a shared trip from the URL on first load and plan it straight away. A link whose
 * departure time has passed opens with the departure reset to now, ready to resubmit.
 */
export function useTripFromUrl() {
  useEffect(() => {
    const fromUrl = draftFromSearch(window.location.search)
    if (Object.keys(fromUrl).length === 0) return

    const { applyDraft, setDeparture, submit } = usePlanner.getState()
    applyDraft(fromUrl)
    const now = new Date()
    const draft = usePlanner.getState().draft
    const errors = validateDraft(draft, now)

    if (Object.keys(errors).length === 0) {
      submit(toTripRequest(draft))
    } else if (errors.departure) {
      setDeparture(toLocalInputValue(roundUp(now, 5)))
    }
  }, [])
}
