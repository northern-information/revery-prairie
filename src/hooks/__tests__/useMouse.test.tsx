import { useRef } from 'react'
import { useMouse } from '../useMouse'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAroundPlayer, createTestState } from '@/engine/__tests__/helpers'
import { takeInHand } from '@/engine/inHand'
import { findFitPosition, placeItem } from '@/engine/inventory'
import { TileType } from '@/engine/types'
import type { CharMetrics, GameState } from '@/engine/types'

// `screenToTile` does iso projection — mock it so tests can pick a target
// tile by setting `mockedTile` rather than computing pixel coords.
let mockedTile: { x: number; y: number } = { x: 0, y: 0 }

vi.mock('@/engine/coordinates', () => ({
  screenToTile: vi.fn(() => mockedTile),
}))

// Keep camera updates a no-op so we don't need a full canvas/viewport.
vi.mock('@/engine/camera', () => ({
  updateCamera: vi.fn(),
}))

const fireContextMenu = (canvas: HTMLCanvasElement, opts: { shiftKey?: boolean } = {}) => {
  canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, ...opts }))
}

const fireMouseEvent = (canvas: HTMLCanvasElement, type: 'mousedown' | 'mousemove' | 'mouseup' | 'click') => {
  canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }))
}

const fireClick = (canvas: HTMLCanvasElement) => {
  canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
}

const setupHook = (state: GameState) => {
  const canvas = document.createElement('canvas')
  const metrics: CharMetrics = { charWidth: 10, charHeight: 18, font: '10px monospace' }
  const refreshUI = vi.fn()

  const { result, unmount } = renderHook(() => {
    const canvasRef = useRef<HTMLCanvasElement | null>(canvas)
    const metricsRef = useRef<CharMetrics | null>(metrics)
    useMouse({
      canvasRef,
      state,
      metricsRef,
      activeScreen: null,
      setActiveScreen: vi.fn(),
      refreshUI,
    })
    return { canvas, refreshUI }
  })

  return { ...result.current, unmount }
}

