import {
  DEEP_TIME_BURN_DURATION_MS,
  DEEP_TIME_TOTAL_YEARS,
  DEEP_TIME_TRANSITION_DURATION_MS,
  DEEP_TIME_YEARS_PER_FRAME,
} from './constants'
import { tickCloverGrowth } from './clover'
import { tickCloverLifecycle } from './cloverLifecycle'
import { ComponentType } from './ecs/types'
import { tickBees } from './entities'
import { spawnLightningStrike, spreadWildfire } from './lightning'
import { recordDiscovery } from './manual'
import { tickTileWater } from './tileWater'
import { DeepTimePhase, TileType, Zone } from './types'
import { tickWeather } from './weather'

import type { GameState, Position } from './types'

export const initiateDeepTime = (state: GameState, time: number): void => {
  state.deepTime = {
    active: true,
    startTime: time,
    phase: DeepTimePhase.Burning,
    elapsedYears: 0,
    playerGlyph: 'ö',
    playerGlyphColor: '#FFFFFF',
  }

  // Clear player state
  state.activeDialog = null
  state.path = null
  state.pathWaypoints = []
  state.heldDirection = null
  state.actionBar = [null, null, null, null]
  state.previewFn = null
  state.targetingSlot = null

  // Remove all character entities from ECS
  const toRemove: number[] = []
  for (const eid of state.world.query(ComponentType.EntityTag)) {
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag === 'character') toRemove.push(eid)
  }
  for (const eid of toRemove) {
    state.world.destroyEntity(eid)
  }

  // Record discovery
  recordDiscovery(state, 'event:deep-time')

  // Spawn initial fire ignition points (3-5 random positions on clover tiles)
  const cloverPositions: Position[] = []
  for (let y = 0; y < state.mapHeight; y++) {
    for (let x = 0; x < state.mapWidth; x++) {
      if (state.map[y][x].type === TileType.Clover) {
        cloverPositions.push({ x, y })
      }
    }
  }

  // Fisher-Yates shuffle
  for (let i = cloverPositions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[cloverPositions[i], cloverPositions[j]] = [cloverPositions[j], cloverPositions[i]]
  }

  const ignitionCount = 3 + Math.floor(Math.random() * 3) // 3-5
  const ignitionPoints = cloverPositions.slice(0, ignitionCount)
  for (const point of ignitionPoints) {
    spreadWildfire(state, time, point.x, point.y)
  }
}

export const tickDeepTime = (state: GameState, time: number): void => {
  if (!state.deepTime?.active) return

  const dt = state.deepTime

  if (dt.phase === DeepTimePhase.Burning) {
    // Burning phase — wait for duration to elapse
    if (time - dt.startTime >= DEEP_TIME_BURN_DURATION_MS) {
      dt.phase = DeepTimePhase.Simulating
      dt.startTime = time // reset for simulation phase
    }
    return
  }

  if (dt.phase === DeepTimePhase.Simulating) {
    // Advance years
    dt.elapsedYears += DEEP_TIME_YEARS_PER_FRAME

    // Run accelerated tick systems
    // Each frame simulates ~50 years, so we run multiple ticks of each system

    // Weather — run once per frame (it already drifts by small amounts)
    tickWeather(state.weather)

    // Tile water — run once per frame
    tickTileWater(state, Zone.Overworld)

    // Clover lifecycle — run once per frame
    tickCloverLifecycle(state, Zone.Overworld, time)

    // Clover growth — run once per frame
    tickCloverGrowth(state)

    // Bees — run once per frame (movement + hunger)
    tickBees(state, Zone.Overworld)

    // Lightning — periodic strikes during simulation (natural phenomenon)
    // Only strike occasionally during simulation to avoid overwhelming
    if (Math.random() < 0.05) {
      spawnLightningStrike(state, time)
    }

    // Check completion
    if (dt.elapsedYears >= DEEP_TIME_TOTAL_YEARS) {
      dt.phase = DeepTimePhase.Wandering
      dt.elapsedYears = DEEP_TIME_TOTAL_YEARS
      state.deepTimeTransition = {
        startTime: performance.now(),
        duration: DEEP_TIME_TRANSITION_DURATION_MS,
      }
    }
    return
  }

  // Wandering phase — nothing to tick, player can move freely
}
