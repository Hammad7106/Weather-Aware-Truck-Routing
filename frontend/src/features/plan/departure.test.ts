import { describe, expect, it } from 'vitest'
import type { DepartureOption, RouteSummary } from '../../api/types'
import { describeImprovement, levelShares } from './departure'

function option(miles: Partial<RouteSummary['miles_by_level']>, averageRisk = 0): DepartureOption {
  const miles_by_level = { low: 0, moderate: 0, high: 0, severe: 0, no_travel: 0, ...miles }
  return {
    offset_hours: 0,
    departure_time: '2026-11-08T21:00:00Z',
    arrival_time: '2026-11-08T23:00:00Z',
    route_id: 'A',
    summary: {
      distance_miles: Object.values(miles_by_level).reduce((a, b) => a + b, 0),
      duration_s: 7200,
      miles_by_level,
      no_data_miles: 0,
      average_risk: averageRisk,
      peak_level: 0,
    },
  }
}

describe('describeImprovement', () => {
  it('names the first risk level that improves', () => {
    expect(describeImprovement(option({ severe: 25, low: 75 }), option({ low: 100 }))).toBe(
      '0 Severe miles instead of 25',
    )
  })

  it('puts No Travel before Severe', () => {
    expect(
      describeImprovement(option({ no_travel: 10, low: 90 }), option({ severe: 40, low: 60 })),
    ).toBe('0 No Travel miles instead of 10')
  })

  it('falls back to average risk when the mile counts tie', () => {
    expect(describeImprovement(option({ low: 100 }, 0.5), option({ low: 100 }, 0.2))).toBe(
      'average risk 0.20 instead of 0.50',
    )
  })

  it('returns null when waiting is not better', () => {
    expect(describeImprovement(option({ low: 100 }), option({ low: 100 }))).toBeNull()
    expect(describeImprovement(option({ low: 100 }), option({ high: 5, low: 95 }))).toBeNull()
  })
})

describe('levelShares', () => {
  it('gives each level its share of the route', () => {
    const shares = levelShares(option({ low: 75, severe: 25 }))
    expect(shares.find((s) => s.key === 'severe')?.share).toBe(0.25)
    expect(shares.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1)
  })
})
