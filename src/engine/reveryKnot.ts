// RP-36 — Revery Knot pickup contribution site. Called from every
// code path that places a reveryKnot ItemInstance into the backpack:
// the coyote's auto-deposit branch in tickDeliver, and the
// ground-item proximity-pickup pass in entities.ts (the backpack-full
// fallback path). Consolidates all bookkeeping so the contribution,
// bedKnotPresent flip, harvestYear tagging, and pickup bloom fire
// exactly once per ItemInstance entering inventory.

import { KNOT_PRESSURE_AMOUNT } from './constants'
import { spawnPickupBloom } from './effects'
import { contributeDormancyPressure } from './omen'

import type { GameState, ItemUid } from './types'

export const onReveryKnotEntered = (state: GameState, knotUid: ItemUid, time: number): void => {
  const harvestYear = state.knotDelivery?.harvestYear ?? state.lastKnotPickupHarvestYear
  contributeDormancyPressure(state, KNOT_PRESSURE_AMOUNT)
  state.bedKnotPresent = true
  state.knotHarvestYears.set(knotUid, harvestYear)
  state.lastKnotPickupAt = time
  state.lastKnotPickupTile = { x: state.player.x, y: state.player.y }
  state.lastKnotPickupHarvestYear = harvestYear
  // Defensive: the scripted-route cleanup in tickCoyote also clears
  // this, but the ground-item walk-over path bypasses tickCoyote, so
  // clear it here in case the route's last leg was a ground item.
  if (state.knotDelivery !== null && state.coyoteCargo === null) {
    state.knotDelivery = null
  }
  spawnPickupBloom(state, state.player.x, state.player.y, time)
}
