import { tickCloverHives } from '../clover'
import { tickCloverLifecycle } from '../cloverLifecycle'
import { BURNT_CLOVER_RAIN_MULTIPLIER, BURNT_CLOVER_RECOVERY_MS, WATER_MAX } from '../constants'
import { spreadWildfire } from '../lightning'
import { posKey } from '../position'
import { CloverStage, Sky, TileType, Zone } from '../types'
import { clearAroundPlayer, createBeeEntity, createBeehiveEntity, createTestState, getBeehiveEntities } from './helpers'
import { beforeEach, describe, expect, it } from 'vitest'

import type { GameState } from '../types'

let state: GameState
const px = () => state.player.x
const py = () => state.player.y

beforeEach(() => {
  state = createTestState()
  clearAroundPlayer(state, 10)
  state.weather.sky = Sky.Sun
  state.meteorShower = { ...state.meteorShower, active: false }
})

const placeBurntClover = (x: number, y: number, stageStartTime: number) => {
  state.map[y][x] = { type: TileType.BurntClover }
  state.cloverLifecycle.set(posKey(x, y), {
    stage: CloverStage.BurntRecovering,
    stageStartTime,
    hasLight: true,
  })
  if (!state.tileWater.has(posKey(x, y))) {
    state.tileWater.set(posKey(x, y), 0)
  }
}

const placeClover = (x: number, y: number) => {
  state.map[y][x] = { type: TileType.Clover }
  if (!state.tileWater.has(posKey(x, y))) {
    state.tileWater.set(posKey(x, y), WATER_MAX)
  }
}

describe('burnt clover recovery', () => {
  it('BurntClover with BurntRecovering entry converts to Dirt after recovery duration', () => {
    const x = px() + 2
    const y = py() + 2
    placeBurntClover(x, y, 0)

    tickCloverLifecycle(state, Zone.Overworld, BURNT_CLOVER_RECOVERY_MS + 1)

    expect(state.map[y][x].type).toBe(TileType.Dirt)
    expect(state.cloverLifecycle.has(posKey(x, y))).toBe(false)
  })

  it('BurntClover does not recover before duration elapses', () => {
    const x = px() + 2
    const y = py() + 2
    placeBurntClover(x, y, 0)

    tickCloverLifecycle(state, Zone.Overworld, BURNT_CLOVER_RECOVERY_MS - 1)

    expect(state.map[y][x].type).toBe(TileType.BurntClover)
    expect(state.cloverLifecycle.has(posKey(x, y))).toBe(true)
  })

  it('rain accelerates recovery', () => {
    const x = px() + 2
    const y = py() + 2
    placeBurntClover(x, y, 0)

    // Give the tile water so rain multiplier kicks in
    state.tileWater.set(posKey(x, y), 50)

    // Time just past the rain-accelerated duration but well before the normal duration
    const rainDuration = BURNT_CLOVER_RECOVERY_MS / BURNT_CLOVER_RAIN_MULTIPLIER
    tickCloverLifecycle(state, Zone.Overworld, rainDuration + 1)

    expect(state.map[y][x].type).toBe(TileType.Dirt)
    expect(state.cloverLifecycle.has(posKey(x, y))).toBe(false)
  })

  it('burn scar removed on recovery', () => {
    const x = px() + 2
    const y = py() + 2
    const key = posKey(x, y)
    placeBurntClover(x, y, 0)
    state.burnScars.add(key)

    tickCloverLifecycle(state, Zone.Overworld, BURNT_CLOVER_RECOVERY_MS + 1)

    expect(state.map[y][x].type).toBe(TileType.Dirt)
    expect(state.burnScars.has(key)).toBe(false)
  })

  it('spreadWildfire creates BurntRecovering lifecycle entry', () => {
    const x = px() + 3
    const y = py() + 3
    placeClover(x, y)

    // Force tile water to 0 so wildfire can ignite
    state.tileWater.set(posKey(x, y), 0)

    const burned = spreadWildfire(state, 5000, x, y)

    expect(burned.size).toBeGreaterThanOrEqual(1)
    expect(state.map[y][x].type).toBe(TileType.BurntClover)

    const entry = state.cloverLifecycle.get(posKey(x, y))
    expect(entry).toBeDefined()
    expect(entry?.stage).toBe(CloverStage.BurntRecovering)
    expect(entry?.stageStartTime).toBe(5000)
  })
})

describe('beehive minimum spacing', () => {
  it('rejects hive spawn when all candidates are within BEEHIVE_MIN_DISTANCE', () => {
    // Create a small clover patch (4 tiles wide) centered on a known position
    // with an existing beehive in the middle. Since the patch is smaller than
    // BEEHIVE_MIN_DISTANCE, no new hive should spawn.
    const cx = px() + 2
    const cy = py() + 2
    const patchRadius = 2

    for (let dy = -patchRadius; dy <= patchRadius; dy++) {
      for (let dx = -patchRadius; dx <= patchRadius; dx++) {
        placeClover(cx + dx, cy + dy)
      }
    }

    // Place a beehive at the center of the patch
    createBeehiveEntity(state, cx, cy)

    // Place a bee on the patch so hive spawning logic is eligible
    createBeeEntity(state, cx + 1, cy)

    // Run tickCloverHives many times — no new hive should appear
    // because all clover tiles are within BEEHIVE_MIN_DISTANCE (7) of the existing hive
    const initialHiveCount = getBeehiveEntities(state).length
    for (let i = 0; i < 200; i++) {
      tickCloverHives(state)
    }

    expect(getBeehiveEntities(state).length).toBe(initialHiveCount)
  })
})
