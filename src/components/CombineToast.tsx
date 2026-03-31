import { INVENTORY_CELL_SIZE } from '@/engine/constants'
import type { DragState } from '@/engine/drag'
import type { GameState } from '@/engine/types'

interface CombineToastData {
  header: string
  description: string | null
}

interface LivePreview {
  header: string
  description: string | null
}

interface CombineToastProps {
  combineToast: CombineToastData | null
  livePreview: LivePreview | null
  dragState: DragState | null
  state: GameState
  onClose: () => void
  onHoverStart: () => void
  onHoverEnd: () => void
}

export const CombineToast = ({
  combineToast,
  livePreview,
  dragState,
  state,
  onClose,
  onHoverStart,
  onHoverEnd,
}: CombineToastProps) => {
  const showToast = livePreview !== null || combineToast !== null
  if (!showToast) return null

  let toastTopPx = 0
  if (dragState?.combineTarget) {
    const targetItem = state.backpack.items.find(i => i.uid === dragState.combineTarget?.uid)
    const minY = Math.min(dragState.previewY, targetItem?.gridY ?? dragState.previewY)
    toastTopPx = minY * INVENTORY_CELL_SIZE
  }

  return (
    <div
      className="pointer-events-auto absolute left-full z-20 font-mono text-xs"
      style={{ top: toastTopPx }}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
    >
      <div className="bg-black/85 px-4 py-3" style={{ color: '#ff69b4' }}>
        {livePreview ? (
          <>
            <div className="mb-2 whitespace-nowrap">{livePreview.header}</div>
            {livePreview.description && (
              <pre className="font-mono text-xs whitespace-pre">{livePreview.description}</pre>
            )}
          </>
        ) : combineToast ? (
          <>
            <div className="mb-2 flex items-start justify-between gap-4 whitespace-nowrap">
              <span>{combineToast.header}</span>
              <button type="button" className="hover:text-text shrink-0" style={{ color: '#ff69b4' }} onClick={onClose}>
                x
              </button>
            </div>
            <pre className="font-mono text-xs whitespace-pre">{combineToast.description}</pre>
          </>
        ) : null}
      </div>
    </div>
  )
}

export type { CombineToastData, LivePreview }
