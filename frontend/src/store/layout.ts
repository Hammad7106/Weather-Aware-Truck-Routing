import { create } from 'zustand'

interface LayoutState {
  /** Pixels of map hidden under the mobile bottom sheet; 0 on desktop. */
  mapBottomInset: number
  /** Pixels of map hidden under the overlay panels at the top (phones only). */
  mapTopInset: number
  setMapBottomInset: (pixels: number) => void
  setMapTopInset: (pixels: number) => void
}

/** Layout facts the map needs so it never frames routes behind the bottom sheet. */
export const useLayout = create<LayoutState>()((set) => ({
  mapBottomInset: 0,
  mapTopInset: 0,
  setMapBottomInset: (mapBottomInset) => set({ mapBottomInset }),
  setMapTopInset: (mapTopInset) => set({ mapTopInset }),
}))

/** fitBounds padding that keeps content clear of the edges and of any covering panels. */
export function mapPadding(base: number) {
  const { mapTopInset, mapBottomInset } = useLayout.getState()
  return { top: base + mapTopInset, left: base, right: base, bottom: base + mapBottomInset }
}
