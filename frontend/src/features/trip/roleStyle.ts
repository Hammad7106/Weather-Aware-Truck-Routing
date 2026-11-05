import type { PlaceRole } from '../../store/planner'

/** Shared look for origin (A) and destination (B) in the form and on the map. */
export const ROLE_STYLE: Record<
  PlaceRole,
  { letter: string; bg: string; hex: string; name: string }
> = {
  origin: { letter: 'A', bg: 'bg-emerald-600', hex: '#059669', name: 'Start' },
  destination: { letter: 'B', bg: 'bg-rose-600', hex: '#e11d48', name: 'Destination' },
}
