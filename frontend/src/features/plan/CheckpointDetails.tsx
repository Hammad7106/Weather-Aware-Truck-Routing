import { Snowflake, Thermometer, Umbrella, Weight, Wind, type LucideIcon } from 'lucide-react'
import type { Checkpoint, RiskDriver, RiskLevel } from '../../api/types'
import { RiskBadge } from '../../components/RiskBadge'
import { cn } from '../../lib/cn'
import { describeWeatherCode } from '../../lib/weather'
import { useTripTimeZone } from '../trip/useTimeZone'
import { formatDateTime, formatDuration } from '../../lib/time'

const fmt = (value: number | null, digits: number) =>
  value === null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: digits })

/** Everything known about one checkpoint: when the truck gets there, the weather, and why. */
export function CheckpointDetails({ checkpoint }: { checkpoint: Checkpoint }) {
  const timeZone = useTripTimeZone()
  const { weather, factors, drivers } = checkpoint
  const kind = describeWeatherCode(weather?.weather_code ?? null)
  const KindIcon = kind.icon

  return (
    <div className="w-64 text-slate-700">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium tracking-wide text-slate-400 uppercase">
            {checkpoint.index === 0 ? 'Start' : `Mile ${fmt(checkpoint.mile, 1)}`}
          </p>
          <p className="text-sm font-semibold text-slate-900">
            {formatDateTime(new Date(checkpoint.eta), timeZone)}
          </p>
          <p className="text-[11px] text-slate-500">
            {checkpoint.eta_offset_s === 0
              ? 'At departure'
              : `${formatDuration(checkpoint.eta_offset_s)} after departure`}
          </p>
        </div>
        <RiskBadge level={checkpoint.level} className="mt-0.5 shrink-0" />
      </div>

      {weather === null || factors === null ? (
        <p className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
          No forecast is available for this place and time, so it is not rated.
        </p>
      ) : (
        <>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
            <KindIcon className="h-4 w-4 text-slate-500" aria-hidden />
            {kind.label}
            {weather.temperature_f !== null && (
              <span className="ml-auto inline-flex items-center gap-0.5 text-slate-500">
                <Thermometer className="h-3.5 w-3.5" aria-hidden />
                {fmt(weather.temperature_f, 0)}°F
              </span>
            )}
          </p>

          <dl className="mt-2 space-y-1">
            <Factor
              icon={Wind}
              label="Wind"
              value={`${fmt(weather.wind_mph, 1)} mph`}
              detail={weather.gust_mph !== null ? `gusts ${fmt(weather.gust_mph, 0)}` : undefined}
              level={factors.wind}
              driver={drivers.includes('wind')}
            />
            <Factor
              icon={Umbrella}
              label="Rain"
              value={`${fmt(weather.rain_in_hr, 2)} in/h`}
              level={factors.rain}
              driver={drivers.includes('rain')}
            />
            <Factor
              icon={Snowflake}
              label="Snow"
              value={`${fmt(weather.snow_in_hr, 2)} in/h`}
              level={factors.snow}
              driver={drivers.includes('snow')}
            />
          </dl>

          {checkpoint.load_rule && (
            <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
              <Weight className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                <span className="font-semibold">Raised by the load rule:</span>{' '}
                {checkpoint.load_rule}
              </span>
            </p>
          )}
          <p className="mt-2 text-[11px] text-slate-500">
            {explainDrivers(drivers, checkpoint.level)}
          </p>
        </>
      )}

      <p className="mt-1 text-[11px] text-slate-400">
        Covers miles {fmt(checkpoint.covers[0], 1)}–{fmt(checkpoint.covers[1], 1)} of the route.
      </p>
    </div>
  )
}

function explainDrivers(drivers: RiskDriver[], level: RiskLevel | null): string {
  if (level === null) return ''
  if (drivers.length === 0) return 'All conditions are below the Moderate thresholds.'
  if (drivers.includes('load')) return 'Wind combined with the cargo weight sets this level.'
  const names = drivers.map((d) => d[0].toUpperCase() + d.slice(1))
  return `${names.join(' and ')} ${names.length > 1 ? 'set' : 'sets'} this level (the worst condition counts).`
}

function Factor({
  icon: Icon,
  label,
  value,
  detail,
  level,
  driver,
}: {
  icon: LucideIcon
  label: string
  value: string
  detail?: string
  level: RiskLevel
  driver: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1 text-xs',
        driver ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-600',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
      <dt className="w-10">{label}</dt>
      <dd className="flex-1 tabular-nums">
        {value}
        {detail && <span className="ml-1 font-normal text-slate-400">{detail}</span>}
      </dd>
      <RiskBadge level={level} />
    </div>
  )
}
