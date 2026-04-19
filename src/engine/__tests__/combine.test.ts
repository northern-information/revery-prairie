import { checkCombine, combineBeeAndClover } from '../combine'
import { ComponentType } from '../ecs/types'
import { containerHasItem, placeItem } from '../inventory'
import { TileType } from '../types'
import { clearAroundPlayer, createTestState, getBeeEntities } from './helpers'
import { describe, expect, it } from 'vitest'

import type { Container, ItemInstance } from '../types'

const makeItem = (definitionId: string, overrides?: Partial<ItemInstance>): ItemInstance => ({
  uid: crypto.randomUUID(),
  definitionId,
  gridX: 0,
  gridY: 0,
  ...overrides,
})

describe('checkCombine', () => {
  it('detects recipe when items are in different containers', () => {
    const state = createTestState()

    // clover in another container (target)
    const otherContainer: Container = {
      id: 'other-1',
      name: 'other #1',
      width: 5,
      height: 5,
      items: [],
    }
    placeItem(otherContainer, 'clover', 0, 0)

    // bee dragged from backpack onto the other grid at (0,0)
    const bee = makeItem('bee')

    const result = checkCombine(
      otherContainer,
      bee,
      0,
      0,
      state.backpack.id, // source: backpack
      otherContainer.id, // target: other container
      state.discoveredRecipes
    )

    expect(result.kind).toBe('recipe')
    if (result.kind === 'recipe') {
      expect(result.recipe.resultName).toBe('prairie')
    }
  })

  it('detects recipe in same container', () => {
    const state = createTestState()
    // place clover in backpack at (0,0) - it's 1x1
    placeItem(state.backpack, 'clover', 0, 0)

    // drag bee from backpack onto (0,0) overlapping the clover
    const bee = makeItem('bee')

    const result = checkCombine(
      state.backpack,
      bee,
      0,
      0,
      state.backpack.id,
      state.backpack.id,
      state.discoveredRecipes
    )

    expect(result.kind).toBe('recipe')
  })

  it('returns no-recipe for incompatible items', () => {
    const state = createTestState()
    // place a meteorite in the backpack at (0,0)
    placeItem(state.backpack, 'meteorite', 0, 0)

    // drag another meteorite onto it
    const meteorite2 = makeItem('meteorite')

    const result = checkCombine(
      state.backpack,
      meteorite2,
      0,
      0,
      state.backpack.id,
      state.backpack.id,
      state.discoveredRecipes
    )

    expect(result.kind).toBe('no-recipe')
  })
})

describe('combineBeeAndClover', () => {
  it('returns true and plants clover on dirt tiles in 3x3 area', () => {
    const state = createTestState()
    placeItem(state.backpack, 'bee', 0, 0)
    placeItem(state.backpack, 'clover', 1, 0)
    clearAroundPlayer(state, 1)

    const result = combineBeeAndClover(state)

    expect(result).toBe(true)

    const px = state.player.x
    const py = state.player.y
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        expect(state.map[py + dy][px + dx].type).toBe(TileType.Clover)
      }
    }
  })

  it('returns false when standing on sand', () => {
    const state = createTestState()
    placeItem(state.backpack, 'bee', 0, 0)
    placeItem(state.backpack, 'clover', 1, 0)
    state.map[state.player.y][state.player.x] = { type: TileType.Sand }
    const result = combineBeeAndClover(state)
    expect(result).toBe(false)
    // Items should not be consumed
    expect(containerHasItem(state.backpack, 'bee')).toBe(true)
    expect(containerHasItem(state.backpack, 'clover')).toBe(true)
  })

  it('does not plant clover on sand tiles', () => {
    const state = createTestState()
    placeItem(state.backpack, 'bee', 0, 0)
    placeItem(state.backpack, 'clover', 1, 0)
    clearAroundPlayer(state, 1)
    const px = state.player.x
    const py = state.player.y

    state.map[py][px - 1] = { type: TileType.Sand }
    state.map[py + 1][px] = { type: TileType.Dirt }

    combineBeeAndClover(state)

    expect(state.map[py][px - 1].type).toBe(TileType.Sand)
    expect(state.map[py + 1][px].type).toBe(TileType.Clover)
  })

  it('removes one bee and one clover from backpack', () => {
    const state = createTestState()
    placeItem(state.backpack, 'bee', 0, 0)
    placeItem(state.backpack, 'bee', 1, 0)
    placeItem(state.backpack, 'clover', 2, 0)
    placeItem(state.backpack, 'clover', 3, 0)
    clearAroundPlayer(state, 1)
    combineBeeAndClover(state)
    expect(state.backpack.items.filter(i => i.definitionId === 'bee')).toHaveLength(1)
    expect(state.backpack.items.filter(i => i.definitionId === 'clover')).toHaveLength(1)
  })

  it('spawns a bee entity', () => {
    const state = createTestState()
    placeItem(state.backpack, 'bee', 0, 0)
    placeItem(state.backpack, 'clover', 1, 0)
    clearAroundPlayer(state, 1)
    combineBeeAndClover(state)
    const bees = getBeeEntities(state)
    expect(bees).toHaveLength(1)
    const beePos = state.world.getComponent(bees[0], ComponentType.Position)
    expect(beePos).toBeTruthy()
    expect(beePos?.x).toBe(state.player.x)
    expect(beePos?.y).toBe(state.player.y)
  })

  it('returns false if no bees in backpack', () => {
    const state = createTestState()
    placeItem(state.backpack, 'clover', 0, 0)
    const result = combineBeeAndClover(state)
    expect(result).toBe(false)
  })

  it('returns false if no clovers in backpack', () => {
    const state = createTestState()
    placeItem(state.backpack, 'bee', 0, 0)
    const result = combineBeeAndClover(state)
    expect(result).toBe(false)
  })

  it('returns true and plants clover on crater tiles', () => {
    const state = createTestState()
    placeItem(state.backpack, 'bee', 0, 0)
    placeItem(state.backpack, 'clover', 1, 0)
    clearAroundPlayer(state, 1)

    const px = state.player.x
    const py = state.player.y

    // Set player tile and all neighbors to Crater
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        state.map[py + dy][px + dx] = { type: TileType.Crater }
      }
    }

    const result = combineBeeAndClover(state)
    expect(result).toBe(true)

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        expect(state.map[py + dy][px + dx].type).toBe(TileType.Clover)
      }
    }
  })

  it('converts crater tiles in mixed 3x3 area', () => {
    const state = createTestState()
    placeItem(state.backpack, 'bee', 0, 0)
    placeItem(state.backpack, 'clover', 1, 0)
    clearAroundPlayer(state, 1)

    const px = state.player.x
    const py = state.player.y

    // Mix of crater and dirt — both should become clover
    state.map[py][px] = { type: TileType.Crater }
    state.map[py - 1][px] = { type: TileType.Crater }
    state.map[py][px + 1] = { type: TileType.Sand }

    const result = combineBeeAndClover(state)
    expect(result).toBe(true)

    expect(state.map[py][px].type).toBe(TileType.Clover)
    expect(state.map[py - 1][px].type).toBe(TileType.Clover)
    // Sand should remain unchanged
    expect(state.map[py][px + 1].type).toBe(TileType.Sand)
  })
})
