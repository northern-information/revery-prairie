import { useCallback, useEffect, useState } from 'react'

import {
  computeGhostPlacement,
  computeRotation,
  executeCombine,
  executeStoreInOmnibox,
  isOmniboxSelfDrop,
} from '@/engine/drag'
import { moveItem, transferItem } from '@/engine/inventory'
import type { Recipe } from '@/engine/recipes'
import type { Container, GameState, ItemInstance } from '@/engine/types'

export type { DragState } from '@/engine/drag'

import type { DragState } from '@/engine/drag'

interface UseInventoryDragOptions {
  containers: { id: string; container: Container }[]
  state: GameState
  onDrop: () => void
  onCombine: (recipe: Recipe) => void
  onStore: (omniboxUid: string) => void
  onStoreFail: () => void
  onCombineFail: () => void
}

export const useInventoryDrag = ({
  containers,
  state,
  onDrop,
  onCombine,
  onStore,
  onStoreFail,
  onCombineFail,
}: UseInventoryDragOptions) => {
  const [dragState, setDragState] = useState<DragState | null>(null)

  const getContainer = useCallback(
    (id: string) => containers.find((c) => c.id === id)?.container ?? null,
    [containers],
  )

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
      setDragState((prev) => {
        if (!prev) return null
        const container = getContainer(targetContainerId)
        if (!container) return prev

        const placement = computeGhostPlacement(
          container,
          prev.item,
          prev.rotation,
          gridX,
          gridY,
          prev.sourceContainerId,
          targetContainerId,
          state.discoveredRecipes,
        )

        return {
          ...prev,
          targetContainerId,
          ghostX: gridX,
          ghostY: gridY,
          ...placement,
        }
      })
    },
    [getContainer, state.discoveredRecipes],
  )

  const drop = useCallback(
    (targetContainerId: string) => {
      if (!dragState) return

      // Handle store-in-omnibox
      if (dragState.storeTarget) {
        const sourceContainer = getContainer(dragState.sourceContainerId)
        if (sourceContainer) {
          const result = executeStoreInOmnibox(
            sourceContainer,
            dragState.item,
            dragState.storeTarget.omniboxUid,
            state.omniboxContainers,
          )
          if (result.outcome === 'stored') {
            onStore(result.omniboxUid)
            setDragState(null)
            onDrop()
            return
          }
          if (result.outcome === 'no-room') {
            onStoreFail()
          }
        }
        setDragState(null)
        return
      }

      // Handle combine
      if (dragState.combineTarget) {
        const sourceContainer = getContainer(dragState.sourceContainerId)
        const targetContainer = getContainer(targetContainerId)
        if (sourceContainer && targetContainer) {
          const result = executeCombine(
            state,
            sourceContainer,
            targetContainer,
            dragState.item,
            dragState.combineTarget,
          )
          if (result.outcome === 'success') {
            onCombine(dragState.combineTarget.recipe)
            setDragState(null)
            onDrop()
            return
          }
          onCombineFail()
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

      if (isOmniboxSelfDrop(dragState.item, targetContainerId)) {
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
          dragState.rotation,
        )
      }

      setDragState(null)
      onDrop()
    },
    [dragState, getContainer, onDrop, onCombine, onCombineFail, onStore, onStoreFail, state],
  )

  const cancelDrag = useCallback(() => {
    setDragState(null)
  }, [])

  const rotateDrag = useCallback(() => {
    setDragState((prev) => {
      if (!prev) return null
      const container = containers.find((c) => c.id === prev.sourceContainerId)?.container ?? null
      const result = computeRotation(container, prev.item, prev.rotation, prev.ghostX, prev.ghostY)

      return {
        ...prev,
        rotation: result.rotation,
        ghostX: result.ghostX,
        ghostY: result.ghostY,
        isValid: result.isValid,
        combineTarget: null,
        storeTarget: null,
        cannotCombine: false,
      }
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
