import {
  closeOmnibox,
  dropItem,
  grabOmnibox,
  groundOmniboxBlockedSet,
  pickUpGroundItems,
  movePlayer,
  openOmnibox,
  toggleFacingOmnibox,
  toggleOmnibox,
  updateFacingOmnibox,
} from '../actions'
import { OMNIBOX_HEIGHT, OMNIBOX_WIDTH } from '../constants'
import { createOmniboxContainer, findFitPosition, placeItem } from '../inventory'
import { findPath } from '../pathfinding'
import { Rotation, TileType } from '../types'
import { describe, expect, it } from 'vitest'

import { clearAroundPlayer, createTestState } from './helpers'

describe('createOmniboxContainer', () => {
  it('creates a 5x5 container registered in omniboxContainers', () => {
    const state = createTestState()
    const uid = 'test-uid-1'
    const container = createOmniboxContainer(state, uid)

    expect(container.width).toBe(OMNIBOX_WIDTH)
    expect(container.height).toBe(OMNIBOX_HEIGHT)
    expect(container.id).toBe(uid)
    expect(state.omniboxContainers.get(uid)).toBe(container)
  })

  it('increments numbering for each omnibox', () => {
    const state = createTestState()
    const c1 = createOmniboxContainer(state, 'uid-1')
    const c2 = createOmniboxContainer(state, 'uid-2')
    const c3 = createOmniboxContainer(state, 'uid-3')

    expect(c1.name).toBe('omnibox #1')
    expect(c2.name).toBe('omnibox #2')
    expect(c3.name).toBe('omnibox #3')
    expect(state.nextOmniboxNumber).toBe(4)
  })

  it('allows items to be placed inside', () => {
    const state = createTestState()
    const container = createOmniboxContainer(state, 'uid-1')
    const placed = placeItem(container, 'bee', Rotation.R0, 0, 0)

    expect(placed).not.toBeNull()
    expect(container.items).toHaveLength(1)
  })
})

describe('openOmnibox / closeOmnibox / toggleOmnibox', () => {
  it('opens an omnibox as the open container', () => {
    const state = createTestState()
    const uid = 'uid-1'
    createOmniboxContainer(state, uid)

    expect(openOmnibox(state, uid)).toBe(true)
    expect(state.openContainer).not.toBeNull()
    expect(state.openContainer?.id).toBe(uid)
  })

  it('does not open the same omnibox twice', () => {
    const state = createTestState()
    const uid = 'uid-1'
    createOmniboxContainer(state, uid)

    openOmnibox(state, uid)
    expect(openOmnibox(state, uid)).toBe(false)
    expect(state.openContainer?.id).toBe(uid)
  })

  it('closes the open omnibox', () => {
    const state = createTestState()
    const uid = 'uid-1'
    createOmniboxContainer(state, uid)
    openOmnibox(state, uid)

    closeOmnibox(state)
    expect(state.openContainer).toBeNull()
  })

  it('opening a new omnibox closes the previous one', () => {
    const state = createTestState()
    createOmniboxContainer(state, 'uid-1')
    createOmniboxContainer(state, 'uid-2')

    openOmnibox(state, 'uid-1')
    expect(state.openContainer?.id).toBe('uid-1')

    openOmnibox(state, 'uid-2')
    expect(state.openContainer?.id).toBe('uid-2')
  })

  it('toggleOmnibox opens a closed omnibox', () => {
    const state = createTestState()
    const uid = 'uid-1'
    createOmniboxContainer(state, uid)

    toggleOmnibox(state, uid)
    expect(state.openContainer?.id).toBe(uid)
  })

  it('toggleOmnibox closes an open omnibox', () => {
    const state = createTestState()
    const uid = 'uid-1'
    createOmniboxContainer(state, uid)
    openOmnibox(state, uid)

    toggleOmnibox(state, uid)
    expect(state.openContainer).toBeNull()
  })

  it('toggleOmnibox switches to a different omnibox', () => {
    const state = createTestState()
    createOmniboxContainer(state, 'uid-1')
    createOmniboxContainer(state, 'uid-2')
    openOmnibox(state, 'uid-1')

    toggleOmnibox(state, 'uid-2')
    expect(state.openContainer?.id).toBe('uid-2')
  })
})

