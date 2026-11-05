import type { ExpressionSpecification } from 'maplibre-gl'
import { useMemo } from 'react'
import { Layer, Source } from 'react-map-gl/maplibre'
import type { CorridorWeather } from '../../api/types'
import { corridorFeatures, groundRadius, uniformIntensity } from '../heatmap/corridor'
import { colorExpression, METRICS, weightExpression, type MetricConfig } from '../heatmap/metrics'
import { useHeatmap } from '../../store/heatmap'
import { useBelowRoutes } from './layerOrder'

/** Invisible per-cell circles used to show a cell's values on hover. */
export const CORRIDOR_HIT_LAYER = 'corridor-hit'

/** Heatmap blur radius as a multiple of the grid spacing: smooth, and still local. */
const RADIUS_FACTOR = 2
/** Above this zoom the blur gets coarse, so the heatmap hands over to per-cell circles. */
const HANDOVER_ZOOM = 8.5

/** Exact per-cell colour for the close-up circles (no data → transparent). */
function cellColor(metric: MetricConfig, hour: number): ExpressionSpecification {
  const key = `${metric.prefix}${hour}`
  return [
    'case',
    ['==', ['typeof', ['get', key]], 'number'],
    [
      'interpolate',
      ['linear'],
      ['get', key],
      ...metric.stops.flatMap((stop) => [stop.value, stop.color]),
    ],
    'rgba(0,0,0,0)',
  ] as unknown as ExpressionSpecification
}

/**
 * Corridor weather for the slider's hour. All 49 hours live in the feature properties, so
 * moving the slider only swaps paint expressions: no request, no data upload.
 */
export function CorridorHeatmapLayer({ corridor }: { corridor: CorridorWeather }) {
  const metric = METRICS[useHeatmap((s) => s.metric)]
  const hour = useHeatmap((s) => s.hour)
  const beforeId = useBelowRoutes()

  const data = useMemo(() => corridorFeatures(corridor), [corridor])
  const blurRadius = useMemo(() => groundRadius(corridor, RADIUS_FACTOR), [corridor])
  const cellRadius = useMemo(() => groundRadius(corridor, 0.55), [corridor])
  const color = useMemo(() => colorExpression(metric), [metric])

  return (
    <Source id="corridor" type="geojson" data={data}>
      <Layer
        id="corridor-heat"
        type="heatmap"
        beforeId={beforeId}
        maxzoom={HANDOVER_ZOOM + 1}
        paint={{
          'heatmap-weight': weightExpression(metric, hour),
          'heatmap-radius': blurRadius,
          'heatmap-intensity': uniformIntensity(RADIUS_FACTOR),
          'heatmap-color': color,
          'heatmap-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            HANDOVER_ZOOM - 0.5,
            1,
            HANDOVER_ZOOM + 0.5,
            0,
          ],
        }}
      />
      <Layer
        id="corridor-cells"
        type="circle"
        beforeId={beforeId}
        minzoom={HANDOVER_ZOOM - 0.5}
        paint={{
          'circle-radius': cellRadius,
          'circle-color': cellColor(metric, hour),
          'circle-blur': 0.5,
          'circle-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            HANDOVER_ZOOM - 0.5,
            0,
            HANDOVER_ZOOM + 0.5,
            1,
          ],
        }}
      />
      <Layer
        id={CORRIDOR_HIT_LAYER}
        type="circle"
        beforeId={beforeId}
        paint={{ 'circle-radius': cellRadius, 'circle-opacity': 0 }}
      />
    </Source>
  )
}
