import { cutClover, harvestClover, tickCloverLifecycle } from '../cloverLifecycle'
import {
  CLOVER_BLACK_DURATION_MS,
  CLOVER_BLINK_RED_DURATION_MS,
  CLOVER_BROWN_DURATION_MS,
  CLOVER_DECOMPOSE_DURATION_MS,
  CLOVER_WATER_DRAIN_RATE,
  CLOVER_WATER_MAX,
  CLOVER_WATER_RAIN_FILL,
  SOIL_HEALTH_CLOVER_DEATH_BONUS,
  SOIL_HEALTH_CUT_BONUS,
  SOIL_HEALTH_DEFAULT,
} from '../constants'
import { placeItem } from '../inventory'
import { posKey } from '../position'
import { CloverStage, Rotation, Sky, TileType, Zone } from '../types'
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
  state.map[y][x] = { type: TileType.Clover }
}

const facingPos = () => {
  // player faces down by default in test state
  return { x: px(), y: py() + 1 }
}

describe('tickCloverLifecycle', () => {
  describe('water meter', () => {
    it('creates healthy entry on first tick for new clover', () => {
      placeClover(px(), py() + 1)
      tickCloverLifecycle(state, Zone.Overworld, 1000)

      const key = posKey(px(), py() + 1)
      const entry = state.cloverLifecycle.get(key)
      expect(entry).toBeDefined()
      expect(entry?.stage).toBe(CloverStage.Healthy)
      expect(entry?.water).toBe(CLOVER_WATER_MAX - CLOVER_WATER_DRAIN_RATE)
    })

    it('drains water each tick when not raining', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      tickCloverLifecycle(state, Zone.Overworld, 1000)
      tickCloverLifecycle(state, Zone.Overworld, 4000)

      const entry = state.cloverLifecycle.get(key)
      expect(entry?.water).toBe(CLOVER_WATER_MAX - CLOVER_WATER_DRAIN_RATE * 2)
    })

    it('refills water when raining on overworld', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      // Drain some water first
      tickCloverLifecycle(state, Zone.Overworld, 1000)
      tickCloverLifecycle(state, Zone.Overworld, 4000)

      // Now rain
      state.weather.sky = Sky.Rain
      tickCloverLifecycle(state, Zone.Overworld, 7000)

      const entry = state.cloverLifecycle.get(key)
      const expectedWater = Math.min(
        CLOVER_WATER_MAX - CLOVER_WATER_DRAIN_RATE * 2 + CLOVER_WATER_RAIN_FILL,
        CLOVER_WATER_MAX
      )
      expect(entry?.water).toBe(expectedWater)
    })

    it('does not refill water in cave', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      state.weather.sky = Sky.Rain
      tickCloverLifecycle(state, Zone.Cave, 1000)

      const entry = state.cloverLifecycle.get(key)
      // Cave gets no rain fill, only drain
      expect(entry?.water).toBe(CLOVER_WATER_MAX - CLOVER_WATER_DRAIN_RATE)
    })
  })

  describe('stage progression', () => {
    it('stays healthy when water > 0 and has light', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      tickCloverLifecycle(state, Zone.Overworld, 1000)
      expect(state.cloverLifecycle.get(key)?.stage).toBe(CloverStage.Healthy)
    })

    it('transitions to brown when water reaches 0', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      // Set water to just above 0 so next drain hits 0
      tickCloverLifecycle(state, Zone.Overworld, 1000)
      const entry = state.cloverLifecycle.get(key)
      expect(entry).toBeDefined()
      if (entry) entry.water = CLOVER_WATER_DRAIN_RATE

      tickCloverLifecycle(state, Zone.Overworld, 4000)
      expect(state.cloverLifecycle.get(key)?.stage).toBe(CloverStage.Brown)
    })

    it('cave clover transitions to brown immediately (no light)', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      tickCloverLifecycle(state, Zone.Cave, 1000)
      expect(state.cloverLifecycle.get(key)?.stage).toBe(CloverStage.Brown)
      expect(state.cloverLifecycle.get(key)?.hasLight).toBe(false)
    })

    it('progresses brown → blinkingRed after duration', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      // Enter brown stage
      tickCloverLifecycle(state, Zone.Cave, 1000)
      expect(state.cloverLifecycle.get(key)?.stage).toBe(CloverStage.Brown)

      // Advance past brown duration
      tickCloverLifecycle(state, Zone.Cave, 1000 + CLOVER_BROWN_DURATION_MS)
      expect(state.cloverLifecycle.get(key)?.stage).toBe(CloverStage.BlinkingRed)
    })

    it('progresses blinkingRed → black after duration', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      let t = 1000
      tickCloverLifecycle(state, Zone.Cave, t)

      t += CLOVER_BROWN_DURATION_MS
      tickCloverLifecycle(state, Zone.Cave, t)
      expect(state.cloverLifecycle.get(key)?.stage).toBe(CloverStage.BlinkingRed)

      t += CLOVER_BLINK_RED_DURATION_MS
      tickCloverLifecycle(state, Zone.Cave, t)
      expect(state.cloverLifecycle.get(key)?.stage).toBe(CloverStage.Black)
    })

    it('progresses black → decomposing after duration', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      let t = 1000
      tickCloverLifecycle(state, Zone.Cave, t)
      t += CLOVER_BROWN_DURATION_MS
      tickCloverLifecycle(state, Zone.Cave, t)
      t += CLOVER_BLINK_RED_DURATION_MS
      tickCloverLifecycle(state, Zone.Cave, t)
      t += CLOVER_BLACK_DURATION_MS
      tickCloverLifecycle(state, Zone.Cave, t)
      expect(state.cloverLifecycle.get(key)?.stage).toBe(CloverStage.Decomposing)
    })

    it('converts decomposing to dirt and enriches soil', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      let t = 1000
      tickCloverLifecycle(state, Zone.Cave, t)
      t += CLOVER_BROWN_DURATION_MS
      tickCloverLifecycle(state, Zone.Cave, t)
      t += CLOVER_BLINK_RED_DURATION_MS
      tickCloverLifecycle(state, Zone.Cave, t)
      t += CLOVER_BLACK_DURATION_MS
      tickCloverLifecycle(state, Zone.Cave, t)
      t += CLOVER_DECOMPOSE_DURATION_MS
      tickCloverLifecycle(state, Zone.Cave, t)

      expect(state.map[py() + 1][px()].type).toBe(TileType.Dirt)
      expect(state.cloverLifecycle.has(key)).toBe(false)
      expect(state.soilHealth.get(key)).toBe(SOIL_HEALTH_DEFAULT + SOIL_HEALTH_CLOVER_DEATH_BONUS)
    })
  })

  describe('recovery', () => {
    it('brown stage recovers when watered and lit', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      // Enter brown via cave (no light)
      tickCloverLifecycle(state, Zone.Cave, 1000)
      expect(state.cloverLifecycle.get(key)?.stage).toBe(CloverStage.Brown)

      // Now give it light and water (overworld, raining)
      state.weather.sky = Sky.Rain
      const entry = state.cloverLifecycle.get(key)
      expect(entry).toBeDefined()
      if (entry) entry.water = 50
      tickCloverLifecycle(state, Zone.Overworld, 4000)
      expect(state.cloverLifecycle.get(key)?.stage).toBe(CloverStage.Healthy)
    })

    it('blinkingRed does NOT recover', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      // Advance to blinkingRed
      tickCloverLifecycle(state, Zone.Cave, 1000)
      const entry = state.cloverLifecycle.get(key)
      expect(entry).toBeDefined()
      if (!entry) return
      entry.stage = CloverStage.BlinkingRed
      entry.stageStartTime = 1000

      // Try to recover
      state.weather.sky = Sky.Rain
      entry.water = 50
      tickCloverLifecycle(state, Zone.Overworld, 4000)

      // Should still be blinkingRed (or advanced), not healthy
      expect(state.cloverLifecycle.get(key)?.stage).not.toBe(CloverStage.Healthy)
    })
  })
})

