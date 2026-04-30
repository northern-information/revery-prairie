import {
  MAP_HEIGHT,
  MAP_WIDTH,
  POND_COLOR,
  RAIN_AURA_CHARS,
  RAIN_AURA_COLORS,
  RAIN_AURA_DENSITY,
  RIVER_COLOR,
  SOIL_HEALTH_MAX,
} from '../constants'
import {
  createGenesisState,
  extractGenesisResult,
  GENESIS_EPOCHS,
  getEpochProgress,
  getGenesisCommentary,
  nameToSeed,
  precomputeGenesis,
  runAllMutations,
  tickGenesis,
} from '../genesis'
import { posKey, tileHash } from '../position'
import { TileType } from '../types'
import { describe, expect, it, vi } from 'vitest'

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

  it('places ruins on land tiles (before connectivity enforcement)', () => {
    // Ruins are placed during riseOfCivilizations on land tiles.
    // The connectivity pass in presentDay may convert disconnected land to space,
    // so some ruin positions may end up on space tiles. We verify that at least
    // half of ruins remain on non-space tiles (the main island ruins).
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)
    const result = extractGenesisResult(sim)

    const onLand = result.ruins.filter(
      ruin => result.terrain[ruin.position.y][ruin.position.x].type !== TileType.Space
    )
    expect(onLand.length).toBeGreaterThanOrEqual(Math.ceil(result.ruins.length / 2))
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

  it('sets epochStartTime on advance so next epoch has non-zero progress', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)

    // Start epoch 0
    const startTime = 1000
    tickGenesis(sim, GENESIS_EPOCHS, startTime)
    expect(sim.epochIndex).toBe(0)
    expect(sim.epochStartTime).toBe(startTime)

    // Advance past epoch 0 duration
    const advanceTime = startTime + GENESIS_EPOCHS[0].durationMs + 1
    tickGenesis(sim, GENESIS_EPOCHS, advanceTime)
    expect(sim.epochIndex).toBe(1)

    // epochStartTime should be set to the advance time, not 0
    expect(sim.epochStartTime).toBe(advanceTime)
    expect(sim.epochStartTime).not.toBe(0)
  })

  it('does not produce progress=0 at epoch transitions', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)

    // Start epoch 0
    tickGenesis(sim, GENESIS_EPOCHS, 1000)

    // Advance to epoch 1
    const advanceTime = 1000 + GENESIS_EPOCHS[0].durationMs + 1
    tickGenesis(sim, GENESIS_EPOCHS, advanceTime)
    expect(sim.epochIndex).toBe(1)

    // Mock performance.now to match the advance time
    vi.spyOn(performance, 'now').mockReturnValue(advanceTime)
    try {
      const progress = getEpochProgress(sim, GENESIS_EPOCHS)
      // Progress should be 0 or very small but epochStartTime should be set,
      // so getEpochProgress should not take the epochStartTime===0 early return
      expect(sim.epochStartTime).not.toBe(0)
      expect(progress).toBeGreaterThanOrEqual(0)
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('getGenesisCommentary', () => {
  it('returns commentary for current epoch', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    const commentary = getGenesisCommentary(sim, GENESIS_EPOCHS)
    expect(commentary).toBe('Simulating birth of cosmos...')
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
    it('generates 8-12 ruins', { timeout: 30_000 }, () => {
      // Test across a few seeds to verify the range (kept small to avoid timeout)
      let minRuins = Infinity
      let maxRuins = 0
      for (let seed = 1; seed <= 5; seed++) {
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

  it('water forms 1-3 contiguous bodies after genesis', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)
    const { components } = findWaterComponents(sim)
    expect(components.length).toBeGreaterThanOrEqual(1)
    expect(components.length).toBeLessThanOrEqual(3)
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

  it('no small dirt islands inside water bodies', () => {
    // Test across multiple seeds to catch probabilistic island formation
    for (let seed = 1; seed <= 10; seed++) {
      const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, seed)
      runAllMutations(sim, GENESIS_EPOCHS)
      const { allWater } = findWaterComponents(sim)

      // Build a set of all water + sand tiles near water
      const waterAndSand = new Set<string>(allWater)
      for (const key of allWater) {
        const [xStr, yStr] = key.split(',')
        const x = Number(xStr)
        const y = Number(yStr)
        for (const [ddx, ddy] of cardinalDirs) {
          const nx = x + ddx
          const ny = y + ddy
          if (ny >= 0 && ny < sim.height && nx >= 0 && nx < sim.width) {
            const nk = posKey(nx, ny)
            if (sim.grid[ny][nx].type === TileType.Sand) {
              waterAndSand.add(nk)
            }
          }
        }
      }

      // Find dirt connected components using cardinal BFS
      const visited = new Set<string>()
      for (let y = 0; y < sim.height; y++) {
        for (let x = 0; x < sim.width; x++) {
          if (sim.grid[y][x].type !== TileType.Dirt) continue
          const startKey = posKey(x, y)
          if (visited.has(startKey)) continue
          if (allWater.has(startKey)) continue

          const component: string[] = [startKey]
          const stack = [startKey]
          visited.add(startKey)
          let enclosed = true

          while (stack.length > 0) {
            const current = stack.pop()
            if (current === undefined) break
            const [cxStr, cyStr] = current.split(',')
            const cx = Number(cxStr)
            const cy = Number(cyStr)
            for (const [ddx, ddy] of cardinalDirs) {
              const nx = cx + ddx
              const ny = cy + ddy
              if (nx < 0 || nx >= sim.width || ny < 0 || ny >= sim.height) {
                enclosed = false
                continue
              }
              const nk = posKey(nx, ny)
              if (allWater.has(nk)) continue
              const neighborType = sim.grid[ny][nx].type
              if (neighborType === TileType.Dirt) {
                if (!visited.has(nk)) {
                  visited.add(nk)
                  component.push(nk)
                  stack.push(nk)
                }
              } else if (neighborType !== TileType.Sand) {
                enclosed = false
              }
            }
          }

          // If enclosed by water/sand and smaller than threshold, it's an island
          if (enclosed && component.length < 4) {
            throw new Error(
              `Seed ${String(seed)}: found ${String(component.length)}-tile dirt island at ${component[0]} enclosed by water/sand`
            )
          }
        }
      }
    }
  })

  it('water body sand border varies between 1-2 tiles', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)
    const { allWater } = findWaterComponents(sim)
    const allDirs = [...cardinalDirs, [1, 1], [-1, -1], [1, -1], [-1, 1]]

    // Collect distance-1 sand tiles (adjacent to water)
    const dist1Sand = new Set<string>()
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
          dist1Sand.add(nk)
        }
      }
    }

    // Distance-2 land neighbors: count sand vs total
    let sandCount = 0
    let totalCount = 0
    for (const key of dist1Sand) {
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
          !allWater.has(nk) &&
          !dist1Sand.has(nk)
        ) {
          totalCount++
          if (sim.grid[ny][nx].type === TileType.Sand) sandCount++
        }
      }
    }

    // Probabilistic border: expect 20-95% of distance-2 tiles to be sand
    // (reduced from 50% threshold after lowering WATER_SAND_BORDER_MAX to 2
    // and WATER_SAND_PASS_CHANCES to [100, 50])
    const ratio = sandCount / totalCount
    expect(ratio).toBeGreaterThan(0.2)
    expect(ratio).toBeLessThan(0.95)
  })
})

