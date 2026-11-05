import type { ExpressionSpecification } from 'maplibre-gl'
import { useEffect, useMemo } from 'react'
import { Layer, Marker, Source, useMap } from 'react-map-gl/maplibre'
import type { TripPlan } from '../../api/types'
import { cn } from '../../lib/cn'
import { boundsOf, pointAlong } from '../../lib/geo'
import { formatDuration } from '../../lib/time'
import { mapPadding } from '../../store/layout'
import { usePlanner } from '../../store/planner'
import { ROUTES_BOTTOM_LAYER, useFirstLabelLayer } from './layerOrder'
import { SelectedRouteLayers } from './SelectedRouteLayers'

/** Invisible wide line used for hover and click hit-testing. */
export const ROUTE_HIT_LAYER = 'routes-hit'

/** Dark outline so pale risk colours (Low green, Moderate yellow) stand out on the basemap. */
const SELECTED_CASING = '#0f172a'
const ALT_COLOR = '#94a3b8'
const ALT_HOVER_COLOR = '#475569'
/** Where each route's label sits along it, so labels on shared highways do not overlap. */
const LABEL_POSITIONS = [0.5, 0.33, 0.67]

export function RouteLayers({ plan, selectedId }: { plan: TripPlan; selectedId: string }) {
  const { current: map } = useMap()
  const hoveredId = usePlanner((s) => s.hoveredRouteId)
  const beforeId = useFirstLabelLayer()
  const selectedRoute = plan.routes.find((route) => route.id === selectedId)

  const data = useMemo<GeoJSON.FeatureCollection<GeoJSON.LineString>>(
    () => ({
      type: 'FeatureCollection',
      features: plan.routes.map((route) => ({
        type: 'Feature',
        properties: { id: route.id },
        geometry: { type: 'LineString', coordinates: route.geometry },
      })),
    }),
    [plan],
  )

  // Frame all route options whenever a new plan arrives. Wait two frames so overlays that
  // mount with the plan have been measured (their size feeds the padding).
  useEffect(() => {
    if (!map) return
    const bounds = boundsOf(plan.routes.flatMap((route) => route.geometry))
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() =>
        map.fitBounds(bounds, { padding: mapPadding(50), duration: 1000, maxZoom: 11 }),
      )
    })
    return () => cancelAnimationFrame(frame)
  }, [map, plan])

  const isSelected: ExpressionSpecification = ['==', ['get', 'id'], selectedId]
  const isHovered: ExpressionSpecification = ['==', ['get', 'id'], hoveredId ?? '']

  return (
    <>
      <Source id="routes" type="geojson" data={data}>
        <Layer
          id={ROUTES_BOTTOM_LAYER}
          type="line"
          beforeId={beforeId}
          filter={['!', isSelected]}
          layout={{ 'line-join': 'round', 'line-cap': 'round' }}
          paint={{ 'line-color': '#ffffff', 'line-width': ['case', isHovered, 10, 8] }}
        />
        <Layer
          id="routes-alt"
          type="line"
          beforeId={beforeId}
          filter={['!', isSelected]}
          layout={{ 'line-join': 'round', 'line-cap': 'round' }}
          paint={{
            'line-color': ['case', isHovered, ALT_HOVER_COLOR, ALT_COLOR],
            'line-width': ['case', isHovered, 6, 4.5],
          }}
        />
        <Layer
          id="routes-selected-casing"
          type="line"
          beforeId={beforeId}
          filter={isSelected}
          layout={{ 'line-join': 'round', 'line-cap': 'round' }}
          paint={{ 'line-color': SELECTED_CASING, 'line-width': 11 }}
        />
        <Layer
          id={ROUTE_HIT_LAYER}
          type="line"
          layout={{ 'line-join': 'round', 'line-cap': 'round' }}
          paint={{ 'line-color': '#000000', 'line-opacity': 0, 'line-width': 20 }}
        />
      </Source>
      {selectedRoute && <SelectedRouteLayers route={selectedRoute} beforeId={beforeId} />}
      <RouteLabels plan={plan} selectedId={selectedId} hoveredId={hoveredId} />
    </>
  )
}

function RouteLabels({
  plan,
  selectedId,
  hoveredId,
}: {
  plan: TripPlan
  selectedId: string
  hoveredId: string | null
}) {
  const selectRoute = usePlanner((s) => s.selectRoute)
  const hoverRoute = usePlanner((s) => s.hoverRoute)
  const positions = useMemo(
    () =>
      plan.routes.map((route, i) =>
        pointAlong(route.geometry, LABEL_POSITIONS[i % LABEL_POSITIONS.length]),
      ),
    [plan],
  )

  return plan.routes.map((route, i) => {
    const selected = route.id === selectedId
    const recommended = route.id === plan.recommendation.route_id
    return (
      <Marker
        key={route.id}
        longitude={positions[i][0]}
        latitude={positions[i][1]}
        anchor="bottom"
        style={{ zIndex: selected ? 2 : hoveredId === route.id ? 1 : 0 }}
        onClick={(event) => {
          event.originalEvent.stopPropagation()
          selectRoute(route.id)
        }}
      >
        <div
          onMouseEnter={() => hoverRoute(route.id)}
          onMouseLeave={() => hoverRoute(null)}
          className={cn(
            'mb-1.5 flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap shadow-md transition',
            selected
              ? 'border-sky-700 bg-sky-600 text-white'
              : hoveredId === route.id
                ? 'border-slate-500 bg-slate-700 text-white'
                : 'border-slate-200 bg-white text-slate-700',
          )}
        >
          {route.id}
          <span className="font-normal opacity-80">{formatDuration(route.summary.duration_s)}</span>
          {recommended && <span aria-label="recommended">★</span>}
        </div>
      </Marker>
    )
  })
}
