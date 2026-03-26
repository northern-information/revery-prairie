import { buildOccupancyGrid, getRotatedShape } from './inventory'
import { getDefinition } from './items'
import { findRecipe, recipeKey } from './recipes'

import type { Recipe } from './recipes'
import type { Container, ItemInstance, Rotation } from './types'

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
