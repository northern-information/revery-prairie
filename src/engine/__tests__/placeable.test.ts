import { ComponentType } from '../ecs/types'
import { takeInHand } from '../inHand'
import { findFitPosition, placeItem } from '../inventory'
import { canPlaceCameraAt, getPlaceableSpec, isPlaceable } from '../placeable'
import { clearAroundPlayer, createTestState, swapToOverworldForTest } from './helpers'
import { TileType } from '../types'
import { describe, expect, it } from 'vitest'

import type { GameState } from '../types'

const give = (state: GameState, defId: string): string => {
  const fit = findFitPosition(state.backpack, defId)
  if (!fit) throw new Error(`no backpack slot for ${defId}`)
  const item = placeItem(state.backpack, defId, fit.gridX, fit.gridY)
  if (!item) throw new Error(`placeItem failed for ${defId}`)
  return item.uid
}

const setup = (): GameState => {
  const state = createTestState()
  swapToOverworldForTest(state)
  clearAroundPlayer(state, 3)
  state.placedMeteorites = []
  state.placedCameras = []
  return state
}

describe('PlaceableSpec registry', () => {
  it('registers meteorite and camera, rejects non-placeables', () => {
    expect(isPlaceable('meteorite')).toBe(true)
    expect(isPlaceable('camera')).toBe(true)
    expect(isPlaceable('coin')).toBe(false)
    expect(getPlaceableSpec('meteorite')?.verb).toBe('place')
    expect(getPlaceableSpec('camera')?.verb).toBe('set up')
  })

  describe('meteorite', () => {
    it('place appends to placedMeteorites, removes the item, and advances the stack', () => {
      const state = setup()
      const first = give(state, 'meteorite')
      const second = give(state, 'meteorite')
      takeInHand(state, first)

      const tx = state.player.x + 1
      const ty = state.player.y
      getPlaceableSpec('meteorite')?.place(state, tx, ty, first)

      expect(state.placedMeteorites).toEqual([{ x: tx, y: ty }])
      expect(state.backpack.items.some(i => i.uid === first)).toBe(false)
      expect(state.equippedItemUid).toBe(second)
    })

    it('clears the hand after placing the last meteorite', () => {
      const state = setup()
      const only = give(state, 'meteorite')
      takeInHand(state, only)

      getPlaceableSpec('meteorite')?.place(state, state.player.x + 1, state.player.y, only)
      expect(state.equippedItemUid).toBeNull()
    })
  })

  describe('camera', () => {
    it('place pushes a placedCamera, removes the item, and clears the hand (unique artifact)', () => {
      const state = setup()
      const uid = give(state, 'camera')
      takeInHand(state, uid)

      const tx = state.player.x + 1
      const ty = state.player.y
      getPlaceableSpec('camera')?.place(state, tx, ty, uid)

      expect(state.placedCameras).toHaveLength(1)
      expect(state.placedCameras[0].uid).toBe(uid)
      expect(state.backpack.items.some(i => i.uid === uid)).toBe(false)
      expect(state.equippedItemUid).toBeNull()
      // A placedCamera-tagged entity is created as the renderer hook.
      const tagged = [...state.world.query(ComponentType.EntityTag)].filter(
        eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'placedCamera'
      )
      expect(tagged.length).toBeGreaterThanOrEqual(1)
    })

    it('canPlaceCameraAt rejects out-of-bounds, the player tile, and non-walkable tiles', () => {
      const state = setup()
      const { x, y } = state.player

      const uid = 'fresh-camera-uid'
      expect(canPlaceCameraAt(state, -1, y, uid)).toBe(false)
      expect(canPlaceCameraAt(state, x, y, uid)).toBe(false)

      state.map[y][x + 1] = { type: TileType.Space }
      expect(canPlaceCameraAt(state, x + 1, y, uid)).toBe(false)

      state.map[y][x + 2] = { type: TileType.Dirt }
      expect(canPlaceCameraAt(state, x + 2, y, uid)).toBe(true)
    })
  })
})
