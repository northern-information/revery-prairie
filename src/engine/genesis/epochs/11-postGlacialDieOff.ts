import { GenesisEpochId } from '../../genesisTypes'
import { posKey } from '../../position'
import { clamp, renderDirt, renderLowlandWater, renderSpace, runHydraulicErosion, tileHash } from '../shared'

import type { GenesisEpoch } from '../../genesisTypes'

export const postGlacialDieOff: GenesisEpoch = {
  id: GenesisEpochId.PostGlacialDieOff,
  durationMs: 2000,
  mutate: sim => {
    // Kill 60-70% of remaining vegetation, weighted by distance from water
    for (const key of sim.landMask) {
      const veg = sim.vegetationMap.get(key) ?? 0
      if (veg <= 0) continue

      // Coastal areas survive better
      const isNearCoast = sim.ancientSeabeds.has(key)
      const surviveChance = isNearCoast ? 0.6 : 0.3

      if (sim.rng() > surviveChance) {
        sim.vegetationMap.set(key, 0)
        // Mass decomposition enriches soil
        sim.soilHealth.set(key, (sim.soilHealth.get(key) ?? 30) + 8)
      }
    }

    // Glacial recession erosion: meltwater drains from the retreating ice
    // sheet and carves U-shaped valleys. Operates on glacial tiles and their
    // immediate neighbors. No soil enrichment — meltwater is sterile.
    const recessionFilter = (key: string): boolean => {
      if (sim.glacialPaths.has(key)) return true
      const [xStr, yStr] = key.split(',')
      const x = Number(xStr)
      const y = Number(yStr)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          if (sim.glacialPaths.has(posKey(x + dx, y + dy))) return true
        }
      }
      return false
    }
    runHydraulicErosion(sim, {
      iterations: 5,
      carveMult: 0.2,
      maxCarve: 4,
      depositFraction: 1.0,
      enrichSoil: false,
      tileFilter: recessionFilter,
    })
  },
  renderTile: (sim, x, y, progress, time) => {
    const key = posKey(x, y)
    const h = tileHash(x, y)

    const space = renderSpace(sim, key, h, time)
    if (space) return space

    // Glaciers persist through the extinction — animated to match ice age
    if (sim.glacialPaths.has(key)) {
      const iceChars = ['#', '=', '.', '*']
      const iceColors = ['#B0C4DE', '#E0E8F0', '#FFFFFF', '#ADD8E6']
      const ci = (h + Math.floor(time * 0.002)) % iceChars.length
      const ii = h % iceColors.length
      return [{ char: iceChars[ci], color: iceColors[ii], dx: 0, dy: 0 }]
    }

    // Lowland water stays frozen during extinction
    const lowWater = renderLowlandWater(sim, key, h, time)
    if (lowWater) {
      const iceChars = ['#', '=', '.']
      const iceColors = ['#B0C4DE', '#E0E8F0', '#ADD8E6']
      const ci = (h + Math.floor(time * 0.002)) % iceChars.length
      const ii = h % iceColors.length
      return [{ char: iceChars[ci], color: iceColors[ii], dx: 0, dy: 0 }]
    }

    const veg = sim.vegetationMap.get(key) ?? 0
    const dieDelay = ((h % 100) / 100) * 0.5

    if (veg <= 0 && progress > dieDelay) {
      // Dying animation: green → brown → black → fading
      const dieProgress = clamp((progress - dieDelay) / 0.5, 0, 1)

      if (dieProgress < 0.3) {
        return [{ char: '%', color: '#8B6914', dx: 0, dy: 0 }]
      }
      if (dieProgress < 0.6) {
        return [{ char: '.', color: '#2A1A0A', dx: 0, dy: 0 }]
      }
      return [{ char: '.', color: '#4A3728', dx: 0, dy: 0 }]
    }

    // Surviving vegetation
    if (veg > 20) {
      const greenColors = ['#2E8B57', '#3CB371', '#50C878']
      const gi = h % greenColors.length
      return [{ char: '%', color: greenColors[gi], dx: 0, dy: 0 }]
    }

    return renderDirt(sim, key, h)
  },
}
