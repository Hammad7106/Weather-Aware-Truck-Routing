import type { Place } from '../../api/types'

export interface ExampleTrip {
  name: string
  origin: Place
  destination: Place
}

/** Corridors with very different weather exposure (plains wind, mountain passes, coast). */
export const EXAMPLE_TRIPS: ExampleTrip[] = [
  {
    name: 'Denver → Chicago',
    origin: { label: 'Denver, CO', lat: 39.73845, lon: -104.98485 },
    destination: { label: 'Chicago, IL', lat: 41.88425, lon: -87.63245 },
  },
  {
    name: 'Seattle → Salt Lake City',
    origin: { label: 'Seattle, WA', lat: 47.60357, lon: -122.32945 },
    destination: { label: 'Salt Lake City, UT', lat: 40.76031, lon: -111.88822 },
  },
  {
    name: 'Dallas → Atlanta',
    origin: { label: 'Dallas, TX', lat: 32.77815, lon: -96.7954 },
    destination: { label: 'Atlanta, GA', lat: 33.74831, lon: -84.39111 },
  },
]
