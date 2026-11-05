import { useMemo } from 'react'
import { useMap } from 'react-map-gl/maplibre'

/** Lowest route layer. Weather overlays go beneath it so routes always stay on top. */
export const ROUTES_BOTTOM_LAYER = 'routes-alt-casing'

/** The id of the basemap's first label layer, so data draws beneath place names. */
export function useFirstLabelLayer(): string | undefined {
  const { current: map } = useMap()
  return useMemo(() => map?.getStyle()?.layers?.find((layer) => layer.type === 'symbol')?.id, [map])
}

/**
 * Where to insert a layer that belongs under the routes. Layers are created during render,
 * and MapLibre rejects a `beforeId` that does not exist yet, so fall back to the label layer
 * until the routes exist (routes added later still land above, before the same label layer).
 */
export function useBelowRoutes(): string | undefined {
  const { current: map } = useMap()
  const firstLabel = useFirstLabelLayer()
  return map?.getLayer(ROUTES_BOTTOM_LAYER) ? ROUTES_BOTTOM_LAYER : firstLabel
}
