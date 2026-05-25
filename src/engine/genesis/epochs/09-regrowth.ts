import { GenesisEpochId } from '../../genesisTypes'
import { posKey } from '../../position'
import {
  applyWindwardLeewardBias,
  renderDirt,
  renderLowlandWater,
  renderSpace,
  renderVegetation,
  tileHash,
} from '../shared'

import type { GenesisEpoch } from '../../genesisTypes'

export const regrowth: GenesisEpoch = {
  id: GenesisEpochId.Regrowth,
  durationMs: 2000,
  mutate: sim => {
    // Ash enrichment only — no vegetation regrowth. land stays barren into ice age.
    for (const key of sim.burnScars) {
      sim.soilHealth.set(key, (sim.soilHealth.get(key) ?? 30) + 5)
    }
    applyWindwardLeewardBias(sim, 3, -2, 0, 0)
  },
  renderTile: (sim, x, y, _progress, time) => {
    const key = posKey(x, y)
    const h = tileHash(x, y)

    const space = renderSpace(sim, key, h, time)
    if (space) return space

    // Lowland water persists
    const water = renderLowlandWater(sim, key, h, time)
    if (water) return water

    // Surviving vegetation
    const veg = renderVegetation(sim, x, y, h)
    if (veg) return veg

    return renderDirt(sim, key, h)
  },
}
