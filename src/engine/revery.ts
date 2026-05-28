// RP-4 — The Revery.
//
// Long-form ceremonial phase: omen-triggered entry, hard input lock, world
// ticks through compressed-time winter, bilingual ASCII + Voynich summary,
// one hedged phenotype label per Revery, first-Revery egregoric advance.
//
// Phase machine: Omen → Observing → Summary → Closing → null.
//
// See harness/specs/RP-4-the-revery.yaml for the locked behaviors and
// docs/claude/revery.md for the full doctrine summary.

import { updateCamera } from './camera'
import { REVERY_YEARS_PER_FRAME } from './constants'
import { ComponentType } from './ecs/types'
import { advanceEgregoreInRevery, commitEgregoreTiles } from './egregore/spread'
import { pickAdjacentWalkableTile } from './interaction'
import { resolvePhenotypeLabel } from './phenotype'
import { FloraSpecies, OmenKind, ReveryPhase, TileType, Zone } from './types'

import type {
  GameState,
  OmenKind as OmenKindT,
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

// RP-32 — summons-sequence helper. When a Revery enters via the
// pressure-ceiling path (state.revery.summons === true), the Omen → Observing
// transition runs this sequence before the standard transition logic. The
// steward's tile is captured for the Closing-phase egregoric commit; Gron
// is teleported in via the existing pickAdjacentWalkableTile + spatial.move
// pattern from interaction.ts:triggerStewardSeal; his dialog opens. Missing
// Gron entity or null adjacent tile fail silently (no crash); the Revery
// proceeds in all cases.
const runSummonsSequence = (state: GameState, r: ReveryState): void => {
  if (r.summons !== true) return
  // Capture the steward's tile before any state mutation.
  // RP-33 — only meaningful when the steward is on the overworld at
  // Omen. If they're already inside the house (confirm-in-house path),
  // there is no overworld collapse tile to commit at Closing.
  const collapseTile = { x: state.player.x, y: state.player.y }
  if (state.currentZone === Zone.Overworld) {
    r.summonsCollapseTile = collapseTile
    state.collapsedStewardTile = collapseTile
  }
  r.summonsAudioCue = true
  // Find Gron's entity and teleport adjacent to the steward.
  let gronEid: number | null = null
  for (const eid of state.world.query(ComponentType.CharacterIdentity)) {
    const ident = state.world.getComponent(eid, ComponentType.CharacterIdentity)
    if (ident?.definitionId === 'gron') {
      gronEid = eid
      break
    }
  }
  let dialogReady = false
  if (gronEid !== null) {
    const target = pickAdjacentWalkableTile(state, state.player.x, state.player.y)
    if (target) {
      const pos = state.world.getComponent(gronEid, ComponentType.Position)
      if (pos) {
        state.world.spatial.move(gronEid, pos.x, pos.y, target.x, target.y)
        pos.x = target.x
        pos.y = target.y
      }
    }
    // Open Gron's solstice-summons dialog. getGronDialog returns
    // GRON_DIALOG_SOLSTICE_SUMMONS while r.summons === true and phase is Omen.
    dialogReady = true
  }
  if (dialogReady) {
    state.activeDialog = {
      characterId: 'gron',
      lineIndex: 0,
      typingIndex: 0,
      typingDone: false,
      transitioning: false,
      transitionStartTime: 0,
    }
  }
}

// RP-33 — the Revery scene is always the house interior. Called at
// the Omen → Observing transition. Performs an immediate synchronous
// zone swap if the steward is not already inside; then repositions the
// steward to the bed and Emily to her chair. The existing fade between
// Omen and Observing covers the visual gap. The collapse tile field
// from RP-32 is preserved on r.summonsCollapseTile so Closing can
// commit on the overworld map regardless of where the player ended up.
const transitionToHouseScene = (state: GameState): void => {
  // Skip cleanly if the house buffers aren't initialized (defensive —
  // tests can construct partial states).
  if (!state.houseMap || state.houseMap.length === 0) return

  if (state.currentZone !== Zone.HouseInterior) {
    state.map = state.houseMap
    state.mapWidth = state.houseMapWidth
    state.mapHeight = state.houseMapHeight
    state.currentZone = Zone.HouseInterior
    state.path = null
    state.pathWaypoints = []
    state.pendingAction = null
    state.pendingInteractionTarget = null
    state.heldDirection = null
    state.previewFn = null
    state.facingEntityPos = null
    state.trail = []
  }

  // Reposition steward to the bed; face left so the steward visually
  // rests with their head toward the wall.
  state.player = { x: state.houseBedInterior.x, y: state.houseBedInterior.y }
  state.playerFacing = 'left'

  // Capture Emily's idle position and move her to the chair.
  for (const eid of state.world.query(ComponentType.CharacterIdentity)) {
    const ident = state.world.getComponent(eid, ComponentType.CharacterIdentity)
    if (ident?.definitionId !== 'emily') continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!pos) continue
    state.emilyReveryReturn = { x: pos.x, y: pos.y }
    state.world.spatial.move(eid, pos.x, pos.y, state.houseChairInterior.x, state.houseChairInterior.y)
    pos.x = state.houseChairInterior.x
    pos.y = state.houseChairInterior.y
    break
  }

  updateCamera(state)
}

