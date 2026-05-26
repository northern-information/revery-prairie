import {
  ANGEL_AURA_KINDS,
  ANGEL_AURA_RADIUS,
  ANGEL_BEE_MAX,
  ANGEL_BEE_SPAWN_INTERVAL_MS,
  ANGEL_BODY_SIZE,
  ANGEL_CLOVER_GROW_INTERVAL_MS,
  ANGEL_DRIFT_CHANCE,
  ANGEL_DRIFT_TICK_MS,
  ANGEL_LIFESPAN_MS,
  ANGEL_MIN_PLAYER_DIST,
  ANGEL_SPAWN_INTERVAL_MS,
  ANGEL_SPAWN_JITTER_MS,
  SPACE_BORDER,
} from './constants'
import { ComponentType } from './ecs/types'
import { FLORA_SPECIES } from './flora/species'
import { createFloraLifecycleEntry } from './floraLifecycleEntry'
import { generateRuntimeIdentity, generateTraitBag } from './genetics'
import { recordDiscovery } from './manual'
import { setMapTile } from './map'
import { spawnBeeOrMonarch } from './monarch'
import { CARDINAL, isInBounds, isWalkableTile, posKey } from './position'
import { FloraSpecies, TileType, Zone } from './types'

import type { GameState, Position } from './types'

// --- Spawn logic ---

const isWaterTile = (state: GameState, x: number, y: number): boolean => {
  const key = posKey(x, y)
  return state.ponds.has(key) || state.rivers.has(key)
}

const getAngelBodyPositions = (anchorX: number, anchorY: number): Position[] => {
  const positions: Position[] = []
  for (let dy = 0; dy < ANGEL_BODY_SIZE; dy++) {
    for (let dx = 0; dx < ANGEL_BODY_SIZE; dx++) {
      positions.push({ x: anchorX + dx, y: anchorY + dy })
    }
  }
  return positions
}

const isValidAngelPosition = (state: GameState, anchorX: number, anchorY: number): boolean => {
  for (let dy = 0; dy < ANGEL_BODY_SIZE; dy++) {
    for (let dx = 0; dx < ANGEL_BODY_SIZE; dx++) {
      const x = anchorX + dx
      const y = anchorY + dy
      if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) return false
      const tile = state.map[y][x].type
      if (!isWalkableTile(tile)) return false
      if (tile === TileType.Sand) return false
      if (tile === TileType.CaveEntrance) return false
      if (isWaterTile(state, x, y)) return false
    }
  }
  return true
}

export const spawnAngel = (state: GameState, time: number): boolean => {
  if (state.deepTime?.active) return false
  if (state.currentZone !== Zone.Overworld) return false

  // Only one angel at a time
  const existing = state.world.query(ComponentType.AngelData)
  if (existing.length > 0) return false

  if (time < state.nextAngelSpawnTime) return false

  // Find a valid spawn position
  let attempts = 0
  while (attempts < 200) {
    attempts++
    const x = SPACE_BORDER + Math.floor(Math.random() * (state.mapWidth - SPACE_BORDER * 2 - ANGEL_BODY_SIZE))
    const y = SPACE_BORDER + Math.floor(Math.random() * (state.mapHeight - SPACE_BORDER * 2 - ANGEL_BODY_SIZE))

    // Check distance from player (use center of angel body)
    const centerX = x + Math.floor(ANGEL_BODY_SIZE / 2)
    const centerY = y + Math.floor(ANGEL_BODY_SIZE / 2)
    const pdx = centerX - state.player.x
    const pdy = centerY - state.player.y
    if (pdx * pdx + pdy * pdy < ANGEL_MIN_PLAYER_DIST * ANGEL_MIN_PLAYER_DIST) continue

    if (!isValidAngelPosition(state, x, y)) continue

    // Pick random aura kind
    const auraKind = ANGEL_AURA_KINDS[Math.floor(Math.random() * ANGEL_AURA_KINDS.length)]
    const seed = x * 374761393 + y * 668265263

    // Create ECS entity
    const e = state.world.createEntity()
    const centerPos = { x: centerX, y: centerY }
    state.world.addComponent(e, ComponentType.Position, centerPos)
    state.world.addComponent(e, ComponentType.MultiPosition, { positions: getAngelBodyPositions(x, y) })
    state.world.addComponent(e, ComponentType.AngelData, {
      auraKind,
      spawnTime: time,
      seed,
      lastBeeSpawnTime: 0,
      lastCloverGrowTime: 0,
    })
    state.world.addComponent(e, ComponentType.EntityTag, 'angel')
    state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.Overworld })

    // Rain aura angels use the existing rain aura system
    if (auraKind === 'rain') {
      state.world.addComponent(e, ComponentType.Aura, { kind: 'rain', radius: ANGEL_AURA_RADIUS })
    }

    state.angelFlashTime = time
    recordDiscovery(state, 'event:angel')
    return true
  }

  // No valid position found — reschedule
  state.nextAngelSpawnTime = time + ANGEL_SPAWN_INTERVAL_MS + Math.floor(Math.random() * ANGEL_SPAWN_JITTER_MS)
  return false
}

