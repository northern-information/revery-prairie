import {
  BEE_STARVATION_MS,
  MONARCH_FLEE_RADIUS,
  MONARCH_POLLINATE_MS,
  MONARCH_SEARCH_RADIUS,
  MONARCH_SETTLE_RADIUS,
  MONARCH_SOIL_THRESHOLD_HIGH,
  MONARCH_SOIL_THRESHOLD_LOW,
  MONARCH_SPAWN_CHANCE,
  MONARCH_TICK_MS,
  MONARCH_ZIGZAG_MAX,
  MONARCH_ZIGZAG_MIN,
  SOIL_HEALTH_DEFAULT,
} from './constants'
import { ComponentType } from './ecs/types'
import { spawnPickupBloom } from './effects'
import { FLORA_SPECIES } from './flora/species'
import { createFloraLifecycleEntry } from './floraLifecycleEntry'
import { generateRuntimeIdentity, generateTraitBag } from './genetics'
import { tickCreatureHunger } from './hunger'
import { setMapTile } from './map'
import { findPath } from './pathfinding'
import { CARDINAL, isInBounds, isWalkableTile, posKey } from './position'
import { FloraSpecies, Sky, TileType, Zone } from './types'
import { getWorldForZone } from './zone'

import type { Entity } from './ecs/types'
import type { GameState, Position } from './types'

// --- Spawn ---

/** Returns true if the current weather is rain — the only condition under which monarchs spawn. */
export const isMonarchSpawnCondition = (state: GameState): boolean => state.weather.sky === Sky.Rain

/** Roll whether a spawning bee should become a monarch instead. */
export const shouldSpawnMonarch = (state: GameState): boolean =>
  isMonarchSpawnCondition(state) && Math.random() < MONARCH_SPAWN_CHANCE

/** Create a monarch entity at the given position. */
export const spawnMonarch = (state: GameState, x: number, y: number): Entity => {
  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x, y })
  state.world.addComponent(e, ComponentType.EntityTag, 'monarch')
  state.world.addComponent(e, ComponentType.HungerTimer, { hungerMs: 0 })
  state.world.addComponent(e, ComponentType.MonarchState, {
    phase: 'wandering',
    target: null,
    waypoint: null,
    lastPollinateTime: 0,
  })
  // RP-17 — empty PollenBag at creation. Bee-mediated pollination
  // (src/engine/beePollination.ts) reads and writes this on movement
  // ticks.
  state.world.addComponent(e, ComponentType.PollenBag, { loads: [] })
  return e
}

/** Create a bee entity at the given position (extracted for reuse at spawn sites). */
export const spawnBee = (state: GameState, x: number, y: number, zone?: Zone): Entity => {
  // Route to target zone's world if one is provided; otherwise spawn in
  // the active zone. Most callers don't pass zone — angels.ts is the
  // one site that does, explicitly targeting Overworld.
  const world = zone !== undefined ? getWorldForZone(state, zone) : state.world
  const e = world.createEntity()
  world.addComponent(e, ComponentType.Position, { x, y })
  world.addComponent(e, ComponentType.EntityTag, 'bee')
  world.addComponent(e, ComponentType.HungerTimer, { hungerMs: 0 })
  // RP-17 — empty PollenBag at creation.
  world.addComponent(e, ComponentType.PollenBag, { loads: [] })
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

// --- Hunger helper ---

const isMonarchNearFood = (state: GameState, pos: Position): boolean => {
  if (isInBounds(pos.x, pos.y, state.mapWidth, state.mapHeight) && state.map[pos.y][pos.x].type === TileType.Flora)
    return true
  for (const d of CARDINAL) {
    const nx = pos.x + d.x
    const ny = pos.y + d.y
    if (isInBounds(nx, ny, state.mapWidth, state.mapHeight) && state.map[ny][nx].type === TileType.Flora) return true
  }
  return false
}

// --- Zig-zag waypoint generation ---

/** Pick a random waypoint 5-10 tiles away, biased toward nearby clover. */
const pickZigzagWaypoint = (state: GameState, from: Position, biasTarget?: Position | null): Position | null => {
  const dist = MONARCH_ZIGZAG_MIN + Math.floor(Math.random() * (MONARCH_ZIGZAG_MAX - MONARCH_ZIGZAG_MIN + 1))

  // If biased toward a target (clover or flee destination), 70% chance to head that direction
  if (biasTarget && Math.random() < 0.7) {
    const dx = biasTarget.x - from.x
    const dy = biasTarget.y - from.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len > 0) {
      // Add some randomness to the direction (±30 degrees worth of jitter)
      const jitter = (Math.random() - 0.5) * 1.0
      const nx = Math.round(from.x + (dx / len + jitter) * dist)
      const ny = Math.round(from.y + (dy / len + jitter) * dist)
      if (isInBounds(nx, ny, state.mapWidth, state.mapHeight) && isWalkableTile(state.map[ny][nx].type)) {
        return { x: nx, y: ny }
      }
    }
  }

  // Random direction fallback — try a few times to find a walkable target
  for (let attempt = 0; attempt < 8; attempt++) {
    const angle = Math.random() * Math.PI * 2
    const nx = Math.round(from.x + Math.cos(angle) * dist)
    const ny = Math.round(from.y + Math.sin(angle) * dist)
    if (isInBounds(nx, ny, state.mapWidth, state.mapHeight) && isWalkableTile(state.map[ny][nx].type)) {
      return { x: nx, y: ny }
    }
  }

  return null
}

