import { ArrowDownUp, Route, Sparkles } from 'lucide-react'
import type { FormEvent, KeyboardEvent } from 'react'
import { ApiError } from '../../api/client'
import { usePlan } from '../../api/queries'
import { useNow } from '../../lib/useNow'
import { usePlanner } from '../../store/planner'
import { DepartureField } from './DepartureField'
import { EXAMPLE_TRIPS } from './examples'
import { IntervalField } from './IntervalField'
import { LoadField } from './LoadField'
import { PlaceField } from './PlaceField'
import { writeTripToUrl } from './urlState'
import {
  serverErrorsToFields,
  toTripRequest,
  validateDraft,
  type TripErrors,
  type TripField,
} from './validation'

const FIELD_ORDER: TripField[] = ['origin', 'destination', 'departure', 'load', 'interval']

export function TripForm() {
  const draft = usePlanner((s) => s.draft)
  const submittedTrip = usePlanner((s) => s.submittedTrip)
  const submitAttempted = usePlanner((s) => s.submitAttempted)
  const setSubmitAttempted = usePlanner((s) => s.setSubmitAttempted)
  const swapPlaces = usePlanner((s) => s.swapPlaces)
  const applyDraft = usePlanner((s) => s.applyDraft)
  const submit = usePlanner((s) => s.submit)
  const plan = usePlan(submittedTrip)
  const now = useNow()

  const clientErrors = validateDraft(draft, now)
  const serverErrors =
    plan.error instanceof ApiError && plan.error.status === 400
      ? serverErrorsToFields(plan.error.fieldErrors)
      : {}
  const errors: TripErrors = { ...serverErrors, ...(submitAttempted ? clientErrors : {}) }

  function onSubmit(event?: FormEvent) {
    event?.preventDefault()
    const firstInvalid = FIELD_ORDER.find((field) => clientErrors[field])
    if (firstInvalid) {
      setSubmitAttempted(true)
      document.getElementById(`field-${firstInvalid}`)?.focus()
      return
    }
    const trip = toTripRequest(draft)
    submit(trip)
    writeTripToUrl(trip)
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) onSubmit()
  }

  const isEmpty = !draft.origin && !draft.destination

  return (
    <form onSubmit={onSubmit} onKeyDown={onKeyDown} noValidate className="space-y-4">
      {isEmpty && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" aria-hidden />
            Try an example trip
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLE_TRIPS.map((example) => (
              <button
                key={example.name}
                type="button"
                onClick={() =>
                  applyDraft({ origin: example.origin, destination: example.destination })
                }
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
              >
                {example.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="relative space-y-3">
        <PlaceField
          role="origin"
          label="Start"
          placeholder="City, address or lat, lon"
          error={errors.origin}
        />
        <button
          type="button"
          onClick={swapPlaces}
          title="Swap start and destination"
          aria-label="Swap start and destination"
          className="absolute top-[42px] right-[-10px] z-10 rounded-full border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm transition hover:rotate-180 hover:text-sky-700 focus-visible:rotate-180"
        >
          <ArrowDownUp className="h-3.5 w-3.5" />
        </button>
        <PlaceField
          role="destination"
          label="Destination"
          placeholder="City, address or lat, lon"
          error={errors.destination}
        />
      </div>

      <DepartureField error={errors.departure} />
      <LoadField error={errors.load} />
      <IntervalField />

      <button
        type="submit"
        disabled={plan.isFetching}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:outline-none disabled:cursor-wait disabled:bg-sky-400"
      >
        <Route className="h-4 w-4" aria-hidden />
        {plan.isFetching ? 'Planning…' : 'Find the safest route'}
        <kbd className="ml-1 hidden rounded bg-sky-700/60 px-1.5 py-0.5 text-[10px] font-medium md:inline">
          ⌘↵
        </kbd>
      </button>
    </form>
  )
}
