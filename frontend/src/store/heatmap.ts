import { create } from 'zustand'

export type HeatmapMetric = 'risk' | 'wind' | 'rain' | 'snow'

/** Last slider position (hours after departure). */
export const MAX_HOUR = 48

interface HeatmapState {
  visible: boolean
  metric: HeatmapMetric
  /** Hours after departure, 0–48. */
  hour: number
  playing: boolean
  setVisible: (visible: boolean) => void
  setMetric: (metric: HeatmapMetric) => void
  setHour: (hour: number) => void
  setPlaying: (playing: boolean) => void
}

/**
 * Heatmap controls live in their own store: the slider changes many times a second, and only
 * the few components that read `hour` should re-render.
 */
export const useHeatmap = create<HeatmapState>()((set) => ({
  visible: true,
  metric: 'risk',
  hour: 0,
  playing: false,
  setVisible: (visible) => set(visible ? { visible } : { visible, playing: false }),
  setMetric: (metric) => set({ metric }),
  setHour: (hour) => set({ hour: Math.min(MAX_HOUR, Math.max(0, Math.round(hour))) }),
  setPlaying: (playing) => set({ playing }),
}))