/** Find the nearest clover patch center within search radius. */
const findNearbyClover = (state: GameState, from: Position, radius: number): Position | null => {
  let best: Position | null = null
  let bestDist = Infinity

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = from.x + dx
      const y = from.y + dy
      if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) continue
      if (state.map[y][x].type !== TileType.Flora) continue
      const d = dx * dx + dy * dy
      if (d < bestDist) {
        bestDist = d
        best = { x, y }
      }
    }
  }

  return best
}

// --- Wandering phase ---

const tickWandering = (state: GameState, eid: Entity): void => {
  const pos = state.world.getComponent(eid, ComponentType.Position)
  const monarchState = state.world.getComponent(eid, ComponentType.MonarchState)
  if (!pos || !monarchState) return

  // Check player proximity — flee if player gets close
  const dx = state.player.x - pos.x
  const dy = state.player.y - pos.y
  const playerDist = Math.sqrt(dx * dx + dy * dy)
  if (playerDist <= MONARCH_FLEE_RADIUS) {
    triggerFlee(state, eid, pos)
    // Inline discovery to avoid circular import (monarch → manual → recipes → monarch)
    state.manualDiscoveries.add('entity:monarch')
    spawnPickupBloom(state, state.player.x, state.player.y, performance.now())
    return
  }

  // If we have a waypoint, move toward it
  if (monarchState.waypoint) {
    if (pos.x === monarchState.waypoint.x && pos.y === monarchState.waypoint.y) {
      // Reached waypoint — pick a new one
      monarchState.waypoint = null
    } else {
      moveTowardWaypoint(state, eid, pos, monarchState.waypoint)
      return
    }
  }

  // Pick a new zig-zag waypoint, biased toward nearby clover
  const nearbyClover = findNearbyClover(state, pos, 15)
  monarchState.waypoint = pickZigzagWaypoint(state, pos, nearbyClover)
}

// --- Flee phase ---

const triggerFlee = (state: GameState, eid: Entity, pos: Position): void => {
  const monarchState = state.world.getComponent(eid, ComponentType.MonarchState)
  if (!monarchState) return

  // Find fertile soil target away from the player
  const target = findFertileSoilTarget(state, pos)
  monarchState.phase = 'fleeing'
  monarchState.target = target
  monarchState.waypoint = null
}

/** Search for a dirt/clover tile with good soil health, preferring areas away from the player. */
const findFertileSoilTarget = (state: GameState, from: Position): Position | null => {
  const high = searchForFertileTile(state, from, MONARCH_SOIL_THRESHOLD_HIGH)
  if (high) return high
  return searchForFertileTile(state, from, MONARCH_SOIL_THRESHOLD_LOW)
}

