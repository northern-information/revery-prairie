import {
  computePlacementPreview,
  computeRotation,
  executeCombine,
  executeStoreInOmnibox,
  isOmniboxSelfDrop,
  NEXT_ROTATION,
} from '../drag'
import { createOmniboxContainer, placeItem } from '../inventory'
import { recipeKey, RECIPES } from '../recipes'
import { Rotation } from '../types'
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

/** Asserts value is defined and returns it with a narrowed type. */
const defined = <T>(value: T | undefined | null): T => {
  expect(value).toBeDefined()
  expect(value).not.toBeNull()
  return value as T
}

const prairieRecipe = defined(RECIPES.find((r) => r.resultName === 'prairie'))
const omniboxRecipe = defined(RECIPES.find((r) => r.resultName === 'omnibox'))

describe('NEXT_ROTATION', () => {
  it('cycles through all four rotations', () => {
    expect(NEXT_ROTATION[Rotation.R0]).toBe(Rotation.R90)
    expect(NEXT_ROTATION[Rotation.R90]).toBe(Rotation.R180)
    expect(NEXT_ROTATION[Rotation.R180]).toBe(Rotation.R270)
    expect(NEXT_ROTATION[Rotation.R270]).toBe(Rotation.R0)
  })
})

describe('isOmniboxSelfDrop', () => {
  it('returns true when dropping omnibox into its own container', () => {
    const item = makeItem('omnibox', { uid: 'omni-1' })
    expect(isOmniboxSelfDrop(item, 'omni-1')).toBe(true)
  })

  it('returns false when definitionId is not omnibox', () => {
    const item = makeItem('meteorite', { uid: 'omni-1' })
    expect(isOmniboxSelfDrop(item, 'omni-1')).toBe(false)
  })

  it('returns false when targetContainerId differs from uid', () => {
    const item = makeItem('omnibox', { uid: 'omni-1' })
    expect(isOmniboxSelfDrop(item, 'backpack')).toBe(false)
  })
})

describe('computePlacementPreview', () => {
  it('returns valid placement on empty space', () => {
    const state = createTestState()
    const item = makeItem('meteorite')

    const result = computePlacementPreview(
      state.backpack,
      item,
      Rotation.R0,
      0,
      0,
      state.backpack.id,
      state.backpack.id,
      state.discoveredRecipes,
    )

    expect(result.isValid).toBe(true)
    expect(result.combineTarget).toBeNull()
    expect(result.storeTarget).toBeNull()
    expect(result.cannotCombine).toBe(false)
  })

  it('detects recipe when overlapping a compatible item', () => {
    const state = createTestState()
    placeItem(state.backpack, 'permacomputer', Rotation.R0, 0, 0)
    const meteorite = makeItem('meteorite')

    const result = computePlacementPreview(
      state.backpack,
      meteorite,
      Rotation.R0,
      0,
      0,
      state.backpack.id,
      state.backpack.id,
      state.discoveredRecipes,
    )

    expect(result.isValid).toBe(false)
    expect(result.combineTarget).not.toBeNull()
    expect(result.combineTarget?.recipe.resultName).toBe('omnibox')
    expect(result.storeTarget).toBeNull()
    expect(result.cannotCombine).toBe(false)
  })

  it('detects store when overlapping an omnibox item', () => {
    const state = createTestState()
    placeItem(state.backpack, 'omnibox', Rotation.R0, 0, 0)
    const meteorite = makeItem('meteorite')

    const result = computePlacementPreview(
      state.backpack,
      meteorite,
      Rotation.R0,
      0,
      0,
      state.backpack.id,
      state.backpack.id,
      state.discoveredRecipes,
    )

    expect(result.isValid).toBe(false)
    expect(result.storeTarget).not.toBeNull()
    expect(result.combineTarget).toBeNull()
  })

  it('returns cannotCombine for incompatible items', () => {
    const state = createTestState()
    placeItem(state.backpack, 'meteorite', Rotation.R0, 0, 0)
    const meteorite2 = makeItem('meteorite')

    const result = computePlacementPreview(
      state.backpack,
      meteorite2,
      Rotation.R0,
      0,
      0,
      state.backpack.id,
      state.backpack.id,
      state.discoveredRecipes,
    )

    expect(result.isValid).toBe(false)
    expect(result.cannotCombine).toBe(true)
    expect(result.combineTarget).toBeNull()
    expect(result.storeTarget).toBeNull()
  })

  it('returns invalid for omnibox self-drop', () => {
    const state = createTestState()
    const omnibox = makeItem('omnibox', { uid: 'omni-1' })

    const container: Container = { id: 'omni-1', name: 'omnibox #1', width: 5, height: 5, items: [] }

    const result = computePlacementPreview(
      container,
      omnibox,
      Rotation.R0,
      0,
      0,
      state.backpack.id,
      'omni-1',
      state.discoveredRecipes,
    )

    expect(result.isValid).toBe(false)
  })

  it('excludes dragged item from occupancy in same-container drag', () => {
    const state = createTestState()
    placeItem(state.backpack, 'meteorite', Rotation.R0, 0, 0)
    const placed = defined(state.backpack.items[0])

    const result = computePlacementPreview(
      state.backpack,
      placed,
      Rotation.R0,
      0,
      0,
      state.backpack.id,
      state.backpack.id,
      state.discoveredRecipes,
    )

    // Same item at same position in same container — should be valid (excludes self)
    expect(result.isValid).toBe(true)
  })
})

