import { CHARACTER_DEFINITIONS, getCharacterDefinition, getCharacterDialog } from '../characters'
import {
  getAdjacentCharacter,
  isFacingLockedDoor,
  isInteractableAt,
  openLockedGateDialog,
  unlockRuinDoor,
} from '../interaction'
import { MANUAL_ENTRIES } from '../manual'
import { movePlayer } from '../movement'
import { TileType, Zone } from '../types'
import { createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

import type { GameState, Position, RuinInterior } from '../types'

const setupRuinWithDoor = (state: GameState): { doorX: number; doorY: number } => {
  // Build a tiny ruin interior with a single locked door directly south of the player.
  const interiorMap: { type: TileType }[][] = Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => ({ type: TileType.RuinFloor as TileType }))
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

  describe('multi-tile door row', () => {
    const setupMultiTileDoor = (state: GameState): { doorY: number; doorPositions: Position[] } => {
      const interiorMap: { type: TileType }[][] = Array.from({ length: 10 }, () =>
        Array.from({ length: 10 }, () => ({ type: TileType.RuinFloor as TileType }))
      )
      const doorY = 6
      const doorPositions: Position[] = []
      for (let x = 3; x <= 7; x++) {
        interiorMap[doorY][x] = { type: TileType.RuinDoorLocked }
        doorPositions.push({ x, y: doorY })
      }
      state.map = interiorMap
      state.mapWidth = 10
      state.mapHeight = 10
      state.player = { x: 3, y: 5 }
      state.playerFacing = 'down'
      state.currentZone = Zone.Ruin
      state.currentRuinIndex = 0
      // Stub out the ruin interior with the multi-tile door positions so
      // unlockRuinDoor finds them in dormantGarden.doorPositions.
      const stubInterior = {
        ruinIndex: 0,
        archetype: 'dormantGarden',
        name: 'test',
        map: interiorMap,
        mapWidth: 10,
        mapHeight: 10,
        entranceOverworld: { x: 0, y: 0 },
        entranceInterior: { x: 0, y: 0 },
        explored: false,
        cleared: false,
        dormantGarden: {
          aqueductTiles: new Set<string>(),
          breakPoints: [],
          repairedBreaks: new Set<string>(),
          seedVault: { x: 5, y: 3 },
          seedDecayTimers: new Map(),
          seedDecayAcceleration: 1,
          waterFlowing: false,
          keyPosition: null,
          tabletPosition: null,
          doorPositions,
        },
        fogExplored: new Set<string>(),
        floraMemory: new Map(),
        fogIllumination: new Map<string, number>(),
      } as unknown as RuinInterior
      state.ruinInteriors = [stubInterior]
      return { doorY, doorPositions }
    }

    it('unlocking from any tile in the row opens the entire row atomically', () => {
      const state = createTestState()
      const { doorY, doorPositions } = setupMultiTileDoor(state)
      addAqueductKey(state, 1)
      // Player faces the leftmost door tile (3,6) from (3,5) facing down.
      const opened = unlockRuinDoor(state)
      expect(opened).toBe(true)
      // Every tile in the row should now be RuinDoorOpen — not just (3,6).
      for (const dp of doorPositions) {
        expect(state.map[dp.y][dp.x].type).toBe(TileType.RuinDoorOpen)
      }
      // Sanity: doorY is intact.
      expect(doorY).toBe(6)
    })

    it('opening the row consumes only one aqueductKey, regardless of row length', () => {
      const state = createTestState()
      setupMultiTileDoor(state)
      addAqueductKey(state, 3)
      const before = state.backpack.items.filter(i => i.definitionId === 'aqueductKey').length
      expect(before).toBe(3)
      expect(unlockRuinDoor(state)).toBe(true)
      const after = state.backpack.items.filter(i => i.definitionId === 'aqueductKey').length
      expect(after).toBe(2)
    })
  })

  describe('click hitbox', () => {
    it('isInteractableAt returns true for RuinDoorLocked tiles in a Ruin zone', () => {
      const state = createTestState()
      const { doorX, doorY } = setupRuinWithDoor(state)
      expect(isInteractableAt(state, doorX, doorY)).toBe(true)
    })

    it('isInteractableAt returns false for RuinDoorLocked when not in a Ruin zone', () => {
      const state = createTestState()
      const { doorX, doorY } = setupRuinWithDoor(state)
      state.currentZone = Zone.Overworld
      expect(isInteractableAt(state, doorX, doorY)).toBe(false)
    })

    it('isInteractableAt returns false for RuinDoorOpen tiles', () => {
      const state = createTestState()
      const { doorX, doorY } = setupRuinWithDoor(state)
      state.map[doorY][doorX] = { type: TileType.RuinDoorOpen }
      expect(isInteractableAt(state, doorX, doorY)).toBe(false)
    })
  })

  describe('locked gate dialog', () => {
    it('isFacingLockedDoor is true when facing a RuinDoorLocked tile in a Ruin zone', () => {
      const state = createTestState()
      setupRuinWithDoor(state)
      expect(isFacingLockedDoor(state)).toBe(true)
    })

    it('isFacingLockedDoor is false when not in a Ruin zone', () => {
      const state = createTestState()
      setupRuinWithDoor(state)
      state.currentZone = Zone.Overworld
      expect(isFacingLockedDoor(state)).toBe(false)
    })

    it('isFacingLockedDoor is false when facing a RuinDoorOpen tile', () => {
      const state = createTestState()
      const { doorX, doorY } = setupRuinWithDoor(state)
      state.map[doorY][doorX] = { type: TileType.RuinDoorOpen }
      expect(isFacingLockedDoor(state)).toBe(false)
    })

    it('openLockedGateDialog opens a dialog with the gate speaker on a fresh line', () => {
      const state = createTestState()
      setupRuinWithDoor(state)
      expect(state.activeDialog).toBeNull()
      openLockedGateDialog(state)
      expect(state.activeDialog).not.toBeNull()
      expect(state.activeDialog?.characterId).toBe('gate')
      expect(state.activeDialog?.lineIndex).toBe(0)
      expect(state.activeDialog?.typingIndex).toBe(0)
      expect(state.activeDialog?.typingDone).toBe(false)
      expect(state.activeDialog?.transitioning).toBe(false)
    })

    it("the gate speaker says 'The gate is locked.'", () => {
      const state = createTestState()
      const def = getCharacterDefinition('gate')
      expect(def.name).toBe('Gate')
      const lines = getCharacterDialog(state, 'gate')
      expect(lines).toHaveLength(1)
      expect(lines[0]).toBe('The gate is locked.')
    })

    it('unlockRuinDoor returns false without a key (caller is responsible for opening the dialog)', () => {
      const state = createTestState()
      setupRuinWithDoor(state)
      expect(unlockRuinDoor(state)).toBe(false)
      expect(state.activeDialog).toBeNull()
    })

    it('unlockRuinDoor with a key opens the door and does not open the gate dialog', () => {
      const state = createTestState()
      setupRuinWithDoor(state)
      addAqueductKey(state, 1)
      expect(unlockRuinDoor(state)).toBe(true)
      expect(state.activeDialog).toBeNull()
    })

    it('the gate is not returned by getAdjacentCharacter (it is not a world entity)', () => {
      const state = createTestState()
      setupRuinWithDoor(state)
      // Even with the player adjacent to the locked door, the gate must not
      // surface as an adjacent character.
      expect(getAdjacentCharacter(state)).toBeNull()
    })

    it('the gate has no manual entry', () => {
      // The synthetic gate speaker is registered in CHARACTER_DEFINITIONS
      // (so the existing dialog modal can render it), but it must be
      // excluded from manual auto-derivation.
      expect(CHARACTER_DEFINITIONS.gate).toBeDefined()
      expect(MANUAL_ENTRIES['character:gate']).toBeUndefined()
    })
  })
})
