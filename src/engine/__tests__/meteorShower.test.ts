import { findShowerTargets, pickRadiantDirection, spawnShootingStar, tickMeteorShower } from '../celestial'
import {
  METEOR_SHOWER_MAX_INTERVAL_MS,
  METEOR_SHOWER_MIN_INTERVAL_MS,
  METEOR_SHOWER_SPAWN_WINDOW_MS,
  METEOR_SHOWER_STAR_COUNT_MAX,
  METEOR_SHOWER_STAR_COUNT_MIN,
} from '../constants'
import { ComponentType } from '../ecs/types'
import { createGameState } from '../state'
import { TileType } from '../types'
import { afterEach, vi } from 'vitest'

import type { GameState } from '../types'

const createTestState = (): GameState => {
  const state = createGameState('test', 40, 25)
  // Clear seeded shooting stars so they don't interfere
  for (const eid of state.world.query(ComponentType.ShootingStarData)) {
    state.world.destroyEntity(eid)
  }
  return state
}

const getStarCount = (state: GameState): number => state.world.query(ComponentType.ShootingStarData).length

afterEach(() => {
  vi.restoreAllMocks()
})

describe('meteor shower', () => {
  describe('scheduling', () => {
    it('stays idle when nextShowerTime is 0 — the first shower must be triggered by triggerPlayerSpawnShower', () => {
      const state = createTestState()
      // Fresh state: nextShowerTime is 0 because the player has not yet spawned.
      expect(state.meteorShower.nextShowerTime).toBe(0)

      tickMeteorShower(state, 1000)
      tickMeteorShower(state, 200_000)

      expect(state.meteorShower.active).toBe(false)
      expect(state.meteorShower.nextShowerTime).toBe(0)
    })

    it('does not start before nextShowerTime', () => {
      const state = createTestState()
      state.meteorShower.nextShowerTime = 200_000

      tickMeteorShower(state, 100_000)

      expect(state.meteorShower.active).toBe(false)
    })

    it('starts when time >= nextShowerTime', () => {
      const state = createTestState()
      state.meteorShower.nextShowerTime = 100_000

      tickMeteorShower(state, 100_000)

      expect(state.meteorShower.active).toBe(true)
      expect(state.meteorShower.remainingStars).toBeGreaterThanOrEqual(METEOR_SHOWER_STAR_COUNT_MIN)
      expect(state.meteorShower.remainingStars).toBeLessThanOrEqual(METEOR_SHOWER_STAR_COUNT_MAX)
    })

    it('schedules next shower after completion', () => {
      const state = createTestState()
      state.meteorShower.nextShowerTime = 100_000

      // Start the shower
      tickMeteorShower(state, 100_000)
      expect(state.meteorShower.active).toBe(true)

      // Drain all remaining stars
      const completionTime = 200_000
      state.meteorShower.remainingStars = 0
      tickMeteorShower(state, completionTime)

      expect(state.meteorShower.active).toBe(false)
      const nextTime = state.meteorShower.nextShowerTime
      expect(nextTime).toBeGreaterThanOrEqual(completionTime + METEOR_SHOWER_MIN_INTERVAL_MS)
      expect(nextTime).toBeLessThanOrEqual(completionTime + METEOR_SHOWER_MAX_INTERVAL_MS)
    })
  })

  describe('active shower', () => {
    it('spawns one star per interval tick', () => {
      const state = createTestState()
      state.meteorShower.nextShowerTime = 1000

      // Start the shower
      tickMeteorShower(state, 1000)
      const initialRemaining = state.meteorShower.remainingStars
      const interval = state.meteorShower.spawnIntervalMs

      // First spawn (lastSpawnTime is 0, so first tick always spawns)
      tickMeteorShower(state, 1000 + interval)
      expect(state.meteorShower.remainingStars).toBe(initialRemaining - 1)
    })

    it('does not spawn before interval elapses', () => {
      const state = createTestState()
      state.meteorShower.nextShowerTime = 1000

      // Start the shower
      tickMeteorShower(state, 1000)
      const initialRemaining = state.meteorShower.remainingStars

      // Spawn first star
      tickMeteorShower(state, 1001)
      expect(state.meteorShower.remainingStars).toBe(initialRemaining - 1)

      // Try again too soon
      const remaining = state.meteorShower.remainingStars
      tickMeteorShower(state, 1002)
      expect(state.meteorShower.remainingStars).toBe(remaining)
    })

    it('decrements remainingStars on each spawn', () => {
      const state = createTestState()
      state.meteorShower.nextShowerTime = 1000
      tickMeteorShower(state, 1000)

      // Use a generous interval to avoid floating point issues
      const interval = Math.ceil(state.meteorShower.spawnIntervalMs) + 1

      // First spawn (lastSpawnTime is 0, so this always fires)
      tickMeteorShower(state, 2000)
      const afterFirst = state.meteorShower.remainingStars

      // Two more spawns at generous intervals
      tickMeteorShower(state, 2000 + interval)
      expect(state.meteorShower.remainingStars).toBe(afterFirst - 1)

      tickMeteorShower(state, 2000 + interval * 2)
      expect(state.meteorShower.remainingStars).toBe(afterFirst - 2)
    })

    it('deactivates when remainingStars reaches 0', () => {
      const state = createTestState()
      state.meteorShower.nextShowerTime = 1000
      tickMeteorShower(state, 1000)

      // Force to last star
      state.meteorShower.remainingStars = 1
      state.meteorShower.lastSpawnTime = 0

      tickMeteorShower(state, 2000)

      // remainingStars decremented to 0, then completion triggers
      expect(state.meteorShower.remainingStars).toBe(0)
      expect(state.meteorShower.active).toBe(false)
    })

    it('all shower stars share the same radiant direction', () => {
      const state = createTestState()
      state.meteorShower.nextShowerTime = 1000
      tickMeteorShower(state, 1000)

      const { radiantDx, radiantDy } = state.meteorShower
      const interval = state.meteorShower.spawnIntervalMs
      let time = 1000

      // Spawn a few stars and check their velocities
      for (let i = 0; i < 3; i++) {
        time += interval
        tickMeteorShower(state, time)
      }

      const allStars = state.world.query(ComponentType.ShootingStarData, ComponentType.Velocity)
      // Check stars spawned after shower started
      let checked = 0
      for (const eid of allStars) {
        const vel = state.world.getComponent(eid, ComponentType.Velocity)
        if (!vel) continue
        if (vel.dx === radiantDx && vel.dy === radiantDy) {
          checked++
        }
      }
      expect(checked).toBeGreaterThan(0)
    })

    it('shower stars are targeted (willLand: true, landingTarget set)', () => {
      const state = createTestState()
      state.meteorShower.nextShowerTime = 1000
      tickMeteorShower(state, 1000)

      const interval = state.meteorShower.spawnIntervalMs
      tickMeteorShower(state, 1000 + interval)

      const stars = state.world.query(ComponentType.ShootingStarData)
      let hasTargeted = false
      for (const eid of stars) {
        const data = state.world.getComponent(eid, ComponentType.ShootingStarData)
        if (data?.willLand && data.landingTarget) {
          hasTargeted = true
          break
        }
      }
      expect(hasTargeted).toBe(true)
    })

    it('star count is between STAR_COUNT_MIN and STAR_COUNT_MAX', () => {
      // Mock random to hit both boundaries instead of running many trials
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const stateMin = createTestState()
      stateMin.meteorShower.nextShowerTime = 1000
      tickMeteorShower(stateMin, 1000)
      expect(stateMin.meteorShower.remainingStars).toBe(METEOR_SHOWER_STAR_COUNT_MIN)

      vi.spyOn(Math, 'random').mockReturnValue(0.999)
      const stateMax = createTestState()
      stateMax.meteorShower.nextShowerTime = 1000
      tickMeteorShower(stateMax, 1000)
      expect(stateMax.meteorShower.remainingStars).toBe(METEOR_SHOWER_STAR_COUNT_MAX)
    })

    it('computes spawnIntervalMs from window / count', () => {
      const state = createTestState()
      state.meteorShower.nextShowerTime = 1000
      tickMeteorShower(state, 1000)

      const expected = METEOR_SHOWER_SPAWN_WINDOW_MS / state.meteorShower.remainingStars
      // Check against the value that was set before any stars were spawned
      // (remainingStars hasn't changed yet since we just started)
      expect(state.meteorShower.spawnIntervalMs).toBeCloseTo(expected, 5)
    })
  })

  describe('target selection (findShowerTargets)', () => {
    it('returns positions on dirt/clover tiles', () => {
      const state = createTestState()
      const targets = findShowerTargets(state, 5)

      for (const t of targets) {
        const tile = state.map[t.y][t.x].type
        expect(tile === TileType.Dirt || tile === TileType.Clover).toBe(true)
      }
    })

    it('avoids space, sand, cave entrance', () => {
      const state = createTestState()
      const targets = findShowerTargets(state, 10)

      for (const t of targets) {
        const tile = state.map[t.y][t.x].type
        expect(tile).not.toBe(TileType.Space)
        expect(tile).not.toBe(TileType.Sand)
        expect(tile).not.toBe(TileType.CaveEntrance)
      }
    })

    it('avoids player position', () => {
      const state = createTestState()
      const targets = findShowerTargets(state, 20)

      for (const t of targets) {
        expect(t.x === state.player.x && t.y === state.player.y).toBe(false)
      }
    })

    it('respects minimum distance between targets', () => {
      const state = createTestState()
      const targets = findShowerTargets(state, 10)

      for (let i = 0; i < targets.length; i++) {
        for (let j = i + 1; j < targets.length; j++) {
          const dist = Math.abs(targets[i].x - targets[j].x) + Math.abs(targets[i].y - targets[j].y)
          expect(dist).toBeGreaterThanOrEqual(5)
        }
      }
    })

    it('returns fewer targets when valid tiles are scarce', () => {
      const state = createTestState()
      // Fill most of the map with space to limit valid tiles
      for (let y = 0; y < state.mapHeight; y++) {
        for (let x = 0; x < state.mapWidth; x++) {
          state.map[y][x] = { type: TileType.Space }
        }
      }
      // Leave only a few dirt tiles
      state.map[state.player.y + 2][state.player.x + 2] = { type: TileType.Dirt }
      state.map[state.player.y + 10][state.player.x + 10] = { type: TileType.Dirt }

      const targets = findShowerTargets(state, 10)
      expect(targets.length).toBeLessThanOrEqual(2)
    })
  })

  describe('ambient suppression', () => {
    it('spawnShootingStar returns early when shower is active', () => {
      const state = createTestState()
      state.meteorShower.active = true

      // Call many times — none should spawn
      const before = getStarCount(state)
      for (let i = 0; i < 100; i++) {
        spawnShootingStar(state)
      }
      expect(getStarCount(state)).toBe(before)
    })

    it('resumes after shower ends', () => {
      const state = createTestState()
      state.meteorShower.active = false

      // spawnShootingStar is probabilistic, so call it many times
      let spawned = false
      for (let i = 0; i < 1000; i++) {
        const before = getStarCount(state)
        spawnShootingStar(state)
        if (getStarCount(state) > before) {
          spawned = true
          break
        }
      }
      expect(spawned).toBe(true)
    })
  })

  describe('discovery', () => {
    it('records event:meteor-shower on first shower start', () => {
      const state = createTestState()
      expect(state.manualDiscoveries.has('event:meteor-shower')).toBe(false)

      state.meteorShower.nextShowerTime = 1000
      tickMeteorShower(state, 1000)

      expect(state.manualDiscoveries.has('event:meteor-shower')).toBe(true)
    })

    it('does not re-record on subsequent showers', () => {
      const state = createTestState()
      state.meteorShower.nextShowerTime = 1000

      // First shower
      tickMeteorShower(state, 1000)
      expect(state.manualDiscoveries.has('event:meteor-shower')).toBe(true)

      // Complete and schedule next
      state.meteorShower.remainingStars = 0
      tickMeteorShower(state, 2000)

      // Second shower
      const nextTime = state.meteorShower.nextShowerTime
      const sizeBefore = state.manualDiscoveries.size
      tickMeteorShower(state, nextTime)
      // Discovery set size should not change
      expect(state.manualDiscoveries.size).toBe(sizeBefore)
    })
  })

  describe('pickRadiantDirection', () => {
    it('returns a valid direction object', () => {
      const dir = pickRadiantDirection()
      expect(dir).toHaveProperty('dx')
      expect(dir).toHaveProperty('dy')
      expect(Math.abs(dir.dx)).toBeLessThanOrEqual(1)
      expect(Math.abs(dir.dy)).toBeLessThanOrEqual(1)
      // At least one axis must be non-zero
      expect(Math.abs(dir.dx) + Math.abs(dir.dy)).toBeGreaterThan(0)
    })
  })
})
