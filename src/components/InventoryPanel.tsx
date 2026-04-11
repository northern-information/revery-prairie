import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { InventoryGrid } from './InventoryGrid'
import { CloseButton, PanelTitle, SectionHeader } from './PanelPrimitives'

import { ComponentType } from '@/engine/ecs/types'
import { autoSort, findFitPosition, placeItem, removeItem } from '@/engine/inventory'
import { getDefinition } from '@/engine/items'
import { closeOmnibox, grabOmnibox, openOmnibox } from '@/engine/omnibox'
import { findFabricationRecipe, RecipeKind } from '@/engine/recipes'
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

  const totalWeight = state.backpack.items.reduce((sum, item) => {
    const def = getDefinition(item.definitionId)
    return sum + def.weight
  }, 0)

  // Fabrication zone: detect valid items during drag
  const [fabHovered, setFabHovered] = useState(false)
  const fabRecipe = dragState ? findFabricationRecipe(dragState.item.definitionId) : null
  const fabValid = fabHovered && fabRecipe !== null

  const handleFabricate = useCallback(() => {
    if (!dragState || !fabRecipe) return
    // Remove the dragged item from its source container
    const source = containers.find(c => c.id === dragState.sourceContainerId)?.container
    if (!source) return
    removeItem(source, dragState.item.uid)
    // Execute the fabrication recipe
    if (!fabRecipe.execute(state)) {
      // Recipe failed (e.g. backpack full) — put item back
      placeItem(
        source,
        dragState.item.definitionId,
        dragState.item.rotation,
        dragState.item.gridX,
        dragState.item.gridY
      )
    }
    cancelDrag()
    itemInfoRef.current?.setDragging(false)
    refreshUI()
  }, [dragState, fabRecipe, containers, state, cancelDrag, itemInfoRef, refreshUI])

  return (
    <div className="flex flex-col gap-4 font-mono text-xs">
      <div className="flex items-start gap-0">
        {/* Omnibox panel — left side */}
        {state.openContainer && (
          <div data-panel="omnibox" className="text-text pointer-events-auto relative flex flex-col gap-3 px-4 py-4">
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
              glintingCoins={state.glintingCoins}
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
                    className="text-dim hover:text-pink pointer-events-auto px-2 py-1 text-left"
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
                className="text-dim hover:text-pink pointer-events-auto px-2 py-1 text-left"
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
        <div data-panel="inventory" className="text-text pointer-events-auto relative flex flex-col gap-3 px-4 py-4">
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

      {/* Fabrication zone */}
      <SectionHeader>fabrication</SectionHeader>
      <div
        data-testid="fabrication-zone"
        className={`pointer-events-auto flex items-center justify-center border border-dashed px-4 py-3 text-center transition-colors ${
          fabValid
            ? 'border-pink text-pink'
            : dragState
              ? 'border-permacomputer text-permacomputer'
              : 'border-border-dim text-dim'
        }`}
        onMouseEnter={() => {
          setFabHovered(true)
        }}
        onMouseLeave={() => {
          setFabHovered(false)
        }}
        onMouseUp={() => {
          if (fabValid) {
            handleFabricate()
          }
        }}
      >
        {fabValid
          ? `fabricate ${fabRecipe.resultName}`
          : dragState && fabRecipe
            ? `fabricate ${fabRecipe.resultName}`
            : 'drag item here to fabricate'}
      </div>
    </div>
  )
}
