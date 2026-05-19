// Precis #4 — The Revery.
//
// Long-form ceremonial phase: omen-triggered entry, hard input lock, world
// ticks through compressed-time winter, bilingual ASCII + Voynich summary,
// one hedged phenotype label per Revery, first-Revery egregoric advance.
//
// Phase machine: Omen → Observing → Summary → Closing → null.
//
// See harness/specs/precis-4-the-revery.yaml for the locked behaviors and
// docs/claude/revery.md for the full doctrine summary.

import { FIRST_REVERY_EGREGORE_COUNT, REVERY_YEARS_PER_FRAME } from './constants'
import { resolvePhenotypeLabel } from './phenotype'
import { isInBounds, ORDINAL, posKey } from './position'
import { FloraSpecies, OmenKind, ReveryPhase, TileType } from './types'

import type {
  GameState,
  OmenKind as OmenKindT,
  Position,
  RevealedPhenotype,
  ReveryChange,
  ReverySnapshot,
  ReveryState,
} from './types'

// --- Public helpers ---

// True during Observing and Summary phases — player input must be ignored.
// Returns false during Closing (one-frame transition) and when state.revery
// is null.
export const isReveryLocked = (state: GameState): boolean => {
  const r = state.revery
  if (!r?.active) return false
  return r.phase === ReveryPhase.Observing || r.phase === ReveryPhase.Summary
}

// --- Snapshot + diff ---

const countFloraBySpecies = (state: GameState): Record<FloraSpecies, number> => {
  const counts: Record<FloraSpecies, number> = {
    [FloraSpecies.Clover]: 0,
    [FloraSpecies.Wildflower]: 0,
    [FloraSpecies.TallGrass]: 0,
  }
  for (const entry of state.floraLifecycle.values()) {
    counts[entry.species] += 1
  }
  return counts
}

const countEgregoreTiles = (state: GameState): number => state.egregorePositions.length

export const takeReverySnapshot = (state: GameState): ReverySnapshot => ({
  floraCounts: countFloraBySpecies(state),
  egregoreCount: countEgregoreTiles(state),
  season: state.weather.season,
  reveryCount: state.reveryCount,
})

// Computes flora-delta change records at the Observing → Summary transition.
// Only species whose count actually changed produce a change record; species
// that are flat across the year are omitted from the summary.
//
// Egregore-grew and phenotype-revealed records are appended SEPARATELY by
// their owning systems (advanceEgregoreFirstRevery, wirePhenotypeIntoRevery)
// — they don't derive from a numeric diff.
export const computeReveryDiff = (state: GameState, snapshot: ReverySnapshot): ReveryChange[] => {
  const changes: ReveryChange[] = []
  const currentCounts = countFloraBySpecies(state)
  const speciesList: FloraSpecies[] = [FloraSpecies.Clover, FloraSpecies.Wildflower, FloraSpecies.TallGrass]
  for (const species of speciesList) {
    const before = snapshot.floraCounts[species]
    const after = currentCounts[species]
    if (before === after) continue
    changes.push({ kind: 'flora-delta', payload: { species, before, after } })
  }
  return changes
}

// --- Phase machine ---

export const initiateRevery = (state: GameState, time: number, omenKind: OmenKindT): void => {
  if (state.revery) return
  state.revery = {
    active: true,
    startTime: time,
    phase: ReveryPhase.Omen,
    elapsedYears: 0,
    snapshotBeforeRevery: takeReverySnapshot(state),
    scheduledChanges: [],
    summaryReady: false,
    omenKind,
  }
  // Clear in-flight intent so the next-frame Observing transition starts clean.
  state.path = null
  state.pathWaypoints = []
  state.pendingAction = null
}

// One Revery year. seasonalPhase advances at the accelerated rate during
// Observing; tickWeather and the rest of the world still run on the normal
// gameLoop schedule, so the world genuinely passes through the winter.
const REVERY_DURATION_YEARS = 1.0

