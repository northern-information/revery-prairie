import { useCallback, useEffect, useState } from 'react'

import {
  buildOccupancyGrid,
  canPlace,
  findFitPosition,
  getRotatedShape,
  moveItem,
  placeItem,
  removeItem,
  transferItem,
} from '@/engine/inventory'
import { getDefinition } from '@/engine/items'
import { findRecipe, recipeKey } from '@/engine/recipes'
import { Rotation } from '@/engine/types'
import type { Recipe } from '@/engine/recipes'
import type { Container, GameState, ItemInstance } from '@/engine/types'

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

interface UseInventoryDragOptions {
  containers: { id: string; container: Container }[]
  state: GameState
  onDrop: () => void
  onCombine: (recipe: Recipe) => void
  onStore: (omniboxUid: string) => void
  onStoreFail: () => void
}

const NEXT_ROTATION: Record<Rotation, Rotation> = {
  [Rotation.R0]: Rotation.R90,
  [Rotation.R90]: Rotation.R180,
  [Rotation.R180]: Rotation.R270,
  [Rotation.R270]: Rotation.R0,
}

const checkCombine = (
  container: Container,
  draggedItem: ItemInstance,
  rotation: Rotation,
  gridX: number,
  gridY: number,
  sourceContainerId: string,
  containerId: string,
  discoveredRecipes: Set<string>
):
  | { kind: 'recipe'; uid: string; recipe: Recipe; isDiscovered: boolean }
  | { kind: 'store'; omniboxUid: string }
  | 'no-recipe'
  | null => {
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

export const useInventoryDrag = ({
  containers,
  state,
  onDrop,
  onCombine,
  onStore,
  onStoreFail,
}: UseInventoryDragOptions) => {
  const [dragState, setDragState] = useState<DragState | null>(null)

  const getContainer = useCallback((id: string) => containers.find(c => c.id === id)?.container ?? null, [containers])

  const startDrag = useCallback((item: ItemInstance, containerId: string) => {
    setDragState({
      item,
      sourceContainerId: containerId,
      targetContainerId: containerId,
      rotation: item.rotation,
      ghostX: item.gridX,
      ghostY: item.gridY,
      isValid: true,
      combineTarget: null,
      storeTarget: null,
      cannotCombine: false,
    })
  }, [])

  const updateGhost = useCallback(
    (gridX: number, gridY: number, targetContainerId: string) => {
      setDragState(prev => {
        if (!prev) return null
        const container = getContainer(targetContainerId)
        if (!container) return prev

        // Prevent placing an omnibox inside its own container
        const selfDrop = prev.item.definitionId === 'omnibox' && targetContainerId === prev.item.uid

        const valid =
          !selfDrop &&
          canPlace(
            container,
            prev.item.definitionId,
            prev.rotation,
            gridX,
            gridY,
            targetContainerId === prev.sourceContainerId ? prev.item.uid : undefined
          )

        let combineTarget: DragState['combineTarget'] = null
        let storeTarget: DragState['storeTarget'] = null
        let cannotCombine = false
        if (!valid) {
          const result = checkCombine(
            container,
            prev.item,
            prev.rotation,
            gridX,
            gridY,
            prev.sourceContainerId,
            targetContainerId,
            state.discoveredRecipes
          )
          if (result === 'no-recipe') {
            cannotCombine = true
          } else if (result?.kind === 'store') {
            storeTarget = { omniboxUid: result.omniboxUid }
          } else if (result?.kind === 'recipe') {
            combineTarget = { uid: result.uid, recipe: result.recipe, isDiscovered: result.isDiscovered }
          }
        }

        return {
          ...prev,
          targetContainerId,
          ghostX: gridX,
          ghostY: gridY,
          isValid: valid,
          combineTarget,
          storeTarget,
          cannotCombine,
        }
      })
    },
    [getContainer, state.discoveredRecipes]
  )

  const drop = useCallback(
    (targetContainerId: string) => {
      if (!dragState) return

      // Handle store-in-omnibox
      if (dragState.storeTarget) {
        const omniboxContainer = state.omniboxContainers.get(dragState.storeTarget.omniboxUid)
        if (omniboxContainer) {
          const fit = findFitPosition(omniboxContainer, dragState.item.definitionId)
          if (fit) {
            const sourceContainer = getContainer(dragState.sourceContainerId)
            if (sourceContainer) {
              removeItem(sourceContainer, dragState.item.uid)
              placeItem(omniboxContainer, dragState.item.definitionId, fit.rotation, fit.gridX, fit.gridY)
              onStore(dragState.storeTarget.omniboxUid)
              setDragState(null)
              onDrop()
              return
            }
          } else {
            onStoreFail()
          }
        }
        setDragState(null)
        return
      }

      // Handle combine
      if (dragState.combineTarget) {
        const container = getContainer(targetContainerId)
        if (container) {
          const recipe = dragState.combineTarget.recipe
          const key = recipeKey(recipe)
          const success = recipe.execute(state)
          if (success) {
            state.discoveredRecipes.add(key)
            // Remove items unless preserved by recipe
            if (dragState.item.definitionId !== recipe.preserveIngredient) {
              const sourceContainer = getContainer(dragState.sourceContainerId)
              if (sourceContainer) {
                removeItem(sourceContainer, dragState.item.uid)
              }
            }
            const targetItem = container.items.find(i => i.uid === dragState.combineTarget?.uid)
            if (targetItem?.definitionId !== recipe.preserveIngredient) {
              removeItem(container, dragState.combineTarget.uid)
            }
            onCombine(recipe)
            setDragState(null)
            onDrop()
            return
          }
        }
        setDragState(null)
        return
      }

      const sourceContainer = getContainer(dragState.sourceContainerId)
      const targetContainer = getContainer(targetContainerId)
      if (!sourceContainer || !targetContainer) {
        setDragState(null)
        return
      }

      // Prevent placing an omnibox inside its own container
      if (dragState.item.definitionId === 'omnibox' && targetContainerId === dragState.item.uid) {
        setDragState(null)
        return
      }

      if (dragState.sourceContainerId === targetContainerId) {
        moveItem(sourceContainer, dragState.item.uid, dragState.ghostX, dragState.ghostY, dragState.rotation)
      } else {
        transferItem(
          sourceContainer,
          targetContainer,
          dragState.item.uid,
          dragState.ghostX,
          dragState.ghostY,
          dragState.rotation
        )
      }

      setDragState(null)
      onDrop()
    },
    [dragState, getContainer, onDrop, onCombine, onStore, onStoreFail, state]
  )

  const cancelDrag = useCallback(() => {
    setDragState(null)
  }, [])

  const rotateDrag = useCallback(() => {
    setDragState(prev => {
      if (!prev) return null
      const newRotation = NEXT_ROTATION[prev.rotation]
      const def = getDefinition(prev.item.definitionId)
      const shape = getRotatedShape(def.shape, newRotation)
      const sw = shape[0]?.length ?? 0
      const sh = shape.length

      const container = containers.find(c => c.id === prev.sourceContainerId)?.container ?? null

      let isValid = false
      if (container) {
        const clampedX = Math.min(prev.ghostX, Math.max(0, container.width - sw))
        const clampedY = Math.min(prev.ghostY, Math.max(0, container.height - sh))
        isValid = canPlace(container, prev.item.definitionId, newRotation, clampedX, clampedY, prev.item.uid)
        return {
          ...prev,
          rotation: newRotation,
          ghostX: clampedX,
          ghostY: clampedY,
          isValid,
          combineTarget: null,
          storeTarget: null,
          cannotCombine: false,
        }
      }

      return { ...prev, rotation: newRotation, isValid, combineTarget: null, storeTarget: null, cannotCombine: false }
    })
  }, [containers])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!dragState) return
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        e.stopPropagation()
        rotateDrag()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        cancelDrag()
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [dragState, rotateDrag, cancelDrag])

  return {
    dragState,
    startDrag,
    updateGhost,
    drop,
    cancelDrag,
  }
}
