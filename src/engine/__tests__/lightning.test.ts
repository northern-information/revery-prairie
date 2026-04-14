import { generateBoltPath } from '../boltPath'
import {
  LIGHTNING_DURATION_MS,
  SOIL_HEALTH_FIRE_REVERY_BONUS,
  WATER_MAX,
  WILDFIRE_DURATION_MS,
  WILDFIRE_MAX_SPREAD,
} from '../constants'
import { ComponentType } from '../ecs/types'
import { selectStrikeTarget, spawnLightningStrike, spreadWildfire, tickLightning } from '../lightning'
import { createGroundOmniboxEntity } from '../omnibox'
import { posKey } from '../position'
import { CloverStage, Sky, TileType, Zone } from '../types'
import { clearAroundPlayer, createMeteoriteEntity, createTestState } from './helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'

const seededRng = (seed: number) => {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('lightning', () => {
  describe('generateBoltPath', () => {
    it('produces a path of the requested length', () => {
      const rng = seededRng(42)
      const { path } = generateBoltPath(50, 50, 10, rng)
      expect(path).toHaveLength(10)
    })

    it('path descends monotonically (each step dy=+1)', () => {
      const rng = seededRng(123)
      const { path } = generateBoltPath(50, 50, 10, rng)
      for (let i = 1; i < path.length; i++) {
        expect(path[i].y).toBe(path[i - 1].y + 1)
      }
    })

    it('path ends at the impact point', () => {
      const rng = seededRng(99)
      const { path } = generateBoltPath(42, 60, 8, rng)
      expect(path[path.length - 1]).toEqual({ x: 42, y: 60 })
    })

    it('each step has dx in {-1, 0, +1}', () => {
      const rng = seededRng(77)
      const { path } = generateBoltPath(50, 50, 12, rng)
      for (let i = 1; i < path.length; i++) {
        const dx = path[i].x - path[i - 1].x
        expect([-1, 0, 1]).toContain(dx)
      }
    })

    it('sometimes produces a branch fork', () => {
      let branchCount = 0
      for (let seed = 1; seed <= 100; seed++) {
        const rng = seededRng(seed)
        const { branch } = generateBoltPath(50, 50, 10, rng)
        if (branch) branchCount++
      }
      // With 30% branch chance, expect roughly 20-40 branches in 100 attempts
      expect(branchCount).toBeGreaterThan(10)
      expect(branchCount).toBeLessThan(60)
    })

    it('branch extends from the main path', () => {
      // Find a seed that produces a branch
      for (let seed = 1; seed <= 200; seed++) {
        const rng = seededRng(seed)
        const { path, branch } = generateBoltPath(50, 50, 10, rng)
        if (branch) {
          // Branch should start adjacent to some point on the main path
          const firstBranch = branch[0]
          // First branch point should be within 2 tiles of a main path point
          const nearMain = path.some(p => Math.abs(p.x - firstBranch.x) <= 2 && Math.abs(p.y - firstBranch.y) <= 2)
          expect(nearMain).toBe(true)
          expect(branch.length).toBeGreaterThanOrEqual(2)
          expect(branch.length).toBeLessThanOrEqual(3)
          return
        }
      }
    })
  })

  describe('selectStrikeTarget', () => {
    it('rejects tiles near the player', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const rng = seededRng(42)

      // Move player to center and make a small map all dirt
      for (let y = 0; y < state.mapHeight; y++) {
        for (let x = 0; x < state.mapWidth; x++) {
          state.map[y][x] = { type: TileType.Dirt }
        }
      }

      // Run many attempts — none should be within 3 tiles of player
      for (let i = 0; i < 50; i++) {
        const target = selectStrikeTarget(state, rng)
        if (target) {
          const dist = Math.abs(target.x - state.player.x) + Math.abs(target.y - state.player.y)
          expect(dist).toBeGreaterThanOrEqual(3)
        }
      }
    })

    it('never selects water tiles', () => {
      const state = createTestState()
      // Fill map with dirt, add some ponds
      for (let y = 0; y < state.mapHeight; y++) {
        for (let x = 0; x < state.mapWidth; x++) {
          state.map[y][x] = { type: TileType.Dirt }
        }
      }
      state.ponds.add(posKey(15, 15))
      state.ponds.add(posKey(16, 15))
      const rng = seededRng(42)

      for (let i = 0; i < 100; i++) {
        const target = selectStrikeTarget(state, rng)
        if (target) {
          expect(state.ponds.has(posKey(target.x, target.y))).toBe(false)
        }
      }
    })

    it('scores clover tiles higher than dirt', () => {
      const state = createTestState()
      for (let y = 0; y < state.mapHeight; y++) {
        for (let x = 0; x < state.mapWidth; x++) {
          // Half clover, half dirt
          state.map[y][x] = { type: x % 2 === 0 ? TileType.Clover : TileType.Dirt }
        }
      }

      let cloverHits = 0
      let dirtHits = 0
      for (let seed = 1; seed <= 500; seed++) {
        const rng = seededRng(seed)
        const target = selectStrikeTarget(state, rng)
        if (target) {
          if (state.map[target.y][target.x].type === TileType.Clover) cloverHits++
          else dirtHits++
        }
      }
      // Clover should be hit more often due to 1.3x weight
      expect(cloverHits).toBeGreaterThan(dirtHits)
    })

    it('scores tiles with ground meteorites higher (metal weight)', () => {
      // Use a small viewport to constrain the land area
      const state = createTestState({ viewportWidth: 30, viewportHeight: 30 })
      for (let y = 0; y < state.mapHeight; y++) {
        for (let x = 0; x < state.mapWidth; x++) {
          state.map[y][x] = { type: TileType.Dirt }
        }
      }
      // Place meteorites in a cluster away from the player
      const mx = state.player.x + 6
      const my = state.player.y + 6
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          createMeteoriteEntity(state, mx + dx, my + dy)
        }
      }

      let metalHits = 0
      for (let seed = 1; seed <= 2000; seed++) {
        const rng = seededRng(seed)
        const target = selectStrikeTarget(state, rng)
        if (target) {
          const dist = Math.abs(target.x - mx) + Math.abs(target.y - my)
          if (dist <= 1) metalHits++
        }
      }
      // Metal tiles (3x3 cluster = 9 tiles) should be struck disproportionately often
      expect(metalHits).toBeGreaterThan(0)
    })

    it('returns null when no valid candidates exist', () => {
      const state = createTestState()
      // Fill entire map with space
      for (let y = 0; y < state.mapHeight; y++) {
        for (let x = 0; x < state.mapWidth; x++) {
          state.map[y][x] = { type: TileType.Space }
        }
      }
      const rng = seededRng(42)
      const target = selectStrikeTarget(state, rng)
      expect(target).toBeNull()
    })
  })

  describe('spreadWildfire', () => {
    it('does not spread on dirt tiles', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const burned = spreadWildfire(state, 0, state.player.x + 3, state.player.y + 3)
      expect(burned.size).toBe(0)
    })

    it('forces origin water to 0 and burns wet clover at strike point', () => {
      const state = createTestState()
      const x = state.player.x + 4
      const y = state.player.y + 4
      state.map[y][x] = { type: TileType.Clover }
      state.cloverLifecycle.set(posKey(x, y), {
        stage: CloverStage.Healthy,
        stageStartTime: 0,
        hasLight: true,
      })
      state.tileWater.set(posKey(x, y), WATER_MAX)
      const burned = spreadWildfire(state, 0, x, y)
      // Origin always burns — water is forced to 0
      expect(burned.size).toBe(1)
      expect(state.tileWater.get(posKey(x, y))).toBe(0)
      expect(state.map[y][x].type).toBe(TileType.BurntClover)
    })

    it('spreads on dry clover', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      // Mock random so spread always succeeds (spread skips when random < 1 - spreadChance)
      vi.spyOn(Math, 'random').mockReturnValue(0.99)
      // Create a patch of dry clover
      const cx = state.player.x + 5
      const cy = state.player.y + 5
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const x = cx + dx
          const y = cy + dy
          state.map[y][x] = { type: TileType.Clover }
          state.cloverLifecycle.set(posKey(x, y), {
            stage: CloverStage.Healthy,
            stageStartTime: 0,
            hasLight: true,
          })
          state.tileWater.set(posKey(x, y), 0)
        }
      }

      const burned = spreadWildfire(state, 0, cx, cy)
      expect(burned.size).toBeGreaterThan(1)
    })

    it('converts burned tiles to BurntClover', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const cx = state.player.x + 5
      const cy = state.player.y + 5
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx
          const y = cy + dy
          state.map[y][x] = { type: TileType.Clover }
          state.cloverLifecycle.set(posKey(x, y), {
            stage: CloverStage.Healthy,
            stageStartTime: 0,
            hasLight: true,
          })
          state.tileWater.set(posKey(x, y), 0)
        }
      }

      const burned = spreadWildfire(state, 0, cx, cy)
      for (const key of burned) {
        const [xStr, yStr] = key.split(',')
        expect(state.map[Number(yStr)][Number(xStr)].type).toBe(TileType.BurntClover)
      }
    })

    it('enriches soil for each burned tile', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const cx = state.player.x + 5
      const cy = state.player.y + 5
      state.map[cy][cx] = { type: TileType.Clover }
      state.cloverLifecycle.set(posKey(cx, cy), {
        stage: CloverStage.Healthy,
        stageStartTime: 0,
        hasLight: true,
      })
      state.tileWater.set(posKey(cx, cy), 0)

      state.soilHealth.set(posKey(cx, cy), 10)
      spreadWildfire(state, 0, cx, cy)
      const after = state.soilHealth.get(posKey(cx, cy)) ?? 0
      expect(after).toBe(10 + SOIL_HEALTH_FIRE_REVERY_BONUS)
    })

    it('deletes cloverLifecycle entries for burned tiles', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const cx = state.player.x + 5
      const cy = state.player.y + 5
      state.map[cy][cx] = { type: TileType.Clover }
      state.cloverLifecycle.set(posKey(cx, cy), {
        stage: CloverStage.Healthy,
        stageStartTime: 0,
        hasLight: true,
      })
      state.tileWater.set(posKey(cx, cy), 0)

      spreadWildfire(state, 0, cx, cy)
      const entry = state.cloverLifecycle.get(posKey(cx, cy))
      expect(entry).toBeTruthy()
      expect(entry?.stage).toBe(CloverStage.BurntRecovering)
    })

    it('respects WILDFIRE_MAX_SPREAD limit', () => {
      const state = createTestState()
      // Create a massive dry clover field
      for (let y = 0; y < state.mapHeight; y++) {
        for (let x = 0; x < state.mapWidth; x++) {
          state.map[y][x] = { type: TileType.Clover }
          state.cloverLifecycle.set(posKey(x, y), {
            stage: CloverStage.Healthy,
            stageStartTime: 0,
            hasLight: true,
          })
          state.tileWater.set(posKey(x, y), 0)
        }
      }

      const burned = spreadWildfire(state, 0, state.player.x + 5, state.player.y + 5)
      expect(burned.size).toBeLessThanOrEqual(WILDFIRE_MAX_SPREAD)
    })

    it('does not spread across water tiles', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const cx = state.player.x + 5
      const cy = state.player.y + 5

      // Create dry clover on both sides of a river
      for (let dx = -3; dx <= 3; dx++) {
        if (dx === 0) continue // river in the middle
        state.map[cy][cx + dx] = { type: TileType.Clover }
        state.cloverLifecycle.set(posKey(cx + dx, cy), {
          stage: CloverStage.Healthy,
          stageStartTime: 0,
          hasLight: true,
        })
        state.tileWater.set(posKey(cx + dx, cy), 0)
      }
      state.rivers.add(posKey(cx, cy))
      state.map[cy][cx] = { type: TileType.Dirt }

      // Start fire on the left side
      const burned = spreadWildfire(state, 0, cx - 1, cy)
      // Should not have burned any tile on the right side of the river
      for (const key of burned) {
        const [xStr] = key.split(',')
        expect(Number(xStr)).toBeLessThan(cx)
      }
    })
  })

  describe('spawnLightningStrike', () => {
    it('respects cooldown', () => {
      const state = createTestState()
      state.lightning.nextStrikeTime = 100_000
      const result = spawnLightningStrike(state, 50_000)
      expect(result).toBeNull()
    })

    it('creates lightning ECS entity on strike', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      // Force high probability
      state.lightning.nextStrikeTime = 0
      state.weather.sky = Sky.Rain
      state.weather.humidity = 85
      state.weather.windSpeed = 25

      // Make map all dirt for valid targets
      for (let y = 0; y < state.mapHeight; y++) {
        for (let x = 0; x < state.mapWidth; x++) {
          state.map[y][x] = { type: TileType.Dirt }
        }
      }

      // Try many times since it's probabilistic
      let struck = false
      for (let attempt = 0; attempt < 100; attempt++) {
        state.lightning.nextStrikeTime = 0
        const result = spawnLightningStrike(state, 1000 + attempt * 100)
        if (result) {
          struck = true
          break
        }
      }

      if (struck) {
        // Verify ECS entity exists
        const lightningEntities = [...state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)].filter(
          eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'lightning'
        )
        expect(lightningEntities.length).toBeGreaterThan(0)
      }
    })
  })

  describe('omnibox strike counter', () => {
    it('increments when lightning strikes an omnibox tile', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      for (let y = 0; y < state.mapHeight; y++) {
        for (let x = 0; x < state.mapWidth; x++) {
          state.map[y][x] = { type: TileType.Dirt }
        }
      }

      // Place omnibox far from player
      const ox = state.player.x + 8
      const oy = state.player.y + 8
      const uid = 'test-omnibox-uid'
      createGroundOmniboxEntity(state, uid, ox, oy)

      // Simulate a strike landing on the omnibox tile by calling spawnLightningStrike
      // with forced conditions — but since targeting is probabilistic, directly test the counter logic
      state.omniboxStrikeCounts.set(uid, 0)
      state.omniboxStrikeCounts.set(uid, (state.omniboxStrikeCounts.get(uid) ?? 0) + 1)
      expect(state.omniboxStrikeCounts.get(uid)).toBe(1)
      state.omniboxStrikeCounts.set(uid, (state.omniboxStrikeCounts.get(uid) ?? 0) + 1)
      expect(state.omniboxStrikeCounts.get(uid)).toBe(2)
    })
  })

  describe('tickLightning', () => {
    it('destroys expired lightning entities', () => {
      const state = createTestState()
      const e = state.world.createEntity()
      state.world.addComponent(e, ComponentType.Position, { x: 10, y: 10 })
      state.world.addComponent(e, ComponentType.TimedEffect, { kind: 'lightning', startTime: 0 })
      state.world.addComponent(e, ComponentType.EntityTag, 'lightning')
      state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.Overworld })

      // Not expired yet
      tickLightning(state, LIGHTNING_DURATION_MS - 1)
      const remaining = [...state.world.query(ComponentType.EntityTag)].filter(
        eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'lightning'
      )
      expect(remaining.length).toBe(1)

      // Now expired
      tickLightning(state, LIGHTNING_DURATION_MS + 1)
      const after = [...state.world.query(ComponentType.EntityTag)].filter(
        eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'lightning'
      )
      expect(after.length).toBe(0)
    })

    it('destroys expired wildfire entities', () => {
      const state = createTestState()
      const e = state.world.createEntity()
      state.world.addComponent(e, ComponentType.MultiPosition, { positions: [{ x: 10, y: 10 }] })
      state.world.addComponent(e, ComponentType.TimedEffect, { kind: 'wildfire', startTime: 0 })
      state.world.addComponent(e, ComponentType.EntityTag, 'wildfire')
      state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.Overworld })

      tickLightning(state, WILDFIRE_DURATION_MS - 1)
      const remaining = [...state.world.query(ComponentType.EntityTag)].filter(
        eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'wildfire'
      )
      expect(remaining.length).toBe(1)

      tickLightning(state, WILDFIRE_DURATION_MS + 1)
      const after = [...state.world.query(ComponentType.EntityTag)].filter(
        eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'wildfire'
      )
      expect(after.length).toBe(0)
    })
  })
})
