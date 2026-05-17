import { tickCoyote } from '../coyote'
import { ComponentType } from '../ecs/types'
import {
  commitBoxSelection,
  deselectAll,
  getControllableUnitAt,
  getControllableUnitsInRect,
  getSelectedUnitPositions,
  hasSelection,
  isControllableUnit,
  pruneSelection,
  selectUnit,
  selectUnits,
} from '../selection'
import { CoyoteMode } from '../types'
import { cleanupMoveOrderMarkers, clearAllUnitCommands, issueMoveCommand, tickUnitCommands } from '../unitCommands'
import { clearAroundPlayer, createCharacterTestEntity, createTestState } from './helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('selection', () => {
  describe('isControllableUnit', () => {
    it('returns true for coyote', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const eid = createCharacterTestEntity(state, 'coyote', state.player.x + 1, state.player.y, {
        behavior: { type: 'follow' },
      })
      expect(isControllableUnit(state, eid)).toBe(true)
    })

    it('returns true for gron', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const eid = createCharacterTestEntity(state, 'gron', state.player.x + 2, state.player.y, {
        aura: 'rain',
      })
      expect(isControllableUnit(state, eid)).toBe(true)
    })

    it('returns false for ghosts', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const eid = createCharacterTestEntity(state, 'ghost-1', state.player.x + 3, state.player.y, {
        behavior: { type: 'drift', moveChance: 0.15, freezeOnDialog: true },
      })
      expect(isControllableUnit(state, eid)).toBe(false)
    })
  })

  describe('getControllableUnitAt', () => {
    it('finds coyote at tile position', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const cx = state.player.x + 1
      const cy = state.player.y
      const eid = createCharacterTestEntity(state, 'coyote', cx, cy, {
        behavior: { type: 'follow' },
      })
      const found = getControllableUnitAt(state, { x: cx, y: cy })
      expect(found).toBe(eid)
    })

    it('returns null for empty tile', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const found = getControllableUnitAt(state, { x: state.player.x + 1, y: state.player.y })
      expect(found).toBeNull()
    })

    it('returns null for non-controllable character', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const cx = state.player.x + 1
      const cy = state.player.y
      createCharacterTestEntity(state, 'ghost-1', cx, cy, {
        behavior: { type: 'drift', moveChance: 0.15, freezeOnDialog: true },
      })
      const found = getControllableUnitAt(state, { x: cx, y: cy })
      expect(found).toBeNull()
    })
  })

  describe('getControllableUnitsInRect', () => {
    it('finds units within a rectangular area', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const coyoteEid = createCharacterTestEntity(state, 'coyote', state.player.x + 2, state.player.y, {
        behavior: { type: 'follow' },
      })
      const gronEid = createCharacterTestEntity(state, 'gron', state.player.x + 3, state.player.y, {
        aura: 'rain',
      })
      const found = getControllableUnitsInRect(
        state,
        { x: state.player.x + 1, y: state.player.y - 1 },
        { x: state.player.x + 5, y: state.player.y + 1 }
      )
      expect(found).toContain(coyoteEid)
      expect(found).toContain(gronEid)
      expect(found).toHaveLength(2)
    })

    it('excludes units outside the rectangle', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      createCharacterTestEntity(state, 'coyote', state.player.x + 8, state.player.y, {
        behavior: { type: 'follow' },
      })
      const found = getControllableUnitsInRect(
        state,
        { x: state.player.x, y: state.player.y },
        { x: state.player.x + 3, y: state.player.y + 3 }
      )
      expect(found).toHaveLength(0)
    })
  })

  describe('selectUnit / deselectAll', () => {
    it('selects a single unit', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const eid = createCharacterTestEntity(state, 'coyote', state.player.x + 1, state.player.y, {
        behavior: { type: 'follow' },
      })
      selectUnit(state, eid)
      expect(hasSelection(state)).toBe(true)
      expect(state.selectedUnits.has(eid)).toBe(true)
    })

    it('replaces previous selection', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const eid1 = createCharacterTestEntity(state, 'coyote', state.player.x + 1, state.player.y, {
        behavior: { type: 'follow' },
      })
      const eid2 = createCharacterTestEntity(state, 'gron', state.player.x + 2, state.player.y, {
        aura: 'rain',
      })
      selectUnit(state, eid1)
      selectUnit(state, eid2)
      expect(state.selectedUnits.size).toBe(1)
      expect(state.selectedUnits.has(eid2)).toBe(true)
      expect(state.selectedUnits.has(eid1)).toBe(false)
    })

    it('deselects all', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const eid = createCharacterTestEntity(state, 'coyote', state.player.x + 1, state.player.y, {
        behavior: { type: 'follow' },
      })
      selectUnit(state, eid)
      deselectAll(state)
      expect(hasSelection(state)).toBe(false)
    })
  })

  describe('selectUnits', () => {
    it('selects multiple units', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const eid1 = createCharacterTestEntity(state, 'coyote', state.player.x + 1, state.player.y, {
        behavior: { type: 'follow' },
      })
      const eid2 = createCharacterTestEntity(state, 'gron', state.player.x + 2, state.player.y, {
        aura: 'rain',
      })
      selectUnits(state, [eid1, eid2])
      expect(state.selectedUnits.size).toBe(2)
      expect(state.selectedUnits.has(eid1)).toBe(true)
      expect(state.selectedUnits.has(eid2)).toBe(true)
    })
  })

  describe('getSelectedUnitPositions', () => {
    it('returns positions of selected units', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const cx = state.player.x + 1
      const cy = state.player.y
      const eid = createCharacterTestEntity(state, 'coyote', cx, cy, {
        behavior: { type: 'follow' },
      })
      selectUnit(state, eid)
      const positions = getSelectedUnitPositions(state)
      expect(positions.size).toBe(1)
      expect(positions.get(`${String(cx)},${String(cy)}`)).toBe(eid)
    })
  })

  describe('pruneSelection', () => {
    it('removes dead entities from selection', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const eid = createCharacterTestEntity(state, 'coyote', state.player.x + 1, state.player.y, {
        behavior: { type: 'follow' },
      })
      selectUnit(state, eid)
      state.world.destroyEntity(eid)
      pruneSelection(state)
      expect(hasSelection(state)).toBe(false)
    })
  })
})

