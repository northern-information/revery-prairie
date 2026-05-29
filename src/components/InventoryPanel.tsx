import { useCallback, useEffect, useMemo, useRef } from 'react'
import { InHandSlot } from './InHandSlot'
import { InventoryGrid } from './InventoryGrid'

import { autoSort } from '@/engine/inventory'
import { RecipeKind } from '@/engine/recipes'
import { playClick, playHover } from '@/engine/sfx'
import { useCanvasDrop } from '@/hooks/useCanvasDrop'
import { useInventoryDrag } from '@/hooks/useInventoryDrag'
import type { ItemInfoHandle } from './ItemInfo'
import type { DragState } from '@/engine/drag'
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
  metricsRef: React.RefObject<CharMetrics | null>
  isDraggingRef: React.RefObject<boolean>
  dragOverlayRef: React.RefObject<DragOverlayData | null>
}

export const InventoryPanel = ({
  state,
  refreshUI,
  itemInfoRef,
  metricsRef,
  isDraggingRef,
  dragOverlayRef,
}: InventoryPanelProps) => {
  const containers = useMemo(() => [{ id: state.backpack.id, container: state.backpack }], [state.backpack])

  const onDrop = useCallback(() => {
    refreshUI()
    itemInfoRef.current?.setDragging(false)
  }, [refreshUI, itemInfoRef])

  const { dragState, startDrag, updatePreview, drop, cancelDrag } = useInventoryDrag({
    containers,
    state,
    onDrop,
  })

  isDraggingRef.current = dragState !== null

  // Combine preview on map
  const combinePreviewRef = useRef<
    | ((s: GameState, t: number) => { pos: { x: number; y: number }; char: string; color: string; isValid: boolean }[])
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

  const clearCursorInfo = () => {
    state.cursorScreenPos = null
    state.cursorTile = null
  }

  return (
    <div
      data-panel="inventory"
      className="text-text pointer-events-auto relative flex items-start gap-3 overflow-hidden font-mono text-xs"
      onMouseEnter={clearCursorInfo}
      onMouseMove={clearCursorInfo}
    >
      <InHandSlot
        state={state}
        dragState={dragState}
        refreshUI={refreshUI}
        cancelDrag={cancelDrag}
        startDrag={startDrag}
        itemInfoRef={itemInfoRef}
      />
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-muted text-xs">Backpack</div>
          <button
            type="button"
            className="text-dim hover:text-pink px-1 text-left focus:outline-none"
            onClick={() => {
              playClick()
              autoSort(state.backpack)
              refreshUI()
            }}
            onMouseEnter={playHover}
          >
            sort
          </button>
        </div>
        <InventoryGrid
          container={state.backpack}
          containerId={state.backpack.id}
          dragState={dragState}
          onStartDrag={handleStartDrag}
          onUpdatePreview={updatePreview}
          onDrop={drop}
          itemInfoRef={itemInfoRef}
          glintingCoins={state.glintingCoins}
          coinGlintPopTimes={state.coinGlintPopTimes}
          equippedItemUid={state.equippedItemUid}
        />
      </div>
    </div>
  )
}