// --- Drift logic ---

export const tickAngelDrift = (state: GameState): void => {
  for (const eid of state.world.query(ComponentType.AngelData, ComponentType.Position, ComponentType.MultiPosition)) {
    if (state.world.getComponent(eid, ComponentType.EntityZone)?.zone !== Zone.Overworld) continue
    if (Math.random() >= ANGEL_DRIFT_CHANCE) continue

    // Freeze during dialog
    if (state.activeDialog) continue

    const pos = state.world.getComponent(eid, ComponentType.Position)
    const multi = state.world.getComponent(eid, ComponentType.MultiPosition)
    if (!pos || !multi) continue

    // Pick random cardinal direction
    const dir = CARDINAL[Math.floor(Math.random() * CARDINAL.length)]
    // Anchor is top-left of the body: derive from center
    const anchorX = pos.x - Math.floor(ANGEL_BODY_SIZE / 2) + dir.x
    const anchorY = pos.y - Math.floor(ANGEL_BODY_SIZE / 2) + dir.y

    if (!isValidAngelPosition(state, anchorX, anchorY)) continue

    // Move
    const newCenterX = anchorX + Math.floor(ANGEL_BODY_SIZE / 2)
    const newCenterY = anchorY + Math.floor(ANGEL_BODY_SIZE / 2)
    state.world.moveEntity(eid, newCenterX, newCenterY, ANGEL_DRIFT_TICK_MS)
    multi.positions = getAngelBodyPositions(anchorX, anchorY)
  }
}

// --- Despawn logic ---

export const tickAngelLifespan = (state: GameState, time: number): void => {
  for (const eid of state.world.query(ComponentType.AngelData, ComponentType.Position)) {
    const data = state.world.getComponent(eid, ComponentType.AngelData)
    if (!data) continue

    if (time - data.spawnTime >= ANGEL_LIFESPAN_MS) {
      despawnAngel(state, eid, time)
    }
  }
}

const despawnAngel = (state: GameState, eid: number, time: number): void => {
  state.world.destroyEntity(eid)

  state.angelFlashTime = time

  // Schedule next spawn
  state.nextAngelSpawnTime = time + ANGEL_SPAWN_INTERVAL_MS + Math.floor(Math.random() * ANGEL_SPAWN_JITTER_MS)
}

// --- Aura effects ---

