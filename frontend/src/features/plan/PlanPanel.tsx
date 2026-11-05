import { AlertTriangle, LoaderCircle, RotateCw, Truck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ApiError } from '../../api/client'
import { usePlan } from '../../api/queries'
import { formatDuration } from '../../lib/time'
import { usePlanner } from '../../store/planner'

function useElapsedSeconds(running: boolean): number {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!running) return
    const started = Date.now()
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    )
    return () => {
      window.clearInterval(timer)
      setElapsed(0)
    }
  }, [running])
  return elapsed
}

/** Loading, error and result states for the submitted trip. */
export function PlanPanel() {
  const trip = usePlanner((s) => s.submittedTrip)
  const plan = usePlan(trip)
  const elapsed = useElapsedSeconds(plan.isFetching)

  if (!trip) return null

  if (plan.isPending || (plan.isFetching && !plan.data)) {
    return (
      <div
        className="rounded-lg border border-slate-200 bg-white p-4"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <LoaderCircle className="h-4 w-4 animate-spin text-sky-600" aria-hidden />
          Planning your trip… <span className="text-slate-400 tabular-nums">{elapsed}s</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Finding truck routes and checking the forecast at every checkpoint.
        </p>
        {elapsed >= 8 && (
          <p className="mt-2 text-xs text-amber-700">
            The server may be waking up after being idle. This can take up to a minute.
          </p>
        )}
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-slate-100" />
          ))}
        </div>
      </div>
    )
  }

  if (plan.isError) {
    const error = plan.error
    // Field problems are shown on the form itself.
    if (error instanceof ApiError && error.status === 400) return null
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4" role="alert">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
          <div>
            <p className="text-sm font-medium text-red-900">Couldn’t plan this trip</p>
            <p className="mt-0.5 text-xs text-red-800">{error.message}</p>
          </div>
        </div>
        {!(error instanceof ApiError) || error.isTransient ? (
          <button
            type="button"
            onClick={() => void plan.refetch()}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100"
          >
            <RotateCw className="h-3.5 w-3.5" aria-hidden /> Try again
          </button>
        ) : null}
      </div>
    )
  }

  // Interim result list; route cards with risk breakdowns arrive in Batch 5.
  const routes = [...plan.data.routes].sort((a, b) => a.rank - b.rank)
  return (
    <section aria-label="Route options" className="space-y-2">
      <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {routes.length} route {routes.length === 1 ? 'option' : 'options'}
      </h2>
      {routes.map((route) => (
        <div key={route.id} className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <Truck className="h-4 w-4 text-slate-400" aria-hidden />
              {route.name}
            </span>
            {route.rank === 1 && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                Recommended
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {route.via.length ? `via ${route.via.join(' · ')} · ` : ''}
            {route.summary.distance_miles.toLocaleString()} mi ·{' '}
            {formatDuration(route.summary.duration_s)}
          </p>
        </div>
      ))}
    </section>
  )
}
