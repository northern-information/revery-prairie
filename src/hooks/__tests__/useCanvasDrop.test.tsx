import { act, fireEvent, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useCanvasDrop } from '../useCanvasDrop'
import { createTestState, swapToOverworldForTest } from '@/engine/__tests__/helpers'
import { TileType } from '@/engine/types'

import type { DragState } from '@/engine/drag'
import type { CharMetrics, Container, GameState, ItemInstance } from '@/engine/types'

afterEach(() => {
  vi.restoreAllMocks()
})

// Minimal wrapper component that exercises useCanvasDrop's external
// surface: cursor position state, drag-hover-tile mutations on the
// game state, and the refreshUI / cancelDrag callbacks. Renders a
// `<canvas>` so the hook's mouseup-on-canvas path can be reached.
const HookHarness = ({
  state,
  dragState,
  containers,
  refreshUI,
  cancelDrag,
}: {
  state: GameState
  dragState: DragState | null
  containers: { id: string; container: Container }[]
  refreshUI: () => void
  cancelDrag: () => void
}): React.ReactElement => {
  const metricsRef = useRef<CharMetrics | null>({ charWidth: 10, charHeight: 16, font: '16px monospace' })
  const itemInfoRef = useRef<{ setDragging: (v: boolean) => void } | null>({ setDragging: vi.fn() })
  useCanvasDrop({
    dragState,
    state,
    containers,
    metricsRef,
    cancelDrag,
    refreshUI,
    itemInfoRef,
  })
  return <canvas data-testid="drop-canvas" width={200} height={200} style={{ position: 'absolute', left: 0, top: 0 }} />
}

const makeDragFixture = () => {
  const state = createTestState()
  swapToOverworldForTest(state)
  // Clear the area around the player so the path the hook computes
  // doesn't trip on random terrain.
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const x = state.player.x + dx
      const y = state.player.y + dy
      if (x >= 0 && x < state.mapWidth && y >= 0 && y < state.mapHeight) {
        state.map[y][x] = { type: TileType.Dirt }
      }
    }
  }

  const item: ItemInstance = {
    uid: 'test-item-1' as ItemInstance['uid'],
    definitionId: 'rock',
    gridX: 0,
    gridY: 0,
  }
  const container: Container = {
    id: 'backpack',
    name: 'Backpack',
    width: 4,
    height: 4,
    items: [item],
  }
  const dragState: DragState = {
    item,
    sourceContainerId: 'backpack',
    targetContainerId: 'world',
    previewX: 0,
    previewY: 0,
    isValid: true,
    combineTarget: null,
    cannotCombine: false,
  }
  return {
    state,
    item,
    container,
    dragState,
    containers: [{ id: 'backpack', container }],
  }
}

describe('useCanvasDrop', () => {
  describe('no drag state', () => {
    it('clears state.dragHoverTile when dragState is null', () => {
      const state = createTestState()
      swapToOverworldForTest(state)
      state.dragHoverTile = { x: 5, y: 5 }
      const refreshUI = vi.fn()
      render(<HookHarness state={state} dragState={null} containers={[]} refreshUI={refreshUI} cancelDrag={vi.fn()} />)
      expect(state.dragHoverTile).toBeNull()
      expect(refreshUI).toHaveBeenCalled()
    })

    it('does not call refreshUI when dragState is null and dragHoverTile was already null', () => {
      const state = createTestState()
      state.dragHoverTile = null
      const refreshUI = vi.fn()
      render(<HookHarness state={state} dragState={null} containers={[]} refreshUI={refreshUI} cancelDrag={vi.fn()} />)
      expect(refreshUI).not.toHaveBeenCalled()
    })
  })

  describe('drag active — mousemove over canvas', () => {
    it('updates state.dragHoverTile to the tile under the cursor and calls refreshUI', () => {
      const fx = makeDragFixture()
      const refreshUI = vi.fn()
      const { getByTestId } = render(
        <HookHarness state={fx.state} dragState={fx.dragState} containers={fx.containers} refreshUI={refreshUI} cancelDrag={vi.fn()} />
      )
      const canvas = getByTestId('drop-canvas')
      // jsdom getBoundingClientRect returns zeros by default; stub it.
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        x: 0, y: 0, top: 0, left: 0, right: 200, bottom: 200, width: 200, height: 200, toJSON: () => ({}),
      } as DOMRect)
      // Pretend the player is centered so the cursor maps to an
      // in-bounds Dirt tile. charWidth=10, charHeight=16; cursor at
      // (15, 24) → tile offset (1, 1) relative to camera origin (0,0).
      act(() => {
        fireEvent.mouseMove(canvas, { clientX: 15, clientY: 24 })
      })
      expect(fx.state.dragHoverTile).not.toBeNull()
      expect(refreshUI).toHaveBeenCalled()
    })

    it('clears dragHoverTile when the mouse moves off the canvas', () => {
      const fx = makeDragFixture()
      fx.state.dragHoverTile = { x: 7, y: 7 }
      const refreshUI = vi.fn()
      render(<HookHarness state={fx.state} dragState={fx.dragState} containers={fx.containers} refreshUI={refreshUI} cancelDrag={vi.fn()} />)
      // Dispatch a mousemove with a non-canvas target (the document body).
      act(() => {
        fireEvent.mouseMove(document.body, { clientX: 5, clientY: 5 })
      })
      expect(fx.state.dragHoverTile).toBeNull()
    })
  })

  describe('drag active — mouseup not on canvas', () => {
    it('does not invoke executeDrop / cancelDrag when the mouseup target is the body', () => {
      const fx = makeDragFixture()
      const cancelDrag = vi.fn()
      const refreshUI = vi.fn()
      render(<HookHarness state={fx.state} dragState={fx.dragState} containers={fx.containers} refreshUI={refreshUI} cancelDrag={cancelDrag} />)
      act(() => {
        fireEvent.mouseUp(document.body, { clientX: 5, clientY: 5 })
      })
      expect(cancelDrag).not.toHaveBeenCalled()
    })
  })
})