describe('unitCommands', () => {
  describe('issueMoveCommand', () => {
    it('queues move commands for selected units', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const cx = state.player.x + 2
      const cy = state.player.y
      const eid = createCharacterTestEntity(state, 'coyote', cx, cy, {
        behavior: { type: 'follow' },
      })
      selectUnit(state, eid)
      const target = { x: state.player.x + 5, y: state.player.y }
      issueMoveCommand(state, target)
      expect(state.unitCommands.has(eid)).toBe(true)
      const cmd = state.unitCommands.get(eid)
      expect(cmd).toBeTruthy()
      expect(cmd?.target).toEqual(target)
      expect(cmd?.path).toBeTruthy()
    })

    it('adds a move-order marker', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const eid = createCharacterTestEntity(state, 'coyote', state.player.x + 2, state.player.y, {
        behavior: { type: 'follow' },
      })
      selectUnit(state, eid)
      issueMoveCommand(state, { x: state.player.x + 5, y: state.player.y })
      expect(state.moveOrderMarkers).toHaveLength(1)
      expect(state.moveOrderMarkers[0].position).toEqual({ x: state.player.x + 5, y: state.player.y })
    })

    it('does nothing when no units selected', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      issueMoveCommand(state, { x: state.player.x + 5, y: state.player.y })
      expect(state.unitCommands.size).toBe(0)
      expect(state.moveOrderMarkers).toHaveLength(0)
    })

    it('does not issue command to non-walkable tile', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const eid = createCharacterTestEntity(state, 'coyote', state.player.x + 1, state.player.y, {
        behavior: { type: 'follow' },
      })
      selectUnit(state, eid)
      // Target a space tile (non-walkable)
      const spaceX = 0
      const spaceY = 0
      issueMoveCommand(state, { x: spaceX, y: spaceY })
      expect(state.unitCommands.size).toBe(0)
    })
  })

  describe('tickUnitCommands', () => {
    it('moves a unit one step along its path', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const startX = state.player.x + 2
      const startY = state.player.y
      const eid = createCharacterTestEntity(state, 'coyote', startX, startY, {
        behavior: { type: 'follow' },
      })
      selectUnit(state, eid)
      issueMoveCommand(state, { x: state.player.x + 5, y: state.player.y })
      tickUnitCommands(state)
      const pos = state.world.getComponent(eid, ComponentType.Position)
      expect(pos).toBeTruthy()
      // Should have moved at least one step toward target
      expect(pos?.x).not.toBe(startX)
    })

    it('clears command when unit reaches destination', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const targetX = state.player.x + 3
      const targetY = state.player.y
      const eid = createCharacterTestEntity(state, 'coyote', state.player.x + 2, state.player.y, {
        behavior: { type: 'follow' },
      })
      selectUnit(state, eid)
      issueMoveCommand(state, { x: targetX, y: targetY })
      // Tick enough times to reach (1 tile away)
      for (let i = 0; i < 10; i++) {
        tickUnitCommands(state)
      }
      const pos = state.world.getComponent(eid, ComponentType.Position)
      expect(pos?.x).toBe(targetX)
      expect(pos?.y).toBe(targetY)
      expect(state.unitCommands.has(eid)).toBe(false)
    })

    it('removes commands for dead entities', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const eid = createCharacterTestEntity(state, 'coyote', state.player.x + 2, state.player.y, {
        behavior: { type: 'follow' },
      })
      selectUnit(state, eid)
      issueMoveCommand(state, { x: state.player.x + 5, y: state.player.y })
      state.world.destroyEntity(eid)
      tickUnitCommands(state)
      expect(state.unitCommands.size).toBe(0)
    })
  })

  describe('clearAllUnitCommands', () => {
    it('removes all commands', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const eid = createCharacterTestEntity(state, 'coyote', state.player.x + 2, state.player.y, {
        behavior: { type: 'follow' },
      })
      selectUnit(state, eid)
      issueMoveCommand(state, { x: state.player.x + 5, y: state.player.y })
      clearAllUnitCommands(state)
      expect(state.unitCommands.size).toBe(0)
    })
  })

  describe('cleanupMoveOrderMarkers', () => {
    it('removes expired markers', () => {
      const state = createTestState()
      state.moveOrderMarkers = [{ position: { x: 10, y: 10 }, time: 0 }]
      cleanupMoveOrderMarkers(state, 1000)
      expect(state.moveOrderMarkers).toHaveLength(0)
    })

    it('keeps fresh markers', () => {
      const state = createTestState()
      state.moveOrderMarkers = [{ position: { x: 10, y: 10 }, time: 900 }]
      cleanupMoveOrderMarkers(state, 1000)
      expect(state.moveOrderMarkers).toHaveLength(1)
    })
  })
})

