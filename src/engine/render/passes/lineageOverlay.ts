import { ACTION_COLOR } from '../../constants'
import { viewportToScreen } from '../../projection'
import { FloraSpecies, OverlayMode, Zone } from '../../types'
import { getVisibleTileBounds } from '../../viewportBounds'
import { registerPass } from '../passes'

import type { CharMetrics, FloraSpecies as FloraSpeciesType, GameState } from '../../types'
import type { RenderPass } from '../passes'

// RP-17 — family-tree lineage overlay.
//
// Renders only when state.overlayMode === FamilyTree (toggled via [2]
// in src/hooks/useKeyboard.ts). Draws faint hot-pink edges from every
// fully-sequenced flora tile to its direct parent, looked up via a
// per-species reverse index of identity-prefix → posKey.
//
// "Fully sequenced" means the player has at least one ScannedSpecimen
// of that species (state.scannedSpecimens) — the RP-6 sequencing
// gate. Unsequenced species render no edges; the mode is set but
// invisible in that case.
//
// Crossed tiles (those with crossDonorPrefix recorded by the spread
// engine) draw a second dashed edge from the tile to the donor's
// lineage. The donor prefix is matched against the same per-species
// reverse index; if the donor's tile isn't currently present (the
// donor died), the dashed edge is skipped.
//
// The reverse index is rebuilt on every active draw — flora is
// long-lived enough that a rebuild per frame is cheap relative to
// other passes, and the overlay is rarely active.

const PARENT_EDGE_OPACITY = 0.4
const DONOR_EDGE_OPACITY = 0.3
const DONOR_DASH = [2, 3]

// Returns true if the player has at least one scanned specimen of the
// given species — the gate for showing lineage edges for that species.
const isSequenced = (state: GameState, species: FloraSpeciesType): boolean => {
  const specimens = state.scannedSpecimens.get(species)
  return specimens !== undefined && specimens.length > 0
}

// Build a per-species map of identity-prefix (first 8 hex) → posKey by
// scanning state.floraLifecycle. Only includes sequenced species so
// unsequenced flora aren't accidentally referenced as parents.
const buildPrefixIndex = (state: GameState): Map<FloraSpeciesType, Map<string, string>> => {
  const sequencedSpecies = new Set<FloraSpeciesType>()
  for (const species of Object.values(FloraSpecies) as FloraSpeciesType[]) {
    if (isSequenced(state, species)) sequencedSpecies.add(species)
  }

  const index = new Map<FloraSpeciesType, Map<string, string>>()
  for (const species of sequencedSpecies) {
    index.set(species, new Map<string, string>())
  }

  for (const [key, entry] of state.floraLifecycle) {
    if (!sequencedSpecies.has(entry.species)) continue
    const prefix = entry.identity.slice(0, 8)
    const speciesMap = index.get(entry.species)
    if (!speciesMap) continue
    // Lowest posKey wins on prefix collision (matches the lineage
    // engine's findParentKey deterministic tie-break rule).
    const existing = speciesMap.get(prefix)
    if (existing === undefined || key < existing) {
      speciesMap.set(prefix, key)
    }
  }

  return index
}

// Parent edges are derived from each lifecycle entry's parentPrefix
// field (recorded by the spread engine and ceremony wave at sprout
// time). Donor edges come from crossDonorPrefix on crossed children.
// Both are looked up in the per-species prefix index.

const isActive = (state: GameState): boolean => {
  if (state.overlayMode !== OverlayMode.FamilyTree) return false
  if (state.currentZone !== Zone.Overworld) return false
  return true
}

const drawEdge = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  metrics: CharMetrics,
  fromKey: string,
  toKey: string
): void => {
  const [fxStr, fyStr] = fromKey.split(',')
  const [txStr, tyStr] = toKey.split(',')
  const fwx = Number(fxStr)
  const fwy = Number(fyStr)
  const twx = Number(txStr)
  const twy = Number(tyStr)

  const { camera, viewportWidth, viewportHeight } = state
  const { charWidth, charHeight } = metrics
  const bounds = getVisibleTileBounds(viewportWidth, viewportHeight)

  const fvx = fwx - camera.x
  const fvy = fwy - camera.y
  const tvx = twx - camera.x
  const tvy = twy - camera.y

  // Crude visibility cull — skip if both endpoints are off-screen.
  const fromVisible = fvx >= bounds.vxStart && fvx < bounds.vxEnd && fvy >= bounds.vyStart && fvy < bounds.vyEnd
  const toVisible = tvx >= bounds.vxStart && tvx < bounds.vxEnd && tvy >= bounds.vyStart && tvy < bounds.vyEnd
  if (!fromVisible && !toVisible) return

  const from = viewportToScreen(fvx, fvy, charWidth, charHeight, viewportWidth, viewportHeight)
  const to = viewportToScreen(tvx, tvy, charWidth, charHeight, viewportWidth, viewportHeight)

  ctx.beginPath()
  ctx.moveTo(from.px, from.py)
  ctx.lineTo(to.px, to.py)
  ctx.stroke()
}

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics): void => {
  const index = buildPrefixIndex(state)
  if (index.size === 0) return

  const savedAlpha = ctx.globalAlpha
  const savedDash = ctx.getLineDash()
  ctx.strokeStyle = ACTION_COLOR
  ctx.lineWidth = 1

  // Parent edges (solid).
  ctx.globalAlpha = PARENT_EDGE_OPACITY
  ctx.setLineDash([])
  for (const [key, entry] of state.floraLifecycle) {
    if (!entry.parentPrefix) continue
    const speciesMap = index.get(entry.species)
    if (!speciesMap) continue
    const parentKey = speciesMap.get(entry.parentPrefix)
    if (parentKey === undefined || parentKey === key) continue
    drawEdge(ctx, state, metrics, key, parentKey)
  }

  // Donor edges (dashed, lower opacity).
  ctx.globalAlpha = DONOR_EDGE_OPACITY
  ctx.setLineDash(DONOR_DASH)
  for (const [key, entry] of state.floraLifecycle) {
    if (!entry.crossDonorPrefix) continue
    const speciesMap = index.get(entry.species)
    if (!speciesMap) continue
    const donorKey = speciesMap.get(entry.crossDonorPrefix)
    if (donorKey === undefined || donorKey === key) continue
    drawEdge(ctx, state, metrics, key, donorKey)
  }

  ctx.setLineDash(savedDash)
  ctx.globalAlpha = savedAlpha
}

export const lineageOverlayPass: RenderPass = {
  id: 'lineage-overlay',
  slot: 'effect',
  isActive,
  draw,
}

registerPass(lineageOverlayPass)
