/**
 * Date and time helpers. Every formatter takes an optional IANA time zone (e.g.
 * "America/Denver"); without one, the browser's zone is used. Trip times are shown in the
 * start city's zone so a driver reads the clock they will actually see.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE

const pad = (n: number) => String(n).padStart(2, '0')

const formatters = new Map<string, Intl.DateTimeFormat>()

/** Intl formatters are costly to build; cache one per options + zone. */
function formatter(options: Intl.DateTimeFormatOptions, timeZone?: string, locale?: string) {
  const key = JSON.stringify([options, timeZone, locale])
  let cached = formatters.get(key)
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, { ...options, timeZone })
    formatters.set(key, cached)
  }
  return cached
}

/** Whether the runtime knows this IANA zone name. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone })
    return true
  } catch {
    return false
  }
}

interface WallClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

/** What a wall clock in `timeZone` reads at `date`. */
export function wallClock(date: Date, timeZone?: string): WallClock {
  const parts = formatter(
    {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    },
    timeZone,
    'en-US',
  ).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
  }
}

/** The moment a wall clock in `timeZone` shows the given reading (handles DST changes). */
export function fromWallClock(clock: WallClock, timeZone?: string): Date {
  const { year, month, day, hour, minute } = clock
  if (!timeZone) return new Date(year, month - 1, day, hour, minute)
  const asUtc = Date.UTC(year, month - 1, day, hour, minute)
  const offsetAt = (epoch: number) => {
    const c = wallClock(new Date(epoch), timeZone)
    return Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute) - epoch
  }
  const first = asUtc - offsetAt(asUtc)
  // Near a DST change the offset at the result can differ from the first guess.
  return new Date(asUtc - offsetAt(first))
}

/** Value for an <input type="datetime-local">, read on a clock in `timeZone`. */
export function toLocalInputValue(date: Date, timeZone?: string): string {
  const c = wallClock(date, timeZone)
  return `${c.year}-${pad(c.month)}-${pad(c.day)}T${pad(c.hour)}:${pad(c.minute)}`
}

/** Parse a datetime-local value read on a clock in `timeZone`. Null when empty or invalid. */
export function fromLocalInputValue(value: string, timeZone?: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!match) return null
  const [year, month, day, hour, minute] = match.slice(1).map(Number)
  const date = fromWallClock({ year, month, day, hour, minute }, timeZone)
  return Number.isNaN(date.getTime()) ? null : date
}

export function roundUp(date: Date, minutes: number): Date {
  const step = minutes * MINUTE
  return new Date(Math.ceil(date.getTime() / step) * step)
}

/** `hour`:00 on the day `dayOffset` days after `base`, on a clock in `timeZone`. */
export function atLocalTime(base: Date, dayOffset: number, hour: number, timeZone?: string): Date {
  const today = wallClock(base, timeZone)
  // Date.UTC normalises day overflow (e.g. the 32nd → the 1st of next month).
  const day = new Date(Date.UTC(today.year, today.month - 1, today.day + dayOffset))
  return fromWallClock(
    {
      year: day.getUTCFullYear(),
      month: day.getUTCMonth() + 1,
      day: day.getUTCDate(),
      hour,
      minute: 0,
    },
    timeZone,
  )
}

export const formatDateTime = (date: Date, timeZone?: string) =>
  formatter(
    { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
    timeZone,
  ).format(date)

export const formatTime = (date: Date, timeZone?: string) =>
  formatter({ hour: 'numeric', minute: '2-digit' }, timeZone).format(date)

const dayKey = (date: Date, timeZone?: string) => {
  const c = wallClock(date, timeZone)
  return `${c.year}-${c.month}-${c.day}`
}

/** "2:15 PM", or "Fri 2:15 PM" when not on the same day as `reference` (in `timeZone`). */
export function formatClock(date: Date, reference: Date, timeZone?: string): string {
  if (dayKey(date, timeZone) === dayKey(reference, timeZone)) return formatTime(date, timeZone)
  return `${formatter({ weekday: 'short' }, timeZone).format(date)} ${formatTime(date, timeZone)}`
}

/** Short zone label at `date`, e.g. "MST" (US zones) or "GMT+5". */
export function timeZoneName(date: Date, timeZone?: string): string {
  const part = formatter({ timeZoneName: 'short' }, timeZone, 'en-US')
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName')
  return part?.value ?? ''
}

/** "7 h 24 min", "45 min". */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** "in 3 h 15 min", "12 min ago", "now". */
export function formatRelative(date: Date, now: Date): string {
  const diff = date.getTime() - now.getTime()
  if (Math.abs(diff) < MINUTE) return 'now'
  const text = formatDuration(Math.abs(diff) / 1000)
  return diff > 0 ? `in ${text}` : `${text} ago`
}

export const DEPARTURE_WINDOW = { pastGraceMs: HOUR, futureMs: 7 * 24 * HOUR }

/** Same minute: departure times are compared at the precision the form shows. */
export const sameMinute = (a: Date, b: Date) =>
  Math.floor(a.getTime() / MINUTE) === Math.floor(b.getTime() / MINUTE)

export interface DeparturePreset {
  label: string
  value: (now: Date, timeZone?: string) => Date
}

export const DEPARTURE_PRESETS: DeparturePreset[] = [
  { label: 'Now', value: (now) => roundUp(now, 5) },
  { label: '+3 h', value: (now) => roundUp(new Date(now.getTime() + 3 * HOUR), 15) },
  { label: 'Tomorrow 6 AM', value: (now, tz) => atLocalTime(now, 1, 6, tz) },
  { label: 'Tomorrow 6 PM', value: (now, tz) => atLocalTime(now, 1, 18, tz) },
]