describe('executeStoreInOmnibox', () => {
  it('stores item successfully', () => {
    const state = createTestState()
    placeItem(state.backpack, 'meteorite', Rotation.R0, 0, 0)
    const item = defined(state.backpack.items[0])
    const omniboxUid = 'omni-1'
    createOmniboxContainer(state, omniboxUid)

    const result = executeStoreInOmnibox(state.backpack, item, omniboxUid, state.omniboxContainers)

    expect(result.outcome).toBe('stored')
    expect(state.backpack.items).toHaveLength(0)
    const omniboxContainer = defined(state.omniboxContainers.get(omniboxUid))
    expect(omniboxContainer.items).toHaveLength(1)
  })

  it('returns no-room when omnibox is full', () => {
    const state = createTestState()
    placeItem(state.backpack, 'meteorite', Rotation.R0, 0, 0)
    const item = defined(state.backpack.items[0])
    const omniboxUid = 'omni-1'
    createOmniboxContainer(state, omniboxUid)
    const omniboxContainer = defined(state.omniboxContainers.get(omniboxUid))

    // Fill every cell with 1x1 items
    for (let y = 0; y < omniboxContainer.height; y++) {
      for (let x = 0; x < omniboxContainer.width; x++) {
        placeItem(omniboxContainer, 'clover', Rotation.R0, x, y)
      }
    }

    const result = executeStoreInOmnibox(state.backpack, item, omniboxUid, state.omniboxContainers)

    expect(result.outcome).toBe('no-room')
    // Source item should not have been removed
    expect(state.backpack.items).toHaveLength(1)
  })

  it('returns no-container when omnibox uid is missing', () => {
    const state = createTestState()
    placeItem(state.backpack, 'meteorite', Rotation.R0, 0, 0)
    const item = defined(state.backpack.items[0])

    const result = executeStoreInOmnibox(state.backpack, item, 'nonexistent', state.omniboxContainers)

    expect(result.outcome).toBe('no-container')
    expect(state.backpack.items).toHaveLength(1)
  })
})

