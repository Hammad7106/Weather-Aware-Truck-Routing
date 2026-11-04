import Map, { NavigationControl, ScaleControl } from 'react-map-gl/maplibre'
import { INITIAL_VIEW, MAP_STYLE_URL } from '../config'

/**
 * Full-bleed WebGL map. Route, checkpoint and heatmap layers are added as
 * GeoJSON sources in later batches (never DOM markers, for performance).
 */
export function MapView() {
  return (
    <Map
      initialViewState={INITIAL_VIEW}
      mapStyle={MAP_STYLE_URL}
      style={{ width: '100%', height: '100%' }}
      attributionControl={{ compact: true }}
      dragRotate={false}
      pitchWithRotate={false}
    >
      <NavigationControl position="top-right" showCompass={false} />
      <ScaleControl position="bottom-right" unit="imperial" />
    </Map>
  )
}
