import { addSoilHealth } from './cloverLifecycle'
import { generateBoltPath } from './boltPath'
import {
  CLOVER_WATER_MAX,
  CLOVER_WATER_REVERY_FILL,
  LIGHTNING_BOLT_MAX_LENGTH,
  LIGHTNING_BOLT_MIN_LENGTH,
  LIGHTNING_INVALID_TARGET_CHAR,
  LIGHTNING_INVALID_TARGET_COLOR,
  LIGHTNING_RETICLE_CHARS,
  LIGHTNING_RETICLE_CYCLE_MS,
  LIGHTNING_REVERY_RANGE,
  SOIL_HEALTH_FIRE_REVERY_BONUS,
  SOIL_HEALTH_WATER_REVERY_BONUS,
} from './constants'
import { ComponentType } from './ecs/types'
import { recordDiscovery } from './manual'
import { spreadWildfire } from './lightning'
import { DIRECTIONS, isInBounds, isWalkableTile, posKey } from './position'
import { getReveryDefinition } from './reveries'
import { TileType } from './types'

import type { ActionBarSlot, GameState, Position } from './types'

export const ACTIONBAR_SLOTS = 4

export const assignActionBarSlot = (state: GameState, slotIndex: number, kind: 'revery' | 'item', id: string): void => {
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

const getCastPositions = (state: GameState, center: Position, pattern: Position[]): Position[] => {
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
  slotIndex: number
): { pos: Position; char: string; color: string; isValid: boolean }[] => {
  const slot = state.actionBar[slotIndex]
  if (slot?.kind !== 'revery') return []
  if (performance.now() < slot.cooldownEndTime) return []

  const def = getReveryDefinition(slot.id)
  if (def.castStyle === 'scan' || def.castStyle === 'targeted') return []

  const target = getFacingTile(state)
  const positions = getCastPositions(state, target, def.castPattern)
  if (positions.length === 0) return []

  return positions.map(pos => ({ pos, char: def.glyphs[0], color: def.glyphColor, isValid: true }))
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
    const def = getReveryDefinition(slot.id)

    if (def.castStyle === 'targeted') {
      // Targeted: enter targeting mode instead of casting immediately
      // Actual cast happens via castLightningAtTarget when player clicks
      return false
    }

    if (def.castStyle === 'scan') {
      // Scan-style: radiate from player position, no facing tile
      slot.cooldownEndTime = now + def.cooldownMs
      slot.cooldownDurationMs = def.cooldownMs

      const eid = state.world.createEntity()
      state.world.addComponent(eid, ComponentType.Position, { x: state.player.x, y: state.player.y })
      state.world.addComponent(eid, ComponentType.TimedEffect, {
        kind: 'reveryCast',
        startTime: now,
        reveryId: slot.id,
      })
      state.world.addComponent(eid, ComponentType.EntityTag, 'reveryCast')
      state.world.addComponent(eid, ComponentType.EntityZone, { zone: state.currentZone })

      recordDiscovery(state, 'event:earth-revery')
      return true
    }

    const target = getFacingTile(state)
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

export const isValidLightningTarget = (state: GameState, target: Position): boolean => {
  if (!isInBounds(target.x, target.y, state.mapWidth, state.mapHeight)) return false
  const dist = Math.abs(target.x - state.player.x) + Math.abs(target.y - state.player.y)
  if (dist > LIGHTNING_REVERY_RANGE) return false
  const tile = state.map[target.y][target.x]
  if (tile.type === TileType.Space) return false

  const targetKey = posKey(target.x, target.y)

  // Check characters at target position (same zone)
  for (const eid of state.world.query(ComponentType.CharacterIdentity, ComponentType.Position)) {
    const zone = state.world.getComponent(eid, ComponentType.EntityZone)
    if (zone?.zone !== state.currentZone) continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (pos && posKey(pos.x, pos.y) === targetKey) return false
  }

  // Check living fauna (bees and beehives) at target position (same zone)
  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag !== 'bee' && tag !== 'beehive') continue
    const zone = state.world.getComponent(eid, ComponentType.EntityZone)
    if (zone?.zone !== state.currentZone) continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (pos && posKey(pos.x, pos.y) === targetKey) return false
  }

  return true
}

