import { movePlayer, tickPath } from '../movement'
import { placeItem } from '../inventory'
import { posKey } from '../position'
import { TileType, Zone } from '../types'
import { clearAroundPlayer, createCharacterTestEntity, createTestState } from './helpers'
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
    // Use a small viewport so the player quickly reaches the deadzone edge
    const state = createTestState({ viewportWidth: 10, viewportHeight: 10 })
    clearAroundPlayer(state)
    // Walk right until the camera pans (player crosses deadzone boundary)
    const camBefore = { ...state.camera }
    for (let i = 0; i < 10; i++) {
      movePlayer(state, 'right')
    }
    expect(state.camera.x).toBeGreaterThan(camBefore.x)
  })

  it('updates playerFacing even when move is blocked', () => {
    const state = createTestState({ viewportWidth: 80, viewportHeight: 40 })
    state.player.x = 0
    state.player.y = 0
    state.playerFacing = 'down'
    expect(movePlayer(state, 'left')).toBe(false)
    expect(state.playerFacing).toBe('left')
    expect(state.player.x).toBe(0)
  })

  it('updates facingEntityPos when blocked move faces an interactable', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    state.playerFacing = 'down'
    // Place a character to the right
    createCharacterTestEntity(state, 'gron', state.player.x + 1, state.player.y)
    // Try to move right — blocked by character, but should face it
    expect(movePlayer(state, 'right')).toBe(false)
    expect(state.playerFacing).toBe('right')
    expect(state.facingEntityPos).toEqual({ x: state.player.x + 1, y: state.player.y })
  })
})

describe('movePlayer blocked by character', () => {
  it('cannot walk into a character tile', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    createCharacterTestEntity(state, 'gron', state.player.x + 1, state.player.y)
    const startX = state.player.x
    expect(movePlayer(state, 'right')).toBe(false)
    expect(state.player.x).toBe(startX)
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

  it('cancels path when next step is blocked by space', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const startX = state.player.x
    const startY = state.player.y
    // Place space (void) at the next step
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

  it('cancels path when next step is more than 1 tile away on any axis', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const startX = state.player.x
    const startY = state.player.y
    // 2-tile jump — not a valid 1-step move in any direction
    state.path = [{ x: startX + 2, y: startY }]

    const result = tickPath(state)
    expect(result).toBe(false)
    expect(state.player.x).toBe(startX)
    expect(state.player.y).toBe(startY)
    expect(state.path).toBeNull()
  })

  it('walks a diagonal step (downRight) when path is one tile diagonal', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const startX = state.player.x
    const startY = state.player.y
    state.path = [{ x: startX + 1, y: startY + 1 }]

    const result = tickPath(state)
    expect(result).toBe(true)
    expect(state.player.x).toBe(startX + 1)
    expect(state.player.y).toBe(startY + 1)
  })

  it('walks entire chained path to completion', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const startX = state.player.x
    const startY = state.player.y
    // Simulate a chained path: right 2, then down 2
    state.path = [
      { x: startX + 1, y: startY },
      { x: startX + 2, y: startY },
      { x: startX + 2, y: startY + 1 },
      { x: startX + 2, y: startY + 2 },
    ]
    state.pathWaypoints = [
      { x: startX + 2, y: startY },
      { x: startX + 2, y: startY + 2 },
    ]

    while (state.path) {
      tickPath(state)
    }

    expect(state.player.x).toBe(startX + 2)
    expect(state.player.y).toBe(startY + 2)
    expect(state.path).toBeNull()
    expect(state.pathWaypoints).toEqual([])
  })

  it('fires pendingAction only after full chain is exhausted', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const startX = state.player.x
    const startY = state.player.y
    let actionFired = false
    state.path = [
      { x: startX + 1, y: startY },
      { x: startX + 2, y: startY },
    ]
    state.pathWaypoints = [{ x: startX + 2, y: startY }]
    state.pendingAction = () => {
      actionFired = true
    }

    // Walk first step — action should not fire yet
    tickPath(state)
    expect(actionFired).toBe(false)

    // Walk last step — action should fire
    tickPath(state)
    expect(actionFired).toBe(true)
    expect(state.path).toBeNull()
    expect(state.pathWaypoints).toEqual([])
  })

  it('clears pathWaypoints when path is blocked mid-chain', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const startX = state.player.x
    const startY = state.player.y
    // Block the second step
    state.map[startY][startX + 2] = { type: TileType.Space }
    state.path = [
      { x: startX + 1, y: startY },
      { x: startX + 2, y: startY },
      { x: startX + 3, y: startY },
    ]
    state.pathWaypoints = [
      { x: startX + 1, y: startY },
      { x: startX + 3, y: startY },
    ]

    // First step succeeds
    tickPath(state)
    expect(state.player.x).toBe(startX + 1)

    // Second step blocked — everything cancelled
    tickPath(state)
    expect(state.path).toBeNull()
    expect(state.pathWaypoints).toEqual([])
  })

  it('clears pathWaypoints when path completes naturally', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const startX = state.player.x
    const startY = state.player.y
    state.path = [{ x: startX + 1, y: startY }]
    state.pathWaypoints = [{ x: startX + 1, y: startY }]

    tickPath(state)
    expect(state.path).toBeNull()
    expect(state.pathWaypoints).toEqual([])
  })
})

describe('glinting zone walk-through', () => {
  const placeDullCoin = (state: ReturnType<typeof createTestState>) => {
    const placed = placeItem(state.backpack, 'coin', 0, 0)
    if (placed === null) throw new Error('expected coin placement to succeed')
    return placed
  }

  it('restores glint to dull coins when stepping on a glint zone tile', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const placed = placeDullCoin(state)
    expect(state.glintingCoins.has(placed.uid)).toBe(false)

    const targetX = state.player.x
    const targetY = state.player.y + 1
    state.glintZones.add(posKey(targetX, targetY))

    movePlayer(state, 'down')
    expect(state.glintingCoins.has(placed.uid)).toBe(true)
  })

  it('does not affect already-glinting coins', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const placed = placeDullCoin(state)
    state.glintingCoins.add(placed.uid)

    const targetX = state.player.x
    const targetY = state.player.y + 1
    state.glintZones.add(posKey(targetX, targetY))

    movePlayer(state, 'down')
    expect(state.glintingCoins.has(placed.uid)).toBe(true)
    expect(state.glintingCoins.size).toBe(1)
  })

  it('does not restore glint in cave zone', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const placed = placeDullCoin(state)

    state.currentZone = Zone.Cave
    const targetX = state.player.x
    const targetY = state.player.y + 1
    state.glintZones.add(posKey(targetX, targetY))
    state.map[targetY][targetX] = { type: TileType.CaveFloor }

    movePlayer(state, 'down')
    expect(state.glintingCoins.has(placed.uid)).toBe(false)
  })

  it('records event:glint-zone discovery on first walk-through', () => {
    const state = createTestState()
    clearAroundPlayer(state)

    const targetX = state.player.x
    const targetY = state.player.y + 1
    state.glintZones.add(posKey(targetX, targetY))

    expect(state.manualDiscoveries.has('event:glint-zone')).toBe(false)
    movePlayer(state, 'down')
    expect(state.manualDiscoveries.has('event:glint-zone')).toBe(true)
  })
})
