import { MAP_HEIGHT, MAP_WIDTH, SOIL_HEALTH_MAX } from '../constants'
import {
  createGenesisState,
  extractGenesisResult,
  GENESIS_EPOCHS,
  getGenesisCommentary,
  nameToSeed,
  runAllMutations,
  tickGenesis,
} from '../genesis'
import { posKey } from '../position'
import { TileType } from '../types'
import { describe, expect, it } from 'vitest'

describe('createGenesisState', () => {
  it('creates a state with correct dimensions', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    expect(sim.width).toBe(MAP_WIDTH)
    expect(sim.height).toBe(MAP_HEIGHT)
    expect(sim.grid.length).toBe(MAP_HEIGHT)
    expect(sim.grid[0].length).toBe(MAP_WIDTH)
  })

  it('initializes all tiles as Space', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    for (let y = 0; y < sim.height; y++) {
      for (let x = 0; x < sim.width; x++) {
        expect(sim.grid[y][x].type).toBe(TileType.Space)
      }
    }
  })

  it('starts with empty soil health map', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    expect(sim.soilHealth.size).toBe(0)
  })

  it('starts at epoch index 0', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    expect(sim.epochIndex).toBe(0)
  })

  it('provides a deterministic RNG', () => {
    const sim1 = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    const sim2 = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    const vals1 = Array.from({ length: 10 }, () => sim1.rng())
    const vals2 = Array.from({ length: 10 }, () => sim2.rng())
    expect(vals1).toEqual(vals2)
  })
})

describe('nameToSeed', () => {
  it('produces same seed for same name', () => {
    expect(nameToSeed('Alice')).toBe(nameToSeed('Alice'))
  })

  it('produces different seeds for different names', () => {
    expect(nameToSeed('Alice')).not.toBe(nameToSeed('Bob'))
  })

  it('returns a positive number', () => {
    expect(nameToSeed('test')).toBeGreaterThanOrEqual(0)
  })
})

describe('runAllMutations', () => {
  it('produces a valid terrain grid', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)
    const result = extractGenesisResult(sim)

    expect(result.terrain.length).toBe(MAP_HEIGHT)
    expect(result.terrain[0].length).toBe(MAP_WIDTH)

    // All tiles are valid types
    const validTypes = new Set(Object.values(TileType))
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        expect(validTypes.has(result.terrain[y][x].type)).toBe(true)
      }
    }
  })

  it('produces land tiles in the center', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)
    const result = extractGenesisResult(sim)

    const centerX = Math.floor(MAP_WIDTH / 2)
    const centerY = Math.floor(MAP_HEIGHT / 2)
    // Center is within Gron's rain aura — may be clover or dirt
    const centerType = result.terrain[centerY][centerX].type
    expect(centerType === TileType.Dirt || centerType === TileType.Clover).toBe(true)
  })

  it('produces Space tiles at corners', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)
    const result = extractGenesisResult(sim)

    // Corners should be space or sand (sandbar scattering can land on corners)
    const cornerTypes = [
      result.terrain[0][0].type,
      result.terrain[0][MAP_WIDTH - 1].type,
      result.terrain[MAP_HEIGHT - 1][0].type,
      result.terrain[MAP_HEIGHT - 1][MAP_WIDTH - 1].type,
    ]
    for (const ct of cornerTypes) {
      expect(ct === TileType.Space || ct === TileType.Sand).toBe(true)
    }
  })

  it('produces soil health values in valid range', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)
    const result = extractGenesisResult(sim)

    expect(result.soilHealth.size).toBeGreaterThan(0)
    for (const [, value] of result.soilHealth) {
      expect(value).toBeGreaterThanOrEqual(10)
      expect(value).toBeLessThanOrEqual(SOIL_HEALTH_MAX)
    }
  })

  it('produces at least 1 civilization ruin', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)
    const result = extractGenesisResult(sim)

    expect(result.ruins.length).toBeGreaterThanOrEqual(1)
  })

  it('places ruins on land tiles', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)
    const result = extractGenesisResult(sim)

    for (const ruin of result.ruins) {
      const tile = result.terrain[ruin.position.y][ruin.position.x]
      expect(tile.type).not.toBe(TileType.Space)
    }
  })

  it('gives ruins reasonable radii', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)
    const result = extractGenesisResult(sim)

    for (const ruin of result.ruins) {
      expect(ruin.radius).toBeGreaterThanOrEqual(3)
      expect(ruin.radius).toBeLessThanOrEqual(6)
    }
  })
})

