// RP-9b — Torchbearer behavior pass. Moab the drip torchbearer
// walks the burn line during Spring. The cycle is driven by season
// transitions detected in tickTorchbearer:
//   Winter → Spring: lockedBurnLine consumed (currently no source —
//     the draft authoring layer was removed in the input-system-cleanup
//     CR and the walk-with-Moab follow-up will restore population);
//     Moab emerges from cave to caveEntranceOverworld; moabState
//     transitions through refusal check to Walking (or Refusing →
//     Returning).
//   Spring → Summer: Moab returns to cave; all burn-line state clears.
//
// Per-tick during 'walking': Moab advances one tile toward
// lockedBurnLine[burnLineIndex], igniting eligible tiles as he passes.
// Per-tick during 'returning': Moab advances toward caveEntranceOverworld.
// On arrival: zone reverts to Cave at caveNpcSpot, moabState → Idle.

import { ComponentType } from './ecs/types'
import { recordDiscovery } from './manual'
import { setMapTile } from './map'
import { findPath } from './pathfinding'
import { posKey } from './position'
import { MoabState, Season, TileType, Zone } from './types'

import type { GameState, Position } from './types'

export const MOAB_PACE_MS = 500
const REFUSAL_WIND_THRESHOLD = 20
const REFUSAL_HUMIDITY_THRESHOLD = 30

const samePos = (a: Position, b: Position): boolean => a.x === b.x && a.y === b.y

const findMoabEntity = (state: GameState): number | null => {
  for (const eid of state.world.query(ComponentType.CharacterIdentity, ComponentType.Position)) {
    const identity = state.world.getComponent(eid, ComponentType.CharacterIdentity)
    if (identity?.definitionId === 'moab') return eid
  }
  return null
}

const getMoabPosition = (state: GameState): Position | null => {
  const eid = findMoabEntity(state)
  if (eid === null) return null
  const pos = state.world.getComponent(eid, ComponentType.Position)
  return pos ? { x: pos.x, y: pos.y } : null
}

// Catastrophic-edge check from refusal-catastrophic-edge in the spec.
// Returns the reason if the line should be refused, otherwise null.
export const checkBurnLineRefusal = (state: GameState, line: Position[]): string | null => {
  if (state.weather.windSpeed > REFUSAL_WIND_THRESHOLD && state.weather.humidity < REFUSAL_HUMIDITY_THRESHOLD) {
    return 'extreme-weather'
  }

  // Character positions (Gron, Coyote, ghosts, etc.) in the overworld.
  const characterPositions = new Set<string>()
  for (const eid of state.world.query(ComponentType.CharacterIdentity, ComponentType.Position)) {
    const zone = state.world.getComponent(eid, ComponentType.EntityZone)?.zone
    if (zone !== Zone.Overworld) continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!pos) continue
    characterPositions.add(posKey(pos.x, pos.y))
  }

  // Sensitive infrastructure: cave entrance + ruin entrances.
  const sensitive = new Set<string>()
  sensitive.add(posKey(state.caveEntranceOverworld.x, state.caveEntranceOverworld.y))
  for (const ruin of state.ruinInteriors) {
    if (ruin.entranceOverworld) {
      sensitive.add(posKey(ruin.entranceOverworld.x, ruin.entranceOverworld.y))
    }
  }

  for (const tile of line) {
    const key = posKey(tile.x, tile.y)
    if (characterPositions.has(key)) return 'character-on-line'
    if (sensitive.has(key)) return 'entrance-on-line'
  }
  return null
}

// Mutate a single tile per tile-burn-rules.
const burnTile = (state: GameState, pos: Position): void => {
  const tile = state.map[pos.y][pos.x]
  const key = posKey(pos.x, pos.y)
  if (tile.type === TileType.Flora) {
    setMapTile(state, pos.x, pos.y, { type: TileType.BurntFlora })
    state.floraLifecycle.delete(key)
  } else if (tile.type === TileType.Egregore) {
    setMapTile(state, pos.x, pos.y, { type: TileType.Dirt })
    state.egregoreLifecycle.delete(key)
    state.egregorePositions = state.egregorePositions.filter(p => !(p.x === pos.x && p.y === pos.y))
  }
  // Dirt / Sand / BurntFlora and other types: no-op.
}

const setMoabZone = (state: GameState, zone: Zone): void => {
  const eid = findMoabEntity(state)
  if (eid === null) return
  state.world.addComponent(eid, ComponentType.EntityZone, { zone })
}

const setMoabPosition = (state: GameState, pos: Position, durationMs?: number): void => {
  const eid = findMoabEntity(state)
  if (eid === null) return
  state.world.moveEntity(eid, pos.x, pos.y, durationMs)
}

