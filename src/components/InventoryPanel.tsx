import { useCallback, useEffect, useMemo, useRef } from 'react'
import { InventoryGrid } from './InventoryGrid'
import { SectionHeader } from './PanelPrimitives'

import { autoSort } from '@/engine/inventory'
import { getDefinition } from '@/engine/items'
import { RecipeKind } from '@/engine/recipes'
import { useCanvasDrop } from '@/hooks/useCanvasDrop'
import { useInventoryDrag } from '@/hooks/useInventoryDrag'
import type { ItemInfoHandle } from './ItemInfo'
import type { DragState } from '@/engine/drag'
import type { Recipe } from '@/engine/recipes'
import type { CharMetrics, GameState } from '@/engine/types'

export interface DragOverlayData {
  dragState: DragState
  cursorPos: { x: number; y: number }
  cursorTarget: 'canvas' | 'other'
  canvasRect: DOMRect | null
}

interface InventoryPanelProps {
  state: GameState
  refreshUI: () => void
  itemInfoRef: React.RefObject<ItemInfoHandle | null>
  onCombineLog: (text: string, worldX: number, worldY: number) => void
  onDropLog: (definitionId: string, worldX: number, worldY: number) => void
  metricsRef: React.RefObject<CharMetrics | null>
  isDraggingRef: React.RefObject<boolean>
  dragOverlayRef: React.RefObject<DragOverlayData | null>
}

export const InventoryPanel = ({
  state,
  refreshUI,
  itemInfoRef,
  onCombineLog,
  onDropLog,
  metricsRef,
  isDraggingRef,
  dragOverlayRef,
}: InventoryPanelProps) => {
  const containers = useMemo(() => {
    const list = [{ id: state.backpack.id, container: state.backpack }]
    if (state.openContainer) {
      list.push({ id: state.openContainer.id, container: state.openContainer })
    }
    return list
  }, [state.backpack, state.openContainer])

  const onDrop = useCallback(() => {
    refreshUI()
    itemInfoRef.current?.setDragging(false)
  }, [refreshUI, itemInfoRef])

  const onCombine = useCallback(
    (recipe: Recipe) => {
      const [a, b] = recipe.ingredients
      const nameA = getDefinition(a).name.toLowerCase()
      const nameB = getDefinition(b).name.toLowerCase()
      const capitalized = nameA.charAt(0).toUpperCase() + nameA.slice(1)
      const header = `${capitalized} + ${nameB} = ${recipe.resultName}.`
      onCombineLog(header, state.player.x, state.player.y)
    },
    [onCombineLog, state]
  )

  const { dragState, startDrag, updatePreview, drop, cancelDrag } = useInventoryDrag({
    containers,
    state,
    onDrop,
    onCombine,
  })

  isDraggingRef.current = dragState !== null

  // Combine preview on map
  const combinePreviewRef = useRef<
    | ((
        s: GameState,
        t: number
      ) => { pos: { x: number; y: number }; char: string; color: string; isValid: boolean }[])
    | null
  >(null)
  useEffect(() => {
    const target = dragState?.combineTarget
    if (target?.isDiscovered && target.recipe.kind === RecipeKind.Macro && target.recipe.preview) {
      combinePreviewRef.current = target.recipe.preview
      state.previewFn = target.recipe.preview
    } else {
      if (state.previewFn === combinePreviewRef.current) {
        state.previewFn = null
      }
      combinePreviewRef.current = null
    }
    return () => {
      if (state.previewFn === combinePreviewRef.current) {
        state.previewFn = null
      }
      combinePreviewRef.current = null
    }
  }, [dragState?.combineTarget, state])

  const handleStartDrag = useCallback(
    (uid: string, containerId: string) => {
      const container = containers.find(c => c.id === containerId)?.container
      if (!container) return
      const item = container.items.find(i => i.uid === uid)
      if (!item) return
      startDrag(item, containerId)
      itemInfoRef.current?.show(item.definitionId, item.uid)
      itemInfoRef.current?.setDragging(true)
    },
    [containers, startDrag, itemInfoRef]
  )

  // Global mouseUp handler for drag cancellation (window-level, not a div)
  useEffect(() => {
    const handleMouseUp = () => {
      if (dragState) {
        cancelDrag()
        itemInfoRef.current?.setDragging(false)
      }
    }
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragState, cancelDrag, itemInfoRef])

  const { cursorPos, cursorTarget, canvasRect } = useCanvasDrop({
    dragState,
    state,
    containers,
    metricsRef,
    cancelDrag,
    refreshUI,
    onDropLog,
    itemInfoRef,
  })

  // Expose drag data to GameScreen for DragCursor rendering above the shell
  dragOverlayRef.current = dragState && cursorPos ? { dragState, cursorPos, cursorTarget, canvasRect } : null

  // Clear drag overlay on unmount so GameScreen doesn't render a stale DragCursor
  useEffect(() => {
    return () => {
      dragOverlayRef.current = null
    }
  }, [dragOverlayRef])

  return (
    <div className="flex flex-col gap-4 font-mono text-xs">
      <div data-panel="inventory" className="text-text pointer-events-auto relative flex flex-col gap-3 px-4 py-4">
        <SectionHeader>Backpack</SectionHeader>

        <div className="group">
          <InventoryGrid
            container={state.backpack}
            containerId={state.backpack.id}
            dragState={dragState}
            onStartDrag={handleStartDrag}
            onUpdatePreview={updatePreview}
            onDrop={drop}
            itemInfoRef={itemInfoRef}
            glintingCoins={state.glintingCoins}
          />

          <div className="mt-2 flex flex-col gap-1">
            <button
              type="button"
              className="text-dim hover:text-pink pointer-events-auto px-2 py-1 text-left"
              onClick={() => {
                autoSort(state.backpack)
                refreshUI()
              }}
            >
              sort
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
