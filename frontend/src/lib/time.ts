const MINUTE = 60_000
const HOUR = 60 * MINUTE

const pad = (n: number) => String(n).padStart(2, '0')

/** Value for an <input type="datetime-local">, in the browser's time zone. */
export function toLocalInputValue(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/** Parse a datetime-local value (browser time zone). Returns null when empty or invalid. */
export function fromLocalInputValue(value: string): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function roundUp(date: Date, minutes: number): Date {
  const step = minutes * MINUTE
  return new Date(Math.ceil(date.getTime() / step) * step)
}

export function atLocalTime(base: Date, dayOffset: number, hour: number): Date {
  const date = new Date(base)
  date.setDate(date.getDate() + dayOffset)
  date.setHours(hour, 0, 0, 0)
  return date
}

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short' })

export const formatDateTime = (date: Date) => dateTimeFormat.format(date)
export const formatTime = (date: Date) => timeFormat.format(date)

/** "2:15 PM", or "Fri 2:15 PM" when not on the same day as `reference`. */
export function formatClock(date: Date, reference: Date): string {
  return date.toDateString() === reference.toDateString()
    ? formatTime(date)
    : `${dayFormat.format(date)} ${formatTime(date)}`
}

export function timeZoneName(date = new Date()): string {
  const part = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
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

export interface DeparturePreset {
  label: string
  value: (now: Date) => Date
}

export const DEPARTURE_PRESETS: DeparturePreset[] = [
  { label: 'Now', value: (now) => roundUp(now, 5) },
  { label: '+3 h', value: (now) => roundUp(new Date(now.getTime() + 3 * HOUR), 15) },
  { label: 'Tomorrow 6 AM', value: (now) => atLocalTime(now, 1, 6) },
  { label: 'Tomorrow 6 PM', value: (now) => atLocalTime(now, 1, 18) },
]
