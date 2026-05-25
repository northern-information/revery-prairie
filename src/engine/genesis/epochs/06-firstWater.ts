import { GenesisEpochId } from '../../genesisTypes'
import { posKey } from '../../position'

import type { GenesisEpoch } from '../../genesisTypes'

import { ROCK_COLORS, buildLowlandWaterMask, clamp, renderSpace, runHydraulicErosion, tileHash } from '../shared'

export const firstWater: GenesisEpoch = {
  id: GenesisEpochId.FirstWater,
  durationMs: 2000,
  mutate: sim => {
    // Mark ancient seabeds — coastline + a band of low-lying inland tiles
    for (const key of sim.coastlineTiles) {
      sim.ancientSeabeds.add(key)
    }

    // Low-lying inland band (tiles just inside the sand boundary)
    for (const key of sim.landMask) {
      const [xStr, yStr] = key.split(',')
      const x = Number(xStr)
      const y = Number(yStr)
      let nearCoast = false
      for (let dy = -3; dy <= 3 && !nearCoast; dy++) {
        for (let dx = -3; dx <= 3 && !nearCoast; dx++) {
          if (sim.coastlineTiles.has(posKey(x + dx, y + dy))) {
            nearCoast = true
          }
        }
      }
      if (nearCoast) sim.ancientSeabeds.add(key)
    }

    // Ancient seabeds get soil enrichment
    for (const key of sim.ancientSeabeds) {
      if (sim.landMask.has(key)) {
        sim.soilHealth.set(key, (sim.soilHealth.get(key) ?? 30) + 20)
      }
    }

    // Build the cosmetic lowland-water mask used by aquatic-phase epochs.
    // Coarse seeded 2D smooth noise (separable: row noise + column noise)
    // combined with elevation produces coherent lake/sea blobs instead of
    // the salt-and-pepper blotches the old per-tile hash predicate
    // produced. The mask is computed once here and never mutated again,
    // so IceAge's elevation drop and PostGlacialDieOff's erosion can't
    // unintentionally extend the cosmetic water shape.
    buildLowlandWaterMask(sim)

    // Hydraulic erosion micropass: water finds the steepest path downhill,
    // carving valleys and depositing sediment in the lowlands. Skip ancient
    // seabeds (already at low elevation; further carving would dig holes).
    runHydraulicErosion(sim, {
      iterations: 7,
      carveMult: 0.15,
      maxCarve: 3,
      depositFraction: 0.6,
      enrichSoil: true,
      tileFilter: key => !sim.ancientSeabeds.has(key),
    })
  },
  renderTile: (sim, x, y, progress, time) => {
    const key = posKey(x, y)
    const h = tileHash(x, y)

    const space = renderSpace(sim, key, h, time)
    if (space) return space

    // Water gathers in lowlands — read the mask built in mutate(). Per-tile
    // elevation still drives the progressive reveal so higher-elevation lake
    // edges fill in last, but the spatial shape comes from the coherent mask.
    if (sim.lowlandWaterMask.has(key)) {
      const elev = sim.elevation.get(key) ?? 50
      const waterThreshold = clamp(elev / 100, 0, 1)
      if (progress > waterThreshold) {
        const waterChars = ['~', '=', '-']
        const waterColors = ['#4466AA', '#335588', '#556699']
        const ci = (h + Math.floor(time * 0.003)) % waterChars.length
        const wi = h % waterColors.length
        return [{ char: waterChars[ci], color: waterColors[wi], dx: 0, dy: 0 }]
      }
    }

    // Land — dark rock (dirt only appears after life emerges)
    return [{ char: '.', color: ROCK_COLORS[h % ROCK_COLORS.length], dx: 0, dy: 0 }]
  },
}
