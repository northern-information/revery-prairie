import {
  EXPLOSION_DURATION_MS,
  MAP_HEIGHT,
  MAP_WIDTH,
  PICKUP_EFFECT_DURATION_MS,
  SHOOTING_STAR_LAND_CHANCE,
  SHOOTING_STAR_MAX_ACTIVE,
  SHOOTING_STAR_MAX_AGE,
  SHOOTING_STAR_MAX_LENGTH,
  SHOOTING_STAR_MIN_LENGTH,
  SHOOTING_STAR_SPAWN_CHANCE,
} from './constants'
import { isInBounds, isWalkableTile, posKey, removeByIndices } from './position'
import { TileType } from './types'

import type { GameState, Position } from './types'

const CHAIN_EXPLOSION_CHANCE = 1 / 7
const CHAIN_EXPLOSION_RADIUS = 3
const CHAIN_EXPLOSION_COUNT = 3

const isTileOccupied = (state: GameState, x: number, y: number): boolean => {
  const key = posKey(x, y)
  if (state.player.x === x && state.player.y === y) return true
  if (state.meteorites.some((m) => m.pos.x === x && m.pos.y === y)) return true
  if (state.groundItems.some((g) => g.pos.x === x && g.pos.y === y)) return true
  if (state.groundOmniboxes.some((g) => g.pos.x === x && g.pos.y === y)) return true
  if (state.characters.some((c) => posKey(c.pos.x, c.pos.y) === key)) return true
  if (state.ghosts.some((g) => posKey(g.pos.x, g.pos.y) === key)) return true
  return false
}

export const spawnChainMeteorites = (
  state: GameState,
  origin: Position,
  time: number
): number => {
  const candidates: Position[] = []
  for (let dy = -CHAIN_EXPLOSION_RADIUS; dy <= CHAIN_EXPLOSION_RADIUS; dy++) {
    for (let dx = -CHAIN_EXPLOSION_RADIUS; dx <= CHAIN_EXPLOSION_RADIUS; dx++) {
      if (dx === 0 && dy === 0) continue
      const x = origin.x + dx
      const y = origin.y + dy
      if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) continue
      if (!isWalkableTile(state.map[y][x].type)) continue
      if (isTileOccupied(state, x, y)) continue
      candidates.push({ x, y })
    }
  }

  // Shuffle and take up to CHAIN_EXPLOSION_COUNT
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }

  const spawned = Math.min(CHAIN_EXPLOSION_COUNT, candidates.length)
  for (let i = 0; i < spawned; i++) {
    const pos = candidates[i]
    state.meteorites.push({ pos, fromChain: true })
    state.explosions.push({ pos, startTime: time })
  }

  return spawned
}

export { CHAIN_EXPLOSION_CHANCE }

export const spawnShootingStar = (state: GameState): void => {
  if (state.shootingStars.length >= SHOOTING_STAR_MAX_ACTIVE) return
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

  state.shootingStars.push({ pos: { x, y }, dx, dy, length, age: 0, willLand, landingTarget: null })
}

export const spawnShootingStarAtTarget = (
  state: GameState,
  target: Position,
  direction?: { dx: number; dy: number }
): void => {
  const dx = direction?.dx ?? (Math.random() < 0.5 ? 1 : -1)
  const dy = direction?.dy ?? (Math.random() < 0.5 ? 1 : -1)

  // Trace backward from target to find the starting edge position
  let sx = target.x
  let sy = target.y
  while (isInBounds(sx, sy, MAP_WIDTH, MAP_HEIGHT)) {
    sx -= dx
    sy -= dy
  }

  const length =
    SHOOTING_STAR_MIN_LENGTH + Math.floor(Math.random() * (SHOOTING_STAR_MAX_LENGTH - SHOOTING_STAR_MIN_LENGTH + 1))

  state.shootingStars.push({
    pos: { x: sx, y: sy },
    dx,
    dy,
    length,
    age: 0,
    willLand: true,
    landingTarget: target,
  })
}

export const tickShootingStars = (state: GameState, time: number): void => {
  const toRemove: number[] = []

  for (let i = 0; i < state.shootingStars.length; i++) {
    const star = state.shootingStars[i]
    if (!star) continue

    star.pos.x += star.dx
    star.pos.y += star.dy
    star.age++

    // Check if the star should land
    if (star.willLand) {
      const { x, y } = star.pos
      if (star.landingTarget) {
        // Targeted landing — only land on the exact target tile
        if (x === star.landingTarget.x && y === star.landingTarget.y) {
          state.meteorites.push({ pos: { x, y } })
          state.explosions.push({ pos: { x, y }, startTime: time })
          toRemove.push(i)
          continue
        }
      } else if (isInBounds(x, y, MAP_WIDTH, MAP_HEIGHT)) {
        // Untargeted landing — land on first walkable tile
        const tile = state.map[y][x]
        if (tile.type === TileType.Dirt || tile.type === TileType.Clover) {
          state.meteorites.push({ pos: { x, y } })
          state.explosions.push({ pos: { x, y }, startTime: time })
          toRemove.push(i)
          continue
        }
      }
    }

    // Remove if off-map (beyond bounds + trail length buffer) or too old
    const buffer = star.length + 1
    if (
      star.pos.x < -buffer ||
      star.pos.x >= MAP_WIDTH + buffer ||
      star.pos.y < -buffer ||
      star.pos.y >= MAP_HEIGHT + buffer ||
      star.age > SHOOTING_STAR_MAX_AGE
    ) {
      toRemove.push(i)
    }
  }

  removeByIndices(state.shootingStars, toRemove)

  // Clean up expired explosions
  state.explosions = state.explosions.filter(e => time - e.startTime <= EXPLOSION_DURATION_MS)

  // Clean up expired meteorite pickup effects
  state.meteoritePickupEffects = state.meteoritePickupEffects.filter(
    e => time - e.startTime <= PICKUP_EFFECT_DURATION_MS
  )
}
