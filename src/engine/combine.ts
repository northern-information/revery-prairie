import { buildOccupancyGrid, containerHasItem, findItemByDefinition, removeItem } from './inventory'
import { isWalkableTile } from './position'
import { findRecipe, recipeKey, RECIPES } from './recipes'
import { TileType } from './types'

import type { Recipe } from './recipes'
import type { Container, GameState, ItemInstance } from './types'

export type CheckCombineResult =
  | { kind: 'recipe'; uid: string; recipe: Recipe; isDiscovered: boolean }
  | { kind: 'no-recipe' }
  | { kind: 'none' }

export const checkCombine = (
  container: Container,
  draggedItem: ItemInstance,
  gridX: number,
  gridY: number,
  sourceContainerId: string,
  containerId: string,
  discoveredRecipes: Set<string>
): CheckCombineResult => {
  if (gridX < 0 || gridY < 0 || gridX >= container.width || gridY >= container.height) {
    return { kind: 'none' }
  }

  const excludeUid = sourceContainerId === containerId ? draggedItem.uid : undefined
  const occupancy = buildOccupancyGrid(container, excludeUid)

  const targetUid = occupancy[gridY]?.[gridX]
  if (!targetUid) return { kind: 'none' }

  const targetItem = container.items.find(i => i.uid === targetUid)
  if (!targetItem) return { kind: 'none' }

  const recipe = findRecipe(draggedItem.definitionId, targetItem.definitionId)
  if (!recipe) return { kind: 'no-recipe' }

  const isDiscovered = discoveredRecipes.has(recipeKey(recipe))
  return { kind: 'recipe', uid: targetUid, recipe, isDiscovered }
}

const findAndRemoveItem = (state: GameState, definitionId: string): boolean => {
  const item = findItemByDefinition(state.backpack, definitionId)
  if (item) {
    removeItem(state.backpack, item.uid)
    return true
  }
  return false
}

export const combineBeeAndClover = (state: GameState): boolean => {
  const hasBee = containerHasItem(state.backpack, 'bee')
  const hasClover = containerHasItem(state.backpack, 'clover')

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
