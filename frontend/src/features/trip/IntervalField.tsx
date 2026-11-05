import type { CheckpointInterval } from '../../api/types'
import { cn } from '../../lib/cn'
import { haversineMiles } from '../../lib/geo'
import { usePlanner } from '../../store/planner'

const OPTIONS: { miles: CheckpointInterval; hint: string }[] = [
  { miles: 10, hint: 'Most detail' },
  { miles: 25, hint: 'Balanced' },
  { miles: 50, hint: 'Overview' },
]
/** Roads are longer than the straight line; a rough factor for the checkpoint estimate. */
const ROAD_FACTOR = 1.2

export function IntervalField() {
  const interval = usePlanner((s) => s.draft.intervalMiles)
  const setInterval = usePlanner((s) => s.setInterval)
  const origin = usePlanner((s) => s.draft.origin)
  const destination = usePlanner((s) => s.draft.destination)

  const roadMiles = origin && destination ? haversineMiles(origin, destination) * ROAD_FACTOR : null

  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium text-slate-600">Check weather every</legend>
      <div role="radiogroup" className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
        {OPTIONS.map((option) => {
          const selected = option.miles === interval
          return (
            <button
              key={option.miles}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setInterval(option.miles)}
              className={cn(
                'rounded-md px-2 py-1.5 text-center transition',
                selected
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800',
              )}
            >
              <span className="block text-sm font-semibold">{option.miles} mi</span>
              <span className="block text-[11px]">{option.hint}</span>
            </button>
          )
        })}
      </div>
      {roadMiles !== null && (
        <p className="mt-1.5 text-xs text-slate-500">
          About {Math.ceil(roadMiles / interval) + 1} checkpoints per route.
        </p>
      )}
    </fieldset>
  )
}
