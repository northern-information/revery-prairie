import { combineIcon, findRecipe, recipeKey, RecipeKind, RECIPES } from '../recipes'
import { placeItem } from '../inventory'
import { Rotation, TileType } from '../types'
import { clearAroundPlayer, createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

import type { Recipe } from '../recipes'

describe('findRecipe', () => {
  it('finds bee+clover in natural order', () => {
    const recipe = findRecipe('bee', 'clover')
    expect(recipe).not.toBeNull()
    expect(recipe?.resultName).toBe('prairie')
  })

  it('finds bee+clover in reversed order', () => {
    const recipe = findRecipe('clover', 'bee')
    expect(recipe).not.toBeNull()
    expect(recipe?.resultName).toBe('prairie')
  })

  it('returns null for unknown pair', () => {
    expect(findRecipe('bee', 'dirt')).toBeNull()
  })

  it('returns null for matching ingredient paired with itself', () => {
    expect(findRecipe('bee', 'bee')).toBeNull()
  })
})

describe('recipeKey', () => {
  it('produces sorted key string', () => {
    const recipe = RECIPES[0]
    expect(recipeKey(recipe)).toBe('bee+clover')
  })

  it('produces the same key regardless of ingredient order', () => {
    const forward: Recipe = { ...RECIPES[0], ingredients: ['bee', 'clover'] }
    const reversed: Recipe = { ...RECIPES[0], ingredients: ['clover', 'bee'] }
    expect(recipeKey(forward)).toBe(recipeKey(reversed))
  })
})

describe('combineIcon', () => {
  it('returns ? when undiscovered', () => {
    expect(combineIcon(RECIPES[0], false)).toBe('?')
  })

  it('returns ! for discovered macro recipe', () => {
    expect(combineIcon(RECIPES[0], true)).toBe('!')
  })

  it('returns resultIcon for discovered craft recipe with icon', () => {
    const craftRecipe: Recipe = {
      ingredients: ['a', 'b'],
      kind: RecipeKind.Craft,
      resultName: 'test',
      resultIcon: 'X',
      description: 'test recipe',
      execute: () => true,
    }
    expect(combineIcon(craftRecipe, true)).toBe('X')
  })

  it('returns ! for discovered craft recipe without resultIcon', () => {
    const craftRecipe: Recipe = {
      ingredients: ['a', 'b'],
      kind: RecipeKind.Craft,
      resultName: 'test',
      description: 'test recipe',
      execute: () => true,
    }
    expect(combineIcon(craftRecipe, true)).toBe('!')
  })
})

describe('prairie recipe execute', () => {
  const prairieRecipe = RECIPES[0]

  it('plants clover in 3x3 area on dirt', () => {
    const state = createTestState()
    const px = state.player.x
    const py = state.player.y

    clearAroundPlayer(state, 1)

    const result = prairieRecipe.execute(state)
    expect(result).toBe(true)

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        expect(state.map[py + dy][px + dx].type).toBe(TileType.Clover)
      }
    }
  })

  it('spawns a bee at the player position', () => {
    const state = createTestState()
    const px = state.player.x
    const py = state.player.y

    clearAroundPlayer(state, 1)

    prairieRecipe.execute(state)
    expect(state.bees).toHaveLength(1)
    expect(state.bees[0].pos.x).toBe(px)
    expect(state.bees[0].pos.y).toBe(py)
  })

  it('returns false when standing on sand', () => {
    const state = createTestState()
    state.map[state.player.y][state.player.x] = { type: TileType.Sand }

    const result = prairieRecipe.execute(state)
    expect(result).toBe(false)
    expect(state.bees).toHaveLength(0)
  })

  it('returns false when standing on space', () => {
    const state = createTestState()
    state.map[state.player.y][state.player.x] = { type: TileType.Space }

    const result = prairieRecipe.execute(state)
    expect(result).toBe(false)
    expect(state.bees).toHaveLength(0)
  })

  it('does not overwrite sand tiles in the 3x3 area', () => {
    const state = createTestState()
    const px = state.player.x
    const py = state.player.y

    clearAroundPlayer(state, 1)
    state.map[py - 1][px - 1] = { type: TileType.Sand }

    prairieRecipe.execute(state)
    expect(state.map[py - 1][px - 1].type).toBe(TileType.Sand)
    expect(state.map[py][px].type).toBe(TileType.Clover)
  })

  it('does not overwrite CaveEntrance tiles in the 3x3 area', () => {
    const state = createTestState()
    const px = state.player.x
    const py = state.player.y

    clearAroundPlayer(state, 1)
    state.map[py - 1][px] = { type: TileType.CaveEntrance }

    prairieRecipe.execute(state)
    expect(state.map[py - 1][px].type).toBe(TileType.CaveEntrance)
    expect(state.map[py][px].type).toBe(TileType.Clover)
  })
})

