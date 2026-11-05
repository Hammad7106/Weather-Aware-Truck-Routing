import { CircleCheck, CircleSlash, Minus, OctagonAlert, ShieldCheck } from 'lucide-react'
import type { TripPlan } from '../../api/types'
import { cn } from '../../lib/cn'
import { DEPARTURE_WINDOW, formatDateTime } from '../../lib/time'
import { usePlanner } from '../../store/planner'
import { useReplanAt } from '../trip/useReplanAt'
import { useTripTimeZone } from '../trip/useTimeZone'
import { RiskRulesButton } from '../rules/RiskRulesDialog'
import { explainRecommendation } from './recommendation'

const DELAY_OPTIONS_HOURS = [6, 12, 24]

/** Why the recommended route won, step by step through the ranking order. */
export function RecommendationCard({ plan }: { plan: TripPlan }) {
  const { headline, reasons } = explainRecommendation(plan)
  const rec = plan.recommendation

  if (rec.no_safe_route) return <NoSafeRoute plan={plan} />

  return (
    <section
      aria-label="Recommendation"
      className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3"
    >
      <p className="flex items-start gap-2 text-sm font-semibold text-emerald-950">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
        {headline}
      </p>
      {reasons.length > 0 && (
        <ol className="mt-2 space-y-1 pl-6">
          {reasons.map((reason) => (
            <li
              key={reason.criterion}
              className={cn(
                'flex items-start gap-1.5 text-xs',
                reason.decisive ? 'font-medium text-emerald-900' : 'text-slate-500',
              )}
            >
              {reason.decisive ? (
                <CircleCheck className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
              ) : (
                <Minus className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
              )}
              {reason.text}
            </li>
          ))}
        </ol>
      )}
      <p className="mt-2 pl-6 text-[11px] text-slate-500">
        Ranked by No Travel miles, then Severe, High, average risk and drive time.{' '}
        <RiskRulesButton className="align-middle" />
      </p>
    </section>
  )
}

function NoSafeRoute({ plan }: { plan: TripPlan }) {
  const trip = usePlanner((s) => s.submittedTrip)
  const replanAt = useReplanAt()
  const timeZone = useTripTimeZone()
  const best = plan.routes.find((r) => r.id === plan.recommendation.route_id)
  const latest = Date.now() + DEPARTURE_WINDOW.futureMs

  function departLater(hours: number) {
    if (trip) replanAt(new Date(new Date(trip.departure_time).getTime() + hours * 3_600_000))
  }

  return (
    <section
      role="alert"
      aria-label="No safe route"
      className="rounded-xl border border-purple-300 bg-purple-50 p-3"
    >
      <p className="flex items-start gap-2 text-sm font-semibold text-purple-950">
        <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0 text-purple-700" aria-hidden />
        No route is safe at this departure time.
      </p>
      <p className="mt-1 pl-6 text-xs text-purple-900">
        Every option crosses No Travel conditions. {best?.name} has the least exposure (
        {best?.summary.miles_by_level.no_travel} mi of No Travel), but waiting is safer.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-6">
        <span className="text-[11px] font-medium text-purple-900">Try departing</span>
        {DELAY_OPTIONS_HOURS.map((hours) => {
          const departure = trip ? new Date(trip.departure_time).getTime() + hours * 3_600_000 : 0
          const tooLate = departure > latest
          return (
            <button
              key={hours}
              type="button"
              disabled={tooLate}
              title={
                tooLate
                  ? 'Beyond the 7-day forecast'
                  : formatDateTime(new Date(departure), timeZone)
              }
              onClick={() => departLater(hours)}
              className="inline-flex items-center gap-1 rounded-full border border-purple-300 bg-white px-2.5 py-1 text-xs font-medium text-purple-800 transition hover:bg-purple-100 disabled:opacity-40"
            >
              {tooLate && <CircleSlash className="h-3 w-3" aria-hidden />}+{hours} h
            </button>
          )
        })}
      </div>
    </section>
  )
}
