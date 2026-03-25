import {
  advanceDialog,
  combineBeeAndClover,
  dropItem,
  getAdjacentCharacter,
  interactWithCharacter,
  movePlayer,
  pickUpGroundItems,
  tickBees,
  tickPath,
} from '../actions'
import { containerHasItem, placeItem } from '../inventory'
import { Rotation, TileType } from '../types'
import { clearArea, clearAroundPlayer, createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

describe('movePlayer', () => {
  it('moves the player up', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const startY = state.player.y
    expect(movePlayer(state, 'up')).toBe(true)
    expect(state.player.y).toBe(startY - 1)
  })

  it('moves the player down', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const startY = state.player.y
    expect(movePlayer(state, 'down')).toBe(true)
    expect(state.player.y).toBe(startY + 1)
  })

  it('moves the player left', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const startX = state.player.x
    expect(movePlayer(state, 'left')).toBe(true)
    expect(state.player.x).toBe(startX - 1)
  })

  it('moves the player right', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const startX = state.player.x
    expect(movePlayer(state, 'right')).toBe(true)
    expect(state.player.x).toBe(startX + 1)
  })

  it('does not move past the map edge', () => {
    const state = createTestState({ viewportWidth: 80, viewportHeight: 40 })
    state.player.x = 0
    state.player.y = 0
    expect(movePlayer(state, 'left')).toBe(false)
    expect(movePlayer(state, 'up')).toBe(false)
    expect(state.player.x).toBe(0)
    expect(state.player.y).toBe(0)
  })

  it('updates the camera after moving', () => {
    const state = createTestState({ viewportWidth: 10, viewportHeight: 10 })
    clearAroundPlayer(state)
    const camBefore = { ...state.camera }
    movePlayer(state, 'right')
    expect(state.camera.x).toBe(camBefore.x + 1)
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

describe('tickPath', () => {
  it('moves player one step along the path', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const startX = state.player.x
    const startY = state.player.y
    state.path = [
      { x: startX + 1, y: startY },
      { x: startX + 2, y: startY },
    ]

    const result = tickPath(state)
    expect(result).toBe(true)
    expect(state.player.x).toBe(startX + 1)
    expect(state.path).toEqual([{ x: startX + 2, y: startY }])
  })

  it('sets path to null when last step is consumed', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const startX = state.player.x
    const startY = state.player.y
    state.path = [{ x: startX + 1, y: startY }]

    const result = tickPath(state)
    expect(result).toBe(true)
    expect(state.player.x).toBe(startX + 1)
    expect(state.path).toBeNull()
  })

  it('returns false and does nothing when path is null', () => {
    const state = createTestState()
    state.path = null
    const startX = state.player.x
    expect(tickPath(state)).toBe(false)
    expect(state.player.x).toBe(startX)
    expect(state.path).toBeNull()
  })

  it('returns false and does nothing when path is empty', () => {
    const state = createTestState()
    state.path = []
    const startX = state.player.x
    expect(tickPath(state)).toBe(false)
    expect(state.player.x).toBe(startX)
    expect(state.path).toBeNull()
  })

  it('cancels path when next step is blocked by water', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const startX = state.player.x
    const startY = state.player.y
    // Place water at the next step
    state.map[startY][startX + 1] = { type: TileType.Space }
    state.path = [
      { x: startX + 1, y: startY },
      { x: startX + 2, y: startY },
    ]

    const result = tickPath(state)
    expect(result).toBe(false)
    expect(state.player.x).toBe(startX)
    expect(state.path).toBeNull()
  })

  it('cancels path when next step has invalid direction', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const startX = state.player.x
    const startY = state.player.y
    // Diagonal step — not a valid direction
    state.path = [{ x: startX + 1, y: startY + 1 }]

    const result = tickPath(state)
    expect(result).toBe(false)
    expect(state.player.x).toBe(startX)
    expect(state.player.y).toBe(startY)
    expect(state.path).toBeNull()
  })
})

