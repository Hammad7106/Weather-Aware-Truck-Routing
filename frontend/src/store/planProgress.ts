import { create } from 'zustand'
import type { PlanStage } from '../api/browserWeather'

/** Which step of planning is running, for the loading panel. */
export const usePlanProgress = create<{ stage: PlanStage; setStage: (stage: PlanStage) => void }>()(
  (set) => ({ stage: 'routes', setStage: (stage) => set({ stage }) }),
)
