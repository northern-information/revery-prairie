import {
  computeGrowthFront,
  countBeesOnPatch,
  floodFillCloverPatches,
  resetSpiralState,
  selectSpiralGrowth,
  tickCloverGrowth,
  tickCloverHives,
} from '../clover'
import { ComponentType } from '../ecs/types'
import { posKey } from '../position'
import { TileType } from '../types'
import {
  clearArea,
  createBeeEntity,
  createBeehiveEntity,
  createGroundItemEntity,
  createTestState,
  getBeehiveEntities,
  getGroundItemEntities,
} from './helpers'
import { beforeEach, describe, expect, it } from 'vitest'

const placeCloverRect = (
  state: ReturnType<typeof createTestState>,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number
): void => {
  for (let dy = -halfH; dy <= halfH; dy++) {
    for (let dx = -halfW; dx <= halfW; dx++) {
      state.map[cy + dy][cx + dx] = { type: TileType.Clover }
    }
  }
}

describe('floodFillCloverPatches', () => {
  it('detects a single contiguous clover patch', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 5)
    placeCloverRect(state, 50, 50, 2, 2)

    const patches = floodFillCloverPatches(state)
    const big = patches.filter(p => p.tiles.size >= 9)
    expect(big).toHaveLength(1)
    expect(big[0].tiles.size).toBe(25)
  })

  it('detects multiple disconnected patches', () => {
    const state = createTestState()
    clearArea(state, 30, 30, 3)
    clearArea(state, 50, 50, 3)
    placeCloverRect(state, 30, 30, 1, 1)
    placeCloverRect(state, 50, 50, 1, 1)

    const patches = floodFillCloverPatches(state)
    const big = patches.filter(p => p.tiles.size >= 9)
    expect(big).toHaveLength(2)
  })

  it('diagonal clover tiles are separate patches', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 5)
    state.map[50][50] = { type: TileType.Clover }
    state.map[51][51] = { type: TileType.Clover }

    const patches = floodFillCloverPatches(state)
    const cloverPatches = patches.filter(p => [...p.tiles].some(k => k === posKey(50, 50) || k === posKey(51, 51)))
    expect(cloverPatches).toHaveLength(2)
  })

  it('single-tile patch', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 3)
    state.map[50][50] = { type: TileType.Clover }

    const patches = floodFillCloverPatches(state)
    const matching = patches.filter(p => p.tiles.has(posKey(50, 50)))
    expect(matching).toHaveLength(1)
    expect(matching[0].tiles.size).toBe(1)
  })

  it('computes correct maxHives using ceil division with minimum', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 20)

    // 26 tiles = 0 hives (below threshold)
    for (let i = 0; i < 26; i++) {
      state.map[50][30 + i] = { type: TileType.Clover }
    }
    let patches = floodFillCloverPatches(state)
    let line = patches.find(p => p.tiles.size === 26)
    expect(line).toBeDefined()
    expect(line!.maxHives).toBe(0)

    // 27 tiles = 1 hive
    state.map[50][56] = { type: TileType.Clover }
    patches = floodFillCloverPatches(state)
    line = patches.find(p => p.tiles.size === 27)
    expect(line).toBeDefined()
    expect(line!.maxHives).toBe(1)

    // 28 tiles = 2 hives
    state.map[50][57] = { type: TileType.Clover }
    patches = floodFillCloverPatches(state)
    line = patches.find(p => p.tiles.size === 28)
    expect(line).toBeDefined()
    expect(line!.maxHives).toBe(2)
  })
})

describe('computeGrowthFront', () => {
  it('finds dirt tiles adjacent to clover', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 5)
    state.map[50][50] = { type: TileType.Clover }

    const patches = floodFillCloverPatches(state)
    const patch = patches.find(p => p.tiles.has(posKey(50, 50)))!
    const front = computeGrowthFront(patch, state)

    expect(front).toHaveLength(4)
    const keys = new Set(front.map(p => posKey(p.x, p.y)))
    expect(keys.has(posKey(50, 49))).toBe(true)
    expect(keys.has(posKey(50, 51))).toBe(true)
    expect(keys.has(posKey(49, 50))).toBe(true)
    expect(keys.has(posKey(51, 50))).toBe(true)
  })

  it('excludes sand and space tiles', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 5)
    state.map[50][50] = { type: TileType.Clover }
    state.map[49][50] = { type: TileType.Sand }
    state.map[51][50] = { type: TileType.Space }

    const patches = floodFillCloverPatches(state)
    const patch = patches.find(p => p.tiles.has(posKey(50, 50)))!
    const front = computeGrowthFront(patch, state)

    const keys = new Set(front.map(p => posKey(p.x, p.y)))
    expect(keys.has(posKey(50, 49))).toBe(false)
    expect(keys.has(posKey(50, 51))).toBe(false)
    expect(keys.has(posKey(49, 50))).toBe(true)
    expect(keys.has(posKey(51, 50))).toBe(true)
  })
})

