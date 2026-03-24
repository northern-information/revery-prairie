import { combineBeeAndClover, dropItem, movePlayer, pickUpGroundItems, tickBees, tickPath } from '../actions'
import { containerHasItem, findItemByDefinition, removeItem } from '../inventory'
import { createGameState } from '../state'
import { TileType } from '../types'
import { describe, expect, it } from 'vitest'

import type { GameState } from '../types'

// Ensure tiles around the player are dirt so movement tests aren't affected by random coastline
const clearAroundPlayer = (state: GameState) => {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const ny = state.player.y + dy
      const nx = state.player.x + dx
      if (ny >= 0 && ny < state.mapHeight && nx >= 0 && nx < state.mapWidth) {
        state.map[ny][nx] = { type: TileType.Dirt }
      }
    }
  }
}

describe('movePlayer', () => {
  it('moves the player up', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    const startY = state.player.y
    expect(movePlayer(state, 'up')).toBe(true)
    expect(state.player.y).toBe(startY - 1)
  })

  it('moves the player down', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    const startY = state.player.y
    expect(movePlayer(state, 'down')).toBe(true)
    expect(state.player.y).toBe(startY + 1)
  })

  it('moves the player left', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    const startX = state.player.x
    expect(movePlayer(state, 'left')).toBe(true)
    expect(state.player.x).toBe(startX - 1)
  })

  it('moves the player right', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    const startX = state.player.x
    expect(movePlayer(state, 'right')).toBe(true)
    expect(state.player.x).toBe(startX + 1)
  })

  it('does not move past the map edge', () => {
    const state = createGameState('Test', 80, 40)
    state.player.x = 0
    state.player.y = 0
    expect(movePlayer(state, 'left')).toBe(false)
    expect(movePlayer(state, 'up')).toBe(false)
    expect(state.player.x).toBe(0)
    expect(state.player.y).toBe(0)
  })

  it('updates the camera after moving', () => {
    const state = createGameState('Test', 10, 10)
    clearAroundPlayer(state)
    const camBefore = { ...state.camera }
    movePlayer(state, 'right')
    expect(state.camera.x).toBe(camBefore.x + 1)
  })
})

describe('combineBeeAndClover', () => {
  it('returns true and plants clover on dirt tiles in 3x3 area', () => {
    const state = createGameState('Test', 20, 20)
    const px = state.player.x
    const py = state.player.y

    // Ensure the 3x3 area around the player is all dirt
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        state.map[py + dy][px + dx] = { type: TileType.Dirt }
      }
    }

    const result = combineBeeAndClover(state)

    expect(result).toBe(true)

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        expect(state.map[py + dy][px + dx].type).toBe(TileType.Clover)
      }
    }
  })

  it('returns false when standing on sand', () => {
    const state = createGameState('Test', 20, 20)
    state.map[state.player.y][state.player.x] = { type: TileType.Sand }
    const result = combineBeeAndClover(state)
    expect(result).toBe(false)
    expect(state.backpack.items).toHaveLength(7)
  })

  it('does not plant clover on sand tiles', () => {
    const state = createGameState('Test', 20, 20)
    const px = state.player.x
    const py = state.player.y

    state.map[py][px - 1] = { type: TileType.Sand }
    state.map[py + 1][px] = { type: TileType.Dirt }

    combineBeeAndClover(state)

    expect(state.map[py][px - 1].type).toBe(TileType.Sand)
    expect(state.map[py + 1][px].type).toBe(TileType.Clover)
  })

  it('removes one bee and one clover from backpack', () => {
    const state = createGameState('Test', 80, 40)
    const beesBefore = state.backpack.items.filter(i => i.definitionId === 'bee').length
    const cloversBefore = state.backpack.items.filter(i => i.definitionId === 'clover').length
    combineBeeAndClover(state)
    const beesAfter = state.backpack.items.filter(i => i.definitionId === 'bee').length
    const cloversAfter = state.backpack.items.filter(i => i.definitionId === 'clover').length
    expect(beesAfter).toBe(beesBefore - 1)
    expect(cloversAfter).toBe(cloversBefore - 1)
  })

  it('spawns a bee entity', () => {
    const state = createGameState('Test', 80, 40)
    combineBeeAndClover(state)
    expect(state.bees).toHaveLength(1)
    expect(state.bees[0].pos.x).toBe(state.player.x)
    expect(state.bees[0].pos.y).toBe(state.player.y)
  })

  it('returns false if no bees in backpack', () => {
    const state = createGameState('Test', 80, 40)
    // Remove all bees
    const bees = state.backpack.items.filter(i => i.definitionId === 'bee')
    for (const bee of bees) {
      removeItem(state.backpack, bee.uid)
    }
    const result = combineBeeAndClover(state)
    expect(result).toBe(false)
  })

  it('returns false if no clovers in backpack', () => {
    const state = createGameState('Test', 80, 40)
    // Remove all clovers
    const clovers = state.backpack.items.filter(i => i.definitionId === 'clover')
    for (const clover of clovers) {
      removeItem(state.backpack, clover.uid)
    }
    const result = combineBeeAndClover(state)
    expect(result).toBe(false)
  })
})

