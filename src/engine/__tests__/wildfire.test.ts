import { activateActionBarSlot, assignActionBarSlot } from '../actionBar'
import { FIRE_REVERY_MAX_SPREAD, SOIL_HEALTH_FIRE_REVERY_BONUS, WATER_MAX, WILDFIRE_MAX_SPREAD } from '../constants'
import { ComponentType } from '../ecs/types'
import { spreadWildfire } from '../lightning'
import { posKey } from '../position'
import { CloverStage, TileType } from '../types'
import { clearAroundPlayer, createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

/**
 * Fills a rectangular area with dry clover and sets up lifecycle + water.
 */
const fillDryClover = (state: ReturnType<typeof createTestState>, cx: number, cy: number, radius: number): void => {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx
      const y = cy + dy
      if (y >= 0 && y < state.mapHeight && x >= 0 && x < state.mapWidth) {
        state.map[y][x] = { type: TileType.Clover }
        state.cloverLifecycle.set(posKey(x, y), {
          stage: CloverStage.Healthy,
          stageStartTime: 0,
          hasLight: true,
        })
        state.tileWater.set(posKey(x, y), 0)
      }
    }
  }
}

describe('wildfire spread', () => {
  describe('forced origin ignition', () => {
    it('burns wet clover at the origin by forcing water to 0', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const x = state.player.x + 5
      const y = state.player.y + 5
      state.map[y][x] = { type: TileType.Clover }
      state.cloverLifecycle.set(posKey(x, y), {
        stage: CloverStage.Healthy,
        stageStartTime: 0,
        hasLight: true,
      })
      state.tileWater.set(posKey(x, y), WATER_MAX)

      const burned = spreadWildfire(state, x, y)

      expect(burned.size).toBe(1)
      expect(burned.has(posKey(x, y))).toBe(true)
      expect(state.tileWater.get(posKey(x, y))).toBe(0)
      expect(state.map[y][x].type).toBe(TileType.BurntClover)
    })
  })

  describe('fire revery max spread cap', () => {
    it('limits spread to FIRE_REVERY_MAX_SPREAD when passed as maxSpread', () => {
      const state = createTestState()
      // Fill entire map with dry clover for maximum spread potential
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

      const burned = spreadWildfire(state, state.player.x + 5, state.player.y + 5, FIRE_REVERY_MAX_SPREAD)
      expect(burned.size).toBeLessThanOrEqual(FIRE_REVERY_MAX_SPREAD)
      expect(burned.size).toBeGreaterThan(0)
    })
  })

  describe('lightning uses default max spread', () => {
    it('allows spread up to WILDFIRE_MAX_SPREAD (exceeding FIRE_REVERY_MAX_SPREAD)', () => {
      // BFS spread is probabilistic, so run multiple trials
      let maxBurned = 0
      for (let trial = 0; trial < 50; trial++) {
        const state = createTestState()
        // Fill entire map with dry clover
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

        const burned = spreadWildfire(state, state.player.x + 5, state.player.y + 5)
        expect(burned.size).toBeLessThanOrEqual(WILDFIRE_MAX_SPREAD)
        if (burned.size > maxBurned) maxBurned = burned.size
      }
      // Over 50 trials on an all-dry field, at least one should exceed FIRE_REVERY_MAX_SPREAD
      expect(maxBurned).toBeGreaterThan(FIRE_REVERY_MAX_SPREAD)
    })
  })

  describe('fire revery creates wildfire ECS entity', () => {
    it('creates a wildfire entity when clover cluster burns more than 1 tile', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)

      // Default facing is 'down' → facing tile is (x, y+1)
      const facing = { x: state.player.x, y: state.player.y + 1 }
      fillDryClover(state, facing.x, facing.y, 3)

      // Assign fire revery to action bar
      state.reveries = ['fire']
      assignActionBarSlot(state, 0, 'revery', 'fire')

      const now = 10000
      activateActionBarSlot(state, 0, now)

      // Check for wildfire ECS entity
      const wildfireEntities = [...state.world.query(ComponentType.EntityTag)].filter(
        eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'wildfire'
      )
      expect(wildfireEntities.length).toBeGreaterThan(0)

      // Verify it has MultiPosition and TimedEffect
      const eid = wildfireEntities[0]
      const multiPos = state.world.getComponent(eid, ComponentType.MultiPosition)
      expect(multiPos).toBeTruthy()
      if (multiPos) {
        expect(multiPos.positions.length).toBeGreaterThan(1)
      }

      const timedEffect = state.world.getComponent(eid, ComponentType.TimedEffect)
      expect(timedEffect).toBeTruthy()
      if (timedEffect) {
        expect(timedEffect.kind).toBe('wildfire')
        expect(timedEffect.startTime).toBe(now)
      }
    })
  })

  describe('fire on dirt does not spread', () => {
    it('applies soil health but does not burn or create wildfire entity', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)

      // Default facing is 'down' → facing tile is (x, y+1)
      const facing = { x: state.player.x, y: state.player.y + 1 }
      state.map[facing.y][facing.x] = { type: TileType.Dirt }
      state.soilHealth.set(posKey(facing.x, facing.y), 10)

      state.reveries = ['fire']
      assignActionBarSlot(state, 0, 'revery', 'fire')

      const now = 10000
      activateActionBarSlot(state, 0, now)

      // Tile stays dirt
      expect(state.map[facing.y][facing.x].type).toBe(TileType.Dirt)

      // Soil health increased
      const after = state.soilHealth.get(posKey(facing.x, facing.y)) ?? 0
      expect(after).toBe(10 + SOIL_HEALTH_FIRE_REVERY_BONUS)

      // No wildfire entity
      const wildfireEntities = [...state.world.query(ComponentType.EntityTag)].filter(
        eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'wildfire'
      )
      expect(wildfireEntities.length).toBe(0)
    })
  })

  describe('single tile burn creates no wildfire entity', () => {
    it('does not create wildfire entity when only 1 tile burns', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)

      // Isolated clover tile — no clover neighbors (default facing 'down' → y+1)
      const facing = { x: state.player.x, y: state.player.y + 1 }
      state.map[facing.y][facing.x] = { type: TileType.Clover }
      state.cloverLifecycle.set(posKey(facing.x, facing.y), {
        stage: CloverStage.Healthy,
        stageStartTime: 0,
        hasLight: true,
      })
      state.tileWater.set(posKey(facing.x, facing.y), 0)

      state.reveries = ['fire']
      assignActionBarSlot(state, 0, 'revery', 'fire')

      const now = 10000
      activateActionBarSlot(state, 0, now)

      // Tile should be burnt
      expect(state.map[facing.y][facing.x].type).toBe(TileType.BurntClover)

      // No wildfire entity (burned.size === 1, threshold is > 1)
      const wildfireEntities = [...state.world.query(ComponentType.EntityTag)].filter(
        eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'wildfire'
      )
      expect(wildfireEntities.length).toBe(0)
    })
  })

  describe('water barrier stops fire revery spread', () => {
    it('does not spread across pond tiles', () => {
      const state = createTestState()
      clearAroundPlayer(state, 15)
      const cx = state.player.x + 5
      const cy = state.player.y + 5

      // Create dry clover field split by a vertical pond line
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (dx === 0) continue // pond column
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
        // Pond column
        state.ponds.add(posKey(cx, cy + dy))
        state.map[cy + dy][cx] = { type: TileType.Dirt }
      }

      // Start fire on the left side
      const burned = spreadWildfire(state, cx - 1, cy, FIRE_REVERY_MAX_SPREAD)

      // No burned tile should be on the right side of the pond
      for (const key of burned) {
        const [xStr] = key.split(',')
        expect(Number(xStr)).toBeLessThan(cx)
      }
    })
  })
})
