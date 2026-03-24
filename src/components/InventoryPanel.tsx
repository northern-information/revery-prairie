import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CombineToast } from './CombineToast'
import { DragCursor } from './DragCursor'
import { InventoryGrid } from './InventoryGrid'

import { autoSort } from '@/engine/inventory'
import { getDefinition } from '@/engine/items'
import { RecipeKind } from '@/engine/recipes'
import { useCanvasDrop } from '@/hooks/useCanvasDrop'
import { useInventoryDrag } from '@/hooks/useInventoryDrag'
import type { CombineToastData, LivePreview } from './CombineToast'
import type { ItemInfoHandle } from './ItemInfo'
import type { Recipe } from '@/engine/recipes'
import type { CharMetrics } from '@/engine/renderer'
import type { GameState } from '@/engine/types'

const COMBINE_TOAST_DURATION = 8000

interface InventoryPanelProps {
  state: GameState
  refreshUI: () => void
  itemInfoRef: React.RefObject<ItemInfoHandle | null>
  onCombineLog: (text: string, worldX: number, worldY: number) => void
  onDropLog: (definitionId: string, worldX: number, worldY: number) => void
  metricsRef: React.RefObject<CharMetrics | null>
  isDraggingRef: React.RefObject<boolean>
  onClose: () => void
}

export const InventoryPanel = ({
  state,
  refreshUI,
  itemInfoRef,
  onCombineLog,
  onDropLog,
  metricsRef,
  isDraggingRef,
  onClose,
}: InventoryPanelProps) => {
  const [combineToast, setCombineToast] = useState<CombineToastData | null>(null)
  const isHoveringToast = useRef(false)
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleFade = useCallback(() => {
    if (fadeTimer.current) clearTimeout(fadeTimer.current)
    fadeTimer.current = setTimeout(() => {
      if (!isHoveringToast.current) {
        setCombineToast(null)
      }
    }, COMBINE_TOAST_DURATION)
  }, [])

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
      const header = `${nameA} + ${nameB} = ${recipe.resultName}`
      setCombineToast({ header, description: recipe.description })
      scheduleFade()
      onCombineLog(header, state.player.x, state.player.y)
    },
    [scheduleFade, onCombineLog, state]
  )

  const { dragState, startDrag, updateGhost, drop, cancelDrag } = useInventoryDrag({
    containers,
    state,
    onDrop,
    onCombine,
  })

  isDraggingRef.current = dragState !== null

  // Combine preview on map
  const combinePreviewRef = useRef<
    ((s: GameState) => { pos: { x: number; y: number }; char: string; color: string }[]) | null
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
      itemInfoRef.current?.show(item.definitionId)
      itemInfoRef.current?.setDragging(true)
    },
    [containers, startDrag, itemInfoRef]
  )

  const handleMouseUp = useCallback(() => {
    if (dragState) {
      cancelDrag()
      itemInfoRef.current?.setDragging(false)
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

  const totalWeight = state.backpack.items.reduce((sum, item) => {
    const def = getDefinition(item.definitionId)
    return sum + def.weight
  }, 0)

  const livePreview: LivePreview | null = dragState?.cannotCombine
    ? { header: 'cannot combine', description: null }
    : dragState?.combineTarget
      ? (() => {
          const recipe = dragState.combineTarget.recipe
          const [a, b] = recipe.ingredients
          const nameA = getDefinition(a).name.toLowerCase()
          const nameB = getDefinition(b).name.toLowerCase()
          const result = dragState.combineTarget.isDiscovered ? recipe.resultName : '???'
          return {
            header: `${nameA} + ${nameB} = ${result}`,
            description: dragState.combineTarget.isDiscovered ? recipe.description : null,
          }
        })()
      : null

  return (
    <div
      data-panel="inventory"
      className="text-text pointer-events-auto fixed top-0 right-48 z-10 flex h-full flex-col gap-4 bg-black/70 px-4 py-4 font-mono text-xs"
      onMouseUp={handleMouseUp}
    >
      <div className="border-border-dim flex items-baseline justify-between border-b pb-3 text-sm">
        <span>inventory</span>
        <button type="button" className="text-dim hover:text-text pointer-events-auto" onClick={onClose}>
          x
        </button>
      </div>

      <div>
        <div className="border-border-dim text-muted mb-3 flex items-baseline justify-between border-b pb-2">
          <span>backpack</span>
          <span className="text-dim">{totalWeight}w</span>
        </div>
        <div className="relative inline-block">
          <InventoryGrid
            container={state.backpack}
            containerId={state.backpack.id}
            dragState={dragState}
            onStartDrag={handleStartDrag}
            onUpdateGhost={updateGhost}
            onDrop={drop}
            itemInfoRef={itemInfoRef}
          />

          <CombineToast
            combineToast={combineToast}
            livePreview={livePreview}
            dragState={dragState}
            state={state}
            onClose={() => {
              setCombineToast(null)
              if (fadeTimer.current) clearTimeout(fadeTimer.current)
            }}
            onHoverStart={() => {
              isHoveringToast.current = true
              if (fadeTimer.current) clearTimeout(fadeTimer.current)
            }}
            onHoverEnd={() => {
              isHoveringToast.current = false
              if (combineToast) scheduleFade()
            }}
          />
        </div>
      </div>

      {state.openContainer && (
        <div>
          <div className="border-border-dim text-muted mb-3 border-b pb-2">
            {state.openContainer.name.toLowerCase()}
          </div>
          <InventoryGrid
            container={state.openContainer}
            containerId={state.openContainer.id}
            dragState={dragState}
            onStartDrag={handleStartDrag}
            onUpdateGhost={updateGhost}
            onDrop={drop}
            itemInfoRef={itemInfoRef}
          />
        </div>
      )}

      <div className="text-dim flex flex-col gap-1">
        <span>[x] drop</span>
        <span>[r]otate</span>
        <button
          type="button"
          className="text-dim hover:text-text pointer-events-auto text-left"
          onClick={() => {
            autoSort(state.backpack)
            refreshUI()
          }}
        >
          sort
        </button>
      </div>

      {dragState && cursorPos && (
        <DragCursor
          dragState={dragState}
          cursorPos={cursorPos}
          cursorTarget={cursorTarget}
          canvasRect={canvasRect}
          metricsRef={metricsRef}
        />
      )}
    </div>
  )
}
