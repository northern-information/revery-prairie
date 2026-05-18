import { useCallback, useEffect, useState } from 'react'

import { computePlacementPreview, executeCombine } from '@/engine/drag'
import { moveItem, transferItem } from '@/engine/inventory'
import type { DragState } from '@/engine/drag'
import type { Recipe } from '@/engine/recipes'
import type { Container, GameState, ItemInstance } from '@/engine/types'

export type { DragState } from '@/engine/drag'

interface UseInventoryDragOptions {
  containers: { id: string; container: Container }[]
  state: GameState
  onDrop: () => void
  onCombine: (recipe: Recipe) => void
  onCombineFail?: () => void
}

export const useInventoryDrag = ({ containers, state, onDrop, onCombine, onCombineFail }: UseInventoryDragOptions) => {
  const [dragState, setDragState] = useState<DragState | null>(null)

  const getContainer = useCallback((id: string) => containers.find(c => c.id === id)?.container ?? null, [containers])

  const startDrag = useCallback((item: ItemInstance, containerId: string) => {
    setDragState({
      item,
      sourceContainerId: containerId,
      targetContainerId: containerId,
      previewX: item.gridX,
      previewY: item.gridY,
      isValid: true,
      combineTarget: null,
      cannotCombine: false,
    })
  }, [])

  const updatePreview = useCallback(
    (gridX: number, gridY: number, targetContainerId: string) => {
      setDragState(prev => {
        if (!prev) return null
        const container = getContainer(targetContainerId)
        if (!container) return prev

        const placement = computePlacementPreview(
          container,
          prev.item,
          gridX,
          gridY,
          prev.sourceContainerId,
          targetContainerId,
          state.discoveredRecipes
        )

        return {
          ...prev,
          targetContainerId,
          previewX: gridX,
          previewY: gridY,
          ...placement,
        }
      })
    },
    [getContainer, state.discoveredRecipes]
  )

  const drop = useCallback(
    (targetContainerId: string) => {
      if (!dragState) return

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
            performance.now()
          )
          if (result.outcome === 'success') {
            onCombine(dragState.combineTarget.recipe)
            setDragState(null)
            onDrop()
            return
          }
          onCombineFail?.()
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

      if (dragState.sourceContainerId === targetContainerId) {
        moveItem(sourceContainer, dragState.item.uid, dragState.previewX, dragState.previewY)
      } else {
        transferItem(sourceContainer, targetContainer, dragState.item.uid, dragState.previewX, dragState.previewY)
      }

      setDragState(null)
      onDrop()
    },
    [dragState, getContainer, onDrop, onCombine, onCombineFail, state]
  )

  const cancelDrag = useCallback(() => {
    setDragState(null)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!dragState) return
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
  }, [dragState, cancelDrag])

  return {
    dragState,
    startDrag,
    updatePreview,
    drop,
    cancelDrag,
  }
}
