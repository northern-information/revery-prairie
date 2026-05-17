import { FIRE_REVERY_MAX_SPREAD, WATER_MAX, WILDFIRE_MAX_SPREAD } from '../constants'
import { spreadWildfire } from '../lightning'
import { posKey } from '../position'
import { CloverStage, TileType } from '../types'
import { clearAroundPlayer, createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

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

      const burned = spreadWildfire(state, 0, x, y)

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

      const burned = spreadWildfire(state, 0, state.player.x + 5, state.player.y + 5, FIRE_REVERY_MAX_SPREAD)
      expect(burned.size).toBeLessThanOrEqual(FIRE_REVERY_MAX_SPREAD)
      expect(burned.size).toBeGreaterThan(0)
    })
  })

  describe('lightning uses default max spread', () => {
    it('allows spread up to WILDFIRE_MAX_SPREAD (exceeding FIRE_REVERY_MAX_SPREAD)', () => {
      // BFS spread is probabilistic, so run multiple trials.
      // Reuse a single state and reset the map each trial to avoid
      // expensive genesis precomputation on every iteration.
      const state = createTestState()
      let maxBurned = 0
      for (let trial = 0; trial < 50; trial++) {
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
        state.burnScars = new Set<string>()

        const burned = spreadWildfire(state, 0, state.player.x + 5, state.player.y + 5)
        expect(burned.size).toBeLessThanOrEqual(WILDFIRE_MAX_SPREAD)
        if (burned.size > maxBurned) maxBurned = burned.size
      }
      // Over 50 trials on an all-dry field, at least one should exceed FIRE_REVERY_MAX_SPREAD
      expect(maxBurned).toBeGreaterThan(FIRE_REVERY_MAX_SPREAD)
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
      const burned = spreadWildfire(state, 0, cx - 1, cy, FIRE_REVERY_MAX_SPREAD)

      // No burned tile should be on the right side of the pond
      for (const key of burned) {
        const [xStr] = key.split(',')
        expect(Number(xStr)).toBeLessThan(cx)
      }
    })
  })
})
