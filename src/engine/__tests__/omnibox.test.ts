import {
  closeOmnibox,
  grabOmnibox,
  groundOmniboxBlockedSet,
  movePlayer,
  openOmnibox,
  pickUpGroundItems,
} from '../actions'
import { OMNIBOX_HEIGHT, OMNIBOX_WIDTH } from '../constants'
import { createOmniboxContainer, findFitPosition, placeItem } from '../inventory'
import { findPath } from '../pathfinding'
import { createGameState } from '../state'
import { Rotation, TileType } from '../types'
import { describe, expect, it } from 'vitest'

import type { GameState } from '../types'

const clearAroundPlayer = (state: GameState) => {
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const ny = state.player.y + dy
      const nx = state.player.x + dx
      if (ny >= 0 && ny < state.mapHeight && nx >= 0 && nx < state.mapWidth) {
        state.map[ny][nx] = { type: TileType.Dirt }
      }
    }
  }
}

describe('createOmniboxContainer', () => {
  it('creates a 5x5 container registered in omniboxContainers', () => {
    const state = createGameState('Test', 20, 20)
    const uid = 'test-uid-1'
    const container = createOmniboxContainer(state, uid)

    expect(container.width).toBe(OMNIBOX_WIDTH)
    expect(container.height).toBe(OMNIBOX_HEIGHT)
    expect(container.id).toBe(uid)
    expect(state.omniboxContainers.get(uid)).toBe(container)
  })

  it('increments numbering for each omnibox', () => {
    const state = createGameState('Test', 20, 20)
    const c1 = createOmniboxContainer(state, 'uid-1')
    const c2 = createOmniboxContainer(state, 'uid-2')
    const c3 = createOmniboxContainer(state, 'uid-3')

    expect(c1.name).toBe('omnibox #1')
    expect(c2.name).toBe('omnibox #2')
    expect(c3.name).toBe('omnibox #3')
    expect(state.nextOmniboxNumber).toBe(4)
  })

  it('allows items to be placed inside', () => {
    const state = createGameState('Test', 20, 20)
    const container = createOmniboxContainer(state, 'uid-1')
    const placed = placeItem(container, 'bee', Rotation.R0, 0, 0)

    expect(placed).not.toBeNull()
    expect(container.items).toHaveLength(1)
  })
})

describe('openOmnibox / closeOmnibox', () => {
  it('opens an omnibox by adding to openContainers', () => {
    const state = createGameState('Test', 20, 20)
    const uid = 'uid-1'
    createOmniboxContainer(state, uid)

    expect(openOmnibox(state, uid)).toBe(true)
    expect(state.openContainers).toHaveLength(1)
    expect(state.openContainers[0].id).toBe(uid)
  })

  it('does not open the same omnibox twice', () => {
    const state = createGameState('Test', 20, 20)
    const uid = 'uid-1'
    createOmniboxContainer(state, uid)

    openOmnibox(state, uid)
    expect(openOmnibox(state, uid)).toBe(false)
    expect(state.openContainers).toHaveLength(1)
  })

  it('closes an omnibox by removing from openContainers', () => {
    const state = createGameState('Test', 20, 20)
    const uid = 'uid-1'
    createOmniboxContainer(state, uid)
    openOmnibox(state, uid)

    closeOmnibox(state, uid)
    expect(state.openContainers).toHaveLength(0)
  })

  it('supports multiple omniboxes open simultaneously', () => {
    const state = createGameState('Test', 20, 20)
    createOmniboxContainer(state, 'uid-1')
    createOmniboxContainer(state, 'uid-2')
    createOmniboxContainer(state, 'uid-3')

    openOmnibox(state, 'uid-1')
    openOmnibox(state, 'uid-2')
    openOmnibox(state, 'uid-3')

    expect(state.openContainers).toHaveLength(3)
  })
})

describe('ground omnibox collision', () => {
  it('blocks movement onto a ground omnibox tile', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    const uid = 'uid-1'
    createOmniboxContainer(state, uid)
    state.groundOmniboxes.push({ uid, pos: { x: state.player.x + 1, y: state.player.y } })

    const moved = movePlayer(state, 'right')
    expect(moved).toBe(false)
  })

  it('pathfinding routes around ground omniboxes', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    const uid = 'uid-1'
    createOmniboxContainer(state, uid)
    // Place omnibox directly between player and target
    state.groundOmniboxes.push({ uid, pos: { x: state.player.x + 1, y: state.player.y } })
    const blocked = groundOmniboxBlockedSet(state)

    const path = findPath(
      state.map,
      state.mapWidth,
      state.mapHeight,
      state.player,
      { x: state.player.x + 2, y: state.player.y },
      blocked
    )

    // Path should exist but route around
    expect(path).not.toBeNull()
    if (path) {
      const goesThrough = path.some(p => p.x === state.player.x + 1 && p.y === state.player.y)
      expect(goesThrough).toBe(false)
      expect(path.length).toBeGreaterThan(2)
    }
  })

  it('pathfinding rejects blocked destination', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    const uid = 'uid-1'
    createOmniboxContainer(state, uid)
    state.groundOmniboxes.push({ uid, pos: { x: state.player.x + 1, y: state.player.y } })
    const blocked = groundOmniboxBlockedSet(state)

    const path = findPath(
      state.map,
      state.mapWidth,
      state.mapHeight,
      state.player,
      { x: state.player.x + 1, y: state.player.y },
      blocked
    )

    expect(path).toBeNull()
  })
})

