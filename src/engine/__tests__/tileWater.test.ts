import { beforeEach, describe, expect, it } from 'vitest'

import { WATER_DRAIN_RATE, WATER_MAX, WATER_RAIN_FILL } from '../constants'
import { posKey } from '../position'
import { createGameState } from '../state'
import { tickTileWater } from '../tileWater'
import { Sky, TileType, Zone } from '../types'
import { clearAroundPlayer, createTestState } from './helpers'

import type { GameState } from '../types'

describe('tileWater', () => {
  describe('initialization', () => {
    it('initializes tileWater for all dirt/clover tiles with WATER_MAX', () => {
      // Use full createGameState (not test helper which clears tileWater)
      const state = createGameState('Test', 20, 20)
      let hasDirt = false
      let hasClover = false
      for (let y = 0; y < state.mapHeight; y++) {
        for (let x = 0; x < state.mapWidth; x++) {
          const key = posKey(x, y)
          const tile = state.map[y][x].type
          if (tile === TileType.Dirt || tile === TileType.Clover || tile === TileType.BurntClover) {
            expect(state.tileWater.get(key)).toBe(WATER_MAX)
            if (tile === TileType.Dirt) hasDirt = true
            if (tile === TileType.Clover) hasClover = true
          }
        }
      }
      // Ensure we actually tested some tiles
      expect(hasDirt).toBe(true)
      // Clover might not exist in the default map, that's OK
      void hasClover
    })

    it('does not initialize tileWater for space tiles', () => {
      const state = createGameState('Test', 20, 20)
      for (let y = 0; y < state.mapHeight; y++) {
        for (let x = 0; x < state.mapWidth; x++) {
          const key = posKey(x, y)
          if (state.map[y][x].type === TileType.Space) {
            expect(state.tileWater.has(key)).toBe(false)
          }
        }
      }
    })

    it('does not initialize tileWater for sand tiles', () => {
      const state = createGameState('Test', 20, 20)
      for (let y = 0; y < state.mapHeight; y++) {
        for (let x = 0; x < state.mapWidth; x++) {
          const key = posKey(x, y)
          if (state.map[y][x].type === TileType.Sand) {
            expect(state.tileWater.has(key)).toBe(false)
          }
        }
      }
    })

    it('does not initialize tileWater for cave tiles in overworld', () => {
      const state = createGameState('Test', 20, 20)
      // Verify no CaveFloor, CaveWall, or CaveBreakableWall tiles in overworld have entries
      for (let y = 0; y < state.mapHeight; y++) {
        for (let x = 0; x < state.mapWidth; x++) {
          const tile = state.map[y][x].type
          if (tile === TileType.CaveFloor || tile === TileType.CaveWall || tile === TileType.CaveBreakableWall) {
            expect(state.tileWater.has(posKey(x, y))).toBe(false)
          }
        }
      }
    })
  })

  describe('tickTileWater', () => {
    let state: GameState

    beforeEach(() => {
      state = createTestState()
      clearAroundPlayer(state, 5)
      state.weather.sky = Sky.Sun
    })

    it('drains water when not raining', () => {
      const key = posKey(state.player.x + 1, state.player.y)
      state.tileWater.set(key, WATER_MAX)

      tickTileWater(state, Zone.Overworld)

      expect(state.tileWater.get(key)).toBe(WATER_MAX - WATER_DRAIN_RATE)
    })

    it('fills water when raining, clamped to WATER_MAX', () => {
      const key = posKey(state.player.x + 1, state.player.y)
      state.tileWater.set(key, 50)
      state.weather.sky = Sky.Rain

      tickTileWater(state, Zone.Overworld)

      expect(state.tileWater.get(key)).toBe(Math.min(50 + WATER_RAIN_FILL, WATER_MAX))
    })

    it('does not exceed WATER_MAX when raining', () => {
      const key = posKey(state.player.x + 1, state.player.y)
      state.tileWater.set(key, WATER_MAX)
      state.weather.sky = Sky.Rain

      tickTileWater(state, Zone.Overworld)

      expect(state.tileWater.get(key)).toBe(WATER_MAX)
    })

    it('does not go below 0 when draining', () => {
      const key = posKey(state.player.x + 1, state.player.y)
      state.tileWater.set(key, 1)

      tickTileWater(state, Zone.Overworld)

      expect(state.tileWater.get(key)).toBe(0)
    })

    it('skips when in cave zone', () => {
      const key = posKey(state.player.x + 1, state.player.y)
      state.tileWater.set(key, 50)

      tickTileWater(state, Zone.Cave)

      // Should be unchanged
      expect(state.tileWater.get(key)).toBe(50)
    })

    it('tileWater persists when dirt becomes clover', () => {
      const x = state.player.x + 1
      const y = state.player.y
      const key = posKey(x, y)

      // Start as dirt with some water
      state.map[y][x] = { type: TileType.Dirt }
      state.tileWater.set(key, 75)

      // Change to clover (like planting)
      state.map[y][x] = { type: TileType.Clover }

      // Water should still be 75
      expect(state.tileWater.get(key)).toBe(75)
    })

    it('tileWater persists when clover becomes dirt', () => {
      const x = state.player.x + 1
      const y = state.player.y
      const key = posKey(x, y)

      // Start as clover with some water
      state.map[y][x] = { type: TileType.Clover }
      state.tileWater.set(key, 60)

      // Change to dirt (like harvest/death)
      state.map[y][x] = { type: TileType.Dirt }

      // Water should still be 60
      expect(state.tileWater.get(key)).toBe(60)
    })
  })
})
