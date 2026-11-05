import { ArrowRight, CalendarClock, Check, Link2, Pencil, Ruler, Weight } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { TripRequest } from '../../api/types'
import { cn } from '../../lib/cn'
import { formatDateTime, timeZoneName } from '../../lib/time'
import { usePlanner } from '../../store/planner'
import { ROLE_STYLE } from './roleStyle'
import { useTripTimeZone } from './useTimeZone'

/** One-line summary of the planned trip, shown instead of the form once results are in. */
export function TripSummary({ trip }: { trip: TripRequest }) {
  const setFormOpen = usePlanner((s) => s.setFormOpen)
  const timeZone = useTripTimeZone()
  const departure = new Date(trip.departure_time)

  return (
    <section
      aria-label="Planned trip"
      className="rounded-xl border border-slate-200 bg-slate-50 p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-semibold text-slate-900">
          <Dot role="origin" />
          <span className="truncate">{trip.origin.label}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          <Dot role="destination" />
          <span className="truncate">{trip.destination.label}</span>
        </p>
        <div className="flex shrink-0 gap-1">
          <CopyLinkButton />
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-100"
          >
            <Pencil className="h-3 w-3" aria-hidden /> Edit
          </button>
        </div>
      </div>
      <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="h-3 w-3" aria-hidden />
          {formatDateTime(departure, timeZone)} {timeZoneName(departure, timeZone)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Weight className="h-3 w-3" aria-hidden />
          {trip.load_weight_lb.toLocaleString()} lb
        </span>
        <span className="inline-flex items-center gap-1">
          <Ruler className="h-3 w-3" aria-hidden />
          every {trip.checkpoint_interval_miles} mi
        </span>
      </p>
    </section>
  )
}

const COPIED_MS = 2000

/** Copies the shareable trip URL (the page URL always describes the planned trip). */
function CopyLinkButton() {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function copy() {
    const url = window.location.href
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // Clipboard can be blocked (permissions, insecure context): let the user copy by hand.
      window.prompt('Copy this link to share the trip:', url)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium shadow-sm transition',
        copied
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100',
      )}
    >
      {copied ? (
        <Check className="h-3 w-3" aria-hidden />
      ) : (
        <Link2 className="h-3 w-3" aria-hidden />
      )}
      {copied ? 'Copied' : 'Copy link'}
    </button>
  )
}

function Dot({ role }: { role: 'origin' | 'destination' }) {
  const style = ROLE_STYLE[role]
  return (
    <span
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ${style.bg}`}
      aria-hidden
    >
      {style.letter}
    </span>
  )
}
