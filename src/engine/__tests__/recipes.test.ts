import { combineIcon, findRecipe, recipeKey, RecipeKind, RECIPES } from '../recipes'
import { createGameState } from '../state'
import { TileType } from '../types'
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
    const state = createGameState('Test', 20, 20)
    const px = state.player.x
    const py = state.player.y

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        state.map[py + dy][px + dx] = { type: TileType.Dirt }
      }
    }

    const result = prairieRecipe.execute(state)
    expect(result).toBe(true)

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        expect(state.map[py + dy][px + dx].type).toBe(TileType.Clover)
      }
    }
  })

  it('spawns a bee at the player position', () => {
    const state = createGameState('Test', 20, 20)
    const px = state.player.x
    const py = state.player.y

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        state.map[py + dy][px + dx] = { type: TileType.Dirt }
      }
    }

    prairieRecipe.execute(state)
    expect(state.bees).toHaveLength(1)
    expect(state.bees[0].pos.x).toBe(px)
    expect(state.bees[0].pos.y).toBe(py)
  })

  it('returns false when standing on sand', () => {
    const state = createGameState('Test', 20, 20)
    state.map[state.player.y][state.player.x] = { type: TileType.Sand }

    const result = prairieRecipe.execute(state)
    expect(result).toBe(false)
    expect(state.bees).toHaveLength(0)
  })

  it('returns false when standing on space', () => {
    const state = createGameState('Test', 20, 20)
    state.map[state.player.y][state.player.x] = { type: TileType.Space }

    const result = prairieRecipe.execute(state)
    expect(result).toBe(false)
    expect(state.bees).toHaveLength(0)
  })

  it('does not overwrite sand tiles in the 3x3 area', () => {
    const state = createGameState('Test', 20, 20)
    const px = state.player.x
    const py = state.player.y

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        state.map[py + dy][px + dx] = { type: TileType.Dirt }
      }
    }
    state.map[py - 1][px - 1] = { type: TileType.Sand }

    prairieRecipe.execute(state)
    expect(state.map[py - 1][px - 1].type).toBe(TileType.Sand)
    expect(state.map[py][px].type).toBe(TileType.Clover)
  })
})

describe('prairie recipe preview', () => {
  const prairieRecipe = RECIPES[0]
  const preview = prairieRecipe?.preview
  if (!preview) throw new Error('prairie recipe must have a preview function')

  it('returns tiles for valid dirt positions', () => {
    const state = createGameState('Test', 20, 20)
    const px = state.player.x
    const py = state.player.y

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        state.map[py + dy][px + dx] = { type: TileType.Dirt }
      }
    }

    const tiles = preview(state)
    expect(tiles).toHaveLength(9)
    for (const tile of tiles) {
      expect(tile.char).toBe('#')
      expect(tile.color).toBe('#ff69b4')
    }
  })

  it('returns tiles for clover positions', () => {
    const state = createGameState('Test', 20, 20)
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
    const state = createGameState('Test', 20, 20)
    const px = state.player.x
    const py = state.player.y

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        state.map[py + dy][px + dx] = { type: TileType.Dirt }
      }
    }
    state.map[py - 1][px - 1] = { type: TileType.Sand }

    const tiles = preview(state)
    expect(tiles).toHaveLength(8)
    const skippedPos = tiles.find(t => t.pos.x === px - 1 && t.pos.y === py - 1)
    expect(skippedPos).toBeUndefined()
  })

  it('skips space tiles', () => {
    const state = createGameState('Test', 20, 20)
    const px = state.player.x
    const py = state.player.y

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        state.map[py + dy][px + dx] = { type: TileType.Dirt }
      }
    }
    state.map[py][px + 1] = { type: TileType.Space }

    const tiles = preview(state)
    expect(tiles).toHaveLength(8)
    const skippedPos = tiles.find(t => t.pos.x === px + 1 && t.pos.y === py)
    expect(skippedPos).toBeUndefined()
  })
})
