import { dropItem, pickUpGroundItems, tickBees } from '../entities'
import { combineBeeAndClover } from '../combine'
import { movePlayer } from '../movement'
import { containerHasItem, placeItem } from '../inventory'
import { Rotation, TileType } from '../types'
import { clearArea, clearAroundPlayer, createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

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
