import type { Comparison, RankingCriterion, TripPlan } from '../../api/types'
import { formatDuration } from '../../lib/time'

interface CriterionText {
  /** "Severe miles" — completes "Tied on …". */
  noun: string
  /** "fewer Severe miles" — completes "Route A has …". */
  better: string
  format: (value: number) => string
}

const miles = (value: number) =>
  `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} mi`

export const CRITERION_TEXT: Record<RankingCriterion, CriterionText> = {
  no_travel_miles: { noun: 'No Travel miles', better: 'fewer No Travel miles', format: miles },
  severe_miles: { noun: 'Severe miles', better: 'fewer Severe miles', format: miles },
  high_miles: { noun: 'High miles', better: 'fewer High miles', format: miles },
  average_risk: {
    noun: 'average risk',
    better: 'a lower average risk',
    format: (v) => v.toFixed(2),
  },
  travel_time: { noun: 'drive time', better: 'a shorter drive time', format: formatDuration },
}

export interface Reason {
  criterion: RankingCriterion
  label: string
  decisive: boolean
  text: string
}

export interface Explanation {
  headline: string
  reasons: Reason[]
}

function describe(c: Comparison, runnerUpName: string): Reason {
  const { noun, better, format } = CRITERION_TEXT[c.criterion]
  const value = (v: number | null) => (v === null ? 'no data' : format(v))
  const text = c.decisive
    ? `${better[0].toUpperCase()}${better.slice(1)}: ${value(c.winner)} vs ${value(c.runner_up)} on ${runnerUpName}`
    : `Tied on ${noun} (${value(c.winner)})`
  return { criterion: c.criterion, label: c.label, decisive: c.decisive, text }
}

/** Plain-language reasons for the recommendation, following the server's ranking order. */
export function explainRecommendation(plan: TripPlan): Explanation {
  const rec = plan.recommendation
  const name = (id: string | null) => plan.routes.find((r) => r.id === id)?.name ?? 'the next route'
  const winner = name(rec.route_id)

  if (rec.runner_up_id === null) {
    return { headline: `${winner} is the only route found for this trip.`, reasons: [] }
  }

  const runnerUp = name(rec.runner_up_id)
  const reasons = rec.comparisons.map((c) => describe(c, runnerUp))

  if (rec.decided_by === null) {
    return { headline: `${winner} and ${runnerUp} tie on every criterion.`, reasons }
  }
  if (rec.decided_by === 'travel_time') {
    return {
      headline: `Weather risk is the same on the top routes, so ${winner} wins on drive time.`,
      reasons,
    }
  }
  return {
    headline: `${winner} has ${CRITERION_TEXT[rec.decided_by].better} than ${runnerUp}.`,
    reasons,
  }
}
