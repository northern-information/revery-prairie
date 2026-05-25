import { GenesisEpochId } from '../../genesisTypes'
import { TileType } from '../../types'

import type { GenesisEpoch } from '../../genesisTypes'

export const cosmicFormation: GenesisEpoch = {
  id: GenesisEpochId.CosmicFormation,
  durationMs: 2000,
  mutate: sim => {
    // Fill entire grid with space
    for (let y = 0; y < sim.height; y++) {
      for (let x = 0; x < sim.width; x++) {
        sim.grid[y][x] = { type: TileType.Space }
      }
    }
  },
  renderTile: () => {
    // CosmicFormation visuals are owned by the genesis renderer's
    // full-canvas starfield prepass (paintFullCanvasStarfield in
    // genesisRenderer.ts) so the big bang is centered on the canvas
    // rather than on the sim grid. The sim's per-tile path returns
    // empty so nothing paints from the sim diamond.
    return [{ char: ' ', color: '#000', dx: 0, dy: 0 }]
  },
}
