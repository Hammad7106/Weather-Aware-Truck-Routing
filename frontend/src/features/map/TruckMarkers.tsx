import { Truck } from 'lucide-react'
import { Marker } from 'react-map-gl/maplibre'
import type { TripPlan } from '../../api/types'
import { cn } from '../../lib/cn'
import { formatDuration } from '../../lib/time'
import { useHeatmap } from '../../store/heatmap'
import { secondsAfterDeparture, truckPosition } from '../heatmap/corridor'

/** Where the truck would be on each route at the slider's hour. */
export function TruckMarkers({ plan, selectedId }: { plan: TripPlan; selectedId: string }) {
  const hour = useHeatmap((s) => s.hour)
  const seconds = secondsAfterDeparture(plan.departure_time, hour)

  return plan.routes.map((route) => {
    const { position, status } = truckPosition(route, seconds)
    const selected = route.id === selectedId
    const label =
      status === 'arrived'
        ? `${route.name}: arrived`
        : status === 'waiting'
          ? `${route.name}: not departed yet`
          : `${route.name}: ${formatDuration(seconds)} into the drive`
    return (
      <Marker
        key={route.id}
        longitude={position[0]}
        latitude={position[1]}
        style={{ zIndex: selected ? 4 : 3 }}
      >
        <div
          title={label}
          aria-label={label}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-full border-2 border-white shadow-lg transition-transform duration-300',
            selected ? 'bg-slate-900 text-white' : 'bg-white text-slate-500',
            status !== 'driving' && 'opacity-60',
          )}
        >
          <Truck className="h-4 w-4" aria-hidden />
        </div>
      </Marker>
    )
  })
}
