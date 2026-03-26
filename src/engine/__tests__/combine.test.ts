import { checkCombine } from '../combine'
import { placeItem } from '../inventory'
import { Rotation } from '../types'
import { createTestState } from './helpers'
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
