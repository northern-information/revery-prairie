import {
  MAP_HEIGHT,
  MAP_WIDTH,
  SATELLITE_CRATER_DEPTH_CENTER,
  SATELLITE_CRATER_DEPTH_EDGE,
  SATELLITE_CRATER_DEPTH_RING,
  SATELLITE_GOOD_PAYLOAD_CHANCE,
  SATELLITE_IMPACT_DURATION_MS,
  SATELLITE_IMPACT_RADIUS,
  SATELLITE_MAX_AGE,
  SATELLITE_MAX_LENGTH,
  SATELLITE_MIN_LENGTH,
  SATELLITE_MIN_SPAWN_INTERVAL_MS,
  SATELLITE_SEED_COUNT_MAX,
  SATELLITE_SEED_COUNT_MIN,
  SATELLITE_SOIL_DAMAGE,
  SATELLITE_SPAWN_CHANCE,
  SPACE_BORDER,
} from './constants'
import { ComponentType } from './ecs/types'
import { recordDiscovery } from './manual'
import { isInBounds, isWalkableTile, posKey } from './position'
import { onElevationMutated } from './render/cacheContract'
import { TileType, Zone } from './types'
import { spatialAtInCurrentZone } from './zone'

import type { GameState, Position } from './types'

const SEED_ITEM_IDS = ['wildflowerSeeds', 'tallGrassSeeds', 'milkweedSeeds']

const PROTECTED_TILES = new Set<TileType>([
  TileType.Space,
  TileType.Sand,
  TileType.CaveEntrance,
  TileType.CaveApron,
  TileType.RuinEntrance,
  TileType.RuinApron,
  TileType.CaveWall,
  TileType.CaveBreakableWall,
  TileType.RuinWall,
])

/** Find a random walkable land target for a satellite to hit. */
const findSatelliteTarget = (state: GameState): Position | null => {
  const maxAttempts = 200
  for (let i = 0; i < maxAttempts; i++) {
    const x = SPACE_BORDER + Math.floor(Math.random() * (state.mapWidth - SPACE_BORDER * 2))
    const y = SPACE_BORDER + Math.floor(Math.random() * (state.mapHeight - SPACE_BORDER * 2))
    if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) continue
    const tile = state.map[y][x].type
    if (tile !== TileType.Dirt && tile !== TileType.Clover) continue
    // Avoid landing directly on the player
    if (state.player.x === x && state.player.y === y) continue
    return { x, y }
  }
  return null
}

export const spawnSatellite = (state: GameState, time: number): void => {
  if (state.deepTime?.active) return
  if (state.meteorShower.active) return
  if (state.currentZone !== Zone.Overworld) return

  // Only one satellite at a time
  if (state.world.query(ComponentType.SatelliteData).length > 0) return

  // Enforce minimum interval
  if (time - state.lastSatelliteSpawnTime < SATELLITE_MIN_SPAWN_INTERVAL_MS) return

  // Probability gate
  if (Math.random() >= SATELLITE_SPAWN_CHANCE) return

  // Find a landing target
  const target = findSatelliteTarget(state)
  if (!target) return

  // Pick a random edge and trace backward from the target
  const dx = Math.random() < 0.5 ? 1 : -1
  const dy = Math.random() < 0.5 ? 1 : -1

  // Trace backward from target to find starting position off-map
  let sx = target.x
  let sy = target.y
  while (isInBounds(sx, sy, MAP_WIDTH, MAP_HEIGHT)) {
    sx -= dx
    sy -= dy
  }

  const length = SATELLITE_MIN_LENGTH + Math.floor(Math.random() * (SATELLITE_MAX_LENGTH - SATELLITE_MIN_LENGTH + 1))

  const payloadType = Math.random() < SATELLITE_GOOD_PAYLOAD_CHANCE ? 'seeds' : 'destructive'

  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x: sx, y: sy })
  state.world.addComponent(e, ComponentType.Velocity, { dx, dy })
  state.world.addComponent(e, ComponentType.SatelliteData, {
    length,
    age: 0,
    landingTarget: target,
    payloadType,
  })
  state.world.addComponent(e, ComponentType.EntityTag, 'satellite')
  state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.Overworld })

  state.lastSatelliteSpawnTime = time
}

