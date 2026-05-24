import {
  CLICK_TARGET_DURATION_MS,
  EXPLOSION_DURATION_MS,
  MAP_HEIGHT,
  MAP_WIDTH,
  METEOR_SHOWER_ANCHORS,
  METEOR_SHOWER_JITTER_PHASE,
  METEOR_SHOWER_SPAWN_WINDOW_MS,
  METEOR_SHOWER_STAR_COUNT_MAX,
  METEOR_SHOWER_STAR_COUNT_MIN,
  PICKUP_EFFECT_DURATION_MS,
  SHOOTING_STAR_MAX_ACTIVE,
  SHOOTING_STAR_MAX_AGE,
  SHOOTING_STAR_MAX_LENGTH,
  SHOOTING_STAR_MIN_LENGTH,
  SHOOTING_STAR_SPAWN_CHANCE,
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

export const spawnShootingStar = (state: GameState): void => {
  if (state.deepTime?.active) return
  if (state.meteorShower.active) return
  if (state.world.query(ComponentType.ShootingStarData).length >= SHOOTING_STAR_MAX_ACTIVE) return
  if (Math.random() >= SHOOTING_STAR_SPAWN_CHANCE) return

  const x = Math.floor(Math.random() * MAP_WIDTH)
  const y = 0

  const length =
    SHOOTING_STAR_MIN_LENGTH + Math.floor(Math.random() * (SHOOTING_STAR_MAX_LENGTH - SHOOTING_STAR_MIN_LENGTH + 1))

  // Ambient stars never land. Landing is reserved for targeted (shower)
  // stars via spawnShootingStarAtTarget so meteorite density on the ground
  // is governed exclusively by the four cardinal showers per year.
  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x, y })
  state.world.addComponent(e, ComponentType.Velocity, { dx: NORTH_VELOCITY.dx, dy: NORTH_VELOCITY.dy })
  state.world.addComponent(e, ComponentType.ShootingStarData, {
    length,
    age: 0,
    willLand: false,
    landingTarget: null,
  })
  state.world.addComponent(e, ComponentType.EntityTag, 'shootingStar')
  state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.Overworld })
}

export const spawnShootingStarAtTarget = (
  state: GameState,
  target: Position,
  opts?: { backtrackTiles?: number }
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
          if (!isWaterTile(state, x, y)) {
            const me = state.world.createEntity()
            state.world.addComponent(me, ComponentType.Position, { x, y })
            state.world.addComponent(me, ComponentType.Pickupable, { definitionId: 'meteorite' })
            state.world.addComponent(me, ComponentType.EntityTag, 'meteorite')
            state.world.addComponent(me, ComponentType.EntityZone, { zone: Zone.Overworld })
          }
          const e = state.world.createEntity()
          state.world.addComponent(e, ComponentType.Position, { x, y })
          state.world.addComponent(e, ComponentType.TimedEffect, {
            kind: 'explosion',
            startTime: time,
          })
          state.world.addComponent(e, ComponentType.EntityTag, 'explosion')
          state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.Overworld })
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
      state.world.destroyEntity(eid)
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
    } else if (tag === 'clickTarget' && time - effect.startTime > CLICK_TARGET_DURATION_MS) {
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

// Cardinal-shower scheduler. Showers fire when state.seasonalPhase crosses
// one of the four cardinal anchors (spring 0.0, summer 0.25, autumn 0.5,
// winter 0.75). Spring fires at exactly 0.0 with no jitter so the first
// spring shower of the run can deterministically serve as the player-spawn
// ceremony; the other anchors carry ±METEOR_SHOWER_JITTER_PHASE.

const rollAnchorPhase = (anchorIndex: number): number => {
  const anchor = METEOR_SHOWER_ANCHORS[anchorIndex]
  if (anchorIndex === 0) return 0.0 // spring fires exactly at 0.0
  const jitter = (Math.random() * 2 - 1) * METEOR_SHOWER_JITTER_PHASE
  return anchor + jitter
}

// Did seasonalPhase cross pendingAnchorPhase since the last tick? Crossing
// detection is done against the anchor's known position rather than tracking
// previous-phase explicitly: an anchor is considered crossed when the current
// phase is in the closed-open window [anchor, anchor + 0.5). With four
// anchors evenly spaced 0.25 apart, the 0.5 lookahead is wider than any
// single inter-anchor distance and still bounded so we don't accidentally
// "cross" the next-next anchor.
const phaseCrossed = (currentPhase: number, anchorPhase: number): boolean => {
  // Year wrap: pending = 0.0 (spring of new year). Any phase < 0.5 counts as
  // having crossed it (we just rolled past 1.0 → 0.0).
  if (anchorPhase === 0.0) return currentPhase < 0.5
  // Non-wrap case: phase must be within [anchorPhase, anchorPhase + 0.25).
  // The window must NOT extend past the next anchor (avoids skipping ahead).
  return currentPhase >= anchorPhase && currentPhase < anchorPhase + 0.25
}

// Advance pendingAnchorPhase to the next anchor after the one just fired.
// After winter (index 3), wrap to spring (index 0) and bump the year counter.
const advanceToNextAnchor = (state: GameState): void => {
  const shower = state.meteorShower
  const nextIndex = (shower.lastFiredAnchorIndex + 1) % METEOR_SHOWER_ANCHORS.length
  if (nextIndex === 0) shower.lastFiredAnchorYear++
  shower.pendingAnchorPhase = rollAnchorPhase(nextIndex)
}

export const tickMeteorShower = (state: GameState, time: number): void => {
  if (state.deepTime?.active) return
  const shower = state.meteorShower

  // Idle: only start when seasonalPhase has crossed the pending anchor.
  if (!shower.active) {
    if (!phaseCrossed(state.seasonalPhase, shower.pendingAnchorPhase)) return

    const count =
      METEOR_SHOWER_STAR_COUNT_MIN +
      Math.floor(Math.random() * (METEOR_SHOWER_STAR_COUNT_MAX - METEOR_SHOWER_STAR_COUNT_MIN + 1))
    shower.active = true
    shower.remainingStars = count
    shower.spawnIntervalMs = METEOR_SHOWER_SPAWN_WINDOW_MS / count
    shower.lastSpawnTime = 0

    // Mark which anchor is firing so advanceToNextAnchor knows where to go next.
    // Derive from the pending phase: spring is the only anchor whose pending
    // phase is exactly 0.0; for the others we round to the nearest anchor.
    if (shower.pendingAnchorPhase === 0.0) {
      shower.lastFiredAnchorIndex = 0
    } else {
      let nearest = 0
      let minDist = Infinity
      for (let i = 0; i < METEOR_SHOWER_ANCHORS.length; i++) {
        const d = Math.abs(METEOR_SHOWER_ANCHORS[i] - shower.pendingAnchorPhase)
        if (d < minDist) {
          minDist = d
          nearest = i
        }
      }
      shower.lastFiredAnchorIndex = nearest
    }

    // RP-33 — the falling-star spawn ceremony is removed. The
    // player now spawns inside the little house at tenure start.
    recordDiscovery(state, 'event:meteor-shower')
    return
  }

  // Active: stagger star spawns across the 4-second window.
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

  // Complete: queue the next cardinal anchor.
  if (shower.remainingStars <= 0) {
    shower.active = false
    advanceToNextAnchor(state)
  }
}
