import { INVENTORY_CELL_SIZE } from '@/engine/constants'
import { getInHandItem, releaseInHand, takeInHand } from '@/engine/inHand'
import { getDefinition } from '@/engine/items'
import { isPlaceable } from '@/engine/placeable'
import { playClick, playHover } from '@/engine/sfx'
import { SectionHeader } from './PanelPrimitives'
import type { ItemInfoHandle } from './ItemInfo'
import type { DragState } from '@/engine/drag'
import type { GameState, ItemInstance } from '@/engine/types'

// RP-59 — the hand declares, the bag holds. A single cell sized like a 3x3
// block of backpack cells, to the left of the backpack. It shows the item the
// steward is carrying with intent (in hand), ready to place with left-click.
// In-hand is a reference into the backpack, never a move — the item keeps its
// grid cell (rendered dimmed) and also reads here, scaled up, in hot pink.
const SLOT_PX = INVENTORY_CELL_SIZE * 3

interface InHandSlotProps {
  state: GameState
  dragState: DragState | null
  refreshUI: () => void
  cancelDrag: () => void
  startDrag: (item: ItemInstance, containerId: string) => void
  itemInfoRef: React.RefObject<ItemInfoHandle | null>
}

export const InHandSlot = ({
  state,
  dragState,
  refreshUI,
  cancelDrag,
  startDrag,
  itemInfoRef,
}: InHandSlotProps) => {
  const inHand = getInHandItem(state)
  const def = inHand ? getDefinition(inHand.definitionId) : null

  // Take in hand: release the slot's mouseup while dragging a placeable item.
  // The dragged item stays in the backpack; in-hand is a reference to its uid.
  const handleMouseUp = () => {
    if (!dragState) return
    if (!isPlaceable(dragState.item.definitionId)) {
      // Not placeable — leave the drag for the grid/canvas to resolve.
      return
    }
    takeInHand(state, dragState.item.uid)
    cancelDrag()
    itemInfoRef.current?.setDragging(false)
    playClick()
    refreshUI()
  }

  // Grab from hand: mousedown on the loaded slot releases the hand and begins a
  // normal backpack drag of the same item (it has a real gridX/gridY). Dropping
  // repositions it; cancel leaves it put. Either way the hand is already empty.
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !inHand) return
    e.preventDefault()
    releaseInHand(state)
    startDrag(inHand, state.backpack.id)
    itemInfoRef.current?.show(inHand.definitionId, inHand.uid)
    itemInfoRef.current?.setDragging(true)
    refreshUI()
  }

  // Hovering the in-hand item populates the ItemInfo panel, mirroring backpack
  // hover. Suppressed during a drag so the dragged item's info isn't clobbered.
  const handleMouseEnter = () => {
    if (dragState || !inHand) return
    itemInfoRef.current?.show(inHand.definitionId, inHand.uid)
    playHover()
  }

  const handleMouseLeave = () => {
    if (dragState) return
    itemInfoRef.current?.clear()
  }

  return (
    <div className="flex flex-col gap-2" data-panel="in-hand">
      <SectionHeader className="mb-0 border-b-0 pb-0">In Hand</SectionHeader>
      <div
        data-testid="in-hand-slot"
        className="border-grid-border flex items-center justify-center border font-mono select-none"
        style={{ width: SLOT_PX, height: SLOT_PX }}
        onMouseUp={handleMouseUp}
        onMouseDown={handleMouseDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {def && inHand ? (
          <span className="leading-none" style={{ color: 'var(--color-pink)', fontSize: INVENTORY_CELL_SIZE * 1.6 }}>
            {def.glyph}
          </span>
        ) : (
          <span className="text-dim text-xs">Empty</span>
        )}
      </div>
      {def ? (
        <div className="text-center text-xs" style={{ color: 'var(--color-pink)' }}>
          {def.name}
        </div>
      ) : (
        <div className="text-dim text-center text-xs">Drag to Hold</div>
      )}
    </div>
  )
}
