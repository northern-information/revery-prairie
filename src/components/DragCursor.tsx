import { getDefinition } from '@/engine/items'
import { screenToTile, viewportToScreen } from '@/engine/projection'
import type { DragState } from '@/engine/drag'
import type { CharMetrics } from '@/engine/types'

interface DragCursorProps {
  dragState: DragState
  cursorPos: { x: number; y: number }
  cursorTarget: 'canvas' | 'other'
  canvasRect: DOMRect | null
  metricsRef: React.RefObject<CharMetrics | null>
  viewportWidth: number
  viewportHeight: number
}

const ZERO_CAMERA = { x: 0, y: 0 } as const

export const DragCursor = ({
  dragState,
  cursorPos,
  cursorTarget,
  canvasRect,
  metricsRef,
  viewportWidth,
  viewportHeight,
}: DragCursorProps) => {
  const metrics = metricsRef.current
  const def = getDefinition(dragState.item.definitionId)

  if (metrics && cursorTarget === 'canvas' && canvasRect && viewportWidth > 0 && viewportHeight > 0) {
    const canvasX = cursorPos.x - canvasRect.left
    const canvasY = cursorPos.y - canvasRect.top
    const tile = screenToTile(
      canvasX,
      canvasY,
      ZERO_CAMERA,
      metrics.charWidth,
      metrics.charHeight,
      viewportWidth,
      viewportHeight
    )
    const { px, py } = viewportToScreen(
      tile.x,
      tile.y,
      metrics.charWidth,
      metrics.charHeight,
      viewportWidth,
      viewportHeight
    )
    const snapX = canvasRect.left + px - metrics.charWidth / 2
    const snapY = canvasRect.top + py

    return (
      <div
        className="pointer-events-none fixed z-50 font-mono"
        style={{
          left: snapX,
          top: snapY,
          width: metrics.charWidth,
          height: metrics.charHeight,
          color: def.glyphColor,
          fontSize: 16,
          lineHeight: `${String(metrics.charHeight)}px`,
          textShadow: '0 0 4px #000, 0 0 4px #000',
          textAlign: 'center',
        }}
      >
        {def.glyph}
      </div>
    )
  }

  // Over inventory grids / action bar — those areas render
  // their own preview, so a floating glyph here creates a visual duplicate.
  return null
}