describe('countBeesOnPatch', () => {
  it('counts bees on patch tiles', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 5)
    placeCloverRect(state, 50, 50, 2, 2)

    createBeeEntity(state, 50, 50)
    createBeeEntity(state, 51, 50)
    createBeeEntity(state, 30, 30)

    const patches = floodFillCloverPatches(state)
    const patch = patches.find(p => p.tiles.has(posKey(50, 50)))!
    expect(countBeesOnPatch(patch, state)).toBe(2)
  })
})

describe('selectSpiralGrowth', () => {
  beforeEach(() => {
    resetSpiralState()
  })

  it('returns empty when no bees', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 5)
    placeCloverRect(state, 50, 50, 1, 1)

    const patches = floodFillCloverPatches(state)
    const patch = patches.find(p => p.tiles.has(posKey(50, 50)))!
    patch.beeCount = 0
    const candidates = computeGrowthFront(patch, state)
    const selected = selectSpiralGrowth(patch, candidates)
    expect(selected).toHaveLength(0)
  })

  it('selects tiles when bees are present', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 10)
    placeCloverRect(state, 50, 50, 3, 3)

    const patches = floodFillCloverPatches(state)
    const patch = patches.find(p => p.tiles.has(posKey(50, 50)))!
    const candidates = computeGrowthFront(patch, state)

    let totalSelected = 0
    const trials = 200
    for (let i = 0; i < trials; i++) {
      resetSpiralState()
      patch.beeCount = 10
      totalSelected += selectSpiralGrowth(patch, candidates).length
    }

    expect(totalSelected).toBeGreaterThan(0)
  })

  it('respects max growth per tick cap', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 20)
    placeCloverRect(state, 50, 50, 5, 5)

    const patches = floodFillCloverPatches(state)
    const patch = patches.find(p => p.tiles.has(posKey(50, 50)))!
    patch.beeCount = 100
    const candidates = computeGrowthFront(patch, state)

    for (let i = 0; i < 50; i++) {
      resetSpiralState()
      const selected = selectSpiralGrowth(patch, candidates)
      expect(selected.length).toBeLessThanOrEqual(3)
    }
  })
})

describe('tickCloverGrowth', () => {
  beforeEach(() => {
    resetSpiralState()
  })

  it('converts previews to clover on next tick', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 5)
    state.map[50][50] = { type: TileType.Clover }

    // Manually set a preview to simulate previous tick
    state.cloverGrowthPreviews = new Set([posKey(51, 50)])

    createBeeEntity(state, 50, 50)
    tickCloverGrowth(state)

    // The preview tile should now be clover
    expect(state.map[50][51].type).toBe(TileType.Clover)
  })

  it('does not grow without bees', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 5)
    state.map[50][50] = { type: TileType.Clover }

    tickCloverGrowth(state)
    expect(state.cloverGrowthPreviews.size).toBe(0)
  })

  it('does not grow onto sand or space', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 5)
    state.map[50][50] = { type: TileType.Clover }
    state.map[49][50] = { type: TileType.Sand }
    state.map[51][50] = { type: TileType.Sand }
    state.map[50][49] = { type: TileType.Space }
    state.map[50][51] = { type: TileType.Space }

    createBeeEntity(state, 50, 50)

    for (let i = 0; i < 20; i++) {
      resetSpiralState()
      state.cloverGrowthPreviews = new Set()
      tickCloverGrowth(state)
    }
    expect(state.cloverGrowthPreviews.size).toBe(0)
  })

  it('records discovery on first growth', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 5)
    state.map[50][50] = { type: TileType.Clover }

    state.cloverGrowthPreviews = new Set([posKey(51, 50)])
    createBeeEntity(state, 50, 50)
    tickCloverGrowth(state)

    expect(state.manualDiscoveries.has('event:clover-growth')).toBe(true)
  })
})

