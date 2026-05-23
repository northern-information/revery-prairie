import {
  findCoyoteEntity,
  getCoyotePosition,
  summonCoyote,
  tickCoyote,
  transitionCoyoteToZone,
} from '../coyote'
import { ComponentType } from '../ecs/types'
import { interactWithCharacter } from '../interaction'
import { getBlockedPositions, getPathfindingBlockers, movePlayer } from '../movement'
import { posKey } from '../position'
import { MainQuestPhase, TileType, Zone } from '../types'
import {
  clearAroundPlayer,
  createCharacterTestEntity,
  createGroundItemEntity,
  createMeteoriteEntity,
  createTestState,
} from './helpers'
import { describe, expect, it } from 'vitest'

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

  describe('follow behavior', () => {
    it('does not move when within min distance', () => {
      const state = createCoyoteState()
      const pos = getCoyotePosition(state)
      tickCoyote(state)
      expect(getCoyotePosition(state)).toEqual(pos)
    })

    it('moves toward player when at exactly max distance', () => {
      const state = createCoyoteState()
      // Move coyote to exactly COYOTE_FOLLOW_MAX_DIST (3) tiles from player
      const eid = requireValue(findCoyoteEntity(state))
      state.world.moveEntity(eid, state.player.x + 3, state.player.y)
      clearAroundPlayer(state, 10)

      const before = requireValue(getCoyotePosition(state))
      tickCoyote(state)
      const after = requireValue(getCoyotePosition(state))

      // Should have moved closer to player
      const distBefore = Math.max(Math.abs(before.x - state.player.x), Math.abs(before.y - state.player.y))
      const distAfter = Math.max(Math.abs(after.x - state.player.x), Math.abs(after.y - state.player.y))
      expect(distAfter).toBeLessThan(distBefore)
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

    it('follows around L-shaped corridor using path distance, not chebyshev', () => {
      const state = createTestState()
      const px = state.player.x
      const py = state.player.y

      // Build an L-shaped corridor with walls everywhere else in a 10x10 area
      // Corridor: horizontal from (px, py) to (px+4, py), then vertical down to (px+4, py+4)
      for (let dy = -2; dy <= 6; dy++) {
        for (let dx = -2; dx <= 6; dx++) {
          const x = px + dx
          const y = py + dy
          if (x >= 0 && x < state.mapWidth && y >= 0 && y < state.mapHeight) {
            state.map[y][x] = { type: TileType.CaveWall }
          }
        }
      }
      // Carve horizontal arm
      for (let dx = 0; dx <= 4; dx++) {
        state.map[py][px + dx] = { type: TileType.Dirt }
      }
      // Carve vertical arm
      for (let dy = 0; dy <= 4; dy++) {
        state.map[py + dy][px + 4] = { type: TileType.Dirt }
      }

      // Place coyote at the start of the horizontal arm
      createCharacterTestEntity(state, 'coyote', px, py, {
        behavior: { type: 'follow' },
      })

      // Place player at the end of the vertical arm
      state.player = { x: px + 4, y: py + 4 }

      // Chebyshev distance is max(4, 4) = 4, but that's irrelevant now.
      // Path distance is 4 (horizontal) + 4 (vertical) = 8 steps.
      // With path distance >= 3 (COYOTE_FOLLOW_MAX_DIST), coyote should move.
      const before = requireValue(getCoyotePosition(state))
      tickCoyote(state)
      const after = requireValue(getCoyotePosition(state))

      expect(after.x !== before.x || after.y !== before.y).toBe(true)
    })

    it('idles when path distance is within min distance even if tiles are not adjacent', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)

      // Place coyote 2 tiles away (path distance = 2 = COYOTE_FOLLOW_MIN_DIST)
      createCharacterTestEntity(state, 'coyote', state.player.x + 2, state.player.y, {
        behavior: { type: 'follow' },
      })

      const before = requireValue(getCoyotePosition(state))
      tickCoyote(state)
      const after = requireValue(getCoyotePosition(state))

      expect(after).toEqual(before)
    })

    it('idles gracefully when no path exists to player', () => {
      const state = createTestState()
      const px = state.player.x
      const py = state.player.y
      clearAroundPlayer(state, 10)

      // Place coyote 5 tiles away
      createCharacterTestEntity(state, 'coyote', px + 5, py, {
        behavior: { type: 'follow' },
      })

      // Wall off the coyote completely
      const cx = px + 5
      const cy = py
      for (const d of [
        { x: -1, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: -1 },
        { x: 0, y: 1 },
      ]) {
        state.map[cy + d.y][cx + d.x] = { type: TileType.CaveWall }
      }

      const before = requireValue(getCoyotePosition(state))
      // Should not throw
      tickCoyote(state)
      const after = requireValue(getCoyotePosition(state))

      expect(after).toEqual(before)
    })
  })

  describe('collect behavior', () => {
    it('picks up a meteorite ground item', () => {
      const state = createCoyoteState()
      clearAroundPlayer(state, 10)

      // Place coyote right next to a meteorite
      const eid = requireValue(findCoyoteEntity(state))
      const meteoriteX = state.player.x + 3
      const meteoriteY = state.player.y
      state.world.moveEntity(eid, meteoriteX, meteoriteY)
      createMeteoriteEntity(state, meteoriteX, meteoriteY)

      const result = tickCoyote(state)
      const pickedUp = requireValue(result.pickedUp)
      expect(pickedUp.definitionId).toBe('meteorite')
      expect(state.coyoteCargo).toBe('meteorite')
    })

    it('picks up a honey ground item', () => {
      const state = createCoyoteState()
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

    it('picks up a coin ground item', () => {
      const state = createCoyoteState()
      clearAroundPlayer(state, 10)

      const eid = requireValue(findCoyoteEntity(state))
      const coinX = state.player.x + 3
      state.world.moveEntity(eid, coinX, state.player.y)
      createGroundItemEntity(state, 'coin', coinX, state.player.y)

      const result = tickCoyote(state)
      const pickedUp = requireValue(result.pickedUp)
      expect(pickedUp.definitionId).toBe('coin')
      expect(state.coyoteCargo).toBe('coin')
    })

    it('picks up the nearest item regardless of type', () => {
      const state = createCoyoteState()
      clearAroundPlayer(state, 10)

      const eid = requireValue(findCoyoteEntity(state))
      const coyoteX = state.player.x + 5
      state.world.moveEntity(eid, coyoteX, state.player.y)

      // Place a coin closer and a meteorite farther
      createGroundItemEntity(state, 'coin', coyoteX + 1, state.player.y)
      createMeteoriteEntity(state, coyoteX + 4, state.player.y)

      tickCoyote(state)
      // Coyote should step toward the closer coin, not the farther meteorite
      const pos = requireValue(state.world.getComponent(eid, ComponentType.Position))
      expect(pos.x).toBe(coyoteX + 1)
    })

    it('delivers to player backpack when adjacent and backpack has room', () => {
      const state = createCoyoteState()
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

    it('follows player when no collectibles exist', () => {
      const state = createCoyoteState()
      clearAroundPlayer(state, 10)

      // Move coyote far from player so follow behavior triggers movement
      const eid = requireValue(findCoyoteEntity(state))
      state.world.moveEntity(eid, state.player.x + 6, state.player.y)

      const posBefore = requireValue(getCoyotePosition(state))
      const result = tickCoyote(state)
      const posAfter = requireValue(getCoyotePosition(state))

      expect(result.pickedUp).toBeNull()
      expect(result.delivered).toBeNull()
      // Should have moved toward the player (follow fallback)
      expect(posAfter.x).toBeLessThan(posBefore.x)
    })

    it('stays near player in collect mode when no collectibles and already close', () => {
      const state = createCoyoteState()
      clearAroundPlayer(state, 10)

      // Coyote is already adjacent (1 tile away) — within follow min dist
      const posBefore = getCoyotePosition(state)
      const result = tickCoyote(state)
      expect(result.pickedUp).toBeNull()
      expect(result.delivered).toBeNull()
      expect(getCoyotePosition(state)).toEqual(posBefore)
    })

    it('switches from follow-fallback to collecting when item appears', () => {
      const state = createCoyoteState()
      clearAroundPlayer(state, 10)

      // Move coyote far from player — will follow
      const eid = requireValue(findCoyoteEntity(state))
      state.world.moveEntity(eid, state.player.x + 6, state.player.y)

      // First tick: no items, follows player
      tickCoyote(state)
      const afterFollow = requireValue(getCoyotePosition(state))
      expect(afterFollow.x).toBeLessThan(state.player.x + 6)

      // Now drop an item near the coyote
      createGroundItemEntity(state, 'honey', afterFollow.x + 1, afterFollow.y)

      // Next tick: should move toward item, not player
      const beforeCollect = requireValue(getCoyotePosition(state))
      tickCoyote(state)
      const afterCollect = requireValue(getCoyotePosition(state))
      expect(afterCollect.x).toBeGreaterThan(beforeCollect.x)
    })

    it('ignores ground items outside the viewport', () => {
      const state = createCoyoteState()
      clearAroundPlayer(state, 10)

      // Move coyote far from player so follow behavior would step toward player.
      const eid = requireValue(findCoyoteEntity(state))
      state.world.moveEntity(eid, state.player.x + 6, state.player.y)

      // Place an item far outside the viewport bounds. The default 20x20
      // viewport with camera centered on the player gives visible-relative
      // bounds of roughly [-20, 40]. Item at world (player.x + 80, ...)
      // sits at vx = 80 - (player.x - 10) - player.x = -10 + 90 = 90,
      // well past vxEnd = 40 — definitely outside the viewport.
      const farX = state.player.x + 80
      const farY = state.player.y
      if (farX < state.mapWidth) {
        createGroundItemEntity(state, 'coin', farX, farY)
      }

      const before = requireValue(getCoyotePosition(state))
      const result = tickCoyote(state)
      const after = requireValue(getCoyotePosition(state))

      // Should not have picked up anything and should have moved toward the player.
      expect(result.pickedUp).toBeNull()
      expect(after.x).toBeLessThan(before.x)
    })

    it('walks toward meteorite when not on its tile', () => {
      const state = createCoyoteState()
      clearAroundPlayer(state, 10)

      // Place meteorite far from coyote
      createMeteoriteEntity(state, state.player.x + 5, state.player.y)
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
    it('coyote is included in default blocked positions (for other entities)', () => {
      const state = createCoyoteState()
      const blocked = getBlockedPositions(state)
      const coyotePos = requireValue(getCoyotePosition(state))
      expect(blocked.has(posKey(coyotePos.x, coyotePos.y))).toBe(true)
    })

    it('coyote is excluded from blocked positions with ignoreCoyote option', () => {
      const state = createCoyoteState()
      const blocked = getBlockedPositions(state, undefined, { ignoreCoyote: true })
      const coyotePos = requireValue(getCoyotePosition(state))
      expect(blocked.has(posKey(coyotePos.x, coyotePos.y))).toBe(false)
    })

    it('player can walk onto coyote tile', () => {
      const state = createCoyoteState()
      clearAroundPlayer(state, 10)
      // Coyote is at player.x + 1, player.y
      const coyotePos = requireValue(getCoyotePosition(state))
      expect(coyotePos).toEqual({ x: state.player.x + 1, y: state.player.y })

      const moved = movePlayer(state, 'right')
      expect(moved).toBe(true)
      expect(state.player.x).toBe(coyotePos.x)
      expect(state.player.y).toBe(coyotePos.y)
    })

    it('coyote nudges off player tile on next follow tick', () => {
      const state = createCoyoteState()
      clearAroundPlayer(state, 10)
      // Move player onto coyote tile
      const coyotePos = requireValue(getCoyotePosition(state))
      state.player = { x: coyotePos.x, y: coyotePos.y }

      tickCoyote(state)

      // Coyote should have moved off the player tile
      const newCoyotePos = requireValue(getCoyotePosition(state))
      expect(newCoyotePos.x !== state.player.x || newCoyotePos.y !== state.player.y).toBe(true)
    })

    it('A* pathfinding routes through coyote tile for player', () => {
      const state = createCoyoteState()
      clearAroundPlayer(state, 10)
      // Coyote is at player.x + 1, player.y — blocking the path east
      const blockers = getPathfindingBlockers(state)
      const coyotePos = requireValue(getCoyotePosition(state))
      // Coyote should NOT be in the pathfinding blocker set for player
      expect(blockers.has(posKey(coyotePos.x, coyotePos.y))).toBe(false)
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

  })

  describe('cave transition', () => {
    it('moves coyote to cave zone', () => {
      const state = createCoyoteState()
      // Cave-transition tests describe the rescued companion following the
      // player across zones, which only happens post-rescue. Advance past
      // AwaitingCoyote so transitionCoyoteToZone performs the teleport.
      state.mainQuestPhase = MainQuestPhase.Gathering
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

    it('coyote follows player step-by-step through cave corridors', () => {
      const state = createCoyoteState()
      state.mainQuestPhase = MainQuestPhase.Gathering

      // Switch to cave
      state.map = state.caveMap
      state.mapWidth = state.caveMapWidth
      state.mapHeight = state.caveMapHeight
      state.currentZone = Zone.Cave
      state.player = {
        x: state.caveEntranceInterior.x,
        y: state.caveEntranceInterior.y - 1,
      }
      transitionCoyoteToZone(state, Zone.Cave)

      const startCoyote = requireValue(getCoyotePosition(state))

      // BFS to find a walkable tile 6+ path-steps from the player
      const visited = new Set<string>()
      const queue: { x: number; y: number; dist: number; path: { x: number; y: number }[] }[] = [
        { ...state.player, dist: 0, path: [] },
      ]
      visited.add(posKey(state.player.x, state.player.y))
      let walkPath: { x: number; y: number }[] = []

      while (queue.length > 0) {
        const cur = queue.shift()
        if (!cur) break
        if (cur.dist >= 6) {
          walkPath = cur.path
          break
        }
        for (const d of [
          { x: -1, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: -1 },
          { x: 0, y: 1 },
        ]) {
          const nx = cur.x + d.x
          const ny = cur.y + d.y
          const key = posKey(nx, ny)
          if (visited.has(key)) continue
          if (nx < 0 || ny < 0 || nx >= state.mapWidth || ny >= state.mapHeight) continue
          const tile = state.map[ny][nx].type
          if (tile === TileType.CaveWall || tile === TileType.CaveBreakableWall) continue
          if (tile === TileType.CaveEntrance) continue
          visited.add(key)
          queue.push({ x: nx, y: ny, dist: cur.dist + 1, path: [...cur.path, { x: nx, y: ny }] })
        }
      }

      // Walk player step-by-step, ticking coyote each step
      for (const step of walkPath) {
        state.player = { x: step.x, y: step.y }
        tickCoyote(state)
      }

      // Coyote should have followed — it should NOT still be at its start position
      const finalCoyote = requireValue(getCoyotePosition(state))
      expect(finalCoyote.x !== startCoyote.x || finalCoyote.y !== startCoyote.y).toBe(true)
    })
  })

  describe('interact with coyote', () => {
    it('is a no-op (returns the zero-effect shape, no state changes)', () => {
      const state = createCoyoteState()
      const cargoBefore = state.coyoteCargo

      const result = interactWithCharacter(state)

      expect(result.opened).toBe(false)
      expect(result.coyoteToggled).toBe(false)
      expect(state.coyoteCargo).toBe(cargoBefore)
      // No activeDialog opened
      expect(state.activeDialog).toBeNull()
    })

    it('does nothing when no character is adjacent', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)

      const result = interactWithCharacter(state)

      expect(result.opened).toBe(false)
    })
  })
})
