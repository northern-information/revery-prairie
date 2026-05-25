import { SPACE_BORDER } from '../../constants'
import { GenesisEpochId, RuinGenerationMode, RuinRole } from '../../genesisTypes'
import { posKey } from '../../position'

import type { CivilizationRuin, GenesisEpoch, GenesisTileRender } from '../../genesisTypes'

import {
  BOX_CROSS,
  BOX_DOUBLE_H,
  BOX_DOUBLE_V,
  BOX_HORIZONTAL,
  BOX_T_DOWN,
  BOX_T_LEFT,
  BOX_T_RIGHT,
  BOX_T_UP,
  BOX_VERTICAL,
  BUILDING_CHARS,
  CIV_COLORS,
  clamp,
  dist,
  generateRuinName,
  renderDirt,
  renderSpace,
  renderVegetation,
  tileHash,
} from '../shared'

export const riseOfCivilizations: GenesisEpoch = {
  id: GenesisEpochId.RiseOfCivilizations,
  durationMs: 2000,
  mutate: sim => {
    // Starter mode (tutorial): exactly 3 ruins, role-tagged in fixed order
    // (clover, bee, coyote). Complex mode (post-deep-time, future spec)
    // currently delegates to starter; replace this branch when the complex
    // generator lands.
    const isStarter =
      sim.ruinGenerationMode === RuinGenerationMode.Starter || sim.ruinGenerationMode === RuinGenerationMode.Complex
    const numRuins = isStarter ? 5 : 8 + Math.floor(sim.rng() * 5)
    const STARTER_ROLES: RuinRole[] = [
      RuinRole.Clover,
      RuinRole.Bee,
      RuinRole.Coyote,
      RuinRole.Wildflower,
      RuinRole.TallGrass,
    ]
    const candidates: { key: string; score: number }[] = []

    for (const key of sim.landMask) {
      const soil = sim.soilHealth.get(key) ?? 30
      const nearRiver = sim.riverPaths.has(key) ? 20 : 0
      const nearCoast = sim.ancientSeabeds.has(key) ? 15 : 0
      candidates.push({ key, score: soil + nearRiver + nearCoast })
    }

    // Sort by score and pick from top candidates with some randomness
    candidates.sort((a, b) => b.score - a.score)
    const topCandidates = candidates.slice(0, Math.floor(candidates.length * 0.25))

    const usedKeys = new Set<string>()
    let failedAttempts = 0

    for (let i = 0; i < numRuins && topCandidates.length > 0 && failedAttempts < 50; i++) {
      const idx = Math.floor(sim.rng() * Math.min(80, topCandidates.length))
      const pick = topCandidates[idx]
      if (!pick) continue

      const [xStr, yStr] = pick.key.split(',')
      const cx = Number(xStr)
      const cy = Number(yStr)

      // Minimum distance between ruins — reduced to fit more on the map
      let tooClose = false
      for (const uKey of usedKeys) {
        const [uxStr, uyStr] = uKey.split(',')
        if (dist(cx, cy, Number(uxStr), Number(uyStr)) < 10) {
          tooClose = true
          break
        }
      }
      if (tooClose) {
        i--
        failedAttempts++
        topCandidates.splice(idx, 1)
        continue
      }

      // Reject candidates whose 3x3 footprint (entrance + 8 apron neighbors)
      // intersects water or Space. The overworld renderer draws ponds/rivers
      // before tile glyphs, so a footprint inside a water set renders as
      // water and visually truncates the ruin to one tile or nothing.
      // fallOfCivilizations may later flood a previously-clean footprint;
      // a second revalidation pass runs after that epoch.
      let footprintBlocked = false
      for (let dy = -1; dy <= 1 && !footprintBlocked; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const fk = posKey(cx + dx, cy + dy)
          if (sim.ponds.has(fk) || sim.riverPaths.has(fk) || !sim.landMask.has(fk)) {
            footprintBlocked = true
            break
          }
        }
      }
      if (footprintBlocked) {
        i--
        failedAttempts++
        topCandidates.splice(idx, 1)
        continue
      }

      failedAttempts = 0
      usedKeys.add(pick.key)
      const radius = 3 + Math.floor(sim.rng() * 3)
      const buildingFootprints: { x: number; y: number }[] = []

      // Generate building footprints within radius
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dist(0, 0, dx, dy) > radius) continue
          const nk = posKey(cx + dx, cy + dy)
          if (sim.landMask.has(nk)) {
            buildingFootprints.push({ x: cx + dx, y: cy + dy })
            sim.soilHealth.set(nk, (sim.soilHealth.get(nk) ?? 30) + 15)

            // Multi-layered building chars
            const bh = tileHash(cx + dx, cy + dy)
            const buildingChar = BUILDING_CHARS[bh % BUILDING_CHARS.length]
            sim.tileData.set(nk, {
              char: buildingChar,
              baseColor: CIV_COLORS[bh % CIV_COLORS.length],
              intensity: 1,
            })
          }
        }
      }

      const ruin: CivilizationRuin = {
        position: { x: cx, y: cy },
        name: generateRuinName(sim.rng),
        radius,
        age: Math.floor(sim.rng() * 5000) + 1000,
        aqueductPaths: [],
        buildingFootprints,
      }
      if (isStarter && sim.ruins.length < STARTER_ROLES.length) {
        ruin.role = STARTER_ROLES[sim.ruins.length]
      }

      sim.ruins.push(ruin)
    }

    // Generate aqueduct network connecting ruin sites (increased distance)
    for (let i = 0; i < sim.ruins.length; i++) {
      for (let j = i + 1; j < sim.ruins.length; j++) {
        const r1 = sim.ruins[i]
        const r2 = sim.ruins[j]
        const d = dist(r1.position.x, r1.position.y, r2.position.x, r2.position.y)
        if (d > 90) continue

        const path: { x: number; y: number }[] = []
        let ax = r1.position.x
        let ay = r1.position.y

        // L-shaped path with random jitter (max iterations to prevent infinite loops)
        let pathSteps = 0
        while ((ax !== r2.position.x || ay !== r2.position.y) && pathSteps < 500) {
          pathSteps++
          const key = posKey(ax, ay)
          path.push({ x: ax, y: ay })

          const existing = sim.aqueductNetwork.get(key)

          if (existing) {
            sim.aqueductNetwork.set(key, BOX_CROSS)
            if (!sim.aqueductJunctions.some(j2 => j2.x === ax && j2.y === ay)) {
              sim.aqueductJunctions.push({ x: ax, y: ay })
            }
          } else if (ax !== r2.position.x && ay !== r2.position.y) {
            if (sim.rng() < 0.5 && ax !== r2.position.x) {
              sim.aqueductNetwork.set(key, BOX_HORIZONTAL)
            } else {
              sim.aqueductNetwork.set(key, BOX_VERTICAL)
            }
          } else if (ax !== r2.position.x) {
            sim.aqueductNetwork.set(key, sim.rng() < 0.15 ? BOX_DOUBLE_H : BOX_HORIZONTAL)
          } else {
            sim.aqueductNetwork.set(key, sim.rng() < 0.15 ? BOX_DOUBLE_V : BOX_VERTICAL)
          }

          if (sim.rng() < 0.7) {
            if (Math.abs(r2.position.x - ax) > Math.abs(r2.position.y - ay)) {
              ax += r2.position.x > ax ? 1 : -1
            } else {
              ay += r2.position.y > ay ? 1 : -1
            }
          } else {
            if (ax !== r2.position.x) ax += r2.position.x > ax ? 1 : -1
            if (ay !== r2.position.y) ay += r2.position.y > ay ? 1 : -1
          }

          ax = clamp(ax, SPACE_BORDER, sim.width - SPACE_BORDER - 1)
          ay = clamp(ay, SPACE_BORDER, sim.height - SPACE_BORDER - 1)
        }

        // More dead-end branches per connection (2-5)
        const numBranches = 2 + Math.floor(sim.rng() * 4)
        for (let b = 0; b < numBranches; b++) {
          if (path.length === 0) continue
          const branchStart = path[Math.floor(sim.rng() * path.length)]
          let bx = branchStart.x
          let by = branchStart.y
          const branchLen = 3 + Math.floor(sim.rng() * 8)
          const branchDir = Math.floor(sim.rng() * 4)

          for (let s = 0; s < branchLen; s++) {
            const bk = posKey(bx, by)
            if (sim.landMask.has(bk) && !sim.aqueductNetwork.has(bk)) {
              const branchChars = [BOX_HORIZONTAL, BOX_VERTICAL, BOX_T_DOWN, BOX_T_UP, BOX_T_RIGHT, BOX_T_LEFT]
              sim.aqueductNetwork.set(bk, branchChars[Math.floor(sim.rng() * branchChars.length)])
            }
            switch (branchDir) {
              case 0:
                bx++
                break
              case 1:
                bx--
                break
              case 2:
                by++
                break
              default:
                by--
                break
            }
            bx = clamp(bx, SPACE_BORDER, sim.width - SPACE_BORDER - 1)
            by = clamp(by, SPACE_BORDER, sim.height - SPACE_BORDER - 1)
          }
        }

        r1.aqueductPaths.push(path)
        r2.aqueductPaths.push([...path].reverse())
      }
    }

    // Standalone inland aqueduct clusters — chaotic networks unconnected to ruins
    const landKeys = [...sim.landMask]
    const numClusters = 4 + Math.floor(sim.rng() * 4)
    for (let c = 0; c < numClusters; c++) {
      // Pick a random inland origin
      const originKey = landKeys[Math.floor(sim.rng() * landKeys.length)]
      if (sim.coastlineTiles.has(originKey)) continue
      const [oxStr, oyStr] = originKey.split(',')
      let cx = Number(oxStr)
      let cy = Number(oyStr)

      // Random walk to carve a chaotic pipe network
      const clusterLen = 10 + Math.floor(sim.rng() * 20)
      for (let s = 0; s < clusterLen; s++) {
        const ck = posKey(cx, cy)
        if (sim.landMask.has(ck) && !sim.aqueductNetwork.has(ck)) {
          const allChars = [
            BOX_HORIZONTAL,
            BOX_VERTICAL,
            BOX_T_DOWN,
            BOX_T_UP,
            BOX_T_RIGHT,
            BOX_T_LEFT,
            BOX_CROSS,
            BOX_DOUBLE_H,
            BOX_DOUBLE_V,
          ]
          sim.aqueductNetwork.set(ck, allChars[Math.floor(sim.rng() * allChars.length)])
        }

        // Random walk with occasional direction changes
        const dir = Math.floor(sim.rng() * 4)
        switch (dir) {
          case 0:
            cx++
            break
          case 1:
            cx--
            break
          case 2:
            cy++
            break
          default:
            cy--
            break
        }
        cx = clamp(cx, SPACE_BORDER, sim.width - SPACE_BORDER - 1)
        cy = clamp(cy, SPACE_BORDER, sim.height - SPACE_BORDER - 1)

        // Branch off occasionally
        if (sim.rng() < 0.3) {
          let bx = cx
          let by = cy
          const bLen = 2 + Math.floor(sim.rng() * 5)
          const bDir = Math.floor(sim.rng() * 4)
          for (let bs = 0; bs < bLen; bs++) {
            const bk = posKey(bx, by)
            if (sim.landMask.has(bk) && !sim.aqueductNetwork.has(bk)) {
              const branchChars = [BOX_HORIZONTAL, BOX_VERTICAL, BOX_T_DOWN, BOX_T_UP]
              sim.aqueductNetwork.set(bk, branchChars[Math.floor(sim.rng() * branchChars.length)])
            }
            switch (bDir) {
              case 0:
                bx++
                break
              case 1:
                bx--
                break
              case 2:
                by++
                break
              default:
                by--
                break
            }
            bx = clamp(bx, SPACE_BORDER, sim.width - SPACE_BORDER - 1)
            by = clamp(by, SPACE_BORDER, sim.height - SPACE_BORDER - 1)
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

    // Gron is intentionally absent from genesis — he arrives with the
    // player in gameplay, after the title card lifts.

    // Check if this tile is part of a civilization
    const tileInfo = sim.tileData.get(key)
    const aqueductChar = sim.aqueductNetwork.get(key)

    const growDelay = ((h % 100) / 100) * 0.5

    if (progress > growDelay) {
      const growProgress = clamp((progress - growDelay) / 0.5, 0, 1)
      const layers: GenesisTileRender[] = []

      // Building layer
      if (tileInfo && growProgress > 0.2) {
        layers.push({
          char: tileInfo.char,
          color: tileInfo.baseColor,
          dx: 0,
          dy: 0,
        })

        // Second layer — offset glyph for messy look
        if (growProgress > 0.5) {
          const secondChar = BUILDING_CHARS[(h + 3) % BUILDING_CHARS.length]
          layers.push({
            char: secondChar,
            color: CIV_COLORS[(h + 2) % CIV_COLORS.length],
            dx: 1,
            dy: 1,
          })
        }

        // Third layer at full progress
        if (growProgress > 0.8) {
          layers.push({
            char: '·',
            color: CIV_COLORS[(h + 4) % CIV_COLORS.length],
            dx: -1,
            dy: 0,
          })
        }

        return layers
      }

      // Aqueduct layer
      if (aqueductChar && growProgress > 0.3) {
        layers.push({
          char: aqueductChar,
          color: CIV_COLORS[h % CIV_COLORS.length],
          dx: 0,
          dy: 0,
        })

        if (growProgress > 0.6) {
          // Overlay with a second box char
          const overlayChars = [BOX_HORIZONTAL, BOX_VERTICAL, '·', '.']
          layers.push({
            char: overlayChars[h % overlayChars.length],
            color: CIV_COLORS[(h + 1) % CIV_COLORS.length],
            dx: h % 2 === 0 ? 1 : -1,
            dy: h % 3 === 0 ? 1 : 0,
          })
        }

        return layers
      }
    }

    // Rivers
    if (sim.riverPaths.has(key)) {
      const ci = (h + Math.floor(time * 0.004)) % 3
      return [{ char: ['~', '=', '-'][ci], color: '#6688BB', dx: 0, dy: 0 }]
    }

    // Ponds
    if (sim.ponds.has(key)) {
      const waterChars = ['~', '=']
      const ci = (h + Math.floor(time * 0.003)) % waterChars.length
      return [{ char: waterChars[ci], color: '#5577AA', dx: 0, dy: 0 }]
    }

    // Meltwater pools
    if (sim.meltPools.has(key)) {
      const waterChars = ['~', '=', '-']
      const ci = (h + Math.floor(time * 0.004)) % waterChars.length
      return [{ char: waterChars[ci], color: '#6688BB', dx: 0, dy: 0 }]
    }

    // No renderLowlandWater — by riseOfCivilizations, water is tracked in
    // ponds/riverPaths (populated by warmPeriod). Elevation-based cosmetic
    // water would show tiles not in those sets, causing a discontinuity when
    // later epochs and the game renderer only show tracked water.

    // Vegetation
    const vegRender = renderVegetation(sim, x, y, h)
    if (vegRender) return vegRender

    return renderDirt(sim, key, h)
  },
}
