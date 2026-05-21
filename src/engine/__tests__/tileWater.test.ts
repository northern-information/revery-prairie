import { RAIN_FRONT_FRINGE, RAIN_FRONT_WIDTH, WATER_DRAIN_RATE, WATER_MAX, WATER_RAIN_FILL } from '../constants'
import { posKey } from '../position'
import { createGameState } from '../state'
import { isInRainFront, tickTileWater, windToFrontAxis } from '../tileWater'
import { Sky, TileType, WindDirection, Zone } from '../types'
import { clearAroundPlayer, createTestState } from './helpers'
import { beforeEach, describe, expect, it } from 'vitest'

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
          if (tile === TileType.Dirt || tile === TileType.Flora || tile === TileType.BurntFlora) {
            expect(state.tileWater.get(key)).toBe(WATER_MAX)
            if (tile === TileType.Dirt) hasDirt = true
            if (tile === TileType.Flora) hasClover = true
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
      // Position rain front so player.x+1 lands in the core zone (not the
      // fringe). With RAIN_FRONT_FRINGE=8 the core starts at offset 8, so
      // place the front 12 tiles behind the test tile to land solidly in core.
      // SW maps to { axis: 'x', sign: 1 } in the rotated cardinal frame
      // (precis-thinktank-v5 round 1), matching what the tests below assume:
      // a front advancing along +x. Swapped from the old WindDirection.E.
      state.weather.windDirection = WindDirection.SW
      state.rainFrontOffset = state.player.x + 1 - 12
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
      state.precipitationIntensity = 1

      tickTileWater(state, Zone.Overworld)

      expect(state.tileWater.get(key)).toBe(Math.min(50 + WATER_RAIN_FILL, WATER_MAX))
    })

    it('does not exceed WATER_MAX when raining', () => {
      const key = posKey(state.player.x + 1, state.player.y)
      state.tileWater.set(key, WATER_MAX)
      state.weather.sky = Sky.Rain
      state.precipitationIntensity = 1

      tickTileWater(state, Zone.Overworld)

      expect(state.tileWater.get(key)).toBe(WATER_MAX)
    })

    it('does not go below 0 when draining', () => {
      const key = posKey(state.player.x + 1, state.player.y)
      state.tileWater.set(key, 0.1)

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
      state.map[y][x] = { type: TileType.Flora }

      // Water should still be 75
      expect(state.tileWater.get(key)).toBe(75)
    })

    it('tileWater persists when clover becomes dirt', () => {
      const x = state.player.x + 1
      const y = state.player.y
      const key = posKey(x, y)

      // Start as clover with some water
      state.map[y][x] = { type: TileType.Flora }
      state.tileWater.set(key, 60)

      // Change to dirt (like harvest/death)
      state.map[y][x] = { type: TileType.Dirt }

      // Water should still be 60
      expect(state.tileWater.get(key)).toBe(60)
    })

    it('does not hydrate when precipitationIntensity is 0 even if sky is rain', () => {
      const key = posKey(state.player.x + 1, state.player.y)
      state.tileWater.set(key, 50)
      state.weather.sky = Sky.Rain
      state.precipitationIntensity = 0

      tickTileWater(state, Zone.Overworld)

      expect(state.tileWater.get(key)).toBe(50 - WATER_DRAIN_RATE)
    })

  })

  describe('isInRainFront', () => {
    let state: GameState

    beforeEach(() => {
      state = createTestState()
      // SW maps to { axis: 'x', sign: 1 } in the rotated cardinal frame
      // (precis-thinktank-v5 round 1), matching what the tests below assume:
      // a front advancing along +x. Swapped from the old WindDirection.E.
      state.weather.windDirection = WindDirection.SW
      state.rainFrontOffset = 0
    })

    it('returns hit=true with edgeAlpha=1 for tiles in the core zone', () => {
      // Core zone: dist in [FRINGE, WIDTH - FRINGE)
      // With offset 0, wind E, tile x = FRINGE + 1 should be solidly in core
      const result = isInRainFront(state, RAIN_FRONT_FRINGE + 1, 0)
      expect(result.hit).toBe(true)
      expect(result.edgeAlpha).toBe(1)
    })

    it('returns hit=false for tiles outside the front', () => {
      const result = isInRainFront(state, RAIN_FRONT_WIDTH + 5, 0)
      expect(result.hit).toBe(false)
      expect(result.edgeAlpha).toBe(0)
    })

    it('fringe produces a mix of included and excluded tiles', () => {
      // Sample many y positions at a fixed x in the leading fringe zone.
      // dist=3 (middle of fringe) should produce a mix — not all in, not all out.
      const x = 3 // dist=3 from front at offset 0
      let hits = 0
      let misses = 0
      for (let y = 0; y < 200; y++) {
        const result = isInRainFront(state, x, y)
        if (result.hit) hits++
        else misses++
      }
      expect(hits).toBeGreaterThan(0)
      expect(misses).toBeGreaterThan(0)
    })

    it('fringe noise is deterministic — same tile always returns same result', () => {
      const x = 2
      const y = 7
      const first = isInRainFront(state, x, y)
      const second = isInRainFront(state, x, y)
      expect(first.hit).toBe(second.hit)
      expect(first.edgeAlpha).toBe(second.edgeAlpha)
    })

    it('fringe tiles have edgeAlpha < 1 when hit', () => {
      // Sample fringe tiles that are hit — they should have alpha < 1
      const x = 2 // in leading fringe, dist=2
      let foundHitWithReducedAlpha = false
      for (let y = 0; y < 200; y++) {
        const result = isInRainFront(state, x, y)
        if (result.hit && result.edgeAlpha < 1) {
          foundHitWithReducedAlpha = true
          break
        }
      }
      expect(foundHitWithReducedAlpha).toBe(true)
    })
  })
})

