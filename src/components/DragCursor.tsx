import { getDefinition } from '@/engine/items'
import type { CharMetrics } from '@/engine/types'
import type { DragState } from '@/engine/drag'

interface DragCursorProps {
  dragState: DragState
  cursorPos: { x: number; y: number }
  cursorTarget: 'canvas' | 'other'
  canvasRect: DOMRect | null
  metricsRef: React.RefObject<CharMetrics | null>
}

export const DragCursor = ({ dragState, cursorPos, cursorTarget, canvasRect, metricsRef }: DragCursorProps) => {
  const metrics = metricsRef.current
  const def = getDefinition(dragState.item.definitionId)

  if (metrics && cursorTarget === 'canvas' && canvasRect) {
    const tileX = Math.floor((cursorPos.x - canvasRect.left) / metrics.charWidth)
    const tileY = Math.floor((cursorPos.y - canvasRect.top) / metrics.charHeight)
    const snapX = canvasRect.left + tileX * metrics.charWidth
    const snapY = canvasRect.top + tileY * metrics.charHeight

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
        }}
      >
        {def.glyph}
      </div>
    )
  }

  return (
    <div
      className="pointer-events-none fixed z-50 font-mono text-sm"
      style={{
        left: cursorPos.x + 16,
        top: cursorPos.y - 8,
        color: def.glyphColor,
        textShadow: '0 0 4px #000, 0 0 4px #000',
      }}
    >
      {def.glyph}
    </div>
  )
}
