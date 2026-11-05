import { useEffect, useRef } from 'react'
import { useMap } from 'react-map-gl/maplibre'
import type { RouteOption } from '../../api/types'
import { mapPadding } from '../../store/layout'
import { useHeatmap } from '../../store/heatmap'
import { truckPosition } from '../heatmap/corridor'

/** Keep the driving truck in view: re-centre only when it nears the edge, never every frame. */
const EDGE_MARGIN = 0.15

export function FollowTruckCamera({ route }: { route: RouteOption }) {
  const { current: map } = useMap()
  const driveSeconds = useHeatmap((s) => s.driveSeconds)
  const moving = useRef(false)

  useEffect(() => {
    if (!map || driveSeconds === null || moving.current) return
    const { position } = truckPosition(route, driveSeconds)
    const { x, y } = map.project(position)
    const { clientWidth: width, clientHeight: height } = map.getContainer()
    const { top, bottom } = mapPadding(0)
    const inside =
      x > width * EDGE_MARGIN &&
      x < width * (1 - EDGE_MARGIN) &&
      y > top + height * EDGE_MARGIN &&
      y < height - bottom - height * EDGE_MARGIN
    if (inside) return

    moving.current = true
    map.once('moveend', () => {
      moving.current = false
    })
    map.easeTo({ center: position, padding: mapPadding(0), duration: 800 })
  }, [map, route, driveSeconds])

  return null
}
