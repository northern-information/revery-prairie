import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { DragCursor } from './DragCursor'
import { InventoryGrid } from './InventoryGrid'
import { clampPanelPosition } from './panelPosition'
import { CloseButton, PanelTitle, SectionHeader } from './PanelPrimitives'

import { ComponentType } from '@/engine/ecs/types'
import { autoSort, findFitPosition, placeItem, removeItem } from '@/engine/inventory'
import { getDefinition } from '@/engine/items'
import { closeOmnibox, grabOmnibox, openOmnibox } from '@/engine/omnibox'
import { RecipeKind } from '@/engine/recipes'
import { useCanvasDrop } from '@/hooks/useCanvasDrop'
import { useInventoryDrag } from '@/hooks/useInventoryDrag'
import type { ItemInfoHandle } from './ItemInfo'
import type { Recipe } from '@/engine/recipes'
import type { CharMetrics, GameState } from '@/engine/types'

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
      onCombineLog(header, state.player.x, state.player.y)
    },
    [onCombineLog, state]
  )

  const onStore = useCallback(
    (omniboxUid: string) => {
      openOmnibox(state, omniboxUid)
      refreshUI()
    },
    [state, refreshUI]
  )

  const { dragState, startDrag, updatePreview, drop, cancelDrag } = useInventoryDrag({
    containers,
    state,
    onDrop,
    onCombine,
    onStore,
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
      itemInfoRef.current?.show(item.definitionId, item.uid)
      itemInfoRef.current?.setDragging(true)
    },
    [containers, startDrag, itemInfoRef]
  )

  const handleQuickTransfer = useCallback(
    (uid: string, sourceContainerId: string) => {
      if (!state.openContainer) return
      const source = containers.find(c => c.id === sourceContainerId)?.container
      if (!source) return
      const item = source.items.find(i => i.uid === uid)
      if (!item) return

      // Determine target: backpack→omnibox or omnibox→backpack
      const target = sourceContainerId === state.backpack.id ? state.openContainer : state.backpack
      const fit = findFitPosition(target, item.definitionId)
      if (!fit) return

      removeItem(source, uid)
      placeItem(target, item.definitionId, fit.rotation, fit.gridX, fit.gridY)
      refreshUI()
    },
    [state, containers, refreshUI]
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

  // Player screen position for panel anchoring
  const metrics = metricsRef.current
  const playerScreenX = metrics ? (state.player.x - state.camera.x) * metrics.charWidth : 0
  const playerScreenY = metrics ? (state.player.y - state.camera.y) * metrics.charHeight : 0

  // Measure panel container to clamp within viewport
  const panelContainerRef = useRef<HTMLDivElement | null>(null)
  const [panelSize, setPanelSize] = useState({ w: 0, h: 0 })

  const hasOmnibox = state.openContainer !== null
  useLayoutEffect(() => {
    const el = panelContainerRef.current
    if (!el) return
    const { offsetWidth, offsetHeight } = el
    setPanelSize(prev =>
      prev.w === offsetWidth && prev.h === offsetHeight ? prev : { w: offsetWidth, h: offsetHeight }
    )
  }, [hasOmnibox])

  const panelPos = metrics
    ? clampPanelPosition(
        playerScreenX,
        playerScreenY,
        metrics.charWidth,
        metrics.charHeight,
        panelSize.w,
        panelSize.h,
        window.innerWidth,
        window.innerHeight
      )
    : { left: window.innerWidth / 2, top: window.innerHeight / 2 }

  return (
    <>
      {/* Global mouseUp handler for drag cancellation */}
      <div className="pointer-events-none fixed inset-0 z-10" onMouseUp={handleMouseUp}>
        {/* Panels container — side by side, top-aligned, clamped to viewport */}
        <div
          ref={panelContainerRef}
          className="absolute z-10 flex items-start"
          style={{
            left: panelPos.left,
            top: panelPos.top,
          }}
        >
          {/* Omnibox panel — left side */}
          {state.openContainer && (
            <div
              data-panel="omnibox"
              className="text-text pointer-events-auto relative flex flex-col gap-3 bg-black/70 px-4 py-4 font-mono text-xs"
            >
              <CloseButton
                onClick={() => {
                  closeOmnibox(state)
                  refreshUI()
                }}
              />
              <PanelTitle>{state.openContainer.name.toLowerCase()}</PanelTitle>
              <InventoryGrid
                container={state.openContainer}
                containerId={state.openContainer.id}
                dragState={dragState}
                onStartDrag={handleStartDrag}
                onUpdatePreview={updatePreview}
                onDrop={drop}
                onQuickTransfer={handleQuickTransfer}
                itemInfoRef={itemInfoRef}
              />
              <div className="text-dim flex flex-col gap-1">
                {state.openContainer &&
                  state.world
                    .query(ComponentType.OmniboxLink, ComponentType.EntityTag)
                    .some(
                      eid =>
                        state.world.getComponent(eid, ComponentType.EntityTag) === 'groundOmnibox' &&
                        state.world.getComponent(eid, ComponentType.OmniboxLink)?.uid === state.openContainer?.id
                    ) && (
                    <button
                      type="button"
                      className="text-dim hover:text-text pointer-events-auto text-left"
                      onClick={() => {
                        if (!state.openContainer) return
                        const uid = grabOmnibox(state)
                        if (uid) {
                          closeOmnibox(state)
                          refreshUI()
                        }
                      }}
                    >
                      pick up
                    </button>
                  )}
                <button
                  type="button"
                  className="text-dim hover:text-text pointer-events-auto text-left"
                  onClick={() => {
                    if (state.openContainer) {
                      autoSort(state.openContainer)
                      refreshUI()
                    }
                  }}
                >
                  sort
                </button>
              </div>
            </div>
          )}

          {/* Backpack panel — right side */}
          <div
            data-panel="inventory"
            className="text-text pointer-events-auto relative flex flex-col gap-3 bg-black/70 px-4 py-4 font-mono text-xs"
          >
            <CloseButton onClick={onClose} />
            <SectionHeader className="flex items-baseline justify-between">
              <span>backpack</span>
              <span className="text-dim mr-8">{totalWeight}w</span>
            </SectionHeader>

            <div className="group">
              <InventoryGrid
                container={state.backpack}
                containerId={state.backpack.id}
                dragState={dragState}
                onStartDrag={handleStartDrag}
                onUpdatePreview={updatePreview}
                onDrop={drop}
                onQuickTransfer={state.openContainer ? handleQuickTransfer : undefined}
                itemInfoRef={itemInfoRef}
              />

              <div className="mt-2 flex flex-col gap-1">
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
            </div>
          </div>
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
    </>
  )
}
