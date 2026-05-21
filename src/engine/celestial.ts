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
import { isInBounds, posKey } from './position'
import { TileType, Zone } from './types'
import { spatialAtInCurrentZone } from './zone'

import type { GameState, Position } from './types'

// All shooting stars descend along the iso "straight down the screen"
// axis. With screenPx = (worldX - worldY) * cw, dx === dy keeps screen X
// constant while screen Y advances — the star reads as falling from due
// north on screen, regardless of its on-map start tile.
const NORTH_VELOCITY = { dx: 1, dy: 1 } as const

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

export const spawnShootingStar = (state: GameState): void => {
  if (state.deepTime?.active) return
  if (state.meteorShower.active) return
  if (state.world.query(ComponentType.ShootingStarData).length >= SHOOTING_STAR_MAX_ACTIVE) return
  if (countOverworldMeteorites(state) >= METEORITE_GROUND_MAX) return
  if (Math.random() >= SHOOTING_STAR_SPAWN_CHANCE) return

  const x = Math.floor(Math.random() * MAP_WIDTH)
  const y = 0

  const length =
    SHOOTING_STAR_MIN_LENGTH + Math.floor(Math.random() * (SHOOTING_STAR_MAX_LENGTH - SHOOTING_STAR_MIN_LENGTH + 1))
  const willLand = Math.random() < SHOOTING_STAR_LAND_CHANCE

  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x, y })
  state.world.addComponent(e, ComponentType.Velocity, { dx: NORTH_VELOCITY.dx, dy: NORTH_VELOCITY.dy })
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
  opts?: { forPlayerSpawn?: boolean; backtrackTiles?: number }
): number => {
  const dx = NORTH_VELOCITY.dx
  const dy = NORTH_VELOCITY.dy

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
    shower.active = true
    shower.remainingStars = count
    shower.spawnIntervalMs = METEOR_SHOWER_SPAWN_WINDOW_MS / count
    shower.lastSpawnTime = 0
    recordDiscovery(state, 'event:meteor-shower')
    return
  }

  // Active: stagger star spawns
  if (shower.remainingStars > 0) {
    if (shower.lastSpawnTime === 0 || time - shower.lastSpawnTime >= shower.spawnIntervalMs) {
      const targets = findShowerTargets(state, 1)
      if (targets.length > 0) {
        spawnShootingStarAtTarget(state, targets[0])
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
    recordDiscovery(state, 'event:meteor-shower')
  }

  const backtrack = Math.max(1, Math.round(PLAYER_SPAWN_DESCENT_TARGET_MS / SHOOTING_STAR_TICK_MS))

  const eid = spawnShootingStarAtTarget(state, spawnPos, {
    forPlayerSpawn: true,
    backtrackTiles: backtrack,
  })

  state.playerSpawn.spawnPos = spawnPos
  state.playerSpawn.meteorEntityId = eid
  state.playerSpawn.triggeredAt = time
  state.playerSpawn.visible = false
}
