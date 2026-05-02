import {
  BURNT_CLOVER_RAIN_MULTIPLIER,
  BURNT_CLOVER_RECOVERY_MS,
  CLOVER_BLACK_DURATION_MS,
  CLOVER_BLINK_RED_DURATION_MS,
  CLOVER_BROWN_DURATION_MS,
  CLOVER_DECOMPOSE_DURATION_MS,
  SOIL_HEALTH_CLOVER_DEATH_BONUS,
  SOIL_HEALTH_CUT_BONUS,
  SOIL_HEALTH_DEFAULT,
  SOIL_HEALTH_MAX,
  WATER_MAX,
} from './constants'
import { spawnPickupBloom } from './effects'
import { findFitPosition, placeItem } from './inventory'
import { setMapTile } from './map'
import { recordDiscovery } from './manual'
import { isInBounds, posKey } from './position'
import { CloverStage, TileType, Zone } from './types'

import type { CloverLifecycleState, GameState, Zone as ZoneType } from './types'

// --- Helpers ---

const getSoilHealth = (state: GameState, key: string): number => state.soilHealth.get(key) ?? SOIL_HEALTH_DEFAULT

export const addSoilHealth = (state: GameState, key: string, bonus: number): void => {
  const current = getSoilHealth(state, key)
  state.soilHealth.set(key, Math.min(current + bonus, SOIL_HEALTH_MAX))
}

const createHealthyEntry = (time: number, hasLight: boolean): CloverLifecycleState => ({
  stage: CloverStage.Healthy,
  stageStartTime: time,
  hasLight,
})

const stageDuration = (stage: CloverStage): number => {
  switch (stage) {
    case CloverStage.Brown:
      return CLOVER_BROWN_DURATION_MS
    case CloverStage.BlinkingRed:
      return CLOVER_BLINK_RED_DURATION_MS
    case CloverStage.Black:
      return CLOVER_BLACK_DURATION_MS
    case CloverStage.Decomposing:
      return CLOVER_DECOMPOSE_DURATION_MS
    case CloverStage.BurntRecovering:
      return BURNT_CLOVER_RECOVERY_MS
    default:
      return Infinity
  }
}

const nextStage = (stage: CloverStage): CloverStage | null => {
  switch (stage) {
    case CloverStage.Brown:
      return CloverStage.BlinkingRed
    case CloverStage.BlinkingRed:
      return CloverStage.Black
    case CloverStage.Black:
      return CloverStage.Decomposing
    case CloverStage.Decomposing:
      return null // converts to dirt
    default:
      return null
  }
}

// --- Main lifecycle tick ---