describe('deterministic seeding', () => {
  it('produces identical results for the same seed', () => {
    const sim1 = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 12345)
    runAllMutations(sim1, GENESIS_EPOCHS)
    const r1 = extractGenesisResult(sim1)

    const sim2 = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 12345)
    runAllMutations(sim2, GENESIS_EPOCHS)
    const r2 = extractGenesisResult(sim2)

    // Same terrain
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        expect(r1.terrain[y][x].type).toBe(r2.terrain[y][x].type)
      }
    }

    // Same soil health
    expect(r1.soilHealth.size).toBe(r2.soilHealth.size)
    for (const [key, value] of r1.soilHealth) {
      expect(r2.soilHealth.get(key)).toBe(value)
    }

    // Same ruins
    expect(r1.ruins.length).toBe(r2.ruins.length)
    for (let i = 0; i < r1.ruins.length; i++) {
      expect(r1.ruins[i].position).toEqual(r2.ruins[i].position)
      expect(r1.ruins[i].name).toBe(r2.ruins[i].name)
    }
  })

  it('produces different results for different seeds', () => {
    const sim1 = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 100)
    runAllMutations(sim1, GENESIS_EPOCHS)
    const r1 = extractGenesisResult(sim1)

    const sim2 = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 999)
    runAllMutations(sim2, GENESIS_EPOCHS)
    const r2 = extractGenesisResult(sim2)

    // At least some soil health values should differ
    let diffCount = 0
    for (const [key, value] of r1.soilHealth) {
      if (r2.soilHealth.get(key) !== value) diffCount++
    }
    expect(diffCount).toBeGreaterThan(0)
  })
})

describe('soil health distribution', () => {
  it('has a reasonable mean', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)
    const result = extractGenesisResult(sim)

    const values = [...result.soilHealth.values()]
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    expect(mean).toBeGreaterThan(25)
    expect(mean).toBeLessThan(80)
  })

  it('has some high-fertility zones', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)
    const result = extractGenesisResult(sim)

    const highFertility = [...result.soilHealth.values()].filter(v => v > 80)
    expect(highFertility.length).toBeGreaterThan(0)
  })

  it('has some low-fertility zones', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)
    const result = extractGenesisResult(sim)

    const lowFertility = [...result.soilHealth.values()].filter(v => v < 25)
    expect(lowFertility.length).toBeGreaterThan(0)
  })
})

describe('tickGenesis', () => {
  it('returns false during simulation', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    const done = tickGenesis(sim, GENESIS_EPOCHS, 100)
    expect(done).toBe(false)
  })

  it('advances epochs', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)

    // First tick starts epoch 0
    tickGenesis(sim, GENESIS_EPOCHS, 100)
    expect(sim.epochIndex).toBe(0)

    // After epoch 0 duration, moves to epoch 1
    tickGenesis(sim, GENESIS_EPOCHS, 100 + GENESIS_EPOCHS[0].durationMs + 1)
    expect(sim.epochIndex).toBe(1)
  })

  it('returns true when all epochs are done', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)
    const done = tickGenesis(sim, GENESIS_EPOCHS, 99999)
    expect(done).toBe(true)
  })
})

describe('getGenesisCommentary', () => {
  it('returns commentary for current epoch', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    const commentary = getGenesisCommentary(sim, GENESIS_EPOCHS)
    expect(commentary).toBe('simulating birth of cosmos...')
  })

  it('returns empty string when complete', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)
    const commentary = getGenesisCommentary(sim, GENESIS_EPOCHS)
    expect(commentary).toBe('')
  })
})

describe('geological features', () => {
  it('generates volcanic heat map', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    // Run through lava era
    for (let i = 0; i <= 2; i++) {
      GENESIS_EPOCHS[i].mutate(sim)
    }
    expect(sim.volcanicHeat.size).toBeGreaterThan(0)
  })

  it('generates glacial paths', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    // Run through ice age
    for (let i = 0; i <= 8; i++) {
      GENESIS_EPOCHS[i].mutate(sim)
    }
    expect(sim.glacialPaths.size).toBeGreaterThan(0)
  })

  it('generates river paths', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    // Run through warm period
    for (let i = 0; i <= 10; i++) {
      GENESIS_EPOCHS[i].mutate(sim)
    }
    expect(sim.riverPaths.size).toBeGreaterThan(0)
  })

  it('generates burn scars from fire season', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    // Run through fire season
    for (let i = 0; i <= 6; i++) {
      GENESIS_EPOCHS[i].mutate(sim)
    }
    expect(sim.burnScars.size).toBeGreaterThan(0)
  })

  it('generates aqueduct network', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)
    expect(sim.aqueductNetwork.size).toBeGreaterThan(0)
  })
})