// Winter → Spring transition handler. Reads from state.lockedBurnLine
// (populated by the future walk-with-Moab authoring path; currently
// always null since the burnDrawMode authoring layer was removed in the
// input-system-cleanup CR), performs the refusal check, and either
// emerges Moab into Walking or triggers the Refusing flow.
const onThaw = (state: GameState): void => {
  const line = state.lockedBurnLine
  if (!line || line.length === 0) {
    // No line for this year; no emergence.
    return
  }

  if (checkBurnLineRefusal(state, line) !== null) {
    state.moabState = MoabState.Refusing
    state.burnLineIndex = null
    recordDiscovery(state, 'event:torchbearer-refused')
    return
  }

  // Walk emergence.
  state.moabState = MoabState.Walking
  state.burnLineIndex = 0
  setMoabZone(state, Zone.Overworld)
  setMoabPosition(state, state.caveEntranceOverworld)
}

// Spring → Summer cleanup. Returns Moab to cave regardless of his state
// and clears all burn-line bookkeeping for the year.
const onSummerArrival = (state: GameState): void => {
  setMoabZone(state, Zone.Cave)
  setMoabPosition(state, state.caveNpcSpot)
  state.moabState = MoabState.Idle
  state.lockedBurnLine = null
  state.burnLineIndex = null
}

// Per-tick advancement during 'walking'. Steps Moab one tile toward
// lockedBurnLine[burnLineIndex] via pathfinding. On arrival, ignites
// the tile and advances the index. On completion, transitions to
// Returning.
const tickWalking = (state: GameState): void => {
  if (state.lockedBurnLine === null || state.burnLineIndex === null) {
    state.moabState = MoabState.Returning
    return
  }
  if (state.burnLineIndex >= state.lockedBurnLine.length) {
    recordDiscovery(state, 'event:torchbearer-walk')
    state.moabState = MoabState.Returning
    return
  }
  const target = state.lockedBurnLine[state.burnLineIndex]
  const here = getMoabPosition(state)
  if (!here) return
  if (samePos(here, target)) {
    burnTile(state, target)
    state.burnLineIndex += 1
    return
  }
  const path = findPath(state.overworldMap, state.overworldMapWidth, state.overworldMapHeight, here, target)
  if (!path || path.length === 0) {
    // Blocked — wait this tick. If the obstruction persists through
    // Spring, summer cleanup will end the walk.
    return
  }
  setMoabPosition(state, path[0], MOAB_PACE_MS)
}

// Per-tick advancement during 'returning'. Moab pathfinds back to the
// cave entrance, then transitions to Idle and re-enters the cave.
const tickReturning = (state: GameState): void => {
  const here = getMoabPosition(state)
  if (!here) return
  if (samePos(here, state.caveEntranceOverworld)) {
    setMoabZone(state, Zone.Cave)
    setMoabPosition(state, state.caveNpcSpot)
    state.moabState = MoabState.Idle
    return
  }
  const path = findPath(
    state.overworldMap,
    state.overworldMapWidth,
    state.overworldMapHeight,
    here,
    state.caveEntranceOverworld
  )
  if (!path || path.length === 0) return
  setMoabPosition(state, path[0], MOAB_PACE_MS)
}

// Main tick. Called from gameLoop at MOAB_PACE_MS cadence in the
// overworld zone. Detects season transitions on every call, then
// advances Moab's state machine. The transition handlers return early
// so the new state (Refusing, Walking, Idle) persists for at least one
// external observation cycle before the state machine advances.
export const tickTorchbearer = (state: GameState): void => {
  const current = state.weather.season
  const previous = state.lastSeenSeason
  state.lastSeenSeason = current

  if (previous === Season.Winter && current === Season.Spring) {
    onThaw(state)
    return
  }
  if (previous === Season.Spring && current === Season.Summer) {
    onSummerArrival(state)
    return
  }

  switch (state.moabState) {
    case MoabState.Walking:
      tickWalking(state)
      break
    case MoabState.Returning:
      tickReturning(state)
      break
    case MoabState.Refusing:
      // One-tick presence: transition to Returning so the (no-op for
      // cave-bound refusal, real for any future flow that emerges Moab
      // before refusal) return path runs.
      state.moabState = MoabState.Returning
      break
    case MoabState.Dismissed:
      // Player has dismissed Moab. Halt the walk; the next tick begins
      // the return.
      state.burnLineIndex = null
      state.moabState = MoabState.Returning
      break
    case MoabState.Idle:
      break
  }
}