describe('tickCloverHives', () => {
  it('does not spawn hive on patch smaller than 27 tiles', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 10)
    placeCloverRect(state, 50, 50, 2, 2)
    createBeeEntity(state, 50, 50)

    for (let i = 0; i < 100; i++) {
      tickCloverHives(state)
    }
    expect(getBeehiveEntities(state)).toHaveLength(0)
  })

  it('spawns hive on sufficiently large patch with bees', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 15)
    placeCloverRect(state, 50, 50, 3, 2)

    for (let i = 0; i < 10; i++) {
      createBeeEntity(state, 50, 50)
    }

    let hiveBuilt = false
    for (let i = 0; i < 500; i++) {
      tickCloverHives(state)
      if (getBeehiveEntities(state).length > 0) {
        hiveBuilt = true
        break
      }
    }
    expect(hiveBuilt).toBe(true)
  })

  it('enforces hive cap', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 15)
    for (let i = 0; i < 27; i++) {
      state.map[50][34 + i] = { type: TileType.Clover }
    }

    createBeehiveEntity(state, 40, 50)

    for (let i = 0; i < 10; i++) {
      createBeeEntity(state, 40, 50)
    }

    const initialCount = getBeehiveEntities(state).length
    for (let i = 0; i < 100; i++) {
      tickCloverHives(state)
    }
    expect(getBeehiveEntities(state).length).toBe(initialCount)
  })

  it('requires bees to build hives', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 15)
    placeCloverRect(state, 50, 50, 3, 2)

    for (let i = 0; i < 100; i++) {
      tickCloverHives(state)
    }
    expect(getBeehiveEntities(state)).toHaveLength(0)
  })

  it('beehive is a blocking entity', () => {
    const state = createTestState()
    createBeehiveEntity(state, 50, 50)

    const blocking = state.world.getComponent(getBeehiveEntities(state)[0], ComponentType.Blocking)
    expect(blocking).toEqual({ blockMovement: true })
  })

  it('records discovery when hive is built', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 15)
    placeCloverRect(state, 50, 50, 3, 2)

    for (let i = 0; i < 10; i++) {
      createBeeEntity(state, 50, 50)
    }

    let discovered = false
    for (let i = 0; i < 500; i++) {
      tickCloverHives(state)
      if (state.manualDiscoveries.has('event:beehive-built')) {
        discovered = true
        break
      }
    }
    expect(discovered).toBe(true)
  })
})

describe('honey production', () => {
  it('hive produces honey ground items', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 15)
    placeCloverRect(state, 50, 50, 3, 2)

    createBeehiveEntity(state, 50, 50)
    for (let i = 0; i < 5; i++) {
      createBeeEntity(state, 49 + i, 50)
    }
    state.player = { x: 20, y: 20 }

    let honeyFound = false
    for (let i = 0; i < 200; i++) {
      tickCloverHives(state)
      const groundItems = getGroundItemEntities(state)
      const honey = groundItems.filter(eid => {
        const drop = state.world.getComponent(eid, ComponentType.ItemDrop)
        return drop?.definitionId === 'honey'
      })
      if (honey.length > 0) {
        honeyFound = true
        break
      }
    }
    expect(honeyFound).toBe(true)
  })

  it('does not produce honey without bees', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 15)
    placeCloverRect(state, 50, 50, 3, 2)

    createBeehiveEntity(state, 50, 50)
    state.player = { x: 20, y: 20 }

    for (let i = 0; i < 100; i++) {
      tickCloverHives(state)
    }
    const groundItems = getGroundItemEntities(state)
    const honey = groundItems.filter(eid => {
      const drop = state.world.getComponent(eid, ComponentType.ItemDrop)
      return drop?.definitionId === 'honey'
    })
    expect(honey).toHaveLength(0)
  })

  it('does not produce honey when all adjacent tiles are occupied', () => {
    const state = createTestState()
    clearArea(state, 50, 50, 5)
    // Single clover tile with a hive — patch too small for new hives
    state.map[50][50] = { type: TileType.Clover }

    createBeehiveEntity(state, 50, 50)
    // Block all 4 cardinal neighbors with ground items
    createGroundItemEntity(state, 'clover', 50, 49)
    createGroundItemEntity(state, 'clover', 50, 51)
    createGroundItemEntity(state, 'clover', 49, 50)
    createGroundItemEntity(state, 'clover', 51, 50)

    createBeeEntity(state, 50, 50)
    state.player = { x: 20, y: 20 }

    for (let i = 0; i < 100; i++) {
      tickCloverHives(state)
    }
    const groundItems = getGroundItemEntities(state)
    const honey = groundItems.filter(eid => {
      const drop = state.world.getComponent(eid, ComponentType.ItemDrop)
      return drop?.definitionId === 'honey'
    })
    // Only the 4 blocking ground items, no honey
    expect(honey).toHaveLength(0)
  })
})
