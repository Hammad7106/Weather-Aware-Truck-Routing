import { useQuery } from '@tanstack/react-query'
import { CircleHelp, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { riskRulesQuery } from '../../api/queries'
import { cn } from '../../lib/cn'
import { RISK_STYLES } from '../../lib/risk'
import { usePlanner } from '../../store/planner'
import { bandRanges } from './ranges'

/** A button that opens the scoring rules. Every number shown comes from the API. */
export function RiskRulesButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 hover:underline',
          className,
        )}
      >
        <CircleHelp className="h-3.5 w-3.5" aria-hidden />
        How is risk scored?
      </button>
      {/* Portal: the button can sit inside text, but a dialog belongs at the top of the page. */}
      {createPortal(<RiskRulesDialog open={open} onClose={() => setOpen(false)} />, document.body)}
    </>
  )
}

function RiskRulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const { data: rules, isError } = useQuery(riskRulesQuery)
  const load = usePlanner((s) => s.submittedTrip?.load_weight_lb ?? s.draft.loadLb)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => event.target === ref.current && onClose()}
      aria-labelledby="rules-title"
      className="m-auto w-[min(640px,calc(100vw-2rem))] rounded-2xl p-0 shadow-2xl backdrop:bg-slate-900/40 backdrop:backdrop-blur-sm"
    >
      <div className="max-h-[85vh] overflow-y-auto p-5 text-sm text-slate-700">
        <div className="flex items-start justify-between gap-4">
          <h2 id="rules-title" className="text-base font-semibold text-slate-900">
            How risk is scored
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isError && <p className="mt-3 text-red-600">The rules could not be loaded.</p>}
        {!rules && !isError && <p className="mt-3 text-slate-500">Loading…</p>}

        {rules && (
          <>
            <p className="mt-2 text-xs text-slate-500">
              The forecast is read at the hour the truck reaches each checkpoint. Each condition
              gets a level; the <strong>worst</strong> one is the checkpoint’s level.
            </p>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[480px] border-separate border-spacing-0 text-xs">
                <thead>
                  <tr>
                    <th className="py-1.5 pr-2 text-left font-medium text-slate-500">Condition</th>
                    {RISK_STYLES.map((style) => (
                      <th
                        key={style.level}
                        className="px-1.5 py-1.5 text-center font-semibold"
                        style={{ background: style.soft, color: style.ink }}
                      >
                        {style.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rules.conditions.map((condition) => {
                    const ranges = bandRanges(condition.key, condition.bands)
                    return (
                      <tr key={condition.key}>
                        <th className="border-t border-slate-100 py-1.5 pr-2 text-left font-medium text-slate-800">
                          {condition.label}{' '}
                          <span className="font-normal text-slate-400">{condition.unit}</span>
                        </th>
                        {RISK_STYLES.map((style) => (
                          <td
                            key={style.level}
                            className="border-t border-slate-100 px-1.5 py-1.5 text-center tabular-nums"
                          >
                            {ranges.get(style.level) ?? '—'}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <h3 className="mt-4 text-sm font-semibold text-slate-900">Load rules</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Heavy trailers are more exposed to wind, so these can raise a level (never lower it).
              This trip’s cargo: <strong>{load.toLocaleString()} lb</strong>.
            </p>
            <ul className="mt-2 space-y-1.5">
              {rules.load_rules.map((rule) => {
                const applies = load > rule.load_over_lb
                return (
                  <li
                    key={rule.load_over_lb}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs',
                      applies
                        ? 'border-amber-300 bg-amber-50 text-amber-950'
                        : 'border-slate-200 text-slate-600',
                    )}
                  >
                    {rule.description}
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        applies ? 'bg-amber-200 text-amber-900' : 'bg-slate-100 text-slate-500',
                      )}
                    >
                      {applies ? 'Applies to this load' : 'Not at this load'}
                    </span>
                  </li>
                )
              })}
              <li className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
                Wind ≥ 55 mph → No Travel for any load (part of the wind thresholds).
              </li>
            </ul>

            <h3 className="mt-4 text-sm font-semibold text-slate-900">Choosing the route</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Each checkpoint stands for the road halfway to its neighbours. Routes are compared
              step by step; the first difference decides:
            </p>
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-xs">
              <li>Fewest No Travel miles</li>
              <li>Fewest Severe miles</li>
              <li>Fewest High miles</li>
              <li>Lowest average risk (distance-weighted, 0 = Low … 4 = No Travel)</li>
              <li>Shortest drive time</li>
            </ol>
          </>
        )}
      </div>
    </dialog>
  )
}
