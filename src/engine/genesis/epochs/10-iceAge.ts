import { SPACE_BORDER } from '../../constants'
import { GenesisEpochId } from '../../genesisTypes'
import { posKey } from '../../position'
import { smoothNoiseSeeded } from '../../terrain'

import type { GenesisEpoch } from '../../genesisTypes'

import { clamp, renderDirt, renderLowlandWater, renderSpace, renderVegetation, tileHash } from '../shared'

export const iceAge: GenesisEpoch = {
  id: GenesisEpochId.IceAge,
  durationMs: 2000,
  mutate: sim => {
    // Snapshot vegetation before glaciers destroy it (for dramatic render)
    for (const [key, value] of sim.vegetationMap) {
      sim.preGlacialVegetation.set(key, value)
    }

    // Generate smooth noise for glacier edges (organic lobes, not sawtooth).
    // Under the rotated cardinal frame (backlog-thinktank-v5 round 1) glaciers
    // advance along the u = x + y axis (diamond's vertical screen axis), so
    // the perpendicular coordinate is v = x - y. Noise arrays index by
    // (x - y + sim.height - 1), spanning [0, sim.width + sim.height - 2].
    // Top and bottom fronts share the same noise array so the two ice ages
    // advance in mirrored shape; independent draws made one front visibly
    // outpace the other, which read as a worldgen seam.
    const vSpan = sim.width + sim.height - 1
    const sharedEdgeNoise = smoothNoiseSeeded(vSpan, 14, 12, sim.rng)
    sim.glacialEdgeNoise = {
      top: sharedEdgeNoise,
      bottom: sharedEdgeNoise,
    }

    // Glaciers advance from the diamond's top tip (storage (SPACE_BORDER,
    // SPACE_BORDER)) and bottom tip (storage (max, max)). Polar distance is
    // measured along u = (x - SB) + (y - SB). The u span across the playable
    // region is 2 * (playable side - 1); glacialDepth at 0.25 advances each
    // front ~25% of the u-span in from its tip, restoring a recognisably
    // "ice age" reach after the RP-30 rotation left 0.1 barely visible.
    const playableU = sim.width + sim.height - 2 * SPACE_BORDER
    const glacialDepth = Math.floor(playableU * 0.25)

    for (const key of sim.landMask) {
      const [xStr, yStr] = key.split(',')
      const x = Number(xStr)
      const y = Number(yStr)
      const topDist = (x - SPACE_BORDER) + (y - SPACE_BORDER)
      const bottomDist = playableU - 2 - topDist

      // Is this tile in the glacial zone?
      const inGlacial = topDist < glacialDepth + 8 || bottomDist < glacialDepth + 8

      if (inGlacial) {
        // Smooth noise edge offsets keyed by v = x - y + height - 1
        const vIdx = x - y + sim.height - 1
        const topNoise = sim.glacialEdgeNoise.top[vIdx] ?? 0
        const bottomNoise = sim.glacialEdgeNoise.bottom[vIdx] ?? 0

        const effectiveTopDepth = glacialDepth + topNoise
        const effectiveBottomDepth = glacialDepth + bottomNoise

        if (topDist < effectiveTopDepth || bottomDist < effectiveBottomDepth) {
          sim.glacialPaths.add(key)
          sim.soilHealth.set(key, Math.max(10, (sim.soilHealth.get(key) ?? 30) - 15))
          sim.vegetationMap.set(key, 0)

          // Glaciers carve valleys — lower elevation
          const currentElev = sim.elevation.get(key) ?? 50
          sim.elevation.set(key, clamp(currentElev - 15, 0, 100))

          // Random patches hit minimum
          const h = tileHash(x, y)
          if (h % 7 === 0) {
            sim.soilHealth.set(key, 10)
          }
        }
      }
    }

    // Deposit moraines at glacier terminal edges (slight elevation bump)
    for (const key of sim.glacialPaths) {
      const [xStr, yStr] = key.split(',')
      const gx = Number(xStr)
      const gy = Number(yStr)
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]
      for (const [ddx, ddy] of dirs) {
        const nk = posKey(gx + ddx, gy + ddy)
        if (sim.landMask.has(nk) && !sim.glacialPaths.has(nk)) {
          const nElev = sim.elevation.get(nk) ?? 50
          sim.elevation.set(nk, clamp(nElev + 5, 0, 100))
        }
      }
    }

    // Generate meltwater pools at glacier edges
    const edgeTiles: string[] = []
    for (const key of sim.glacialPaths) {
      const [xStr, yStr] = key.split(',')
      const gx = Number(xStr)
      const gy = Number(yStr)
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]
      for (const [ddx, ddy] of dirs) {
        const nk = posKey(gx + ddx, gy + ddy)
        if (sim.landMask.has(nk) && !sim.glacialPaths.has(nk)) {
          edgeTiles.push(nk)
          break
        }
      }
    }
    // Pick a few melt pool sites
    const numMeltPools = 3 + Math.floor(sim.rng() * 4)
    for (let i = 0; i < numMeltPools && edgeTiles.length > 0; i++) {
      const idx = Math.floor(sim.rng() * edgeTiles.length)
      const poolCenter = edgeTiles[idx]
      sim.meltPools.add(poolCenter)
      // Small cluster around center
      const [pxStr, pyStr] = poolCenter.split(',')
      const px = Number(pxStr)
      const py = Number(pyStr)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nk = posKey(px + dx, py + dy)
          if (sim.landMask.has(nk) && !sim.glacialPaths.has(nk) && sim.rng() < 0.5) {
            sim.meltPools.add(nk)
          }
        }
      }
    }
  },
  renderTile: (sim, x, y, progress, time) => {
    const key = posKey(x, y)
    const h = tileHash(x, y)

    const space = renderSpace(sim, key, h, time)
    if (space) return space

    const isGlacial = sim.glacialPaths.has(key)

    if (isGlacial) {
      // Glaciers only advance during ice age — no recede until warm period.
      // Rotated cardinal frame (backlog-thinktank-v5 round 1): polar distance
      // is u = (x - SB) + (y - SB), edge noise keyed by v = x - y + height - 1.
      const advanceProgress = clamp(progress, 0, 1)

      const [, yStr] = key.split(',')
      const ty = Number(yStr)
      const playableU = sim.width + sim.height - 2 * SPACE_BORDER
      const glacialDepth = Math.floor(playableU * 0.25)
      const vIdx = x - ty + sim.height - 1
      const topNoise = sim.glacialEdgeNoise.top[vIdx] ?? 0
      const bottomNoise = sim.glacialEdgeNoise.bottom[vIdx] ?? 0
      const effectiveTopDepth = glacialDepth + topNoise
      const effectiveBottomDepth = glacialDepth + bottomNoise
      const topDist = (x - SPACE_BORDER) + (ty - SPACE_BORDER)
      const bottomDist = playableU - 2 - topDist
      const minDist = topDist < bottomDist ? topDist : bottomDist
      const effectiveDepth = topDist < bottomDist ? effectiveTopDepth : effectiveBottomDepth
      const coverThreshold = clamp(minDist / effectiveDepth, 0, 1)

      if (advanceProgress > coverThreshold) {
        // Ice
        const iceChars = ['#', '=', '.', '*']
        const iceColors = ['#B0C4DE', '#E0E8F0', '#FFFFFF', '#ADD8E6']
        const ci = (h + Math.floor(time * 0.002)) % iceChars.length
        const ii = h % iceColors.length
        return [{ char: iceChars[ci], color: iceColors[ii], dx: 0, dy: 0 }]
      }

      // Ahead of glacier front — show pre-glacial state
      const preVeg = sim.preGlacialVegetation.get(key) ?? 0
      if (preVeg > 20) {
        const greenColors = ['#2E8B57', '#3CB371', '#50C878']
        const gi = h % greenColors.length
        return [{ char: '%', color: greenColors[gi], dx: 0, dy: 0 }]
      }
      return renderDirt(sim, key, h)
    }

    // Lowland water freezes gradually as glaciers advance nearby.
    // Rotated cardinal frame: polar distance is u = (x - SB) + (y - SB).
    const lowWater = renderLowlandWater(sim, key, h, time)
    if (lowWater) {
      const [, yStr] = key.split(',')
      const ty = Number(yStr)
      const playableU = sim.width + sim.height - 2 * SPACE_BORDER
      const glacialDepth = Math.floor(playableU * 0.25)
      const topDist = (x - SPACE_BORDER) + (ty - SPACE_BORDER)
      const bottomDist = playableU - 2 - topDist
      const minDist = Math.min(topDist, bottomDist)
      // Water freezes at the same rate as glacier advance but reaches slightly further
      const freezeThreshold = clamp(minDist / (glacialDepth * 1.3), 0, 1)
      // Add per-tile scatter so freezing isn't uniform
      const scatter = ((h % 10) - 5) / 100
      if (progress > freezeThreshold + scatter) {
        const iceChars = ['#', '=', '.']
        const iceColors = ['#B0C4DE', '#E0E8F0', '#ADD8E6']
        const ci = (h + Math.floor(time * 0.002)) % iceChars.length
        const ii = h % iceColors.length
        return [{ char: iceChars[ci], color: iceColors[ii], dx: 0, dy: 0 }]
      }
      return lowWater
    }

    // Non-glacial tiles — vegetationMap is intact for these (only glacial tiles were cleared)
    const vegRender = renderVegetation(sim, x, y, h)
    if (vegRender) return vegRender

    return renderDirt(sim, key, h)
  },
}
