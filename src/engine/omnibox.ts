import { ComponentType } from './ecs'
import { updateFacingEntity } from './interaction'
import { findFitPosition, placeItem } from './inventory'
import { CARDINAL } from './position'

import type { Entity } from './ecs'
import type { GameState } from './types'

export const createGroundOmniboxEntity = (
  state: GameState,
  uid: string,
  x: number,
  y: number,
): Entity => {
  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x, y })
  state.world.addComponent(e, ComponentType.OmniboxLink, { uid })
  state.world.addComponent(e, ComponentType.Blocking, { blockMovement: true })
  state.world.addComponent(e, ComponentType.EntityTag, 'groundOmnibox')
  return e
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

  // Find adjacent ground omnibox ECS entity (4-directional)
  for (const d of CARDINAL) {
    const ax = px + d.x
    const ay = py + d.y
    for (const eid of state.world.spatial.at(ax, ay)) {
      if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'groundOmnibox') continue
      const link = state.world.getComponent(eid, ComponentType.OmniboxLink)
      if (!link) continue

      // Try to fit in backpack
      const fit = findFitPosition(state.backpack, 'omnibox')
      if (!fit) return null

      const placed = placeItem(state.backpack, 'omnibox', fit.rotation, fit.gridX, fit.gridY)
      if (!placed) return null

      // Override the uid to match the omnibox's container mapping
      placed.uid = link.uid

      // Remove from ground (keep open if it was open)
      state.world.destroyEntity(eid)
      updateFacingEntity(state)

      return link.uid
    }
  }

  return null
}

export const toggleFacingOmnibox = (state: GameState): boolean => {
  if (state.facingEntityPos) {
    const eids = state.world.spatial.at(state.facingEntityPos.x, state.facingEntityPos.y)
    for (const eid of eids) {
      if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'groundOmnibox') continue
      const link = state.world.getComponent(eid, ComponentType.OmniboxLink)
      if (link) return toggleOmnibox(state, link.uid)
    }
  }
  // Fall back to any cardinally adjacent omnibox
  const px = state.player.x
  const py = state.player.y
  for (const d of CARDINAL) {
    const eids = state.world.spatial.at(px + d.x, py + d.y)
    for (const eid of eids) {
      if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'groundOmnibox') continue
      const link = state.world.getComponent(eid, ComponentType.OmniboxLink)
      if (link) return toggleOmnibox(state, link.uid)
    }
  }
  return false
}
