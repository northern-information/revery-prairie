import { ComponentType } from '../ecs/types'
import { combineIcon, findRecipe, recipeKey, RecipeKind, RECIPES } from '../recipes'
import { TileType } from '../types'
import { clearAroundPlayer, createTestState, getBeeEntities } from './helpers'
import { describe, expect, it } from 'vitest'

import type { Recipe } from '../recipes'

describe('findRecipe', () => {
  it('finds bee+clover in natural order', () => {
    const recipe = findRecipe('bee', 'clover')
    expect(recipe).not.toBeNull()
    expect(recipe?.resultName).toBe('Prairie')
  })

  it('finds bee+clover in reversed order', () => {
    const recipe = findRecipe('clover', 'bee')
    expect(recipe).not.toBeNull()
    expect(recipe?.resultName).toBe('Prairie')
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
      execute: () => true,
    }
    expect(combineIcon(craftRecipe, true)).toBe('X')
  })

  it('returns ! for discovered craft recipe without resultIcon', () => {
    const craftRecipe: Recipe = {
      ingredients: ['a', 'b'],
      kind: RecipeKind.Craft,
      resultName: 'test',
      execute: () => true,
    }
    expect(combineIcon(craftRecipe, true)).toBe('!')
  })
})

describe('prairie recipe execute', () => {
  const prairieRecipe = RECIPES[0]

  // RP-17 — bee+clover is a ceremonial radial wave, not a 3x3
  // stamp. execute() places ONE clover at the player position and
  // enqueues a WaveEmission; the radial expansion happens over
  // subsequent tickFloraWaves calls.

  it('places a single clover seed at the player position on dirt', () => {
    const state = createTestState()
    const px = state.player.x
    const py = state.player.y

    clearAroundPlayer(state, 1)

    const result = prairieRecipe.execute(state)
    expect(result).toBe(true)
    expect(state.map[py][px].type).toBe(TileType.Flora)
  })

  it('does not immediately paint neighboring tiles (wave handles them later)', () => {
    const state = createTestState()
    const px = state.player.x
    const py = state.player.y

    clearAroundPlayer(state, 1)

    prairieRecipe.execute(state)

    // Exactly one Flora tile in the immediate 3x3 — the player tile.
    let floraCount = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (state.map[py + dy][px + dx].type === TileType.Flora) floraCount++
      }
    }
    expect(floraCount).toBe(1)
  })

  it('enqueues exactly one WaveEmission centered at the player', () => {
    const state = createTestState()
    const px = state.player.x
    const py = state.player.y

    clearAroundPlayer(state, 1)
    expect(state.activeWaves).toHaveLength(0)

    prairieRecipe.execute(state)
    expect(state.activeWaves).toHaveLength(1)
    expect(state.activeWaves[0].cx).toBe(px)
    expect(state.activeWaves[0].cy).toBe(py)
    expect(state.activeWaves[0].currentRadius).toBe(0)
    expect(state.activeWaves[0].seedIdentity.length).toBeGreaterThan(0)
  })

  it('spawns a bee at the player position', () => {
    const state = createTestState()
    const px = state.player.x
    const py = state.player.y

    clearAroundPlayer(state, 1)

    prairieRecipe.execute(state)
    const bees = getBeeEntities(state)
    expect(bees).toHaveLength(1)
    const beePos = state.world.getComponent(bees[0], ComponentType.Position)
    expect(beePos).toBeTruthy()
    expect(beePos?.x).toBe(px)
    expect(beePos?.y).toBe(py)
  })

  it('returns false when standing on sand', () => {
    const state = createTestState()
    state.map[state.player.y][state.player.x] = { type: TileType.Sand }

    const result = prairieRecipe.execute(state)
    expect(result).toBe(false)
    expect(getBeeEntities(state)).toHaveLength(0)
    expect(state.activeWaves).toHaveLength(0)
  })

  it('returns false when standing on space', () => {
    const state = createTestState()
    state.map[state.player.y][state.player.x] = { type: TileType.Space }

    const result = prairieRecipe.execute(state)
    expect(result).toBe(false)
    expect(getBeeEntities(state)).toHaveLength(0)
    expect(state.activeWaves).toHaveLength(0)
  })
})

describe('prairie recipe preview', () => {
  const prairieRecipe = RECIPES[0]
  const preview = prairieRecipe?.preview
  if (!preview) throw new Error('prairie recipe must have a preview function')

  // RP-17 — preview shows the single seed tile at the player;
  // the radial wave isn't previewed because it unfolds over several
  // seconds.

  it('returns the single seed tile at the player on dirt', () => {
    const state = createTestState()
    clearAroundPlayer(state, 1)

    const tiles = preview(state)
    expect(tiles).toHaveLength(1)
    expect(tiles[0].pos.x).toBe(state.player.x)
    expect(tiles[0].pos.y).toBe(state.player.y)
    expect(tiles[0].char).toBe('#')
    expect(tiles[0].color).toBe('#ff69b4')
  })

  it('returns the seed tile when player stands on existing clover', () => {
    const state = createTestState()
    const px = state.player.x
    const py = state.player.y

    state.map[py][px] = { type: TileType.Flora }

    const tiles = preview(state)
    expect(tiles).toHaveLength(1)
    expect(tiles[0].pos.x).toBe(px)
    expect(tiles[0].pos.y).toBe(py)
  })

  it('returns empty when player stands on sand', () => {
    const state = createTestState()
    state.map[state.player.y][state.player.x] = { type: TileType.Sand }

    const tiles = preview(state)
    expect(tiles).toHaveLength(0)
  })

  it('returns empty when player stands on space', () => {
    const state = createTestState()
    state.map[state.player.y][state.player.x] = { type: TileType.Space }

    const tiles = preview(state)
    expect(tiles).toHaveLength(0)
  })
})
