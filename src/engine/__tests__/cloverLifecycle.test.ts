import { tickFloraLifecycle } from '../floraLifecycle'
import {
  CLOVER_BLACK_DURATION_MS,
  CLOVER_BLINK_RED_DURATION_MS,
  CLOVER_BROWN_DURATION_MS,
  CLOVER_DECOMPOSE_DURATION_MS,
  SOIL_HEALTH_FLORA_DEATH_BONUS,
  SOIL_HEALTH_DEFAULT,
  WATER_MAX,
} from '../constants'
import { posKey } from '../position'
import { FloraStage, Sky, TileType, Zone } from '../types'
import { clearAroundPlayer, createTestState } from './helpers'
import { beforeEach, describe, expect, it } from 'vitest'

import type { GameState } from '../types'

let state: GameState
const px = () => state.player.x
const py = () => state.player.y

beforeEach(() => {
  state = createTestState()
  clearAroundPlayer(state, 5)
  state.weather.sky = Sky.Sun
  state.meteorShower = { ...state.meteorShower, active: false }
})

const placeClover = (x: number, y: number) => {
  state.map[y][x] = { type: TileType.Flora }
  // Ensure tile has water entry (like createGameState does for walkable tiles)
  if (!state.tileWater.has(posKey(x, y))) {
    state.tileWater.set(posKey(x, y), WATER_MAX)
  }
}

describe('tickFloraLifecycle', () => {
  describe('stress detection', () => {
    it('creates healthy entry on first tick for new clover', () => {
      placeClover(px(), py() + 1)
      tickFloraLifecycle(state, Zone.Overworld, 1000)

      const key = posKey(px(), py() + 1)
      const entry = state.floraLifecycle.get(key)
      expect(entry).toBeDefined()
      expect(entry?.stage).toBe(FloraStage.Healthy)
    })

    it('reads water from tileWater, not lifecycle entry', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      // Set tile water to 0 — lifecycle should detect stress
      state.tileWater.set(key, 0)
      tickFloraLifecycle(state, Zone.Overworld, 1000)

      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.Brown)
    })

    it('stays healthy when tile water > 0 and has light', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      state.tileWater.set(key, WATER_MAX)
      tickFloraLifecycle(state, Zone.Overworld, 1000)
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.Healthy)
    })
  })

  describe('stage progression', () => {
    it('stays healthy when water > 0 and has light', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      tickFloraLifecycle(state, Zone.Overworld, 1000)
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.Healthy)
    })

    it('transitions to brown when water reaches 0', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      // Set water to 0 so lifecycle detects stress
      state.tileWater.set(key, 0)

      tickFloraLifecycle(state, Zone.Overworld, 1000)
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.Brown)
    })

    it('cave clover transitions to brown immediately (no light)', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      tickFloraLifecycle(state, Zone.Cave, 1000)
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.Brown)
      expect(state.floraLifecycle.get(key)?.hasLight).toBe(false)
    })

    it('progresses brown → blinkingRed after duration', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      // Enter brown stage
      tickFloraLifecycle(state, Zone.Cave, 1000)
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.Brown)

      // Advance past brown duration
      tickFloraLifecycle(state, Zone.Cave, 1000 + CLOVER_BROWN_DURATION_MS)
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.BlinkingRed)
    })

    it('progresses blinkingRed → black after duration', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      let t = 1000
      tickFloraLifecycle(state, Zone.Cave, t)

      t += CLOVER_BROWN_DURATION_MS
      tickFloraLifecycle(state, Zone.Cave, t)
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.BlinkingRed)

      t += CLOVER_BLINK_RED_DURATION_MS
      tickFloraLifecycle(state, Zone.Cave, t)
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.Black)
    })

    it('progresses black → decomposing after duration', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      let t = 1000
      tickFloraLifecycle(state, Zone.Cave, t)
      t += CLOVER_BROWN_DURATION_MS
      tickFloraLifecycle(state, Zone.Cave, t)
      t += CLOVER_BLINK_RED_DURATION_MS
      tickFloraLifecycle(state, Zone.Cave, t)
      t += CLOVER_BLACK_DURATION_MS
      tickFloraLifecycle(state, Zone.Cave, t)
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.Decomposing)
    })

    it('converts decomposing to dirt and enriches soil', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      let t = 1000
      tickFloraLifecycle(state, Zone.Cave, t)
      t += CLOVER_BROWN_DURATION_MS
      tickFloraLifecycle(state, Zone.Cave, t)
      t += CLOVER_BLINK_RED_DURATION_MS
      tickFloraLifecycle(state, Zone.Cave, t)
      t += CLOVER_BLACK_DURATION_MS
      tickFloraLifecycle(state, Zone.Cave, t)
      t += CLOVER_DECOMPOSE_DURATION_MS
      tickFloraLifecycle(state, Zone.Cave, t)

      expect(state.map[py() + 1][px()].type).toBe(TileType.Dirt)
      expect(state.floraLifecycle.has(key)).toBe(false)
      expect(state.soilHealth.get(key)).toBe(SOIL_HEALTH_DEFAULT + SOIL_HEALTH_FLORA_DEATH_BONUS)
    })
  })

  describe('recovery', () => {
    it('brown stage recovers when watered and lit', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      // Enter brown via cave (no light)
      tickFloraLifecycle(state, Zone.Cave, 1000)
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.Brown)

      // Now give it light and water (overworld with tile water > 0)
      state.tileWater.set(key, 50)
      tickFloraLifecycle(state, Zone.Overworld, 4000)
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.Healthy)
    })

    it('blinkingRed does NOT recover', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      // Advance to blinkingRed
      tickFloraLifecycle(state, Zone.Cave, 1000)
      const entry = state.floraLifecycle.get(key)
      expect(entry).toBeDefined()
      if (!entry) return
      entry.stage = FloraStage.BlinkingRed
      entry.stageStartTime = 1000

      // Try to recover with water and light
      state.tileWater.set(key, 50)
      tickFloraLifecycle(state, Zone.Overworld, 4000)

      // Should still be blinkingRed (or advanced), not healthy
      expect(state.floraLifecycle.get(key)?.stage).not.toBe(FloraStage.Healthy)
    })
  })
})

// harvestClover and cutClover were deleted in precis #1.
// Clover acquisition routes through ruin recovery (precis #5).
