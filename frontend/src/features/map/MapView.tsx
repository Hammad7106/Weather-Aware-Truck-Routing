import { Crosshair, Flag, MapPin, X, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import Map, {
  NavigationControl,
  Popup,
  ScaleControl,
  type MapLayerMouseEvent,
} from 'react-map-gl/maplibre'
import { INITIAL_VIEW, MAP_STYLE_URL } from '../../config'
import { usePlanner, type PlaceRole } from '../../store/planner'
import { ROLE_STYLE } from '../trip/roleStyle'
import { useResolvePoint } from '../trip/useResolvePoint'
import { useCurrentPlan, useSelectedRouteId } from '../plan/useCurrentPlan'
import { CameraController } from './CameraController'
import { ROUTE_HIT_LAYER, RouteLayers } from './RouteLayers'
import { RiskLegend } from './RiskLegend'
import { CHECKPOINT_LAYER } from './SelectedRouteLayers'
import './setupMaplibre'
import { TripMarkers } from './TripMarkers'

interface MenuPoint {
  lat: number
  lon: number
}

/** The checkpoint or route under the pointer. Checkpoints win, since they sit on routes. */
function featureUnderPointer(event: MapLayerMouseEvent) {
  const features = event.features ?? []
  const checkpoint = features.find((f) => f.layer.id === CHECKPOINT_LAYER)
  const route = features.find((f) => f.layer.id === ROUTE_HIT_LAYER)
  return {
    checkpoint: checkpoint ? (checkpoint.properties.index as number) : null,
    routeId: route ? (route.properties.id as string) : null,
  }
}

/** Full-bleed WebGL map. Data layers are GeoJSON sources, never per-feature DOM markers. */
export function MapView() {
  const pickTarget = usePlanner((s) => s.pickTarget)
  const setPickTarget = usePlanner((s) => s.setPickTarget)
  const selectRoute = usePlanner((s) => s.selectRoute)
  const hoverRoute = usePlanner((s) => s.hoverRoute)
  const hoverCheckpoint = usePlanner((s) => s.hoverCheckpoint)
  const selectCheckpoint = usePlanner((s) => s.selectCheckpoint)
  const resolvePoint = useResolvePoint()
  const plan = useCurrentPlan().data
  const selectedId = useSelectedRouteId(plan)
  const [menu, setMenu] = useState<MenuPoint | null>(null)
  const [overFeature, setOverFeature] = useState(false)

  useEffect(() => {
    if (!pickTarget) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPickTarget(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pickTarget, setPickTarget])

  function setFromMap(role: PlaceRole, point: MenuPoint) {
    setMenu(null)
    setPickTarget(null)
    void resolvePoint(role, point.lat, point.lon)
  }

  function onClick(event: MapLayerMouseEvent) {
    if (pickTarget) {
      setFromMap(pickTarget, { lat: event.lngLat.lat, lon: event.lngLat.lng })
      return
    }
    setMenu(null)
    const target = featureUnderPointer(event)
    if (target.checkpoint !== null) selectCheckpoint(target.checkpoint)
    else if (target.routeId !== null) selectRoute(target.routeId)
  }

  function onMouseMove(event: MapLayerMouseEvent) {
    const { checkpoint, routeId } = featureUnderPointer(event)
    setOverFeature(checkpoint !== null || routeId !== null)
    const state = usePlanner.getState()
    if (state.hoveredCheckpoint !== checkpoint) hoverCheckpoint(checkpoint)
    const route = checkpoint === null ? routeId : null
    if (state.hoveredRouteId !== route) hoverRoute(route)
  }

  function onMouseLeave() {
    setOverFeature(false)
    hoverRoute(null)
    hoverCheckpoint(null)
  }

  function onContextMenu(event: MapLayerMouseEvent) {
    event.preventDefault()
    setMenu({ lat: event.lngLat.lat, lon: event.lngLat.lng })
  }

  return (
    <div className="relative h-full w-full">
      <Map
        initialViewState={INITIAL_VIEW}
        mapStyle={MAP_STYLE_URL}
        style={{ width: '100%', height: '100%' }}
        attributionControl={{ compact: true }}
        dragRotate={false}
        pitchWithRotate={false}
        cursor={pickTarget ? 'crosshair' : overFeature ? 'pointer' : undefined}
        interactiveLayerIds={plan ? [CHECKPOINT_LAYER, ROUTE_HIT_LAYER] : undefined}
        onClick={onClick}
        onMouseMove={plan ? onMouseMove : undefined}
        onMouseLeave={plan ? onMouseLeave : undefined}
        onContextMenu={onContextMenu}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <ScaleControl position="bottom-right" unit="imperial" />
        <CameraController />
        {plan && selectedId && <RouteLayers plan={plan} selectedId={selectedId} />}
        <TripMarkers />

        {menu && (
          <Popup
            longitude={menu.lon}
            latitude={menu.lat}
            anchor="top-left"
            closeButton={false}
            closeOnClick={false}
            onClose={() => setMenu(null)}
            className="map-menu"
          >
            <div className="flex min-w-40 flex-col py-1 text-sm" role="menu">
              <MenuItem
                icon={MapPin}
                label="Start here"
                color={ROLE_STYLE.origin.hex}
                onClick={() => setFromMap('origin', menu)}
              />
              <MenuItem
                icon={Flag}
                label="End here"
                color={ROLE_STYLE.destination.hex}
                onClick={() => setFromMap('destination', menu)}
              />
            </div>
          </Popup>
        )}
      </Map>

      {pickTarget && (
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-4">
          <div
            className="pointer-events-auto flex items-center gap-2 rounded-full bg-slate-900/90 py-1.5 pr-1.5 pl-3 text-sm text-white shadow-lg backdrop-blur"
            role="status"
          >
            <Crosshair className="h-4 w-4 text-sky-300" aria-hidden />
            Click the map to set the {ROLE_STYLE[pickTarget].name.toLowerCase()}
            <button
              type="button"
              onClick={() => setPickTarget(null)}
              className="ml-1 flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-xs hover:bg-white/25"
            >
              <X className="h-3 w-3" aria-hidden /> Esc
            </button>
          </div>
        </div>
      )}

      {plan ? (
        <RiskLegend showNoData={plan.routes.some((route) => route.summary.no_data_miles > 0)} />
      ) : (
        <p className="pointer-events-none absolute bottom-8 left-3 hidden rounded bg-white/80 px-2 py-1 text-[11px] text-slate-500 shadow-sm md:block">
          Right-click the map to set a start or destination
        </p>
      )}
    </div>
  )
}

function MenuItem({
  onClick,
  icon: Icon,
  color,
  label,
}: {
  onClick: () => void
  icon: LucideIcon
  color: string
  label: string
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-1.5 text-left text-slate-700 hover:bg-slate-100"
    >
      <Icon className="h-4 w-4 shrink-0" style={{ color }} aria-hidden />
      {label}
    </button>
  )
}
