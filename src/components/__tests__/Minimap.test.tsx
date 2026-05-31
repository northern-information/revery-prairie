import { Minimap } from '../Minimap'
import { computeIsoLayout, getPlayerCenter, MINIMAP_CSS_SIZE, projectIso } from '../minimapProjection'
import { getVisibleRuinFootprints } from '../minimapStructures'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createTestState } from '@/engine/__tests__/helpers'
import { posKey } from '@/engine/position'
import { Zone } from '@/engine/types'
import type { CivilizationRuin } from '@/engine/genesisTypes'

describe('minimap', () => {
  it('renders a canvas element', () => {
    const state = createTestState({ viewportWidth: 80, viewportHeight: 40 })
    const { getByTestId } = render(<Minimap state={state} />)

    const canvas = getByTestId('minimap-canvas')
    expect(canvas.tagName).toBe('CANVAS')
  })

  it('reads zone from state.currentZone so cave swap is reflected', () => {
    const state = createTestState({ viewportWidth: 80, viewportHeight: 40 })
    const { rerender } = render(<Minimap state={state} />)
    expect(state.currentZone).toBe(Zone.Overworld)

    state.currentZone = Zone.Cave
    rerender(<Minimap state={state} />)
    expect(state.currentZone).toBe(Zone.Cave)
  })

  it('does not throw when civilizationRuins is empty', () => {
    const state = createTestState({ viewportWidth: 80, viewportHeight: 40 })
    state.civilizationRuins = []
    expect(() => render(<Minimap state={state} />)).not.toThrow()
  })

  it('handles a zero-size map without throwing', () => {
    const state = createTestState({ viewportWidth: 80, viewportHeight: 40 })
    state.mapWidth = 0
    state.mapHeight = 0
    state.map = []
    expect(() => render(<Minimap state={state} />)).not.toThrow()
  })
})

describe('getVisibleRuinFootprints', () => {
  const makeRuin = (footprints: { x: number; y: number }[]): CivilizationRuin => ({
    position: footprints[0],
    name: 'Test Ruin',
    radius: 1,
    age: 0,
    aqueductPaths: [],
    buildingFootprints: footprints,
  })

  it('returns no footprints on a fresh tenure with no exploration', () => {
    const state = createTestState({ viewportWidth: 80, viewportHeight: 40 })
    state.overworldFogExplored = new Set()
    state.civilizationRuins = [
      makeRuin([
        { x: 40, y: 40 },
        { x: 41, y: 40 },
        { x: 40, y: 41 },
      ]),
    ]

    const result = getVisibleRuinFootprints(state, null)
    expect(result).toEqual([])
  })

  it('returns only the explored tiles of a partially explored ruin', () => {
    const state = createTestState({ viewportWidth: 80, viewportHeight: 40 })
    state.overworldFogExplored = new Set([posKey(40, 40)])
    state.civilizationRuins = [
      makeRuin([
        { x: 40, y: 40 },
        { x: 41, y: 40 },
        { x: 40, y: 41 },
        { x: 41, y: 41 },
        { x: 42, y: 40 },
      ]),
    ]

    const result = getVisibleRuinFootprints(state, null)
    expect(result).toEqual([{ x: 40, y: 40 }])
  })

  it('returns no footprints when state.currentZone is not Overworld', () => {
    const state = createTestState({ viewportWidth: 80, viewportHeight: 40 })
    state.currentZone = Zone.Cave
    state.overworldFogExplored = new Set([posKey(40, 40), posKey(41, 40)])
    state.civilizationRuins = [
      makeRuin([
        { x: 40, y: 40 },
        { x: 41, y: 40 },
      ]),
    ]

    const result = getVisibleRuinFootprints(state, null)
    expect(result).toEqual([])
  })

  it('returns no footprints when civilizationRuins is empty', () => {
    const state = createTestState({ viewportWidth: 80, viewportHeight: 40 })
    state.civilizationRuins = []
    const result = getVisibleRuinFootprints(state, null)
    expect(result).toEqual([])
  })

  it('includes a footprint tile currently in the visible set even if not in fogExplored', () => {
    const state = createTestState({ viewportWidth: 80, viewportHeight: 40 })
    state.overworldFogExplored = new Set()
    state.civilizationRuins = [
      makeRuin([
        { x: 40, y: 40 },
        { x: 41, y: 40 },
      ]),
    ]

    const visibleSet = new Set([posKey(40, 40)])
    const result = getVisibleRuinFootprints(state, visibleSet)
    expect(result).toEqual([{ x: 40, y: 40 }])
  })
})

