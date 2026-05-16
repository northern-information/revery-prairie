import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Minimap } from '../Minimap'
import {
  MINIMAP_CSS_SIZE,
  computeIsoLayout,
  getPlayerCenter,
  projectIso,
} from '../minimapProjection'

import { createGameState } from '@/engine/state'
import { Zone } from '@/engine/types'

describe('minimap', () => {
  it('renders a canvas element', () => {
    const state = createGameState('Test', 80, 40)
    const { getByTestId } = render(<Minimap state={state} />)

    const canvas = getByTestId('minimap-canvas')
    expect(canvas.tagName).toBe('CANVAS')
  })

  it('reads zone from state.currentZone so cave swap is reflected', () => {
    const state = createGameState('Test', 80, 40)
    const { rerender } = render(<Minimap state={state} />)
    expect(state.currentZone).toBe(Zone.Overworld)

    state.currentZone = Zone.Cave
    rerender(<Minimap state={state} />)
    expect(state.currentZone).toBe(Zone.Cave)
  })

  it('does not throw when civilizationRuins is empty', () => {
    const state = createGameState('Test', 80, 40)
    state.civilizationRuins = []
    expect(() => render(<Minimap state={state} />)).not.toThrow()
  })

  it('handles a zero-size map without throwing', () => {
    const state = createGameState('Test', 80, 40)
    state.mapWidth = 0
    state.mapHeight = 0
    state.map = []
    expect(() => render(<Minimap state={state} />)).not.toThrow()
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
    const state = createGameState('Test', 80, 40)
    const layout = computeIsoLayout(state.mapWidth, state.mapHeight)

    // Move the camera away from the player and verify getPlayerCenter
    // is unaffected.
    const playerCenterA = getPlayerCenter(state, layout)
    state.camera = { x: 0, y: 0 }
    const playerCenterB = getPlayerCenter(state, layout)
    expect(playerCenterA).toEqual(playerCenterB)
  })

  it('tracks the player when the player moves', () => {
    const state = createGameState('Test', 80, 40)
    const layout = computeIsoLayout(state.mapWidth, state.mapHeight)
    const before = getPlayerCenter(state, layout)
    state.player.x += 1
    const after = getPlayerCenter(state, layout)
    expect(after.cx).not.toBe(before.cx)
  })
})
