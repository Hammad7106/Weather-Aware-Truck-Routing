import { useRef, type KeyboardEvent, type MouseEvent } from 'react'
import type { RouteOption } from '../../api/types'
import { riskStyle } from '../../lib/risk'
import { formatClock } from '../../lib/time'
import { usePlanner } from '../../store/planner'
import { useTripTimeZone } from '../trip/useTimeZone'

const WIDTH = 1000
const HEIGHT = 72
/** Wind axis: the chart's top edge is this many mph. */
const WIND_SCALE_MPH = 60
/** Where the load rules start to matter, drawn as a reference line. */
const WIND_REFERENCE_MPH = 35

const barHeight = (level: number | null) => (level === null ? HEIGHT : ((level + 1) / 5) * HEIGHT)

/**
 * Risk along the route: one bar per stretch, as tall as its risk level, with the forecast wind
 * drawn over it. Hover, click, or use the arrow keys to inspect a checkpoint.
 */
export function RiskProfile({ route }: { route: RouteOption }) {
  const hovered = usePlanner((s) => s.hoveredCheckpoint)
  const selected = usePlanner((s) => s.selectedCheckpoint)
  const hoverCheckpoint = usePlanner((s) => s.hoverCheckpoint)
  const selectCheckpoint = usePlanner((s) => s.selectCheckpoint)
  const svgRef = useRef<SVGSVGElement>(null)
  const timeZone = useTripTimeZone()

  const total = route.summary.distance_miles || 1
  const x = (mile: number) => (mile / total) * WIDTH
  const checkpoints = route.checkpoints
  const focus = hovered ?? selected
  const focused = focus === null ? null : checkpoints[focus]

  function indexAt(event: MouseEvent<SVGSVGElement>): number {
    const box = svgRef.current!.getBoundingClientRect()
    const mile = ((event.clientX - box.left) / box.width) * total
    const found = checkpoints.findIndex((cp) => mile >= cp.covers[0] && mile <= cp.covers[1])
    return found === -1 ? checkpoints.length - 1 : found
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    const current = focus ?? -1
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      const step = event.key === 'ArrowRight' ? 1 : -1
      hoverCheckpoint(Math.min(checkpoints.length - 1, Math.max(0, current + step)))
    } else if ((event.key === 'Enter' || event.key === ' ') && current >= 0) {
      event.preventDefault()
      selectCheckpoint(current)
    } else if (event.key === 'Escape') {
      hoverCheckpoint(null)
      selectCheckpoint(null)
    }
  }

  const windPoints = checkpoints
    .filter((cp) => cp.weather?.wind_mph != null)
    .map((cp) => {
      const wind = Math.min(cp.weather!.wind_mph!, WIND_SCALE_MPH)
      return `${x(cp.mile).toFixed(1)},${(HEIGHT - (wind / WIND_SCALE_MPH) * HEIGHT).toFixed(1)}`
    })
    .join(' ')
  const referenceY = HEIGHT - (WIND_REFERENCE_MPH / WIND_SCALE_MPH) * HEIGHT
  const departure = new Date(route.departure_time)

  return (
    <figure className="relative">
      <figcaption className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
        <span>Risk along the route</span>
        <span className="inline-flex items-center gap-1">
          <span className="h-px w-3 bg-slate-700" aria-hidden /> wind
          <span className="ml-1.5 h-px w-3 border-t border-dashed border-slate-400" aria-hidden />
          {WIND_REFERENCE_MPH} mph
        </span>
      </figcaption>

      {focused && (
        <div
          className="pointer-events-none absolute -top-1 z-10 rounded-md bg-slate-900 px-2 py-1 text-[11px] whitespace-nowrap text-white shadow-lg"
          style={{
            left: `${(focused.mile / total) * 100}%`,
            transform: `translate(-${(focused.mile / total) * 100}%, -100%)`,
          }}
        >
          Mile {focused.mile} · {formatClock(new Date(focused.eta), departure, timeZone)} ·{' '}
          <span style={{ color: riskStyle(focused.level).soft }}>
            {riskStyle(focused.level).label}
          </span>
          {focused.weather?.wind_mph != null && ` · ${focused.weather.wind_mph} mph`}
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="h-[72px] w-full cursor-crosshair overflow-visible rounded-md bg-slate-50 outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
        role="slider"
        tabIndex={0}
        aria-label={`Risk profile of ${route.name}. Use arrow keys to move between checkpoints.`}
        aria-valuemin={0}
        aria-valuemax={checkpoints.length - 1}
        aria-valuenow={focus ?? 0}
        aria-valuetext={
          focused ? `Mile ${focused.mile}, ${riskStyle(focused.level).label}` : 'No checkpoint'
        }
        onMouseMove={(event) => {
          const index = indexAt(event)
          if (usePlanner.getState().hoveredCheckpoint !== index) hoverCheckpoint(index)
        }}
        onMouseLeave={() => hoverCheckpoint(null)}
        onClick={(event) => selectCheckpoint(indexAt(event))}
        onKeyDown={onKeyDown}
        onBlur={() => hoverCheckpoint(null)}
      >
        <defs>
          <pattern
            id="no-data"
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="8" height="8" fill="#f1f5f9" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="#cbd5e1" strokeWidth="3" />
          </pattern>
        </defs>
        {checkpoints.map((cp) => {
          const h = barHeight(cp.level)
          const width = x(cp.covers[1]) - x(cp.covers[0])
          if (width <= 0) return null
          return (
            <rect
              key={cp.index}
              x={x(cp.covers[0])}
              y={HEIGHT - h}
              width={width}
              height={h}
              fill={cp.level === null ? 'url(#no-data)' : riskStyle(cp.level).color}
              opacity={focus === null || focus === cp.index ? 0.9 : 0.45}
            />
          )
        })}
        <line
          x1={0}
          x2={WIDTH}
          y1={referenceY}
          y2={referenceY}
          stroke="#94a3b8"
          strokeDasharray="6 5"
          vectorEffect="non-scaling-stroke"
        />
        {windPoints && (
          <polyline
            points={windPoints}
            fill="none"
            stroke="#334155"
            strokeWidth={1.5}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {focused && (
          <line
            x1={x(focused.mile)}
            x2={x(focused.mile)}
            y1={0}
            y2={HEIGHT}
            stroke="#0f172a"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      <div className="mt-1 flex justify-between text-[10px] text-slate-400 tabular-nums">
        <span>0 mi · {formatClock(departure, departure, timeZone)}</span>
        <span>
          {route.summary.distance_miles.toLocaleString()} mi ·{' '}
          {formatClock(new Date(route.arrival_time), departure, timeZone)}
        </span>
      </div>
    </figure>
  )
}