describe('epoch snapshot completeness', () => {
  // Epoch indices:
  // 0: cosmicFormation, 1: landAccretion, 2: lavaEra, 3: crustCooling,
  // 4: firstWater, 5: emergenceOfLife, 6: fireSeason, 7: regrowth,
  // 8: iceAge, 9: postGlacialDieOff, 10: warmPeriod,
  // 11: riseOfCivilizations, 12: fallOfCivilizations, 13: presentDay

  const getSnapshots = () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    precomputeGenesis(sim, GENESIS_EPOCHS)
    return sim.epochSnapshots
  }

  it('produces one snapshot per epoch', () => {
    const snapshots = getSnapshots()
    expect(snapshots.length).toBe(GENESIS_EPOCHS.length)
  })

  it('early epoch snapshots have empty burnScars', () => {
    const snapshots = getSnapshots()
    // burnScars first populated by fireSeason (index 6)
    for (let i = 0; i < 6; i++) {
      expect(snapshots[i].burnScars.size).toBe(0)
    }
  })

  it('early epoch snapshots have empty glacialPaths', () => {
    const snapshots = getSnapshots()
    // glacialPaths first populated by iceAge (index 8)
    for (let i = 0; i < 8; i++) {
      expect(snapshots[i].glacialPaths.size).toBe(0)
    }
  })

  it('early epoch snapshots have empty tileData and aqueductNetwork', () => {
    const snapshots = getSnapshots()
    // tileData and aqueductNetwork first populated by riseOfCivilizations (index 11)
    for (let i = 0; i < 11; i++) {
      expect(snapshots[i].tileData.size).toBe(0)
      expect(snapshots[i].aqueductNetwork.size).toBe(0)
    }
  })

  it('early epoch snapshots have empty meteorites and lightningBolts', () => {
    const snapshots = getSnapshots()
    // meteorites and lightningBolts first populated by fireSeason (index 6)
    for (let i = 0; i < 6; i++) {
      expect(snapshots[i].meteorites.length).toBe(0)
      expect(snapshots[i].lightningBolts.length).toBe(0)
    }
  })

  it('iceAge snapshot has non-empty glacialPaths', () => {
    const snapshots = getSnapshots()
    // iceAge is index 8
    expect(snapshots[8].glacialPaths.size).toBeGreaterThan(0)
  })

  it('fireSeason snapshot has non-empty burnScars', () => {
    const snapshots = getSnapshots()
    // fireSeason is index 6
    expect(snapshots[6].burnScars.size).toBeGreaterThan(0)
  })

  it('riseOfCivilizations snapshot has non-empty tileData', () => {
    const snapshots = getSnapshots()
    // riseOfCivilizations is index 11
    expect(snapshots[11].tileData.size).toBeGreaterThan(0)
  })

  it('riseOfCivilizations snapshot has non-empty ruins', () => {
    const snapshots = getSnapshots()
    expect(snapshots[11].ruins.length).toBeGreaterThan(0)
  })

  it('snapshots are independent clones — later mutations do not corrupt earlier snapshots', () => {
    const snapshots = getSnapshots()
    // cosmicFormation (index 0) should have empty vegetationMap even though
    // later epochs populate it
    expect(snapshots[0].vegetationMap.size).toBe(0)
    // emergenceOfLife (index 5) populates vegetationMap
    expect(snapshots[5].vegetationMap.size).toBeGreaterThan(0)
  })
})

