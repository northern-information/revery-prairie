import { describe, it, expect, vi, afterEach } from 'vitest'

import { ComponentType } from '../ecs/types'
import { CoyoteMode } from '../types'
import {
  commitBoxSelection,
  deselectAll,
  getControllableUnitAt,
  getControllableUnitsInRect,
  hasSelection,
  isControllableUnit,
  isPlayerInRect,
  pruneSelection,
  selectPlayer,
  selectUnit,
  selectUnits,
  getSelectedUnitPositions,
} from '../selection'
import { issueMoveCommand, tickUnitCommands, clearAllUnitCommands, cleanupMoveOrderMarkers } from '../unitCommands'
import { tickCoyote } from '../coyote'
import { clearAroundPlayer, createCharacterTestEntity, createTestState } from './helpers'

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
      state.moveOrderMarkers = [
        { position: { x: 10, y: 10 }, time: 0 },
      ]
      cleanupMoveOrderMarkers(state, 1000)
      expect(state.moveOrderMarkers).toHaveLength(0)
    })

    it('keeps fresh markers', () => {
      const state = createTestState()
      state.moveOrderMarkers = [
        { position: { x: 10, y: 10 }, time: 900 },
      ]
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

  describe('playerSelected — right-click movement and player selection', () => {
    it('selectPlayer sets playerSelected and clears NPC selection', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const eid = createCharacterTestEntity(state, 'coyote', state.player.x + 1, state.player.y, {
        behavior: { type: 'follow' },
      })
      selectUnit(state, eid)
      selectPlayer(state)
      expect(state.playerSelected).toBe(true)
      expect(state.selectedUnits.size).toBe(0)
    })

    it('selectUnit clears playerSelected', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const eid = createCharacterTestEntity(state, 'coyote', state.player.x + 1, state.player.y, {
        behavior: { type: 'follow' },
      })
      selectPlayer(state)
      selectUnit(state, eid)
      expect(state.playerSelected).toBe(false)
      expect(state.selectedUnits.has(eid)).toBe(true)
    })

    it('selectUnits clears playerSelected', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const eid = createCharacterTestEntity(state, 'coyote', state.player.x + 1, state.player.y, {
        behavior: { type: 'follow' },
      })
      selectPlayer(state)
      selectUnits(state, [eid])
      expect(state.playerSelected).toBe(false)
      expect(state.selectedUnits.has(eid)).toBe(true)
    })

    it('deselectAll clears playerSelected and selectedUnits', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const eid = createCharacterTestEntity(state, 'coyote', state.player.x + 1, state.player.y, {
        behavior: { type: 'follow' },
      })
      commitBoxSelection(state, [eid], true)
      expect(state.playerSelected).toBe(true)
      expect(state.selectedUnits.size).toBe(1)
      deselectAll(state)
      expect(state.playerSelected).toBe(false)
      expect(state.selectedUnits.size).toBe(0)
    })

    it('hasSelection is true when only playerSelected', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      selectPlayer(state)
      expect(hasSelection(state)).toBe(true)
    })

    it('isPlayerInRect returns true when player tile is inside rectangle', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const { x, y } = state.player
      expect(
        isPlayerInRect(state, { x: x - 1, y: y - 1 }, { x: x + 1, y: y + 1 })
      ).toBe(true)
    })

    it('isPlayerInRect returns false when player tile is outside rectangle', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const { x, y } = state.player
      expect(
        isPlayerInRect(state, { x: x + 2, y: y + 2 }, { x: x + 4, y: y + 4 })
      ).toBe(false)
    })

    it('commitBoxSelection with includePlayer=true sets playerSelected', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const eid = createCharacterTestEntity(state, 'coyote', state.player.x + 1, state.player.y, {
        behavior: { type: 'follow' },
      })
      commitBoxSelection(state, [eid], true)
      expect(state.playerSelected).toBe(true)
      expect(state.selectedUnits.has(eid)).toBe(true)
    })

    it('commitBoxSelection with no units and includePlayer=false clears everything', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const eid = createCharacterTestEntity(state, 'coyote', state.player.x + 1, state.player.y, {
        behavior: { type: 'follow' },
      })
      selectUnit(state, eid)
      commitBoxSelection(state, [], false)
      expect(state.playerSelected).toBe(false)
      expect(state.selectedUnits.size).toBe(0)
    })

    it('issueMoveCommand with only playerSelected routes player via state.path', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      selectPlayer(state)
      const target = { x: state.player.x + 4, y: state.player.y }
      issueMoveCommand(state, target)
      expect(state.path).not.toBeNull()
      expect(state.path?.length).toBeGreaterThan(0)
      expect(state.unitCommands.size).toBe(0)
    })

    it('issueMoveCommand routes player and NPC independently to same target', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const eid = createCharacterTestEntity(state, 'coyote', state.player.x + 2, state.player.y, {
        behavior: { type: 'follow' },
      })
      commitBoxSelection(state, [eid], true)
      const target = { x: state.player.x + 5, y: state.player.y }
      issueMoveCommand(state, target)
      expect(state.path).not.toBeNull()
      expect(state.unitCommands.has(eid)).toBe(true)
    })

    it('issueMoveCommand with only NPC selected does not set state.path', () => {
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

    it('issueMoveCommand with no selection and no playerSelected does nothing', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const pathBefore = state.path
      issueMoveCommand(state, { x: state.player.x + 3, y: state.player.y })
      expect(state.path).toBe(pathBefore)
      expect(state.unitCommands.size).toBe(0)
    })

    it('issueMoveCommand with playerSelected does not issue command on non-walkable tile', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      selectPlayer(state)
      const pathBefore = state.path
      // space tile at (0,0)
      issueMoveCommand(state, { x: 0, y: 0 })
      expect(state.path).toBe(pathBefore)
    })

    it('getSelectedUnitPositions does not include player (player highlight is handled separately)', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      selectPlayer(state)
      const positions = getSelectedUnitPositions(state)
      expect(positions.size).toBe(0)
    })
  })

  describe('regression: drag release does not move player', () => {
    it('commitBoxSelection does not set state.path (bug: previously left-click release fell through to move)', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      state.path = null
      const eid = createCharacterTestEntity(state, 'coyote', state.player.x + 1, state.player.y, {
        behavior: { type: 'follow' },
      })
      commitBoxSelection(state, [eid], false)
      expect(state.path).toBeNull()
    })

    it('commitBoxSelection over player tile selects player without setting state.path', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      state.path = null
      commitBoxSelection(state, [], true)
      expect(state.playerSelected).toBe(true)
      expect(state.path).toBeNull()
    })
  })
})
