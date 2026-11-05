import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { reverseGeocodeQuery } from '../../api/queries'
import { formatCoordinates } from '../../lib/geo'
import { usePlanner, type PlaceRole } from '../../store/planner'

/**
 * Set a place from a map point straight away (shown as coordinates), then fill in its
 * address once the reverse lookup returns — unless the place has changed in the meantime.
 */
export function useResolvePoint() {
  const queryClient = useQueryClient()
  const setPlace = usePlanner((s) => s.setPlace)

  return useCallback(
    async (role: PlaceRole, lat: number, lon: number) => {
      const fallback = formatCoordinates({ lat, lon })
      setPlace(role, { label: fallback, lat, lon, resolving: true })

      let label = fallback
      try {
        label = (await queryClient.fetchQuery(reverseGeocodeQuery(lat, lon))).label
      } catch {
        // Keep the coordinates as the label; the point itself is still valid.
      }
      const current = usePlanner.getState().draft[role]
      if (current && current.lat === lat && current.lon === lon) {
        setPlace(role, { label, lat, lon })
      }
    },
    [queryClient, setPlace],
  )
}
