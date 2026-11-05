import type { FieldErrors } from '../../api/client'
import type { TripRequest } from '../../api/types'
import { haversineMiles } from '../../lib/geo'
import { DEPARTURE_WINDOW, fromLocalInputValue } from '../../lib/time'
import type { TripDraft } from '../../store/planner'

export const MAX_LOAD_LB = 80_000

export type TripField = 'origin' | 'destination' | 'departure' | 'load' | 'interval'
export type TripErrors = Partial<Record<TripField, string>>

/** Mirrors the server's validation (backend/planner/serializers.py) for instant feedback. */
export function validateDraft(draft: TripDraft, now: Date): TripErrors {
  const errors: TripErrors = {}

  if (!draft.origin) errors.origin = 'Choose a starting point.'
  else if (draft.origin.resolving) errors.origin = 'Still looking up this address…'

  if (!draft.destination) errors.destination = 'Choose a destination.'
  else if (draft.destination.resolving) errors.destination = 'Still looking up this address…'
  else if (draft.origin && haversineMiles(draft.origin, draft.destination) < 1)
    errors.destination = 'Destination must be at least 1 mile from the start.'

  const departure = fromLocalInputValue(draft.departure)
  if (!departure) errors.departure = 'Choose a departure time.'
  else if (departure.getTime() < now.getTime() - DEPARTURE_WINDOW.pastGraceMs)
    errors.departure = 'Departure is in the past.'
  else if (departure.getTime() > now.getTime() + DEPARTURE_WINDOW.futureMs)
    errors.departure = 'Departure must be within the next 7 days (forecast range).'

  if (!Number.isInteger(draft.loadLb) || draft.loadLb < 0 || draft.loadLb > MAX_LOAD_LB)
    errors.load = `Load must be between 0 and ${MAX_LOAD_LB.toLocaleString()} lb.`

  return errors
}

/** The API request for a valid draft. Call only when `validateDraft` returned no errors. */
export function toTripRequest(draft: TripDraft): TripRequest {
  const strip = ({ label, lat, lon }: { label: string; lat: number; lon: number }) => ({
    label,
    lat,
    lon,
  })
  return {
    origin: strip(draft.origin!),
    destination: strip(draft.destination!),
    departure_time: fromLocalInputValue(draft.departure)!.toISOString(),
    load_weight_lb: draft.loadLb,
    checkpoint_interval_miles: draft.intervalMiles,
  }
}

const SERVER_FIELDS: Record<string, TripField> = {
  origin: 'origin',
  destination: 'destination',
  departure_time: 'departure',
  load_weight_lb: 'load',
  checkpoint_interval_miles: 'interval',
}

/** Map a 400 response's field errors onto form fields. */
export function serverErrorsToFields(fieldErrors: FieldErrors): TripErrors {
  const errors: TripErrors = {}
  for (const [key, value] of Object.entries(fieldErrors)) {
    const field = SERVER_FIELDS[key]
    if (!field) continue
    const first = Array.isArray(value) ? value[0] : value
    errors[field] = typeof first === 'string' ? first : 'This value is invalid.'
  }
  return errors
}