describe('prairie recipe preview', () => {
  const prairieRecipe = RECIPES[0]
  const preview = prairieRecipe?.preview
  if (!preview) throw new Error('prairie recipe must have a preview function')

  it('returns tiles for valid dirt positions', () => {
    const state = createTestState()
    clearAroundPlayer(state, 1)

    const tiles = preview(state)
    expect(tiles).toHaveLength(9)
    for (const tile of tiles) {
      expect(tile.char).toBe('#')
      expect(tile.color).toBe('#ff69b4')
    }
  })

  it('returns tiles for clover positions', () => {
    const state = createTestState()
    const px = state.player.x
    const py = state.player.y

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        state.map[py + dy][px + dx] = { type: TileType.Clover }
      }
    }

    const tiles = preview(state)
    expect(tiles).toHaveLength(9)
  })

  it('skips sand tiles', () => {
    const state = createTestState()
    const px = state.player.x
    const py = state.player.y

    clearAroundPlayer(state, 1)
    state.map[py - 1][px - 1] = { type: TileType.Sand }

    const tiles = preview(state)
    expect(tiles).toHaveLength(8)
    const skippedPos = tiles.find(t => t.pos.x === px - 1 && t.pos.y === py - 1)
    expect(skippedPos).toBeUndefined()
  })

  it('skips CaveEntrance tiles', () => {
    const state = createTestState()
    const px = state.player.x
    const py = state.player.y

    clearAroundPlayer(state, 1)
    state.map[py - 1][px] = { type: TileType.CaveEntrance }

    const tiles = preview(state)
    expect(tiles).toHaveLength(8)
    const skippedPos = tiles.find(t => t.pos.x === px && t.pos.y === py - 1)
    expect(skippedPos).toBeUndefined()
  })

  it('skips space tiles', () => {
    const state = createTestState()
    const px = state.player.x
    const py = state.player.y

    clearAroundPlayer(state, 1)
    state.map[py][px + 1] = { type: TileType.Space }

    const tiles = preview(state)
    expect(tiles).toHaveLength(8)
    const skippedPos = tiles.find(t => t.pos.x === px + 1 && t.pos.y === py)
    expect(skippedPos).toBeUndefined()
  })
})

describe('omnibox recipe execute', () => {
  const omniboxRecipe = RECIPES.find(r => r.resultName === 'omnibox')
  if (!omniboxRecipe) throw new Error('omnibox recipe must exist')

  const fillBackpack = (state: ReturnType<typeof createTestState>) => {
    for (let y = 0; y < state.backpack.height; y++) {
      for (let x = 0; x < state.backpack.width; x++) {
        placeItem(state.backpack, 'bee', Rotation.R0, x, y)
      }
    }
  }

  it('returns false when backpack is full', () => {
    const state = createTestState()
    fillBackpack(state)

    const result = omniboxRecipe.execute(state)
    expect(result).toBe(false)
  })

  it('does not increment nextOmniboxNumber on failure', () => {
    const state = createTestState()
    fillBackpack(state)

    omniboxRecipe.execute(state)
    expect(state.nextOmniboxNumber).toBe(1)
  })

  it('does not register orphaned container on failure', () => {
    const state = createTestState()
    fillBackpack(state)

    omniboxRecipe.execute(state)
    expect(state.omniboxContainers.size).toBe(0)
  })

  it('creates omnibox and registers container on success', () => {
    const state = createTestState()

    const result = omniboxRecipe.execute(state)
    expect(result).toBe(true)

    const omniboxItem = state.backpack.items.find(i => i.definitionId === 'omnibox')
    expect(omniboxItem).toBeDefined()
    if (omniboxItem) {
      expect(state.omniboxContainers.has(omniboxItem.uid)).toBe(true)
    }
    expect(state.nextOmniboxNumber).toBe(2)
  })
})
