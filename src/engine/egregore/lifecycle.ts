// RP-8b — Egregoric flora (mechanical biome).
//
// Inverse-phased lifecycle: egregores wake in Winter and sleep otherwise.
// Mirrors src/engine/floraLifecycle.ts:140-162 with the season check
// flipped. No debounce — a single tick across the season boundary flips
// the stage. Doctrinally: "the prairie's grip is summer, the loosening
// is winter."

import { EgregoreActivityStage, Season } from '@/engine/types'
import type { GameState } from '@/engine/types'

export const tickEgregoreLifecycle = (state: GameState, time: number): void => {
  const isWinter = state.weather.season === Season.Winter
  for (const entry of state.egregoreLifecycle.values()) {
    if (isWinter && entry.stage === EgregoreActivityStage.Dormant) {
      entry.stage = EgregoreActivityStage.Active
      entry.stageStartTime = time
      continue
    }
    if (!isWinter && entry.stage === EgregoreActivityStage.Active) {
      entry.stage = EgregoreActivityStage.Dormant
      entry.stageStartTime = time
    }
  }
}
