// RP-8b — Egregoric flora (mechanical biome).
//
// Two spread paths. Both convert dirt tiles adjacent to existing egregore
// tiles into TileType.Egregore, using the same `candidateDirtNeighbors`
// helper. They differ in trigger, count, and gating:
//
// - tickEgregoreSpread (stewardship): slow Winter drift, 1–2 tiles per
//   in-game year. Throttled by state.lastEgregoreSpreadYear. Gated on
//   season, zone, deepTime, revery.
// - advanceEgregoreInRevery (Revery-time): large push during the
//   Observing → Summary transition. 3 tiles on the first Revery
//   (preserves the RP-4 contract); 6–9 on subsequent Reveries.
//
// **Invisible pollinator (v3 doctrine):** neither path spawns a
// PollenParticle. The carrier "refuses to be named" by virtue of
// not existing as data. Spread is a pure tile-conversion event.

import { FIRST_REVERY_EGREGORE_COUNT, SEASONAL_PHASE_PERIOD_MS } from '@/engine/constants'
import { candidateDirtNeighborsContained } from '@/engine/egregore/positions'
import { EGREGORE_SPECIES, getEgregoreSpeciesAtPosition } from '@/engine/egregore/species'
import { generateEgregoreGenome } from '@/engine/genetics/egregore'
import { posKey } from '@/engine/position'
import { EgregoreActivityStage, Season, TileType, Zone } from '@/engine/types'
import type { GameState, Position } from '@/engine/types'

// Stewardship-time spread tick (RP-8b).
//
// Throttle: one spread per in-game year. The year proxy is derived from
// wall-clock time (Math.floor(time / SEASONAL_PHASE_PERIOD_MS)), which is
// monotonic and unaffected by seasonal-phase wraparound. We update
// lastEgregoreSpreadYear AFTER reaching the placement attempt — early
// returns at the four gates leave the year slot available so a later
// in-Winter overworld tick can still spread that year.
export const tickEgregoreSpread = (state: GameState, time: number): void => {
  if (state.weather.season !== Season.Winter) return
  if (state.currentZone !== Zone.Overworld) return
  if (state.deepTime !== null) return
  if (state.revery !== null) return

  const currentYear = Math.floor(time / SEASONAL_PHASE_PERIOD_MS)
  if (currentYear === state.lastEgregoreSpreadYear) return

  const candidates = candidateDirtNeighborsContained(state)
  if (candidates.length === 0) {
    // Consume the year slot even with no candidates — the throttle is
    // about cadence, not retries within a single year.
    state.lastEgregoreSpreadYear = currentYear
    return
  }

  state.lastEgregoreSpreadYear = currentYear

  // Deterministic per-(steward, year, candidate) hash so repeated calls
  // in the same year with identical state would converge to the same
  // pick — but the throttle prevents repeated calls.
  const hashCandidate = (c: Position): number => {
    let h = 2166136261
    for (const ch of state.stewardName) {
      h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
    }
    h = Math.imul(h ^ currentYear, 16777619)
    h = Math.imul(h ^ c.x, 16777619)
    h = Math.imul(h ^ c.y, 16777619)
    return h >>> 0
  }

  const sorted = [...candidates].map(c => ({ pos: c, h: hashCandidate(c) })).sort((a, b) => a.h - b.h)

  // 1 or 2 tiles, with the parity of the leading hash deciding.
  const count = sorted.length >= 2 && sorted[0].h % 3 !== 0 ? 2 : 1
  const picked = sorted.slice(0, count).map(x => x.pos)
  commitEgregoreTiles(state, picked, time)
}

// Trail centroid used by advanceEgregoreInRevery — biases placement
// toward the player's recent movement so the advance lands somewhere the
// player will plausibly notice. Identical math to the RP-4 helper.
const trailCentroid = (state: GameState): Position => {
  if (state.trail.length === 0) {
    return { x: Math.floor(state.mapWidth / 2), y: Math.floor(state.mapHeight / 2) }
  }
  let sx = 0
  let sy = 0
  for (const p of state.trail) {
    sx += p.x
    sy += p.y
  }
  return { x: Math.round(sx / state.trail.length), y: Math.round(sy / state.trail.length) }
}

const manhattan = (a: Position, b: Position): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

// Revery-time advance (RP-8b refactor of #4's
// advanceEgregoreFirstRevery). Always callable — the count depends on
// state.reveryCount internally:
//   - reveryCount === 0 → FIRST_REVERY_EGREGORE_COUNT (= 3). Preserves
//     the RP-4 first-Revery contract.
//   - reveryCount >= 1 → 6 + (reveryCount % 4) → values in [6, 9].
// Returns the positions placed (possibly fewer if not enough dirt
// neighbors exist).
export const advanceEgregoreInRevery = (state: GameState, time = 0): Position[] => {
  if (state.egregorePositions.length === 0) return []
  const candidates = candidateDirtNeighborsContained(state)
  if (candidates.length === 0) return []

  const count = state.reveryCount === 0 ? FIRST_REVERY_EGREGORE_COUNT : 6 + (state.reveryCount % 4)
  const center = trailCentroid(state)
  const sorted = [...candidates].sort((a, b) => {
    const da = manhattan(a, center)
    const db = manhattan(b, center)
    if (da !== db) return da - db
    return posKey(a.x, a.y).localeCompare(posKey(b.x, b.y))
  })
  const placed = sorted.slice(0, count)
  commitEgregoreTiles(state, placed, time)
  return placed
}

// Shared commit step. Converts the tile, appends to egregorePositions,
// and creates the lifecycle entry with deterministic species + genome.
// Exported for RP-32's Closing-phase egregoric commit (the steward's
// collapse tile becomes egregoric when a summons Revery closes).
export const commitEgregoreTiles = (state: GameState, positions: Position[], time: number): void => {
  for (const pos of positions) {
    state.map[pos.y][pos.x] = { type: TileType.Egregore }
    state.egregorePositions.push(pos)
    const species = getEgregoreSpeciesAtPosition(pos.x, pos.y)
    const genome = generateEgregoreGenome(pos.x, pos.y, state.stewardName, EGREGORE_SPECIES[species].traitBias)
    // Stage at commit: Active if season is Winter (matches the
    // lifecycle ticker's expectation); otherwise Dormant. The ticker
    // will normalize on its next pass either way.
    const stage = state.weather.season === Season.Winter ? EgregoreActivityStage.Active : EgregoreActivityStage.Dormant
    state.egregoreLifecycle.set(posKey(pos.x, pos.y), {
      stage,
      stageStartTime: time,
      species,
      genome,
    })
    // v11 R4 — the camera notices change on its own sim-loop hook;
    // no event call here.
  }
}
