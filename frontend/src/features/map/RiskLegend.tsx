import { NO_DATA_STYLE, RISK_STYLES } from '../../lib/risk'
import { RiskRulesButton } from '../rules/RiskRulesDialog'

/** Colour key for the risk-coloured route and checkpoints. */
export function RiskLegend({ showNoData }: { showNoData: boolean }) {
  const items = [...RISK_STYLES, ...(showNoData ? [{ ...NO_DATA_STYLE, level: -1 }] : [])]
  return (
    <div className="absolute bottom-8 left-3 rounded-lg bg-white/95 px-3 py-2 shadow-md backdrop-blur">
      <ul
        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600"
        aria-label="Risk levels"
      >
        {items.map((item) => (
          <li key={item.label} className="inline-flex items-center gap-1">
            <span className="h-2 w-4 rounded-full" style={{ background: item.color }} aria-hidden />
            {item.label}
          </li>
        ))}
      </ul>
      <RiskRulesButton className="mt-1" />
    </div>
  )
}
