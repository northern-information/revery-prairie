import { GenesisEpochId } from '../../genesisTypes'
import { dist, tileHash } from '../shared'

import type { GenesisEpoch } from '../../genesisTypes'

export const landAccretion: GenesisEpoch = {
  id: GenesisEpochId.LandAccretion,
  durationMs: 2000,
  mutate: () => {
    // No grid mutations — purely visual
  },
  renderTile: (sim, x, y, progress, time) => {
    const centerX = sim.width / 2
    const centerY = sim.height / 2
    const d = dist(x, y, centerX, centerY)
    const maxRadius = Math.min(sim.width, sim.height) * 0.35
    const currentRadius = progress * maxRadius
    const h = tileHash(x, y)

    // Soft rim: the outermost ~6 sim tiles of the rock mass scatter
    // into the surrounding starfield via a probabilistic alpha. Without
    // this the rock circle has a hard boundary that reads as a visible
    // cutoff against the prepass-painted stars beyond.
    const RIM_TILES = 6
    if (d <= currentRadius) {
      const distFromRim = currentRadius - d
      if (distFromRim < RIM_TILES) {
        // Inside the rim band: paint rock with probability proportional
        // to how deep into the mass we are. Tiles closer to the rim
        // drop out more often, producing a stochastic fade.
        const rimT = distFromRim / RIM_TILES
        if ((h % 100) / 100 > rimT) {
          // Tile drops out of the rock mass; fall through to the
          // drift-particle branch below so something organic can paint.
        } else {
          const rockChars = ['.', '#', '=', '*']
          const rockColors = ['#8B7355', '#696969', '#808080', '#6B4226']
          const ci = (h + Math.floor(time * 0.002)) % rockChars.length
          const ri = h % rockColors.length
          return [{ char: rockChars[ci], color: rockColors[ri], dx: 0, dy: 0 }]
        }
      } else {
        // Solid mass forming (interior)
        const rockChars = ['.', '#', '=', '*']
        const rockColors = ['#8B7355', '#696969', '#808080', '#6B4226']
        const ci = (h + Math.floor(time * 0.002)) % rockChars.length
        const ri = h % rockColors.length
        return [{ char: rockChars[ci], color: rockColors[ri], dx: 0, dy: 0 }]
      }
    }

    // Particles drifting inward
    const angle = Math.atan2(y - centerY, x - centerX)
    const drift = d - progress * 20
    const particlePhase = (drift * 0.1 + angle * 2 + time * 0.003) % 1

    if (particlePhase > 0.85 && d < maxRadius * 2) {
      return [{ char: '.', color: '#887766', dx: 0, dy: 0 }]
    }

    // Background stars are owned by the genesis renderer's full-canvas
    // starfield prepass (paintFullCanvasStarfield in genesisRenderer.ts)
    // so the sky reads as sky-wide rather than ending at the sim's
    // diamond boundary. Return empty here so the prepass shows through.
    return [{ char: ' ', color: '#000', dx: 0, dy: 0 }]
  },
}