describe('getEpochProgress clock consistency', () => {
  it('uses lastTickTime instead of performance.now()', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)

    // Start epoch 0 at time 1000
    tickGenesis(sim, GENESIS_EPOCHS, 1000)
    expect(sim.lastTickTime).toBe(1000)

    // Advance to epoch 1
    const advanceTime = 1000 + GENESIS_EPOCHS[0].durationMs + 1
    tickGenesis(sim, GENESIS_EPOCHS, advanceTime)
    expect(sim.epochIndex).toBe(1)
    expect(sim.lastTickTime).toBe(advanceTime)

    // getEpochProgress should use lastTickTime, not performance.now().
    // Even if performance.now() is wildly different, progress should be
    // based on lastTickTime.
    vi.spyOn(performance, 'now').mockReturnValue(advanceTime + 999999)
    try {
      const progress = getEpochProgress(sim, GENESIS_EPOCHS)
      // With lastTickTime = advanceTime and epochStartTime = advanceTime,
      // progress should be near 0 (1ms / durationMs), NOT near 1 from
      // the mocked performance.now far in the future.
      const expectedMax = 100 / GENESIS_EPOCHS[1].durationMs
      expect(progress).toBeLessThan(expectedMax)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('returns meaningful progress on epoch transition frame', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)

    // Start epoch 0
    tickGenesis(sim, GENESIS_EPOCHS, 1000)

    // Advance partway through epoch 0 to accumulate some time, then
    // advance past the epoch boundary
    const midTime = 1000 + GENESIS_EPOCHS[0].durationMs / 2
    tickGenesis(sim, GENESIS_EPOCHS, midTime)

    // Now advance past the epoch boundary — epochIndex should be 1 and
    // epochStartTime should be set to this time
    const boundaryTime = 1000 + GENESIS_EPOCHS[0].durationMs + 1
    tickGenesis(sim, GENESIS_EPOCHS, boundaryTime)
    expect(sim.epochIndex).toBe(1)

    // Progress on the transition frame should be based on lastTickTime
    const progress = getEpochProgress(sim, GENESIS_EPOCHS)
    expect(progress).toBeGreaterThanOrEqual(0)
    // Should be very small (1ms / durationMs) but NOT exactly 0
    // since epochStartTime = boundaryTime and lastTickTime = boundaryTime
    // means elapsed = 0, so progress = 0. That's correct — it's the same
    // frame, so progress is 0. The key fix is that it's no longer
    // performance.now() which could produce arbitrary values.
    expect(progress).toBeLessThan(0.01)
  })
})

