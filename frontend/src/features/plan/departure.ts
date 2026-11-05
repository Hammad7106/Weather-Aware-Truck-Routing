import type { DepartureOption, RiskLevelKey } from '../../api/types'

const MILE_CRITERIA: { key: RiskLevelKey; label: string }[] = [
  { key: 'no_travel', label: 'No Travel' },
  { key: 'severe', label: 'Severe' },
  { key: 'high', label: 'High' },
]

const miles = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 })

/**
 * What waiting gains, at the first criterion where the two options differ (the same order the
 * routes are ranked in), e.g. "0 Severe miles instead of 25". Null when there is no gain.
 */
export function describeImprovement(
  current: DepartureOption,
  best: DepartureOption,
): string | null {
  for (const { key, label } of MILE_CRITERIA) {
    const now = Math.round(current.summary.miles_by_level[key] * 10) / 10
    const later = Math.round(best.summary.miles_by_level[key] * 10) / 10
    if (later < now) return `${miles(later)} ${label} miles instead of ${miles(now)}`
    if (later > now) return null
  }
  const a = current.summary.average_risk
  const b = best.summary.average_risk
  if (a !== null && b !== null && Math.round(b * 100) < Math.round(a * 100)) {
    return `average risk ${b.toFixed(2)} instead of ${a.toFixed(2)}`
  }
  return null
}

/** Miles at each level as fractions of the route, worst level last (for stacked bars). */
export function levelShares(option: DepartureOption): { key: RiskLevelKey; share: number }[] {
  const total = option.summary.distance_miles || 1
  return (['low', 'moderate', 'high', 'severe', 'no_travel'] as const).map((key) => ({
    key,
    share: option.summary.miles_by_level[key] / total,
  }))
}
