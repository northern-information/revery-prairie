import { DragCursor } from '../DragCursor'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { screenToTile, viewportToScreen } from '@/engine/projection'
import type { DragState } from '@/engine/drag'
import type { CharMetrics } from '@/engine/types'

const VIEWPORT_WIDTH = 60
const VIEWPORT_HEIGHT = 30
const ZERO_CAMERA = { x: 0, y: 0 }

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
        viewportWidth={VIEWPORT_WIDTH}
        viewportHeight={VIEWPORT_HEIGHT}
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
        viewportWidth={VIEWPORT_WIDTH}
        viewportHeight={VIEWPORT_HEIGHT}
      />
    )

    expect(container.innerHTML).toBe('')
  })

  it('snaps to the iso anchor of the viewport tile under the cursor', () => {
    const metrics = makeMetrics()
    const metricsRef = { current: metrics }
    const canvasRect = { left: 100, top: 50, width: 600, height: 540 } as DOMRect
    // Pick a cursor pos far from canvas center so iso vs ortho disagree.
    const cursorPos = { x: 100 + 250, y: 50 + 80 }

    const { container } = render(
      <DragCursor
        dragState={makeDragState()}
        cursorPos={cursorPos}
        cursorTarget="canvas"
        canvasRect={canvasRect}
        metricsRef={metricsRef}
        viewportWidth={VIEWPORT_WIDTH}
        viewportHeight={VIEWPORT_HEIGHT}
      />
    )

    const el = container.querySelector<HTMLElement>('div.fixed')
    expect(el).not.toBeNull()
    if (!el) return

    const tile = screenToTile(
      cursorPos.x - canvasRect.left,
      cursorPos.y - canvasRect.top,
      ZERO_CAMERA,
      metrics.charWidth,
      metrics.charHeight,
      VIEWPORT_WIDTH,
      VIEWPORT_HEIGHT
    )
    const anchor = viewportToScreen(
      tile.x,
      tile.y,
      metrics.charWidth,
      metrics.charHeight,
      VIEWPORT_WIDTH,
      VIEWPORT_HEIGHT
    )
    const expectedLeft = canvasRect.left + anchor.px - metrics.charWidth / 2
    const expectedTop = canvasRect.top + anchor.py
    expect(parseFloat(el.style.left)).toBeCloseTo(expectedLeft, 5)
    expect(parseFloat(el.style.top)).toBeCloseTo(expectedTop, 5)
  })

  it('produces a different snap from the orthogonal floor formula off-center', () => {
    // Regression: under the old ortho formula, snap = canvasRect + floor(cursor/char)*char.
    // Iso snap should diverge for any tile that isn't on the (vy=0) row, because the
    // (vx-vy)*charWidth horizontal term shifts the diamond center off the rect grid.
    const metrics = makeMetrics()
    const metricsRef = { current: metrics }
    const canvasRect = { left: 0, top: 0, width: 600, height: 540 } as DOMRect
    const cursorPos = { x: 247, y: 121 }

    const { container } = render(
      <DragCursor
        dragState={makeDragState()}
        cursorPos={cursorPos}
        cursorTarget="canvas"
        canvasRect={canvasRect}
        metricsRef={metricsRef}
        viewportWidth={VIEWPORT_WIDTH}
        viewportHeight={VIEWPORT_HEIGHT}
      />
    )

    const el = container.querySelector<HTMLElement>('div.fixed')
    expect(el).not.toBeNull()
    if (!el) return
    const orthoLeft =
      canvasRect.left + Math.floor((cursorPos.x - canvasRect.left) / metrics.charWidth) * metrics.charWidth
    const orthoTop =
      canvasRect.top + Math.floor((cursorPos.y - canvasRect.top) / metrics.charHeight) * metrics.charHeight
    const sameLeft = Math.abs(parseFloat(el.style.left) - orthoLeft) < 0.5
    const sameTop = Math.abs(parseFloat(el.style.top) - orthoTop) < 0.5
    expect(sameLeft && sameTop).toBe(false)
  })

  it('renders nothing when viewport dims are zero (pre-first-frame)', () => {
    const metricsRef = { current: makeMetrics() }
    const canvasRect = { left: 0, top: 0, width: 800, height: 600 } as DOMRect

    const { container } = render(
      <DragCursor
        dragState={makeDragState()}
        cursorPos={{ x: 50, y: 50 }}
        cursorTarget="canvas"
        canvasRect={canvasRect}
        metricsRef={metricsRef}
        viewportWidth={0}
        viewportHeight={0}
      />
    )

    expect(container.innerHTML).toBe('')
  })
})