describe('tickBees', () => {
  it('does nothing when there are no bees', () => {
    const state = createTestState()
    tickBees(state)
    expect(state.bees).toHaveLength(0)
  })

  it('keeps bees on clover tiles', () => {
    const state = createTestState()
    placeItem(state.backpack, 'bee', Rotation.R0, 0, 0)
    placeItem(state.backpack, 'clover', Rotation.R0, 1, 0)
    clearAroundPlayer(state, 1)
    combineBeeAndClover(state)

    for (let i = 0; i < 100; i++) {
      tickBees(state)
    }

    for (const bee of state.bees) {
      const tile = state.map[bee.pos.y][bee.pos.x]
      expect(tile.type).toBe(TileType.Clover)
    }
  })

  it('bee stays in place when surrounded by space tiles', () => {
    const state = createTestState({ viewportWidth: 80, viewportHeight: 40 })
    const bx = 50
    const by = 12
    state.map[by][bx] = { type: TileType.Clover }
    // Surround with space so bee has nowhere to go
    for (const d of [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
    ]) {
      state.map[by + d[1]][bx + d[0]] = { type: TileType.Space }
    }
    state.bees.push({ pos: { x: bx, y: by } })

    for (let i = 0; i < 50; i++) {
      tickBees(state)
    }

    expect(state.bees[0].pos.x).toBe(bx)
    expect(state.bees[0].pos.y).toBe(by)
  })

  it('bee wanders on walkable tiles when no clover nearby', () => {
    const state = createTestState()
    const bx = state.player.x + 5
    const by = state.player.y
    clearArea(state, bx, by, 2)
    state.bees.push({ pos: { x: bx, y: by } })

    // Run many ticks — bee should eventually move
    for (let i = 0; i < 200; i++) {
      tickBees(state)
    }

    const moved = state.bees[0].pos.x !== bx || state.bees[0].pos.y !== by
    expect(moved).toBe(true)
  })
})

describe('dropItem', () => {
  it('drops item to the north first', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    placeItem(state.backpack, 'clover', Rotation.R0, 0, 0)
    const result = dropItem(state, 'clover')
    expect(result).toBe(true)
    expect(state.groundItems).toHaveLength(1)
    expect(state.groundItems[0]?.pos.x).toBe(state.player.x)
    expect(state.groundItems[0]?.pos.y).toBe(state.player.y - 1)
    expect(containerHasItem(state.backpack, 'clover')).toBe(false)
  })

  it('skips occupied ground tiles', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    placeItem(state.backpack, 'clover', Rotation.R0, 0, 0)
    // Place a ground item to the north
    state.groundItems.push({
      definitionId: 'clover',
      pos: { x: state.player.x, y: state.player.y - 1 },
    })
    const result = dropItem(state, 'clover')
    expect(result).toBe(true)
    // Should drop NE since N is taken
    expect(state.groundItems[1]?.pos.x).toBe(state.player.x + 1)
    expect(state.groundItems[1]?.pos.y).toBe(state.player.y - 1)
  })

  it('drops under the player as last resort', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    placeItem(state.backpack, 'clover', Rotation.R0, 0, 0)
    // Fill all 8 surrounding tiles with ground items
    const deltas = [
      { x: 0, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: -1, y: 1 },
      { x: -1, y: 0 },
      { x: -1, y: -1 },
    ]
    for (const d of deltas) {
      state.groundItems.push({
        definitionId: 'clover',
        pos: { x: state.player.x + d.x, y: state.player.y + d.y },
      })
    }
    const result = dropItem(state, 'clover')
    expect(result).toBe(true)
    expect(state.groundItems[8]?.pos.x).toBe(state.player.x)
    expect(state.groundItems[8]?.pos.y).toBe(state.player.y)
  })

  it('returns false when all positions are occupied', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    placeItem(state.backpack, 'clover', Rotation.R0, 0, 0)
    const deltas = [
      { x: 0, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: -1, y: 1 },
      { x: -1, y: 0 },
      { x: -1, y: -1 },
      { x: 0, y: 0 },
    ]
    for (const d of deltas) {
      state.groundItems.push({
        definitionId: 'clover',
        pos: { x: state.player.x + d.x, y: state.player.y + d.y },
      })
    }
    const result = dropItem(state, 'clover')
    expect(result).toBe(false)
    expect(containerHasItem(state.backpack, 'clover')).toBe(true)
  })

  it('returns false when item is not in inventory', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const result = dropItem(state, 'nonexistent')
    expect(result).toBe(false)
  })

  it('skips Space tiles', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    placeItem(state.backpack, 'clover', Rotation.R0, 0, 0)
    state.map[state.player.y - 1][state.player.x] = { type: TileType.Space }
    const result = dropItem(state, 'clover')
    expect(result).toBe(true)
    expect(state.groundItems[0]?.pos.x).toBe(state.player.x + 1)
    expect(state.groundItems[0]?.pos.y).toBe(state.player.y - 1)
  })

  it('releases bee as world entity instead of ground item', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    placeItem(state.backpack, 'bee', Rotation.R0, 0, 0)
    const result = dropItem(state, 'bee')
    expect(result).toBe(true)
    expect(state.groundItems).toHaveLength(0)
    expect(state.bees).toHaveLength(1)
  })
})

