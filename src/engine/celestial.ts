import {
  EXPLOSION_DURATION_MS,
  MAP_HEIGHT,
  MAP_WIDTH,
  METEOR_SHOWER_MAX_INTERVAL_MS,
  METEOR_SHOWER_MIN_INTERVAL_MS,
  METEOR_SHOWER_SPAWN_WINDOW_MS,
  METEOR_SHOWER_STAR_COUNT_MAX,
  METEOR_SHOWER_STAR_COUNT_MIN,
  METEORITE_GROUND_MAX,
  PICKUP_EFFECT_DURATION_MS,
  PLAYER_SPAWN_DESCENT_TARGET_MS,
  SATELLITE_SHAKE_DURATION_MS,
  SHOOTING_STAR_LAND_CHANCE,
  SHOOTING_STAR_MAX_ACTIVE,
  SHOOTING_STAR_MAX_AGE,
  SHOOTING_STAR_MAX_LENGTH,
  SHOOTING_STAR_MIN_LENGTH,
  SHOOTING_STAR_SPAWN_CHANCE,
  SHOOTING_STAR_TICK_MS,
  SPACE_BORDER,
} from './constants'
import { ComponentType } from './ecs/types'
import { recordDiscovery } from './manual'
import { isInBounds, isWalkableTile, posKey } from './position'
import { TileType, Zone } from './types'
import { spatialAtInCurrentZone } from './zone'

import type { GameState, Position } from './types'

const CHAIN_EXPLOSION_CHANCE = 1 / 7
const CHAIN_EXPLOSION_RADIUS = 3
const CHAIN_EXPLOSION_COUNT = 3

const isTileOccupied = (state: GameState, x: number, y: number): boolean => {
  if (state.player.x === x && state.player.y === y) return true
  if (spatialAtInCurrentZone(state, x, y).length > 0) return true
  return false
}

const isWaterTile = (state: GameState, x: number, y: number): boolean => {
  const key = posKey(x, y)
  return state.ponds.has(key) || state.rivers.has(key)
}

export const countOverworldMeteorites = (state: GameState): number => {
  let count = 0
  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.EntityZone)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'meteorite') continue
    const zone = state.world.getComponent(eid, ComponentType.EntityZone)
    if (zone?.zone !== Zone.Overworld) continue
    count++
  }
  return count
}

export const spawnChainMeteorites = (state: GameState, origin: Position, time: number): number => {
  const candidates: Position[] = []
  for (let dy = -CHAIN_EXPLOSION_RADIUS; dy <= CHAIN_EXPLOSION_RADIUS; dy++) {
    for (let dx = -CHAIN_EXPLOSION_RADIUS; dx <= CHAIN_EXPLOSION_RADIUS; dx++) {
      if (dx === 0 && dy === 0) continue
      const x = origin.x + dx
      const y = origin.y + dy
      if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) continue
      if (!isWalkableTile(state.map[y][x].type)) continue
      if (isTileOccupied(state, x, y)) continue
      if (isWaterTile(state, x, y)) continue
      candidates.push({ x, y })
    }
  }

  // Shuffle and take up to CHAIN_EXPLOSION_COUNT
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }

  const spawned = Math.min(CHAIN_EXPLOSION_COUNT, candidates.length)
  if (spawned > 0) recordDiscovery(state, 'event:chain-explosion')
  for (let i = 0; i < spawned; i++) {
    const pos = candidates[i]
    const me = state.world.createEntity()
    state.world.addComponent(me, ComponentType.Position, { x: pos.x, y: pos.y })
    state.world.addComponent(me, ComponentType.Pickupable, { definitionId: 'meteorite' })
    state.world.addComponent(me, ComponentType.EntityTag, 'meteorite')
    state.world.addComponent(me, ComponentType.ChainSource, { fromChain: true })
    state.world.addComponent(me, ComponentType.EntityZone, { zone: Zone.Overworld })
    const e = state.world.createEntity()
    state.world.addComponent(e, ComponentType.Position, { x: pos.x, y: pos.y })
    state.world.addComponent(e, ComponentType.TimedEffect, { kind: 'explosion', startTime: time })
    state.world.addComponent(e, ComponentType.EntityTag, 'explosion')
    state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.Overworld })
  }

  return spawned
}

export { CHAIN_EXPLOSION_CHANCE }

