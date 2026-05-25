import { GenesisEpochId } from '../../genesisTypes'
import { posKey } from '../../position'
import { smoothNoiseSeeded } from '../../terrain'
import { clamp, dist, fbmWarp2D, generateLandMask, lerp, renderSpace, tileHash } from '../shared'

import type { GenesisEpoch } from '../../genesisTypes'

export const lavaEra: GenesisEpoch = {
  id: GenesisEpochId.LavaEra,
  durationMs: 2000,
  mutate: sim => {
    // Generate the land mask using the seeded RNG — this produces the final coastline
    const { landMask, coastlineTiles, grid } = generateLandMask(sim.width, sim.height, sim.rng)
    sim.landMask = landMask
    sim.coastlineTiles = coastlineTiles
    sim.grid = grid

    // Generate volcanic heat map using layered noise
    const hNoise1 = smoothNoiseSeeded(sim.width, 30, 10, sim.rng)
    const vNoise1 = smoothNoiseSeeded(sim.height, 30, 10, sim.rng)
    const hNoise2 = smoothNoiseSeeded(sim.width, 15, 20, sim.rng)
    const vNoise2 = smoothNoiseSeeded(sim.height, 15, 20, sim.rng)

    for (const key of landMask) {
      const [xStr, yStr] = key.split(',')
      const x = Number(xStr)
      const y = Number(yStr)
      const heat = clamp(50 + hNoise1[x] + vNoise1[y] + hNoise2[x] + vNoise2[y], 0, 100)
      sim.volcanicHeat.set(key, heat)

      // Volcanic hotspots enrich soil
      if (heat > 70) {
        sim.soilHealth.set(key, (sim.soilHealth.get(key) ?? 30) + 20)
      }
    }

    // Generate base elevation via 2D fBm value-noise + domain warping.
    // Output range of fbmWarp2D is roughly [-1.75, 1.75]; scale to ~±28.
    const sampleElev = fbmWarp2D(sim.width, sim.height, sim.rng)
    const elevAmplitude = 28

    // Compute centroid of landMask for center bias
    let sumX = 0
    let sumY = 0
    let landCount = 0
    for (const key of landMask) {
      const [xStr, yStr] = key.split(',')
      sumX += Number(xStr)
      sumY += Number(yStr)
      landCount++
    }
    const centroidX = landCount > 0 ? sumX / landCount : sim.width / 2
    const centroidY = landCount > 0 ? sumY / landCount : sim.height / 2
    const maxLandDist = Math.sqrt((sim.width / 2) ** 2 + (sim.height / 2) ** 2)

    for (const key of landMask) {
      const [xStr, yStr] = key.split(',')
      const x = Number(xStr)
      const y = Number(yStr)

      const noise = sampleElev(x, y) * elevAmplitude

      // Center bias: higher near centroid, lower near edges
      const dFromCenter = dist(x, y, centroidX, centroidY)
      const centerBias = lerp(10, -10, clamp(dFromCenter / maxLandDist, 0, 1))

      // Volcanic ridge bonus
      const heat = sim.volcanicHeat.get(key) ?? 50
      const volcanicBonus = heat > 70 ? Math.floor(((heat - 70) / 30) * 15) : 0

      // Floor inland elevation at 40 so the noise itself can't create
      // cosmetic-water tiles. Real water bodies are produced later by
      // hydraulic erosion + ponds + rivers via explicit tracked sets.
      sim.elevation.set(key, clamp(Math.max(40, Math.round(50 + noise + centerBias + volcanicBonus)), 0, 100))
    }
  },
  renderTile: (sim, x, y, progress, time) => {
    const key = posKey(x, y)
    const h = tileHash(x, y)

    const space = renderSpace(sim, key, h, time)
    if (space) return space

    // Lava rendering
    const heat = sim.volcanicHeat.get(key) ?? 50
    const lavaChars = ['~', '=', '^', '*']
    const pulse = Math.sin(time * 0.004 + h * 0.1) * 0.3 + 0.7
    const ci = (h + Math.floor(time * 0.003)) % lavaChars.length

    // Color based on heat — hotter = brighter
    const heatNorm = heat / 100
    const r = Math.floor(lerp(180, 255, heatNorm * pulse))
    const g = Math.floor(lerp(30, 200, heatNorm * pulse * 0.5))
    const b = Math.floor(lerp(0, 50, (1 - heatNorm) * pulse))
    const color = `rgb(${String(r)},${String(g)},${String(b)})`

    // Fade in with progress
    if (progress < 0.15) {
      const fadeIn = progress / 0.15
      if (tileHash(x + 1, y + 1) % 100 > fadeIn * 100) {
        return [{ char: '.', color: '#696969', dx: 0, dy: 0 }]
      }
    }

    return [{ char: lavaChars[ci], color, dx: 0, dy: 0 }]
  },
}
