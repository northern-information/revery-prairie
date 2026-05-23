import { ComponentType } from './ecs/types'
import { isInteractableAt } from './interaction'
import { posKey } from './position'

import type { GameState, Position } from './types'

/**
 * Returns true if `tile` has anything a left-click should land on (player,
 * character entity, angel body, or interactable). Used by the forgiving
 * hit-test to "snap" off-by-one clicks back to the visible glyph.
 */
export const tileHasClickable = (state: GameState, tile: Position): boolean => {
  if (tile.x < 0 || tile.x >= state.mapWidth || tile.y < 0 || tile.y >= state.mapHeight) return false
  if (tile.x === state.player.x && tile.y === state.player.y) return true
  const tileKey = posKey(tile.x, tile.y)
  for (const eid of state.world.spatial.at(tile.x, tile.y)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) === 'character') return true
  }
  for (const eid of state.world.query(
    ComponentType.AngelData,
    ComponentType.MultiPosition,
    ComponentType.CharacterIdentity
  )) {
    const multi = state.world.getComponent(eid, ComponentType.MultiPosition)
    if (multi?.positions.some(p => posKey(p.x, p.y) === tileKey)) return true
  }
  if (isInteractableAt(state, tile.x, tile.y)) return true
  return false
}

/**
 * The visible glyph for a tile is centered in its diamond, but the diamond
 * shape is narrow at top and bottom. A click aimed at the glyph apex can
 * fall in a cardinal-neighbor diamond. If the geometric tile has no
 * clickable, look at the 4 cardinal neighbors and return the first one with
 * a clickable. Falls through to the original tile when no neighbor has
 * anything.
 */
export const expandClickTile = (state: GameState, tile: Position): Position => {
  if (tileHasClickable(state, tile)) return tile
  const deltas: [number, number][] = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ]
  for (const [dx, dy] of deltas) {
    const candidate = { x: tile.x + dx, y: tile.y + dy }
    if (tileHasClickable(state, candidate)) return candidate
  }
  return tile
}
