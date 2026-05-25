import { GenesisEpochId } from '../../genesisTypes'
import { posKey } from '../../position'

import type { GenesisEpoch } from '../../genesisTypes'

import { ROCK_COLORS, clamp, dist, lerp, renderSpace, tileHash } from '../shared'

export const crustCooling: GenesisEpoch = {
  id: GenesisEpochId.CrustCooling,
  durationMs: 2000,
  mutate: () => {
    // Visual transition only
  },
  renderTile: (sim, x, y, progress, time) => {
    const key = posKey(x, y)
    const h = tileHash(x, y)

    const space = renderSpace(sim, key, h, time)
    if (space) return space

    const heat = sim.volcanicHeat.get(key) ?? 50

    // Cooling progresses from edges inward
    const centerX = sim.width / 2
    const centerY = sim.height / 2
    const d = dist(x, y, centerX, centerY)
    const maxDist = dist(0, 0, centerX, centerY)
    const edgeFactor = d / maxDist // 0 at center, 1 at edges

    // Higher heat and center = cools later
    const coolProgress = clamp(progress * 1.5 - (1 - edgeFactor) * 0.5 - (heat / 100) * 0.3, 0, 1)

    if (coolProgress < 0.3) {
      // Still lava
      const lavaChars = ['~', '=', '^']
      const pulse = Math.sin(time * 0.004 + h * 0.1) * 0.3 + 0.7
      const ci = (h + Math.floor(time * 0.003)) % lavaChars.length
      const heatNorm = heat / 100
      const r = Math.floor(lerp(180, 255, heatNorm * pulse))
      const g = Math.floor(lerp(30, 200, heatNorm * pulse * 0.5))
      const b = 0
      return [{ char: lavaChars[ci], color: `rgb(${String(r)},${String(g)},${String(b)})`, dx: 0, dy: 0 }]
    }

    if (coolProgress < 0.7) {
      // Transitioning — dark red/brown
      const t = (coolProgress - 0.3) / 0.4
      const r = Math.floor(lerp(200, 139, t))
      const g = Math.floor(lerp(50, 115, t))
      const b = Math.floor(lerp(0, 85, t))
      const rockChars = ['#', '=', '.']
      const ci = h % rockChars.length
      return [{ char: rockChars[ci], color: `rgb(${String(r)},${String(g)},${String(b)})`, dx: 0, dy: 0 }]
    }

    // Cooled — dark rock (no dirt yet, that comes with life)
    const rockChars = ['.', '#', '=']
    const ci = h % rockChars.length
    const ri = h % ROCK_COLORS.length

    // Occasional volcanic flare-back
    if (heat > 80 && Math.sin(time * 0.006 + h) > 0.9) {
      return [{ char: '^', color: '#FF4500', dx: 0, dy: 0 }]
    }

    return [{ char: rockChars[ci], color: ROCK_COLORS[ri], dx: 0, dy: 0 }]
  },
}