describe('useMouse — right-click', () => {
  let state: GameState

  beforeEach(() => {
    state = createTestState()
    clearAroundPlayer(state, 5)
    // Pick a walkable tile a few steps east of the player; pathfinding will
    // produce a non-empty A* result because clearAroundPlayer ensures Dirt.
    mockedTile = { x: state.player.x + 3, y: state.player.y }
    state.path = null
    state.pathWaypoints = []
    state.pendingAction = null
    state.pendingInteractionTarget = null
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('right-click on a walkable tile pathfinds the player there', () => {
    const { canvas } = setupHook(state)

    act(() => {
      fireContextMenu(canvas)
    })

    expect(state.path).not.toBeNull()
    expect((state.path ?? []).length).toBeGreaterThan(0)
    expect(state.pathWaypoints[0]).toEqual(mockedTile)
  })

  it('right-click clears pendingAction and pendingInteractionTarget', () => {
    state.pendingAction = () => undefined
    state.pendingInteractionTarget = { x: state.player.x + 1, y: state.player.y }

    const { canvas } = setupHook(state)
    act(() => {
      fireContextMenu(canvas)
    })

    expect(state.pendingAction).toBeNull()
    expect(state.pendingInteractionTarget).toBeNull()
  })

  it('right-click on a non-walkable tile is a no-op', () => {
    // Replace the target tile with a wall.
    state.map[mockedTile.y][mockedTile.x] = { type: TileType.CaveWall }

    const { canvas } = setupHook(state)
    act(() => {
      fireContextMenu(canvas)
    })

    expect(state.path).toBeNull()
  })

  it('right-click while activeDialog is set does not move the player', () => {
    state.activeDialog = {
      speakerKind: 'character',
      characterId: 'gron',
      lineIndex: 0,
      typingIndex: 0,
      typingDone: false,
      transitioning: false,
      transitionStartTime: 0,
    }

    const { canvas } = setupHook(state)
    act(() => {
      fireContextMenu(canvas)
    })

    expect(state.path).toBeNull()
  })

  it('right-click on the player tile is a no-op', () => {
    mockedTile = { x: state.player.x, y: state.player.y }

    const { canvas } = setupHook(state)
    act(() => {
      fireContextMenu(canvas)
    })

    expect(state.path).toBeNull()
  })

  it('left-mouse drag does not draw a selection marquee (no selectionBox field exists)', () => {
    const { canvas } = setupHook(state)

    act(() => {
      fireMouseEvent(canvas, 'mousedown')
      fireMouseEvent(canvas, 'mousemove')
      fireMouseEvent(canvas, 'mouseup')
    })

    // The drag handlers are gone — there is no selectionBox state to set,
    // and the click event that fires alongside the mouseup should not have
    // been blocked by a "just finished drag" flag.
    expect('selectionBox' in state).toBe(false)
  })

  it('left-click on bare ground does NOT move the player', () => {
    const { canvas } = setupHook(state)

    act(() => {
      fireClick(canvas)
    })

    expect(state.path).toBeNull()
    expect(state.pathWaypoints).toEqual([])
  })

  it('shift + right-click appends a waypoint onto an existing path', () => {
    const { canvas } = setupHook(state)

    // First right-click — establishes the path to target A.
    const targetA = { x: state.player.x + 3, y: state.player.y }
    mockedTile = targetA
    act(() => {
      fireContextMenu(canvas)
    })
    expect(state.path).not.toBeNull()
    expect(state.pathWaypoints).toHaveLength(1)
    expect(state.pathWaypoints[0]).toEqual(targetA)
    const initialPathLength = (state.path ?? []).length

    // shift + right-click — appends target B onto the chain.
    const targetB = { x: state.player.x + 5, y: state.player.y }
    mockedTile = targetB
    act(() => {
      fireContextMenu(canvas, { shiftKey: true })
    })

    expect(state.pathWaypoints).toHaveLength(2)
    expect(state.pathWaypoints[1]).toEqual(targetB)
    expect((state.path ?? []).length).toBeGreaterThan(initialPathLength)
    const finalPath = state.path ?? []
    expect(finalPath[finalPath.length - 1]).toEqual(targetB)
  })

  it('shift + right-click with no existing path behaves as a plain right-click', () => {
    const { canvas } = setupHook(state)

    act(() => {
      fireContextMenu(canvas, { shiftKey: true })
    })

    expect(state.path).not.toBeNull()
    expect(state.pathWaypoints).toEqual([mockedTile])
  })
})

describe('useMouse — in-hand place (RP-59)', () => {
  let state: GameState

  beforeEach(() => {
    state = createTestState()
    clearAroundPlayer(state, 5)
    state.placedMeteorites = []
    mockedTile = { x: state.player.x + 2, y: state.player.y }
    state.path = null
    state.pathWaypoints = []
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  const giveAndHoldMeteorite = (): string => {
    const fit = findFitPosition(state.backpack, 'meteorite')
    if (!fit) throw new Error('no backpack slot')
    const item = placeItem(state.backpack, 'meteorite', fit.gridX, fit.gridY)
    if (!item) throw new Error('placeItem failed')
    takeInHand(state, item.uid)
    return item.uid
  }

  it('left-click places the in-hand meteorite on a legal tile', () => {
    giveAndHoldMeteorite()
    const { canvas } = setupHook(state)

    act(() => {
      fireClick(canvas)
    })

    expect(state.placedMeteorites).toEqual([{ x: mockedTile.x, y: mockedTile.y }])
    expect(state.path).toBeNull()
  })

  it('left-click over an illegal tile does not place and does not crash', () => {
    giveAndHoldMeteorite()
    // Make the target a non-Dirt/Flora tile so canPlaceMeteoriteAt fails.
    state.map[mockedTile.y][mockedTile.x] = { type: TileType.Space }
    const { canvas } = setupHook(state)

    act(() => {
      fireClick(canvas)
    })

    expect(state.placedMeteorites).toEqual([])
  })

  it('left-click with nothing in hand does not place', () => {
    const { canvas } = setupHook(state)

    act(() => {
      fireClick(canvas)
    })

    expect(state.placedMeteorites).toEqual([])
    expect(state.path).toBeNull()
  })
})
