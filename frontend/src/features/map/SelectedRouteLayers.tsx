import type { ExpressionSpecification } from 'maplibre-gl'
import { useEffect, useMemo } from 'react'
import { Layer, Popup, Source, useMap } from 'react-map-gl/maplibre'
import type { RouteOption } from '../../api/types'
import { NO_DATA_STYLE, RISK_STYLES } from '../../lib/risk'
import { usePlanner } from '../../store/planner'
import { CheckpointDetails } from '../plan/CheckpointDetails'

/** Interactive checkpoint dots (hover and click). */
export const CHECKPOINT_LAYER = 'checkpoints'

/** Risk level → colour; features without a forecast carry level -1. */
const LEVEL_COLOR: ExpressionSpecification = [
  'match',
  ['get', 'level'],
  ...RISK_STYLES.flatMap((style) => [style.level, style.color]),
  NO_DATA_STYLE.color,
] as unknown as ExpressionSpecification

/**
 * The selected route coloured stretch by stretch by risk, with a dot per checkpoint.
 * Drawn from two GeoJSON sources so hovering only changes paint expressions, never data.
 */
export function SelectedRouteLayers({
  route,
  beforeId,
}: {
  route: RouteOption
  beforeId: string | undefined
}) {
  const { current: map } = useMap()
  const hovered = usePlanner((s) => s.hoveredCheckpoint)
  const selected = usePlanner((s) => s.selectedCheckpoint)
  const selectCheckpoint = usePlanner((s) => s.selectCheckpoint)

  const segments = useMemo<GeoJSON.FeatureCollection<GeoJSON.LineString>>(
    () => ({
      type: 'FeatureCollection',
      features: route.segments.map((segment) => ({
        type: 'Feature',
        properties: { index: segment.checkpoint_index, level: segment.level ?? -1 },
        geometry: { type: 'LineString', coordinates: segment.coordinates },
      })),
    }),
    [route],
  )

  const checkpoints = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(
    () => ({
      type: 'FeatureCollection',
      features: route.checkpoints.map((cp) => ({
        type: 'Feature',
        properties: { index: cp.index, level: cp.level ?? -1 },
        geometry: { type: 'Point', coordinates: [cp.lon, cp.lat] },
      })),
    }),
    [route],
  )

  // Bring a checkpoint chosen in the sidebar into view (only if it is off-screen).
  const selectedCheckpoint = selected === null ? null : route.checkpoints[selected]
  useEffect(() => {
    if (!map || !selectedCheckpoint) return
    const point: [number, number] = [selectedCheckpoint.lon, selectedCheckpoint.lat]
    if (!map.getBounds().contains(point)) map.easeTo({ center: point, duration: 700 })
  }, [map, selectedCheckpoint])

  const focus = hovered ?? selected ?? -1
  const isFocused: ExpressionSpecification = ['==', ['get', 'index'], focus]

  return (
    <>
      <Source id="selected-segments" type="geojson" data={segments}>
        <Layer
          id="selected-segments"
          type="line"
          beforeId={beforeId}
          layout={{ 'line-join': 'round', 'line-cap': 'round' }}
          paint={{
            'line-color': LEVEL_COLOR,
            'line-width': ['case', isFocused, 10, 6.5],
          }}
        />
      </Source>
      <Source id="checkpoints" type="geojson" data={checkpoints}>
        <Layer
          id={CHECKPOINT_LAYER}
          type="circle"
          paint={{
            'circle-color': LEVEL_COLOR,
            // MapLibre only allows "zoom" at the top level, so the focus check sits per stop.
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4,
              ['case', isFocused, 7, 2.5],
              7,
              ['case', isFocused, 8.5, 4.5],
              11,
              ['case', isFocused, 10, 6.5],
            ],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': ['case', isFocused, 3, 1.5],
          }}
        />
      </Source>

      {selectedCheckpoint && (
        <Popup
          longitude={selectedCheckpoint.lon}
          latitude={selectedCheckpoint.lat}
          anchor="bottom"
          offset={14}
          maxWidth="none"
          closeOnClick={false}
          focusAfterOpen={false}
          onClose={() => selectCheckpoint(null)}
          className="checkpoint-popup"
        >
          <CheckpointDetails checkpoint={selectedCheckpoint} />
        </Popup>
      )}
    </>
  )
}
