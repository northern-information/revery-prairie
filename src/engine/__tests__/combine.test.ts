import { checkCombine, combineBeeAndClover } from '../combine'
import { containerHasItem, placeItem } from '../inventory'
import { Rotation, TileType } from '../types'
import { clearAroundPlayer, createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

import type { Container, ItemInstance } from '../types'

const makeItem = (definitionId: string, overrides?: Partial<ItemInstance>): ItemInstance => ({
  uid: crypto.randomUUID(),
  definitionId,
  rotation: Rotation.R0,
  gridX: 0,
  gridY: 0,
  ...overrides,
})

describe('checkCombine', () => {
  it('detects recipe when items are in different containers', () => {
    const state = createTestState()

    // permacomputer in an omnibox container (target)
    const omniboxContainer: Container = {
      id: 'omnibox-1',
      name: 'omnibox #1',
      width: 5,
      height: 5,
      items: [],
    }
    placeItem(omniboxContainer, 'permacomputer', Rotation.R0, 0, 0)

    // meteorite dragged from backpack onto the omnibox grid at (0,0)
    const meteorite = makeItem('meteorite')

    const result = checkCombine(
      omniboxContainer,
      meteorite,
      Rotation.R0,
      0,
      0,
      state.backpack.id, // source: backpack
      omniboxContainer.id, // target: omnibox
      state.discoveredRecipes
    )

    expect(result).not.toBeNull()
    expect(result).not.toBe('no-recipe')
    expect(typeof result === 'object' && result !== null && result.kind === 'recipe').toBe(true)
    if (typeof result === 'object' && result !== null && 'recipe' in result) {
      expect(result.recipe.resultName).toBe('omnibox')
    }
  })

  it('detects recipe in same container', () => {
    const state = createTestState()
    // place permacomputer in backpack at (0,0) - it's 2x1
    placeItem(state.backpack, 'permacomputer', Rotation.R0, 0, 0)

    // drag meteorite from backpack onto (0,0) overlapping the permacomputer
    const meteorite = makeItem('meteorite')

    const result = checkCombine(
      state.backpack,
      meteorite,
      Rotation.R0,
      0,
      0,
      state.backpack.id,
      state.backpack.id,
      state.discoveredRecipes
    )

    expect(result).not.toBeNull()
    expect(result).not.toBe('no-recipe')
    expect(typeof result === 'object' && result !== null && result.kind === 'recipe').toBe(true)
  })

  it('store takes priority over recipe for omnibox targets', () => {
    const state = createTestState()
    // place an omnibox item in the backpack at (0,0)
    placeItem(state.backpack, 'omnibox', Rotation.R0, 0, 0)

    // drag a meteorite onto the omnibox item
    const meteorite = makeItem('meteorite')

    const result = checkCombine(
      state.backpack,
      meteorite,
      Rotation.R0,
      0,
      0,
      state.backpack.id,
      state.backpack.id,
      state.discoveredRecipes
    )

    expect(result).not.toBeNull()
    expect(typeof result === 'object' && result !== null && result.kind === 'store').toBe(true)
  })

  it('returns no-recipe for incompatible items', () => {
    const state = createTestState()
    // place a meteorite in the backpack at (0,0)
    placeItem(state.backpack, 'meteorite', Rotation.R0, 0, 0)

    // drag another meteorite onto it
    const meteorite2 = makeItem('meteorite')

    const result = checkCombine(
      state.backpack,
      meteorite2,
      Rotation.R0,
      0,
      0,
      state.backpack.id,
      state.backpack.id,
      state.discoveredRecipes
    )

    expect(result).toBe('no-recipe')
  })
})

describe('combineBeeAndClover', () => {
  it('returns true and plants clover on dirt tiles in 3x3 area', () => {
    const state = createTestState()
    placeItem(state.backpack, 'bee', Rotation.R0, 0, 0)
    placeItem(state.backpack, 'clover', Rotation.R0, 1, 0)
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
    placeItem(state.backpack, 'bee', Rotation.R0, 0, 0)
    placeItem(state.backpack, 'clover', Rotation.R0, 1, 0)
    state.map[state.player.y][state.player.x] = { type: TileType.Sand }
    const result = combineBeeAndClover(state)
    expect(result).toBe(false)
    // Items should not be consumed
    expect(containerHasItem(state.backpack, 'bee')).toBe(true)
    expect(containerHasItem(state.backpack, 'clover')).toBe(true)
  })

  it('does not plant clover on sand tiles', () => {
    const state = createTestState()
    placeItem(state.backpack, 'bee', Rotation.R0, 0, 0)
    placeItem(state.backpack, 'clover', Rotation.R0, 1, 0)
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
    placeItem(state.backpack, 'bee', Rotation.R0, 0, 0)
    placeItem(state.backpack, 'bee', Rotation.R0, 1, 0)
    placeItem(state.backpack, 'clover', Rotation.R0, 2, 0)
    placeItem(state.backpack, 'clover', Rotation.R0, 3, 0)
    clearAroundPlayer(state, 1)
    combineBeeAndClover(state)
    expect(state.backpack.items.filter(i => i.definitionId === 'bee')).toHaveLength(1)
    expect(state.backpack.items.filter(i => i.definitionId === 'clover')).toHaveLength(1)
  })

  it('spawns a bee entity', () => {
    const state = createTestState()
    placeItem(state.backpack, 'bee', Rotation.R0, 0, 0)
    placeItem(state.backpack, 'clover', Rotation.R0, 1, 0)
    clearAroundPlayer(state, 1)
    combineBeeAndClover(state)
    expect(state.bees).toHaveLength(1)
    expect(state.bees[0].pos.x).toBe(state.player.x)
    expect(state.bees[0].pos.y).toBe(state.player.y)
  })

  it('returns false if no bees in backpack', () => {
    const state = createTestState()
    placeItem(state.backpack, 'clover', Rotation.R0, 0, 0)
    const result = combineBeeAndClover(state)
    expect(result).toBe(false)
  })

  it('returns false if no clovers in backpack', () => {
    const state = createTestState()
    placeItem(state.backpack, 'bee', Rotation.R0, 0, 0)
    const result = combineBeeAndClover(state)
    expect(result).toBe(false)
  })
})
