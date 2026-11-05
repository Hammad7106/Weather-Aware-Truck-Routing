import { describe, expect, it } from 'vitest'
import { colorExpression, METRICS, toWeight, weightExpression } from './metrics'

describe('toWeight', () => {
  it('offsets risk so Low still shows faintly and No Travel is full weight', () => {
    expect(toWeight(METRICS.risk, 0)).toBeCloseTo(0.5 / 4.5)
    expect(toWeight(METRICS.risk, 4)).toBe(1)
  })

  it('scales and caps raw values', () => {
    expect(toWeight(METRICS.wind, 30)).toBe(0.5)
    expect(toWeight(METRICS.wind, 90)).toBe(1)
    expect(toWeight(METRICS.rain, 0)).toBe(0)
  })
})

describe('expressions', () => {
  it('reads the property for the requested hour', () => {
    expect(JSON.stringify(weightExpression(METRICS.risk, 5))).toContain('"r5"')
    expect(JSON.stringify(weightExpression(METRICS.snow, 48))).toContain('"s48"')
  })

  it.each(Object.values(METRICS))('$label colour stops strictly increase', (metric) => {
    // ['interpolate', ['linear'], ['heatmap-density'], stop, colour, stop, colour, …]
    const stops = (colorExpression(metric) as unknown as unknown[])
      .slice(3)
      .filter((_, i) => i % 2 === 0) as number[]
    expect(stops[0]).toBe(0)
    stops.slice(1).forEach((stop, i) => expect(stop).toBeGreaterThan(stops[i]))
    expect(stops[stops.length - 1]).toBeLessThanOrEqual(1)
  })

  it.each(Object.values(METRICS))('$label legend ticks fall inside its scale', (metric) => {
    const values = metric.stops.map((s) => s.value)
    for (const tick of metric.ticks) {
      expect(tick).toBeGreaterThanOrEqual(values[0])
      expect(tick).toBeLessThanOrEqual(values[values.length - 1])
    }
  })

  it('places wind colour changes on the risk thresholds', () => {
    expect(METRICS.wind.stops.map((s) => s.value)).toEqual(expect.arrayContaining([25, 35, 45, 55]))
  })
})
