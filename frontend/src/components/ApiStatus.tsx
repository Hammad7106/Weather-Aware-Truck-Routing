import { useQuery } from '@tanstack/react-query'
import { getHealth } from '../api/client'

/** Small badge showing whether the backend is reachable (useful with cold-starting hosts). */
export function ApiStatus() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => getHealth(signal),
    retry: 3,
    retryDelay: (attempt) => Math.min(2000 * 2 ** attempt, 15000),
  })

  const [color, label] = isPending
    ? ['bg-slate-400 animate-pulse', 'Connecting to API…']
    : isError
      ? ['bg-red-500', 'API unreachable']
      : data.routing_configured
        ? ['bg-emerald-500', 'API online']
        : ['bg-amber-500', 'API online · routing key missing']

  return (
    <div className="flex items-center gap-2 text-xs text-slate-500" role="status">
      <span className={`h-2 w-2 rounded-full ${color}`} aria-hidden />
      {label}
    </div>
  )
}