/** Apply 5x5 crater damage: convert tiles, reduce soil health, destroy ghosts. */
const applyImpact = (state: GameState, center: Position, time: number): void => {
  const r = SATELLITE_IMPACT_RADIUS

  // Destroy ghosts in impact zone
  const ghostEntities = state.world.query(ComponentType.CharacterIdentity, ComponentType.Position)
  for (const eid of ghostEntities) {
    const identity = state.world.getComponent(eid, ComponentType.CharacterIdentity)
    if (!identity?.definitionId.startsWith('ghost-')) continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!pos) continue
    if (Math.abs(pos.x - center.x) <= r && Math.abs(pos.y - center.y) <= r) {
      state.world.destroyEntity(eid)
    }
  }

  // Apply crater to tiles
  const elevationAffected: Position[] = []
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = center.x + dx
      const y = center.y + dy
      if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) continue

      const tile = state.map[y][x]
      if (PROTECTED_TILES.has(tile.type)) continue

      // Mark the tile as cratered (persistent effect; tile type is unchanged)
      const key = posKey(x, y)
      if (tile.type === TileType.Dirt || tile.type === TileType.Clover) {
        state.craters.add(key)
      }

      // Reduce soil health for all non-protected tiles in zone
      const current = state.soilHealth.get(key) ?? 50
      state.soilHealth.set(key, Math.max(0, current - SATELLITE_SOIL_DAMAGE))

      // Deform terrain: radial elevation falloff. Chebyshev distance from
      // center selects center (0), ring (1), or edge (2) depth.
      const cheb = Math.max(Math.abs(dx), Math.abs(dy))
      const drop =
        cheb === 0
          ? SATELLITE_CRATER_DEPTH_CENTER
          : cheb === 1
            ? SATELLITE_CRATER_DEPTH_RING
            : SATELLITE_CRATER_DEPTH_EDGE
      const currentElev = state.elevation.get(key) ?? 50
      state.elevation.set(key, Math.max(0, Math.min(100, currentElev - drop)))
      elevationAffected.push({ x, y })
    }
  }
  if (elevationAffected.length > 0) {
    onElevationMutated(state.map, elevationAffected)
  }

  // Spawn large explosion effect
  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x: center.x, y: center.y })
  state.world.addComponent(e, ComponentType.TimedEffect, { kind: 'satelliteImpact', startTime: time })
  state.world.addComponent(e, ComponentType.EntityTag, 'satelliteImpact')
  state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.Overworld })

  recordDiscovery(state, 'event:satellite-impact')
}

/** Scatter seed items as ground items in the crater zone. */
const scatterSeeds = (state: GameState, center: Position): void => {
  const r = SATELLITE_IMPACT_RADIUS
  const count =
    SATELLITE_SEED_COUNT_MIN + Math.floor(Math.random() * (SATELLITE_SEED_COUNT_MAX - SATELLITE_SEED_COUNT_MIN + 1))

  // Collect valid placement positions (crater tiles, no existing ground items)
  const candidates: Position[] = []
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = center.x + dx
      const y = center.y + dy
      if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) continue
      if (!isWalkableTile(state.map[y][x].type)) continue
      // Check no ground items already here
      const entities = spatialAtInCurrentZone(state, x, y)
      const hasGroundItem = entities.some(
        eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'groundItem'
      )
      if (hasGroundItem) continue
      candidates.push({ x, y })
    }
  }

  // Shuffle candidates
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }

  const toPlace = Math.min(count, candidates.length)
  for (let i = 0; i < toPlace; i++) {
    const pos = candidates[i]
    const seedId = SEED_ITEM_IDS[Math.floor(Math.random() * SEED_ITEM_IDS.length)]
    const ge = state.world.createEntity()
    state.world.addComponent(ge, ComponentType.Position, { x: pos.x, y: pos.y })
    state.world.addComponent(ge, ComponentType.ItemDrop, { definitionId: seedId })
    state.world.addComponent(ge, ComponentType.EntityTag, 'groundItem')
    state.world.addComponent(ge, ComponentType.EntityZone, { zone: Zone.Overworld })
  }
}

export const tickSatellites = (state: GameState, time: number): Position | null => {
  let impactPos: Position | null = null
  const satellites = state.world.query(ComponentType.SatelliteData, ComponentType.Position, ComponentType.Velocity)

  for (const eid of satellites) {
    const pos = state.world.getComponent(eid, ComponentType.Position)
    const vel = state.world.getComponent(eid, ComponentType.Velocity)
    const data = state.world.getComponent(eid, ComponentType.SatelliteData)
    if (!pos || !vel || !data) continue

    // Check if satellite reached its target before advancing
    if (pos.x === data.landingTarget.x && pos.y === data.landingTarget.y) {
      impactPos = { x: data.landingTarget.x, y: data.landingTarget.y }
      applyImpact(state, data.landingTarget, time)
      if (data.payloadType === 'seeds') {
        scatterSeeds(state, data.landingTarget)
      }
      state.world.destroyEntity(eid)
      continue
    }

    // Advance position
    state.world.moveEntity(eid, pos.x + vel.dx, pos.y + vel.dy)
    data.age++

    // Check again after moving (in case it just arrived)
    if (pos.x === data.landingTarget.x && pos.y === data.landingTarget.y) {
      impactPos = { x: data.landingTarget.x, y: data.landingTarget.y }
      applyImpact(state, data.landingTarget, time)
      if (data.payloadType === 'seeds') {
        scatterSeeds(state, data.landingTarget)
      }
      state.world.destroyEntity(eid)
      continue
    }

    // Remove if off-map or too old
    const buffer = data.length + 1
    if (
      pos.x < -buffer ||
      pos.x >= MAP_WIDTH + buffer ||
      pos.y < -buffer ||
      pos.y >= MAP_HEIGHT + buffer ||
      data.age > SATELLITE_MAX_AGE
    ) {
      state.world.destroyEntity(eid)
    }
  }

  // Clean up expired satellite impact effects
  for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag !== 'satelliteImpact') continue
    const effect = state.world.getComponent(eid, ComponentType.TimedEffect)
    if (!effect) continue
    if (time - effect.startTime > SATELLITE_IMPACT_DURATION_MS) {
      state.world.destroyEntity(eid)
    }
  }

  return impactPos
}