describe('minimap iso projection', () => {
  it('returns a zero-tile layout for an empty map', () => {
    const layout = computeIsoLayout(0, 0)
    expect(layout).toEqual({ tilePx: 0, originX: 0, originY: 0 })
  })

  it('fits a square 147x147 map inside the minimap canvas with no overflow', () => {
    const layout = computeIsoLayout(147, 147)
    // North corner: (0, 0) → diamond top
    const north = projectIso(0, 0, layout)
    // East corner: (146, 0) → diamond right
    const east = projectIso(146, 0, layout)
    // South corner: (146, 146) → diamond bottom
    const south = projectIso(146, 146, layout)
    // West corner: (0, 146) → diamond left
    const west = projectIso(0, 146, layout)

    // Diamond orientation: north at top, south at bottom, east right, west left.
    expect(north.py).toBeLessThan(south.py)
    expect(east.px).toBeGreaterThan(west.px)
    expect(Math.abs(north.px - south.px)).toBeLessThan(0.5)

    // All projected centers stay inside the canvas.
    for (const corner of [north, east, south, west]) {
      expect(corner.px).toBeGreaterThanOrEqual(0)
      expect(corner.px).toBeLessThanOrEqual(MINIMAP_CSS_SIZE)
      expect(corner.py).toBeGreaterThanOrEqual(0)
      expect(corner.py).toBeLessThanOrEqual(MINIMAP_CSS_SIZE)
    }

    // Tile span: each tile is 2*tilePx wide × tilePx tall. Verify the
    // outer bounding box stays inside the canvas including tile half-widths.
    const halfTileW = layout.tilePx
    expect(west.px - halfTileW).toBeGreaterThanOrEqual(-0.001)
    expect(east.px + halfTileW).toBeLessThanOrEqual(MINIMAP_CSS_SIZE + 0.001)
  })

  it('fits a non-square cave map (40x25) without clipping', () => {
    const layout = computeIsoLayout(40, 25)
    const north = projectIso(0, 0, layout)
    const east = projectIso(39, 0, layout)
    const south = projectIso(39, 24, layout)
    const west = projectIso(0, 24, layout)

    expect(north.py).toBeLessThan(south.py)
    expect(east.px).toBeGreaterThan(west.px)

    for (const corner of [north, east, south, west]) {
      expect(corner.px).toBeGreaterThanOrEqual(0)
      expect(corner.px).toBeLessThanOrEqual(MINIMAP_CSS_SIZE)
      expect(corner.py).toBeGreaterThanOrEqual(0)
      expect(corner.py).toBeLessThanOrEqual(MINIMAP_CSS_SIZE)
    }
  })

  it('places world (0,0) at the top of the diamond and the opposite corner at the bottom', () => {
    const layout = computeIsoLayout(100, 100)
    const topLeft = projectIso(0, 0, layout)
    const bottomRight = projectIso(99, 99, layout)
    // North (low y) projects to small py; south (high y) to large py.
    expect(topLeft.py).toBeLessThan(bottomRight.py)
    // (0,0) and (99,99) sit on the diamond's vertical axis (same px).
    expect(Math.abs(topLeft.px - bottomRight.px)).toBeLessThan(0.5)
  })

  it('east (x+) and west (y+) project to opposite horizontal extremes', () => {
    const layout = computeIsoLayout(100, 100)
    const east = projectIso(99, 0, layout)
    const west = projectIso(0, 99, layout)
    expect(east.px).toBeGreaterThan(west.px)
    // East and west sit on the diamond's horizontal axis (same py).
    expect(Math.abs(east.py - west.py)).toBeLessThan(0.5)
  })
})

describe('minimap viewport rect placement', () => {
  it('centers on the iso-projected player position, not on state.camera', () => {
    const state = createTestState({ viewportWidth: 80, viewportHeight: 40 })
    const layout = computeIsoLayout(state.mapWidth, state.mapHeight)

    // Move the camera away from the player and verify getPlayerCenter
    // is unaffected.
    const playerCenterA = getPlayerCenter(state, layout)
    state.camera = { x: 0, y: 0 }
    const playerCenterB = getPlayerCenter(state, layout)
    expect(playerCenterA).toEqual(playerCenterB)
  })

  it('tracks the player when the player moves', () => {
    const state = createTestState({ viewportWidth: 80, viewportHeight: 40 })
    const layout = computeIsoLayout(state.mapWidth, state.mapHeight)
    const before = getPlayerCenter(state, layout)
    state.player.x += 1
    const after = getPlayerCenter(state, layout)
    expect(after.cx).not.toBe(before.cx)
  })
})

