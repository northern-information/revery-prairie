import { checkCombine } from './combine'
import { spawnPickupBloom } from './effects'
import { triggerStewardSeal } from './interaction'
import { canPlace, removeItem } from './inventory'
import { recordDiscovery } from './manual'
import { isStewardSealRecipe, recipeKey } from './recipes'

import type { Recipe } from './recipes'
import type { Container, GameState, ItemInstance } from './types'

export interface DragState {
  item: ItemInstance
  sourceContainerId: string
  targetContainerId: string
  previewX: number
  previewY: number
  isValid: boolean
  combineTarget: { uid: string; recipe: Recipe; isDiscovered: boolean } | null
  cannotCombine: boolean
  actionBarTarget: { slotIndex: number } | null
}

export interface PlacementPreview {
  isValid: boolean
  combineTarget: DragState['combineTarget']
  cannotCombine: boolean
}

export const computePlacementPreview = (
  container: Container,
  item: ItemInstance,
  gridX: number,
  gridY: number,
  sourceContainerId: string,
  targetContainerId: string,
  discoveredRecipes: Set<string>
): PlacementPreview => {
  const isValid = canPlace(
    container,
    item.definitionId,
    gridX,
    gridY,
    targetContainerId === sourceContainerId ? item.uid : undefined
  )

  let combineTarget: DragState['combineTarget'] = null
  let cannotCombine = false

  if (!isValid) {
    const result = checkCombine(
      container,
      item,
      gridX,
      gridY,
      sourceContainerId,
      targetContainerId,
      discoveredRecipes
    )
    if (result.kind === 'no-recipe') {
      cannotCombine = true
    } else if (result.kind === 'recipe') {
      combineTarget = {
        uid: result.uid,
        recipe: result.recipe,
        isDiscovered: result.isDiscovered,
      }
    }
  }

  return { isValid, combineTarget, cannotCombine }
}

export type CombineResult = { outcome: 'success' } | { outcome: 'failed' }

export const executeCombine = (
  state: GameState,
  sourceContainer: Container,
  targetContainer: Container,
  draggedItem: ItemInstance,
  combineTarget: { uid: string; recipe: Recipe },
  time?: number
): CombineResult => {
  const recipe = combineTarget.recipe
  const key = recipeKey(recipe)
  const success = recipe.execute(state)
  if (!success) return { outcome: 'failed' }

  if (isStewardSealRecipe(recipe)) {
    triggerStewardSeal(state, time ?? performance.now())
  }

  state.discoveredRecipes.add(key)
  recordDiscovery(state, `recipe:${key}`)

  removeItem(sourceContainer, draggedItem.uid)
  const targetItem = targetContainer.items.find(i => i.uid === combineTarget.uid)
  if (targetItem) {
    removeItem(targetContainer, combineTarget.uid)
  }

  if (time !== undefined) {
    spawnPickupBloom(state, state.player.x, state.player.y, time)
  }

  return { outcome: 'success' }
}
