import { computePlacementPreview, executeCombine } from '../drag'
import { placeItem } from '../inventory'
import { recipeKey, RECIPES } from '../recipes'
import { clearAroundPlayer, createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

import type { Container, ItemInstance } from '../types'

const makeItem = (definitionId: string, overrides?: Partial<ItemInstance>): ItemInstance => ({
  uid: crypto.randomUUID(),
  definitionId,
  gridX: 0,
  gridY: 0,
  ...overrides,
})

/** Asserts value is defined and returns it with a narrowed type. */
const defined = <T>(value: T | undefined | null): T => {
  expect(value).toBeDefined()
  expect(value).not.toBeNull()
  return value as T
}

const prairieRecipe = defined(RECIPES.find(r => r.resultName === 'Prairie'))

describe('computePlacementPreview', () => {
  it('returns valid placement on empty space', () => {
    const state = createTestState()
    const item = makeItem('meteorite')

    const result = computePlacementPreview(
      state.backpack,
      item,
      0,
      0,
      state.backpack.id,
      state.backpack.id,
      state.discoveredRecipes
    )

    expect(result.isValid).toBe(true)
    expect(result.combineTarget).toBeNull()
    expect(result.cannotCombine).toBe(false)
  })

  it('detects recipe when overlapping a compatible item', () => {
    const state = createTestState()
    placeItem(state.backpack, 'clover', 0, 0)
    const bee = makeItem('bee')

    const result = computePlacementPreview(
      state.backpack,
      bee,
      0,
      0,
      state.backpack.id,
      state.backpack.id,
      state.discoveredRecipes
    )

    expect(result.isValid).toBe(false)
    expect(result.combineTarget).not.toBeNull()
    expect(result.combineTarget?.recipe.resultName).toBe('Prairie')
    expect(result.cannotCombine).toBe(false)
  })

  it('returns cannotCombine for incompatible items', () => {
    const state = createTestState()
    placeItem(state.backpack, 'meteorite', 0, 0)
    const meteorite2 = makeItem('meteorite')

    const result = computePlacementPreview(
      state.backpack,
      meteorite2,
      0,
      0,
      state.backpack.id,
      state.backpack.id,
      state.discoveredRecipes
    )

    expect(result.isValid).toBe(false)
    expect(result.cannotCombine).toBe(true)
    expect(result.combineTarget).toBeNull()
  })

  it('excludes dragged item from occupancy in same-container drag', () => {
    const state = createTestState()
    placeItem(state.backpack, 'meteorite', 0, 0)
    const placed = defined(state.backpack.items[0])

    const result = computePlacementPreview(
      state.backpack,
      placed,
      0,
      0,
      state.backpack.id,
      state.backpack.id,
      state.discoveredRecipes
    )

    // Same item at same position in same container — should be valid (excludes self)
    expect(result.isValid).toBe(true)
  })
})

describe('executeCombine', () => {
  it('executes recipe successfully and marks as discovered', () => {
    const state = createTestState()
    clearAroundPlayer(state, 1)
    placeItem(state.backpack, 'bee', 0, 0)
    placeItem(state.backpack, 'clover', 1, 0)
    const bee = defined(state.backpack.items.find(i => i.definitionId === 'bee'))
    const clover = defined(state.backpack.items.find(i => i.definitionId === 'clover'))

    const result = executeCombine(state, state.backpack, state.backpack, bee, {
      uid: clover.uid,
      recipe: prairieRecipe,
    })

    expect(result.outcome).toBe('success')
    expect(state.discoveredRecipes.has(recipeKey(prairieRecipe))).toBe(true)
    // Both ingredients consumed
    expect(state.backpack.items.filter(i => i.definitionId === 'bee')).toHaveLength(0)
    expect(state.backpack.items.filter(i => i.definitionId === 'clover')).toHaveLength(0)
  })

  it('returns failed when recipe execution fails', () => {
    const state = createTestState()
    const bee = makeItem('bee')
    const clover = makeItem('clover')
    // Put items in backpack so removeItem has something to work with
    state.backpack.items.push(bee, clover)

    const failRecipe = {
      ...prairieRecipe,
      execute: () => false,
    }

    const result = executeCombine(state, state.backpack, state.backpack, bee, {
      uid: clover.uid,
      recipe: failRecipe,
    })

    expect(result.outcome).toBe('failed')
    // Items should not be consumed
    expect(state.backpack.items).toHaveLength(2)
  })

  it('works across different containers', () => {
    const state = createTestState()
    clearAroundPlayer(state, 1)

    const otherContainer: Container = {
      id: 'other-1',
      name: 'other #1',
      width: 5,
      height: 5,
      items: [],
    }
    state.openContainer = otherContainer

    placeItem(state.backpack, 'bee', 0, 0)
    placeItem(otherContainer, 'clover', 0, 0)
    const bee = defined(state.backpack.items.find(i => i.definitionId === 'bee'))
    const clover = defined(otherContainer.items.find(i => i.definitionId === 'clover'))

    const result = executeCombine(state, state.backpack, otherContainer, bee, {
      uid: clover.uid,
      recipe: prairieRecipe,
    })

    expect(result.outcome).toBe('success')
    expect(state.backpack.items.filter(i => i.definitionId === 'bee')).toHaveLength(0)
    expect(otherContainer.items.filter(i => i.definitionId === 'clover')).toHaveLength(0)
  })
})