describe('ground omnibox adjacency', () => {
  it('auto-opens when player is adjacent', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    const uid = 'uid-1'
    createOmniboxContainer(state, uid)
    state.groundOmniboxes.push({ uid, pos: { x: state.player.x + 1, y: state.player.y } })

    const result = pickUpGroundItems(state)

    expect(result.pickedUp).not.toContain('omnibox')
    expect(state.groundOmniboxes).toHaveLength(1)
    expect(result.opened).toHaveLength(1)
    expect(state.openContainers).toHaveLength(1)
    expect(state.openContainers[0].id).toBe(uid)
  })

  it('does not open when player is far away', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    const uid = 'uid-1'
    createOmniboxContainer(state, uid)
    state.groundOmniboxes.push({ uid, pos: { x: state.player.x + 3, y: state.player.y } })

    const result = pickUpGroundItems(state)

    expect(result.opened).toHaveLength(0)
    expect(state.openContainers).toHaveLength(0)
  })

  it('does not re-open an already open omnibox', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    const uid = 'uid-1'
    createOmniboxContainer(state, uid)
    openOmnibox(state, uid)
    state.groundOmniboxes.push({ uid, pos: { x: state.player.x + 1, y: state.player.y } })

    const result = pickUpGroundItems(state)

    expect(result.opened).toHaveLength(0)
    expect(state.openContainers).toHaveLength(1)
  })

  it('auto-closes when player walks away', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    const uid = 'uid-1'
    createOmniboxContainer(state, uid)
    // Place omnibox to the right, open it
    state.groundOmniboxes.push({ uid, pos: { x: state.player.x + 1, y: state.player.y } })
    pickUpGroundItems(state)
    expect(state.openContainers).toHaveLength(1)

    // Walk away (left, then left again — now 3 tiles away)
    movePlayer(state, 'left')
    pickUpGroundItems(state)
    movePlayer(state, 'left')
    pickUpGroundItems(state)

    expect(state.openContainers).toHaveLength(0)
  })
})

describe('grabOmnibox', () => {
  it('picks up adjacent ground omnibox into backpack', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    const uid = 'uid-1'
    createOmniboxContainer(state, uid)
    state.groundOmniboxes.push({ uid, pos: { x: state.player.x + 1, y: state.player.y } })

    const result = grabOmnibox(state)

    expect(result).toBe(uid)
    expect(state.groundOmniboxes).toHaveLength(0)
    expect(state.backpack.items.some(i => i.definitionId === 'omnibox' && i.uid === uid)).toBe(true)
  })

  it('closes open container when grabbed', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    const uid = 'uid-1'
    createOmniboxContainer(state, uid)
    state.groundOmniboxes.push({ uid, pos: { x: state.player.x + 1, y: state.player.y } })
    openOmnibox(state, uid)
    expect(state.openContainers).toHaveLength(1)

    grabOmnibox(state)

    expect(state.openContainers).toHaveLength(0)
  })

  it('returns null when no adjacent ground omnibox', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    const uid = 'uid-1'
    createOmniboxContainer(state, uid)
    state.groundOmniboxes.push({ uid, pos: { x: state.player.x + 3, y: state.player.y } })

    expect(grabOmnibox(state)).toBeNull()
    expect(state.groundOmniboxes).toHaveLength(1)
  })

  it('returns null when backpack is full', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    const uid = 'uid-1'
    createOmniboxContainer(state, uid)
    state.groundOmniboxes.push({ uid, pos: { x: state.player.x + 1, y: state.player.y } })

    // Fill backpack
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

    expect(grabOmnibox(state)).toBeNull()
    expect(state.groundOmniboxes).toHaveLength(1)
  })

  it('only grabs cardinally adjacent (not diagonal)', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    const uid = 'uid-1'
    createOmniboxContainer(state, uid)
    state.groundOmniboxes.push({ uid, pos: { x: state.player.x + 1, y: state.player.y + 1 } })

    expect(grabOmnibox(state)).toBeNull()
  })
})

describe('drop auto-open', () => {
  it('dropping an omnibox to the ground opens its container', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    const uid = 'uid-1'
    const container = createOmniboxContainer(state, uid)

    // Simulate dropping: add to groundOmniboxes and open
    state.groundOmniboxes.push({ uid, pos: { x: state.player.x + 1, y: state.player.y } })
    if (!state.openContainers.includes(container)) {
      state.openContainers.push(container)
    }

    expect(state.openContainers).toHaveLength(1)
    expect(state.openContainers[0].id).toBe(uid)
  })

  it('does not duplicate open container if already open', () => {
    const state = createGameState('Test', 20, 20)
    clearAroundPlayer(state)
    const uid = 'uid-1'
    const container = createOmniboxContainer(state, uid)
    openOmnibox(state, uid)

    // Simulate drop logic: only push if not already open
    state.groundOmniboxes.push({ uid, pos: { x: state.player.x + 1, y: state.player.y } })
    if (!state.openContainers.includes(container)) {
      state.openContainers.push(container)
    }

    expect(state.openContainers).toHaveLength(1)
  })
})

describe('nesting', () => {
  it('can place an omnibox inside another omnibox', () => {
    const state = createGameState('Test', 20, 20)
    const outer = createOmniboxContainer(state, 'outer')
    createOmniboxContainer(state, 'inner')

    const fit = findFitPosition(outer, 'omnibox')
    expect(fit).not.toBeNull()

    if (fit) {
      const placed = placeItem(outer, 'omnibox', fit.rotation, fit.gridX, fit.gridY)
      expect(placed).not.toBeNull()
      expect(outer.items).toHaveLength(1)
    }
  })
})
