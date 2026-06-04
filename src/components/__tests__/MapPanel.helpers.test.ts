import { describe, expect, it, vi } from 'vitest'

import {
  clampZoom,
  markersForView,
  MAX_ZOOM,
  MIN_ZOOM,
  selectMapView,
  zoomTowardFocus,
} from '../MapPanel.helpers'

import { createGameState } from '@/engine/state'
import { Zone } from '@/engine/types'
import type { GameState } from '@/engine/types'

// RP-70 — pure map helpers. The canvas draw itself is untested (canvas
// rendering, per CLAUDE.md); this covers zone selection, marker filtering,
// and the zoom math.

const makeState = (): GameState => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  const state = createGameState('Cartographer', 20, 20)
  vi.restoreAllMocks()
  return state
}

describe('selectMapView', () => {
  it('returns the overworld grid by default', () => {
    const state = makeState()
    state.currentZone = Zone.Overworld
    const view = selectMapView(state)
    expect(view.isOverworld).toBe(true)
    expect(view.map).toBe(state.overworldMap)
    expect(view.width).toBe(state.overworldMapWidth)
  })

  it('returns the ruin interior grid when standing in a ruin', () => {
    const state = makeState()
    state.currentZone = Zone.Ruin
    state.currentRuinIndex = 0
    const view = selectMapView(state)
    expect(view.isOverworld).toBe(false)
    expect(view.map).toBe(state.ruinInteriors[0].map)
    expect(view.width).toBe(state.ruinInteriors[0].mapWidth)
  })

  it('returns the cellar grid when standing in the Knot cellar', () => {
    const state = makeState()
    state.currentZone = Zone.KnotCellar
    const view = selectMapView(state)
    expect(view.isOverworld).toBe(false)
    expect(view.map).toBe(state.cellarMap)
  })

  it('falls back to overworld for zones without a marker-bearing interior (cave)', () => {
    const state = makeState()
    state.currentZone = Zone.Cave
    expect(selectMapView(state).isOverworld).toBe(true)
  })
})

describe('markersForView', () => {
  it('shows only overworld marks on the overworld', () => {
    const state = makeState()
    state.currentZone = Zone.Overworld
    state.placedMarkers = [
      { uid: 'a', x: 1, y: 1, zone: Zone.Overworld, label: 'GM-1' },
      { uid: 'b', x: 2, y: 2, zone: Zone.Ruin, ruinIndex: 0, label: 'GM-2' },
    ]
    expect(markersForView(state).map(m => m.uid)).toEqual(['a'])
  })

  it('shows only the current ruin’s marks when inside a ruin', () => {
    const state = makeState()
    state.currentZone = Zone.Ruin
    state.currentRuinIndex = 1
    state.placedMarkers = [
      { uid: 'a', x: 1, y: 1, zone: Zone.Overworld, label: 'GM-1' },
      { uid: 'b', x: 2, y: 2, zone: Zone.Ruin, ruinIndex: 0, label: 'GM-2' },
      { uid: 'c', x: 3, y: 3, zone: Zone.Ruin, ruinIndex: 1, label: 'GM-3' },
    ]
    expect(markersForView(state).map(m => m.uid)).toEqual(['c'])
  })

  it('shows cellar marks in the cellar', () => {
    const state = makeState()
    state.currentZone = Zone.KnotCellar
    state.placedMarkers = [
      { uid: 'a', x: 1, y: 1, zone: Zone.Overworld, label: 'GM-1' },
      { uid: 'b', x: 2, y: 2, zone: Zone.KnotCellar, label: 'GM-2' },
    ]
    expect(markersForView(state).map(m => m.uid)).toEqual(['b'])
  })
})

describe('clampZoom', () => {
  it('clamps below the minimum', () => {
    expect(clampZoom(0.1)).toBe(MIN_ZOOM)
  })
  it('clamps above the maximum', () => {
    expect(clampZoom(100)).toBe(MAX_ZOOM)
  })
  it('passes a value within range through', () => {
    expect(clampZoom(2)).toBe(2)
  })
})

describe('zoomTowardFocus', () => {
  it('keeps the focal point stationary when zooming', () => {
    // Focus at the center: pan stays zero (nothing to compensate).
    const pan = zoomTowardFocus(1, 2, { x: 0, y: 0 }, 500, 400, 500, 400)
    expect(pan).toEqual({ x: 0, y: 0 })
  })

  it('shifts pan to anchor an off-center focal point', () => {
    // Focus 100px right of center; zooming in by 2x must push pan left so
    // the world point under the focus does not drift.
    const pan = zoomTowardFocus(1, 2, { x: 0, y: 0 }, 600, 400, 500, 400)
    expect(pan.x).toBe(-100)
    expect(pan.y).toBe(0)
  })
})