describe('executeCombine', () => {
  it('executes recipe successfully and marks as discovered', () => {
    const state = createTestState()
    clearAroundPlayer(state, 1)
    placeItem(state.backpack, 'bee', Rotation.R0, 0, 0)
    placeItem(state.backpack, 'clover', Rotation.R0, 1, 0)
    const bee = defined(state.backpack.items.find((i) => i.definitionId === 'bee'))
    const clover = defined(state.backpack.items.find((i) => i.definitionId === 'clover'))

    const result = executeCombine(state, state.backpack, state.backpack, bee, {
      uid: clover.uid,
      recipe: prairieRecipe,
    })

    expect(result.outcome).toBe('success')
    expect(state.discoveredRecipes.has(recipeKey(prairieRecipe))).toBe(true)
    // Both ingredients consumed (no preserveIngredient on prairie recipe)
    expect(state.backpack.items.filter((i) => i.definitionId === 'bee')).toHaveLength(0)
    expect(state.backpack.items.filter((i) => i.definitionId === 'clover')).toHaveLength(0)
  })

  it('preserves ingredient when recipe specifies preserveIngredient', () => {
    const state = createTestState()
    placeItem(state.backpack, 'permacomputer', Rotation.R0, 0, 0)
    placeItem(state.backpack, 'meteorite', Rotation.R0, 2, 0)
    const permacomputer = defined(state.backpack.items.find((i) => i.definitionId === 'permacomputer'))
    const meteorite = defined(state.backpack.items.find((i) => i.definitionId === 'meteorite'))

    // Drag meteorite onto permacomputer
    const result = executeCombine(state, state.backpack, state.backpack, meteorite, {
      uid: permacomputer.uid,
      recipe: omniboxRecipe,
    })

    expect(result.outcome).toBe('success')
    // Permacomputer preserved, meteorite consumed
    expect(state.backpack.items.some((i) => i.definitionId === 'permacomputer')).toBe(true)
    expect(state.backpack.items.some((i) => i.definitionId === 'meteorite')).toBe(false)
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

    const omniboxContainer: Container = {
      id: 'omni-1',
      name: 'omnibox #1',
      width: 5,
      height: 5,
      items: [],
    }
    state.openContainer = omniboxContainer

    placeItem(state.backpack, 'bee', Rotation.R0, 0, 0)
    placeItem(omniboxContainer, 'clover', Rotation.R0, 0, 0)
    const bee = defined(state.backpack.items.find((i) => i.definitionId === 'bee'))
    const clover = defined(omniboxContainer.items.find((i) => i.definitionId === 'clover'))

    const result = executeCombine(state, state.backpack, omniboxContainer, bee, {
      uid: clover.uid,
      recipe: prairieRecipe,
    })

    expect(result.outcome).toBe('success')
    expect(state.backpack.items.filter((i) => i.definitionId === 'bee')).toHaveLength(0)
    expect(omniboxContainer.items.filter((i) => i.definitionId === 'clover')).toHaveLength(0)
  })
})

describe('computeRotation', () => {
  it('advances to next rotation', () => {
    const item = makeItem('meteorite')
    const state = createTestState()
    const result = computeRotation(state.backpack, item, Rotation.R0, 0, 0)
    expect(result.rotation).toBe(Rotation.R90)
  })

  it('clamps position when rotated shape exceeds container bounds', () => {
    // Permacomputer is 2x1, rotating to R90 makes it 1x2
    const item = makeItem('permacomputer')
    const smallContainer: Container = { id: 'small', name: 'small', width: 2, height: 1, items: [] }

    // At R0 it's 2x1 which fits in 2x1, at R90 it's 1x2 which needs height 2
    // previewY=0 should clamp to max(0, 1-2)=0 (already clamped)
    const result = computeRotation(smallContainer, item, Rotation.R0, 1, 0)
    expect(result.rotation).toBe(Rotation.R90)
    // But canPlace will fail because shape height (2) > container height (1)
    expect(result.isValid).toBe(false)
  })

  it('returns valid placement at clamped position', () => {
    const item = makeItem('permacomputer')
    const state = createTestState()

    // Place at far right of backpack, rotating should clamp leftward
    const result = computeRotation(state.backpack, item, Rotation.R0, state.backpack.width - 1, 0)
    expect(result.rotation).toBe(Rotation.R90)
    // 1x2 at R90 — previewX should clamp to fit
    expect(result.previewX).toBeLessThanOrEqual(state.backpack.width - 1)
    expect(result.isValid).toBe(true)
  })

  it('returns invalid with original position when container is null', () => {
    const item = makeItem('meteorite')
    const result = computeRotation(null, item, Rotation.R0, 3, 4)
    expect(result.rotation).toBe(Rotation.R90)
    expect(result.previewX).toBe(3)
    expect(result.previewY).toBe(4)
    expect(result.isValid).toBe(false)
  })
})
