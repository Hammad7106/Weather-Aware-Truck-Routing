import { describe, expect, it } from 'vitest'
import { boundsOf, haversineMiles, parseCoordinates, pointAlong } from './geo'

describe('haversineMiles', () => {
  it('matches a known distance', () => {
    const denver = { lat: 39.7392, lon: -104.9903 }
    const chicago = { lat: 41.8781, lon: -87.6298 }
    expect(haversineMiles(denver, chicago)).toBeCloseTo(920, -1)
  })
})

describe('parseCoordinates', () => {
  it.each([
    ['39.74, -104.99', { lat: 39.74, lon: -104.99 }],
    ['39.74 -104.99', { lat: 39.74, lon: -104.99 }],
    ['  -33.9,151.2 ', { lat: -33.9, lon: 151.2 }],
  ])('parses %j', (text, point) => {
    expect(parseCoordinates(text)).toEqual(point)
  })

  it.each(['Denver', '95, 10', '10, 200', '39.74'])('rejects %j', (text) => {
    expect(parseCoordinates(text)).toBeNull()
  })
})

describe('pointAlong', () => {
  const line: [number, number][] = [
    [0, 0],
    [1, 0],
    [3, 0],
  ]

  it('follows distance, not vertex count', () => {
    expect(pointAlong(line, 0.5)[0]).toBeCloseTo(1.5, 6)
  })

  it('clamps to the ends', () => {
    expect(pointAlong(line, -1)).toEqual([0, 0])
    expect(pointAlong(line, 2)).toEqual([3, 0])
  })
})

describe('boundsOf', () => {
  it('returns south-west and north-east corners', () => {
    expect(
      boundsOf([
        [-104, 39],
        [-87, 41.9],
        [-95, 36],
      ]),
    ).toEqual([
      [-104, 36],
      [-87, 41.9],
    ])
  })
})