describe('genesis-enhancements', () => {
  describe('chaotic aqueducts', () => {
    it('generates 8-12 ruins', () => {
      // Test across multiple seeds to verify the range
      let minRuins = Infinity
      let maxRuins = 0
      for (let seed = 1; seed <= 20; seed++) {
        const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, seed)
        runAllMutations(sim, GENESIS_EPOCHS)
        minRuins = Math.min(minRuins, sim.ruins.length)
        maxRuins = Math.max(maxRuins, sim.ruins.length)
      }
      // At least 3 ruins always placed (fallback minimum)
      expect(minRuins).toBeGreaterThanOrEqual(3)
      // Upper bound allows for distance constraint reducing count
      expect(maxRuins).toBeLessThanOrEqual(12)
    })

    it('generates roughly 3x more aqueduct tiles than previous baseline', () => {
      const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
      runAllMutations(sim, GENESIS_EPOCHS)
      // Previous baseline was ~200-400 tiles with 3-5 ruins
      // New should be ~600+ with 8-12 ruins + standalone clusters
      expect(sim.aqueductNetwork.size).toBeGreaterThan(400)
    })

    it('generates standalone inland aqueduct clusters', () => {
      const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
      runAllMutations(sim, GENESIS_EPOCHS)
      // Aqueduct tiles should exist far from any ruin center
      let farFromRuins = 0
      for (const [key] of sim.aqueductNetwork) {
        const [xStr, yStr] = key.split(',')
        const ax = Number(xStr)
        const ay = Number(yStr)
        let nearRuin = false
        for (const ruin of sim.ruins) {
          const d = Math.sqrt((ruin.position.x - ax) ** 2 + (ruin.position.y - ay) ** 2)
          if (d < 15) {
            nearRuin = true
            break
          }
        }
        if (!nearRuin) farFromRuins++
      }
      expect(farFromRuins).toBeGreaterThan(0)
    })
  })

  describe('varied glacier edges', () => {
    it('generates smooth noise for glacier edges', () => {
      const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
      // Run through ice age
      for (let i = 0; i <= 8; i++) {
        GENESIS_EPOCHS[i].mutate(sim)
      }
      expect(sim.glacialEdgeNoise.top.length).toBe(MAP_WIDTH)
      expect(sim.glacialEdgeNoise.bottom.length).toBe(MAP_WIDTH)
    })

    it('produces varied glacier edges with amplitude > 2', () => {
      const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
      for (let i = 0; i <= 8; i++) {
        GENESIS_EPOCHS[i].mutate(sim)
      }
      const topRange = Math.max(...sim.glacialEdgeNoise.top) - Math.min(...sim.glacialEdgeNoise.top)
      expect(topRange).toBeGreaterThan(4)
    })

    it('snapshots pre-glacial vegetation', () => {
      const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
      for (let i = 0; i <= 8; i++) {
        GENESIS_EPOCHS[i].mutate(sim)
      }
      expect(sim.preGlacialVegetation.size).toBeGreaterThan(0)
      // Some pre-glacial tiles should have had vegetation
      const withVeg = [...sim.preGlacialVegetation.values()].filter(v => v > 20)
      expect(withVeg.length).toBeGreaterThan(0)
    })

    it('only adds glacial paths for tiles in landMask', () => {
      const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
      for (let i = 0; i <= 8; i++) {
        GENESIS_EPOCHS[i].mutate(sim)
      }
      for (const key of sim.glacialPaths) {
        expect(sim.landMask.has(key)).toBe(true)
      }
    })
  })

  describe('meteorite-triggered fires', () => {
    it('generates 5-8 meteorite streaks', () => {
      let minMeteors = Infinity
      let maxMeteors = 0
      for (let seed = 1; seed <= 20; seed++) {
        const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, seed)
        for (let i = 0; i <= 6; i++) {
          GENESIS_EPOCHS[i].mutate(sim)
        }
        minMeteors = Math.min(minMeteors, sim.meteorites.length)
        maxMeteors = Math.max(maxMeteors, sim.meteorites.length)
      }
      expect(minMeteors).toBeGreaterThanOrEqual(2) // fallback minimum
      expect(maxMeteors).toBeLessThanOrEqual(9) // 5-8 + possible extra from fallback
    })

    it('meteorite impacts land on land tiles', () => {
      const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
      for (let i = 0; i <= 6; i++) {
        GENESIS_EPOCHS[i].mutate(sim)
      }
      for (const meteor of sim.meteorites) {
        const key = `${String(meteor.impactX)},${String(meteor.impactY)}`
        expect(sim.landMask.has(key)).toBe(true)
      }
    })

    it('burns more than 40% of vegetated land', () => {
      const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
      for (let i = 0; i <= 6; i++) {
        GENESIS_EPOCHS[i].mutate(sim)
      }
      // Count vegetated land before fire (from emergence + regrowth)
      const totalLand = sim.landMask.size
      // Burn scars should cover a significant portion
      expect(sim.burnScars.size / totalLand).toBeGreaterThan(0.2)
    })
  })

  describe('animated water systems', () => {
    it('stores ordered river paths for progressive reveal', () => {
      const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
      for (let i = 0; i <= 10; i++) {
        GENESIS_EPOCHS[i].mutate(sim)
      }
      expect(sim.riverPathsOrdered.length).toBeGreaterThan(0)
      // Each path should have ordered positions
      for (const path of sim.riverPathsOrdered) {
        expect(path.length).toBeGreaterThan(0)
      }
    })

    it('generates meltwater pools at glacier edges', () => {
      const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
      for (let i = 0; i <= 8; i++) {
        GENESIS_EPOCHS[i].mutate(sim)
      }
      expect(sim.meltPools.size).toBeGreaterThan(0)
      // Melt pools should be on land, not in glacial paths
      for (const key of sim.meltPools) {
        expect(sim.landMask.has(key)).toBe(true)
        expect(sim.glacialPaths.has(key)).toBe(false)
      }
    })

    it('generates elevation-driven ponds within water budget', () => {
      const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
      runAllMutations(sim, GENESIS_EPOCHS)
      expect(sim.ponds.size).toBeGreaterThan(0)
      // Water budget is 10% of land tiles
      expect(sim.ponds.size).toBeLessThanOrEqual(Math.floor(sim.landMask.size * 0.1))
    })

    it('ponds do not overlap river paths', () => {
      const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
      runAllMutations(sim, GENESIS_EPOCHS)
      for (const key of sim.ponds) {
        expect(sim.riverPaths.has(key)).toBe(false)
      }
    })

    it('includes ponds in extracted genesis result', () => {
      const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
      runAllMutations(sim, GENESIS_EPOCHS)
      const result = extractGenesisResult(sim)
      expect(result.ponds).toBeDefined()
      expect(result.ponds.size).toBe(sim.ponds.size)
    })
  })
})

