import type { Checkpoint, LonLat, RouteOption, TripPlan } from '../api/types'

const DEPARTURE = '2026-11-08T21:00:00Z'

/** A straight route from (0,0) east along the equator, driven at a constant pace. */
export function makeRoute(overrides: Partial<RouteOption> = {}): RouteOption {
  const geometry: LonLat[] = [
    [0, 0],
    [1, 0],
    [2, 0],
  ]
  const checkpoints: Checkpoint[] = []
  return {
    id: 'A',
    name: 'Route A',
    rank: 1,
    via: ['I-80'],
    departure_time: DEPARTURE,
    arrival_time: '2026-11-08T23:00:00Z',
    traffic_delay_s: 0,
    summary: {
      distance_miles: 138.3,
      duration_s: 7200,
      miles_by_level: { low: 138.3, moderate: 0, high: 0, severe: 0, no_travel: 0 },
      no_data_miles: 0,
      average_risk: 0,
      peak_level: 0,
    },
    geometry,
    geometry_offsets_s: [0, 3600, 7200],
    segments: [],
    checkpoints,
    ...overrides,
  }
}

export function makePlan(overrides: Partial<TripPlan> = {}): TripPlan {
  return {
    generated_at: '2026-11-08T20:00:00Z',
    origin: { label: 'Calgary, AB', lat: 51.0447, lon: -114.0719 },
    destination: { label: 'Lethbridge, AB', lat: 49.6956, lon: -112.8451 },
    departure_time: DEPARTURE,
    load_weight_lb: 45_000,
    checkpoint_interval_miles: 25,
    recommendation: {
      route_id: 'A',
      runner_up_id: null,
      decided_by: null,
      no_safe_route: false,
      comparisons: [],
    },
    routes: [makeRoute()],
    ...overrides,
  }
}
