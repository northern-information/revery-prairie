// RP-25 — Egregoric fauna (the parallel fauna register).
//
// Two fauna types parallel RP-8b's egregoric flora:
//   - wrongBee: bee-shaped, pollinator-rule-violated. Targets the
//     nearest seam tile instead of native flora.
//   - pierceWalker: no native analog. Lives ON an egregoric tile and
//     only steps to adjacent egregoric tiles.
//
// Both opt-in by placement (round 8 doctrine): they spawn only near
// the seam (egregoric tile clusters). A player who never approaches
// the seam never sees them.
import { emitEgregoricFaunaFirstSighting } from './chronicle/emitters'
import { ComponentType } from './ecs/types'
import { EGREGORE_GLYPHS } from './egregore'
import { recordDiscovery } from './manual'
import { isInBounds, isWalkableTile, ORDINAL } from './position'
import { Zone } from './types'
import { getCurrentEntityZone } from './zone'

import type { GameState, Position } from './types'

// --- Tunables ---------------------------------------------------------------

export const WRONG_BEE_CAP = 3
export const PIERCE_WALKER_CAP = 1
export const WRONG_BEE_SPAWN_CHANCE = 0.005
export const PIERCE_WALKER_SPAWN_CHANCE = 0.001
export const WRONG_BEE_LIFESPAN_TICKS = 600
export const WRONG_BEE_ATTRACTION_RADIUS = 6
export const WRONG_BEE_DRIFT_CHANCE = 0.4
export const PIERCE_WALKER_MOVE_CHANCE = 0.1

export const WRONG_BEE_TAG = 'wrongBee'
export const PIERCE_WALKER_TAG = 'pierceWalker'

// --- Seam-cluster detection -------------------------------------------------

// A seam cluster is an egregoric tile with >=2 other egregoric tiles
// within Chebyshev distance 2. The threshold guards against isolated
// egregore tiles spawning fauna; spawning needs a "place," not a point.
export const isSeamCluster = (state: GameState, x: number, y: number): boolean => {
  let isEgregore = false
  let neighbors = 0
  for (const p of state.egregorePositions) {
    if (p.x === x && p.y === y) {
      isEgregore = true
      continue
    }
    if (Math.abs(p.x - x) <= 2 && Math.abs(p.y - y) <= 2) {
      neighbors++
    }
  }
  return isEgregore && neighbors >= 2
}

export const enumerateSeamClusters = (state: GameState): Position[] => {
  const result: Position[] = []
  for (const p of state.egregorePositions) {
    if (isSeamCluster(state, p.x, p.y)) result.push(p)
  }
  return result
}

const isEgregoreTile = (state: GameState, x: number, y: number): boolean => {
  for (const p of state.egregorePositions) {
    if (p.x === x && p.y === y) return true
  }
  return false
}

// --- Entity utilities -------------------------------------------------------

const countAliveByTag = (state: GameState, tag: string): number => {
  let count = 0
  for (const eid of state.world.query(ComponentType.EntityTag)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) === tag) count++
  }
  return count
}

const isPlayerAt = (state: GameState, x: number, y: number): boolean =>
  state.player.x === x && state.player.y === y

const isOccupiedByBlocker = (state: GameState, x: number, y: number): boolean => {
  for (const eid of state.world.spatial.at(x, y)) {
    if (state.world.hasComponent(eid, ComponentType.Blocking)) return true
  }
  return false
}

const isFreeWalkable = (state: GameState, x: number, y: number): boolean => {
  if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) return false
  if (!isWalkableTile(state.map[y][x].type)) return false
  if (isPlayerAt(state, x, y)) return false
  if (isOccupiedByBlocker(state, x, y)) return false
  return true
}

const cheb = (a: Position, b: Position): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))

// --- Spawn ------------------------------------------------------------------

const pickFromArray = <T>(arr: T[] | readonly T[], rng: () => number): T =>
  arr[Math.floor(rng() * arr.length)]

// Try once to spawn a wrongBee. Returns true on success.
export const attemptWrongBeeSpawn = (
  state: GameState,
  rng: () => number = Math.random
): boolean => {
  if (state.currentZone !== Zone.Overworld) return false
  if (countAliveByTag(state, WRONG_BEE_TAG) >= WRONG_BEE_CAP) return false
  const clusters = enumerateSeamClusters(state)
  if (clusters.length === 0) return false
  if (rng() >= WRONG_BEE_SPAWN_CHANCE) return false

  const seam = pickFromArray(clusters, rng)
  // Enumerate the 8 walkable neighbors of the seam tile; spawn on one at random.
  const candidates: Position[] = []
  for (const d of ORDINAL) {
    const nx = seam.x + d.x
    const ny = seam.y + d.y
    if (isFreeWalkable(state, nx, ny)) candidates.push({ x: nx, y: ny })
  }
  if (candidates.length === 0) return false
  const pos = pickFromArray(candidates, rng)

  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, pos)
  state.world.addComponent(e, ComponentType.EntityTag, WRONG_BEE_TAG)
  state.world.addComponent(e, ComponentType.EntityZone, getCurrentEntityZone(state))
  state.world.addComponent(e, ComponentType.WrongBeeLifecycle, {
    ticksRemaining: WRONG_BEE_LIFESPAN_TICKS,
  })

  if (recordDiscovery(state, 'fauna:wrongBee')) {
    emitEgregoricFaunaFirstSighting(state, WRONG_BEE_TAG, pos)
  }
  return true
}

