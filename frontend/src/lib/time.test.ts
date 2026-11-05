import { describe, expect, it } from 'vitest'
import {
  atLocalTime,
  formatClock,
  formatDuration,
  formatRelative,
  fromLocalInputValue,
  fromWallClock,
  isValidTimeZone,
  roundUp,
  sameMinute,
  timeZoneName,
  toLocalInputValue,
} from './time'

// Zones without daylight saving keep these tests stable as rules change; DST is tested on a
// historical date, whose rules are fixed.
const KARACHI = 'Asia/Karachi' // UTC+5
const KOLKATA = 'Asia/Kolkata' // UTC+5:30
const NEW_YORK = 'America/New_York'

describe('wall-clock conversion', () => {
  it('reads a moment on another zone’s clock', () => {
    const moment = new Date('2026-11-08T21:00:00Z')
    expect(toLocalInputValue(moment, KARACHI)).toBe('2026-11-09T02:00')
    expect(toLocalInputValue(moment, KOLKATA)).toBe('2026-11-09T02:30')
    expect(toLocalInputValue(moment)).toBe('2026-11-08T21:00') // tests run in UTC
  })

  it('turns a clock reading in a zone back into the same moment', () => {
    expect(fromLocalInputValue('2026-11-09T02:00', KARACHI)?.toISOString()).toBe(
      '2026-11-08T21:00:00.000Z',
    )
    const moment = new Date('2026-03-14T09:45:00Z')
    expect(fromLocalInputValue(toLocalInputValue(moment, KOLKATA), KOLKATA)).toEqual(moment)
  })

  it('handles daylight saving time', () => {
    // New York, 2024: EST (UTC−5) in January, EDT (UTC−4) after 10 March.
    expect(fromWallClock({ year: 2024, month: 1, day: 15, hour: 12, minute: 0 }, NEW_YORK)).toEqual(
      new Date('2024-01-15T17:00:00Z'),
    )
    expect(fromWallClock({ year: 2024, month: 3, day: 10, hour: 3, minute: 30 }, NEW_YORK)).toEqual(
      new Date('2024-03-10T07:30:00Z'),
    )
  })

  it('rejects malformed input', () => {
    expect(fromLocalInputValue('', KARACHI)).toBeNull()
    expect(fromLocalInputValue('tomorrow', KARACHI)).toBeNull()
  })
})

describe('atLocalTime', () => {
  it('gives tomorrow at an hour on the zone’s clock', () => {
    const base = new Date('2026-11-08T21:00:00Z') // already 9 Nov, 02:00 in Karachi
    expect(atLocalTime(base, 1, 6, KARACHI).toISOString()).toBe('2026-11-10T01:00:00.000Z')
  })

  it('rolls over month ends', () => {
    expect(atLocalTime(new Date('2026-01-31T12:00:00Z'), 1, 6, 'UTC').toISOString()).toBe(
      '2026-02-01T06:00:00.000Z',
    )
  })
})

describe('formatting', () => {
  it('adds the weekday only when the day differs, judged in the zone', () => {
    const departure = new Date('2026-11-08T21:00:00Z')
    const sameDayUtc = new Date('2026-11-08T23:00:00Z')
    expect(formatClock(sameDayUtc, departure, 'UTC')).toMatch(/^11:00\sPM$/u)
    // In Karachi the departure is already the 9th, so 23:00 UTC is also the 9th.
    expect(formatClock(sameDayUtc, departure, KARACHI)).toMatch(/^4:00\sAM$/u)
    expect(formatClock(new Date('2026-11-09T21:00:00Z'), departure, 'UTC')).toMatch(
      /^Mon\s9:00\sPM$/u,
    )
  })

  it('names the zone', () => {
    expect(timeZoneName(new Date('2026-11-08T21:00:00Z'), KARACHI)).toBe('GMT+5')
    expect(timeZoneName(new Date('2024-01-15T17:00:00Z'), NEW_YORK)).toBe('EST')
  })

  it.each([
    [0, '0 min'],
    [2700, '45 min'],
    [3600, '1 h'],
    [5400, '1 h 30 min'],
    [7 * 3600 + 24 * 60, '7 h 24 min'],
  ])('formats %i seconds as %s', (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text)
  })

  it('describes times relative to now', () => {
    const now = new Date('2026-11-08T12:00:00Z')
    expect(formatRelative(new Date('2026-11-08T12:00:20Z'), now)).toBe('now')
    expect(formatRelative(new Date('2026-11-08T15:15:00Z'), now)).toBe('in 3 h 15 min')
    expect(formatRelative(new Date('2026-11-08T11:48:00Z'), now)).toBe('12 min ago')
  })
})

describe('helpers', () => {
  it('rounds up to the next step', () => {
    expect(roundUp(new Date('2026-11-08T12:01:00Z'), 15).toISOString()).toBe(
      '2026-11-08T12:15:00.000Z',
    )
    expect(roundUp(new Date('2026-11-08T12:15:00Z'), 15).toISOString()).toBe(
      '2026-11-08T12:15:00.000Z',
    )
  })

  it('compares to the minute', () => {
    expect(sameMinute(new Date('2026-11-08T12:00:05Z'), new Date('2026-11-08T12:00:55Z'))).toBe(
      true,
    )
    expect(sameMinute(new Date('2026-11-08T12:00:55Z'), new Date('2026-11-08T12:01:00Z'))).toBe(
      false,
    )
  })

  it('validates zone names', () => {
    expect(isValidTimeZone('America/Edmonton')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false)
  })
})
