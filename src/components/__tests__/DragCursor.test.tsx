import { render, screen } from '@testing-library/react'

import { DragCursor } from '../DragCursor'
import type { DragState } from '@/engine/drag'
import type { CharMetrics } from '@/engine/types'

const makeDragState = (overrides?: Partial<DragState>): DragState => ({
  item: {
    uid: 'clover-1',
    definitionId: 'clover',
    gridX: 0,
    gridY: 0,
  },
  sourceContainerId: 'backpack',
  targetContainerId: 'backpack',
  previewX: 0,
  previewY: 0,
  isValid: true,
  combineTarget: null,
  actionBarTarget: null,
  cannotCombine: false,
  ...overrides,
})

const makeMetrics = (): CharMetrics => ({
  charWidth: 10,
  charHeight: 18,
  font: '16px monospace',
})

describe('DragCursor', () => {
  it('renders glyph when cursor is over the canvas', () => {
    const metricsRef = { current: makeMetrics() }
    const canvasRect = { left: 0, top: 0, width: 800, height: 600 } as DOMRect

    render(
      <DragCursor
        dragState={makeDragState()}
        cursorPos={{ x: 50, y: 50 }}
        cursorTarget="canvas"
        canvasRect={canvasRect}
        metricsRef={metricsRef}
      />
    )

    expect(screen.getByText('%')).toBeInTheDocument()
  })

  it('renders nothing when cursor is over a non-canvas area', () => {
    const metricsRef = { current: makeMetrics() }

    const { container } = render(
      <DragCursor
        dragState={makeDragState()}
        cursorPos={{ x: 50, y: 50 }}
        cursorTarget="other"
        canvasRect={null}
        metricsRef={metricsRef}
      />
    )

    expect(container.innerHTML).toBe('')
  })
})