// Golden fixture for the rotated cardinal frame (precis-thinktank-v5 round 1).
// Pins each cardinal's (axis, sign) return so the old frame cannot be
// reintroduced by accident. Cardinals sweep along iso diagonals (u = x + y,
// v = x - y); ordinals sweep along storage axes.
describe('windToFrontAxis rotated frame', () => {
  it('N → axis u, sign -1 (front enters at the diamond top tip)', () => {
    expect(windToFrontAxis(WindDirection.N)).toEqual({ axis: 'u', sign: -1 })
  })
  it('S → axis u, sign +1 (front enters at the diamond bottom tip)', () => {
    expect(windToFrontAxis(WindDirection.S)).toEqual({ axis: 'u', sign: 1 })
  })
  it('E → axis v, sign -1 (front enters at the diamond right tip)', () => {
    expect(windToFrontAxis(WindDirection.E)).toEqual({ axis: 'v', sign: -1 })
  })
  it('W → axis v, sign +1 (front enters at the diamond left tip)', () => {
    expect(windToFrontAxis(WindDirection.W)).toEqual({ axis: 'v', sign: 1 })
  })
  it('NE → axis x, sign -1 (front enters from storage +x edge)', () => {
    expect(windToFrontAxis(WindDirection.NE)).toEqual({ axis: 'x', sign: -1 })
  })
  it('SE → axis y, sign -1 (front enters from storage +y edge)', () => {
    expect(windToFrontAxis(WindDirection.SE)).toEqual({ axis: 'y', sign: -1 })
  })
  it('SW → axis x, sign +1 (front enters from storage -x edge)', () => {
    expect(windToFrontAxis(WindDirection.SW)).toEqual({ axis: 'x', sign: 1 })
  })
  it('NW → axis y, sign +1 (front enters from storage -y edge)', () => {
    expect(windToFrontAxis(WindDirection.NW)).toEqual({ axis: 'y', sign: 1 })
  })
})
