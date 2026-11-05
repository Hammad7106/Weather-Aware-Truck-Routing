import type { RouteOption } from '../../api/types'
import { CheckpointTimeline } from './CheckpointTimeline'
import { RiskProfile } from './RiskProfile'

/** Detail view of the selected route: risk profile and checkpoint timeline. */
export function RouteDetails({ route }: { route: RouteOption }) {
  return (
    <section aria-label={`${route.name} details`} className="space-y-3">
      <h2 className="flex items-baseline justify-between text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {route.name} in detail
        <span className="font-normal tracking-normal normal-case">
          Hover or click to see it on the map
        </span>
      </h2>
      <RiskProfile route={route} />
      <CheckpointTimeline route={route} />
    </section>
  )
}