export const tickAngelBeeAura = (state: GameState, time: number): void => {
  for (const eid of state.world.query(ComponentType.AngelData, ComponentType.Position)) {
    if (state.world.getComponent(eid, ComponentType.EntityZone)?.zone !== Zone.Overworld) continue
    const data = state.world.getComponent(eid, ComponentType.AngelData)
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!data || !pos || data.auraKind !== 'bees') continue

    if (time - data.lastBeeSpawnTime < ANGEL_BEE_SPAWN_INTERVAL_MS) continue

    // Count existing angel-spawned bees within aura
    let beeCount = 0
    for (const beid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
      if (state.world.getComponent(beid, ComponentType.EntityTag) !== 'bee') continue
      if (state.world.getComponent(beid, ComponentType.EntityZone)?.zone !== Zone.Overworld) continue
      const bpos = state.world.getComponent(beid, ComponentType.Position)
      if (!bpos) continue
      const dx = bpos.x - pos.x
      const dy = bpos.y - pos.y
      if (dx * dx + dy * dy <= ANGEL_AURA_RADIUS * ANGEL_AURA_RADIUS) beeCount++
    }

    if (beeCount >= ANGEL_BEE_MAX) continue

    // Find a random walkable tile within aura
    let spawnAttempts = 0
    while (spawnAttempts < 30) {
      spawnAttempts++
      const ox = pos.x + Math.floor(Math.random() * (ANGEL_AURA_RADIUS * 2 + 1)) - ANGEL_AURA_RADIUS
      const oy = pos.y + Math.floor(Math.random() * (ANGEL_AURA_RADIUS * 2 + 1)) - ANGEL_AURA_RADIUS
      const dx = ox - pos.x
      const dy = oy - pos.y
      if (dx * dx + dy * dy > ANGEL_AURA_RADIUS * ANGEL_AURA_RADIUS) continue
      if (!isInBounds(ox, oy, state.mapWidth, state.mapHeight)) continue
      if (!isWalkableTile(state.map[oy][ox].type)) continue
      if (state.map[oy][ox].type === TileType.Sand) continue
      if (isWaterTile(state, ox, oy)) continue

      spawnBeeOrMonarch(state, ox, oy, Zone.Overworld)
      data.lastBeeSpawnTime = time
      break
    }
  }
}

export const tickAngelCloverAura = (state: GameState, time: number): void => {
  for (const eid of state.world.query(ComponentType.AngelData, ComponentType.Position)) {
    if (state.world.getComponent(eid, ComponentType.EntityZone)?.zone !== Zone.Overworld) continue
    const data = state.world.getComponent(eid, ComponentType.AngelData)
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!data || !pos || data.auraKind !== 'clover') continue

    if (time - data.lastCloverGrowTime < ANGEL_CLOVER_GROW_INTERVAL_MS) continue

    // Find a random dirt tile within aura to convert
    let growAttempts = 0
    while (growAttempts < 30) {
      growAttempts++
      const ox = pos.x + Math.floor(Math.random() * (ANGEL_AURA_RADIUS * 2 + 1)) - ANGEL_AURA_RADIUS
      const oy = pos.y + Math.floor(Math.random() * (ANGEL_AURA_RADIUS * 2 + 1)) - ANGEL_AURA_RADIUS
      const dx = ox - pos.x
      const dy = oy - pos.y
      if (dx * dx + dy * dy > ANGEL_AURA_RADIUS * ANGEL_AURA_RADIUS) continue
      if (!isInBounds(ox, oy, state.mapWidth, state.mapHeight)) continue
      if (state.map[oy][ox].type !== TileType.Dirt) continue
      if (isWaterTile(state, ox, oy)) continue

      // Angels grow clover specifically — wildflower and tall grass do not
      // self-propagate in this PR. Pollinator routes are RP-7.
      setMapTile(state, ox, oy, { type: TileType.Flora })
      const tileKey = posKey(ox, oy)
      const species = FloraSpecies.Clover
      const binomial = FLORA_SPECIES[species].latinBinomial
      const identity = generateRuntimeIdentity(binomial, tileKey, time)
      state.floraLifecycle.set(
        tileKey,
        createFloraLifecycleEntry({
          time,
          hasLight: true,
          species,
          identity,
          traits: generateTraitBag(identity),
        })
      )
      data.lastCloverGrowTime = time
      break
    }
  }
}

// --- Deep time cleanup ---

export const destroyAllAngels = (state: GameState, time: number): void => {
  for (const eid of state.world.query(ComponentType.AngelData)) {
    despawnAngel(state, eid, time)
  }
}
