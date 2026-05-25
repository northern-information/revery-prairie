import { SPACE_BORDER } from '../../constants'
import { GenesisEpochId } from '../../genesisTypes'
import { posKey } from '../../position'
import {
  applyWindwardLeewardBias,
  clamp,
  COAST_INLAND_BIAS_PENALTY,
  COAST_INLAND_BIAS_RADIUS,
  dist,
  renderDirt,
  renderLowlandWater,
  renderSpace,
  tileHash,
} from '../shared'

import type { GenesisEpoch } from '../../genesisTypes'

export const warmPeriod: GenesisEpoch = {
  id: GenesisEpochId.WarmPeriod,
  durationMs: 2000,
  mutate: sim => {
    const landKeys = [...sim.landMask]

    // Generate rivers via steepest-descent from glacier melt sources
    const numRivers = 2 + Math.floor(sim.rng() * 3)

    // River sources: melt pool tiles and high-elevation tiles near glacier edges
    const riverSources: string[] = [...sim.meltPools]
    for (let attempt = 0; attempt < 50 && riverSources.length < numRivers * 2; attempt++) {
      const candidate = landKeys[Math.floor(sim.rng() * landKeys.length)]
      const elev = sim.elevation.get(candidate) ?? 50
      if (elev > 65 && !sim.glacialPaths.has(candidate) && !sim.riverPaths.has(candidate)) {
        riverSources.push(candidate)
      }
    }

    const cardinalDirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]

    for (let r = 0; r < numRivers && riverSources.length > 0; r++) {
      const sourceIdx = Math.floor(sim.rng() * riverSources.length)
      const startKey = riverSources.splice(sourceIdx, 1)[0]
      const [sxStr, syStr] = startKey.split(',')
      let rx = Number(sxStr)
      let ry = Number(syStr)
      const riverPath: { x: number; y: number }[] = []
      const visited = new Set<string>()

      // Steepest-descent walk
      for (let step = 0; step < 300; step++) {
        const key = posKey(rx, ry)
        if (visited.has(key)) break
        visited.add(key)
        sim.riverPaths.add(key)
        riverPath.push({ x: rx, y: ry })

        // Erode: lower elevation along river path
        const currentElev = sim.elevation.get(key) ?? 50
        sim.elevation.set(key, clamp(currentElev - 2, 0, 100))

        // Find lowest and second-lowest neighbors
        let bestKey: string | null = null
        let bestElev = Infinity
        let secondBestKey: string | null = null
        let secondBestElev = Infinity

        for (const [ddx, ddy] of cardinalDirs) {
          const nx = rx + ddx
          const ny = ry + ddy
          const nk = posKey(nx, ny)
          if (!sim.landMask.has(nk) || visited.has(nk)) continue
          const nElev = sim.elevation.get(nk) ?? 50
          if (nElev < bestElev) {
            secondBestKey = bestKey
            secondBestElev = bestElev
            bestKey = nk
            bestElev = nElev
          } else if (nElev < secondBestElev) {
            secondBestKey = nk
            secondBestElev = nElev
          }
        }

        // No valid neighbor — river pools here (local minimum)
        if (!bestKey) break

        // 20% chance to pick second-best for natural meandering
        const chosenKey = secondBestKey && sim.rng() < 0.2 ? secondBestKey : bestKey
        const [nxStr, nyStr] = chosenKey.split(',')
        rx = Number(nxStr)
        ry = Number(nyStr)
      }

      sim.riverPathsOrdered.push(riverPath)

      // River adjacency enrichment
      for (const key of visited) {
        const [pxStr, pyStr] = key.split(',')
        const px = Number(pxStr)
        const py = Number(pyStr)
        const enrichDirs = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, 1],
          [-1, -1],
          [1, -1],
          [-1, 1],
        ]
        for (const [ddx, ddy] of enrichDirs) {
          const nk = posKey(px + ddx, py + ddy)
          if (sim.landMask.has(nk) && !sim.riverPaths.has(nk)) {
            sim.soilHealth.set(nk, (sim.soilHealth.get(nk) ?? 30) + 10)
          }
        }
      }
    }

    // Elevation-driven pond generation: find local minima, flood upward.
    // The 0.18 budget is sized to land near the 15% final-water target
    // after FallOfCivilizations' softened drought trims residual <10-tile
    // fragments.
    const waterBudget = Math.floor(sim.landMask.size * 0.18)
    const minima: { key: string; elev: number; coastal: boolean }[] = []

    for (const key of sim.landMask) {
      if (sim.riverPaths.has(key)) continue
      const elev = sim.elevation.get(key) ?? 50
      const [xStr, yStr] = key.split(',')
      const x = Number(xStr)
      const y = Number(yStr)
      let isMinimum = true
      for (const [ddx, ddy] of cardinalDirs) {
        const nk = posKey(x + ddx, y + ddy)
        const nElev = sim.elevation.get(nk)
        if (nElev !== undefined && nElev < elev) {
          isMinimum = false
          break
        }
      }
      if (isMinimum) {
        // Coastal proximity test: Chebyshev within COAST_INLAND_BIAS_RADIUS
        // of any coastlineTiles tile.
        let coastal = false
        for (let dy = -COAST_INLAND_BIAS_RADIUS; dy <= COAST_INLAND_BIAS_RADIUS && !coastal; dy++) {
          for (let dx = -COAST_INLAND_BIAS_RADIUS; dx <= COAST_INLAND_BIAS_RADIUS && !coastal; dx++) {
            if (sim.coastlineTiles.has(posKey(x + dx, y + dy))) coastal = true
          }
        }
        minima.push({ key, elev, coastal })
      }
    }

    // Sort by elevation (lowest first — deepest basins fill first), with a
    // fixed penalty added to coastal minima so interior basins win priority
    // among similar-depth candidates.
    minima.sort((a, b) => {
      const aKey = a.elev + (a.coastal ? COAST_INLAND_BIAS_PENALTY : 0)
      const bKey = b.elev + (b.coastal ? COAST_INLAND_BIAS_PENALTY : 0)
      return aKey - bKey
    })

    let totalWaterTiles = 0
    const MAX_POND_SIZE = 200

    for (const min of minima) {
      if (totalWaterTiles >= waterBudget) break
      if (sim.ponds.has(min.key)) continue

      // Rising water BFS with visited tracking to prevent queue explosion
      const pondTiles = new Set<string>()
      const visited = new Set<string>()
      let waterLevel = min.elev
      let frontier = [min.key]
      visited.add(min.key)

      while (pondTiles.size < MAX_POND_SIZE && totalWaterTiles + pondTiles.size < waterBudget) {
        let expanded = false
        const nextFrontier: string[] = []

        while (frontier.length > 0) {
          if (pondTiles.size >= MAX_POND_SIZE || totalWaterTiles + pondTiles.size >= waterBudget) break
          const tk = frontier.pop()
          if (!tk || pondTiles.has(tk)) continue
          if (!sim.landMask.has(tk) || sim.riverPaths.has(tk)) continue
          const tElev = sim.elevation.get(tk) ?? 50
          if (tElev > waterLevel) {
            nextFrontier.push(tk)
            continue
          }

          pondTiles.add(tk)
          expanded = true

          const [xStr, yStr] = tk.split(',')
          const x = Number(xStr)
          const y = Number(yStr)
          for (const [ddx, ddy] of cardinalDirs) {
            const nk = posKey(x + ddx, y + ddy)
            if (!visited.has(nk)) {
              visited.add(nk)
              frontier.push(nk)
            }
          }
        }

        if (!expanded && nextFrontier.length === 0) break
        waterLevel++
        if (waterLevel > 100) break
        frontier = nextFrontier
      }

      // Skip tiny ponds (< 3 tiles)
      if (pondTiles.size < 3) continue

      for (const pk of pondTiles) {
        sim.ponds.add(pk)
      }
      totalWaterTiles += pondTiles.size
    }

    // Pond adjacency soil enrichment
    for (const pk of sim.ponds) {
      const [pxStr, pyStr] = pk.split(',')
      const px = Number(pxStr)
      const py = Number(pyStr)
      for (const [ddx, ddy] of cardinalDirs) {
        const nk = posKey(px + ddx, py + ddy)
        if (sim.landMask.has(nk) && !sim.ponds.has(nk) && !sim.riverPaths.has(nk)) {
          sim.soilHealth.set(nk, (sim.soilHealth.get(nk) ?? 30) + 8)
        }
      }
    }

    // Life rebounds — all dirt gets baseline enrichment
    for (const key of sim.landMask) {
      sim.soilHealth.set(key, (sim.soilHealth.get(key) ?? 30) + 5)

      // Re-spread vegetation from coast and rivers
      if (sim.vegetationMap.get(key) === 0 || (sim.vegetationMap.get(key) ?? 0) < 20) {
        const isNearWater = sim.riverPaths.has(key) || sim.ancientSeabeds.has(key) || sim.ponds.has(key)
        if (isNearWater) {
          sim.vegetationMap.set(key, 60 + Math.floor(sim.rng() * 30))
        } else {
          sim.vegetationMap.set(key, 30 + Math.floor(sim.rng() * 30))
        }
      }
    }

    // Optional second fire (30% chance)
    if (sim.rng() < 0.3) {
      sim.secondFireOccurred = true
      const fireStart = landKeys[Math.floor(sim.rng() * landKeys.length)]
      const [fxStr, fyStr] = fireStart.split(',')
      const fx = Number(fxStr)
      const fy = Number(fyStr)
      for (let dy = -8; dy <= 8; dy++) {
        for (let dx = -8; dx <= 8; dx++) {
          const nk = posKey(fx + dx, fy + dy)
          if (sim.landMask.has(nk) && dist(fx, fy, fx + dx, fy + dy) < 8) {
            if (sim.rng() < 0.5) {
              sim.soilHealth.set(nk, (sim.soilHealth.get(nk) ?? 30) + 8)
              sim.vegetationMap.set(nk, Math.max(0, (sim.vegetationMap.get(nk) ?? 0) - 30))
            }
          }
        }
      }
    }

    applyWindwardLeewardBias(sim, 5, -3, 10, -10)
  },
  renderTile: (sim, x, y, progress, time) => {
    const key = posKey(x, y)
    const h = tileHash(x, y)

    const space = renderSpace(sim, key, h, time)
    if (space) return space

    // Glaciers melt from equator-facing side first — same animation as ice age
    // advance, reversed. Rotated cardinal frame (backlog-thinktank-v5 round 1):
    // polar distance is u = (x - SB) + (y - SB), edge noise keyed by
    // v = x - y + height - 1.
    if (sim.glacialPaths.has(key)) {
      const recedeProgress = clamp(progress, 0, 1)

      const [, yStr] = key.split(',')
      const ty = Number(yStr)
      const playableU = sim.width + sim.height - 2 * SPACE_BORDER
      const glacialDepth = Math.floor(playableU * 0.25)
      const vIdx = x - ty + sim.height - 1
      const topNoise = sim.glacialEdgeNoise.top[vIdx] ?? 0
      const bottomNoise = sim.glacialEdgeNoise.bottom[vIdx] ?? 0
      const effectiveTopDepth = glacialDepth + topNoise
      const effectiveBottomDepth = glacialDepth + bottomNoise
      const topDist = x - SPACE_BORDER + (ty - SPACE_BORDER)
      const bottomDist = playableU - 2 - topDist
      const minDist = topDist < bottomDist ? topDist : bottomDist
      const effectiveDepth = topDist < bottomDist ? effectiveTopDepth : effectiveBottomDepth
      // coverThreshold: 0 at pole edge, 1 at deepest reach (equator side)
      const coverThreshold = clamp(minDist / effectiveDepth, 0, 1)

      // Melt from equator inward: deepest tiles (highest coverThreshold) melt first
      // When recedeProgress > (1 - coverThreshold), the tile has melted
      if (recedeProgress < 1 - coverThreshold * 0.8) {
        // Still frozen
        const iceChars = ['#', '=', '.', '*']
        const iceColors = ['#B0C4DE', '#E0E8F0', '#FFFFFF', '#ADD8E6']
        const ci = (h + Math.floor(time * 0.002)) % iceChars.length
        const ii = h % iceColors.length
        return [{ char: iceChars[ci], color: iceColors[ii], dx: 0, dy: 0 }]
      }

      // Melted — life regrows in exposed dirt
      const meltTime = 1 - coverThreshold * 0.8
      const regrowProgress = clamp((progress - meltTime) / 0.3, 0, 1)
      if (regrowProgress > 0.5 && h % 3 !== 0) {
        const greenColors = ['#2E8B57', '#3CB371', '#50C878']
        const gi = h % greenColors.length
        return [{ char: '%', color: greenColors[gi], dx: 0, dy: 0 }]
      }
      return [{ char: '.', color: '#696969', dx: 0, dy: 0 }]
    }

    // Rivers reveal progressively — use Set for O(1) lookup, hash for staggered timing
    if (sim.riverPaths.has(key)) {
      // Stagger reveal: each river tile appears based on its position hash
      const revealDelay = ((h % 100) / 100) * 0.6
      if (progress > revealDelay) {
        const waterChars = ['~', '=', '-']
        const ci = (h + Math.floor(time * 0.004)) % waterChars.length
        return [{ char: waterChars[ci], color: '#6688BB', dx: 0, dy: 0 }]
      }
    }

    // Ponds appear after rivers (at 50% progress)
    if (sim.ponds.has(key) && progress > 0.5) {
      const pondDelay = 0.5 + (h % 50) / 100
      if (progress > pondDelay) {
        const waterChars = ['~', '=']
        const ci = (h + Math.floor(time * 0.003)) % waterChars.length
        return [{ char: waterChars[ci], color: '#5577AA', dx: 0, dy: 0 }]
      }
    }

    // Meltwater pools persist from ice age
    if (sim.meltPools.has(key)) {
      const waterChars = ['~', '=', '-']
      const ci = (h + Math.floor(time * 0.004)) % waterChars.length
      return [{ char: waterChars[ci], color: '#6688BB', dx: 0, dy: 0 }]
    }

    // Lowland water
    const lowWater = renderLowlandWater(sim, key, h, time)
    if (lowWater) return lowWater

    // Vegetation re-spreading
    const veg = sim.vegetationMap.get(key) ?? 0
    const greenDelay = ((h % 100) / 100) * 0.4

    if (veg > 20 && progress > greenDelay) {
      const nearRiver =
        sim.ancientSeabeds.has(key) || sim.riverPaths.has(posKey(x + 1, y)) || sim.riverPaths.has(posKey(x - 1, y))
      const greenColors = nearRiver ? ['#3CB371', '#50C878', '#66EE88'] : ['#2E8B57', '#3CB371', '#50C878']
      const gi = h % greenColors.length
      return [{ char: '%', color: greenColors[gi], dx: 0, dy: 0 }]
    }

    return renderDirt(sim, key, h)
  },
}
