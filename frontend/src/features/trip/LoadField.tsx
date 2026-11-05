import { useQuery } from '@tanstack/react-query'
import { Weight } from 'lucide-react'
import { useRef, useState } from 'react'
import { riskRulesQuery } from '../../api/queries'
import { cn } from '../../lib/cn'
import { usePlanner } from '../../store/planner'
import { MAX_LOAD_LB } from './validation'

const STEP_LB = 500
const PRESETS = [
  { label: 'Empty', lb: 0 },
  { label: '15k', lb: 15_000 },
  { label: '35k', lb: 35_000 },
  { label: '45k', lb: 45_000 },
]
const ZONE_COLORS = ['#e2e8f0', '#fcd34d', '#fb923c']

const pct = (lb: number) => `${(lb / MAX_LOAD_LB) * 100}%`

/**
 * Cargo weight slider. The load-rule thresholds come from the API, so the markers on the
 * track always match the rules the server applies.
 */
export function LoadField({ error }: { error?: string }) {
  const loadLb = usePlanner((s) => s.draft.loadLb)
  const setLoad = usePlanner((s) => s.setLoad)
  const { data: rules } = useQuery(riskRulesQuery)
  const [typed, setTyped] = useState<string | null>(null)
  const justFocused = useRef(false)

  const thresholds = [...(rules?.load_rules ?? [])].sort((a, b) => a.load_over_lb - b.load_over_lb)
  const active = thresholds.filter((rule) => loadLb > rule.load_over_lb)

  // Track background: one colour band per threshold zone; the filled part is solid.
  const stops = [0, ...thresholds.map((r) => r.load_over_lb), MAX_LOAD_LB]
  const zones = stops
    .slice(0, -1)
    .map((start, i) => `${ZONE_COLORS[i] ?? ZONE_COLORS.at(-1)} ${pct(start)} ${pct(stops[i + 1])}`)
  const track = `linear-gradient(to right, ${zones.join(', ')})`

  function commitTyped(raw: string) {
    setTyped(null)
    const value = Number(raw.replace(/[^\d]/g, ''))
    if (raw.trim() !== '' && Number.isFinite(value)) {
      setLoad(Math.min(MAX_LOAD_LB, Math.max(0, Math.round(value))))
    }
  }

  return (
    <div>
      <div className="mb-1 flex items-end justify-between">
        <label htmlFor="field-load" className="text-xs font-medium text-slate-600">
          Cargo weight
        </label>
        <div
          className={cn(
            'flex items-center rounded-md border bg-white px-2 py-1 shadow-sm focus-within:ring-2',
            error
              ? 'border-red-300 focus-within:ring-red-200'
              : 'border-slate-300 focus-within:ring-sky-100',
          )}
        >
          <Weight className="mr-1.5 h-3.5 w-3.5 text-slate-400" aria-hidden />
          <input
            aria-label="Cargo weight in pounds"
            inputMode="numeric"
            className="w-16 bg-transparent text-right text-sm font-medium tabular-nums outline-none"
            value={typed ?? loadLb.toLocaleString()}
            onFocus={(event) => {
              // Select synchronously and keep the shown value unchanged, so the first keystroke
              // replaces the whole number instead of appending to it.
              event.target.select()
              justFocused.current = true
            }}
            onMouseUp={(event) => {
              // Chrome clears the selection on the mouseup that follows a focusing click.
              if (justFocused.current) event.preventDefault()
              justFocused.current = false
            }}
            onChange={(event) => setTyped(event.target.value)}
            onBlur={(event) => commitTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitTyped(event.currentTarget.value)
              }
            }}
          />
          <span className="ml-1 text-xs text-slate-500">lb</span>
        </div>
      </div>

      <div className="relative pt-1 pb-5">
        <input
          id="field-load"
          type="range"
          min={0}
          max={MAX_LOAD_LB}
          step={STEP_LB}
          value={loadLb}
          onChange={(event) => setLoad(Number(event.target.value))}
          aria-valuetext={`${loadLb.toLocaleString()} pounds`}
          className="load-slider w-full"
          style={{ background: track }}
        />
        {thresholds.map((rule) => (
          <span
            key={rule.load_over_lb}
            className="pointer-events-none absolute top-6 -translate-x-1/2 text-[10px] text-slate-500 tabular-nums"
            style={{ left: pct(rule.load_over_lb) }}
          >
            {rule.load_over_lb / 1000}k
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Load presets">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            aria-pressed={loadLb === preset.lb}
            onClick={() => setLoad(preset.lb)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs font-medium transition',
              loadLb === preset.lb
                ? 'border-sky-500 bg-sky-50 text-sky-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div
        className="mt-2 rounded-md bg-slate-50 px-2.5 py-2 text-xs text-slate-600"
        aria-live="polite"
      >
        {error ? (
          <span className="text-red-600">{error}</span>
        ) : !rules ? (
          'Loading load rules…'
        ) : active.length === 0 ? (
          `At or below ${thresholds[0]?.load_over_lb.toLocaleString()} lb, wind is rated with the standard thresholds.`
        ) : (
          <>
            <span className="font-medium text-slate-700">
              At this weight, stricter wind limits apply:
            </span>
            <ul className="mt-0.5 list-disc pl-4">
              {active.map((rule) => (
                <li key={rule.load_over_lb}>{rule.description}</li>
              ))}
            </ul>
            <span className="mt-1 block text-slate-500">
              They only affect stretches where the forecast wind is that strong.
            </span>
          </>
        )}
      </div>
    </div>
  )
}