const searchForFertileTile = (state: GameState, from: Position, threshold: number): Position | null => {
  const candidates: Position[] = []
  const r = MONARCH_SEARCH_RADIUS

  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = from.x + dx
      const y = from.y + dy
      if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) continue
      if (dx * dx + dy * dy > r * r) continue
      const tile = state.map[y][x].type
      // Accept clover or dirt with good soil
      if (tile !== TileType.Dirt && tile !== TileType.Flora) continue
      const health = state.soilHealth.get(posKey(x, y)) ?? SOIL_HEALTH_DEFAULT
      if (health >= threshold) {
        candidates.push({ x, y })
      }
    }
  }

  if (candidates.length === 0) return null

  // Prefer tiles farther from the player (sort by distance descending, pick from top quarter)
  candidates.sort((a, b) => {
    const da = (a.x - state.player.x) ** 2 + (a.y - state.player.y) ** 2
    const db = (b.x - state.player.x) ** 2 + (b.y - state.player.y) ** 2
    return db - da
  })

  const topSlice = Math.max(1, Math.floor(candidates.length / 4))
  return candidates[Math.floor(Math.random() * topSlice)]
}

const tickFleeing = (state: GameState, eid: Entity): void => {
  const pos = state.world.getComponent(eid, ComponentType.Position)
  const monarchState = state.world.getComponent(eid, ComponentType.MonarchState)
  if (!pos || !monarchState) return

  // No target — settle wherever we are
  if (!monarchState.target) {
    monarchState.phase = 'settled'
    monarchState.target = { x: pos.x, y: pos.y }
    monarchState.waypoint = null
    monarchState.lastPollinateTime = performance.now()
    return
  }

  const target = monarchState.target

  // Reached the target — settle here
  if (pos.x === target.x && pos.y === target.y) {
    monarchState.phase = 'settled'
    monarchState.waypoint = null
    monarchState.lastPollinateTime = performance.now()
    return
  }

  // Zig-zag toward target via waypoints
  if (monarchState.waypoint) {
    if (pos.x === monarchState.waypoint.x && pos.y === monarchState.waypoint.y) {
      monarchState.waypoint = null
    } else {
      moveTowardWaypoint(state, eid, pos, monarchState.waypoint)
      return
    }
  }

  // Pick next zig-zag leg biased toward the flee target
  monarchState.waypoint = pickZigzagWaypoint(state, pos, target)

  // If we can't find a waypoint, try direct path
  if (!monarchState.waypoint) {
    moveTowardWaypoint(state, eid, pos, target)
  }
}

// --- Settled phase ---

const tickSettled = (state: GameState, eid: Entity, now: number): void => {
  const pos = state.world.getComponent(eid, ComponentType.Position)
  const monarchState = state.world.getComponent(eid, ComponentType.MonarchState)
  if (!pos || !monarchState?.target) return

  // Wander in small area around settle point
  if (Math.random() < 0.15) {
    const candidates: Position[] = []
    for (const d of CARDINAL) {
      const nx = pos.x + d.x
      const ny = pos.y + d.y
      if (!isInBounds(nx, ny, state.mapWidth, state.mapHeight)) continue
      if (!isWalkableTile(state.map[ny][nx].type)) continue
      // Stay within settle radius
      const dxS = nx - monarchState.target.x
      const dyS = ny - monarchState.target.y
      if (dxS * dxS + dyS * dyS > MONARCH_SETTLE_RADIUS * MONARCH_SETTLE_RADIUS) continue
      candidates.push({ x: nx, y: ny })
    }
    if (candidates.length > 0) {
      // Prefer clover tiles. Wildflower and tall grass tiles share
      // TileType.Flora but monarchs target only clover per RP-1 —
      // broader pollinator routes are RP-7.
      const clover = candidates.filter(
        c =>
          state.map[c.y][c.x].type === TileType.Flora &&
          state.floraLifecycle.get(posKey(c.x, c.y))?.species === FloraSpecies.Clover
      )
      const pick = clover.length > 0 ? clover : candidates
      const target = pick[Math.floor(Math.random() * pick.length)]
      state.world.moveEntity(eid, target.x, target.y, MONARCH_TICK_MS)
      // v11 R4 — the camera notices change on its own sim-loop hook;
      // no event call here.
    }
  }

  // Pollinate: spread clover to one adjacent dirt tile near existing clover
  if (now - monarchState.lastPollinateTime >= MONARCH_POLLINATE_MS) {
    monarchState.lastPollinateTime = now
    pollinate(state, monarchState.target)
  }
}

