import type { RouteSummary } from '../api/types'
import { cn } from '../lib/cn'
import { NO_DATA_STYLE, RISK_STYLES } from '../lib/risk'

const fmtMiles = (miles: number) =>
  `${miles.toLocaleString(undefined, { maximumFractionDigits: 1 })} mi`

function parts(summary: RouteSummary) {
  return [
    ...RISK_STYLES.map((style) => ({
      key: style.key,
      label: style.label,
      color: style.color,
      ink: style.ink,
      miles: summary.miles_by_level[style.key],
    })),
    {
      key: 'no_data',
      label: NO_DATA_STYLE.label,
      color: NO_DATA_STYLE.color,
      ink: NO_DATA_STYLE.ink,
      miles: summary.no_data_miles,
    },
  ].filter((part) => part.miles > 0)
}

/** Stacked bar of the miles at each risk level, in route order of severity. */
export function RiskBar({ summary, className }: { summary: RouteSummary; className?: string }) {
  const total = summary.distance_miles || 1
  return (
    <div
      className={cn('flex h-2 w-full overflow-hidden rounded-full bg-slate-100', className)}
      role="img"
      aria-label={parts(summary)
        .map((p) => `${fmtMiles(p.miles)} ${p.label}`)
        .join(', ')}
    >
      {parts(summary).map((part) => (
        <span
          key={part.key}
          title={`${part.label}: ${fmtMiles(part.miles)}`}
          style={{ width: `${(part.miles / total) * 100}%`, background: part.color }}
          className="h-full first:rounded-l-full last:rounded-r-full"
        />
      ))}
    </div>
  )
}

/** "12.3 mi Severe · 30 mi High · 448 mi Low", worst first. */
export function RiskBreakdown({ summary }: { summary: RouteSummary }) {
  const items = parts(summary).reverse()
  return (
    <p className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]">
      {items.map((part) => (
        <span key={part.key} className="inline-flex items-center gap-1" style={{ color: part.ink }}>
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: part.color }}
            aria-hidden
          />
          {fmtMiles(part.miles)} {part.label}
        </span>
      ))}
    </p>
  )
}
