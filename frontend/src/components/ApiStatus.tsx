import { useQuery } from '@tanstack/react-query'
import { healthQuery } from '../api/queries'
import { cn } from '../lib/cn'

/** Small badge showing whether the backend is reachable (useful with cold-starting hosts). */
export function ApiStatus() {
  const { data, isPending, isError } = useQuery(healthQuery)

  const [color, label] = isPending
    ? ['bg-slate-400 animate-pulse', 'Connecting to API…']
    : isError
      ? ['bg-red-500', 'API unreachable']
      : data.routing_configured
        ? ['bg-emerald-500', 'API online']
        : ['bg-amber-500', 'API online · routing key missing']

  return (
    <div className="flex items-center gap-1.5 text-[11px] text-slate-500" role="status">
      <span className={cn('h-1.5 w-1.5 rounded-full', color)} aria-hidden />
      {label}
    </div>
  )
}
