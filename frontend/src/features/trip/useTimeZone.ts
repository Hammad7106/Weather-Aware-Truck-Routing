import { useQuery } from '@tanstack/react-query'
import { fetchTimeZone } from '../../api/openMeteo'
import { isValidTimeZone } from '../../lib/time'
import { usePlanner } from '../../store/planner'

interface Point {
  lat: number
  lon: number
}

/** IANA zone of a place, or undefined (meaning the browser's zone) until known. */
export function usePlaceTimeZone(place: Point | null | undefined): string | undefined {
  const { data } = useQuery({
    queryKey: ['timezone', place?.lat.toFixed(2), place?.lon.toFixed(2)],
    queryFn: ({ signal }) => fetchTimeZone(place!.lat, place!.lon, signal),
    enabled: place != null,
    // A place's time zone does not change while the app is open.
    staleTime: Infinity,
  })
  return data && isValidTimeZone(data) ? data : undefined
}

/** Zone the departure field is read in: the start city's. */
export function useDraftTimeZone(): string | undefined {
  return usePlaceTimeZone(usePlanner((s) => s.draft.origin))
}

/** Zone that results are shown in: the planned trip's start city. */
export function useTripTimeZone(): string | undefined {
  const origin = usePlanner((s) => s.submittedTrip?.origin ?? s.draft.origin)
  return usePlaceTimeZone(origin)
}
