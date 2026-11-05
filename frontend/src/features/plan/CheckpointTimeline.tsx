import { Weight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Checkpoint, RouteOption } from '../../api/types'
import { RiskBadge } from '../../components/RiskBadge'
import { cn } from '../../lib/cn'
import { riskStyle } from '../../lib/risk'
import { formatClock } from '../../lib/time'
import { describeWeatherCode } from '../../lib/weather'
import { usePlanner } from '../../store/planner'

type Filter = 'all' | 'risky'

/** A short weather line: the conditions that matter, worst first. */
function weatherSummary(cp: Checkpoint): string {
  const w = cp.weather
  if (!w) return 'No forecast'
  const parts = [`${w.wind_mph ?? '—'} mph`]
  if (w.rain_in_hr) parts.push(`${w.rain_in_hr} in/h rain`)
  if (w.snow_in_hr) parts.push(`${w.snow_in_hr} in/h snow`)
  return parts.join(' · ')
}

/** Every checkpoint on the selected route in driving order, linked with the map and chart. */
export function CheckpointTimeline({ route }: { route: RouteOption }) {
  const hovered = usePlanner((s) => s.hoveredCheckpoint)
  const selected = usePlanner((s) => s.selectedCheckpoint)
  const hoverCheckpoint = usePlanner((s) => s.hoverCheckpoint)
  const selectCheckpoint = usePlanner((s) => s.selectCheckpoint)
  const [filter, setFilter] = useState<Filter>('all')
  const rows = useRef(new Map<number, HTMLButtonElement>())

  const risky = route.checkpoints.filter((cp) => cp.level === null || cp.level >= 1)
  const shown = filter === 'all' ? route.checkpoints : risky
  const departure = new Date(route.departure_time)

  // Keep the selected checkpoint visible when it was picked on the map or the chart.
  useEffect(() => {
    if (selected !== null) rows.current.get(selected)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[11px] text-slate-500">
          {route.checkpoints.length} checkpoints · {risky.length} above Low
        </p>
        <div
          role="radiogroup"
          aria-label="Checkpoint filter"
          className="flex rounded-md bg-slate-100 p-0.5 text-[11px]"
        >
          {(
            [
              ['all', 'All'],
              ['risky', 'Moderate+'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                'rounded px-2 py-0.5 font-medium transition',
                filter === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Every checkpoint on this route is Low risk.
        </p>
      ) : (
        <ol className="max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white">
          {shown.map((cp, i) => {
            const style = riskStyle(cp.level)
            const kind = describeWeatherCode(cp.weather?.weather_code ?? null)
            const KindIcon = kind.icon
            const active = cp.index === hovered || cp.index === selected
            return (
              <li key={cp.index} className="relative">
                {i < shown.length - 1 && (
                  <span
                    className="absolute top-6 bottom-0 left-[17px] w-px bg-slate-200"
                    aria-hidden
                  />
                )}
                <button
                  ref={(el) => {
                    if (el) rows.current.set(cp.index, el)
                    else rows.current.delete(cp.index)
                  }}
                  type="button"
                  aria-pressed={cp.index === selected}
                  onClick={() => selectCheckpoint(cp.index === selected ? null : cp.index)}
                  onMouseEnter={() => hoverCheckpoint(cp.index)}
                  onMouseLeave={() => hoverCheckpoint(null)}
                  onFocus={() => hoverCheckpoint(cp.index)}
                  onBlur={() => hoverCheckpoint(null)}
                  className={cn(
                    'relative flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs transition',
                    cp.index === selected
                      ? 'bg-sky-50'
                      : active
                        ? 'bg-slate-50'
                        : 'hover:bg-slate-50',
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white"
                    style={{ background: style.color }}
                    aria-hidden
                  />
                  <span className="w-16 shrink-0 tabular-nums">
                    <span className="block font-medium text-slate-800">
                      {formatClock(new Date(cp.eta), departure)}
                    </span>
                    <span className="block text-[10px] text-slate-400">
                      {cp.index === 0 ? 'start' : `mile ${cp.mile}`}
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-1 text-slate-600">
                    <KindIcon
                      className="h-3.5 w-3.5 shrink-0 text-slate-400"
                      aria-label={kind.label}
                    />
                    <span className="truncate">{weatherSummary(cp)}</span>
                    {cp.load_rule && (
                      <Weight
                        className="h-3 w-3 shrink-0 text-amber-600"
                        aria-label="raised by load rule"
                      />
                    )}
                  </span>
                  <RiskBadge level={cp.level} />
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
