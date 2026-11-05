import { describe, expect, it } from 'vitest'
import type { RiskBand } from '../../api/types'
import { bandRanges } from './ranges'

// The same bands /api/risk-rules returns.
const WIND: RiskBand[] = [
  { level: 1, min: 25, inclusive: true },
  { level: 2, min: 35, inclusive: true },
  { level: 3, min: 45, inclusive: true },
  { level: 4, min: 55, inclusive: true },
]
const RAIN: RiskBand[] = [
  { level: 1, min: 0.1, inclusive: true },
  { level: 2, min: 0.25, inclusive: true },
  { level: 3, min: 0.5, inclusive: true },
  { level: 4, min: 1.0, inclusive: false },
]
const SNOW: RiskBand[] = [
  { level: 1, min: 0.5, inclusive: true },
  { level: 2, min: 1.0, inclusive: true },
  { level: 3, min: 2.0, inclusive: true },
  { level: 4, min: 3.0, inclusive: false },
]

describe('bandRanges', () => {
  it('describes wind with half-open ranges', () => {
    expect([...bandRanges('wind', WIND).values()]).toEqual([
      '< 25',
      '25 – <35',
      '35 – <45',
      '45 – <55',
      '≥ 55',
    ])
  })

  it('closes Severe at 1.00 in/h of rain and makes No Travel strictly above it', () => {
    const rain = bandRanges('rain', RAIN)
    expect(rain.get(0)).toBe('< 0.10')
    expect(rain.get(3)).toBe('0.50 – ≤1.00')
    expect(rain.get(4)).toBe('> 1.00')
  })

  it('uses one decimal for snow', () => {
    expect([...bandRanges('snow', SNOW).values()]).toEqual([
      '< 0.5',
      '0.5 – <1.0',
      '1.0 – <2.0',
      '2.0 – ≤3.0',
      '> 3.0',
    ])
  })

  it('handles an empty table', () => {
    expect(bandRanges('wind', []).size).toBe(0)
  })
})