describe('tickPath', () => {
  it('moves player one step along the path', () => {
    const state = createGameState('Test', 20, 20)
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
    const state = createGameState('Test', 20, 20)
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
    const state = createGameState('Test', 20, 20)
    state.path = null
    const startX = state.player.x
    expect(tickPath(state)).toBe(false)
    expect(state.player.x).toBe(startX)
    expect(state.path).toBeNull()
  })

  it('returns false and does nothing when path is empty', () => {
    const state = createGameState('Test', 20, 20)
    state.path = []
    const startX = state.player.x
    expect(tickPath(state)).toBe(false)
    expect(state.player.x).toBe(startX)
    expect(state.path).toBeNull()
  })

  it('cancels path when next step is blocked by water', () => {
    const state = createGameState('Test', 20, 20)
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
    const state = createGameState('Test', 20, 20)
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
    const state = createGameState('Test', 80, 40)
    tickBees(state)
    expect(state.bees).toHaveLength(0)
  })

  it('keeps bees on clover tiles', () => {
    const state = createGameState('Test', 20, 20)
    // Ensure 3x3 around player is dirt so clover can grow
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        state.map[state.player.y + dy][state.player.x + dx] = { type: TileType.Dirt }
      }
    }
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
    const state = createGameState('Test', 80, 40)
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
    const state = createGameState('Test', 20, 20)
    const bx = state.player.x + 5
    const by = state.player.y
    // Ensure area is dirt
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        state.map[by + dy][bx + dx] = { type: TileType.Dirt }
      }
    }
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
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    const cloversBefore = state.backpack.items.filter(i => i.definitionId === 'clover').length
    const result = dropItem(state, 'clover')
    expect(result).toBe(true)
    expect(state.groundItems).toHaveLength(1)
    expect(state.groundItems[0]?.pos.x).toBe(state.player.x)
    expect(state.groundItems[0]?.pos.y).toBe(state.player.y - 1)
    const cloversAfter = state.backpack.items.filter(i => i.definitionId === 'clover').length
    expect(cloversAfter).toBe(cloversBefore - 1)
  })

  it('skips occupied ground tiles', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
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
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
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
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
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
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    const result = dropItem(state, 'nonexistent')
    expect(result).toBe(false)
  })

  it('skips Space tiles', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    state.map[state.player.y - 1][state.player.x] = { type: TileType.Space }
    const result = dropItem(state, 'clover')
    expect(result).toBe(true)
    expect(state.groundItems[0]?.pos.x).toBe(state.player.x + 1)
    expect(state.groundItems[0]?.pos.y).toBe(state.player.y - 1)
  })

  it('releases bee as world entity instead of ground item', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    const beesBefore = state.bees.length
    const result = dropItem(state, 'bee')
    expect(result).toBe(true)
    expect(state.groundItems).toHaveLength(0)
    expect(state.bees).toHaveLength(beesBefore + 1)
  })
})

describe('pickUpGroundItems', () => {
  it('picks up a ground item at the player position', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    const cloversBefore = state.backpack.items.filter(i => i.definitionId === 'clover').length
    dropItem(state, 'clover')
    expect(state.backpack.items.filter(i => i.definitionId === 'clover')).toHaveLength(cloversBefore - 1)
    expect(state.groundItems).toHaveLength(1)
    const itemPos = { ...state.groundItems[0]?.pos }
    state.player.x = itemPos.x ?? 0
    state.player.y = itemPos.y ?? 0
    pickUpGroundItems(state)
    expect(state.groundItems).toHaveLength(0)
    expect(state.backpack.items.filter(i => i.definitionId === 'clover')).toHaveLength(cloversBefore)
  })

  it('auto-picks up when walking over a ground item', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    // Place a ground item one tile to the right
    state.groundItems.push({
      definitionId: 'bee',
      pos: { x: state.player.x + 1, y: state.player.y },
    })
    // Remove bee from backpack first so there's room and we can detect pickup
    const bee = findItemByDefinition(state.backpack, 'bee')
    if (bee) removeItem(state.backpack, bee.uid)

    movePlayer(state, 'right')
    pickUpGroundItems(state)
    expect(state.groundItems).toHaveLength(0)
    expect(containerHasItem(state.backpack, 'bee')).toBe(true)
  })

  it('does not pick up if backpack is full', () => {
    const state = createGameState('Test', 20, 20)
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
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    state.bees.push({ pos: { x: state.player.x, y: state.player.y } })
    const beeItemsBefore = state.backpack.items.filter(i => i.definitionId === 'bee').length
    const pickedUp = pickUpGroundItems(state)
    expect(state.bees).toHaveLength(0)
    expect(state.backpack.items.filter(i => i.definitionId === 'bee')).toHaveLength(beeItemsBefore + 1)
    expect(pickedUp).toContain('bee')
  })

  it('does not capture bee if backpack is full', () => {
    const state = createGameState('Test', 20, 20)
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