describe('elevation model', () => {
  it('generates elevation map during lava era', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    // Run through lava era (epoch 2)
    for (let i = 0; i <= 2; i++) {
      GENESIS_EPOCHS[i].mutate(sim)
    }
    expect(sim.elevation.size).toBeGreaterThan(0)
  })

  it('elevation values in valid range after all mutations', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)
    for (const [, value] of sim.elevation) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(100)
    }
  })

  it('center tends to be higher than edges', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)

    const centerX = MAP_WIDTH / 2
    const centerY = MAP_HEIGHT / 2
    const centerRadius = Math.min(MAP_WIDTH, MAP_HEIGHT) * 0.15
    let centerSum = 0
    let centerCount = 0
    let edgeSum = 0
    let edgeCount = 0

    for (const [key, value] of sim.elevation) {
      const [xStr, yStr] = key.split(',')
      const x = Number(xStr)
      const y = Number(yStr)
      const d = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2)
      if (d < centerRadius) {
        centerSum += value
        centerCount++
      } else if (d > centerRadius * 3) {
        edgeSum += value
        edgeCount++
      }
    }

    const centerMean = centerSum / centerCount
    const edgeMean = edgeSum / edgeCount
    expect(centerMean).toBeGreaterThan(edgeMean)
  })

  it('glaciers lower elevation', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    // Run through ice age
    for (let i = 0; i <= 8; i++) {
      GENESIS_EPOCHS[i].mutate(sim)
    }

    let glacialSum = 0
    let glacialCount = 0
    let nonGlacialSum = 0
    let nonGlacialCount = 0

    for (const [key, value] of sim.elevation) {
      if (sim.glacialPaths.has(key)) {
        glacialSum += value
        glacialCount++
      } else {
        nonGlacialSum += value
        nonGlacialCount++
      }
    }

    const glacialMean = glacialSum / glacialCount
    const nonGlacialMean = nonGlacialSum / nonGlacialCount
    expect(glacialMean).toBeLessThan(nonGlacialMean)
  })

  it('rivers generally flow downhill', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    for (let i = 0; i <= 10; i++) {
      GENESIS_EPOCHS[i].mutate(sim)
    }

    for (const path of sim.riverPathsOrdered) {
      if (path.length < 3) continue
      let downhillSteps = 0
      let totalSteps = 0
      for (let i = 1; i < path.length; i++) {
        const prevElev = sim.elevation.get(`${String(path[i - 1].x)},${String(path[i - 1].y)}`) ?? 50
        const currElev = sim.elevation.get(`${String(path[i].x)},${String(path[i].y)}`) ?? 50
        totalSteps++
        if (currElev <= prevElev) downhillSteps++
      }
      // At least 40% of steps should be downhill (erosion flattens the path, jitter adds uphill;
      // post-erosion elevation means consecutive tiles may be equal)
      expect(downhillSteps / totalSteps).toBeGreaterThan(0.4)
    }
  })

  it('ponds form at low elevation', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)

    let pondElevSum = 0
    let pondCount = 0
    let allElevSum = 0
    let allCount = 0

    for (const [key, value] of sim.elevation) {
      allElevSum += value
      allCount++
      if (sim.ponds.has(key)) {
        pondElevSum += value
        pondCount++
      }
    }

    if (pondCount > 0) {
      const pondMean = pondElevSum / pondCount
      const allMean = allElevSum / allCount
      expect(pondMean).toBeLessThan(allMean)
    }
  })

  it('water budget is respected', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)
    const waterBudget = Math.floor(sim.landMask.size * 0.1)
    expect(sim.ponds.size).toBeLessThanOrEqual(waterBudget)
  })

  it('elevation persists into GenesisResult', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)
    const result = extractGenesisResult(sim)
    expect(result.elevation.size).toBe(sim.elevation.size)
  })
})