describe('harvestClover', () => {
  it('harvests facing clover tile into backpack', () => {
    const fp = facingPos()
    placeClover(fp.x, fp.y)

    const result = harvestClover(state)

    expect(result).toBe(true)
    expect(state.map[fp.y][fp.x].type).toBe(TileType.Dirt)
    expect(state.backpack.items.some(i => i.definitionId === 'clover')).toBe(true)
  })

  it('does not enrich soil', () => {
    const fp = facingPos()
    placeClover(fp.x, fp.y)

    harvestClover(state)

    const key = posKey(fp.x, fp.y)
    expect(state.soilHealth.has(key)).toBe(false)
  })

  it('removes lifecycle entry', () => {
    const fp = facingPos()
    placeClover(fp.x, fp.y)
    const key = posKey(fp.x, fp.y)
    state.cloverLifecycle.set(key, {
      stage: CloverStage.Brown,
      stageStartTime: 0,
      water: 0,
      hasLight: true,
    })

    harvestClover(state)

    expect(state.cloverLifecycle.has(key)).toBe(false)
  })

  it('fails when backpack is full', () => {
    const fp = facingPos()
    placeClover(fp.x, fp.y)

    // Fill backpack completely with 1x1 items (clover is 1x1)
    for (let gy = 0; gy < state.backpack.height; gy++) {
      for (let gx = 0; gx < state.backpack.width; gx++) {
        placeItem(state.backpack, 'clover', Rotation.R0, gx, gy)
      }
    }

    const result = harvestClover(state)
    expect(result).toBe(false)
    expect(state.map[fp.y][fp.x].type).toBe(TileType.Clover)
  })

  it('returns false when facing non-clover tile', () => {
    expect(harvestClover(state)).toBe(false)
  })
})

describe('cutClover', () => {
  it('cuts facing clover tile to dirt', () => {
    const fp = facingPos()
    placeClover(fp.x, fp.y)

    const result = cutClover(state)

    expect(result).toBe(true)
    expect(state.map[fp.y][fp.x].type).toBe(TileType.Dirt)
  })

  it('enriches soil', () => {
    const fp = facingPos()
    placeClover(fp.x, fp.y)
    const key = posKey(fp.x, fp.y)

    cutClover(state)

    expect(state.soilHealth.get(key)).toBe(SOIL_HEALTH_DEFAULT + SOIL_HEALTH_CUT_BONUS)
  })

  it('does not add item to backpack', () => {
    const fp = facingPos()
    placeClover(fp.x, fp.y)

    cutClover(state)

    expect(state.backpack.items.length).toBe(0)
  })

  it('removes lifecycle entry', () => {
    const fp = facingPos()
    placeClover(fp.x, fp.y)
    const key = posKey(fp.x, fp.y)
    state.cloverLifecycle.set(key, {
      stage: CloverStage.Brown,
      stageStartTime: 0,
      water: 0,
      hasLight: true,
    })

    cutClover(state)

    expect(state.cloverLifecycle.has(key)).toBe(false)
  })

  it('returns false when facing non-clover tile', () => {
    expect(cutClover(state)).toBe(false)
  })
})
