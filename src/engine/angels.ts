import { CHARACTER_DEFINITIONS, removeCharacterDefinition } from './characters'
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
import { recordDiscovery } from './manual'
import { setMapTile } from './map'
import { spawnBeeOrMonarch } from './monarch'
import { CARDINAL, isInBounds, isWalkableTile, posKey } from './position'
import { FloraSpecies, FloraStage, TileType, Zone } from './types'

import type { GameState, Position } from './types'

// --- Angel names by aura kind ---

const ANGEL_NAMES: Record<string, string> = {
  rain: 'Angel of Rain',
  bees: 'Angel of Bees',
  clover: 'Angel of Clover',
}

// --- sha256 hash generation ---

const sha256 = async (message: string): Promise<string> => {
  const data = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Synchronous fallback using simple hash mixing for deterministic generation
const sha256Sync = (message: string): string => {
  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19

  for (let i = 0; i < message.length; i++) {
    const c = message.charCodeAt(i)
    h0 = (h0 ^ c) * 0x01000193
    h1 = (h1 ^ (c << 8)) * 0x01000193
    h2 = (h2 ^ (c << 16)) * 0x01000193
    h3 = (h3 ^ c) * 0x100003b
    h4 = (h4 ^ (c << 4)) * 0x100003b
    h5 = (h5 ^ (c << 12)) * 0x100003b
    h6 = (h6 ^ (c << 20)) * 0x100003b
    h7 = (h7 ^ c) * 0x1000037
  }

  const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, '0')
  return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4) + hex(h5) + hex(h6) + hex(h7)
}

export const generateAngelHash = (
  stewardName: string,
  spawnX: number,
  spawnY: number,
  encounterCount: number
): string => sha256Sync(`${stewardName}:${String(spawnX)},${String(spawnY)}:${String(encounterCount)}`).toUpperCase()

// Async version for when crypto.subtle is available
export const generateAngelHashAsync = async (
  stewardName: string,
  spawnX: number,
  spawnY: number,
  encounterCount: number
): Promise<string> => {
  try {
    return (await sha256(`${stewardName}:${String(spawnX)},${String(spawnY)}:${String(encounterCount)}`)).toUpperCase()
  } catch {
    return generateAngelHash(stewardName, spawnX, spawnY, encounterCount)
  }
}

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
      cantoStored: false,
      encounterCount: state.angelEncounterCount,
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

    // Register dynamic character definition
    const angelId = `angel-${String(time)}`
    CHARACTER_DEFINITIONS[angelId] = {
      id: angelId,
      name: ANGEL_NAMES[auraKind] ?? 'Angel',
      glyph: 'O',
      glyphColor: '#FFFFFF',
      dialog: [generateAngelHash(state.stewardName, x, y, state.angelEncounterCount)],
    }
    state.world.addComponent(e, ComponentType.CharacterIdentity, { definitionId: angelId })

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
  // Clean up character definition
  const identity = state.world.getComponent(eid, ComponentType.CharacterIdentity)
  if (identity) {
    removeCharacterDefinition(identity.definitionId)
  }

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
      // self-propagate in this PR. Pollinator routes are precis #7.
      setMapTile(state, ox, oy, { type: TileType.Flora })
      state.floraLifecycle.set(posKey(ox, oy), {
        stage: FloraStage.Healthy,
        stageStartTime: time,
        hasLight: true,
        species: FloraSpecies.Clover,
      })
      data.lastCloverGrowTime = time
      break
    }
  }
}

// --- Canto storage (called from interactWithCharacter) ---

export const storeAngelCanto = (state: GameState, characterId: string): void => {
  for (const eid of state.world.query(ComponentType.AngelData, ComponentType.CharacterIdentity)) {
    const identity = state.world.getComponent(eid, ComponentType.CharacterIdentity)
    if (identity?.definitionId !== characterId) continue
    const data = state.world.getComponent(eid, ComponentType.AngelData)
    if (!data || data.cantoStored) return

    data.cantoStored = true
    const hash = generateAngelHash(
      state.stewardName,
      data.seed % 10000,
      Math.floor(data.seed / 10000) % 10000,
      data.encounterCount
    )
    state.angelCantos.push(hash)
    state.angelEncounterCount++
    recordDiscovery(state, 'event:angel-canto')
    return
  }
}

// --- Deep time cleanup ---

export const destroyAllAngels = (state: GameState, time: number): void => {
  for (const eid of state.world.query(ComponentType.AngelData)) {
    despawnAngel(state, eid, time)
  }
}
