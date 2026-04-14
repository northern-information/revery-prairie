import { describe, expect, it } from 'vitest'

import { COYOTE_COLLECTIBLE_DEFINITIONS } from '../constants'
import {
  findCoyoteEntity,
  getCoyotePosition,
  summonCoyote,
  tickCoyote,
  toggleCoyoteMode,
  transitionCoyoteToZone,
} from '../coyote'
import { ComponentType } from '../ecs/types'
import { getBlockedPositions } from '../movement'
import { posKey } from '../position'
import { CoyoteMode, Zone } from '../types'

import {
  clearAroundPlayer,
  createCharacterTestEntity,
  createGroundItemEntity,
  createTestState,
} from './helpers'

/** Assert a value is truthy and return it typed — avoids non-null assertions */
const requireValue = <T>(val: T | null | undefined): T => {
  expect(val).toBeTruthy()
  return val as T
}

const createCoyoteState = () => {
  const state = createTestState()
  clearAroundPlayer(state, 10)
  // Spawn coyote adjacent to player
  createCharacterTestEntity(state, 'coyote', state.player.x + 1, state.player.y, {
    behavior: { type: 'follow' },
  })
  return state
}

describe('coyote companion', () => {
  describe('findCoyoteEntity', () => {
    it('returns null when no coyote exists', () => {
      const state = createTestState()
      expect(findCoyoteEntity(state)).toBeNull()
    })

    it('finds the coyote entity', () => {
      const state = createCoyoteState()
      const eid = requireValue(findCoyoteEntity(state))
      const identity = state.world.getComponent(eid, ComponentType.CharacterIdentity)
      expect(identity?.definitionId).toBe('coyote')
    })
  })

  describe('getCoyotePosition', () => {
    it('returns coyote position', () => {
      const state = createCoyoteState()
      const pos = getCoyotePosition(state)
      expect(pos).toEqual({ x: state.player.x + 1, y: state.player.y })
    })

    it('returns null when no coyote', () => {
      const state = createTestState()
      expect(getCoyotePosition(state)).toBeNull()
    })
  })

  describe('toggleCoyoteMode', () => {
    it('toggles from follow to collect', () => {
      const state = createCoyoteState()
      expect(state.coyoteMode).toBe(CoyoteMode.Follow)
      toggleCoyoteMode(state)
      expect(state.coyoteMode).toBe(CoyoteMode.Collect)
    })

    it('toggles from collect to follow', () => {
      const state = createCoyoteState()
      state.coyoteMode = CoyoteMode.Collect
      toggleCoyoteMode(state)
      expect(state.coyoteMode).toBe(CoyoteMode.Follow)
    })

    it('clears coyotePath on toggle', () => {
      const state = createCoyoteState()
      state.coyotePath = [{ x: 5, y: 5 }]
      toggleCoyoteMode(state)
      expect(state.coyotePath).toBeNull()
    })
  })

  describe('follow behavior', () => {
    it('does not move when within min distance', () => {
      const state = createCoyoteState()
      const pos = getCoyotePosition(state)
      tickCoyote(state)
      expect(getCoyotePosition(state)).toEqual(pos)
    })

    it('moves toward player when beyond max distance', () => {
      const state = createCoyoteState()
      // Move coyote far from player
      const eid = requireValue(findCoyoteEntity(state))
      state.world.moveEntity(eid, state.player.x + 6, state.player.y)
      clearAroundPlayer(state, 10)

      const before = requireValue(getCoyotePosition(state))
      tickCoyote(state)
      const after = requireValue(getCoyotePosition(state))

      // Should have moved closer to player
      const distBefore = Math.abs(before.x - state.player.x) + Math.abs(before.y - state.player.y)
      const distAfter = Math.abs(after.x - state.player.x) + Math.abs(after.y - state.player.y)
      expect(distAfter).toBeLessThan(distBefore)
    })
  })

  describe('collect behavior', () => {
    it('picks up a meteorite ground item', () => {
      const state = createCoyoteState()
      state.coyoteMode = CoyoteMode.Collect
      clearAroundPlayer(state, 10)

      // Place coyote right next to a meteorite
      const eid = requireValue(findCoyoteEntity(state))
      const meteoriteX = state.player.x + 3
      const meteoriteY = state.player.y
      state.world.moveEntity(eid, meteoriteX, meteoriteY)
      createGroundItemEntity(state, 'meteorite', meteoriteX, meteoriteY)

      const result = tickCoyote(state)
      const pickedUp = requireValue(result.pickedUp)
      expect(pickedUp.definitionId).toBe('meteorite')
      expect(state.coyoteCargo).toBe('meteorite')
    })

    it('picks up a honey ground item', () => {
      const state = createCoyoteState()
      state.coyoteMode = CoyoteMode.Collect
      clearAroundPlayer(state, 10)

      const eid = requireValue(findCoyoteEntity(state))
      const honeyX = state.player.x + 3
      const honeyY = state.player.y
      state.world.moveEntity(eid, honeyX, honeyY)
      createGroundItemEntity(state, 'honey', honeyX, honeyY)

      const result = tickCoyote(state)
      const pickedUp = requireValue(result.pickedUp)
      expect(pickedUp.definitionId).toBe('honey')
      expect(state.coyoteCargo).toBe('honey')
    })

    it('ignores non-collectible ground items', () => {
      const state = createCoyoteState()
      state.coyoteMode = CoyoteMode.Collect
      clearAroundPlayer(state, 10)

      // Place a coin (not collectible) next to coyote
      const eid = requireValue(findCoyoteEntity(state))
      const coinX = state.player.x + 3
      state.world.moveEntity(eid, coinX, state.player.y)
      createGroundItemEntity(state, 'coin', coinX, state.player.y)

      const result = tickCoyote(state)
      expect(result.pickedUp).toBeNull()
      expect(state.coyoteCargo).toBeNull()
    })

    it('delivers to player backpack when adjacent and backpack has room', () => {
      const state = createCoyoteState()
      state.coyoteMode = CoyoteMode.Collect
      state.coyoteCargo = 'meteorite'
      clearAroundPlayer(state, 10)

      // Coyote is already adjacent to player (x+1)
      const result = tickCoyote(state)
      const delivered = requireValue(result.delivered)
      expect(delivered.definitionId).toBe('meteorite')
      expect(delivered.toGron).toBe(false)
      expect(state.coyoteCargo).toBeNull()
      // Item should be in backpack
      expect(state.backpack.items.length).toBeGreaterThan(0)
    })

    it('idles when no collectibles exist', () => {
      const state = createCoyoteState()
      state.coyoteMode = CoyoteMode.Collect
      clearAroundPlayer(state, 10)

      const posBefore = getCoyotePosition(state)
      const result = tickCoyote(state)
      expect(result.pickedUp).toBeNull()
      expect(result.delivered).toBeNull()
      expect(getCoyotePosition(state)).toEqual(posBefore)
    })

    it('walks toward meteorite when not on its tile', () => {
      const state = createCoyoteState()
      state.coyoteMode = CoyoteMode.Collect
      clearAroundPlayer(state, 10)

      // Place meteorite far from coyote
      createGroundItemEntity(state, 'meteorite', state.player.x + 5, state.player.y)
      const eid = requireValue(findCoyoteEntity(state))
      state.world.moveEntity(eid, state.player.x - 3, state.player.y)

      const before = requireValue(getCoyotePosition(state))
      tickCoyote(state)
      const after = requireValue(getCoyotePosition(state))

      // Should have moved (closer to meteorite)
      expect(after.x !== before.x || after.y !== before.y).toBe(true)
    })
  })

  describe('blocking', () => {
    it('coyote is included in blocked positions', () => {
      const state = createCoyoteState()
      const blocked = getBlockedPositions(state)
      const coyotePos = requireValue(getCoyotePosition(state))
      expect(blocked.has(posKey(coyotePos.x, coyotePos.y))).toBe(true)
    })
  })

  describe('summonCoyote', () => {
    it('teleports coyote adjacent to player', () => {
      const state = createCoyoteState()
      clearAroundPlayer(state, 10)

      // Move coyote far away
      const eid = requireValue(findCoyoteEntity(state))
      state.world.moveEntity(eid, state.player.x + 20, state.player.y)

      const success = summonCoyote(state)
      expect(success).toBe(true)

      const pos = requireValue(getCoyotePosition(state))
      const dist = Math.abs(pos.x - state.player.x) + Math.abs(pos.y - state.player.y)
      expect(dist).toBe(1) // adjacent
    })

    it('returns false when no coyote exists', () => {
      const state = createTestState()
      expect(summonCoyote(state)).toBe(false)
    })

    it('clears coyotePath on summon', () => {
      const state = createCoyoteState()
      clearAroundPlayer(state, 10)
      state.coyotePath = [{ x: 5, y: 5 }]
      summonCoyote(state)
      expect(state.coyotePath).toBeNull()
    })
  })

  describe('cave transition', () => {
    it('moves coyote to cave zone', () => {
      const state = createCoyoteState()
      clearAroundPlayer(state, 10)

      // Simulate entering cave: set zone and map to cave
      state.map = state.caveMap
      state.mapWidth = state.caveMapWidth
      state.mapHeight = state.caveMapHeight
      state.currentZone = Zone.Cave
      state.player = {
        x: state.caveEntranceInterior.x,
        y: state.caveEntranceInterior.y - 1,
      }

      transitionCoyoteToZone(state, Zone.Cave)

      const eid = requireValue(findCoyoteEntity(state))
      const ez = state.world.getComponent(eid, ComponentType.EntityZone)
      expect(ez?.zone).toBe(Zone.Cave)
    })
  })

  describe('collectible definitions', () => {
    it('includes meteorite and honey', () => {
      expect(COYOTE_COLLECTIBLE_DEFINITIONS).toContain('meteorite')
      expect(COYOTE_COLLECTIBLE_DEFINITIONS).toContain('honey')
    })
  })
})
