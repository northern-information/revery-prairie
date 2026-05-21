import { updateCamera } from '../camera'
import { spawnShootingStarAtTarget, tickMeteorShower, tickShootingStars, triggerPlayerSpawnShower } from '../celestial'
import { MAP_HEIGHT, MAP_WIDTH, SATELLITE_SHAKE_DURATION_MS } from '../constants'
import { ComponentType } from '../ecs/types'
import { completeGenesis } from '../genesis'
import { createGameState } from '../state'
import { TileType } from '../types'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
  state.world
    .query(ComponentType.EntityTag)
    .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'meteorite').length

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
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('flips visible to true and creates an explosion when the spawn star lands', () => {
      const state = createGameState('Test', 40, 30)
      destroyAllStars(state)
      clearAroundTile(state, state.player)
      // Place a forPlayerSpawn star one tick away from the player, moving onto the player tile.
      const eid = spawnShootingStarAtTarget(
        state,
        state.player,
        { dx: 1, dy: 0 },
        {
          forPlayerSpawn: true,
          backtrackTiles: 1,
        }
      )
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

    it('tags the impact explosion with kind stewardImpact (pink palette)', () => {
      const state = createGameState('Test', 40, 30)
      destroyAllStars(state)
      clearAroundTile(state, state.player)
      const eid = spawnShootingStarAtTarget(
        state,
        state.player,
        { dx: 1, dy: 1 },
        { forPlayerSpawn: true, backtrackTiles: 1 }
      )
      state.playerSpawn.meteorEntityId = eid
      state.playerSpawn.spawnPos = { ...state.player }
      state.playerSpawn.triggeredAt = 100
      state.playerSpawn.visible = false

      tickShootingStars(state, 200)

      const explosionKinds = state.world
        .query(ComponentType.TimedEffect, ComponentType.EntityTag)
        .filter(e => state.world.getComponent(e, ComponentType.EntityTag) === 'explosion')
        .map(e => state.world.getComponent(e, ComponentType.TimedEffect)?.kind)
      expect(explosionKinds).toContain('stewardImpact')
    })

    it('triggers screen shake on steward impact (same duration as a satellite impact)', () => {
      const state = createGameState('Test', 40, 30)
      destroyAllStars(state)
      clearAroundTile(state, state.player)
      const eid = spawnShootingStarAtTarget(
        state,
        state.player,
        { dx: 1, dy: 1 },
        { forPlayerSpawn: true, backtrackTiles: 1 }
      )
      state.playerSpawn.meteorEntityId = eid
      state.playerSpawn.spawnPos = { ...state.player }
      state.playerSpawn.triggeredAt = 100
      state.playerSpawn.visible = false
      state.screenShakeUntil = 0

      tickShootingStars(state, 200)

      expect(state.screenShakeUntil).toBe(200 + SATELLITE_SHAKE_DURATION_MS)
    })
  })

  describe('steward star direction', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('always uses fixed { dx: 1, dy: 1 } regardless of shower radiant', () => {
      // Force pickRadiantDirection to land on a NON-{1,1} entry. The
      // RADIANT_DIRECTIONS list places {1,1} at index 0; Math.random()=0.99
      // picks the last entry { dx: 0, dy: -1 }. Both axes therefore differ
      // from the steward star's heading, proving decoupling.
      vi.spyOn(Math, 'random').mockReturnValue(0.99)

      const state = createGameState('Test', 40, 30)
      destroyAllStars(state)
      triggerPlayerSpawnShower(state, state.player, 100)

      const eid = state.playerSpawn.meteorEntityId
      expect(eid).not.toBeNull()
      if (eid === null) return
      const vel = state.world.getComponent(eid, ComponentType.Velocity)
      expect(vel?.dx).toBe(1)
      expect(vel?.dy).toBe(1)
      // And the shower itself picked a different radiant.
      expect(state.meteorShower.radiantDx === 1 && state.meteorShower.radiantDy === 1).toBe(false)
    })
  })

  describe('camera follows the steward star', () => {
    it('centers the camera on the star Position while playerSpawn.visible is false', () => {
      const state = createGameState('Test', 40, 30)
      destroyAllStars(state)
      // Steward star positioned far from the player; camera should follow it, not the player.
      const eid = state.world.createEntity()
      state.world.addComponent(eid, ComponentType.Position, { x: 5, y: 7 })
      state.world.addComponent(eid, ComponentType.Velocity, { dx: 1, dy: 1 })
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
      state.playerSpawn.visible = false
      state.playerSpawn.triggeredAt = 50

      updateCamera(state)

      const visibleWidth = state.viewportWidth - state.rightInsetTiles
      const expectedX = 5 - Math.floor(visibleWidth / 2)
      const expectedY = 7 - Math.floor(state.viewportHeight / 2)
      expect(state.camera.x).toBe(expectedX)
      expect(state.camera.y).toBe(expectedY)
    })

    it('falls back to player tracking when meteorEntityId references a missing entity', () => {
      const state = createGameState('Test', 40, 30)
      destroyAllStars(state)
      state.playerSpawn.meteorEntityId = 999999
      state.playerSpawn.spawnPos = { ...state.player }
      state.playerSpawn.visible = false

      updateCamera(state)

      const visibleWidth = state.viewportWidth - state.rightInsetTiles
      const expectedX = state.player.x - Math.floor(visibleWidth / 2)
      const expectedY = state.player.y - Math.floor(state.viewportHeight / 2)
      expect(state.camera.x).toBe(expectedX)
      expect(state.camera.y).toBe(expectedY)
    })

    it('uses standard player tracking once playerSpawn.visible flips to true', () => {
      const state = createGameState('Test', 40, 30)
      destroyAllStars(state)
      // Star entity exists but visible is true — camera ignores the star.
      const eid = state.world.createEntity()
      state.world.addComponent(eid, ComponentType.Position, { x: 5, y: 7 })
      state.world.addComponent(eid, ComponentType.Velocity, { dx: 1, dy: 1 })
      state.world.addComponent(eid, ComponentType.ShootingStarData, {
        length: 4,
        age: 0,
        willLand: true,
        landingTarget: { ...state.player },
        forPlayerSpawn: true,
      })
      state.world.addComponent(eid, ComponentType.EntityTag, 'shootingStar')
      state.playerSpawn.meteorEntityId = eid
      state.playerSpawn.visible = true

      updateCamera(state)

      const visibleWidth = state.viewportWidth - state.rightInsetTiles
      const expectedX = state.player.x - Math.floor(visibleWidth / 2)
      expect(state.camera.x).toBe(expectedX)
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
  // and the gameloop's player-spawn-trigger system firing. In production,
  // completeGenesis schedules the boot title card and defers the spawn
  // ceremony to finalizeGenesisHandoff (gameLoop fires it at hold
  // midpoint, under full-black cover). With skipTitleCard:true the
  // handoff runs inline; we use that path here to keep the test
  // synchronous and assert that onGenesisComplete fires as soon as the
  // handoff completes.
  describe('completeGenesis triggers spawn ceremony (skip-title-card path)', () => {
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

      completeGenesis(state, { skipTitleCard: true })

      expect(state.playerSpawn.visible).toBe(false)
      expect(state.playerSpawn.triggeredAt).not.toBe(0)
      expect(state.playerSpawn.meteorEntityId).not.toBeNull()
    })
  })
})
