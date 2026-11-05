import { Clock, Flag, Gauge, TrafficCone, TriangleAlert } from 'lucide-react'
import type { RouteOption } from '../../api/types'
import { RiskBadge } from '../../components/RiskBadge'
import { RiskBar, RiskBreakdown } from '../../components/RiskBar'
import { cn } from '../../lib/cn'
import { formatClock, formatDuration } from '../../lib/time'
import { usePlanner } from '../../store/planner'

const TRAFFIC_NOTE_SECONDS = 5 * 60

interface RouteCardProps {
  route: RouteOption
  recommended: boolean
  selected: boolean
}

export function RouteCard({ route, recommended, selected }: RouteCardProps) {
  const hovered = usePlanner((s) => s.hoveredRouteId === route.id)
  const selectRoute = usePlanner((s) => s.selectRoute)
  const hoverRoute = usePlanner((s) => s.hoverRoute)
  const { summary } = route
  const departure = new Date(route.departure_time)
  const arrival = new Date(route.arrival_time)

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => selectRoute(route.id)}
      onMouseEnter={() => hoverRoute(route.id)}
      onMouseLeave={() => hoverRoute(null)}
      onFocus={() => hoverRoute(route.id)}
      onBlur={() => hoverRoute(null)}
      className={cn(
        'block w-full rounded-xl border bg-white p-3 text-left transition focus-visible:outline-none',
        selected
          ? 'border-sky-500 shadow-md ring-2 ring-sky-100'
          : hovered
            ? 'border-slate-300 shadow-sm'
            : 'border-slate-200 hover:border-slate-300',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold',
              selected ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600',
            )}
            aria-hidden
          >
            {route.id}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">{route.name}</p>
            {route.via.length > 0 && (
              <p className="truncate text-xs text-slate-500">via {route.via.join(' · ')}</p>
            )}
          </div>
        </div>
        {recommended ? (
          <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
            Recommended
          </span>
        ) : (
          <span className="shrink-0 text-[11px] font-medium text-slate-400">#{route.rank}</span>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <Stat
          icon={Gauge}
          label="Distance"
          value={`${summary.distance_miles.toLocaleString()} mi`}
        />
        <Stat icon={Clock} label="Drive time" value={formatDuration(summary.duration_s)} />
        <Stat icon={Flag} label="Arrives" value={formatClock(arrival, departure)} />
      </dl>

      <RiskBar summary={summary} className="mt-3" />
      <div className="mt-1.5">
        <RiskBreakdown summary={summary} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          Peak <RiskBadge level={summary.peak_level} />
        </span>
        {summary.average_risk !== null && (
          <span title="Distance-weighted average: 0 = Low … 4 = No Travel">
            Avg risk{' '}
            <span className="font-semibold text-slate-700">{summary.average_risk.toFixed(2)}</span>
          </span>
        )}
        {route.traffic_delay_s >= TRAFFIC_NOTE_SECONDS && (
          <span className="inline-flex items-center gap-1 text-amber-700">
            <TrafficCone className="h-3 w-3" aria-hidden />+{formatDuration(route.traffic_delay_s)}{' '}
            traffic
          </span>
        )}
        {summary.no_data_miles > 0 && (
          <span className="inline-flex items-center gap-1 text-slate-600">
            <TriangleAlert className="h-3 w-3" aria-hidden />
            {summary.no_data_miles} mi without forecast
          </span>
        )}
      </div>
    </button>
  )
}

function Stat({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-slate-400">
        <Icon className="h-3 w-3" aria-hidden />
        {label}
      </dt>
      <dd className="mt-0.5 font-semibold text-slate-800 tabular-nums">{value}</dd>
    </div>
  )
}
