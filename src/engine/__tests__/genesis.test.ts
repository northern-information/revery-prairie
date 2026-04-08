import { describe, expect, it } from 'vitest'
import {
  createGenesisState,
  extractGenesisResult,
  GENESIS_EPOCHS,
  getGenesisCommentary,
  nameToSeed,
  runAllMutations,
  tickGenesis,
} from '../genesis'
import { MAP_HEIGHT, MAP_WIDTH, SOIL_HEALTH_MAX } from '../constants'
import { TileType } from '../types'

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

  it('produces Dirt tiles in the center', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)
    const result = extractGenesisResult(sim)

    const centerX = Math.floor(MAP_WIDTH / 2)
    const centerY = Math.floor(MAP_HEIGHT / 2)
    expect(result.terrain[centerY][centerX].type).toBe(TileType.Dirt)
  })

  it('produces Space tiles at corners', () => {
    const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, 42)
    runAllMutations(sim, GENESIS_EPOCHS)
    const result = extractGenesisResult(sim)

    expect(result.terrain[0][0].type).toBe(TileType.Space)
    expect(result.terrain[0][MAP_WIDTH - 1].type).toBe(TileType.Space)
    expect(result.terrain[MAP_HEIGHT - 1][0].type).toBe(TileType.Space)
    expect(result.terrain[MAP_HEIGHT - 1][MAP_WIDTH - 1].type).toBe(TileType.Space)
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
    // Run through magma era
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