describe('pickUpGroundItems', () => {
  it('picks up a ground item at the player position', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    state.groundItems.push({
      definitionId: 'clover',
      pos: { x: state.player.x, y: state.player.y },
    })
    pickUpGroundItems(state)
    expect(state.groundItems).toHaveLength(0)
    expect(containerHasItem(state.backpack, 'clover')).toBe(true)
  })

  it('auto-picks up when walking over a ground item', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    state.groundItems.push({
      definitionId: 'bee',
      pos: { x: state.player.x + 1, y: state.player.y },
    })

    movePlayer(state, 'right')
    pickUpGroundItems(state)
    expect(state.groundItems).toHaveLength(0)
    expect(containerHasItem(state.backpack, 'bee')).toBe(true)
  })

  it('does not pick up if backpack is full', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    // Fill the entire backpack
    state.backpack.items = []
    for (let y = 0; y < state.backpack.height; y++) {
      for (let x = 0; x < state.backpack.width; x++) {
        state.backpack.items.push({
          uid: crypto.randomUUID(),
          definitionId: 'bee',
          rotation: 0,
          gridX: x,
          gridY: y,
        })
      }
    }
    state.groundItems.push({
      definitionId: 'bee',
      pos: { x: state.player.x, y: state.player.y },
    })
    pickUpGroundItems(state)
    expect(state.groundItems).toHaveLength(1)
  })

  it('captures a bee at the player position', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    state.bees.push({ pos: { x: state.player.x, y: state.player.y } })
    const beeItemsBefore = state.backpack.items.filter(i => i.definitionId === 'bee').length
    const result = pickUpGroundItems(state)
    expect(state.bees).toHaveLength(0)
    expect(state.backpack.items.filter(i => i.definitionId === 'bee')).toHaveLength(beeItemsBefore + 1)
    expect(result.pickedUp).toContain('bee')
  })

  it('does not capture bee if backpack is full', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    state.backpack.items = []
    for (let y = 0; y < state.backpack.height; y++) {
      for (let x = 0; x < state.backpack.width; x++) {
        state.backpack.items.push({
          uid: crypto.randomUUID(),
          definitionId: 'clover',
          rotation: 0,
          gridX: x,
          gridY: y,
        })
      }
    }
    state.bees.push({ pos: { x: state.player.x, y: state.player.y } })
    pickUpGroundItems(state)
    expect(state.bees).toHaveLength(1)
  })
})

describe('movePlayer blocked by character', () => {
  it('cannot walk into a character tile', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    state.characters = [{ definitionId: 'gron', pos: { x: state.player.x + 1, y: state.player.y } }]
    const startX = state.player.x
    expect(movePlayer(state, 'right')).toBe(false)
    expect(state.player.x).toBe(startX)
  })
})

describe('getAdjacentCharacter', () => {
  it('finds a character to the right', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    state.characters = [{ definitionId: 'gron', pos: { x: state.player.x + 1, y: state.player.y } }]
    const char = getAdjacentCharacter(state)
    expect(char).not.toBeNull()
    expect(char?.definitionId).toBe('gron')
  })

  it('finds a character above', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    state.characters = [{ definitionId: 'gron', pos: { x: state.player.x, y: state.player.y - 1 } }]
    expect(getAdjacentCharacter(state)).not.toBeNull()
  })

  it('returns null when no character is adjacent', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    state.characters = [{ definitionId: 'gron', pos: { x: state.player.x + 5, y: state.player.y } }]
    expect(getAdjacentCharacter(state)).toBeNull()
  })

  it('does not detect diagonal characters', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    state.characters = [{ definitionId: 'gron', pos: { x: state.player.x + 1, y: state.player.y + 1 } }]
    expect(getAdjacentCharacter(state)).toBeNull()
  })
})

describe('interactWithCharacter', () => {
  it('sets activeDialog when adjacent to a character', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    state.characters = [{ definitionId: 'gron', pos: { x: state.player.x + 1, y: state.player.y } }]
    const result = interactWithCharacter(state)
    expect(result).toBe(true)
    expect(state.activeDialog).toEqual({ characterId: 'gron', lineIndex: 0 })
  })

  it('returns false when no character is adjacent', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    state.characters = []
    const result = interactWithCharacter(state)
    expect(result).toBe(false)
    expect(state.activeDialog).toBeNull()
  })
})

describe('advanceDialog', () => {
  it('increments lineIndex', () => {
    const state = createTestState()
    state.activeDialog = { characterId: 'gron', lineIndex: 0 }
    const result = advanceDialog(state)
    expect(result).toBe(true)
    expect(state.activeDialog?.lineIndex).toBe(1)
  })

  it('clears dialog on last line', () => {
    const state = createTestState()
    // Gron has 3 dialog lines — index 2 is the last
    state.activeDialog = { characterId: 'gron', lineIndex: 2 }
    const result = advanceDialog(state)
    expect(result).toBe(false)
    expect(state.activeDialog).toBeNull()
  })

  it('returns false when no dialog is active', () => {
    const state = createTestState()
    state.activeDialog = null
    const result = advanceDialog(state)
    expect(result).toBe(false)
  })
})
