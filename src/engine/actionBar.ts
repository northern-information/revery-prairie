import { addSoilHealth } from './cloverLifecycle'
import {
  CLOVER_WATER_MAX,
  CLOVER_WATER_REVERY_FILL,
  SOIL_HEALTH_FIRE_REVERY_BONUS,
  SOIL_HEALTH_WATER_REVERY_BONUS,
} from './constants'
import { ComponentType } from './ecs/types'
import { recordDiscovery } from './manual'
import { isInBounds, isWalkableTile, DIRECTIONS, posKey } from './position'
import { getReveryDefinition } from './reveries'
import { TileType } from './types'

import type { ActionBarSlot, GameState, Position } from './types'

export const ACTIONBAR_SLOTS = 4

export const assignActionBarSlot = (
  state: GameState,
  slotIndex: number,
  kind: 'revery' | 'item',
  id: string,
): void => {
  if (slotIndex < 0 || slotIndex >= ACTIONBAR_SLOTS) return
  state.actionBar[slotIndex] = {
    kind,
    id,
    cooldownEndTime: 0,
    cooldownDurationMs: 0,
  }
}

export const clearActionBarSlot = (state: GameState, slotIndex: number): void => {
  if (slotIndex < 0 || slotIndex >= ACTIONBAR_SLOTS) return
  state.actionBar[slotIndex] = null
}

export const getFacingTile = (state: GameState): Position => {
  const d = DIRECTIONS[state.playerFacing]
  return { x: state.player.x + d.x, y: state.player.y + d.y }
}

const canCastAtTile = (state: GameState, pos: Position): boolean => {
  if (!isInBounds(pos.x, pos.y, state.mapWidth, state.mapHeight)) return false
  if (!isWalkableTile(state.map[pos.y][pos.x].type)) return false

  // Block casting on tiles occupied by characters
  for (const eid of state.world.spatial.at(pos.x, pos.y)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) === 'character') return false
  }
  return true
}

const getCastPositions = (
  state: GameState,
  center: Position,
  pattern: Position[],
): Position[] => {
  const positions: Position[] = []
  for (const offset of pattern) {
    const pos = { x: center.x + offset.x, y: center.y + offset.y }
    if (canCastAtTile(state, pos)) {
      positions.push(pos)
    }
  }
  return positions
}

export const getActionBarPreview = (
  state: GameState,
  slotIndex: number,
): { pos: Position; char: string; color: string }[] => {
  const slot = state.actionBar[slotIndex]
  if (slot?.kind !== 'revery') return []
  if (performance.now() < slot.cooldownEndTime) return []

  const target = getFacingTile(state)
  const def = getReveryDefinition(slot.id)
  const positions = getCastPositions(state, target, def.castPattern)
  if (positions.length === 0) return []

  return positions.map((pos) => ({ pos, char: def.glyphs[0], color: def.glyphColor }))
}

const applyReveryCastEffects = (state: GameState, reveryId: string, positions: Position[]): void => {
  for (const pos of positions) {
    const key = posKey(pos.x, pos.y)
    const tile = state.map[pos.y]?.[pos.x]
    if (!tile) continue

    if (reveryId === 'water') {
      // Water: refill clover water meter and boost soil health
      addSoilHealth(state, key, SOIL_HEALTH_WATER_REVERY_BONUS)
      const lifecycle = state.cloverLifecycle.get(key)
      if (lifecycle) {
        lifecycle.water = Math.min(lifecycle.water + CLOVER_WATER_REVERY_FILL, CLOVER_WATER_MAX)
      }
    } else if (reveryId === 'fire') {
      // Fire: burn any clover (healthy, withering, or dead) to burnt clover
      if (tile.type === TileType.Clover) {
        state.map[pos.y][pos.x] = { type: TileType.BurntClover }
        state.cloverLifecycle.delete(key)
        state.cloverGrowthPreviews.delete(key)
      }
      addSoilHealth(state, key, SOIL_HEALTH_FIRE_REVERY_BONUS)
      recordDiscovery(state, 'event:fire-revery')
    }
  }
}

export const activateActionBarSlot = (state: GameState, slotIndex: number, now: number): boolean => {
  const slot = state.actionBar[slotIndex]
  if (!slot) return false
  if (now < slot.cooldownEndTime) return false

  if (slot.kind === 'revery') {
    const target = getFacingTile(state)
    const def = getReveryDefinition(slot.id)
    const positions = getCastPositions(state, target, def.castPattern)
    if (positions.length === 0) return false

    slot.cooldownEndTime = now + def.cooldownMs
    slot.cooldownDurationMs = def.cooldownMs

    // Apply gameplay effects to cast tiles
    applyReveryCastEffects(state, slot.id, positions)

    // Spawn tile cast effect at all pattern positions
    const eid = state.world.createEntity()
    state.world.addComponent(eid, ComponentType.MultiPosition, { positions })
    state.world.addComponent(eid, ComponentType.TimedEffect, {
      kind: 'reveryCast',
      startTime: now,
      reveryId: slot.id,
    })
    state.world.addComponent(eid, ComponentType.EntityTag, 'reveryCast')
    state.world.addComponent(eid, ComponentType.EntityZone, { zone: state.currentZone })

    return true
  }

  // Item activation — deferred
  return false
}

export const getSlotCooldownFraction = (slot: ActionBarSlot, now: number): number => {
  if (slot.cooldownDurationMs === 0 || now >= slot.cooldownEndTime) return 0
  return (slot.cooldownEndTime - now) / slot.cooldownDurationMs
}

export const autoAssignRevery = (state: GameState, reveryId: string): void => {
  const emptySlot = state.actionBar.findIndex((s) => s === null)
  if (emptySlot !== -1) {
    assignActionBarSlot(state, emptySlot, 'revery', reveryId)
  }
}
