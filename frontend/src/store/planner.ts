import { create } from 'zustand'
import type { CheckpointInterval, Place, TripRequest } from '../api/types'
import { safeStorage } from '../lib/storage'
import { roundUp } from '../lib/time'

export type PlaceRole = 'origin' | 'destination'

/** A place in the form. `resolving` is set while its address is being looked up. */
export interface DraftPlace extends Place {
  resolving?: boolean
}

export interface TripDraft {
  origin: DraftPlace | null
  destination: DraftPlace | null
  /** Departure moment as ISO 8601, or '' when the field is empty or invalid. Kept absolute so
   * the field can show it on the start city's clock even when that zone resolves later. */
  departure: string
  loadLb: number
  intervalMiles: CheckpointInterval
}

const RECENT_KEY = 'truck-routing:recent-places'
const MAX_RECENT = 5

export const DEFAULT_LOAD_LB = 35_000

interface PlannerState {
  draft: TripDraft
  /** When set, the next map click sets this place. */
  pickTarget: PlaceRole | null
  /** The trip the results are for; null until the first submit. */
  submittedTrip: TripRequest | null
  submitAttempted: boolean
  recentPlaces: Place[]
  /** Route the user picked; null means "the recommended route". */
  selectedRouteId: string | null
  /** Route under the pointer on the map or in the list, for linked highlighting. */
  hoveredRouteId: string | null
  /** The form collapses to a one-line summary after planning, so results are in view. */
  formOpen: boolean
  /** Checkpoint index on the selected route under the pointer (map, chart or list). */
  hoveredCheckpoint: number | null
  /** Checkpoint index on the selected route whose details are open. */
  selectedCheckpoint: number | null

  setPlace: (role: PlaceRole, place: DraftPlace | null) => void
  swapPlaces: () => void
  setDeparture: (value: string) => void
  setLoad: (lb: number) => void
  setInterval: (miles: CheckpointInterval) => void
  setPickTarget: (role: PlaceRole | null) => void
  setSubmitAttempted: (attempted: boolean) => void
  applyDraft: (draft: Partial<TripDraft>) => void
  submit: (trip: TripRequest) => void
  selectRoute: (id: string | null) => void
  hoverRoute: (id: string | null) => void
  setFormOpen: (open: boolean) => void
  hoverCheckpoint: (index: number | null) => void
  selectCheckpoint: (index: number | null) => void
}

function rememberPlaces(recent: Place[], places: Place[]): Place[] {
  const merged = [...places, ...recent].filter(
    (place, index, all) => all.findIndex((p) => p.label === place.label) === index,
  )
  return merged.slice(0, MAX_RECENT)
}

export const usePlanner = create<PlannerState>()((set) => ({
  draft: {
    origin: null,
    destination: null,
    departure: roundUp(new Date(), 15).toISOString(),
    loadLb: DEFAULT_LOAD_LB,
    intervalMiles: 25,
  },
  pickTarget: null,
  submittedTrip: null,
  submitAttempted: false,
  recentPlaces: safeStorage.get<Place[]>(RECENT_KEY, []),
  selectedRouteId: null,
  hoveredRouteId: null,
  formOpen: true,
  hoveredCheckpoint: null,
  selectedCheckpoint: null,

  setPlace: (role, place) => set((s) => ({ draft: { ...s.draft, [role]: place } })),
  swapPlaces: () =>
    set((s) => ({
      draft: { ...s.draft, origin: s.draft.destination, destination: s.draft.origin },
    })),
  setDeparture: (departure) => set((s) => ({ draft: { ...s.draft, departure } })),
  setLoad: (loadLb) => set((s) => ({ draft: { ...s.draft, loadLb } })),
  setInterval: (intervalMiles) => set((s) => ({ draft: { ...s.draft, intervalMiles } })),
  setPickTarget: (pickTarget) => set({ pickTarget }),
  setSubmitAttempted: (submitAttempted) => set({ submitAttempted }),
  applyDraft: (draft) => set((s) => ({ draft: { ...s.draft, ...draft } })),
  submit: (trip) =>
    set((s) => {
      const recentPlaces = rememberPlaces(s.recentPlaces, [trip.origin, trip.destination])
      safeStorage.set(RECENT_KEY, recentPlaces)
      return {
        submittedTrip: trip,
        submitAttempted: false,
        pickTarget: null,
        recentPlaces,
        selectedRouteId: null,
        hoveredRouteId: null,
        formOpen: false,
        hoveredCheckpoint: null,
        selectedCheckpoint: null,
      }
    }),
  // Checkpoint indexes belong to one route, so switching routes clears them.
  selectRoute: (selectedRouteId) =>
    set((s) =>
      s.selectedRouteId === selectedRouteId
        ? {}
        : { selectedRouteId, hoveredCheckpoint: null, selectedCheckpoint: null },
    ),
  hoverRoute: (hoveredRouteId) => set({ hoveredRouteId }),
  setFormOpen: (formOpen) => set({ formOpen }),
  hoverCheckpoint: (hoveredCheckpoint) => set({ hoveredCheckpoint }),
  selectCheckpoint: (selectedCheckpoint) => set({ selectedCheckpoint }),
}))