describe('ground omnibox collision', () => {
  it('blocks movement onto a ground omnibox tile', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const uid = 'uid-1'
    createOmniboxContainer(state, uid)
    state.groundOmniboxes.push({ uid, pos: { x: state.player.x + 1, y: state.player.y } })

    const moved = movePlayer(state, 'right')
    expect(moved).toBe(false)
  })

  it('pathfinding routes around ground omniboxes', () => {
    const state = createTestState()
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
      { x: state.player.x + 2, y: state.player.y },
      blocked
    )

    expect(path).not.toBeNull()
    if (path) {
      const goesThrough = path.some(p => p.x === state.player.x + 1 && p.y === state.player.y)
      expect(goesThrough).toBe(false)
      expect(path.length).toBeGreaterThan(2)
    }
  })

  it('pathfinding rejects blocked destination', () => {
    const state = createTestState()
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

describe('facing omnibox', () => {
  it('updateFacingOmnibox sets position when facing a ground omnibox', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    createOmniboxContainer(state, 'uid-1')
    state.groundOmniboxes.push({ uid: 'uid-1', pos: { x: state.player.x + 1, y: state.player.y } })
    state.playerFacing = 'right'

    updateFacingOmnibox(state)

    expect(state.facingOmniboxPos).toEqual({ x: state.player.x + 1, y: state.player.y })
  })

  it('updateFacingOmnibox clears when no adjacent ground omnibox', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    createOmniboxContainer(state, 'uid-1')
    state.groundOmniboxes.push({ uid: 'uid-1', pos: { x: state.player.x + 5, y: state.player.y } })
    state.playerFacing = 'right'

    updateFacingOmnibox(state)

    expect(state.facingOmniboxPos).toBeNull()
  })

  it('updateFacingOmnibox falls back to adjacent omnibox when not facing one', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    createOmniboxContainer(state, 'uid-1')
    state.groundOmniboxes.push({ uid: 'uid-1', pos: { x: state.player.x + 1, y: state.player.y } })
    state.playerFacing = 'left'

    updateFacingOmnibox(state)

    expect(state.facingOmniboxPos).toEqual({ x: state.player.x + 1, y: state.player.y })
  })

  it('toggleFacingOmnibox opens the facing ground omnibox', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    createOmniboxContainer(state, 'uid-1')
    state.groundOmniboxes.push({ uid: 'uid-1', pos: { x: state.player.x + 1, y: state.player.y } })
    state.playerFacing = 'right'
    updateFacingOmnibox(state)

    expect(toggleFacingOmnibox(state)).toBe(true)
    expect(state.openContainer?.id).toBe('uid-1')
  })

  it('toggleFacingOmnibox closes an already open facing omnibox', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    createOmniboxContainer(state, 'uid-1')
    state.groundOmniboxes.push({ uid: 'uid-1', pos: { x: state.player.x + 1, y: state.player.y } })
    state.playerFacing = 'right'
    updateFacingOmnibox(state)
    openOmnibox(state, 'uid-1')

    expect(toggleFacingOmnibox(state)).toBe(true)
    expect(state.openContainer).toBeNull()
  })

  it('toggleFacingOmnibox returns false when not facing an omnibox', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    state.playerFacing = 'right'
    updateFacingOmnibox(state)

    expect(toggleFacingOmnibox(state)).toBe(false)
  })

  it('movePlayer updates facingOmniboxPos', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    createOmniboxContainer(state, 'uid-1')
    state.groundOmniboxes.push({ uid: 'uid-1', pos: { x: state.player.x + 2, y: state.player.y } })

    movePlayer(state, 'right')

    expect(state.playerFacing).toBe('right')
    expect(state.facingOmniboxPos).toEqual({ x: state.player.x + 1, y: state.player.y })
  })
})

