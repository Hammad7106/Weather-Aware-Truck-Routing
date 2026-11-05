import { describe, expect, it } from 'vitest'
import type { TripRequest } from '../../api/types'
import { draftFromSearch, tripToSearch } from './urlState'

const trip: TripRequest = {
  origin: { label: 'Calgary, AB', lat: 51.0447, lon: -114.0719 },
  destination: { label: 'Lethbridge, AB', lat: 49.6956, lon: -112.8451 },
  departure_time: '2026-11-08T21:00:00.000Z',
  load_weight_lb: 45_000,
  checkpoint_interval_miles: 10,
}

describe('trip URLs', () => {
  it('round-trips a trip through the query string', () => {
    const draft = draftFromSearch(tripToSearch(trip))

    expect(draft.origin).toEqual(trip.origin)
    expect(draft.destination).toEqual(trip.destination)
    expect(draft.departure).toBe(trip.departure_time)
    expect(draft.loadLb).toBe(45_000)
    expect(draft.intervalMiles).toBe(10)
  })

  it('keeps labels with commas and spaces intact', () => {
    const search = tripToSearch({
      ...trip,
      origin: { ...trip.origin, label: 'Pilot, I-80 Exit 5, NE' },
    })
    expect(draftFromSearch(search).origin?.label).toBe('Pilot, I-80 Exit 5, NE')
  })

  it('falls back to coordinates when a place has no name', () => {
    expect(draftFromSearch('?from=40.5,-100.25').origin).toEqual({
      lat: 40.5,
      lon: -100.25,
      label: '40.5, -100.25',
    })
  })

  it('ignores anything invalid', () => {
    expect(draftFromSearch('?from=abc&to=91,0&depart=soon&load=heavy&every=15')).toEqual({})
    expect(draftFromSearch('')).toEqual({})
  })
})
