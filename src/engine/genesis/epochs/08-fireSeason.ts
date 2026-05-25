import { generateBoltPath } from '../../boltPath'
import {
  LIGHTNING_BOLT_COLOR_BRIGHT,
  LIGHTNING_BOLT_COLOR_DIM,
  LIGHTNING_BOLT_COLOR_MID,
  LIGHTNING_BOLT_MAX_LENGTH,
  LIGHTNING_BOLT_MIN_LENGTH,
} from '../../constants'
import { GenesisEpochId } from '../../genesisTypes'
import { posKey } from '../../position'
import {
  BRIGHT_GREEN_COLORS,
  clamp,
  DIRT_COLORS,
  GREEN_COLORS,
  renderLowlandWater,
  renderSpace,
  renderVegetation,
  tileHash,
} from '../shared'

import type { GenesisEpoch, GenesisMeteorStreak, GenesisSimState } from '../../genesisTypes'

/** Generate a meteorite streak targeting a specific land position. */
const createMeteorStreak = (
  sim: GenesisSimState,
  impactX: number,
  impactY: number,
  index: number
): GenesisMeteorStreak => {
  // Pick a radiant direction
  const directions = [
    { dx: 1, dy: 1 },
    { dx: 1, dy: -1 },
    { dx: -1, dy: 1 },
    { dx: -1, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ]
  const dir = directions[Math.floor(sim.rng() * directions.length)]

  // Trace backward from impact to find off-map start
  let sx = impactX
  let sy = impactY
  while (sx >= -5 && sx < sim.width + 5 && sy >= -5 && sy < sim.height + 5) {
    sx -= dir.dx
    sy -= dir.dy
  }

  const length = 3 + Math.floor(sim.rng() * 4)
  // Stagger start times across the first 30% of the epoch
  const startTime = (index / 8) * 0.3

  return { startX: sx, startY: sy, dx: dir.dx, dy: dir.dy, impactX, impactY, length, startTime }
}

export const fireSeason: GenesisEpoch = {
  id: GenesisEpochId.FireSeason,
  durationMs: 2000,
  mutate: sim => {
    const landKeys = [...sim.landMask]

    // Generate 5-8 meteorite impact targets on land
    const numMeteors = 5 + Math.floor(sim.rng() * 4)
    const impactKeys: string[] = []

    for (let i = 0; i < numMeteors; i++) {
      // Pick a vegetated land tile for maximum drama
      for (let attempt = 0; attempt < 50; attempt++) {
        const candidate = landKeys[Math.floor(sim.rng() * landKeys.length)]
        const veg = sim.vegetationMap.get(candidate) ?? 0
        if (veg > 20) {
          impactKeys.push(candidate)
          break
        }
        // Last resort: any land tile
        if (attempt === 49) {
          impactKeys.push(candidate)
        }
      }
    }

    // Fallback: ensure at least 2 ignition points
    while (impactKeys.length < 2) {
      impactKeys.push(landKeys[Math.floor(sim.rng() * landKeys.length)])
    }

    // Create meteorite streak data for rendering
    for (let i = 0; i < impactKeys.length; i++) {
      const [xStr, yStr] = impactKeys[i].split(',')
      sim.meteorites.push(createMeteorStreak(sim, Number(xStr), Number(yStr), i))
    }

    // Generate 2-4 lightning bolts alongside meteorites
    const numBolts = 2 + Math.floor(sim.rng() * 3)
    for (let i = 0; i < numBolts; i++) {
      // Pick a vegetated land tile for the strike
      let boltKey: string | null = null
      for (let attempt = 0; attempt < 50; attempt++) {
        const candidate = landKeys[Math.floor(sim.rng() * landKeys.length)]
        const veg = sim.vegetationMap.get(candidate) ?? 0
        if (veg > 20 || attempt === 49) {
          boltKey = candidate
          break
        }
      }
      if (!boltKey) continue

      // Add to fire BFS ignition queue
      impactKeys.push(boltKey)

      const [bxStr, byStr] = boltKey.split(',')
      const bx = Number(bxStr)
      const by = Number(byStr)
      const length =
        LIGHTNING_BOLT_MIN_LENGTH + Math.floor(sim.rng() * (LIGHTNING_BOLT_MAX_LENGTH - LIGHTNING_BOLT_MIN_LENGTH + 1))
      const { path, branch } = generateBoltPath(bx, by, length, sim.rng)

      // Stagger start times to interleave with meteorites
      const startTime = 0.05 + (i / numBolts) * 0.25

      sim.lightningBolts.push({ impactX: bx, impactY: by, path, branch, startTime })
    }

    // BFS fire spread from each impact point
    const burned = new Set<string>()
    const queue = [...impactKeys]
    const maxBurn = Math.floor(landKeys.length * 0.6)

    while (queue.length > 0 && burned.size < maxBurn) {
      const key = queue.shift()
      if (!key) continue
      if (burned.has(key)) continue
      const veg = sim.vegetationMap.get(key) ?? 0
      if (veg < 10) continue

      burned.add(key)

      const [xStr, yStr] = key.split(',')
      const bx = Number(xStr)
      const by = Number(yStr)

      // Spread to neighbors — higher probability than before (veg/90 vs veg/120)
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]
      for (const [ddx, ddy] of dirs) {
        const nk = posKey(bx + ddx, by + ddy)
        if (!burned.has(nk) && sim.landMask.has(nk)) {
          const nVeg = sim.vegetationMap.get(nk) ?? 0
          if (sim.rng() < nVeg / 90) {
            queue.push(nk)
          }
        }
      }
    }

    // Apply burn effects
    for (const key of burned) {
      sim.burnScars.add(key)
      sim.vegetationMap.set(key, 0)
      sim.soilHealth.set(key, (sim.soilHealth.get(key) ?? 30) + 10)
    }

    // Edge effect for survivors
    for (const key of sim.landMask) {
      if (!burned.has(key)) {
        const [xStr, yStr] = key.split(',')
        const sx = Number(xStr)
        const sy = Number(yStr)
        const dirs = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]
        for (const [ddx, ddy] of dirs) {
          if (burned.has(posKey(sx + ddx, sy + ddy))) {
            sim.soilHealth.set(key, (sim.soilHealth.get(key) ?? 30) + 3)
            break
          }
        }
      }
    }
  },
  renderTile: (sim, x, y, progress, time) => {
    const key = posKey(x, y)
    const h = tileHash(x, y)

    // Meteorite streaks render over everything (including space)
    for (const meteor of sim.meteorites) {
      // How far along is this meteor? Each animates over ~15% of epoch duration
      const meteorProgress = clamp((progress - meteor.startTime) / 0.15, 0, 1)
      if (meteorProgress <= 0 || meteorProgress >= 1) continue

      // Current head position interpolated from start to impact
      const totalSteps = Math.abs(meteor.impactX - meteor.startX) + Math.abs(meteor.impactY - meteor.startY)
      const currentStep = Math.floor(meteorProgress * totalSteps)
      const headX = meteor.startX + meteor.dx * currentStep
      const headY = meteor.startY + meteor.dy * currentStep

      // Check if this tile is the head or trail
      for (let t = 0; t < meteor.length; t++) {
        const tx = headX - meteor.dx * t
        const ty = headY - meteor.dy * t
        if (tx === x && ty === y) {
          if (t === 0) {
            return [{ char: '*', color: '#FFFFFF', dx: 0, dy: 0 }]
          }
          const trailChars = ['.', '·', ',']
          const trailColors = ['#FFD700', '#FF6347', '#FF4500']
          return [{ char: trailChars[t % trailChars.length], color: trailColors[t % trailColors.length], dx: 0, dy: 0 }]
        }
      }

      // Impact explosion flash
      if (meteorProgress > 0.9) {
        const impactDist = Math.abs(x - meteor.impactX) + Math.abs(y - meteor.impactY)
        if (impactDist <= 2) {
          const flashChars = ['*', '+', '·']
          const flashColors = ['#FFFFFF', '#FFD700', '#FF4500']
          return [
            {
              char: flashChars[impactDist % flashChars.length],
              color: flashColors[impactDist % flashColors.length],
              dx: 0,
              dy: 0,
            },
          ]
        }
      }
    }

    // Lightning bolt rendering (vertical bolts, faster than meteorites)
    for (const bolt of sim.lightningBolts) {
      const boltProgress = clamp((progress - bolt.startTime) / 0.1, 0, 1)
      if (boltProgress <= 0 || boltProgress >= 1) continue

      // Check if this tile is on the bolt path
      for (let i = 0; i < bolt.path.length; i++) {
        if (bolt.path[i].x === x && bolt.path[i].y === y) {
          const bdx = i > 0 ? bolt.path[i].x - bolt.path[i - 1].x : 0
          const boltChar = bdx === 0 ? '|' : bdx > 0 ? '\\' : '/'
          if (boltProgress < 0.3) {
            return [{ char: boltChar, color: LIGHTNING_BOLT_COLOR_BRIGHT, dx: 0, dy: 0 }]
          } else if (boltProgress < 0.7) {
            return [{ char: boltChar, color: LIGHTNING_BOLT_COLOR_MID, dx: 0, dy: 0 }]
          } else {
            return [{ char: boltChar, color: LIGHTNING_BOLT_COLOR_DIM, dx: 0, dy: 0 }]
          }
        }
      }

      // Check branch
      if (bolt.branch) {
        for (const bp of bolt.branch) {
          if (bp.x === x && bp.y === y) {
            const bcolor =
              boltProgress < 0.3
                ? LIGHTNING_BOLT_COLOR_BRIGHT
                : boltProgress < 0.7
                  ? LIGHTNING_BOLT_COLOR_MID
                  : LIGHTNING_BOLT_COLOR_DIM
            return [{ char: '/', color: bcolor, dx: 0, dy: 0 }]
          }
        }
      }

      // Impact flash
      if (boltProgress > 0.9) {
        const boltDist = Math.abs(x - bolt.impactX) + Math.abs(y - bolt.impactY)
        if (boltDist <= 2) {
          const bFlashChars = ['*', '+', '·']
          const bFlashColors = ['#FFFFFF', '#E0E0FF', '#8888CC']
          return [
            {
              char: bFlashChars[boltDist % bFlashChars.length],
              color: bFlashColors[boltDist % bFlashColors.length],
              dx: 0,
              dy: 0,
            },
          ]
        }
      }
    }

    const space = renderSpace(sim, key, h, time)
    if (space) return space

    // Lowland water persists
    const water = renderLowlandWater(sim, key, h, time)
    if (water) return water

    // Fire visuals start after meteor shower phase (30% into epoch)
    const isBurned = sim.burnScars.has(key)
    const burnDelay = 0.3 + ((h % 100) / 100) * 0.3

    if (isBurned) {
      if (progress > burnDelay) {
        const burnProgress = clamp((progress - burnDelay) / 0.4, 0, 1)

        if (burnProgress < 0.5) {
          // Active fire
          const fireChars = ['^', '~', '*']
          const fireColors = ['#FF4500', '#FF6347', '#FFD700']
          const ci = (h + Math.floor(time * 0.005)) % fireChars.length
          const fi = h % fireColors.length
          return [{ char: fireChars[ci], color: fireColors[fi], dx: 0, dy: 0 }]
        }

        // Aftermath — charred
        return [{ char: '.', color: '#3D2B1F', dx: 0, dy: 0 }]
      }

      // Before fire reaches this tile — show as it looked before (river-aware palette)
      const nearRiver = sim.riverPaths.has(posKey(x + 1, y)) || sim.riverPaths.has(posKey(x - 1, y))
      const preFireColors = nearRiver ? BRIGHT_GREEN_COLORS : GREEN_COLORS
      return [{ char: '%', color: preFireColors[h % preFireColors.length], dx: 0, dy: 0 }]
    }

    // Unburned — show vegetation
    const vegRender = renderVegetation(sim, x, y, h)
    if (vegRender) return vegRender

    return [{ char: '.', color: DIRT_COLORS[h % DIRT_COLORS.length], dx: 0, dy: 0 }]
  },
}