describe('auto-close on walk-away', () => {
  it('closes ground omnibox when player walks away', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const uid = 'uid-1'
    createOmniboxContainer(state, uid)
    // Place omnibox 2 tiles to the right so moving right once puts us adjacent
    state.groundOmniboxes.push({ uid, pos: { x: state.player.x + 2, y: state.player.y } })

    // Walk right to be adjacent, then open
    movePlayer(state, 'right')
    pickUpGroundItems(state)
    openOmnibox(state, uid)
    expect(state.openContainer?.id).toBe(uid)

    // Walk left — now 2 tiles away, still adjacent (dx=1)
    // Actually we're back at start, dx=2, so it should close
    movePlayer(state, 'left')
    pickUpGroundItems(state)
    expect(state.openContainer).toBeNull()
  })

  it('does not close backpack omnibox when walking', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const uid = 'uid-1'
    createOmniboxContainer(state, uid)
    // Omnibox is in backpack, not on ground
    openOmnibox(state, uid)
    expect(state.openContainer?.id).toBe(uid)

    movePlayer(state, 'left')
    pickUpGroundItems(state)
    movePlayer(state, 'left')
    pickUpGroundItems(state)

    // Still open — it's a backpack omnibox
    expect(state.openContainer?.id).toBe(uid)
  })
})

describe('grabOmnibox', () => {
  it('picks up adjacent ground omnibox into backpack', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const uid = 'uid-1'
    createOmniboxContainer(state, uid)
    state.groundOmniboxes.push({ uid, pos: { x: state.player.x + 1, y: state.player.y } })

    const result = grabOmnibox(state)

    expect(result).toBe(uid)
    expect(state.groundOmniboxes).toHaveLength(0)
    expect(state.backpack.items.some(i => i.definitionId === 'omnibox' && i.uid === uid)).toBe(true)
  })

  it('keeps open container when grabbed', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const uid = 'uid-1'
    createOmniboxContainer(state, uid)
    state.groundOmniboxes.push({ uid, pos: { x: state.player.x + 1, y: state.player.y } })
    openOmnibox(state, uid)
    expect(state.openContainer?.id).toBe(uid)

    grabOmnibox(state)

    // Omnibox stays open — it's now in the backpack but still accessible
    expect(state.openContainer?.id).toBe(uid)
  })

  it('returns null when no adjacent ground omnibox', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const uid = 'uid-1'
    createOmniboxContainer(state, uid)
    state.groundOmniboxes.push({ uid, pos: { x: state.player.x + 3, y: state.player.y } })

    expect(grabOmnibox(state)).toBeNull()
    expect(state.groundOmniboxes).toHaveLength(1)
  })

  it('returns null when backpack is full', () => {
    const state = createTestState()
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
    const state = createTestState()
    clearAroundPlayer(state)
    const uid = 'uid-1'
    createOmniboxContainer(state, uid)
    state.groundOmniboxes.push({ uid, pos: { x: state.player.x + 1, y: state.player.y + 1 } })

    expect(grabOmnibox(state)).toBeNull()
  })
})

describe('no auto-open on drop', () => {
  it('dropping an omnibox does not auto-open it', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const uid = 'uid-1'
    createOmniboxContainer(state, uid)
    placeItem(state.backpack, 'omnibox', Rotation.R0, 0, 0)
    // Override uid to match the container
    const item = state.backpack.items[0]
    if (item) item.uid = uid

    dropItem(state, 'omnibox')

    expect(state.groundOmniboxes).toHaveLength(1)
    expect(state.openContainer).toBeNull()
  })
})

describe('nesting', () => {
  it('can place an omnibox inside another omnibox', () => {
    const state = createTestState()
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
