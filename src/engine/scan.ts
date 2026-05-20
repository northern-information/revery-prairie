// Precis #6 — naturalist's manual scan-to-discover.
//
// Pure functions for selecting a scan target and committing a scan.
// State transitions live in the keyboard handler (useKeyboard.ts);
// this module just describes "what would be scanned" and "what
// happens when a scan completes."

import { spawnPickupBloom } from './effects'
import { recordDiscovery } from './manual'
import { CARDINAL, isInBounds, posKey } from './position'
import { TileType } from './types'

import type { Direction, FloraSpecies, GameState, Position } from './types'

export interface ScanTarget {
  position: Position
  species: FloraSpecies
  identity: string
}

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
  return { position: { x, y }, species: entry.species, identity: entry.identity }
}

// Selects the flora tile the player would scan if they began holding the
// scan key right now. Priority order:
//   1. on-tile flora (player standing on a flora tile)
//   2. cardinal neighbor in playerFacing direction
//   3. first cardinal neighbor in CARDINAL order (N, S, W, E)
//   4. null
export const selectScanTarget = (state: GameState): ScanTarget | null => {
  const { x: px, y: py } = state.player

  // (1) on-tile flora
  const onTile = floraTileAt(state, px, py)
  if (onTile) return onTile

  // (2) cardinal neighbor in playerFacing direction
  const facing = facingDelta(state.playerFacing)
  if (facing) {
    const facingTarget = floraTileAt(state, px + facing.x, py + facing.y)
    if (facingTarget) return facingTarget
  }

  // (3) first cardinal neighbor in CARDINAL order
  for (const delta of CARDINAL) {
    const target = floraTileAt(state, px + delta.x, py + delta.y)
    if (target) return target
  }

  return null
}

// Called when a hold-to-scan release fires after >= SCAN_DURATION_MS elapsed.
// Re-evaluates the target (the plant or player may have moved during the
// hold), and if the target is still valid:
//   - records flora:${species} discovery
//   - appends a ScannedSpecimen to state.scannedSpecimens[species] unless
//     a specimen with the same identity is already in the array
//     (scanning the same plant twice is a no-op for the card stack)
//   - spawns a pickup bloom at the scanned tile
//   - sets state.manualHighlightEntryId so the manual scrolls to and
//     highlights the entry on next render
//
// Returns the committed { species, identity } on success so the caller
// can drive the scan-result modal. Returns null on abort (no
// scanInProgress, or selectScanTarget returns null / different species).
// The function itself does not open any UI surface.
export const commitScan = (
  state: GameState,
  time: number,
): { species: FloraSpecies; identity: string } | null => {
  const progress = state.scanInProgress
  if (!progress) return null

  const target = selectScanTarget(state)
  if (!target) return null
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
  return { species: target.species, identity: target.identity }
}
