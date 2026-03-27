import { checkCombine } from './combine'
import { canPlace, findFitPosition, getRotatedShape, placeItem, removeItem } from './inventory'
import { getDefinition } from './items'
import { recipeKey } from './recipes'
import { Rotation } from './types'

import type { Recipe } from './recipes'
import type { Container, GameState, ItemInstance } from './types'

export interface DragState {
  item: ItemInstance
  sourceContainerId: string
  targetContainerId: string
  rotation: Rotation
  ghostX: number
  ghostY: number
  isValid: boolean
  combineTarget: { uid: string; recipe: Recipe; isDiscovered: boolean } | null
  storeTarget: { omniboxUid: string } | null
  cannotCombine: boolean
}

export const NEXT_ROTATION: Record<Rotation, Rotation> = {
  [Rotation.R0]: Rotation.R90,
  [Rotation.R90]: Rotation.R180,
  [Rotation.R180]: Rotation.R270,
  [Rotation.R270]: Rotation.R0,
}

export const isOmniboxSelfDrop = (item: ItemInstance, targetContainerId: string): boolean =>
  item.definitionId === 'omnibox' && targetContainerId === item.uid

export interface GhostPlacement {
  isValid: boolean
  combineTarget: DragState['combineTarget']
  storeTarget: DragState['storeTarget']
  cannotCombine: boolean
}

export const computeGhostPlacement = (
  container: Container,
  item: ItemInstance,
  rotation: Rotation,
  gridX: number,
  gridY: number,
  sourceContainerId: string,
  targetContainerId: string,
  discoveredRecipes: Set<string>,
): GhostPlacement => {
  const selfDrop = isOmniboxSelfDrop(item, targetContainerId)

  const isValid =
    !selfDrop &&
    canPlace(
      container,
      item.definitionId,
      rotation,
      gridX,
      gridY,
      targetContainerId === sourceContainerId ? item.uid : undefined,
    )

  let combineTarget: DragState['combineTarget'] = null
  let storeTarget: DragState['storeTarget'] = null
  let cannotCombine = false

  if (!isValid) {
    const result = checkCombine(
      container,
      item,
      rotation,
      gridX,
      gridY,
      sourceContainerId,
      targetContainerId,
      discoveredRecipes,
    )
    if (result === 'no-recipe') {
      cannotCombine = true
    } else if (result?.kind === 'store') {
      storeTarget = { omniboxUid: result.omniboxUid }
    } else if (result?.kind === 'recipe') {
      combineTarget = {
        uid: result.uid,
        recipe: result.recipe,
        isDiscovered: result.isDiscovered,
      }
    }
  }

  return { isValid, combineTarget, storeTarget, cannotCombine }
}

export type StoreResult =
  | { outcome: 'stored'; omniboxUid: string }
  | { outcome: 'no-room' }
  | { outcome: 'no-container' }

export const executeStoreInOmnibox = (
  sourceContainer: Container,
  item: ItemInstance,
  omniboxUid: string,
  omniboxContainers: Map<string, Container>,
): StoreResult => {
  const omniboxContainer = omniboxContainers.get(omniboxUid)
  if (!omniboxContainer) return { outcome: 'no-container' }

  const fit = findFitPosition(omniboxContainer, item.definitionId)
  if (!fit) return { outcome: 'no-room' }

  removeItem(sourceContainer, item.uid)
  placeItem(omniboxContainer, item.definitionId, fit.rotation, fit.gridX, fit.gridY)
  return { outcome: 'stored', omniboxUid }
}

export type CombineResult = { outcome: 'success' } | { outcome: 'failed' }

export const executeCombine = (
  state: GameState,
  sourceContainer: Container,
  targetContainer: Container,
  draggedItem: ItemInstance,
  combineTarget: { uid: string; recipe: Recipe },
): CombineResult => {
  const recipe = combineTarget.recipe
  const key = recipeKey(recipe)
  const success = recipe.execute(state)
  if (!success) return { outcome: 'failed' }

  state.discoveredRecipes.add(key)

  if (draggedItem.definitionId !== recipe.preserveIngredient) {
    removeItem(sourceContainer, draggedItem.uid)
  }
  const targetItem = targetContainer.items.find((i) => i.uid === combineTarget.uid)
  if (targetItem?.definitionId !== recipe.preserveIngredient) {
    removeItem(targetContainer, combineTarget.uid)
  }

  return { outcome: 'success' }
}

export interface RotationResult {
  rotation: Rotation
  ghostX: number
  ghostY: number
  isValid: boolean
}

export const computeRotation = (
  container: Container | null,
  item: ItemInstance,
  currentRotation: Rotation,
  ghostX: number,
  ghostY: number,
): RotationResult => {
  const newRotation = NEXT_ROTATION[currentRotation]
  const def = getDefinition(item.definitionId)
  const shape = getRotatedShape(def.shape, newRotation)
  const sw = shape[0]?.length ?? 0
  const sh = shape.length

  if (!container) {
    return { rotation: newRotation, ghostX, ghostY, isValid: false }
  }

  const clampedX = Math.min(ghostX, Math.max(0, container.width - sw))
  const clampedY = Math.min(ghostY, Math.max(0, container.height - sh))
  const isValid = canPlace(container, item.definitionId, newRotation, clampedX, clampedY, item.uid)

  return { rotation: newRotation, ghostX: clampedX, ghostY: clampedY, isValid }
}
