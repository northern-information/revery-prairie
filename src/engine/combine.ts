import { buildOccupancyGrid, containerHasItem, findItemByDefinition, getActiveContainers, getRotatedShape, removeItem } from './inventory'
import { getDefinition } from './items'
import { isWalkableTile } from './position'
import { findRecipe, recipeKey, RECIPES } from './recipes'
import { TileType } from './types'

import type { Recipe } from './recipes'
import type { Container, GameState, ItemInstance, Rotation } from './types'

export type CheckCombineResult =
  | { kind: 'recipe'; uid: string; recipe: Recipe; isDiscovered: boolean }
  | { kind: 'store'; omniboxUid: string }
  | 'no-recipe'
  | null

export const checkCombine = (
  container: Container,
  draggedItem: ItemInstance,
  rotation: Rotation,
  gridX: number,
  gridY: number,
  sourceContainerId: string,
  containerId: string,
  discoveredRecipes: Set<string>
): CheckCombineResult => {
  const def = getDefinition(draggedItem.definitionId)
  const shape = getRotatedShape(def.shape, rotation)

  const excludeUid = sourceContainerId === containerId ? draggedItem.uid : undefined
  const occupancy = buildOccupancyGrid(container, excludeUid)

  const overlappedUids = new Set<string>()
  for (let sy = 0; sy < shape.length; sy++) {
    for (let sx = 0; sx < (shape[sy]?.length ?? 0); sx++) {
      if (shape[sy]?.[sx]) {
        const gx = gridX + sx
        const gy = gridY + sy
        if (gy >= 0 && gy < container.height && gx >= 0 && gx < container.width) {
          const uid = occupancy[gy]?.[gx]
          if (uid) {
            overlappedUids.add(uid)
          }
        }
      }
    }
  }

  if (overlappedUids.size !== 1) return null

  const targetUid = [...overlappedUids][0]
  if (!targetUid) return null

  const targetItem = container.items.find(i => i.uid === targetUid)
  if (!targetItem) return null

  // Dragging onto an omnibox stores the item inside (takes priority over recipes)
  if (targetItem.definitionId === 'omnibox' && draggedItem.uid !== targetItem.uid) {
    return { kind: 'store', omniboxUid: targetItem.uid }
  }

  const recipe = findRecipe(draggedItem.definitionId, targetItem.definitionId)
  if (!recipe) return 'no-recipe'

  const isDiscovered = discoveredRecipes.has(recipeKey(recipe))
  return { kind: 'recipe', uid: targetUid, recipe, isDiscovered }
}

const findAndRemoveItem = (state: GameState, definitionId: string): boolean => {
  const containers = getActiveContainers(state)
  for (const container of containers) {
    const item = findItemByDefinition(container, definitionId)
    if (item) {
      removeItem(container, item.uid)
      return true
    }
  }
  return false
}

const hasItemInAnyContainer = (state: GameState, definitionId: string): boolean => {
  if (containerHasItem(state.backpack, definitionId)) return true
  if (state.openContainer && containerHasItem(state.openContainer, definitionId)) return true
  return false
}

export const combineBeeAndClover = (state: GameState): boolean => {
  const hasBee = hasItemInAnyContainer(state, 'bee')
  const hasClover = hasItemInAnyContainer(state, 'clover')

  if (!hasBee || !hasClover) return false

  // Check standing tile before consuming items — recipe.execute also checks,
  // but we need to bail before removing ingredients
  const standingOn = state.map[state.player.y][state.player.x].type
  if (standingOn === TileType.Sand || !isWalkableTile(standingOn)) return false

  findAndRemoveItem(state, 'bee')
  findAndRemoveItem(state, 'clover')

  const prairie = RECIPES.find(r => r.resultName === 'prairie')
  if (!prairie) return false
  return prairie.execute(state)
}
