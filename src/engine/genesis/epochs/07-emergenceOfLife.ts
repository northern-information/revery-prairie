import { GenesisEpochId } from '../../genesisTypes'
import { posKey } from '../../position'

import type { GenesisEpoch } from '../../genesisTypes'

import {
  DIRT_COLORS,
  ROCK_COLORS,
  applyWindwardLeewardBias,
  clamp,
  renderLowlandWater,
  renderSpace,
  tileHash,
} from '../shared'

export const emergenceOfLife: GenesisEpoch = {
  id: GenesisEpochId.EmergenceOfLife,
  durationMs: 2000,
  mutate: sim => {
    // Spread vegetation across all land — denser near water, thinner inland
    for (const key of sim.landMask) {
      const elev = sim.elevation.get(key) ?? 50
      // Lower elevation = more moisture = denser vegetation
      // All land gets meaningful vegetation (no bare inland gaps)
      const baseVeg = elev < 40 ? 70 : elev < 60 ? 55 : 40
      sim.vegetationMap.set(key, baseVeg + Math.floor(sim.rng() * 30))
      sim.soilHealth.set(key, (sim.soilHealth.get(key) ?? 30) + 5)
    }
    applyWindwardLeewardBias(sim, 5, -3, 10, -10)
  },
  renderTile: (sim, x, y, progress, time) => {
    const key = posKey(x, y)
    const h = tileHash(x, y)

    const space = renderSpace(sim, key, h, time)
    if (space) return space

    // Lowland water persists from first water epoch — life grows around it
    const water = renderLowlandWater(sim, key, h, time)
    if (water) return water

    // Green spreads from lowlands outward — life emerges near water first
    const elev = sim.elevation.get(key) ?? 50
    const scatter = (h % 25) - 12 + (((h >>> 8) % 15) - 7)
    const greenThreshold = clamp((elev + scatter - 40) / 60, 0, 0.9)
    if (progress > greenThreshold && (sim.vegetationMap.get(key) ?? 0) > 20) {
      const greenColors = ['#2E8B57', '#3CB371', '#50C878']
      const gi = h % greenColors.length
      return [{ char: '%', color: greenColors[gi], dx: 0, dy: 0 }]
    }

    // Bare land transitions from dark rock to dirt as life spreads
    const rockToDirt = clamp(progress * 1.5, 0, 1)
    if (rockToDirt < 1) {
      return [{ char: '.', color: ROCK_COLORS[h % ROCK_COLORS.length], dx: 0, dy: 0 }]
    }
    return [{ char: '.', color: DIRT_COLORS[h % DIRT_COLORS.length], dx: 0, dy: 0 }]
  },
}
