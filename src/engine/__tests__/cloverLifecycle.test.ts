import { cutClover, harvestClover, HarvestResult, tickCloverLifecycle } from '../floraLifecycle'
import {
  CLOVER_BLACK_DURATION_MS,
  CLOVER_BLINK_RED_DURATION_MS,
  CLOVER_BROWN_DURATION_MS,
  CLOVER_DECOMPOSE_DURATION_MS,
  SOIL_HEALTH_CLOVER_DEATH_BONUS,
  SOIL_HEALTH_CUT_BONUS,
  SOIL_HEALTH_DEFAULT,
  WATER_MAX,
} from '../constants'
import { placeItem } from '../inventory'
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

const facingPos = () => {
  // player faces down by default in test state
  const pos = { x: px(), y: py() + 1 }
  state.facingEntityPos = pos
  return pos
}

describe('tickCloverLifecycle', () => {
  describe('stress detection', () => {
    it('creates healthy entry on first tick for new clover', () => {
      placeClover(px(), py() + 1)
      tickCloverLifecycle(state, Zone.Overworld, 1000)

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
      tickCloverLifecycle(state, Zone.Overworld, 1000)

      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.Brown)
    })

    it('stays healthy when tile water > 0 and has light', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      state.tileWater.set(key, WATER_MAX)
      tickCloverLifecycle(state, Zone.Overworld, 1000)
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.Healthy)
    })
  })

  describe('stage progression', () => {
    it('stays healthy when water > 0 and has light', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      tickCloverLifecycle(state, Zone.Overworld, 1000)
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.Healthy)
    })

    it('transitions to brown when water reaches 0', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      // Set water to 0 so lifecycle detects stress
      state.tileWater.set(key, 0)

      tickCloverLifecycle(state, Zone.Overworld, 1000)
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.Brown)
    })

    it('cave clover transitions to brown immediately (no light)', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      tickCloverLifecycle(state, Zone.Cave, 1000)
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.Brown)
      expect(state.floraLifecycle.get(key)?.hasLight).toBe(false)
    })

    it('progresses brown → blinkingRed after duration', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      // Enter brown stage
      tickCloverLifecycle(state, Zone.Cave, 1000)
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.Brown)

      // Advance past brown duration
      tickCloverLifecycle(state, Zone.Cave, 1000 + CLOVER_BROWN_DURATION_MS)
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.BlinkingRed)
    })

    it('progresses blinkingRed → black after duration', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      let t = 1000
      tickCloverLifecycle(state, Zone.Cave, t)

      t += CLOVER_BROWN_DURATION_MS
      tickCloverLifecycle(state, Zone.Cave, t)
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.BlinkingRed)

      t += CLOVER_BLINK_RED_DURATION_MS
      tickCloverLifecycle(state, Zone.Cave, t)
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.Black)
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
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.Decomposing)
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
      expect(state.floraLifecycle.has(key)).toBe(false)
      expect(state.soilHealth.get(key)).toBe(SOIL_HEALTH_DEFAULT + SOIL_HEALTH_CLOVER_DEATH_BONUS)
    })
  })

  describe('recovery', () => {
    it('brown stage recovers when watered and lit', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      // Enter brown via cave (no light)
      tickCloverLifecycle(state, Zone.Cave, 1000)
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.Brown)

      // Now give it light and water (overworld with tile water > 0)
      state.tileWater.set(key, 50)
      tickCloverLifecycle(state, Zone.Overworld, 4000)
      expect(state.floraLifecycle.get(key)?.stage).toBe(FloraStage.Healthy)
    })

    it('blinkingRed does NOT recover', () => {
      placeClover(px(), py() + 1)
      const key = posKey(px(), py() + 1)

      // Advance to blinkingRed
      tickCloverLifecycle(state, Zone.Cave, 1000)
      const entry = state.floraLifecycle.get(key)
      expect(entry).toBeDefined()
      if (!entry) return
      entry.stage = FloraStage.BlinkingRed
      entry.stageStartTime = 1000

      // Try to recover with water and light
      state.tileWater.set(key, 50)
      tickCloverLifecycle(state, Zone.Overworld, 4000)

      // Should still be blinkingRed (or advanced), not healthy
      expect(state.floraLifecycle.get(key)?.stage).not.toBe(FloraStage.Healthy)
    })
  })
})

describe('harvestClover', () => {
  it('harvests facing clover tile into backpack', () => {
    const fp = facingPos()
    placeClover(fp.x, fp.y)

    const result = harvestClover(state)

    expect(result).toBe(HarvestResult.Success)
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

  it('removes lifecycle entry on healthy harvest', () => {
    const fp = facingPos()
    placeClover(fp.x, fp.y)
    const key = posKey(fp.x, fp.y)
    state.floraLifecycle.set(key, {
      stage: FloraStage.Healthy,
      stageStartTime: 0,
      hasLight: true,
    })

    harvestClover(state)

    expect(state.floraLifecycle.has(key)).toBe(false)
  })

  it('rejects dying clover', () => {
    const fp = facingPos()
    placeClover(fp.x, fp.y)
    state.floraLifecycle.set(posKey(fp.x, fp.y), {
      stage: FloraStage.Brown,
      stageStartTime: 0,
      hasLight: true,
    })

    expect(harvestClover(state)).toBe(HarvestResult.Dying)
    expect(state.map[fp.y][fp.x].type).toBe(TileType.Flora)
  })

  it('fails when backpack is full', () => {
    const fp = facingPos()
    placeClover(fp.x, fp.y)

    // Fill backpack completely with 1x1 items (clover is 1x1)
    for (let gy = 0; gy < state.backpack.height; gy++) {
      for (let gx = 0; gx < state.backpack.width; gx++) {
        placeItem(state.backpack, 'clover', gx, gy)
      }
    }

    const result = harvestClover(state)
    expect(result).toBe(HarvestResult.BackpackFull)
    expect(state.map[fp.y][fp.x].type).toBe(TileType.Flora)
  })

  it('returns no-clover when facing non-clover tile', () => {
    expect(harvestClover(state)).toBe(HarvestResult.NoClover)
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
    state.floraLifecycle.set(key, {
      stage: FloraStage.Brown,
      stageStartTime: 0,
      hasLight: true,
    })

    cutClover(state)

    expect(state.floraLifecycle.has(key)).toBe(false)
  })

  it('returns false when facing non-clover tile', () => {
    expect(cutClover(state)).toBe(false)
  })
})
