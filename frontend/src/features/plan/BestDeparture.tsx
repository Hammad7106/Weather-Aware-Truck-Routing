import { Clock3, Sparkles } from 'lucide-react'
import type { DepartureOption, TripPlan } from '../../api/types'
import { cn } from '../../lib/cn'
import { RISK_STYLES } from '../../lib/risk'
import { formatClock, formatDateTime } from '../../lib/time'
import { usePlanner } from '../../store/planner'
import { useReplanAt } from '../trip/useReplanAt'
import { useTripTimeZone } from '../trip/useTimeZone'
import { describeImprovement, levelShares } from './departure'
import { useDepartureOptions } from './useDepartureOptions'

const COLOR = Object.fromEntries(RISK_STYLES.map((s) => [s.key, s.color]))

/** Would leaving later be safer? Each bar is the best route's risk mix for that departure. */
export function BestDeparture({ plan }: { plan: TripPlan }) {
  const trip = usePlanner((s) => s.submittedTrip)
  const timeZone = useTripTimeZone()
  const replanAt = useReplanAt()
  const { data, isPending, isError } = useDepartureOptions(trip, true)

  if (isError) return null

  const departure = new Date(plan.departure_time)
  const current = data?.options[0]
  const best = data?.options.find((o) => o.offset_hours === data.best_offset_hours)
  const gain = current && best && best.offset_hours > 0 ? describeImprovement(current, best) : null

  return (
    <section
      aria-label="Best time to leave"
      className="rounded-xl border border-slate-200 bg-white p-3"
    >
      <h2 className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
        <Clock3 className="h-3.5 w-3.5 text-sky-600" aria-hidden />
        Best time to leave
      </h2>

      {isPending || !data || !best ? (
        <div className="mt-2 h-16 animate-pulse rounded-md bg-slate-100" aria-label="Loading" />
      ) : (
        <>
          <p className="mt-1 text-xs text-slate-600" aria-live="polite">
            {gain ? (
              <>
                <Sparkles className="mr-1 inline h-3.5 w-3.5 text-amber-500" aria-hidden />
                Leave at{' '}
                <strong className="text-slate-900">
                  {formatClock(new Date(best.departure_time), departure, timeZone)}
                </strong>{' '}
                (+{best.offset_hours} h) for {gain}.
              </>
            ) : (
              'Leaving at your chosen time is already the safest option in the next 48 hours.'
            )}
          </p>

          <ol className="mt-2.5 grid grid-cols-10 gap-1" aria-label="Departure options">
            {data.options.map((option) => (
              <OptionBar
                key={option.offset_hours}
                option={option}
                best={option.offset_hours === data.best_offset_hours}
                current={option.offset_hours === 0}
                label={formatDateTime(new Date(option.departure_time), timeZone)}
                onPick={() => replanAt(new Date(option.departure_time))}
              />
            ))}
          </ol>
          <p className="mt-1.5 text-[10px] text-slate-400">
            Each bar is the safest route for that departure. Same roads and drive times; only the
            weather timing changes.
          </p>
        </>
      )}
    </section>
  )
}

function OptionBar({
  option,
  best,
  current,
  label,
  onPick,
}: {
  option: DepartureOption
  best: boolean
  current: boolean
  label: string
  onPick: () => void
}) {
  const shares = levelShares(option).filter((s) => s.share > 0)
  const breakdown = shares
    .slice()
    .reverse()
    .map(
      (s) => `${Math.round(s.share * option.summary.distance_miles)} mi ${s.key.replace('_', ' ')}`,
    )
    .join(', ')

  return (
    <li className="flex flex-col items-center">
      <button
        type="button"
        disabled={current}
        onClick={onPick}
        title={`${label} · Route ${option.route_id} · ${breakdown}`}
        aria-label={`Leave ${current ? 'at the chosen time' : `${option.offset_hours} hours later`}: ${label}, Route ${option.route_id}, ${breakdown}${best ? ', safest' : ''}`}
        className={cn(
          'relative flex h-12 w-full flex-col-reverse overflow-hidden rounded-md border transition',
          current
            ? 'cursor-default border-slate-400'
            : 'border-transparent hover:-translate-y-0.5 hover:shadow-md',
          best && 'ring-2 ring-amber-400 ring-offset-1',
        )}
      >
        {shares.map((s) => (
          <span key={s.key} style={{ height: `${s.share * 100}%`, background: COLOR[s.key] }} />
        ))}
        {best && (
          <span className="absolute inset-x-0 top-0.5 text-center text-[10px] leading-none text-white drop-shadow">
            ★
          </span>
        )}
      </button>
      <span
        className={cn(
          'mt-0.5 text-[10px] tabular-nums',
          current ? 'font-semibold text-slate-700' : 'text-slate-400',
        )}
      >
        {current ? 'now' : `+${option.offset_hours}h`}
      </span>
    </li>
  )
}
