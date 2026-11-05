import { CloudSun, EyeOff, LoaderCircle, Pause, Play, RotateCw, Square, Truck } from 'lucide-react'
import { useEffect } from 'react'
import type { RouteOption, TripPlan } from '../../api/types'
import { cn } from '../../lib/cn'
import { RiskBadge } from '../../components/RiskBadge'
import { formatClock, formatDuration } from '../../lib/time'
import { MAX_HOUR, useHeatmap, type HeatmapMetric } from '../../store/heatmap'
import { usePlanner } from '../../store/planner'
import { useTripTimeZone } from '../trip/useTimeZone'
import { corridorStart } from './corridor'
import { METRICS, toWeight } from './metrics'
import { useCorridorWeather } from './useCorridorWeather'
import { useDriveAnimation } from './useDriveAnimation'

const PLAY_STEP_MS = 450
const METRIC_ORDER: HeatmapMetric[] = ['risk', 'wind', 'rain', 'snow']

/** Advance the slider an hour at a time while playing, looping back to departure. */
function usePlayback() {
  const playing = useHeatmap((s) => s.playing)
  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      const { hour, setHour } = useHeatmap.getState()
      setHour(hour >= MAX_HOUR ? 0 : hour + 1)
    }, PLAY_STEP_MS)
    return () => window.clearInterval(timer)
  }, [playing])
}

/** Forecast slider and controls for the corridor weather heatmap. */
export function HeatmapPanel({ plan, route }: { plan: TripPlan; route: RouteOption | undefined }) {
  const {
    visible,
    metric,
    hour,
    playing,
    setVisible,
    setMetric,
    setHour,
    setPlaying,
    setDriveSeconds,
  } = useHeatmap()
  const corridor = useCorridorWeather(plan, visible)
  const timeZone = useTripTimeZone()
  usePlayback()
  useDriveAnimation(plan, route)

  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => setVisible(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-md backdrop-blur hover:bg-white"
      >
        <CloudSun className="h-4 w-4 text-sky-600" aria-hidden />
        Show weather heatmap
      </button>
    )
  }

  const start = corridorStart(plan.departure_time)
  const departure = new Date(plan.departure_time)
  const now = new Date(start.getTime() + hour * 3_600_000)

  // The selected route's driving window, shaded on the slider track.
  const departHour = (departure.getTime() - start.getTime()) / 3_600_000
  const arriveHour = route ? departHour + route.summary.duration_s / 3600 : departHour
  const pct = (h: number) => `${(Math.min(MAX_HOUR, Math.max(0, h)) / MAX_HOUR) * 100}%`
  const track = `linear-gradient(to right, #e2e8f0 ${pct(departHour)}, #93c5fd ${pct(departHour)}, #93c5fd ${pct(arriveHour)}, #e2e8f0 ${pct(arriveHour)})`

  return (
    <section
      aria-label="Weather heatmap"
      className="w-[calc(100vw-4.25rem)] max-w-[440px] rounded-xl bg-white/95 p-3 shadow-lg backdrop-blur md:w-[min(440px,calc(100vw-2rem))]"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
          <CloudSun className="h-4 w-4 text-sky-600" aria-hidden />
          Corridor forecast
          {corridor.isFetching && (
            <LoaderCircle
              className="h-3.5 w-3.5 animate-spin text-slate-400"
              aria-label="Loading"
            />
          )}
        </h2>
        <div className="flex items-center gap-1">
          <div
            role="radiogroup"
            aria-label="Heatmap shows"
            className="flex rounded-md bg-slate-100 p-0.5"
          >
            {METRIC_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={metric === key}
                onClick={() => setMetric(key)}
                className={cn(
                  'rounded px-2 py-0.5 text-[11px] font-medium transition',
                  metric === key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800',
                )}
              >
                {METRICS[key].label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setVisible(false)}
            title="Hide heatmap"
            aria-label="Hide heatmap"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <EyeOff className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {corridor.isError ? (
        <div className="mt-2 flex items-center justify-between rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-800">
          Couldn’t load the corridor forecast.
          <button
            type="button"
            onClick={() => void corridor.refetch()}
            className="inline-flex items-center gap-1 font-medium hover:underline"
          >
            <RotateCw className="h-3 w-3" aria-hidden /> Retry
          </button>
        </div>
      ) : (
        <>
          <div className="mt-2.5 flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setPlaying(!playing)}
              disabled={!corridor.data}
              aria-label={playing ? 'Pause' : 'Play forecast'}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white shadow-sm transition hover:bg-sky-700 disabled:bg-slate-300"
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
            </button>
            <div className="min-w-0 flex-1">
              <input
                type="range"
                min={0}
                max={MAX_HOUR}
                step={1}
                value={hour}
                onChange={(event) => {
                  setPlaying(false)
                  setDriveSeconds(null)
                  setHour(Number(event.target.value))
                }}
                aria-label="Forecast hour"
                aria-valuetext={`${formatClock(now, departure, timeZone)}, ${hour} hours after departure`}
                className="hour-slider w-full"
                style={{ background: track }}
              />
              <div className="mt-0.5 flex justify-between text-[10px] text-slate-400 tabular-nums">
                <span>0 h</span>
                <span>24 h</span>
                <span>48 h</span>
              </div>
            </div>
            <div className="w-24 shrink-0 text-right" aria-live="off">
              <p className="text-sm font-semibold text-slate-900 tabular-nums">
                {formatClock(now, departure, timeZone)}
              </p>
              <p className="text-[11px] text-slate-500">+{hour} h</p>
            </div>
          </div>

          {route && <DriveControls route={route} disabled={!corridor.data} />}

          <MetricLegend metric={metric} />
        </>
      )}
    </section>
  )
}

