import { getBlockedPositions, movePlayer } from '../movement'
import { findPath } from '../pathfinding'
import { posKey } from '../position'
import { RECIPES } from '../recipes'
import { TileType } from '../types'
import { clearAroundPlayer, createTestState } from './helpers'
import { beforeEach, describe, expect, it } from 'vitest'

import type { GameState } from '../types'

const findPrairieRecipe = () => {
  const recipe = RECIPES.find(r => r.resultName === 'Prairie')
  if (!recipe) throw new Error('prairie recipe not found')
  return recipe
}

describe('water walkable', () => {
  describe('getBlockedPositions', () => {
    let state: GameState

    beforeEach(() => {
      state = createTestState()
      clearAroundPlayer(state, 3)
    })

    it('does not include pond tiles', () => {
      const key = posKey(state.player.x + 1, state.player.y)
      state.ponds.add(key)

      const blocked = getBlockedPositions(state)

      expect(blocked.has(key)).toBe(false)
    })

    it('does not include river tiles', () => {
      const key = posKey(state.player.x + 2, state.player.y)
      state.rivers.add(key)

      const blocked = getBlockedPositions(state)

      expect(blocked.has(key)).toBe(false)
    })

    it('still includes character-blocked tiles', () => {
      const blocked = getBlockedPositions(state)
      // Sanity: no characters placed, so set should not contain random pond key.
      expect(blocked.size).toBe(0)
    })
  })

  describe('movePlayer onto water', () => {
    it('succeeds when the target tile is a pond', () => {
      const state = createTestState()
      clearAroundPlayer(state, 3)
      const startX = state.player.x
      const startY = state.player.y
      state.ponds.add(posKey(startX + 1, startY))

      const result = movePlayer(state, 'right')

      expect(result).toBe(true)
      expect(state.player.x).toBe(startX + 1)
      expect(state.player.y).toBe(startY)
    })

    it('succeeds when the target tile is a river', () => {
      const state = createTestState()
      clearAroundPlayer(state, 3)
      const startX = state.player.x
      const startY = state.player.y
      state.rivers.add(posKey(startX + 1, startY))

      const result = movePlayer(state, 'right')

      expect(result).toBe(true)
      expect(state.player.x).toBe(startX + 1)
    })
  })

  describe('pathfinding through water', () => {
    it('routes a path straight across pond tiles when that is the shortest route', () => {
      const state = createTestState()
      clearAroundPlayer(state, 4)
      const startX = state.player.x
      const startY = state.player.y
      // Place a row of pond tiles between player and target
      for (let dx = 1; dx <= 3; dx++) {
        state.ponds.add(posKey(startX + dx, startY))
      }

      const path = findPath(
        state.map,
        state.mapWidth,
        state.mapHeight,
        { x: startX, y: startY },
        { x: startX + 4, y: startY }
      )

      expect(path).not.toBeNull()
      expect(path?.length).toBe(4)
      // Path must include each water tile on the direct line
      for (let dx = 1; dx <= 3; dx++) {
        expect(path?.some(p => p.x === startX + dx && p.y === startY)).toBe(true)
      }
    })
  })

  describe('prairie recipe (bee + clover)', () => {
    it('preview skips tiles that are water', () => {
      const state = createTestState()
      clearAroundPlayer(state, 2)
      const px = state.player.x
      const py = state.player.y
      state.ponds.add(posKey(px + 1, py))

      const recipe = findPrairieRecipe()
      const preview = recipe.preview ? recipe.preview(state) : []

      expect(preview.some(p => p.pos.x === px + 1 && p.pos.y === py)).toBe(false)
      // Non-water tiles in the 3x3 still previewable
      expect(preview.some(p => p.pos.x === px && p.pos.y === py)).toBe(true)
    })

    it('execute leaves water tiles unchanged but converts dirt tiles in the 3x3 stamp', () => {
      const state = createTestState()
      clearAroundPlayer(state, 2)
      const px = state.player.x
      const py = state.player.y
      const waterKey = posKey(px + 1, py)
      state.ponds.add(waterKey)

      const recipe = findPrairieRecipe()
      const result = recipe.execute(state)

      expect(result).toBe(true)
      expect(state.map[py][px + 1].type).toBe(TileType.Dirt)
      expect(state.ponds.has(waterKey)).toBe(true)
      // Adjacent non-water tile was converted to clover
      expect(state.map[py][px - 1].type).toBe(TileType.Flora)
    })

    it('execute returns false when the player stands on a water tile', () => {
      const state = createTestState()
      clearAroundPlayer(state, 2)
      const px = state.player.x
      const py = state.player.y
      state.ponds.add(posKey(px, py))

      const recipe = findPrairieRecipe()
      const result = recipe.execute(state)

      expect(result).toBe(false)
      // No tiles converted anywhere in the 3x3
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          expect(state.map[py + dy][px + dx].type).toBe(TileType.Dirt)
        }
      }
    })
  })

  // The harvest-adjacent-clover-from-water test was deleted with the
  // harvest mechanic in precis #1.
})
