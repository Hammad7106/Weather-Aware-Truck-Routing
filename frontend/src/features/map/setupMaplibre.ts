import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

/*
 * MapLibre 6 looks for its web worker next to its own module file. Vite bundles MapLibre
 * into a hashed chunk, so that sibling file does not exist and vector tiles never render.
 * Importing the worker with `?url` makes Vite emit it as an asset and gives us its real URL.
 */
setWorkerUrl(workerUrl)
