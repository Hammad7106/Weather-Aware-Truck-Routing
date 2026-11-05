/** Types mirroring the JSON returned by the Django API (backend/planner/presenters.py). */

/** 0 Low · 1 Moderate · 2 High · 3 Severe · 4 No Travel. `null` means no forecast data. */
export type RiskLevel = 0 | 1 | 2 | 3 | 4

/** GeoJSON order. */
export type LonLat = [lon: number, lat: number]

export interface Place {
  label: string
  lat: number
  lon: number
}

export type CheckpointInterval = 10 | 25 | 50

export interface TripRequest {
  origin: Place
  destination: Place
  /** ISO 8601 with offset. */
  departure_time: string
  load_weight_lb: number
  checkpoint_interval_miles: CheckpointInterval
}

export interface CheckpointWeather {
  wind_mph: number | null
  gust_mph: number | null
  rain_in_hr: number | null
  snow_in_hr: number | null
  temperature_f: number | null
  weather_code: number | null
}

export type RiskDriver = 'wind' | 'rain' | 'snow' | 'load'

export interface Checkpoint {
  index: number
  mile: number
  lat: number
  lon: number
  eta: string
  eta_offset_s: number
  /** [start mile, end mile] of road this checkpoint represents. */
  covers: [number, number]
  level: RiskLevel | null
  factors: { wind: RiskLevel; rain: RiskLevel; snow: RiskLevel } | null
  drivers: RiskDriver[]
  load_rule: string | null
  weather: CheckpointWeather | null
}

export type RiskLevelKey = 'low' | 'moderate' | 'high' | 'severe' | 'no_travel'

export interface RouteSummary {
  distance_miles: number
  duration_s: number
  miles_by_level: Record<RiskLevelKey, number>
  no_data_miles: number
  average_risk: number | null
  peak_level: RiskLevel | null
}

export interface RouteSegment {
  checkpoint_index: number
  level: RiskLevel | null
  coordinates: LonLat[]
}

export interface RouteOption {
  id: string
  name: string
  /** 1 = recommended. */
  rank: number
  via: string[]
  departure_time: string
  arrival_time: string
  traffic_delay_s: number
  summary: RouteSummary
  geometry: LonLat[]
  /** Seconds after departure at each geometry vertex. */
  geometry_offsets_s: number[]
  segments: RouteSegment[]
  checkpoints: Checkpoint[]
}

export type RankingCriterion =
  'no_travel_miles' | 'severe_miles' | 'high_miles' | 'average_risk' | 'travel_time'

export interface Comparison {
  criterion: RankingCriterion
  label: string
  winner: number | null
  runner_up: number | null
  decisive: boolean
}

export interface Recommendation {
  route_id: string
  runner_up_id: string | null
  decided_by: RankingCriterion | null
  no_safe_route: boolean
  comparisons: Comparison[]
}

export interface TripPlan {
  generated_at: string
  origin: Place
  destination: Place
  departure_time: string
  load_weight_lb: number
  checkpoint_interval_miles: CheckpointInterval
  recommendation: Recommendation
  routes: RouteOption[]
}

export interface CorridorCell {
  lon: number
  lat: number
  risk: (RiskLevel | null)[]
  wind: (number | null)[]
  rain: (number | null)[]
  snow: (number | null)[]
}

export interface CorridorWeather {
  start_time: string
  hours: number
  spacing_miles: number
  cells: CorridorCell[]
}

export interface RiskBand {
  level: RiskLevel
  min: number
  inclusive: boolean
}

export interface LoadRule {
  min_wind_mph: number
  max_wind_mph: number
  load_over_lb: number
  level: RiskLevel
  description: string
}

export interface RiskRules {
  levels: { level: RiskLevel; key: RiskLevelKey; label: string }[]
  conditions: { key: 'wind' | 'rain' | 'snow'; label: string; unit: string; bands: RiskBand[] }[]
  load_rules: LoadRule[]
}

export interface DepartureOption {
  /** Hours after the requested departure. */
  offset_hours: number
  departure_time: string
  arrival_time: string
  /** The route that would be recommended for this departure. */
  route_id: string
  summary: RouteSummary
}

export interface DepartureOptions {
  best_offset_hours: number
  options: DepartureOption[]
}