/** Spread clover to one dirt tile adjacent to existing clover within the settle area. */
export const pollinate = (state: GameState, center: Position): boolean => {
  const r = MONARCH_SETTLE_RADIUS
  const candidates: Position[] = []

  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = center.x + dx
      const y = center.y + dy
      if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) continue
      if (state.map[y][x].type !== TileType.Dirt) continue

      // Only spread to dirt tiles adjacent to existing clover. Wildflower
      // and tall grass do not trigger monarch propagation per RP-1.
      let adjacentToClover = false
      for (const d of CARDINAL) {
        const nx = x + d.x
        const ny = y + d.y
        if (!isInBounds(nx, ny, state.mapWidth, state.mapHeight)) continue
        if (state.map[ny][nx].type !== TileType.Flora) continue
        if (state.floraLifecycle.get(posKey(nx, ny))?.species !== FloraSpecies.Clover) continue
        adjacentToClover = true
        break
      }
      if (adjacentToClover) {
        candidates.push({ x, y })
      }
    }
  }

  if (candidates.length === 0) return false

  // Monarchs grow clover specifically — wildflower and tall grass do not
  // self-propagate in this PR. Pollinator routes are RP-7.
  const tile = candidates[Math.floor(Math.random() * candidates.length)]
  setMapTile(state, tile.x, tile.y, { type: TileType.Flora })
  const tileKey = posKey(tile.x, tile.y)
  const species = FloraSpecies.Clover
  const binomial = FLORA_SPECIES[species].latinBinomial
  const identity = generateRuntimeIdentity(binomial, tileKey, Date.now())
  state.floraLifecycle.set(
    tileKey,
    createFloraLifecycleEntry({
      time: Date.now(),
      hasLight: state.currentZone === Zone.Overworld,
      species,
      identity,
      traits: generateTraitBag(identity),
    })
  )
  return true
}

// --- Movement helper ---

const moveTowardWaypoint = (state: GameState, eid: Entity, pos: Position, waypoint: Position): void => {
  const path = findPath(state.map, state.mapWidth, state.mapHeight, pos, waypoint)
  if (path && path.length > 0) {
    const next = path[0]
    state.world.moveEntity(eid, next.x, next.y, MONARCH_TICK_MS)
  } else {
    // Can't reach waypoint — clear it so a new one is picked next tick
    const monarchState = state.world.getComponent(eid, ComponentType.MonarchState)
    if (monarchState) {
      monarchState.waypoint = null
    }
  }
}

// --- Main tick ---

/** Main tick function for all monarchs. Called from gameLoop. */
export const tickMonarchs = (state: GameState, now: number, _zone?: Zone): void => {
  // Per-zone worlds: state.world only contains entities in the active
  // zone. Zone arg preserved for back-compat at call sites.
  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'monarch') continue

    const monarchState = state.world.getComponent(eid, ComponentType.MonarchState)
    if (!monarchState) continue

    switch (monarchState.phase) {
      case 'wandering':
        tickWandering(state, eid)
        break
      case 'fleeing':
        tickFleeing(state, eid)
        break
      case 'settled':
        tickSettled(state, eid, now)
        break
    }
  }

  // Hunger applies to all monarch phases
  tickCreatureHunger(state, 'monarch', BEE_STARVATION_MS, MONARCH_TICK_MS, isMonarchNearFood)
}
