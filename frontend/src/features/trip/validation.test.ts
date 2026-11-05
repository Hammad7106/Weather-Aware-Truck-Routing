import { describe, expect, it } from 'vitest'
import type { TripDraft } from '../../store/planner'
import { sameTrip, serverErrorsToFields, toTripRequest, validateDraft } from './validation'

const NOW = new Date('2026-11-08T12:00:00Z')
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString()

function draft(overrides: Partial<TripDraft> = {}): TripDraft {
  return {
    origin: { label: 'Calgary, AB', lat: 51.0447, lon: -114.0719 },
    destination: { label: 'Lethbridge, AB', lat: 49.6956, lon: -112.8451 },
    departure: hoursFromNow(2),
    loadLb: 35_000,
    intervalMiles: 25,
    ...overrides,
  }
}

describe('validateDraft', () => {
  it('accepts a complete trip', () => {
    expect(validateDraft(draft(), NOW)).toEqual({})
  })

  it('requires both places', () => {
    expect(validateDraft(draft({ origin: null, destination: null }), NOW)).toEqual({
      origin: 'Choose a starting point.',
      destination: 'Choose a destination.',
    })
  })

  it('waits for an address lookup to finish', () => {
    const resolving = { ...draft().origin!, resolving: true }
    expect(validateDraft(draft({ origin: resolving }), NOW).origin).toMatch(/Still looking up/)
  })

  it('rejects a destination less than a mile away', () => {
    const near = { label: 'Next door', lat: 51.045, lon: -114.072 }
    expect(validateDraft(draft({ destination: near }), NOW).destination).toMatch(/at least 1 mile/)
  })

  it.each([
    [-0.5, undefined],
    [-2, 'Departure is in the past.'],
    [24 * 7 - 1, undefined],
    [24 * 7 + 1, 'Departure must be within the next 7 days (forecast range).'],
  ])('departure %i h from now → %s', (hours, message) => {
    expect(validateDraft(draft({ departure: hoursFromNow(hours) }), NOW).departure).toBe(message)
  })

  it('requires a departure', () => {
    expect(validateDraft(draft({ departure: '' }), NOW).departure).toBe('Choose a departure time.')
  })

  it.each([-1, 80_001, 1.5])('rejects a load of %d lb', (loadLb) => {
    expect(validateDraft(draft({ loadLb }), NOW).load).toBeDefined()
  })
})

describe('toTripRequest', () => {
  it('builds the API request and drops form-only fields', () => {
    const request = toTripRequest(draft({ origin: { ...draft().origin!, resolving: false } }))
    expect(request).toEqual({
      origin: { label: 'Calgary, AB', lat: 51.0447, lon: -114.0719 },
      destination: { label: 'Lethbridge, AB', lat: 49.6956, lon: -112.8451 },
      departure_time: '2026-11-08T14:00:00.000Z',
      load_weight_lb: 35_000,
      checkpoint_interval_miles: 25,
    })
  })
})

describe('sameTrip', () => {
  const a = toTripRequest(draft())

  it('ignores differences below a minute and in labels', () => {
    const b = {
      ...a,
      origin: { ...a.origin, label: 'Calgary' },
      departure_time: '2026-11-08T14:00:45.000Z',
    }
    expect(sameTrip(a, b)).toBe(true)
  })

  it('notices a different load', () => {
    expect(sameTrip(a, { ...a, load_weight_lb: 20_000 })).toBe(false)
  })
})

describe('serverErrorsToFields', () => {
  it('maps API field names onto form fields', () => {
    expect(
      serverErrorsToFields({
        departure_time: ['Departure time is in the past.'],
        load_weight_lb: ['Ensure this value is less than or equal to 80000.'],
        unknown_field: ['ignored'],
      }),
    ).toEqual({
      departure: 'Departure time is in the past.',
      load: 'Ensure this value is less than or equal to 80000.',
    })
  })
})
