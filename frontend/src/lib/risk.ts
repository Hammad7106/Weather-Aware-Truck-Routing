import type { RiskLevel, RiskLevelKey } from '../api/types'

export interface RiskStyle {
  level: RiskLevel
  key: RiskLevelKey
  label: string
  /** Fill colour for map lines, bars and dots. */
  color: string
  /** Pale background and dark text for badges on white. */
  soft: string
  ink: string
}

/** One palette for map, legend, bars and badges. Ordered Low → No Travel. */
export const RISK_STYLES: readonly RiskStyle[] = [
  { level: 0, key: 'low', label: 'Low', color: '#16a34a', soft: '#dcfce7', ink: '#166534' },
  {
    level: 1,
    key: 'moderate',
    label: 'Moderate',
    color: '#eab308',
    soft: '#fef9c3',
    ink: '#854d0e',
  },
  { level: 2, key: 'high', label: 'High', color: '#f97316', soft: '#ffedd5', ink: '#9a3412' },
  { level: 3, key: 'severe', label: 'Severe', color: '#dc2626', soft: '#fee2e2', ink: '#991b1b' },
  {
    level: 4,
    key: 'no_travel',
    label: 'No Travel',
    color: '#7e22ce',
    soft: '#f3e8ff',
    ink: '#6b21a8',
  },
]

export const NO_DATA_STYLE = {
  label: 'No forecast',
  color: '#94a3b8',
  soft: '#f1f5f9',
  ink: '#475569',
} as const

export function riskStyle(level: RiskLevel | null) {
  return level === null ? NO_DATA_STYLE : RISK_STYLES[level]
}