describe('coyote command override', () => {
  it('coyote skips autonomous behavior when it has a move command', () => {
    const state = createTestState()
    clearAroundPlayer(state, 10)
    const cx = state.player.x + 2
    const cy = state.player.y
    const eid = createCharacterTestEntity(state, 'coyote', cx, cy, {
      behavior: { type: 'follow' },
    })
    state.coyoteMode = CoyoteMode.Follow
    selectUnit(state, eid)
    const target = { x: state.player.x + 5, y: state.player.y }
    issueMoveCommand(state, target)

    const result = tickCoyote(state)
    // Coyote should have skipped follow behavior (no movement)
    const pos = state.world.getComponent(eid, ComponentType.Position)
    expect(pos?.x).toBe(cx)
    expect(pos?.y).toBe(cy)
    expect(result.pickedUp).toBeNull()
  })
})

describe('gron mobility', () => {
  it('gron can receive move commands', () => {
    const state = createTestState()
    clearAroundPlayer(state, 10)
    const gronX = state.player.x + 3
    const gronY = state.player.y
    const eid = createCharacterTestEntity(state, 'gron', gronX, gronY, {
      aura: 'rain',
    })
    selectUnit(state, eid)
    const target = { x: state.player.x + 6, y: state.player.y }
    issueMoveCommand(state, target)
    expect(state.unitCommands.has(eid)).toBe(true)
  })

  it('gron moves along path when ticked', () => {
    const state = createTestState()
    clearAroundPlayer(state, 10)
    const gronX = state.player.x + 3
    const eid = createCharacterTestEntity(state, 'gron', gronX, state.player.y, {
      aura: 'rain',
    })
    selectUnit(state, eid)
    issueMoveCommand(state, { x: state.player.x + 6, y: state.player.y })
    tickUnitCommands(state)
    const pos = state.world.getComponent(eid, ComponentType.Position)
    expect(pos?.x).not.toBe(gronX)
  })

  describe('player-not-mouse-selectable — player is not a selectable unit', () => {
    it('getControllableUnitAt returns null on the player tile', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      expect(getControllableUnitAt(state, { x: state.player.x, y: state.player.y })).toBeNull()
    })

    it('getControllableUnitsInRect excludes the player even when the rectangle covers it', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const { x, y } = state.player
      const eid = createCharacterTestEntity(state, 'coyote', x + 1, y, {
        behavior: { type: 'follow' },
      })
      const units = getControllableUnitsInRect(state, { x: x - 1, y: y - 1 }, { x: x + 1, y: y + 1 })
      expect(units).toEqual([eid])
    })

    it('commitBoxSelection with only NPC units sets selectedUnits to those units', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const eid = createCharacterTestEntity(state, 'coyote', state.player.x + 1, state.player.y, {
        behavior: { type: 'follow' },
      })
      commitBoxSelection(state, [eid])
      expect(state.selectedUnits.has(eid)).toBe(true)
      expect(state.selectedUnits.size).toBe(1)
    })

    it('commitBoxSelection with no units clears the selection', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const eid = createCharacterTestEntity(state, 'coyote', state.player.x + 1, state.player.y, {
        behavior: { type: 'follow' },
      })
      selectUnit(state, eid)
      commitBoxSelection(state, [])
      expect(state.selectedUnits.size).toBe(0)
    })

    it('deselectAll clears selectedUnits', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const eid = createCharacterTestEntity(state, 'coyote', state.player.x + 1, state.player.y, {
        behavior: { type: 'follow' },
      })
      selectUnit(state, eid)
      deselectAll(state)
      expect(state.selectedUnits.size).toBe(0)
    })

    it('hasSelection is false when no NPC units are selected', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      expect(hasSelection(state)).toBe(false)
    })

    it('hasSelection is true when at least one NPC unit is selected', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const eid = createCharacterTestEntity(state, 'coyote', state.player.x + 1, state.player.y, {
        behavior: { type: 'follow' },
      })
      selectUnit(state, eid)
      expect(hasSelection(state)).toBe(true)
    })

    it('selectUnits replaces the selection with the given NPC units only', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const eid = createCharacterTestEntity(state, 'coyote', state.player.x + 1, state.player.y, {
        behavior: { type: 'follow' },
      })
      selectUnits(state, [eid])
      expect(state.selectedUnits.has(eid)).toBe(true)
      expect(state.selectedUnits.size).toBe(1)
    })

    it('getSelectedUnitPositions never includes the player position', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const positions = getSelectedUnitPositions(state)
      expect(positions.size).toBe(0)
    })
  })

  describe('player-not-mouse-movable — issueMoveCommand never moves the player', () => {
    it('issueMoveCommand with no NPC selection does nothing', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const pathBefore = state.path
      issueMoveCommand(state, { x: state.player.x + 3, y: state.player.y })
      expect(state.path).toBe(pathBefore)
      expect(state.unitCommands.size).toBe(0)
    })

    it('issueMoveCommand with NPC selection issues a command but does NOT set state.path', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const eid = createCharacterTestEntity(state, 'coyote', state.player.x + 2, state.player.y, {
        behavior: { type: 'follow' },
      })
      selectUnit(state, eid)
      state.path = null
      issueMoveCommand(state, { x: state.player.x + 5, y: state.player.y })
      expect(state.path).toBeNull()
      expect(state.unitCommands.has(eid)).toBe(true)
    })

    it('issueMoveCommand on non-walkable target is a no-op even with NPC selection', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const eid = createCharacterTestEntity(state, 'coyote', state.player.x + 2, state.player.y, {
        behavior: { type: 'follow' },
      })
      selectUnit(state, eid)
      // space tile at (0,0)
      issueMoveCommand(state, { x: 0, y: 0 })
      expect(state.unitCommands.has(eid)).toBe(false)
    })
  })

  describe('drag-release-does-not-move-player', () => {
    it('commitBoxSelection over NPC units does not set state.path', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      state.path = null
      const eid = createCharacterTestEntity(state, 'coyote', state.player.x + 1, state.player.y, {
        behavior: { type: 'follow' },
      })
      commitBoxSelection(state, [eid])
      expect(state.path).toBeNull()
    })

    it('commitBoxSelection over the player tile with no NPC units clears selection and does not move', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      state.path = null
      // Rectangle would have covered the player, but the player is ignored;
      // no NPC units in rect, so selection is cleared.
      commitBoxSelection(state, [])
      expect(state.selectedUnits.size).toBe(0)
      expect(state.path).toBeNull()
    })
  })
})
