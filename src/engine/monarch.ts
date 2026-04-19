import {
  BEE_STARVATION_MS,
  MONARCH_HEAL_CENTER_PCT,
  MONARCH_HEAL_EDGE_PCT,
  MONARCH_HEAL_SIZE,
  MONARCH_PRAIRIE_SIZE,
  MONARCH_SEARCH_RADIUS,
  MONARCH_SOIL_THRESHOLD_HIGH,
  MONARCH_SOIL_THRESHOLD_LOW,
  MONARCH_SPAWN_CHANCE,
  MONARCH_TICK_MS,
  SOIL_HEALTH_DEFAULT,
  SOIL_HEALTH_MAX,
} from './constants'
import { ComponentType } from './ecs/types'
import { spawnPickupBloom } from './effects'
import { tickCreatureHunger } from './hunger'
import { findPath } from './pathfinding'
import { CARDINAL, isInBounds, isWalkableTile, ORDINAL, posKey } from './position'
import { CloverStage, Sky, TileType, Zone } from './types'

import type { Entity } from './ecs/types'
import type { GameState, Position } from './types'

/** Returns true if the current weather is rain — the only condition under which monarchs spawn. */
export const isMonarchSpawnCondition = (state: GameState): boolean =>
  state.weather.sky === Sky.Rain

/** Roll whether a spawning bee should become a monarch instead. */
export const shouldSpawnMonarch = (state: GameState): boolean =>
  isMonarchSpawnCondition(state) && Math.random() < MONARCH_SPAWN_CHANCE

/** Create a monarch entity at the given position. */
export const spawnMonarch = (state: GameState, x: number, y: number): Entity => {
  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x, y })
  state.world.addComponent(e, ComponentType.EntityTag, 'monarch')
  state.world.addComponent(e, ComponentType.EntityZone, { zone: state.currentZone })
  state.world.addComponent(e, ComponentType.HungerTimer, { hungerMs: 0 })
  state.world.addComponent(e, ComponentType.MonarchState, { phase: 'wandering', target: null })
  return e
}

/** Create a bee entity at the given position (extracted for reuse at spawn sites). */
export const spawnBee = (state: GameState, x: number, y: number, zone?: Zone): Entity => {
  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x, y })
  state.world.addComponent(e, ComponentType.EntityTag, 'bee')
  state.world.addComponent(e, ComponentType.EntityZone, { zone: zone ?? state.currentZone })
  state.world.addComponent(e, ComponentType.HungerTimer, { hungerMs: 0 })
  return e
}

/**
 * Spawn a bee or monarch at the given position.
 * During rain, there's a MONARCH_SPAWN_CHANCE that a monarch spawns instead.
 */
export const spawnBeeOrMonarch = (state: GameState, x: number, y: number, zone?: Zone): Entity => {
  if (shouldSpawnMonarch(state)) {
    return spawnMonarch(state, x, y)
  }
  return spawnBee(state, x, y, zone)
}

// --- Wandering (shared with bees) ---

const isMonarchNearFood = (state: GameState, pos: Position): boolean => {
  if (isInBounds(pos.x, pos.y, state.mapWidth, state.mapHeight) && state.map[pos.y][pos.x].type === TileType.Clover)
    return true
  for (const d of CARDINAL) {
    const nx = pos.x + d.x
    const ny = pos.y + d.y
    if (isInBounds(nx, ny, state.mapWidth, state.mapHeight) && state.map[ny][nx].type === TileType.Clover) return true
  }
  return false
}

const wanderMonarch = (state: GameState, eid: Entity): void => {
  const pos = state.world.getComponent(eid, ComponentType.Position)
  if (!pos) return

  if (Math.random() > 0.3) return

  const cloverCandidates: Position[] = []
  const walkableCandidates: Position[] = []
  for (const d of ORDINAL) {
    const nx = pos.x + d.x
    const ny = pos.y + d.y
    if (isInBounds(nx, ny, state.mapWidth, state.mapHeight)) {
      const tile = state.map[ny][nx]
      if (tile.type === TileType.Clover) {
        cloverCandidates.push({ x: nx, y: ny })
      } else if (isWalkableTile(tile.type)) {
        walkableCandidates.push({ x: nx, y: ny })
      }
    }
  }

  const candidates = cloverCandidates.length > 0 ? cloverCandidates : walkableCandidates
  if (candidates.length > 0) {
    const target = candidates[Math.floor(Math.random() * candidates.length)]
    state.world.moveEntity(eid, target.x, target.y)
  }
}

// --- Activation (player touch) ---

/** Called when the player walks over a wandering monarch. */
export const activateMonarch = (state: GameState, eid: Entity, time: number): void => {
  const monarchState = state.world.getComponent(eid, ComponentType.MonarchState)
  if (monarchState?.phase !== 'wandering') return

  const pos = state.world.getComponent(eid, ComponentType.Position)
  if (!pos) return

  // Find a target tile with healthy soil
  const target = findHealthySoilTarget(state, pos)

  if (target) {
    monarchState.phase = 'spawning'
    monarchState.target = target
  }
  // If no target found, monarch stays in wandering — can be activated again later

  spawnPickupBloom(state, state.player.x, state.player.y, time)
}