// Try once to spawn a pierceWalker. Returns true on success.
export const attemptPierceWalkerSpawn = (
  state: GameState,
  rng: () => number = Math.random
): boolean => {
  if (state.currentZone !== Zone.Overworld) return false
  if (countAliveByTag(state, PIERCE_WALKER_TAG) >= PIERCE_WALKER_CAP) return false
  const clusters = enumerateSeamClusters(state)
  if (clusters.length === 0) return false
  if (rng() >= PIERCE_WALKER_SPAWN_CHANCE) return false

  // Spawn ON a seam cluster tile (not adjacent). Skip the player tile and
  // any tile already occupied by a blocker.
  const candidates = clusters.filter(
    p => !isPlayerAt(state, p.x, p.y) && !isOccupiedByBlocker(state, p.x, p.y)
  )
  if (candidates.length === 0) return false
  const pos = pickFromArray(candidates, rng)
  const codepoint = pickFromArray(EGREGORE_GLYPHS, rng)

  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, pos)
  state.world.addComponent(e, ComponentType.EntityTag, PIERCE_WALKER_TAG)
  state.world.addComponent(e, ComponentType.EntityZone, getCurrentEntityZone(state))
  state.world.addComponent(e, ComponentType.PierceWalkerGlyph, { codepoint })
  state.world.addComponent(e, ComponentType.Blocking, { blockMovement: true })

  if (recordDiscovery(state, 'fauna:pierceWalker')) {
    emitEgregoricFaunaFirstSighting(state, PIERCE_WALKER_TAG, pos)
  }
  return true
}

// --- Motion + lifespan ------------------------------------------------------

const stepWrongBeeToward = (
  state: GameState,
  eid: number,
  from: Position,
  target: Position,
  rng: () => number
): void => {
  const targetDist = cheb(from, target)
  const improving: Position[] = []
  const sideways: Position[] = []
  for (const d of ORDINAL) {
    const nx = from.x + d.x
    const ny = from.y + d.y
    if (!isFreeWalkable(state, nx, ny)) continue
    const dist = cheb({ x: nx, y: ny }, target)
    if (dist < targetDist) improving.push({ x: nx, y: ny })
    else if (dist === targetDist) sideways.push({ x: nx, y: ny })
  }
  const choice = improving.length > 0 ? improving : sideways
  if (choice.length === 0) return
  const next = choice[Math.floor(rng() * choice.length)]
  state.world.moveEntity(eid, next.x, next.y)
}

const stepWrongBeeDrift = (
  state: GameState,
  eid: number,
  from: Position,
  rng: () => number
): void => {
  if (rng() >= WRONG_BEE_DRIFT_CHANCE) return
  const candidates: Position[] = []
  for (const d of ORDINAL) {
    const nx = from.x + d.x
    const ny = from.y + d.y
    if (isFreeWalkable(state, nx, ny)) candidates.push({ x: nx, y: ny })
  }
  if (candidates.length === 0) return
  const next = candidates[Math.floor(rng() * candidates.length)]
  state.world.moveEntity(eid, next.x, next.y)
}

const findNearestSeam = (
  state: GameState,
  from: Position
): Position | null => {
  let best: Position | null = null
  let bestDist = WRONG_BEE_ATTRACTION_RADIUS + 1
  for (const p of state.egregorePositions) {
    const d = cheb(from, p)
    if (d <= WRONG_BEE_ATTRACTION_RADIUS && d < bestDist) {
      best = p
      bestDist = d
    }
  }
  return best
}

const tickWrongBeeMotion = (state: GameState, rng: () => number): void => {
  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) !== WRONG_BEE_TAG) continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!pos) continue
    const target = findNearestSeam(state, pos)
    if (target) stepWrongBeeToward(state, eid, pos, target, rng)
    else stepWrongBeeDrift(state, eid, pos, rng)
  }
}

const tickWrongBeeLifespan = (state: GameState): void => {
  const toDestroy: number[] = []
  for (const eid of state.world.query(ComponentType.WrongBeeLifecycle)) {
    const life = state.world.getComponent(eid, ComponentType.WrongBeeLifecycle)
    if (!life) continue
    const next = life.ticksRemaining - 1
    if (next <= 0) {
      toDestroy.push(eid)
    } else {
      state.world.addComponent(eid, ComponentType.WrongBeeLifecycle, {
        ticksRemaining: next,
      })
    }
  }
  for (const eid of toDestroy) state.world.destroyEntity(eid)
}

const tickPierceWalkerMotion = (state: GameState, rng: () => number): void => {
  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) !== PIERCE_WALKER_TAG) continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!pos) continue
    if (rng() >= PIERCE_WALKER_MOVE_CHANCE) continue
    const candidates: Position[] = []
    for (const d of ORDINAL) {
      const nx = pos.x + d.x
      const ny = pos.y + d.y
      if (!isInBounds(nx, ny, state.mapWidth, state.mapHeight)) continue
      if (!isEgregoreTile(state, nx, ny)) continue
      if (isPlayerAt(state, nx, ny)) continue
      if (isOccupiedByBlocker(state, nx, ny)) continue
      candidates.push({ x: nx, y: ny })
    }
    if (candidates.length === 0) continue
    const next = candidates[Math.floor(rng() * candidates.length)]
    state.world.moveEntity(eid, next.x, next.y)
  }
}

// --- gameLoop entry point ---------------------------------------------------

export const tickEgregoreFauna = (
  state: GameState,
  _time: number,
  rng: () => number = Math.random
): void => {
  if (state.currentZone !== Zone.Overworld) return
  attemptWrongBeeSpawn(state, rng)
  attemptPierceWalkerSpawn(state, rng)
  tickWrongBeeMotion(state, rng)
  tickWrongBeeLifespan(state)
  tickPierceWalkerMotion(state, rng)
}
