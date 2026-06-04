// RP-70 — pure helpers for the map tab, split from MapPanel.tsx so the
// component file only exports a component (react-refresh) and the zone /
// marker / zoom math stays unit-testable.

import { Zone } from '@/engine/types'
import type { GameState, PlacedMarker, Tile } from '@/engine/types'

// The map renders whichever zone the steward is standing in — a diegetic
// chart you consult in place, not a fixed overworld minimap. Overworld is
// the default for zones that have no marker-bearing interior of their own
// (cave, house, yards), so the map always shows something coherent.
export interface MapView {
  map: Tile[][]
  width: number
  height: number
  // Overworld carries the fixed landmarks (house/cave/ruins/regions) and
  // water; interiors render bare terrain + the steward's own marks.
  isOverworld: boolean
}

export const selectMapView = (state: GameState): MapView => {
  if (state.currentZone === Zone.Ruin && state.currentRuinIndex !== null) {
    const interior = state.ruinInteriors[state.currentRuinIndex]
    if (interior) {
      return { map: interior.map, width: interior.mapWidth, height: interior.mapHeight, isOverworld: false }
    }
  }
  if (state.currentZone === Zone.KnotCellar) {
    return { map: state.cellarMap, width: state.cellarMapWidth, height: state.cellarMapHeight, isOverworld: false }
  }
  return {
    map: state.overworldMap,
    width: state.overworldMapWidth,
    height: state.overworldMapHeight,
    isOverworld: true,
  }
}

// Markers belonging to the currently-viewed zone. Inside a ruin, only the
// marks laid in *that* ruin (ruinIndex match) surface; on the overworld,
// only overworld marks. Interior coordinates are meaningless on any other
// zone's chart, so they are filtered out rather than mis-projected.
export const markersForView = (state: GameState): PlacedMarker[] => {
  if (state.currentZone === Zone.Ruin && state.currentRuinIndex !== null) {
    const ruinIndex = state.currentRuinIndex
    return state.placedMarkers.filter(m => m.zone === Zone.Ruin && m.ruinIndex === ruinIndex)
  }
  if (state.currentZone === Zone.KnotCellar) {
    return state.placedMarkers.filter(m => m.zone === Zone.KnotCellar)
  }
  return state.placedMarkers.filter(m => m.zone === Zone.Overworld)
}

// Zoom bounds for the map chart. 1 = fit-to-viewport; > 1 magnifies.
export const MIN_ZOOM = 1
export const MAX_ZOOM = 6
export const ZOOM_STEP = 1.25

export const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))

// Zoom toward a focal point (the cursor, or the viewport center for the
// +/- buttons): the world point under the focus stays fixed while the
// scale changes. Returns the new pan offset that keeps `focus` anchored.
// pan is added to the draw origin; at zoom 1 with zero pan the chart is
// centered by computeFullscreenLayout.
export interface PanOffset {
  x: number
  y: number
}

export const zoomTowardFocus = (
  prevZoom: number,
  nextZoom: number,
  prevPan: PanOffset,
  focusX: number,
  focusY: number,
  centerX: number,
  centerY: number
): PanOffset => {
  if (prevZoom === 0) return prevPan
  const ratio = nextZoom / prevZoom
  // The focal point relative to the chart center (which itself is shifted
  // by the current pan). Scaling about that point keeps it stationary.
  const fx = focusX - centerX - prevPan.x
  const fy = focusY - centerY - prevPan.y
  return {
    x: prevPan.x + fx - fx * ratio,
    y: prevPan.y + fy - fy * ratio,
  }
}