/** Search for a dirt tile with soil health >= threshold within radius. */
const findHealthySoilTarget = (state: GameState, from: Position): Position | null => {
  // First pass: high threshold
  const high = searchForSoilTile(state, from, MONARCH_SOIL_THRESHOLD_HIGH)
  if (high) return high

  // Second pass: lower threshold
  return searchForSoilTile(state, from, MONARCH_SOIL_THRESHOLD_LOW)
}

const searchForSoilTile = (
  state: GameState,
  from: Position,
  threshold: number
): Position | null => {
  const candidates: Position[] = []
  const r = MONARCH_SEARCH_RADIUS

  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = from.x + dx
      const y = from.y + dy
      if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) continue
      if (dx * dx + dy * dy > r * r) continue
      if (state.map[y][x].type !== TileType.Dirt) continue
      const health = state.soilHealth.get(posKey(x, y)) ?? SOIL_HEALTH_DEFAULT
      if (health >= threshold) {
        candidates.push({ x, y })
      }
    }
  }

  if (candidates.length === 0) return null
  return candidates[Math.floor(Math.random() * candidates.length)]
}

// --- Spawner movement ---

const tickSpawningMonarch = (state: GameState, eid: Entity): void => {
  const monarchState = state.world.getComponent(eid, ComponentType.MonarchState)
  const pos = state.world.getComponent(eid, ComponentType.Position)
  if (!monarchState || !pos || monarchState.phase !== 'spawning' || !monarchState.target) return

  const target = monarchState.target

  // Already at target — plant the prairie
  if (pos.x === target.x && pos.y === target.y) {
    plantPrairie(state, target)
    monarchState.phase = 'idle'
    monarchState.target = null
    return
  }

  // Move toward target via pathfinding (one step per tick)
  const path = findPath(state.map, state.mapWidth, state.mapHeight, pos, target)
  if (path && path.length > 0) {
    const next = path[0]
    state.world.moveEntity(eid, next.x, next.y)
  } else {
    // Can't reach target — revert to wandering
    monarchState.phase = 'wandering'
    monarchState.target = null
  }
}

// --- Prairie planting ---

/** Plant a 10x10 clover patch and heal soil in 20x20 area. */
export const plantPrairie = (state: GameState, center: Position): void => {
  const halfPrairie = Math.floor(MONARCH_PRAIRIE_SIZE / 2)
  const halfHeal = Math.floor(MONARCH_HEAL_SIZE / 2)
  const maxDist = Math.sqrt(halfHeal * halfHeal + halfHeal * halfHeal)

  // Plant clover in 10x10 area (only on dirt)
  for (let dy = -halfPrairie; dy < halfPrairie; dy++) {
    for (let dx = -halfPrairie; dx < halfPrairie; dx++) {
      const x = center.x + dx
      const y = center.y + dy
      if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) continue
      if (state.map[y][x].type !== TileType.Dirt) continue
      state.map[y][x] = { type: TileType.Clover }
      const key = posKey(x, y)
      state.cloverLifecycle.set(key, {
        stage: CloverStage.Healthy,
        stageStartTime: Date.now(),
        hasLight: state.currentZone === Zone.Overworld,
      })
    }
  }

  // Heal soil in 20x20 area with gradient
  for (let dy = -halfHeal; dy < halfHeal; dy++) {
    for (let dx = -halfHeal; dx < halfHeal; dx++) {
      const x = center.x + dx
      const y = center.y + dy
      if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) continue
      if (!isWalkableTile(state.map[y][x].type)) continue

      const dist = Math.sqrt(dx * dx + dy * dy)
      // Linear gradient: center = MONARCH_HEAL_CENTER_PCT, edge = MONARCH_HEAL_EDGE_PCT
      const t = Math.min(dist / maxDist, 1)
      const healPct = MONARCH_HEAL_CENTER_PCT + t * (MONARCH_HEAL_EDGE_PCT - MONARCH_HEAL_CENTER_PCT)
      const healAmount = healPct * SOIL_HEALTH_MAX

      const key = posKey(x, y)
      const current = state.soilHealth.get(key) ?? SOIL_HEALTH_DEFAULT
      state.soilHealth.set(key, Math.min(current + healAmount, SOIL_HEALTH_MAX))
    }
  }
}

// --- Tick ---

/** Main tick function for all monarchs. Called from gameLoop. */
export const tickMonarchs = (state: GameState, zone?: Zone): void => {
  const z = zone ?? state.currentZone

  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'monarch') continue
    if (state.world.getComponent(eid, ComponentType.EntityZone)?.zone !== z) continue

    const monarchState = state.world.getComponent(eid, ComponentType.MonarchState)
    if (!monarchState) continue

    switch (monarchState.phase) {
      case 'wandering':
      case 'idle':
        wanderMonarch(state, eid)
        break
      case 'spawning':
        tickSpawningMonarch(state, eid)
        break
    }
  }

  // Hunger applies to all monarch phases
  tickCreatureHunger(state, 'monarch', BEE_STARVATION_MS, MONARCH_TICK_MS, isMonarchNearFood)
}