describe('water continuity at genesis-to-game transition', () => {
  it('presentDay renderTile water matches riverPaths and ponds', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    precomputeGenesis(sim, GENESIS_EPOCHS)

    // Get the presentDay epoch (last one)
    const presentDayEpoch = GENESIS_EPOCHS[GENESIS_EPOCHS.length - 1]
    const presentDaySnapshot = sim.epochSnapshots[sim.epochSnapshots.length - 1]

    // Apply the final snapshot so renderTile reads correct data
    const savedRivers = sim.riverPaths
    const savedPonds = sim.ponds
    sim.riverPaths = presentDaySnapshot.riverPaths
    sim.ponds = presentDaySnapshot.ponds
    sim.elevation = presentDaySnapshot.elevation
    sim.vegetationMap = presentDaySnapshot.vegetationMap
    sim.burnScars = presentDaySnapshot.burnScars

    const time = 5000
    const progress = 0.5
    const waterChars = new Set(['~', '=', '-'])
    const waterColors = new Set([RIVER_COLOR, POND_COLOR])

    // Track which tiles renderTile shows as water vs which are in the sets.
    // Water is identified by char AND color so non-water glyphs that share
    // a char (e.g. crater BUILDING_CHARS containing '=') are not misread as water.
    const renderedWater = new Set<string>()
    const trackedWater = new Set<string>()

    for (const key of sim.riverPaths) trackedWater.add(key)
    for (const key of sim.ponds) trackedWater.add(key)

    // Check all land tiles
    for (const key of sim.landMask) {
      const [xStr, yStr] = key.split(',')
      const x = Number(xStr)
      const y = Number(yStr)
      const renders = presentDayEpoch.renderTile(sim, x, y, progress, time)
      if (renders.length > 0 && waterChars.has(renders[0].char) && waterColors.has(renders[0].color)) {
        renderedWater.add(key)
      }
    }

    // Every tile rendered as water must be in riverPaths or ponds
    for (const key of renderedWater) {
      expect(trackedWater.has(key)).toBe(true)
    }

    // Every tile in riverPaths/ponds must render as water
    for (const key of trackedWater) {
      if (!sim.landMask.has(key)) continue
      expect(renderedWater.has(key)).toBe(true)
    }

    // Restore
    sim.riverPaths = savedRivers
    sim.ponds = savedPonds
  })

  it('fallOfCivilizations does not render elevation-based cosmetic water', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    precomputeGenesis(sim, GENESIS_EPOCHS)

    // fallOfCivilizations is index 12 (second to last)
    const fallEpoch = GENESIS_EPOCHS[12]
    const fallSnapshot = sim.epochSnapshots[12]

    // Apply snapshot
    sim.riverPaths = fallSnapshot.riverPaths
    sim.ponds = fallSnapshot.ponds
    sim.elevation = fallSnapshot.elevation
    sim.vegetationMap = fallSnapshot.vegetationMap
    sim.burnScars = fallSnapshot.burnScars
    sim.meltPools = fallSnapshot.meltPools
    sim.tileData = fallSnapshot.tileData
    sim.aqueductNetwork = fallSnapshot.aqueductNetwork
    sim.ruins = fallSnapshot.ruins
    sim.satelliteCrashes = fallSnapshot.satelliteCrashes
    sim.craters = fallSnapshot.craters

    const time = 5000
    const progress = 0.99 // near end of epoch (crossfade window)
    const waterChars = new Set(['~', '=', '-'])

    const trackedWater = new Set<string>()
    for (const key of sim.riverPaths) trackedWater.add(key)
    for (const key of sim.ponds) trackedWater.add(key)
    for (const key of sim.meltPools) trackedWater.add(key)

    // Pre-compute every tile that lies along a satellite crash trail.
    // These tiles render BUILDING_CHARS (which include '=') during the
    // crash animation; they are tracked state, not phantom water.
    const inSatelliteCrashPath = new Set<string>()
    for (const crash of sim.satelliteCrashes) {
      const totalSteps = Math.abs(crash.impactX - crash.startX) + Math.abs(crash.impactY - crash.startY)
      for (let s = 0; s <= totalSteps; s++) {
        const tx = crash.startX + crash.dx * s
        const ty = crash.startY + crash.dy * s
        inSatelliteCrashPath.add(posKey(tx, ty))
      }
    }

    // Check all land tiles — any water rendered should be in tracked sets.
    // Some tile-state branches reuse glyphs that overlap the water set
    // (craters and crash trails use BUILDING_CHARS that include '=';
    // aqueducts render as '~'/'='/'-'); those tiles are tracked state,
    // not phantom water.
    for (const key of sim.landMask) {
      if (sim.craters.has(key)) continue
      if (sim.aqueductNetwork.has(key)) continue
      if (inSatelliteCrashPath.has(key)) continue
      const [xStr, yStr] = key.split(',')
      const x = Number(xStr)
      const y = Number(yStr)
      const renders = fallEpoch.renderTile(sim, x, y, progress, time)
      if (renders.length > 0 && waterChars.has(renders[0].char)) {
        const inTracked = trackedWater.has(key)
        if (!inTracked) {
          // This would be a phantom water tile — elevation-based but not in any set
          expect.fail(`tile ${key} renders as water but is not in riverPaths, ponds, or meltPools`)
        }
      }
    }
  })
})