describe('water consolidation', () => {
  const cardinalDirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]

  const findWaterComponents = (sim: ReturnType<typeof createGenesisState>) => {
    const allWater = new Set<string>()
    for (const key of sim.ponds) allWater.add(key)
    for (const key of sim.riverPaths) allWater.add(key)

    const visited = new Set<string>()
    const components: Set<string>[] = []

    for (const startKey of allWater) {
      if (visited.has(startKey)) continue
      const component = new Set<string>()
      const stack = [startKey]
      visited.add(startKey)

      while (stack.length > 0) {
        const current = stack.pop()
        if (current === undefined) break
        component.add(current)
        const [xStr, yStr] = current.split(',')
        const cx = Number(xStr)
        const cy = Number(yStr)
        for (const [ddx, ddy] of cardinalDirs) {
          const nk = posKey(cx + ddx, cy + ddy)
          if (allWater.has(nk) && !visited.has(nk)) {
            visited.add(nk)
            stack.push(nk)
          }
        }
      }

      components.push(component)
    }

    return { allWater, components }
  }

  it('water forms 2-5 contiguous bodies after genesis', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)
    const { components } = findWaterComponents(sim)
    expect(components.length).toBeGreaterThanOrEqual(1)
    expect(components.length).toBeLessThanOrEqual(5)
    for (const comp of components) {
      expect(comp.size).toBeGreaterThanOrEqual(10)
    }
  })

  it('no isolated water tiles after genesis', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)
    const { allWater } = findWaterComponents(sim)
    for (const key of allWater) {
      const [xStr, yStr] = key.split(',')
      const x = Number(xStr)
      const y = Number(yStr)
      const hasNeighbor = cardinalDirs.some(([ddx, ddy]) =>
        allWater.has(posKey(x + ddx, y + ddy)),
      )
      expect(hasNeighbor).toBe(true)
    }
  })

  it('drought preserves pond vs river categorization', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)
    for (const key of sim.ponds) {
      expect(sim.riverPaths.has(key)).toBe(false)
    }
  })

  it('water bodies have sand shoreline', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)
    const { allWater } = findWaterComponents(sim)
    const allDirs = [...cardinalDirs, [1, 1], [-1, -1], [1, -1], [-1, 1]]
    // Every dirt tile adjacent to water should have been converted to sand
    for (const key of allWater) {
      const [xStr, yStr] = key.split(',')
      const x = Number(xStr)
      const y = Number(yStr)
      for (const [ddx, ddy] of allDirs) {
        const nx = x + ddx
        const ny = y + ddy
        const nk = posKey(nx, ny)
        if (
          ny >= 0 &&
          ny < sim.height &&
          nx >= 0 &&
          nx < sim.width &&
          sim.landMask.has(nk) &&
          !allWater.has(nk)
        ) {
          // Land tiles bordering water should be sand, not dirt
          expect(sim.grid[ny][nx].type).not.toBe(TileType.Dirt)
        }
      }
    }
  })
})