// RP-33 — Closing-phase revert. Restore Emily to her idle position
// and reset emilyInvitation so she can offer again next autumn. Steward
// stays on the bed and walks off at their pace.
const revertHouseScene = (state: GameState): void => {
  if (state.emilyReveryReturn) {
    for (const eid of state.world.query(ComponentType.CharacterIdentity)) {
      const ident = state.world.getComponent(eid, ComponentType.CharacterIdentity)
      if (ident?.definitionId !== 'emily') continue
      const pos = state.world.getComponent(eid, ComponentType.Position)
      if (!pos) continue
      const dest = state.emilyReveryReturn
      state.world.spatial.move(eid, pos.x, pos.y, dest.x, dest.y)
      pos.x = dest.x
      pos.y = dest.y
      break
    }
  }
  state.emilyReveryReturn = null
  if (state.emilyInvitation === 'confirmed') {
    state.emilyInvitation = 'unoffered'
  }
}

// Per-frame state machine. Called by gameLoop AFTER the dormancy-pressure
// tick (RP-32) and BEFORE input handlers, so the Omen → Observing
// transition is reflected before movePlayer / keyboard tick this frame.
export const tickRevery = (state: GameState, _dt: number, time: number): void => {
  const r = state.revery
  if (!r?.active) return

  if (r.phase === ReveryPhase.Omen) {
    // RP-32 — summons sequence runs BEFORE the standard phase flip so
    // that getGronDialog sees phase === Omen when the dialog opens.
    runSummonsSequence(state, r)
    // RP-33 — Revery scene is always the little house. Skip the
    // scene swap for non-summons Reveries (only used by legacy test
    // paths; production code only enters Revery via summons).
    if (r.summons === true) {
      transitionToHouseScene(state)
    }
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
      // Egregoric advance. RP-8b refactored this — the function
      // is always called, and the count varies by state.reveryCount:
      // first Revery places 3 (preserves RP-4 contract); subsequent
      // Reveries place 6–9. state.reveryCount increments in Closing, so
      // it reflects the *current* Revery here.
      // RP-33 — state.map points at the house interior during the
      // Revery scene. The egregoric advance operates on the OVERWORLD
      // map (it reads/writes existing egregore positions across the
      // prairie). Swap to overworldMap for the call, then restore.
      const savedMap = state.map
      const savedW = state.mapWidth
      const savedH = state.mapHeight
      state.map = state.overworldMap
      state.mapWidth = state.overworldMapWidth
      state.mapHeight = state.overworldMapHeight
      const placed = advanceEgregoreInRevery(state, time)
      state.map = savedMap
      state.mapWidth = savedW
      state.mapHeight = savedH
      if (placed.length > 0) {
        r.scheduledChanges.push({ kind: 'egregore-grew', payload: { positions: placed } })
      }
      r.summaryReady = true
    }
    return
  }

  if (r.phase === ReveryPhase.Closing) {
    state.reveryCount += 1
    state.lastReveryEndTime = time
    // RP-32 — Closing-phase egregoric commit. The collapse tile
    // was captured at Omen on whatever map was active then; we must
    // commit on the OVERWORLD map (RP-33 — when the steward
    // confirms inside the house, the captured tile is on the house
    // floor and is silently skipped here; when the field-summons path
    // fires, the captured tile is on the overworld and is committed).
    // Swap state.map to overworldMap for the commit so commitEgregoreTiles
    // writes to the correct grid, then restore.
    if (r.summons === true && r.summonsCollapseTile) {
      const { x, y } = r.summonsCollapseTile
      if (state.overworldMap[y]?.[x]?.type === TileType.Dirt) {
        const savedMap = state.map
        const savedW = state.mapWidth
        const savedH = state.mapHeight
        state.map = state.overworldMap
        state.mapWidth = state.overworldMapWidth
        state.mapHeight = state.overworldMapHeight
        commitEgregoreTiles(state, [r.summonsCollapseTile], time)
        state.map = savedMap
        state.mapWidth = savedW
        state.mapHeight = savedH
      }
    }
    // RP-33 — restore Emily to her idle position; reset
    // emilyInvitation so the cycle can repeat next autumn.
    revertHouseScene(state)
    // RP-32 — pressure reset. Belt-and-suspenders with the Autumn →
    // Winter safety reset in gameLoop. dormancyPressure must zero out so
    // the next autumn starts from baseline.
    state.dormancyPressure = 0
    state.collapsedStewardTile = null
    // RP-62 — the post-Revery memory softening hook is gone: the overworld is
    // already dim memory by default the moment the steward looks away, so
    // there is no bright tier to drain on Revery exit.
    state.revery = null
    return
  }
  // Summary phase is exited via advanceReveryToClosing called from the React
  // keydown handler — tickRevery does not auto-advance Summary → Closing.
}

// The egregoric advance logic moved to src/engine/egregore/spread.ts so
// the stewardship-time and Revery-time paths share helpers (RP-8b).

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