export const spawnShootingStar = (state: GameState): void => {
  if (state.deepTime?.active) return
  if (state.meteorShower.active) return
  if (state.world.query(ComponentType.ShootingStarData).length >= SHOOTING_STAR_MAX_ACTIVE) return
  if (countOverworldMeteorites(state) >= METEORITE_GROUND_MAX) return
  if (Math.random() >= SHOOTING_STAR_SPAWN_CHANCE) return

  // Pick a random edge: 0=top, 1=bottom, 2=left, 3=right
  const edge = Math.floor(Math.random() * 4)
  let x: number
  let y: number
  let dx: number
  let dy: number

  if (edge === 0) {
    // top edge — move downward
    x = Math.floor(Math.random() * MAP_WIDTH)
    y = 0
    dx = Math.random() < 0.5 ? -1 : 1
    dy = 1
  } else if (edge === 1) {
    // bottom edge — move upward
    x = Math.floor(Math.random() * MAP_WIDTH)
    y = MAP_HEIGHT - 1
    dx = Math.random() < 0.5 ? -1 : 1
    dy = -1
  } else if (edge === 2) {
    // left edge — move rightward
    x = 0
    y = Math.floor(Math.random() * MAP_HEIGHT)
    dx = 1
    dy = Math.random() < 0.5 ? -1 : 1
  } else {
    // right edge — move leftward
    x = MAP_WIDTH - 1
    y = Math.floor(Math.random() * MAP_HEIGHT)
    dx = -1
    dy = Math.random() < 0.5 ? -1 : 1
  }

  // Occasional cardinal direction (drop one axis)
  if (Math.random() < 0.3) {
    if (Math.random() < 0.5) dx = 0
    else dy = 0
  }

  // Ensure we don't get a stationary star
  if (dx === 0 && dy === 0) dy = 1

  const length =
    SHOOTING_STAR_MIN_LENGTH + Math.floor(Math.random() * (SHOOTING_STAR_MAX_LENGTH - SHOOTING_STAR_MIN_LENGTH + 1))
  const willLand = Math.random() < SHOOTING_STAR_LAND_CHANCE

  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x, y })
  state.world.addComponent(e, ComponentType.Velocity, { dx, dy })
  state.world.addComponent(e, ComponentType.ShootingStarData, {
    length,
    age: 0,
    willLand,
    landingTarget: null,
  })
  state.world.addComponent(e, ComponentType.EntityTag, 'shootingStar')
  state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.Overworld })
}

export const spawnShootingStarAtTarget = (
  state: GameState,
  target: Position,
  direction?: { dx: number; dy: number },
  opts?: { forPlayerSpawn?: boolean; backtrackTiles?: number }
): number => {
  const dx = direction?.dx ?? (Math.random() < 0.5 ? 1 : -1)
  const dy = direction?.dy ?? (Math.random() < 0.5 ? 1 : -1)

  // Starting position: either trace back to off-map (default), or back N tiles
  let sx = target.x
  let sy = target.y
  if (opts?.backtrackTiles !== undefined) {
    sx = target.x - dx * opts.backtrackTiles
    sy = target.y - dy * opts.backtrackTiles
  } else {
    while (isInBounds(sx, sy, MAP_WIDTH, MAP_HEIGHT)) {
      sx -= dx
      sy -= dy
    }
  }

  const length =
    SHOOTING_STAR_MIN_LENGTH + Math.floor(Math.random() * (SHOOTING_STAR_MAX_LENGTH - SHOOTING_STAR_MIN_LENGTH + 1))

  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x: sx, y: sy })
  state.world.addComponent(e, ComponentType.Velocity, { dx, dy })
  state.world.addComponent(e, ComponentType.ShootingStarData, {
    length,
    age: 0,
    willLand: true,
    landingTarget: target,
    forPlayerSpawn: opts?.forPlayerSpawn === true ? true : undefined,
  })
  state.world.addComponent(e, ComponentType.EntityTag, 'shootingStar')
  state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.Overworld })
  return e
}