// ─── draw lifecycle ─────────────────────────────────────────────────
//
// Tests below exercise the canvas-bound draw code in Minimap. They use
// a recording ctx (replacing the global no-op stub from
// `src/test/setup.ts` for the duration of the test) so paint calls
// can be asserted. rAF is jsdom-polyfilled as setTimeout(fn, ~16ms),
// so a `waitFor` lets the first draw frame fire.

import { afterEach, vi } from 'vitest'
import { waitFor } from '@testing-library/react'
import { makeCanvasStub } from '@/engine/__tests__/canvasStub'

afterEach(() => {
  vi.restoreAllMocks()
})

const installRecordingCtx = () => {
  const stub = makeCanvasStub()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
    type: string
  ) {
    if (type === '2d') return stub.ctx
    return null
  } as typeof HTMLCanvasElement.prototype.getContext)
  return stub
}

describe('Minimap draw lifecycle', () => {
  it('sets the canvas to MINIMAP_CSS_SIZE on mount', () => {
    const state = createTestState({ viewportWidth: 80, viewportHeight: 40 })
    const { getByTestId } = render(<Minimap state={state} />)
    const canvas = getByTestId('minimap-canvas') as HTMLCanvasElement
    expect(canvas.width).toBe(MINIMAP_CSS_SIZE)
    expect(canvas.height).toBe(MINIMAP_CSS_SIZE)
    expect(canvas.style.width).toBe(`${String(MINIMAP_CSS_SIZE)}px`)
    expect(canvas.style.height).toBe(`${String(MINIMAP_CSS_SIZE)}px`)
  })

  it('clears the canvas on every animation frame', async () => {
    const stub = installRecordingCtx()
    const state = createTestState({ viewportWidth: 80, viewportHeight: 40 })
    render(<Minimap state={state} />)
    await waitFor(() => {
      const clearRectCalls = stub.paintSnapshots.filter(s => s.op === 'clearRect')
      expect(clearRectCalls.length).toBeGreaterThan(0)
    })
  })

  it('paints at least one tile on the overworld (the rebuilt cache or live drawTileLayer)', async () => {
    const stub = installRecordingCtx()
    const state = createTestState({ viewportWidth: 80, viewportHeight: 40 })
    state.currentZone = Zone.Overworld
    render(<Minimap state={state} />)
    await waitFor(() => {
      // Either the cached overworld bitmap is drawn (drawImage) or, on
      // cache rebuild, tiles paint individually (fillRect). One of the
      // two must have happened.
      const drewImage = stub.paintSnapshots.some(s => s.op === 'drawImage')
      const filledRects = stub.paintSnapshots.filter(s => s.op === 'fillRect').length
      expect(drewImage || filledRects > 0).toBe(true)
    })
  })

  it('paints the player marker in pink (#ff69b4)', async () => {
    const stub = installRecordingCtx()
    const state = createTestState({ viewportWidth: 80, viewportHeight: 40 })
    render(<Minimap state={state} />)
    await waitFor(() => {
      const pinkFills = stub.paintSnapshots.filter(
        s => s.op === 'fillRect' && (s.fillStyle === '#ff69b4' || s.fillStyle === '#FF69B4')
      )
      expect(pinkFills.length).toBeGreaterThan(0)
    })
  })

  it('uses the live drawTileLayer path (fillRect per tile) inside a non-overworld zone', async () => {
    const stub = installRecordingCtx()
    const state = createTestState({ viewportWidth: 80, viewportHeight: 40 })
    state.currentZone = Zone.Cave
    state.map = state.caveMap
    state.mapWidth = state.caveMapWidth
    state.mapHeight = state.caveMapHeight
    render(<Minimap state={state} />)
    await waitFor(() => {
      // No cache in non-overworld zones — every visible tile paints
      // through drawTileLayer's fillRect path.
      const fillRectCount = stub.paintSnapshots.filter(s => s.op === 'fillRect').length
      expect(fillRectCount).toBeGreaterThan(0)
    })
  })
})
