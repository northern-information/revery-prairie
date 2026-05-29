import { getActiveContainers } from './inventory'

import type { GameState, ItemInstance, ItemUid } from './types'

// RP-59 — the in-hand layer is the single owner of state.equippedItemUid.
// In-hand is a uid *reference*, never a move: the ItemInstance stays in the
// backpack so it survives autoSort/merge/split exactly like glintingCoins.
// The 3x3 HUD cell and the loaded cursor are views of this reference.

const findItemByUid = (state: GameState, uid: ItemUid): ItemInstance | null => {
  for (const container of getActiveContainers(state)) {
    const item = container.items.find(i => i.uid === uid)
    if (item) return item
  }
  return null
}

// Resolve the in-hand ItemInstance, or null. Self-heals a dangling reference
// (e.g. the item left the bag through a path that forgot to clear in-hand).
export const getInHandItem = (state: GameState): ItemInstance | null => {
  if (state.equippedItemUid === null) return null
  const item = findItemByUid(state, state.equippedItemUid)
  if (!item) {
    state.equippedItemUid = null
    return null
  }
  return item
}

export const takeInHand = (state: GameState, uid: ItemUid): void => {
  state.equippedItemUid = uid
}

export const releaseInHand = (state: GameState): void => {
  state.equippedItemUid = null
}

// After placing one of a stack, advance the hand to another backpack instance
// of the same definitionId, chosen deterministically (lowest gridY then gridX)
// so the order is testable. Clears to null when none remain. The placed
// instance has already been removed from the container by the time this runs,
// so the caller passes its definitionId rather than relying on a lookup of the
// (now gone) placedUid. `placedUid` is excluded defensively.
export const advanceInHand = (state: GameState, definitionId: string, placedUid: ItemUid): void => {
  let next: ItemInstance | null = null
  for (const container of getActiveContainers(state)) {
    for (const item of container.items) {
      if (item.uid === placedUid) continue
      if (item.definitionId !== definitionId) continue
      if (next === null || item.gridY < next.gridY || (item.gridY === next.gridY && item.gridX < next.gridX)) {
        next = item
      }
    }
  }

  state.equippedItemUid = next?.uid ?? null
}

// Clear in-hand if the removed uid was the one in hand. Call from any path that
// removes an item from a container (drop, combine) before/after the removal.
export const clearInHandIfRemoved = (state: GameState, removedUid: ItemUid): void => {
  if (state.equippedItemUid === removedUid) {
    state.equippedItemUid = null
  }
}
