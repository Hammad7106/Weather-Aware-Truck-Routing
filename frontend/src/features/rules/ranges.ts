import type { RiskBand, RiskLevel } from '../../api/types'

const DECIMALS: Record<string, number> = { wind: 0, rain: 2, snow: 1 }

/**
 * Human-readable range for every level of one condition, built from the API's bands.
 * A band is the lower edge of a level; the next band's edge closes it.
 * e.g. wind → Low "< 25", Moderate "25 – <35", …, No Travel "≥ 55".
 */
export function bandRanges(condition: string, bands: RiskBand[]): Map<RiskLevel, string> {
  const digits = DECIMALS[condition] ?? 2
  const n = (value: number) => value.toFixed(digits)
  const ranges = new Map<RiskLevel, string>()
  if (bands.length === 0) return ranges

  const first = bands[0]
  ranges.set(0, `${first.inclusive ? '<' : '≤'} ${n(first.min)}`)
  bands.forEach((band, i) => {
    const next = bands[i + 1]
    if (!next) {
      ranges.set(band.level, `${band.inclusive ? '≥' : '>'} ${n(band.min)}`)
      return
    }
    const lower = band.inclusive ? n(band.min) : `>${n(band.min)}`
    const upper = next.inclusive ? `<${n(next.min)}` : `≤${n(next.min)}`
    ranges.set(band.level, `${lower} – ${upper}`)
  })
  return ranges
}
