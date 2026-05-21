// Precis #6 — naturalist's manual scan-to-discover.
//
// Pure functions for selecting a scan target and committing a scan.
// State transitions live in the keyboard handler (useKeyboard.ts);
// this module just describes "what would be scanned" and "what
// happens when a scan completes."

import { ComponentType } from './ecs/types'
import { spawnPickupBloom } from './effects'
import { recordDiscovery } from './manual'
import { CARDINAL, isInBounds, posKey } from './position'
import { TileType } from './types'

import type { Direction, FloraSpecies, GameState, Position } from './types'

export type ScanTarget =
  | { kind: 'flora'; position: Position; species: FloraSpecies; identity: string }
  | { kind: 'oak'; position: Position; identity: string }

// Map a cardinal Direction value to the (dx, dy) delta the player is facing.
// Returns null for diagonal facings (the on-tile case still wins, but the
// "facing direction" tie-breaker only fires for cardinal facings).
const facingDelta = (facing: Direction): Position | null => {
  switch (facing) {
    case 'up':
      return { x: 0, y: -1 }
    case 'down':
      return { x: 0, y: 1 }
    case 'left':
      return { x: -1, y: 0 }
    case 'right':
      return { x: 1, y: 0 }
    default:
      return null
  }
}

const floraTileAt = (state: GameState, x: number, y: number): ScanTarget | null => {
  if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) return null
  if (state.map[y][x].type !== TileType.Flora) return null
  const entry = state.floraLifecycle.get(posKey(x, y))
  if (!entry) return null
  return { kind: 'flora', position: { x, y }, species: entry.species, identity: entry.identity }
}

// Returns an oak ScanTarget if (x, y) lies within any oak's 3x3 body. The
// returned position is the trunk anchor (oak center), not the cursor tile —
// the scan represents the whole tree, not a single tile of its canopy.
const oakAt = (state: GameState, x: number, y: number): ScanTarget | null => {
  for (const eid of state.world.query(ComponentType.OakData, ComponentType.Position, ComponentType.MultiPosition)) {
    const multi = state.world.getComponent(eid, ComponentType.MultiPosition)
    const pos = state.world.getComponent(eid, ComponentType.Position)
    const data = state.world.getComponent(eid, ComponentType.OakData)
    if (!multi || !pos || !data) continue
    if (multi.positions.some(p => p.x === x && p.y === y)) {
      return { kind: 'oak', position: { x: pos.x, y: pos.y }, identity: data.identity }
    }
  }
  return null
}

// Selects what the player would scan if they began holding the scan key right
// now. Flora and oaks share the same priority order:
//   1. on-tile flora (player standing on a flora tile) — oaks block movement
//      so they can never be on-tile
//   2. cardinal neighbor in playerFacing direction
//   3. first cardinal neighbor in CARDINAL order (N, S, W, E)
//   4. null
// At each step, flora wins over oak when both exist at the same tile (oaks
// occupy dirt; flora is its own tile type — they cannot coexist).
const scanTargetAt = (state: GameState, x: number, y: number): ScanTarget | null =>
  floraTileAt(state, x, y) ?? oakAt(state, x, y)

export const selectScanTarget = (state: GameState): ScanTarget | null => {
  const { x: px, y: py } = state.player

  // (1) on-tile flora
  const onTile = floraTileAt(state, px, py)
  if (onTile) return onTile

  // (2) cardinal neighbor in playerFacing direction
  const facing = facingDelta(state.playerFacing)
  if (facing) {
    const facingTarget = scanTargetAt(state, px + facing.x, py + facing.y)
    if (facingTarget) return facingTarget
  }

  // (3) first cardinal neighbor in CARDINAL order
  for (const delta of CARDINAL) {
    const target = scanTargetAt(state, px + delta.x, py + delta.y)
    if (target) return target
  }

  return null
}

export type ScanCommitResult =
  | { kind: 'flora'; species: FloraSpecies; identity: string }
  | { kind: 'oak'; identity: string }

// Called when a hold-to-scan release fires after >= SCAN_DURATION_MS elapsed.
// Re-evaluates the target (the plant or player may have moved during the
// hold), and if the target is still valid:
//   - records flora:${species} or entity:oak discovery
//   - appends a ScannedSpecimen to state.scannedSpecimens[species] / state.oakSpecimens
//     unless a specimen with the same identity is already in the array
//     (scanning the same plant twice is a no-op for the card stack)
//   - spawns a pickup bloom at the scanned tile
//   - sets state.manualHighlightEntryId so the manual scrolls to and
//     highlights the entry on next render
//
// Returns a discriminated ScanCommitResult on success so the caller can
// dispatch — flora opens the ceremonial gel-electrophoresis modal, oaks
// open the manual (the modal is flora-only). Returns null on abort
// (no scanInProgress, or selectScanTarget returns null / the target kind
// drifted / the flora species changed). The function itself does not
// open any UI surface — the caller is responsible.
export const commitScan = (state: GameState, time: number): ScanCommitResult | null => {
  const progress = state.scanInProgress
  if (!progress) return null

  const target = selectScanTarget(state)
  if (!target) return null
  // The progress kind must match the current target kind. If the player
  // started a flora scan and the target drifted to an oak (or vice versa),
  // abort — the in-progress hold is no longer valid.
  if (target.kind !== progress.kind) return null

  if (target.kind === 'flora' && progress.kind === 'flora') {
    if (target.species !== progress.species) return null

    recordDiscovery(state, `flora:${target.species}`)

    const existing = state.scannedSpecimens.get(target.species) ?? []
    const alreadyScanned = existing.some(s => s.identity === target.identity)
    if (!alreadyScanned) {
      existing.push({
        identity: target.identity,
        scannedAt: time,
        position: { x: target.position.x, y: target.position.y },
      })
      state.scannedSpecimens.set(target.species, existing)
    }

    spawnPickupBloom(state, target.position.x, target.position.y, time)
    state.manualHighlightEntryId = `flora:${target.species}`
    return { kind: 'flora', species: target.species, identity: target.identity }
  }

  // Oak commit. Records entity:oak discovery and appends to oakSpecimens
  // (deduped on per-tree identity). Returns kind: 'oak' so the caller can
  // open the manual to the oak entry — oaks do not get the flora-only
  // gel-electrophoresis modal.
  recordDiscovery(state, 'entity:oak')
  const alreadyScanned = state.oakSpecimens.some(s => s.identity === target.identity)
  if (!alreadyScanned) {
    state.oakSpecimens.push({
      identity: target.identity,
      scannedAt: time,
      position: { x: target.position.x, y: target.position.y },
    })
  }
  spawnPickupBloom(state, target.position.x, target.position.y, time)
  state.manualHighlightEntryId = 'entity:oak'
  return { kind: 'oak', identity: target.identity }
}