export const tickCloverLifecycle = (state: GameState, zone: ZoneType, time: number): void => {
  const map = state.map
  const w = state.mapWidth
  const h = state.mapHeight
  const hasLight = zone === Zone.Overworld

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tileType = map[y][x].type

      // Handle BurntClover recovery
      if (tileType === TileType.BurntClover) {
        const key = posKey(x, y)
        let entry = state.cloverLifecycle.get(key)

        // First encounter: create recovery entry
        if (!entry) {
          entry = { stage: CloverStage.BurntRecovering, stageStartTime: time, hasLight: true }
          state.cloverLifecycle.set(key, entry)
        }

        if (entry.stage === CloverStage.BurntRecovering) {
          const water = state.tileWater.get(key) ?? 0
          const effectiveDuration =
            water > 0 ? BURNT_CLOVER_RECOVERY_MS / BURNT_CLOVER_RAIN_MULTIPLIER : BURNT_CLOVER_RECOVERY_MS
          if (time - entry.stageStartTime >= effectiveDuration) {
            map[y][x] = { type: TileType.Dirt }
            state.cloverLifecycle.delete(key)
            state.burnScars.delete(key)
          }
        }
        continue
      }

      if (tileType !== TileType.Clover) continue

      const key = posKey(x, y)
      let entry = state.cloverLifecycle.get(key)

      // First encounter: create entry
      if (!entry) {
        entry = createHealthyEntry(time, hasLight)
        state.cloverLifecycle.set(key, entry)
      }

      // Update light
      entry.hasLight = hasLight

      // Read water from tile-level state
      const water = state.tileWater.get(key) ?? WATER_MAX
      const isStressed = water === 0 || !entry.hasLight

      // Stage logic
      if (entry.stage === CloverStage.Healthy) {
        if (isStressed) {
          entry.stage = CloverStage.Brown
          entry.stageStartTime = time
        }
      } else if (entry.stage === CloverStage.Brown) {
        // Recovery: brown stage can recover if conditions improve
        if (!isStressed) {
          entry.stage = CloverStage.Healthy
          entry.stageStartTime = time
        } else if (time - entry.stageStartTime >= stageDuration(CloverStage.Brown)) {
          entry.stage = CloverStage.BlinkingRed
          entry.stageStartTime = time
        }
      } else if (entry.stage === CloverStage.Decomposing) {
        if (time - entry.stageStartTime >= stageDuration(CloverStage.Decomposing)) {
          // Convert to dirt, enrich soil, clean up
          map[y][x] = { type: TileType.Dirt }
          addSoilHealth(state, key, SOIL_HEALTH_CLOVER_DEATH_BONUS)
          state.cloverLifecycle.delete(key)
          recordDiscovery(state, 'event:clover-death')
        }
      } else {
        // BlinkingRed or Black — advance if duration elapsed (no recovery)
        const next = nextStage(entry.stage)
        if (next && time - entry.stageStartTime >= stageDuration(entry.stage)) {
          entry.stage = next
          entry.stageStartTime = time
        }
      }
    }
  }
}

// --- Player actions ---

const getFacingCloverPos = (state: GameState): { x: number; y: number } | null => {
  const pos = state.facingEntityPos
  if (!pos) return null
  if (!isInBounds(pos.x, pos.y, state.mapWidth, state.mapHeight)) return null
  if (state.map[pos.y][pos.x].type !== TileType.Clover) return null
  return pos
}

export const HarvestResult = {
  Success: 'success',
  NoClover: 'no-clover',
  BackpackFull: 'backpack-full',
  Dying: 'dying',
} as const

export type HarvestResult = (typeof HarvestResult)[keyof typeof HarvestResult]

export const harvestClover = (state: GameState, time?: number): HarvestResult => {
  const pos = getFacingCloverPos(state)
  if (!pos) return HarvestResult.NoClover

  const entry = state.cloverLifecycle.get(posKey(pos.x, pos.y))
  if (entry && entry.stage !== CloverStage.Healthy) return HarvestResult.Dying

  const fit = findFitPosition(state.backpack, 'clover')
  if (!fit) return HarvestResult.BackpackFull

  setMapTile(state, pos.x, pos.y, { type: TileType.Dirt })
  placeItem(state.backpack, 'clover', fit.gridX, fit.gridY)
  state.cloverLifecycle.delete(posKey(pos.x, pos.y))
  recordDiscovery(state, 'event:clover-harvest')
  if (time !== undefined) {
    spawnPickupBloom(state, state.player.x, state.player.y, time)
  }
  return HarvestResult.Success
}

export const cutClover = (state: GameState): boolean => {
  const pos = getFacingCloverPos(state)
  if (!pos) return false

  const key = posKey(pos.x, pos.y)
  setMapTile(state, pos.x, pos.y, { type: TileType.Dirt })
  addSoilHealth(state, key, SOIL_HEALTH_CUT_BONUS)
  state.cloverLifecycle.delete(key)
  recordDiscovery(state, 'event:clover-cut')
  return true
}

// --- Renderer utility ---

export const getCloverStage = (state: GameState, x: number, y: number): CloverStage | null => {
  const entry = state.cloverLifecycle.get(posKey(x, y))
  if (!entry) return null
  return entry.stage
}