// Per-frame state machine. Called by gameLoop AFTER detectOmen and BEFORE
// input handlers, so the Omen → Observing transition is reflected before
// movePlayer / keyboard tick this frame.
export const tickRevery = (state: GameState, _dt: number, time: number): void => {
  const r = state.revery
  if (!r?.active) return

  if (r.phase === ReveryPhase.Omen) {
    r.phase = ReveryPhase.Observing
    // Belt-and-suspenders: clear input intent again now that the lock is live.
    state.path = null
    state.pathWaypoints = []
    state.pendingAction = null
    return
  }

  if (r.phase === ReveryPhase.Observing) {
    r.elapsedYears += REVERY_YEARS_PER_FRAME
    // Advance the seasonal phase at the accelerated rate so flora dormancy,
    // snow rendering, etc. fire naturally during the Revery.
    state.seasonalPhase = (state.seasonalPhase + REVERY_YEARS_PER_FRAME) % 1.0
    if (r.elapsedYears >= REVERY_DURATION_YEARS) {
      r.phase = ReveryPhase.Summary
      // Native flora deltas from the snapshot diff.
      r.scheduledChanges.push(...computeReveryDiff(state, r.snapshotBeforeRevery))
      // Phenotype label resolution. Each Revery resolves one (species, axis)
      // pair for the most-discovered species. Re-resolving the same pair
      // OVERWRITES the prior verdict — no duplicates per pair.
      resolveAndCommitPhenotype(state, r)
      // First-Revery egregoric advance. Gated by reveryCount === 0 here
      // (state.reveryCount is incremented in Closing, so during this first
      // Revery's Summary, the count is still 0). Subsequent Reveries no-op.
      if (state.reveryCount === 0) {
        const placed = advanceEgregoreFirstRevery(state)
        if (placed.length > 0) {
          r.scheduledChanges.push({ kind: 'egregore-grew', payload: { positions: placed } })
        }
      }
      r.summaryReady = true
    }
    return
  }

  if (r.phase === ReveryPhase.Closing) {
    state.reveryCount += 1
    state.lastReveryEndTime = time
    state.revery = null
    return
  }
  // Summary phase is exited via advanceReveryToClosing called from the React
  // keydown handler — tickRevery does not auto-advance Summary → Closing.
}

// --- First-Revery egregoric advance ---
//
// v3 doctrine 8a section: "During the first Revery, hardcoded growth from
// 3 → ~6 tiles. Summary phrases this as the line moved." We place
// FIRST_REVERY_EGREGORE_COUNT new TileType.Egregore tiles adjacent to
// existing egregore tiles, biased toward the player's trail centroid (so
// the advance lands somewhere the player will plausibly notice).
//
// Subsequent Reveries (reveryCount >= 1) do NOT trigger this advance — the
// recurring per-Revery winter-phased spread is deferred to #8b.

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

// Returns positions of dirt tiles adjacent (ordinal) to existing egregore
// tiles, deduped. Candidate set for the advance.
const candidateDirtNeighbors = (state: GameState): Position[] => {
  const seen = new Set<string>()
  const candidates: Position[] = []
  for (const pos of state.egregorePositions) {
    for (const d of ORDINAL) {
      const nx = pos.x + d.x
      const ny = pos.y + d.y
      if (!isInBounds(nx, ny, state.mapWidth, state.mapHeight)) continue
      if (state.map[ny][nx].type !== TileType.Dirt) continue
      const key = posKey(nx, ny)
      if (seen.has(key)) continue
      seen.add(key)
      candidates.push({ x: nx, y: ny })
    }
  }
  return candidates
}

export const advanceEgregoreFirstRevery = (state: GameState): Position[] => {
  // Caller guards against reveryCount > 0, but this function is also safe to
  // call defensively — it just relies on the candidate-list shape.
  if (state.egregorePositions.length === 0) return []
  const candidates = candidateDirtNeighbors(state)
  if (candidates.length === 0) return []

  const center = trailCentroid(state)
  // Stable sort by Manhattan distance from trail centroid, then by posKey
  // (deterministic tiebreaker). Picks the closest N positions to the
  // player's recent movement.
  const sorted = [...candidates].sort((a, b) => {
    const da = manhattan(a, center)
    const db = manhattan(b, center)
    if (da !== db) return da - db
    return posKey(a.x, a.y).localeCompare(posKey(b.x, b.y))
  })
  const placed = sorted.slice(0, FIRST_REVERY_EGREGORE_COUNT)
  for (const pos of placed) {
    state.map[pos.y][pos.x] = { type: TileType.Egregore }
    state.egregorePositions.push(pos)
  }
  return placed
}

// Resolve the per-Revery phenotype label and commit it to state.revealedPhenotypes.
// Mutates revery.scheduledChanges to add the phenotype-revealed change record.
// Re-resolving the same (species, axis) pair OVERWRITES the prior verdict.
const resolveAndCommitPhenotype = (state: GameState, r: ReveryState): void => {
  const resolution = resolvePhenotypeLabel(state, state.reveryCount)
  if (!resolution) return
  const { species, axis, verdict } = resolution
  const list = state.revealedPhenotypes.get(species) ?? []
  const existingIndex = list.findIndex(p => p.axis === axis)
  const entry: RevealedPhenotype = { axis, verdict, reveryNumber: state.reveryCount }
  if (existingIndex >= 0) {
    list[existingIndex] = entry
  } else {
    list.push(entry)
  }
  state.revealedPhenotypes.set(species, list)
  r.scheduledChanges.push({ kind: 'phenotype-revealed', payload: { species, axis, verdict } })
}

// Called by the React layer's keydown handler when the summary is dismissed.
// Transitions Summary → Closing so the next tickRevery completes the cycle.
export const advanceReveryToClosing = (state: GameState): void => {
  const r = state.revery
  if (r?.phase !== ReveryPhase.Summary) return
  r.phase = ReveryPhase.Closing
  r.summaryReady = false
}

// Re-export OmenKind so callers don't have to reach into types.ts.
export { OmenKind }