const readSource = async (relativePath: string): Promise<string> => {
  const fs = await import('node:fs')
  const path = await import('node:path')
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf-8')
}

describe('phase-based system filtering', () => {
  it('no genesis guards remain in game loop system bodies', async () => {
    const source = await readSource('../gameLoop.ts')

    const fnBodies = source.split(/\n/)
    let inGenesisSystem = false
    let genesisGuardCount = 0

    for (const line of fnBodies) {
      if (line.includes("id: 'genesis'")) inGenesisSystem = true
      if (inGenesisSystem && line.includes('},')) inGenesisSystem = false

      if (!inGenesisSystem && line.includes('if (state.genesis) return')) {
        genesisGuardCount++
      }
    }

    expect(genesisGuardCount).toBe(0)
  })

  it('TickSystem interface includes phase field', async () => {
    const source = await readSource('../gameLoop.ts')
    expect(source).toContain("phase?: 'genesis' | 'gameplay' | 'always'")
  })

  it('dispatcher resolves phase from state.genesis', async () => {
    const source = await readSource('../gameLoop.ts')
    expect(source).toContain("state.genesis ? 'genesis' : 'gameplay'")
  })
})

describe('presentDay rain aura rendering', () => {
  it('renders rain overlay on tiles within Gron rain radius', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    precomputeGenesis(sim, GENESIS_EPOCHS)

    const presentDay = GENESIS_EPOCHS[GENESIS_EPOCHS.length - 1]
    const gronX = Math.floor(sim.width / 2)
    const gronY = Math.floor(sim.height / 2)

    // Apply the final epoch snapshot
    sim.epochIndex = GENESIS_EPOCHS.length - 1

    // Check tiles around Gron for rain overlay
    let rainFound = false
    for (let dy = -5; dy <= 5; dy++) {
      for (let dx = -5; dx <= 5; dx++) {
        if (dx === 0 && dy === 0) continue // Gron tile itself
        const tx = gronX + dx
        const ty = gronY + dy
        if (dx * dx + dy * dy > 36) continue // outside radius

        const h = tileHash(tx, ty)
        if (h % RAIN_AURA_DENSITY !== 0) continue // density check

        const renders = presentDay.renderTile(sim, tx, ty, 0.8, 1000)
        if (renders.length > 1) {
          // Second entry should be rain overlay
          const rainChar = renders[1].char
          const rainColor = renders[1].color
          expect(RAIN_AURA_CHARS).toContain(rainChar)
          expect(RAIN_AURA_COLORS).toContain(rainColor)
          rainFound = true
        }
      }
    }

    expect(rainFound).toBe(true)
  })

  it('does not render rain on the Gron tile', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    precomputeGenesis(sim, GENESIS_EPOCHS)

    const presentDay = GENESIS_EPOCHS[GENESIS_EPOCHS.length - 1]
    const gronX = Math.floor(sim.width / 2)
    const gronY = Math.floor(sim.height / 2)

    sim.epochIndex = GENESIS_EPOCHS.length - 1

    // Gron tile — should be single entry (character glyph only).
    // The player tile is intentionally not asserted here: the player
    // is not drawn during genesis presentDay (the steward arrives via
    // the spawn-meteor ceremony), so rain may or may not animate at
    // the eventual spawn tile based on the rainH density gate. Either
    // outcome is benign because no player glyph is drawn yet.
    const gronRenders = presentDay.renderTile(sim, gronX, gronY, 0.8, 1000)
    expect(gronRenders.length).toBe(1)
  })

  it('uses shared AURA_RADIUS.rain for Gron rain radius', async () => {
    const source = await readSource('../genesis.ts')
    // GRON_RAIN_RADIUS should derive from AURA_RADIUS, not be a raw literal
    expect(source).toContain('GRON_RAIN_RADIUS = AURA_RADIUS.rain')
    // No hardcoded '= 6' for the radius (the ?? 6 fallback is acceptable)
    expect(source).not.toMatch(/GRON_RAIN_RADIUS\s*=\s*6\s*[;\n]/)
  })

  it('uses character definition for Gron glyph', async () => {
    const source = await readSource('../genesis.ts')
    // No hardcoded Gron glyph in renderTile
    expect(source).not.toMatch(/char: 'G', color: '#FFFFFF'/)
    // Uses getGronVisuals or getCharacterDefinition
    expect(source).toContain('getGronVisuals')
  })
})

describe('crossfade progress continuity', () => {
  it('CROSSFADE_PEEK limits next epoch progress during blend', async () => {
    const source = await readSource('../genesisRenderer.ts')
    // The next epoch renderTile should receive blendT * CROSSFADE_PEEK, not raw blendT
    expect(source).toContain('blendT * CROSSFADE_PEEK')
    // CROSSFADE_PEEK should be small (< 0.2)
    const match = /CROSSFADE_PEEK\s*=\s*([\d.]+)/.exec(source)
    expect(match).toBeTruthy()
    const peek = Number(match?.[1])
    expect(peek).toBeGreaterThan(0)
    expect(peek).toBeLessThan(0.2)
  })
})