export const tickShootingStars = (state: GameState, time: number): void => {
  const starEntities = state.world.query(ComponentType.ShootingStarData, ComponentType.Position, ComponentType.Velocity)

  for (const eid of starEntities) {
    const pos = state.world.getComponent(eid, ComponentType.Position)
    const vel = state.world.getComponent(eid, ComponentType.Velocity)
    const data = state.world.getComponent(eid, ComponentType.ShootingStarData)
    if (!pos || !vel || !data) continue

    // Advance position
    state.world.moveEntity(eid, pos.x + vel.dx, pos.y + vel.dy)
    data.age++

    // Check if the star should land
    if (data.willLand) {
      const { x, y } = pos
      if (data.landingTarget) {
        // Targeted landing — only land on the exact target tile
        if (x === data.landingTarget.x && y === data.landingTarget.y) {
          if (!data.forPlayerSpawn && !isWaterTile(state, x, y)) {
            const me = state.world.createEntity()
            state.world.addComponent(me, ComponentType.Position, { x, y })
            state.world.addComponent(me, ComponentType.Pickupable, { definitionId: 'meteorite' })
            state.world.addComponent(me, ComponentType.EntityTag, 'meteorite')
            state.world.addComponent(me, ComponentType.EntityZone, { zone: Zone.Overworld })
          }
          const e = state.world.createEntity()
          state.world.addComponent(e, ComponentType.Position, { x, y })
          state.world.addComponent(e, ComponentType.TimedEffect, {
            kind: data.forPlayerSpawn ? 'stewardImpact' : 'explosion',
            startTime: time,
          })
          state.world.addComponent(e, ComponentType.EntityTag, 'explosion')
          state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.Overworld })
          if (data.forPlayerSpawn && state.playerSpawn.meteorEntityId === eid) {
            state.playerSpawn.visible = true
            state.playerSpawn.meteorEntityId = null
            state.screenShakeUntil = time + SATELLITE_SHAKE_DURATION_MS
          }
          state.world.destroyEntity(eid)
          continue
        }
      } else if (isInBounds(x, y, MAP_WIDTH, MAP_HEIGHT)) {
        // Untargeted landing — land on first walkable tile
        const tile = state.map[y][x]
        if (tile.type === TileType.Dirt || tile.type === TileType.Flora) {
          if (!isWaterTile(state, x, y)) {
            const me = state.world.createEntity()
            state.world.addComponent(me, ComponentType.Position, { x, y })
            state.world.addComponent(me, ComponentType.Pickupable, { definitionId: 'meteorite' })
            state.world.addComponent(me, ComponentType.EntityTag, 'meteorite')
            state.world.addComponent(me, ComponentType.EntityZone, { zone: Zone.Overworld })
          }
          const e = state.world.createEntity()
          state.world.addComponent(e, ComponentType.Position, { x, y })
          state.world.addComponent(e, ComponentType.TimedEffect, { kind: 'explosion', startTime: time })
          state.world.addComponent(e, ComponentType.EntityTag, 'explosion')
          state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.Overworld })
          state.world.destroyEntity(eid)
          continue
        }
      }
    }

    // Remove if off-map (beyond bounds + trail length buffer) or too old
    const buffer = data.length + 1
    if (
      pos.x < -buffer ||
      pos.x >= MAP_WIDTH + buffer ||
      pos.y < -buffer ||
      pos.y >= MAP_HEIGHT + buffer ||
      data.age > SHOOTING_STAR_MAX_AGE
    ) {
      if (data.forPlayerSpawn && state.playerSpawn.meteorEntityId === eid) {
        state.playerSpawn.visible = true
        state.playerSpawn.meteorEntityId = null
      }
      state.world.destroyEntity(eid)
    }
  }

  // Stale meteorEntityId fallback: if the player-spawn star was destroyed
  // by another path without flipping visible, recover here.
  const spawn = state.playerSpawn
  if (!spawn.visible && spawn.meteorEntityId !== null) {
    const data = state.world.getComponent(spawn.meteorEntityId, ComponentType.ShootingStarData)
    if (!data) {
      spawn.visible = true
      spawn.meteorEntityId = null
    }
  }

  // Clean up expired timed effects (explosions and pickup blooms)
  for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    const effect = state.world.getComponent(eid, ComponentType.TimedEffect)
    if (!effect) continue
    if (tag === 'explosion' && time - effect.startTime > EXPLOSION_DURATION_MS) {
      state.world.destroyEntity(eid)
    } else if (tag === 'pickupBloom' && time - effect.startTime > PICKUP_EFFECT_DURATION_MS) {
      state.world.destroyEntity(eid)
    }
  }
}

// --- Meteor Showers ---

const RADIANT_DIRECTIONS: { dx: number; dy: number }[] = [
  { dx: 1, dy: 1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
]

export const pickRadiantDirection = (): { dx: number; dy: number } =>
  RADIANT_DIRECTIONS[Math.floor(Math.random() * RADIANT_DIRECTIONS.length)]

export const findShowerTargets = (state: GameState, count: number): Position[] => {
  const targets: Position[] = []
  const maxAttempts = count * 50
  let attempts = 0

  while (targets.length < count && attempts < maxAttempts) {
    attempts++
    const x = SPACE_BORDER + Math.floor(Math.random() * (state.mapWidth - SPACE_BORDER * 2))
    const y = SPACE_BORDER + Math.floor(Math.random() * (state.mapHeight - SPACE_BORDER * 2))
    if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) continue
    const tile = state.map[y][x].type
    if (tile !== TileType.Dirt && tile !== TileType.Flora) continue
    if (isTileOccupied(state, x, y)) continue
    if (isWaterTile(state, x, y)) continue

    // Minimum 5-tile manhattan distance between targets
    let tooClose = false
    for (const t of targets) {
      if (Math.abs(x - t.x) + Math.abs(y - t.y) < 5) {
        tooClose = true
        break
      }
    }
    if (tooClose) continue

    targets.push({ x, y })
  }

  return targets
}

