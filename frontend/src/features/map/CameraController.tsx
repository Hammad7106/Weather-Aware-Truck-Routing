import { useEffect } from 'react'
import { useMap } from 'react-map-gl/maplibre'
import { mapPadding } from '../../store/layout'
import { usePlanner } from '../../store/planner'

/** Fraction of the viewport the trip must span before we stop zooming in to it. */
const MIN_FILL = 0.3

/**
 * Keeps the trip in view. The camera moves only when a place is off-screen, or when the trip
 * fills a small part of the view, so small adjustments on the map never make it jump.
 */
export function CameraController() {
  const { current: map } = useMap()
  const origin = usePlanner((s) => s.draft.origin)
  const destination = usePlanner((s) => s.draft.destination)

  const oLat = origin?.lat
  const oLon = origin?.lon
  const dLat = destination?.lat
  const dLon = destination?.lon

  useEffect(() => {
    if (!map) return
    const points = [
      oLat !== undefined && oLon !== undefined ? ([oLon, oLat] as [number, number]) : null,
      dLat !== undefined && dLon !== undefined ? ([dLon, dLat] as [number, number]) : null,
    ].filter((p): p is [number, number] => p !== null)
    if (points.length === 0) return

    const bounds = map.getBounds()
    const allVisible = points.every((p) => bounds.contains(p))

    if (points.length === 1) {
      if (allVisible) return
      map.flyTo({ center: points[0], zoom: Math.max(map.getZoom(), 7), duration: 900 })
    } else {
      const lonFill = Math.abs(points[0][0] - points[1][0]) / (bounds.getEast() - bounds.getWest())
      const latFill =
        Math.abs(points[0][1] - points[1][1]) / (bounds.getNorth() - bounds.getSouth())
      if (allVisible && Math.max(lonFill, latFill) >= MIN_FILL) return
      map.fitBounds([points[0], points[1]], { padding: mapPadding(60), duration: 900, maxZoom: 10 })
    }
  }, [map, oLat, oLon, dLat, dLon])

  return null
}