export const getTargetingPreview = (
  state: GameState,
  slotIndex: number,
  time: number
): { pos: Position; char: string; color: string; isValid: boolean }[] => {
  const slot = state.actionBar[slotIndex]
  if (slot?.kind !== 'revery') return []
  const def = getReveryDefinition(slot.id)
  if (def.castStyle !== 'targeted') return []
  if (!state.cursorTile) return []

  if (!isValidLightningTarget(state, state.cursorTile)) {
    return [
      {
        pos: state.cursorTile,
        char: LIGHTNING_INVALID_TARGET_CHAR,
        color: LIGHTNING_INVALID_TARGET_COLOR,
        isValid: false,
      },
    ]
  }

  const charIndex = Math.floor(time / LIGHTNING_RETICLE_CYCLE_MS) % LIGHTNING_RETICLE_CHARS.length
  return [{ pos: state.cursorTile, char: LIGHTNING_RETICLE_CHARS[charIndex], color: def.glyphColor, isValid: true }]
}

export const castLightningAtTarget = (
  state: GameState,
  target: Position,
  slotIndex: number,
  now: number
): boolean => {
  const slot = state.actionBar[slotIndex]
  if (slot?.kind !== 'revery') return false
  const def = getReveryDefinition(slot.id)
  if (def.castStyle !== 'targeted') return false
  if (now < slot.cooldownEndTime) return false
  if (!isValidLightningTarget(state, target)) return false

  // Generate bolt path
  const length =
    LIGHTNING_BOLT_MIN_LENGTH + Math.floor(Math.random() * (LIGHTNING_BOLT_MAX_LENGTH - LIGHTNING_BOLT_MIN_LENGTH + 1))
  const { path, branch } = generateBoltPath(target.x, target.y, length, Math.random)

  // Create lightning ECS entity
  const eid = state.world.createEntity()
  state.world.addComponent(eid, ComponentType.Position, { x: target.x, y: target.y })
  state.world.addComponent(eid, ComponentType.TimedEffect, { kind: 'lightning', startTime: now })
  state.world.addComponent(eid, ComponentType.LightningData, { path, branch })
  state.world.addComponent(eid, ComponentType.EntityTag, 'lightning')
  state.world.addComponent(eid, ComponentType.EntityZone, { zone: state.currentZone })

  // Set cooldown
  slot.cooldownEndTime = now + def.cooldownMs
  slot.cooldownDurationMs = def.cooldownMs

  // Record discovery
  recordDiscovery(state, 'event:lightning-revery')

  // Wildfire spread
  const burned = spreadWildfire(state, target.x, target.y)
  if (burned.size > 1) {
    const we = state.world.createEntity()
    state.world.addComponent(we, ComponentType.MultiPosition, {
      positions: [...burned].map(k => {
        const [xStr, yStr] = k.split(',')
        return { x: Number(xStr), y: Number(yStr) }
      }),
    })
    state.world.addComponent(we, ComponentType.TimedEffect, { kind: 'wildfire', startTime: now })
    state.world.addComponent(we, ComponentType.EntityTag, 'wildfire')
    state.world.addComponent(we, ComponentType.EntityZone, { zone: state.currentZone })
    recordDiscovery(state, 'event:wildfire')
  }

  // Clear targeting mode
  state.targetingSlot = null
  state.previewFn = null

  return true
}

export const getSlotCooldownFraction = (slot: ActionBarSlot, now: number): number => {
  if (slot.cooldownDurationMs === 0 || now >= slot.cooldownEndTime) return 0
  return (slot.cooldownEndTime - now) / slot.cooldownDurationMs
}

export const autoAssignRevery = (state: GameState, reveryId: string): void => {
  const emptySlot = state.actionBar.findIndex(s => s === null)
  if (emptySlot !== -1) {
    assignActionBarSlot(state, emptySlot, 'revery', reveryId)
  }
}
