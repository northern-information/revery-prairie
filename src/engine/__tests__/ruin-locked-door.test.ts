import { describe, expect, it } from 'vitest'

import { unlockRuinDoor } from '../interaction'
import { movePlayer } from '../movement'
import { TileType, Zone } from '../types'

import { createTestState } from './helpers'

import type { GameState } from '../types'

const setupRuinWithDoor = (state: GameState): { doorX: number; doorY: number } => {
  // Build a tiny ruin interior with a single locked door directly south of the player.
  const interiorMap: { type: TileType }[][] = Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => ({ type: TileType.RuinFloor as TileType })),
  )
  const doorX = 5
  const doorY = 6
  interiorMap[doorY][doorX] = { type: TileType.RuinDoorLocked }
  state.map = interiorMap
  state.mapWidth = 10
  state.mapHeight = 10
  state.player = { x: 5, y: 5 }
  state.playerFacing = 'down'
  state.currentZone = Zone.Ruin
  state.currentRuinIndex = 0
  return { doorX, doorY }
}

const addAqueductKey = (state: GameState, count = 1): void => {
  for (let i = 0; i < count; i++) {
    state.backpack.items.push({
      uid: `key-${String(i)}-${String(performance.now())}-${String(Math.random())}`,
      definitionId: 'aqueductKey',
      gridX: i,
      gridY: 0,
    })
  }
}

describe('ruin locked door', () => {
  it('blocks movement through the door tile', () => {
    const state = createTestState()
    const { doorX, doorY } = setupRuinWithDoor(state)
    movePlayer(state, 'down')
    // Player must not have moved onto the door tile
    expect(state.player.x === doorX && state.player.y === doorY).toBe(false)
  })

  it('[e] without key is a no-op', () => {
    const state = createTestState()
    const { doorX, doorY } = setupRuinWithDoor(state)
    expect(state.backpack.items.find(i => i.definitionId === 'aqueductKey')).toBeUndefined()
    const opened = unlockRuinDoor(state)
    expect(opened).toBe(false)
    expect(state.map[doorY][doorX].type).toBe(TileType.RuinDoorLocked)
    expect(state.backpack.items).toHaveLength(0)
  })

  it('[e] with key consumes one and opens the door', () => {
    const state = createTestState()
    const { doorX, doorY } = setupRuinWithDoor(state)
    addAqueductKey(state, 1)
    const opened = unlockRuinDoor(state)
    expect(opened).toBe(true)
    expect(state.map[doorY][doorX].type).toBe(TileType.RuinDoorOpen)
    expect(state.backpack.items.some(i => i.definitionId === 'aqueductKey')).toBe(false)
  })

  it('with multiple keys, exactly one is consumed', () => {
    const state = createTestState()
    setupRuinWithDoor(state)
    addAqueductKey(state, 2)
    const beforeCount = state.backpack.items.filter(i => i.definitionId === 'aqueductKey').length
    expect(beforeCount).toBe(2)
    const opened = unlockRuinDoor(state)
    expect(opened).toBe(true)
    const afterCount = state.backpack.items.filter(i => i.definitionId === 'aqueductKey').length
    expect(afterCount).toBe(1)
  })

  it('re-press on an open door is a no-op', () => {
    const state = createTestState()
    const { doorX, doorY } = setupRuinWithDoor(state)
    addAqueductKey(state, 2)
    expect(unlockRuinDoor(state)).toBe(true)
    expect(state.map[doorY][doorX].type).toBe(TileType.RuinDoorOpen)
    const beforeCount = state.backpack.items.filter(i => i.definitionId === 'aqueductKey').length
    expect(unlockRuinDoor(state)).toBe(false)
    const afterCount = state.backpack.items.filter(i => i.definitionId === 'aqueductKey').length
    expect(afterCount).toBe(beforeCount)
  })

  it('does not unlock when not in a ruin zone', () => {
    const state = createTestState()
    const { doorX, doorY } = setupRuinWithDoor(state)
    state.currentZone = Zone.Overworld
    addAqueductKey(state, 1)
    const opened = unlockRuinDoor(state)
    expect(opened).toBe(false)
    expect(state.map[doorY][doorX].type).toBe(TileType.RuinDoorLocked)
    expect(state.backpack.items).toHaveLength(1)
  })

  it('clears action bar slot referencing the consumed last key', () => {
    const state = createTestState()
    setupRuinWithDoor(state)
    addAqueductKey(state, 1)
    state.actionBar[0] = {
      kind: 'item',
      id: 'aqueductKey',
      cooldownEndTime: 0,
      cooldownDurationMs: 0,
    }
    const opened = unlockRuinDoor(state)
    expect(opened).toBe(true)
    expect(state.actionBar[0]).toBeNull()
  })
})
