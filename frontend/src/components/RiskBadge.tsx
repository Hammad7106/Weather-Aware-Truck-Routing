import type { RiskLevel } from '../api/types'
import { cn } from '../lib/cn'
import { riskStyle } from '../lib/risk'

export function RiskBadge({ level, className }: { level: RiskLevel | null; className?: string }) {
  const style = riskStyle(level)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
        className,
      )}
      style={{ background: style.soft, color: style.ink }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: style.color }} aria-hidden />
      {style.label}
    </span>
  )
}