/** "Follow the truck": drive the selected route with the heatmap on the truck's clock. */
function DriveControls({ route, disabled }: { route: RouteOption; disabled: boolean }) {
  const driveSeconds = useHeatmap((s) => s.driveSeconds)
  const setDriveSeconds = useHeatmap((s) => s.setDriveSeconds)
  const passing = usePlanner((s) => s.hoveredCheckpoint)
  const checkpoint = passing === null ? null : route.checkpoints[passing]

  if (driveSeconds === null) {
    return (
      <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
        <button
          type="button"
          onClick={() => setDriveSeconds(0)}
          disabled={disabled}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 font-medium text-white shadow-sm transition hover:bg-slate-700 disabled:bg-slate-300"
        >
          <Truck className="h-3.5 w-3.5" aria-hidden /> Drive {route.name}
        </button>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-3 rounded-full bg-blue-300" aria-hidden />
          Shaded: hours on the road
        </span>
      </div>
    )
  }

  return (
    <div
      className="mt-2 flex items-center gap-2 rounded-lg bg-slate-900 px-2 py-1.5 text-[11px] text-white"
      role="status"
    >
      <button
        type="button"
        onClick={() => setDriveSeconds(null)}
        aria-label="Stop driving"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
      >
        <Square className="h-3 w-3 fill-current" aria-hidden />
      </button>
      <Truck className="h-3.5 w-3.5 shrink-0 text-sky-300" aria-hidden />
      <span className="min-w-0 flex-1 truncate tabular-nums">
        {route.name} · {formatDuration(driveSeconds)} in
        {checkpoint && checkpoint.index > 0 && ` · mile ${Math.round(checkpoint.mile)}`}
      </span>
      {checkpoint && <RiskBadge level={checkpoint.level} />}
      <span className="h-1 w-14 shrink-0 overflow-hidden rounded-full bg-white/20" aria-hidden>
        <span
          className="block h-full bg-sky-400"
          style={{ width: `${(driveSeconds / route.summary.duration_s) * 100}%` }}
        />
      </span>
    </div>
  )
}

/** Colour ramp for the active metric, with ticks at the risk thresholds. */
function MetricLegend({ metric: key }: { metric: HeatmapMetric }) {
  const metric = METRICS[key]
  const last = toWeight(metric, metric.stops[metric.stops.length - 1].value)
  const first = toWeight(metric, metric.stops[0].value)
  const pos = (value: number) => ((toWeight(metric, value) - first) / (last - first)) * 100
  const gradient = metric.stops
    .map((stop) => `${stop.color.replace(/[\d.]+\)$/, '1)')} ${pos(stop.value)}%`)
    .join(', ')

  return (
    <div className="mt-2.5">
      <div
        className="h-2 rounded-full"
        style={{ background: `linear-gradient(to right, ${gradient})` }}
      />
      <div className="relative mt-0.5 h-3.5 text-[10px] text-slate-500">
        {metric.ticks.map((tick) => (
          <span
            key={tick}
            className="absolute -translate-x-1/2 whitespace-nowrap tabular-nums"
            style={{ left: `${Math.min(94, Math.max(6, pos(tick)))}%` }}
          >
            {metric.key === 'risk' ? metric.format(tick) : tick}
          </span>
        ))}
      </div>
      {metric.unit && <p className="text-right text-[10px] text-slate-400">{metric.unit}</p>}
    </div>
  )
}
