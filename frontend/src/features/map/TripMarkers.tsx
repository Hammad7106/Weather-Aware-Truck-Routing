import { Marker, type MarkerDragEvent } from 'react-map-gl/maplibre'
import { cn } from '../../lib/cn'
import { usePlanner, type PlaceRole } from '../../store/planner'
import { ROLE_STYLE } from '../trip/roleStyle'
import { useResolvePoint } from '../trip/useResolvePoint'

function TripMarker({ role }: { role: PlaceRole }) {
  const place = usePlanner((s) => s.draft[role])
  const resolvePoint = useResolvePoint()
  if (!place) return null

  const style = ROLE_STYLE[role]
  return (
    <Marker
      longitude={place.lon}
      latitude={place.lat}
      anchor="bottom"
      draggable
      onDragEnd={(event: MarkerDragEvent) =>
        void resolvePoint(role, event.lngLat.lat, event.lngLat.lng)
      }
    >
      <div
        className="group flex cursor-grab flex-col items-center active:cursor-grabbing"
        title={`${style.name}: ${place.label} (drag to move)`}
      >
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-sm font-bold text-white shadow-lg transition group-hover:scale-110',
            style.bg,
            place.resolving && 'animate-pulse',
          )}
        >
          {style.letter}
        </span>
        <span
          className="-mt-1 h-2.5 w-2.5 rotate-45 border-r-2 border-b-2 border-white shadow"
          style={{ background: style.hex }}
        />
      </div>
    </Marker>
  )
}

export function TripMarkers() {
  return (
    <>
      <TripMarker role="origin" />
      <TripMarker role="destination" />
    </>
  )
}
