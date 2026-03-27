import { updateFacingEntity } from './interaction'
import { findFitPosition, placeItem } from './inventory'
import { CARDINAL, posKey } from './position'

import type { GameState } from './types'

export const groundOmniboxBlockedSet = (state: GameState): Set<string> => {
  const set = new Set<string>()
  for (const go of state.groundOmniboxes) {
    set.add(posKey(go.pos.x, go.pos.y))
  }
  return set
}

export const openOmnibox = (state: GameState, uid: string): boolean => {
  const container = state.omniboxContainers.get(uid)
  if (!container) return false
  if (state.openContainer === container) return false
  // Close previous omnibox before opening new one
  state.openContainer = container
  return true
}

export const closeOmnibox = (state: GameState): void => {
  state.openContainer = null
}

export const toggleOmnibox = (state: GameState, uid: string): boolean => {
  const container = state.omniboxContainers.get(uid)
  if (!container) return false
  if (state.openContainer === container) {
    state.openContainer = null
    return true
  }
  state.openContainer = container
  return true
}

export const grabOmnibox = (state: GameState): string | null => {
  const px = state.player.x
  const py = state.player.y

  // Find adjacent ground omnibox (4-directional)
  for (let i = 0; i < state.groundOmniboxes.length; i++) {
    const go = state.groundOmniboxes[i]
    const dx = Math.abs(go.pos.x - px)
    const dy = Math.abs(go.pos.y - py)
    if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
      // Try to fit in backpack
      const fit = findFitPosition(state.backpack, 'omnibox')
      if (!fit) return null

      const placed = placeItem(state.backpack, 'omnibox', fit.rotation, fit.gridX, fit.gridY)
      if (!placed) return null

      // Override the uid to match the omnibox's container mapping
      placed.uid = go.uid

      // Remove from ground (keep open if it was open)
      state.groundOmniboxes.splice(i, 1)
      updateFacingEntity(state)

      return go.uid
    }
  }

  return null
}

export const toggleFacingOmnibox = (state: GameState): boolean => {
  if (state.facingEntityPos) {
    const go = state.groundOmniboxes.find(
      g => g.pos.x === state.facingEntityPos?.x && g.pos.y === state.facingEntityPos?.y
    )
    if (go) return toggleOmnibox(state, go.uid)
  }
  // Fall back to any cardinally adjacent omnibox
  const px = state.player.x
  const py = state.player.y
  for (const d of CARDINAL) {
    const go = state.groundOmniboxes.find(g => g.pos.x === px + d.x && g.pos.y === py + d.y)
    if (go) return toggleOmnibox(state, go.uid)
  }
  return false
}
