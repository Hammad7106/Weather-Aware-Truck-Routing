import type { CheckpointInterval, Place, TripRequest } from '../../api/types'
import { parseCoordinates } from '../../lib/geo'
import { toLocalInputValue } from '../../lib/time'
import type { TripDraft } from '../../store/planner'

/**
 * A trip in the URL, so it can be bookmarked or shared:
 * ?from=39.7392,-104.9903&fromName=Denver&to=…&toName=…&depart=<ISO>&load=35000&every=25
 */
export function tripToSearch(trip: TripRequest): string {
  const params = new URLSearchParams({
    from: `${trip.origin.lat.toFixed(5)},${trip.origin.lon.toFixed(5)}`,
    fromName: trip.origin.label,
    to: `${trip.destination.lat.toFixed(5)},${trip.destination.lon.toFixed(5)}`,
    toName: trip.destination.label,
    depart: trip.departure_time,
    load: String(trip.load_weight_lb),
    every: String(trip.checkpoint_interval_miles),
  })
  return `?${params.toString()}`
}

function placeFrom(params: URLSearchParams, key: string): Place | null {
  const point = parseCoordinates(params.get(key) ?? '')
  if (!point) return null
  return { ...point, label: params.get(`${key}Name`) || `${point.lat}, ${point.lon}` }
}

/** The parts of a trip found in the URL; anything missing or invalid is left out. */
export function draftFromSearch(search: string): Partial<TripDraft> {
  const params = new URLSearchParams(search)
  const draft: Partial<TripDraft> = {}

  const origin = placeFrom(params, 'from')
  const destination = placeFrom(params, 'to')
  if (origin) draft.origin = origin
  if (destination) draft.destination = destination

  const depart = new Date(params.get('depart') ?? '')
  if (!Number.isNaN(depart.getTime())) draft.departure = toLocalInputValue(depart)

  const load = Number(params.get('load'))
  if (params.has('load') && Number.isInteger(load)) draft.loadLb = load

  const every = Number(params.get('every'))
  if ([10, 25, 50].includes(every)) draft.intervalMiles = every as CheckpointInterval

  return draft
}

export function writeTripToUrl(trip: TripRequest): void {
  window.history.replaceState(null, '', tripToSearch(trip))
}
