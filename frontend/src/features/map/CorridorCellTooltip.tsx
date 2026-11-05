import { Popup } from 'react-map-gl/maplibre'
import type { CorridorWeather } from '../../api/types'
import { RiskBadge } from '../../components/RiskBadge'
import { formatDateTime } from '../../lib/time'
import { useHeatmap } from '../../store/heatmap'
import { corridorStart } from '../heatmap/corridor'
import { useTripTimeZone } from '../trip/useTimeZone'

/** The exact forecast of one grid cell at the slider's hour. */
export function CorridorCellTooltip({
  corridor,
  cellIndex,
}: {
  corridor: CorridorWeather
  cellIndex: number
}) {
  const hour = useHeatmap((s) => s.hour)
  const timeZone = useTripTimeZone()
  const cell = corridor.cells[cellIndex]
  if (!cell) return null
  const time = new Date(corridorStart(corridor.start_time).getTime() + hour * 3_600_000)
  const risk = cell.risk[hour]

  return (
    <Popup
      longitude={cell.lon}
      latitude={cell.lat}
      anchor="bottom"
      offset={8}
      closeButton={false}
      closeOnClick={false}
      focusAfterOpen={false}
      className="cell-tooltip"
    >
      <div className="text-[11px] text-slate-600">
        <p className="flex items-center justify-between gap-3 font-medium text-slate-800">
          {formatDateTime(time, timeZone)}
          <RiskBadge level={risk} />
        </p>
        <p className="mt-0.5 tabular-nums">
          Wind {cell.wind[hour] ?? '—'} mph · Rain {cell.rain[hour] ?? '—'} in/h · Snow{' '}
          {cell.snow[hour] ?? '—'} in/h
        </p>
      </div>
    </Popup>
  )
}
