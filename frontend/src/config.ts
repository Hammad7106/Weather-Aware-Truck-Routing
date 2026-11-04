/** Runtime configuration, resolved from Vite env vars at build time. */

const rawApiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export const API_BASE_URL = rawApiBase.replace(/\/+$/, '')

/** Keyless vector tiles, so no map token is needed in production. */
export const MAP_STYLE_URL =
  import.meta.env.VITE_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty'

/** Initial view: continental United States. */
export const INITIAL_VIEW = { longitude: -98.5, latitude: 39.5, zoom: 3.6 }
