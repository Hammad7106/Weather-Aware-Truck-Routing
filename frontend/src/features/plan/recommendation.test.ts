import { describe, expect, it } from 'vitest'
import type { Comparison, Recommendation } from '../../api/types'
import { makePlan, makeRoute } from '../../test/fixtures'
import { explainRecommendation } from './recommendation'

const twoRoutes = [makeRoute({ id: 'A', name: 'Route A' }), makeRoute({ id: 'B', name: 'Route B' })]

function planWith(recommendation: Partial<Recommendation>) {
  return makePlan({
    routes: twoRoutes,
    recommendation: {
      route_id: 'A',
      runner_up_id: 'B',
      decided_by: null,
      no_safe_route: false,
      comparisons: [],
      ...recommendation,
    },
  })
}

const tie = (criterion: Comparison['criterion'], label: string, value: number): Comparison => ({
  criterion,
  label,
  winner: value,
  runner_up: value,
  decisive: false,
})

describe('explainRecommendation', () => {
  it('handles a single route', () => {
    expect(explainRecommendation(makePlan())).toEqual({
      headline: 'Route A is the only route found for this trip.',
      reasons: [],
    })
  })

  it('names the deciding criterion and lists the ties before it', () => {
    const { headline, reasons } = explainRecommendation(
      planWith({
        decided_by: 'severe_miles',
        comparisons: [
          tie('no_travel_miles', 'No Travel miles', 0),
          {
            criterion: 'severe_miles',
            label: 'Severe miles',
            winner: 0,
            runner_up: 12.5,
            decisive: true,
          },
        ],
      }),
    )

    expect(headline).toBe('Route A has fewer Severe miles than Route B.')
    expect(reasons.map((r) => r.text)).toEqual([
      'Tied on No Travel miles (0 mi)',
      'Fewer Severe miles: 0 mi vs 12.5 mi on Route B',
    ])
    expect(reasons.map((r) => r.decisive)).toEqual([false, true])
  })

  it('explains a win on drive time when the weather risk ties', () => {
    const { headline, reasons } = explainRecommendation(
      planWith({
        decided_by: 'travel_time',
        comparisons: [
          {
            criterion: 'travel_time',
            label: 'Travel time',
            winner: 7200,
            runner_up: 9000,
            decisive: true,
          },
        ],
      }),
    )

    expect(headline).toBe(
      'Weather risk is the same on the top routes, so Route A wins on drive time.',
    )
    expect(reasons[0].text).toBe('A shorter drive time: 2 h vs 2 h 30 min on Route B')
  })

  it('reports a complete tie', () => {
    expect(explainRecommendation(planWith({ decided_by: null })).headline).toBe(
      'Route A and Route B tie on every criterion.',
    )
  })

  it('shows missing values as "no data"', () => {
    const { reasons } = explainRecommendation(
      planWith({
        decided_by: 'average_risk',
        comparisons: [
          {
            criterion: 'average_risk',
            label: 'Average risk',
            winner: 0.5,
            runner_up: null,
            decisive: true,
          },
        ],
      }),
    )
    expect(reasons[0].text).toBe('A lower average risk: 0.50 vs no data on Route B')
  })
})
