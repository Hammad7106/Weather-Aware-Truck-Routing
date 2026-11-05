import { useEffect } from 'react'
import type { RouteOption, TripPlan } from '../../api/types'
import { useHeatmap } from '../../store/heatmap'
import { usePlanner } from '../../store/planner'
import { checkpointAt, corridorStart } from './corridor'

/** Any trip plays in this long, whether it is 2 hours or 30. */
export const DRIVE_DURATION_MS = 16_000

/**
 * "Follow the truck": move the truck along the selected route in real time (scaled), keep the
 * heatmap on the truck's clock, and highlight the checkpoint it is passing. Store writes only
 * happen when a value changes, so the heatmap repaints once per forecast hour, not per frame.
 */
export function useDriveAnimation(plan: TripPlan, route: RouteOption | undefined) {
  const driving = useHeatmap((s) => s.driveSeconds !== null)

  // A new plan or a hidden heatmap ends the drive.
  useEffect(() => () => useHeatmap.getState().setDriveSeconds(null), [plan])

  useEffect(() => {
    if (!driving || !route) return
    const duration = route.summary.duration_s
    const tripSecondsPerMs = duration / DRIVE_DURATION_MS
    const hourZeroOffset =
      (new Date(plan.departure_time).getTime() - corridorStart(plan.departure_time).getTime()) /
      1000

    let last = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const heatmap = useHeatmap.getState()
      if (heatmap.driveSeconds === null) return
      const seconds = Math.min(duration, heatmap.driveSeconds + (now - last) * tripSecondsPerMs)
      last = now

      const hour = Math.round((hourZeroOffset + seconds) / 3600)
      if (hour !== heatmap.hour) heatmap.setHour(hour)
      const planner = usePlanner.getState()
      const passing = checkpointAt(route, seconds)
      if (planner.hoveredCheckpoint !== passing) planner.hoverCheckpoint(passing)

      if (seconds >= duration) {
        heatmap.setDriveSeconds(null)
        planner.hoverCheckpoint(null)
        return
      }
      heatmap.setDriveSeconds(seconds)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [driving, route, plan])
}
