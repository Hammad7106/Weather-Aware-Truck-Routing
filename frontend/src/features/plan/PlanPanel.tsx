import { AlertTriangle, Check, LoaderCircle, RefreshCw, RotateCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ApiError } from '../../api/client'
import { cn } from '../../lib/cn'
import { useNow } from '../../lib/useNow'
import { usePlanProgress } from '../../store/planProgress'
import { usePlanner } from '../../store/planner'
import { useSubmitTrip } from '../trip/useSubmitTrip'
import { sameTrip, toTripRequest, validateDraft } from '../trip/validation'
import { BestDeparture } from './BestDeparture'
import { RecommendationCard } from './RecommendationCard'
import { RouteCard } from './RouteCard'
import { RouteDetails } from './RouteDetails'
import { useCurrentPlan, useSelectedRouteId } from './useCurrentPlan'

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

/** True when the form now describes a different (valid) trip than the one on screen. */
function useFormChanged(): boolean {
  const draft = usePlanner((s) => s.draft)
  const submitted = usePlanner((s) => s.submittedTrip)
  const now = useNow()
  if (!submitted || Object.keys(validateDraft(draft, now)).length > 0) return false
  return !sameTrip(toTripRequest(draft), submitted)
}

/** Loading, error and result states for the submitted trip. */
export function PlanPanel() {
  const trip = usePlanner((s) => s.submittedTrip)
  const plan = useCurrentPlan()
  const selectedId = useSelectedRouteId(plan.data)
  const elapsed = useElapsedSeconds(plan.isFetching)
  const formChanged = useFormChanged()
  const submitTrip = useSubmitTrip()

  if (!trip) return null

  if (plan.isPending || (plan.isFetching && !plan.data)) {
    return (
      <div
        className="rounded-xl border border-slate-200 bg-white p-4"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <LoaderCircle className="h-4 w-4 animate-spin text-sky-600" aria-hidden />
          Planning your trip… <span className="text-slate-400 tabular-nums">{elapsed}s</span>
        </div>
        <PlanSteps />
        {elapsed >= 8 && (
          <p className="mt-2 text-xs text-amber-700">
            The server may be waking up after being idle. This can take up to a minute.
          </p>
        )}
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-100" />
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
      <div className="rounded-xl border border-red-200 bg-red-50 p-4" role="alert">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
          <div>
            <p className="text-sm font-medium text-red-900">Couldn’t plan this trip</p>
            <p className="mt-0.5 text-xs text-red-800">{error.message}</p>
          </div>
        </div>
        {!(error instanceof ApiError) || error.isTransient || error.code.startsWith('weather_') ? (
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

  const data = plan.data
  const routes = [...data.routes].sort((a, b) => a.rank - b.rank)
  const selectedRoute = routes.find((route) => route.id === selectedId)

  return (
    <section aria-label="Results" className="space-y-3">
      {formChanged && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">
          You changed the trip. These results are for the previous one.
          <button
            type="button"
            onClick={submitTrip}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-sky-600 px-2 py-1 font-medium text-white hover:bg-sky-700"
          >
            <RefreshCw className="h-3 w-3" aria-hidden /> Update
          </button>
        </div>
      )}

      <div className={formChanged ? 'space-y-3 opacity-60 transition' : 'space-y-3 transition'}>
        <RecommendationCard plan={data} />
        <BestDeparture plan={data} />

        <div>
          <h2 className="mb-2 flex items-baseline justify-between text-xs font-semibold tracking-wide text-slate-500 uppercase">
            {routes.length} route {routes.length === 1 ? 'option' : 'options'}
            <span className="font-normal tracking-normal normal-case">
              {plan.isFetching ? 'Refreshing…' : 'Click a route to inspect it'}
            </span>
          </h2>
          <div role="radiogroup" aria-label="Route options" className="space-y-2">
            {routes.map((route) => (
              <RouteCard
                key={route.id}
                route={route}
                recommended={route.id === data.recommendation.route_id}
                selected={route.id === selectedId}
              />
            ))}
          </div>
          {selectedRoute && (
            <div className="mt-4">
              <RouteDetails route={selectedRoute} />
            </div>
          )}
          {routes.length < 3 && (
            <p className="mt-2 text-xs text-slate-500">
              The routing service found only {routes.length} distinct{' '}
              {routes.length === 1 ? 'route' : 'routes'} for this trip.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

const STEPS = [
  { stage: 'routes', label: 'Finding truck routes' },
  { stage: 'weather', label: 'Checking the forecast at every checkpoint' },
  { stage: 'rating', label: 'Rating the routes' },
] as const

/** The steps of planning, with the current one highlighted. */
function PlanSteps() {
  const stage = usePlanProgress((s) => s.stage)
  const current = STEPS.findIndex((step) => step.stage === stage)
  return (
    <ol className="mt-2 space-y-1 text-xs">
      {STEPS.map((step, i) => (
        <li
          key={step.stage}
          className={cn(
            'flex items-center gap-1.5',
            i < current
              ? 'text-emerald-700'
              : i === current
                ? 'font-medium text-slate-800'
                : 'text-slate-400',
          )}
        >
          {i < current ? (
            <Check className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <span
              className={cn(
                'mx-1 h-1.5 w-1.5 rounded-full',
                i === current ? 'bg-sky-600' : 'bg-slate-300',
              )}
              aria-hidden
            />
          )}
          {step.label}
        </li>
      ))}
    </ol>
  )
}
