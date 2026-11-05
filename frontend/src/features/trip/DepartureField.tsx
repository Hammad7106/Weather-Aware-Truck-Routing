import { CalendarClock } from 'lucide-react'
import { cn } from '../../lib/cn'
import {
  DEPARTURE_PRESETS,
  DEPARTURE_WINDOW,
  formatDateTime,
  formatRelative,
  fromLocalInputValue,
  sameMinute,
  timeZoneName,
  toLocalInputValue,
} from '../../lib/time'
import { useNow } from '../../lib/useNow'
import { usePlanner } from '../../store/planner'
import { useDraftTimeZone } from './useTimeZone'

/** Departure time, entered and shown on the start city's clock. */
export function DepartureField({ error }: { error?: string }) {
  const departure = usePlanner((s) => s.draft.departure)
  const setDeparture = usePlanner((s) => s.setDeparture)
  const timeZone = useDraftTimeZone()
  const now = useNow()
  const date = departure ? new Date(departure) : null
  const valid = date !== null && !Number.isNaN(date.getTime())
  const zoneLabel = valid ? timeZoneName(date, timeZone) : ''

  return (
    <div>
      <label
        htmlFor="field-departure"
        className="mb-1 flex items-baseline justify-between text-xs font-medium text-slate-600"
      >
        Departure
        {zoneLabel && (
          <span className="font-normal text-slate-400">
            {timeZone ? `start city time (${zoneLabel})` : `your time (${zoneLabel})`}
          </span>
        )}
      </label>
      <div
        className={cn(
          'flex items-center rounded-lg border bg-white shadow-sm focus-within:ring-2',
          error
            ? 'border-red-300 focus-within:ring-red-200'
            : 'border-slate-300 focus-within:border-sky-500 focus-within:ring-sky-100',
        )}
      >
        <CalendarClock className="ml-2.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <input
          id="field-departure"
          type="datetime-local"
          step={300}
          min={toLocalInputValue(new Date(now.getTime() - DEPARTURE_WINDOW.pastGraceMs), timeZone)}
          max={toLocalInputValue(new Date(now.getTime() + DEPARTURE_WINDOW.futureMs), timeZone)}
          value={valid ? toLocalInputValue(date, timeZone) : ''}
          onChange={(event) =>
            setDeparture(fromLocalInputValue(event.target.value, timeZone)?.toISOString() ?? '')
          }
          aria-invalid={Boolean(error)}
          aria-describedby="departure-hint"
          className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-sm text-slate-900 outline-none"
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Departure shortcuts">
        {DEPARTURE_PRESETS.map((preset) => {
          const value = preset.value(now, timeZone)
          const selected = valid && sameMinute(value, date)
          return (
            <button
              key={preset.label}
              type="button"
              aria-pressed={selected}
              onClick={() => setDeparture(value.toISOString())}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition',
                selected
                  ? 'border-sky-500 bg-sky-50 text-sky-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
              )}
            >
              {preset.label}
            </button>
          )
        })}
      </div>

      <p
        id="departure-hint"
        className={cn('mt-1.5 text-xs', error ? 'text-red-600' : 'text-slate-500')}
      >
        {error ??
          (valid
            ? `${formatDateTime(date, timeZone)} ${zoneLabel} · ${formatRelative(date, now)}`
            : 'Up to 7 days ahead.')}
      </p>
    </div>
  )
}
