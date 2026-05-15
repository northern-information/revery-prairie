import { describe, expect, it } from 'vitest'

import {
  spawnShootingStarAtTarget,
  tickMeteorShower,
  tickShootingStars,
  triggerPlayerSpawnShower,
} from '../celestial'
import { MAP_HEIGHT, MAP_WIDTH } from '../constants'
import { ComponentType } from '../ecs/types'
import { completeGenesis } from '../genesis'
import { createGameState } from '../state'
import { TileType } from '../types'

import type { GameState, Position } from '../types'

const clearAroundTile = (state: GameState, p: Position, radius = 2): void => {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = p.x + dx
      const ny = p.y + dy
      if (nx >= 0 && nx < state.mapWidth && ny >= 0 && ny < state.mapHeight) {
        state.map[ny][nx] = { type: TileType.Dirt }
      }
    }
  }
}

const destroyAllStars = (state: GameState): void => {
  for (const eid of state.world.query(ComponentType.ShootingStarData)) {
    state.world.destroyEntity(eid)
  }
}

const countMeteorites = (state: GameState): number =>
  state.world.query(ComponentType.EntityTag).filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'meteorite').length

describe('player spawn ceremony', () => {
  describe('triggerPlayerSpawnShower', () => {
    it('initializes playerSpawn with the spawn entity id and timestamp', () => {
      const state = createGameState('Test', 40, 30)
      destroyAllStars(state)
      // createGameState defaults visible=true (so headless tests work). The trigger flips it to false.
      expect(state.playerSpawn.visible).toBe(true)

      triggerPlayerSpawnShower(state, state.player, 100)

      expect(state.playerSpawn.visible).toBe(false)
      expect(state.playerSpawn.triggeredAt).toBe(100)
      expect(state.playerSpawn.meteorEntityId).not.toBeNull()
      expect(state.playerSpawn.spawnPos).toEqual(state.player)
    })

    it('marks the meteor shower active and records the discovery', () => {
      const state = createGameState('Test', 40, 30)
      destroyAllStars(state)
      expect(state.meteorShower.active).toBe(false)

      triggerPlayerSpawnShower(state, state.player, 100)

      expect(state.meteorShower.active).toBe(true)
      expect(state.manualDiscoveries.has('event:meteor-shower')).toBe(true)
    })

    it('creates a forPlayerSpawn shooting star aimed at the player tile', () => {
      const state = createGameState('Test', 40, 30)
      destroyAllStars(state)

      triggerPlayerSpawnShower(state, state.player, 100)
      const eid = state.playerSpawn.meteorEntityId
      expect(eid).not.toBeNull()
      if (eid === null) return
      const data = state.world.getComponent(eid, ComponentType.ShootingStarData)
      expect(data).toBeDefined()
      expect(data?.forPlayerSpawn).toBe(true)
      expect(data?.willLand).toBe(true)
      expect(data?.landingTarget).toEqual(state.player)
    })

    it('accepts an arbitrary spawn position (multiplayer-ready)', () => {
      const state = createGameState('Test', 40, 30)
      destroyAllStars(state)
      const otherPlayer: Position = { x: state.player.x + 5, y: state.player.y + 3 }

      triggerPlayerSpawnShower(state, otherPlayer, 100)

      expect(state.playerSpawn.spawnPos).toEqual(otherPlayer)
      const eid = state.playerSpawn.meteorEntityId
      expect(eid).not.toBeNull()
      if (eid === null) return
      const data = state.world.getComponent(eid, ComponentType.ShootingStarData)
      expect(data?.landingTarget).toEqual(otherPlayer)
    })
  })

  describe('emerge on impact', () => {
    it('flips visible to true and creates an explosion when the spawn star lands', () => {
      const state = createGameState('Test', 40, 30)
      destroyAllStars(state)
      clearAroundTile(state, state.player)
      // Place a forPlayerSpawn star one tick away from the player, moving onto the player tile.
      const eid = spawnShootingStarAtTarget(state, state.player, { dx: 1, dy: 0 }, {
        forPlayerSpawn: true,
        backtrackTiles: 1,
      })
      state.playerSpawn.meteorEntityId = eid
      state.playerSpawn.spawnPos = { ...state.player }
      state.playerSpawn.triggeredAt = 100
      state.playerSpawn.visible = false

      const meteoritesBefore = countMeteorites(state)
      tickShootingStars(state, 200)

      expect(state.playerSpawn.visible).toBe(true)
      expect(state.playerSpawn.meteorEntityId).toBeNull()
      // No meteorite item dropped at the player tile
      expect(countMeteorites(state)).toBe(meteoritesBefore)
      // Explosion entity created
      const explosions = state.world
        .query(ComponentType.EntityTag)
        .filter(e => state.world.getComponent(e, ComponentType.EntityTag) === 'explosion')
      expect(explosions.length).toBeGreaterThan(0)
    })

    it('queues a "falls to the prairie" log entry on impact, with the steward name', () => {
      const state = createGameState('Bramble', 40, 30)
      destroyAllStars(state)
      state.queuedEvents = []
      clearAroundTile(state, state.player)
      const eid = spawnShootingStarAtTarget(state, state.player, { dx: 1, dy: 0 }, {
        forPlayerSpawn: true,
        backtrackTiles: 1,
      })
      state.playerSpawn.meteorEntityId = eid
      state.playerSpawn.spawnPos = { ...state.player }
      state.playerSpawn.triggeredAt = 100
      state.playerSpawn.visible = false

      tickShootingStars(state, 200)

      const fallEvent = state.queuedEvents.find(t => t.text.includes('falls to the prairie'))
      expect(fallEvent).toBeDefined()
      expect(fallEvent?.text).toBe('Steward Bramble falls to the prairie.')
    })
  })

  describe('shower direction matches player meteor', () => {
    it('player-spawn star uses the shower radiant direction', () => {
      const state = createGameState('Test', 40, 30)
      destroyAllStars(state)

      triggerPlayerSpawnShower(state, state.player, 100)
      const eid = state.playerSpawn.meteorEntityId
      expect(eid).not.toBeNull()
      if (eid === null) return
      const vel = state.world.getComponent(eid, ComponentType.Velocity)
      expect(vel?.dx).toBe(state.meteorShower.radiantDx)
      expect(vel?.dy).toBe(state.meteorShower.radiantDy)
    })
  })

  describe('off-map fallback', () => {
    it('flips visible to true if the spawn star is destroyed off-map', () => {
      const state = createGameState('Test', 40, 30)
      destroyAllStars(state)
      // Spawn a forPlayerSpawn star that is already past the map bounds
      // so tickShootingStars destroys it on the buffer check.
      const eid = state.world.createEntity()
      state.world.addComponent(eid, ComponentType.Position, { x: -100, y: -100 })
      state.world.addComponent(eid, ComponentType.Velocity, { dx: -1, dy: -1 })
      state.world.addComponent(eid, ComponentType.ShootingStarData, {
        length: 4,
        age: 0,
        willLand: true,
        landingTarget: { ...state.player },
        forPlayerSpawn: true,
      })
      state.world.addComponent(eid, ComponentType.EntityTag, 'shootingStar')
      state.playerSpawn.meteorEntityId = eid
      state.playerSpawn.spawnPos = { ...state.player }
      state.playerSpawn.triggeredAt = 100
      state.playerSpawn.visible = false

      tickShootingStars(state, 200)

      expect(state.playerSpawn.visible).toBe(true)
      expect(state.playerSpawn.meteorEntityId).toBeNull()
    })

    it('flips visible to true if meteorEntityId references a missing entity', () => {
      const state = createGameState('Test', 40, 30)
      destroyAllStars(state)
      // Point meteorEntityId at a nonexistent entity
      state.playerSpawn.meteorEntityId = 999999
      state.playerSpawn.spawnPos = { ...state.player }
      state.playerSpawn.triggeredAt = 100
      state.playerSpawn.visible = false

      tickShootingStars(state, 200)

      expect(state.playerSpawn.visible).toBe(true)
      expect(state.playerSpawn.meteorEntityId).toBeNull()
    })
  })

  describe('shower scheduling', () => {
    it('does not auto-schedule the first shower without a player spawn trigger', () => {
      const state = createGameState('Test', 40, 30)
      // Fresh state: nextShowerTime starts at 0 (not yet triggered).
      expect(state.meteorShower.nextShowerTime).toBe(0)

      // Many minutes elapse without anyone calling triggerPlayerSpawnShower.
      tickMeteorShower(state, 200_000)
      tickMeteorShower(state, 400_000)

      expect(state.meteorShower.active).toBe(false)
      expect(state.meteorShower.nextShowerTime).toBe(0)
    })
  })

  describe('initial spawn geometry', () => {
    it('places Gron at the exact map center and the player one tile west', () => {
      const state = createGameState('Test', 40, 30)

      const centerX = Math.floor(MAP_WIDTH / 2)
      const centerY = Math.floor(MAP_HEIGHT / 2)

      expect(state.player).toEqual({ x: centerX - 1, y: centerY })

      let gronPos: Position | null = null
      for (const eid of state.world.query(ComponentType.CharacterIdentity, ComponentType.Position)) {
        const identity = state.world.getComponent(eid, ComponentType.CharacterIdentity)
        if (identity?.definitionId !== 'gron') continue
        const pos = state.world.getComponent(eid, ComponentType.Position)
        expect(pos).toBeTruthy()
        if (pos) gronPos = { x: pos.x, y: pos.y }
        break
      }

      expect(gronPos).toEqual({ x: centerX, y: centerY })
    })
  })

  // Regression for the one-frame @ flash that appeared between genesis ending
  // and the gameloop's player-spawn-trigger system firing. completeGenesis
  // must trigger the spawn ceremony synchronously (via the onGenesisComplete
  // callback wired by useGameEngine) so the first gameplay render already
  // sees playerSpawn.visible === false.
  describe('completeGenesis triggers spawn ceremony', () => {
    it('flips playerSpawn.visible to false before returning', () => {
      const state = createGameState('Test', 40, 30)
      destroyAllStars(state)
      clearAroundTile(state, state.player, 3)
      state.onGenesisComplete = (handoffTime: number) => {
        triggerPlayerSpawnShower(state, state.player, handoffTime)
      }
      expect(state.playerSpawn.visible).toBe(true)
      expect(state.playerSpawn.triggeredAt).toBe(0)
      expect(state.playerSpawn.meteorEntityId).toBeNull()

      completeGenesis(state)

      expect(state.playerSpawn.visible).toBe(false)
      expect(state.playerSpawn.triggeredAt).not.toBe(0)
      expect(state.playerSpawn.meteorEntityId).not.toBeNull()
    })
  })
})
