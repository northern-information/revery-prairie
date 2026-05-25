import {
  SATELLITE_CRATER_DEPTH_CENTER,
  SATELLITE_CRATER_DEPTH_EDGE,
  SATELLITE_CRATER_DEPTH_RING,
  SATELLITE_HEAD_COLORS,
  SATELLITE_SOIL_DAMAGE,
  SATELLITE_TRAIL_COLORS,
  SAND_COLORS,
  WATER_SAND_BORDER_MAX,
  WATER_SAND_PASS_CHANCES,
} from '../../constants'
import { GenesisEpochId } from '../../genesisTypes'
import { posKey, tileHash as rendererTileHash } from '../../position'
import { TileType } from '../../types'

import type { GenesisEpoch, GenesisSatelliteCrash, GenesisSimState, GenesisTileRender } from '../../genesisTypes'

import {
  BUILDING_CHARS,
  CIV_COLORS,
  CRATER_COLORS,
  clamp,
  dist,
  lerp,
  renderDirt,
  renderSpace,
  renderVegetation,
  tileHash,
} from '../shared'

const SATELLITE_CRASH_RADIUS = 2 // 5x5 zone
const SATELLITE_CRASH_MIN = 3
const SATELLITE_CRASH_MAX = 9

/** Generate a satellite crash streak targeting a specific land position. */
const createSatelliteCrashStreak = (
  sim: GenesisSimState,
  impactX: number,
  impactY: number,
  index: number,
  total: number
): GenesisSatelliteCrash => {
  const directions = [
    { dx: 1, dy: 1 },
    { dx: 1, dy: -1 },
    { dx: -1, dy: 1 },
    { dx: -1, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
  ]
  const dir = directions[Math.floor(sim.rng() * directions.length)]

  let sx = impactX
  let sy = impactY
  while (sx >= -5 && sx < sim.width + 5 && sy >= -5 && sy < sim.height + 5) {
    sx -= dir.dx
    sy -= dir.dy
  }

  // Satellites are heavier than meteorites — longer trails
  const length = 8 + Math.floor(sim.rng() * 5)
  // Each crash animates over 50% of the epoch (see renderTile). Stagger
  // starts across the first 50% so the latest crash still finishes by
  // the crossfade boundary while the per-streak fall remains slow and
  // dramatic regardless of crash count.
  const startTime = total > 1 ? (index / (total - 1)) * 0.5 : 0.1

  return { startX: sx, startY: sy, dx: dir.dx, dy: dir.dy, impactX, impactY, length, startTime }
}

export const fallOfCivilizations: GenesisEpoch = {
  id: GenesisEpochId.FallOfCivilizations,
  durationMs: 2000,
  mutate: sim => {
    // Final soil enrichment from decomposition
    for (const ruin of sim.ruins) {
      for (const fp of ruin.buildingFootprints) {
        const key = posKey(fp.x, fp.y)
        sim.soilHealth.set(key, (sim.soilHealth.get(key) ?? 30) + 5)
      }
    }

    // Drought: dry up small fragments only. Substantial bodies survive so
    // the final terrain carries enough water to read as a prairie wetland
    // rather than a few token puddles.
    const MIN_WATER_BODY_SIZE = 10

    // 1. Unify all water tiles
    const allWater = new Set<string>()
    for (const key of sim.ponds) allWater.add(key)
    for (const key of sim.riverPaths) allWater.add(key)

    // 2. Find connected components via cardinal BFS
    const waterVisited = new Set<string>()
    const waterComponents: Set<string>[] = []
    const cDirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]

    for (const startKey of allWater) {
      if (waterVisited.has(startKey)) continue
      const component = new Set<string>()
      const stack = [startKey]
      waterVisited.add(startKey)

      while (stack.length > 0) {
        const current = stack.pop()
        if (current === undefined) break
        component.add(current)
        const [xStr, yStr] = current.split(',')
        const cx = Number(xStr)
        const cy = Number(yStr)
        for (const [ddx, ddy] of cDirs) {
          const nk = posKey(cx + ddx, cy + ddy)
          if (allWater.has(nk) && !waterVisited.has(nk)) {
            waterVisited.add(nk)
            stack.push(nk)
          }
        }
      }

      waterComponents.push(component)
    }

    // 3. Keep every component at or above MIN_WATER_BODY_SIZE. The previous
    // targetCount slice (1-3 of the largest) collapsed the prairie to a few
    // small puddles; now substantial bodies all survive.
    const kept = waterComponents.filter(c => c.size >= MIN_WATER_BODY_SIZE)
    const keptTiles = new Set<string>()
    for (const comp of kept) {
      for (const key of comp) keptTiles.add(key)
    }

    // 5. Remove non-kept tiles from original sets
    for (const key of [...sim.ponds]) {
      if (!keptTiles.has(key)) sim.ponds.delete(key)
    }
    for (const key of [...sim.riverPaths]) {
      if (!keptTiles.has(key)) sim.riverPaths.delete(key)
    }

    // 6. Add sand shoreline around remaining water bodies. Sand never
    // forms on a tile that touches Space — the dirt-to-Space cliff
    // stays clean (sand only ever borders water). The shoreline pass is
    // seeded only from "shoreline-eligible" water tiles: every kept pond
    // tile, every kept river mouth (last surviving tile of each polyline
    // in sim.riverPathsOrdered), and any kept river tile cardinally
    // adjacent to a pond (river-pond junction). Thin midstream river
    // tiles seed no sand.
    const shoreDirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
    ]
    const cardinals = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]
    const touchesSpace = (tx: number, ty: number): boolean => {
      for (const [dx, dy] of cardinals) {
        const nx = tx + dx
        const ny = ty + dy
        if (nx < 0 || nx >= sim.width || ny < 0 || ny >= sim.height) return true
        if (sim.grid[ny][nx].type === TileType.Space) return true
      }
      return false
    }
    const shorelineSeeds = new Set<string>()
    for (const pondKey of sim.ponds) shorelineSeeds.add(pondKey)
    for (const polyline of sim.riverPathsOrdered) {
      for (let i = polyline.length - 1; i >= 0; i--) {
        const mouthKey = posKey(polyline[i].x, polyline[i].y)
        if (sim.riverPaths.has(mouthKey)) {
          shorelineSeeds.add(mouthKey)
          break
        }
      }
    }
    for (const riverKey of sim.riverPaths) {
      const [rxStr, ryStr] = riverKey.split(',')
      const rxN = Number(rxStr)
      const ryN = Number(ryStr)
      for (const [dx, dy] of cardinals) {
        if (sim.ponds.has(posKey(rxN + dx, ryN + dy))) {
          shorelineSeeds.add(riverKey)
          break
        }
      }
    }
    let frontier = new Set<string>(shorelineSeeds)
    for (let pass = 0; pass < WATER_SAND_BORDER_MAX; pass++) {
      const chance = WATER_SAND_PASS_CHANCES[pass]
      const nextFrontier = new Set<string>()
      for (const key of frontier) {
        const [xStr, yStr] = key.split(',')
        const wx = Number(xStr)
        const wy = Number(yStr)
        for (const [ddx, ddy] of shoreDirs) {
          const nx = wx + ddx
          const ny = wy + ddy
          const nk = posKey(nx, ny)
          if (
            sim.landMask.has(nk) &&
            !keptTiles.has(nk) &&
            ny >= 0 &&
            ny < sim.height &&
            nx >= 0 &&
            nx < sim.width &&
            sim.grid[ny][nx].type === TileType.Dirt &&
            !touchesSpace(nx, ny)
          ) {
            if (chance >= 100 || tileHash(nx, ny) % 100 < chance) {
              sim.grid[ny][nx].type = TileType.Sand
              nextFrontier.add(nk)
            }
          }
        }
      }
      frontier = nextFrontier
    }

    // 7. Eliminate small dirt islands inside water bodies
    // After the sand shoreline pass, tiny dirt patches can survive
    // enclosed by water and sand. Convert patches < 4 tiles to sand.
    const ISLAND_MAX_SIZE = 4
    const islandVisited = new Set<string>()
    for (let y = 0; y < sim.height; y++) {
      for (let x = 0; x < sim.width; x++) {
        if (sim.grid[y][x].type !== TileType.Dirt) continue
        const startKey = posKey(x, y)
        // Water tiles store Dirt as their underlying grid type; skip them
        // here so the BFS does not seed an island from a river/pond tile
        // and falsely grow the component past the threshold.
        if (keptTiles.has(startKey)) continue
        if (islandVisited.has(startKey)) continue

        // Cardinal BFS to find connected dirt component
        const component: string[] = [startKey]
        const stack = [startKey]
        islandVisited.add(startKey)
        let enclosed = true

        while (stack.length > 0) {
          const current = stack.pop()
          if (current === undefined) break
          const [cxStr, cyStr] = current.split(',')
          const cx = Number(cxStr)
          const cy = Number(cyStr)
          for (const [ddx, ddy] of cDirs) {
            const nx = cx + ddx
            const ny = cy + ddy
            if (nx < 0 || nx >= sim.width || ny < 0 || ny >= sim.height) {
              enclosed = false
              continue
            }
            const nk = posKey(nx, ny)
            // Water tiles have Dirt as underlying type — check water set first
            if (keptTiles.has(nk)) continue
            const neighborType = sim.grid[ny][nx].type
            if (neighborType === TileType.Dirt) {
              if (!islandVisited.has(nk)) {
                islandVisited.add(nk)
                component.push(nk)
                stack.push(nk)
              }
            } else if (neighborType !== TileType.Sand) {
              // Neighbor is not dirt, sand, or water — connected to non-water land
              enclosed = false
            }
          }
        }

        if (enclosed && component.length < ISLAND_MAX_SIZE) {
          for (const key of component) {
            const [ixStr, iyStr] = key.split(',')
            sim.grid[Number(iyStr)][Number(ixStr)] = { type: TileType.Sand }
          }
        }
      }
    }

    // Vegetation collapses with the empires — every land tile clears.
    // Gron is absent from genesis, so there is no surviving aura.
    for (const key of sim.landMask) {
      const veg = sim.vegetationMap.get(key) ?? 0
      if (veg <= 0) continue
      sim.vegetationMap.set(key, 0)
      sim.soilHealth.set(key, (sim.soilHealth.get(key) ?? 30) + 3)
    }

    // Satellite crashes — 3-9 satellite impacts as the empires fall.
    // Each impact creates a 5x5 crater zone tracked in sim.craters and
    // reduces soil health (matching gameplay satellite-impacts contract).
    // Protected tiles (space, sand, ponds, rivers, ruin entrances, ruin
    // building footprints, cave entrance) are excluded.
    const numCrashes = SATELLITE_CRASH_MIN + Math.floor(sim.rng() * (SATELLITE_CRASH_MAX - SATELLITE_CRASH_MIN + 1))

    // Build a fast-lookup set of ruin building footprints for protection
    const ruinProtected = new Set<string>()
    for (const ruin of sim.ruins) {
      for (const fp of ruin.buildingFootprints) {
        ruinProtected.add(posKey(fp.x, fp.y))
      }
    }

    const candidateKeys: string[] = []
    for (const key of sim.landMask) {
      if (sim.ponds.has(key)) continue
      if (sim.riverPaths.has(key)) continue
      const [xStr, yStr] = key.split(',')
      const cx = Number(xStr)
      const cy = Number(yStr)
      const tileType = sim.grid[cy][cx].type
      if (tileType !== TileType.Dirt && tileType !== TileType.Flora) continue
      candidateKeys.push(key)
    }

    const placedTargets = new Set<string>()
    for (let i = 0; i < numCrashes; i++) {
      let chosen: string | null = null
      // Try a bounded number of attempts to find a non-protected target
      // that hasn't already been used as an impact center.
      for (let attempt = 0; attempt < 50; attempt++) {
        if (candidateKeys.length === 0) break
        const candidate = candidateKeys[Math.floor(sim.rng() * candidateKeys.length)]
        if (placedTargets.has(candidate)) continue
        if (ruinProtected.has(candidate)) continue
        chosen = candidate
        break
      }
      if (!chosen) continue
      placedTargets.add(chosen)

      const [cxStr, cyStr] = chosen.split(',')
      const impactX = Number(cxStr)
      const impactY = Number(cyStr)

      sim.satelliteCrashes.push(createSatelliteCrashStreak(sim, impactX, impactY, i, numCrashes))

      // Apply 5x5 crater zone
      for (let dy = -SATELLITE_CRASH_RADIUS; dy <= SATELLITE_CRASH_RADIUS; dy++) {
        for (let dx = -SATELLITE_CRASH_RADIUS; dx <= SATELLITE_CRASH_RADIUS; dx++) {
          const tx = impactX + dx
          const ty = impactY + dy
          if (tx < 0 || tx >= sim.width || ty < 0 || ty >= sim.height) continue
          const tk = posKey(tx, ty)
          const tileType = sim.grid[ty][tx].type
          // Skip protected tiles
          if (
            tileType === TileType.Space ||
            tileType === TileType.Sand ||
            tileType === TileType.CaveEntrance ||
            tileType === TileType.CaveWall ||
            tileType === TileType.CaveBreakableWall
          ) {
            continue
          }
          if (sim.ponds.has(tk) || sim.riverPaths.has(tk)) continue
          if (ruinProtected.has(tk)) continue
          if (tileType !== TileType.Dirt && tileType !== TileType.Flora) continue

          sim.craters.add(tk)
          const current = sim.soilHealth.get(tk) ?? 30
          sim.soilHealth.set(tk, Math.max(0, current - SATELLITE_SOIL_DAMAGE))

          // Deform terrain to match gameplay satellite-impact-elevation:
          // Chebyshev distance picks center / ring / edge depth.
          const cheb = Math.max(Math.abs(dx), Math.abs(dy))
          const drop =
            cheb === 0
              ? SATELLITE_CRATER_DEPTH_CENTER
              : cheb === 1
                ? SATELLITE_CRATER_DEPTH_RING
                : SATELLITE_CRATER_DEPTH_EDGE
          const currentElev = sim.elevation.get(tk) ?? 50
          sim.elevation.set(tk, clamp(currentElev - drop, 0, 100))
        }
      }
    }
  },
  renderTile: (sim, x, y, progress, time) => {
    const key = posKey(x, y)
    const h = tileHash(x, y)

    // Satellite crash streaks — render over everything (including space).
    // Animates across ~50% of the epoch from each crash.startTime so each
    // streak falls slowly enough to be dramatic regardless of how many
    // crashes are happening. After the streak completes, the crater glyph
    // paints in place for the rest of the epoch via the state.craters
    // check below.
    for (const crash of sim.satelliteCrashes) {
      const crashProgress = clamp((progress - crash.startTime) / 0.5, 0, 1)
      if (crashProgress <= 0 || crashProgress >= 1) continue

      const totalSteps = Math.abs(crash.impactX - crash.startX) + Math.abs(crash.impactY - crash.startY)
      const currentStep = Math.floor(crashProgress * totalSteps)
      const headX = crash.startX + crash.dx * currentStep
      const headY = crash.startY + crash.dy * currentStep

      for (let t = 0; t < crash.length; t++) {
        const tx = headX - crash.dx * t
        const ty = headY - crash.dy * t
        if (tx === x && ty === y) {
          if (t === 0) {
            const headChar = BUILDING_CHARS[(h + Math.floor(time * 0.02)) % BUILDING_CHARS.length]
            const headColor = SATELLITE_HEAD_COLORS[Math.floor(time * 0.005) % SATELLITE_HEAD_COLORS.length]
            return [{ char: headChar, color: headColor, dx: 0, dy: 0 }]
          }
          const trailIdx = Math.min(t - 1, SATELLITE_TRAIL_COLORS.length - 1)
          const trailChar = BUILDING_CHARS[(h + t) % BUILDING_CHARS.length]
          return [{ char: trailChar, color: SATELLITE_TRAIL_COLORS[trailIdx], dx: 0, dy: 0 }]
        }
      }

      // Impact flash for 5x5 zone in the last 10% of the streak's progress
      if (crashProgress > 0.9) {
        const dx = x - crash.impactX
        const dy = y - crash.impactY
        if (Math.abs(dx) <= SATELLITE_CRASH_RADIUS && Math.abs(dy) <= SATELLITE_CRASH_RADIUS) {
          const d = Math.abs(dx) + Math.abs(dy)
          const flashChars = ['*', '+', '·']
          const flashColors = ['#FFFFFF', '#FFD700', '#FF4500']
          return [
            {
              char: flashChars[d % flashChars.length],
              color: flashColors[d % flashColors.length],
              dx: 0,
              dy: 0,
            },
          ]
        }
      }
    }

    // Persistent crater glyphs from completed crashes — paint over dirt
    // until the cross-fade hands them off to presentDay. Glyph keyed by
    // rendererTileHash so the char does NOT snap at the cross-fade
    // midpoint when presentDay (which also uses rendererTileHash) takes
    // over the same crater tile.
    if (sim.craters.has(key)) {
      const craterH = rendererTileHash(x, y)
      const buildingChar = BUILDING_CHARS[craterH % BUILDING_CHARS.length]
      const craterColor = CRATER_COLORS[craterH % CRATER_COLORS.length]
      return [{ char: buildingChar, color: craterColor, dx: 0, dy: 0 }]
    }

    const space = renderSpace(sim, key, h, time)
    if (space) return space

    // Gron is intentionally absent from genesis.

    const tileInfo = sim.tileData.get(key)
    const aqueductChar = sim.aqueductNetwork.get(key)

    // Decay timing — randomized per tile
    const decayDelay = ((h % 100) / 100) * 0.3

    if (tileInfo || aqueductChar) {
      const decayProgress = clamp((progress - decayDelay) / 0.7, 0, 1)

      if (decayProgress < 1) {
        const layers: GenesisTileRender[] = []

        if (tileInfo) {
          // Buildings crumble: █ → ▓ → ▒ → ░ → . → gone
          const crumbleStages = ['█', '▓', '▒', '░', '.', '·']
          const stageIdx = Math.min(Math.floor(decayProgress * crumbleStages.length), crumbleStages.length - 1)

          // Color fades from gray to brown to dirt
          const r = Math.floor(lerp(0x88, 0x8b, decayProgress))
          const g = Math.floor(lerp(0x88, 0x73, decayProgress))
          const b2 = Math.floor(lerp(0x88, 0x55, decayProgress))
          const color = `rgb(${String(r)},${String(g)},${String(b2)})`

          // Fewer layers as decay progresses
          if (decayProgress < 0.3) {
            // Still 3 layers
            layers.push({ char: tileInfo.char, color, dx: 0, dy: 0 })
            layers.push({
              char: BUILDING_CHARS[(h + 3) % BUILDING_CHARS.length],
              color: CIV_COLORS[(h + 2) % CIV_COLORS.length],
              dx: 1,
              dy: 1,
            })
            layers.push({ char: '·', color: CIV_COLORS[(h + 4) % CIV_COLORS.length], dx: -1, dy: 0 })
          } else if (decayProgress < 0.6) {
            // 2 layers
            layers.push({ char: crumbleStages[stageIdx], color, dx: 0, dy: 0 })
            layers.push({ char: '.', color: CIV_COLORS[(h + 1) % CIV_COLORS.length], dx: 1, dy: 0 })
          } else {
            // 1 layer, fading
            layers.push({ char: crumbleStages[stageIdx], color, dx: 0, dy: 0 })
          }

          return layers
        }

        if (aqueductChar) {
          // Aqueducts are last to disappear
          const aqDecay = clamp((decayProgress - 0.2) / 0.8, 0, 1)

          if (aqDecay < 0.5) {
            layers.push({
              char: aqueductChar,
              color: CIV_COLORS[h % CIV_COLORS.length],
              dx: 0,
              dy: 0,
            })
            return layers
          }

          if (aqDecay < 0.8) {
            // Breaking apart
            const breakChars = ['+', '.', '·']
            layers.push({
              char: breakChars[Math.floor(aqDecay * 3) % breakChars.length],
              color: `rgb(${String(Math.floor(lerp(0x88, 0x8b, aqDecay)))},${String(Math.floor(lerp(0x88, 0x73, aqDecay)))},${String(Math.floor(lerp(0x88, 0x55, aqDecay)))})`,
              dx: 0,
              dy: 0,
            })
            return layers
          }

          // Almost gone
          return [{ char: '·', color: '#5A4A3A', dx: 0, dy: 0 }]
        }
      }
    }

    // Rivers — surviving fragments
    if (sim.riverPaths.has(key)) {
      const ci = (h + Math.floor(time * 0.004)) % 3
      return [{ char: ['~', '=', '-'][ci], color: '#6688BB', dx: 0, dy: 0 }]
    }

    // Ponds — surviving deep ponds
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

    // Sand placed by this epoch's water-shoreline pass — render
    // immediately with the same palette as presentDay / the gameplay
    // renderer so there is no dirt-then-snap discontinuity at the
    // crossfade.
    const tileType = sim.grid[y]?.[x]?.type
    if (tileType === TileType.Sand) {
      return [{ char: ':', color: SAND_COLORS[h % SAND_COLORS.length], dx: 0, dy: 0 }]
    }

    // No renderLowlandWater here — fallOfCivilizations.mutate consolidates
    // water into ponds/riverPaths, so only tracked water should render.
    // Elevation-based cosmetic water would create a discontinuity at the
    // genesis-to-game transition (game renderer only shows ponds/rivers).

    const veg = sim.vegetationMap.get(key) ?? 0

    // Drought wilt — without Gron's surviving rain aura, vegetation
    // wilts from the prairie edges inward as the empires fall. Wilt
    // start radiates from the map center outward via a scattered
    // distance term so the dieback looks organic rather than uniform.
    const centerX = sim.width / 2
    const centerY = sim.height / 2
    const dToCenter = dist(x, y, centerX, centerY)

    if (veg <= 0) {
      const maxDist = Math.max(sim.width, sim.height) * 0.5
      const scatter = (h % 30) - 15 + (((h >>> 8) % 20) - 10)
      const effectiveDist = dToCenter + scatter
      // Wilt starts after buildings begin decaying (0.4), radiates inward
      const wiltDelay = 0.4 + clamp(1 - effectiveDist / maxDist, 0, 0.5)

      if (progress > wiltDelay) {
        const wiltProgress = clamp((progress - wiltDelay) / 0.3, 0, 1)
        if (wiltProgress < 0.4) {
          return [{ char: '%', color: '#8B6914', dx: 0, dy: 0 }]
        }
        if (wiltProgress < 0.7) {
          return [{ char: '%', color: '#6B4914', dx: 0, dy: 0 }]
        }
        return renderDirt(sim, key, h)
      }

      // Before wilt reaches this tile — show as green (seamless from previous epoch)
      const greenColors = ['#2E8B57', '#3CB371', '#50C878']
      const gi = h % greenColors.length
      return [{ char: '%', color: greenColors[gi], dx: 0, dy: 0 }]
    }

    // Any lingering vegetation (drought mutation runs first, so this
    // path is reached only for tiles whose veg was reset between
    // mutate() and renderTile()).
    const vegRender = renderVegetation(sim, x, y, h)
    if (vegRender) return vegRender

    return renderDirt(sim, key, h)
  },
}