export const tickMeteorShower = (state: GameState, time: number): void => {
  if (state.deepTime?.active) return
  const shower = state.meteorShower

  // The first shower is initiated by triggerPlayerSpawnShower (player-spawn ceremony).
  // While nextShowerTime is 0 we have not yet had a spawn ceremony — stay idle.
  if (!shower.active && shower.nextShowerTime === 0) return

  // Idle: waiting for next shower
  if (!shower.active && time < shower.nextShowerTime) return

  // Start shower
  if (!shower.active) {
    const count =
      METEOR_SHOWER_STAR_COUNT_MIN +
      Math.floor(Math.random() * (METEOR_SHOWER_STAR_COUNT_MAX - METEOR_SHOWER_STAR_COUNT_MIN + 1))
    const radiant = pickRadiantDirection()
    shower.active = true
    shower.remainingStars = count
    shower.spawnIntervalMs = METEOR_SHOWER_SPAWN_WINDOW_MS / count
    shower.lastSpawnTime = 0
    shower.radiantDx = radiant.dx
    shower.radiantDy = radiant.dy
    recordDiscovery(state, 'event:meteor-shower')
    return
  }

  // Active: stagger star spawns
  if (shower.remainingStars > 0) {
    if (shower.lastSpawnTime === 0 || time - shower.lastSpawnTime >= shower.spawnIntervalMs) {
      const targets = findShowerTargets(state, 1)
      if (targets.length > 0) {
        spawnShootingStarAtTarget(state, targets[0], { dx: shower.radiantDx, dy: shower.radiantDy })
      }
      shower.remainingStars--
      shower.lastSpawnTime = time
    }
  }

  // Complete: schedule next shower
  if (shower.remainingStars <= 0) {
    shower.active = false
    shower.nextShowerTime =
      time +
      METEOR_SHOWER_MIN_INTERVAL_MS +
      Math.random() * (METEOR_SHOWER_MAX_INTERVAL_MS - METEOR_SHOWER_MIN_INTERVAL_MS)
  }
}

// Initiates a meteor shower whose first star is aimed at the spawning player.
// Generic over any player position so multiplayer joins can call this with
// each new player's spawn tile.
export const triggerPlayerSpawnShower = (state: GameState, spawnPos: Position, time: number): void => {
  if (state.deepTime?.active) return
  const shower = state.meteorShower

  // Pick a radiant for the rest of the shower (not used for the player star itself).
  const radiant = pickRadiantDirection()

  // If a shower is not already active, start one. If one is active, leave it alone
  // and just append the player-spawn star (multiplayer concurrent-join case).
  if (!shower.active) {
    const count =
      METEOR_SHOWER_STAR_COUNT_MIN +
      Math.floor(Math.random() * (METEOR_SHOWER_STAR_COUNT_MAX - METEOR_SHOWER_STAR_COUNT_MIN + 1))
    shower.active = true
    shower.remainingStars = count
    shower.spawnIntervalMs = METEOR_SHOWER_SPAWN_WINDOW_MS / count
    shower.lastSpawnTime = time
    shower.radiantDx = radiant.dx
    shower.radiantDy = radiant.dy
    recordDiscovery(state, 'event:meteor-shower')
  }

  // The steward star uses a fixed { dx: 1, dy: 1 } heading independent of
  // the shower's radiant. With iso projection screenPx = (worldX - worldY)
  // * cw, dx === dy keeps screen X constant while screen Y advances —
  // reads as falling straight down the screen from the north corner.
  // Non-steward shower stars continue to use the shower radiant.
  const dir = { dx: 1, dy: 1 }
  const backtrack = Math.max(1, Math.round(PLAYER_SPAWN_DESCENT_TARGET_MS / SHOOTING_STAR_TICK_MS))

  const eid = spawnShootingStarAtTarget(state, spawnPos, dir, {
    forPlayerSpawn: true,
    backtrackTiles: backtrack,
  })

  state.playerSpawn.spawnPos = spawnPos
  state.playerSpawn.meteorEntityId = eid
  state.playerSpawn.triggeredAt = time
  state.playerSpawn.visible = false
}
