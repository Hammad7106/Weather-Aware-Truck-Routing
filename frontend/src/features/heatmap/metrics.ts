import type { ExpressionSpecification } from 'maplibre-gl'
import type { CorridorCell } from '../../api/types'
import type { HeatmapMetric } from '../../store/heatmap'

export interface ColorStop {
  /** Value in the metric's own unit (risk: level 0–4). */
  value: number
  color: string
}

export interface MetricConfig {
  key: HeatmapMetric
  label: string
  unit: string
  /** Prefix of the per-hour feature properties: r0…r48, w0…, p0…, s0…. */
  prefix: string
  field: keyof Pick<CorridorCell, 'risk' | 'wind' | 'rain' | 'snow'>
  /** Values are scaled into 0–1 heatmap weights against this maximum. */
  max: number
  /** Colour at each value; also drives the legend. Values on the threshold edges. */
  stops: ColorStop[]
  /** Values shown as ticks on the legend. */
  ticks: number[]
  format: (value: number) => string
}

const RISK_LABELS = ['Low', 'Moderate', 'High', 'Severe', 'No Travel']

export const METRICS: Record<HeatmapMetric, MetricConfig> = {
  risk: {
    key: 'risk',
    label: 'Risk',
    unit: '',
    prefix: 'r',
    field: 'risk',
    max: 4,
    stops: [
      { value: 0, color: 'rgba(22,163,74,0.22)' },
      { value: 1, color: 'rgba(234,179,8,0.5)' },
      { value: 2, color: 'rgba(249,115,22,0.58)' },
      { value: 3, color: 'rgba(220,38,38,0.65)' },
      { value: 4, color: 'rgba(126,34,206,0.72)' },
    ],
    ticks: [0, 1, 2, 3, 4],
    format: (v) => RISK_LABELS[Math.round(v)] ?? '—',
  },
  wind: {
    key: 'wind',
    label: 'Wind',
    unit: 'mph',
    prefix: 'w',
    field: 'wind',
    max: 60,
    stops: [
      { value: 15, color: 'rgba(56,189,248,0)' },
      { value: 25, color: 'rgba(56,189,248,0.4)' },
      { value: 35, color: 'rgba(234,179,8,0.52)' },
      { value: 45, color: 'rgba(249,115,22,0.6)' },
      { value: 55, color: 'rgba(220,38,38,0.68)' },
      { value: 60, color: 'rgba(126,34,206,0.72)' },
    ],
    ticks: [25, 35, 45, 55],
    format: (v) => `${Math.round(v)} mph`,
  },
  rain: {
    key: 'rain',
    label: 'Rain',
    unit: 'in/h',
    prefix: 'p',
    field: 'rain',
    max: 1.2,
    stops: [
      { value: 0.02, color: 'rgba(56,189,248,0)' },
      { value: 0.1, color: 'rgba(56,189,248,0.35)' },
      { value: 0.25, color: 'rgba(37,99,235,0.48)' },
      { value: 0.5, color: 'rgba(79,70,229,0.58)' },
      { value: 1.0, color: 'rgba(126,34,206,0.66)' },
      { value: 1.2, color: 'rgba(88,28,135,0.75)' },
    ],
    ticks: [0.1, 0.25, 0.5, 1.0],
    format: (v) => `${v.toFixed(2)} in/h`,
  },
  snow: {
    key: 'snow',
    label: 'Snow',
    unit: 'in/h',
    prefix: 's',
    field: 'snow',
    max: 3.5,
    stops: [
      { value: 0.1, color: 'rgba(186,230,253,0)' },
      { value: 0.5, color: 'rgba(125,211,252,0.42)' },
      { value: 1.0, color: 'rgba(56,189,248,0.52)' },
      { value: 2.0, color: 'rgba(59,130,246,0.6)' },
      { value: 3.0, color: 'rgba(99,102,241,0.68)' },
      { value: 3.5, color: 'rgba(126,34,206,0.75)' },
    ],
    ticks: [0.5, 1, 2, 3],
    format: (v) => `${v.toFixed(1)} in/h`,
  },
}

/** Risk weights are offset so Low (0) still shows as a faint tint: (level + 0.5) / 4.5. */
const RISK_OFFSET = 0.5

/** Heatmap weight in 0–1 for a raw value. Must match `weightExpression`. */
export function toWeight(metric: MetricConfig, value: number): number {
  if (metric.key === 'risk') return (value + RISK_OFFSET) / (metric.max + RISK_OFFSET)
  return Math.min(value, metric.max) / metric.max
}

/** MapLibre expression for the weight of the given hour; missing data weighs 0. */
export function weightExpression(metric: MetricConfig, hour: number): ExpressionSpecification {
  const value: ExpressionSpecification = ['get', `${metric.prefix}${hour}`]
  if (metric.key === 'risk') {
    return ['/', ['+', ['coalesce', value, -RISK_OFFSET], RISK_OFFSET], metric.max + RISK_OFFSET]
  }
  return ['/', ['min', ['coalesce', value, 0], metric.max], metric.max]
}

/** heatmap-color: density 0 is transparent; each stop sits at its value's weight. */
export function colorExpression(metric: MetricConfig): ExpressionSpecification {
  const stops = metric.stops.flatMap((stop) => [toWeight(metric, stop.value), stop.color])
  const first = toWeight(metric, metric.stops[0].value)
  return [
    'interpolate',
    ['linear'],
    ['heatmap-density'],
    0,
    'rgba(0,0,0,0)',
    ...(first > 0.02 ? [first * 0.6, 'rgba(0,0,0,0)'] : []),
    ...stops,
  ] as unknown as ExpressionSpecification
}
