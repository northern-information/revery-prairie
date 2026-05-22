// Precis #6 — naturalist's manual scan-to-discover.
//
// Pure functions for selecting a scan target and committing a scan.
// State transitions live in the keyboard handler (useKeyboard.ts);
// this module just describes "what would be scanned" and "what
// happens when a scan completes."

import { ComponentType } from './ecs/types'
import { spawnPickupBloom } from './effects'
import { getEgregoreTileIdentity } from './egregore'
import { recordDiscovery } from './manual'
import { CARDINAL, isInBounds, posKey } from './position'
import { TileType } from './types'

import type { Direction, FloraSpecies, GameState, Position } from './types'

export type ScanTarget =
  | { kind: 'flora'; position: Position; species: FloraSpecies; identity: string }
  | { kind: 'oak'; position: Position; identity: string }
  | { kind: 'egregore'; position: Position; identity: string }

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

// Returns an egregore ScanTarget if the tile at (x, y) is TileType.Egregore.
// Identity is derived from the tile position via a dedicated SHA256 channel
// (see getEgregoreTileIdentity) so the scan-result gel is independent of
// the glyph/body pickers.
const egregoreTileAt = (state: GameState, x: number, y: number): ScanTarget | null => {
  if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) return null
  if (state.map[y][x].type !== TileType.Egregore) return null
  return { kind: 'egregore', position: { x, y }, identity: getEgregoreTileIdentity(x, y) }
}

// Selects what the player would scan if they began holding the scan key right
// now. Flora, oaks, and egregore tiles share the same priority order:
//   1. on-tile (flora or egregore — oaks block movement so never on-tile)
//   2. cardinal neighbor in playerFacing direction
//   3. first cardinal neighbor in CARDINAL order (N, S, W, E)
//   4. null
// At each step, flora wins over egregore which wins over oak when multiple
// kinds coexist at the same cursor tile. In practice flora/egregore are
// distinct tile types and cannot coexist, so the ordering only matters
// for the (rare) flora-on-an-oak-canopy edge case.
const scanTargetAt = (state: GameState, x: number, y: number): ScanTarget | null =>
  floraTileAt(state, x, y) ?? egregoreTileAt(state, x, y) ?? oakAt(state, x, y)

export const selectScanTarget = (state: GameState): ScanTarget | null => {
  const { x: px, y: py } = state.player

  // (1) on-tile flora or egregore (oaks block movement so they're never
  // on-tile). Flora wins if both are present at the same tile (they
  // cannot coexist in practice, but the ordering is explicit).
  const onTile = floraTileAt(state, px, py) ?? egregoreTileAt(state, px, py)
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

// Discriminated commit result. Callers (game loop / useKeyboard) pass the
// result to ScanResultModal, which reads `kind` to pick the heading +
// gel variant. Every kind opens the modal — the scan ceremony is the
// universal reward for the hold-to-scan core loop.
//   - 'flora':    gel modal in flora variant (gold palette, binomial heading)
//   - 'oak':      gel modal in flora variant (gold palette, OAK_SPECIES heading)
//   - 'egregore': gel modal in egregore variant (purple palette, no heading)
export type ScanCommitResult =
  | { kind: 'flora'; species: FloraSpecies; identity: string; position: Position }
  | { kind: 'egregore'; identity: string; position: Position }
  | { kind: 'oak'; identity: string }

// Called when a hold-to-scan release fires after >= SCAN_DURATION_MS elapsed.
// Re-evaluates the target (the plant or player may have moved during the
// hold), and if the target is still valid:
//   - records the appropriate discovery key
//   - appends a ScannedSpecimen to the matching specimen collection
//     unless one with the same identity is already there
//   - spawns a pickup bloom at the scanned tile
//   - sets state.manualHighlightEntryId so the manual scrolls to and
//     highlights the entry on next render
//
// Returns a discriminated ScanCommitResult on success so the caller passes
// it to ScanResultModal — every kind (flora, oak, egregore) opens that
// same ceremonial modal. The function itself does not open any UI; the
// caller does. Returns null on abort (no progress, no target, kind drift,
// species drift).
export const commitScan = (state: GameState, time: number): ScanCommitResult | null => {
  const progress = state.scanInProgress
  if (!progress) return null

  const target = selectScanTarget(state)
  if (!target) return null
  // The progress kind must match the current target kind. If the player
  // started a flora scan and the target drifted to an oak/egregore (or
  // any other mismatch), abort — the in-progress hold is no longer valid.
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
    return {
      kind: 'flora',
      species: target.species,
      identity: target.identity,
      position: { x: target.position.x, y: target.position.y },
    }
  }

  if (target.kind === 'egregore' && progress.kind === 'egregore') {
    // Egregore commit. Records the per-tile manual entry id as the
    // discovery key (matches getEgregoreManualEntries) and appends to
    // egregoreSpecimens, deduped on identity (a SHA256 of the position).
    const entryId = `egregore:${String(target.position.x)},${String(target.position.y)}`
    recordDiscovery(state, entryId)

    const alreadyScanned = state.egregoreSpecimens.some(s => s.identity === target.identity)
    if (!alreadyScanned) {
      state.egregoreSpecimens.push({
        identity: target.identity,
        scannedAt: time,
        position: { x: target.position.x, y: target.position.y },
      })
    }

    spawnPickupBloom(state, target.position.x, target.position.y, time)
    state.manualHighlightEntryId = entryId
    return {
      kind: 'egregore',
      identity: target.identity,
      position: { x: target.position.x, y: target.position.y },
    }
  }

  // Oak commit. Records entity:oak discovery and appends to oakSpecimens
  // (deduped on per-tree identity). Returns kind: 'oak' so the caller can
  // open the manual to the oak entry — oaks do not get the gel modal.
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
