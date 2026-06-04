import { useEffect, useRef, useState } from 'react'

import {
  clampZoom,
  markersForView,
  MAX_ZOOM,
  MIN_ZOOM,
  selectMapView,
  ZOOM_STEP,
  zoomTowardFocus,
} from './MapPanel.helpers'
import { ModalShell } from './ModalShell'
import { projectIso } from './minimapProjection'

import { HOT_PINK } from '@/engine/constants'
import { TileType } from '@/engine/types'
import type { PanOffset } from './MapPanel.helpers'
import type { IsoLayout } from './minimapProjection'
import type { GameState, Position, Tile } from '@/engine/types'

// RP-70 — The Map. A read-only, full-screen ASCII chart of the prairie,
// launched from the permacomputer MAP tab. Unlike Minimap (a live
// fog-aware HUD glance), this is a fixed inherited artifact — a diegetic
// chart, not a recolored minimap. It renders whichever zone the steward
// is standing in: the overworld landmass (with landmarks + water), or a
// ruin / cellar interior, always including the steward's own marks
// (cameras, meteorites, Geodetic Markers) for that zone. It does not
// pause the prairie clock — consulting it is a free action like every
// other permacomputer surface. It mounts full-screen (not inside the
// 500px shell) following the ScanResultModal / TimeLapsePlayback
// precedent; Escape, Tab, or a backdrop click closes it.
//
// The chart is monochromatic (a single amber-ink ramp on parchment) so it
// reads as an inherited document rather than the live prairie palette, and
// its glyphs are drawn in the title-card italic serif. Place names are not
// drawn; the steward's marks carry their own labels in the world. The map
// zooms via the mouse wheel (toward the cursor) and on-screen +/- buttons.

// Monochrome amber-ink chart palette. A single hue in tints/shades — never
// the prairie's tile colors — so the map reads as a diegetic document.
const PARCHMENT_BG = '#15120E'
const DIRT_COLOR = '#3A3022'
const COASTLINE_COLOR = '#5C4E36'
const WATER_COLOR = '#241F16'
const LANDMARK_COLOR = '#B8A678'
const REGION_ICON_COLOR = '#7A6E50'
const MARK_COLOR = '#D8C49A'

// Title-card font (matches zoneTransitionOverlay.ts). Preloaded in main.tsx.
const SERIF_STACK =
  '"Libre Baskerville", Baskerville, "Baskerville Old Face", "Hoefler Text", Garamond, "Times New Roman", serif'
const ICON_GLYPH_PX = 16

// Fit the iso diamond (width+height units wide, half that tall) into a
// width x height rectangle at the given zoom, then center it and apply the
// pan offset. zoom 1 = fit-to-viewport; > 1 magnifies. projectIso consumes
// the returned IsoLayout. Unlike the minimap's square-canvas layout, this
// fills an arbitrary viewport-sized rectangle so the map is as large as
// possible.
const computeFullscreenLayout = (
  mapWidth: number,
  mapHeight: number,
  width: number,
  height: number,
  zoom: number,
  pan: PanOffset
): IsoLayout => {
  if (mapWidth === 0 || mapHeight === 0) return { tilePx: 0, originX: 0, originY: 0 }
  const widthUnits = mapWidth + mapHeight
  const fitPx = Math.min(width / widthUnits, height / (widthUnits / 2))
  const tilePx = fitPx * zoom
  const drawnWidth = widthUnits * tilePx
  const drawnHeight = drawnWidth / 2
  const originX = (width - drawnWidth) / 2 + mapHeight * tilePx + pan.x
  const originY = (height - drawnHeight) / 2 + pan.y
  return { tilePx, originX, originY }
}

const drawIsoTile = (ctx: CanvasRenderingContext2D, layout: IsoLayout, worldX: number, worldY: number, color: string) => {
  const { px, py } = projectIso(worldX, worldY, layout)
  ctx.fillStyle = color
  ctx.fillRect(Math.round(px - layout.tilePx), Math.round(py), Math.ceil(layout.tilePx * 2), Math.ceil(layout.tilePx))
}

// A coastline tile is a non-void tile adjacent (4-neighbor) to the Space
// void or the map edge — the rim that defines the island's edge.
const isCoastline = (map: Tile[][], w: number, h: number, x: number, y: number): boolean => {
  if (map[y][x].type === TileType.Space) return false
  const neighbors: Position[] = [
    { x: x - 1, y },
    { x: x + 1, y },
    { x, y: y - 1 },
    { x, y: y + 1 },
  ]
  return neighbors.some(n => n.x < 0 || n.x >= w || n.y < 0 || n.y >= h || map[n.y][n.x].type === TileType.Space)
}

interface MapGlyph {
  pos: Position
  glyph: string
  color: string
}

// Draw the current zone's terrain + icon glyphs onto the canvas.
const drawMap = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  width: number,
  height: number,
  zoom: number,
  pan: PanOffset
) => {
  const view = selectMapView(state)
  const { map, width: w, height: h, isOverworld } = view
  const layout = computeFullscreenLayout(w, h, width, height, zoom, pan)

  ctx.fillStyle = PARCHMENT_BG
  ctx.fillRect(0, 0, width, height)
  if (layout.tilePx === 0) return

  // Land — fill every non-Space tile, with a slightly lighter rim at the
  // coastline for edge definition. Interiors have no Space tiles, so the
  // whole interior fills as land.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (map[y][x].type === TileType.Space) continue
      drawIsoTile(ctx, layout, x, y, isCoastline(map, w, h, x, y) ? COASTLINE_COLOR : DIRT_COLOR)
    }
  }

  // Water + landmarks are overworld-only — they have no meaning on an
  // interior chart.
  const glyphs: MapGlyph[] = []
  if (isOverworld) {
    for (const key of state.ponds) {
      const [x, y] = key.split(',').map(Number)
      drawIsoTile(ctx, layout, x, y, WATER_COLOR)
    }
    for (const key of state.rivers) {
      const [x, y] = key.split(',').map(Number)
      drawIsoTile(ctx, layout, x, y, WATER_COLOR)
    }
    for (const region of state.namedRegions) {
      glyphs.push({ pos: region.anchor, glyph: '◦', color: REGION_ICON_COLOR })
    }
    glyphs.push({ pos: state.houseEntranceOverworld, glyph: 'α', color: LANDMARK_COLOR })
    glyphs.push({ pos: state.caveEntranceOverworld, glyph: 'O', color: LANDMARK_COLOR })
    if (state.whineEntranceOverworld) {
      glyphs.push({ pos: state.whineEntranceOverworld, glyph: 'W', color: LANDMARK_COLOR })
    }
    for (const ruin of state.ruinInteriors) {
      glyphs.push({ pos: ruin.entranceOverworld, glyph: ruin.glyph ?? '⌂', color: LANDMARK_COLOR })
    }
    for (const camera of state.placedCameras) {
      glyphs.push({ pos: { x: camera.x, y: camera.y }, glyph: '⌖', color: MARK_COLOR })
    }
    for (const meteorite of state.placedMeteorites) {
      glyphs.push({ pos: meteorite, glyph: '✦', color: MARK_COLOR })
    }
  }

  // Geodetic Markers for this zone — the steward's marks stay hot pink
  // (reserved user-action color) so they pop against the monochrome chart.
  for (const marker of markersForView(state)) {
    glyphs.push({ pos: { x: marker.x, y: marker.y }, glyph: '⚑', color: HOT_PINK })
  }

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `italic ${String(ICON_GLYPH_PX)}px ${SERIF_STACK}`
  for (const g of glyphs) {
    const { px, py } = projectIso(g.pos.x, g.pos.y, layout)
    ctx.fillStyle = g.color
    ctx.fillText(g.glyph, px, py)
  }
}

// Fill the entire viewport — the map maximizes over everything, including
// the bottom bar (ModalShell is z-30; the bottom bar is z-10).
const computeViewport = (): { width: number; height: number } => ({
  width: window.innerWidth,
  height: window.innerHeight,
})

interface MapPanelProps {
  state: GameState
  onDismiss: () => void
}

export const MapPanel = ({ state, onDismiss }: MapPanelProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [viewport, setViewport] = useState(computeViewport)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const onResize = () => {
      setViewport(computeViewport())
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawMap(ctx, state, viewport.width, viewport.height, zoom, pan)
  })

  // Wheel zooms toward the cursor; the world point under the cursor stays
  // fixed. Buttons zoom toward the viewport center. Snapping back to
  // MIN_ZOOM recenters the chart (zero pan).
  const applyZoom = (nextZoomRaw: number, focusX: number, focusY: number) => {
    const next = clampZoom(nextZoomRaw)
    if (next === zoom) return
    const nextPan = zoomTowardFocus(zoom, next, pan, focusX, focusY, viewport.width / 2, viewport.height / 2)
    setZoom(next)
    setPan(next === MIN_ZOOM ? { x: 0, y: 0 } : nextPan)
  }

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
    applyZoom(zoom * factor, e.clientX - rect.left, e.clientY - rect.top)
  }

  return (
    <ModalShell onDismiss={onDismiss} ariaLabel="Prairie map" data-testid="map-overlay">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={viewport.width}
          height={viewport.height}
          style={{ width: `${String(viewport.width)}px`, height: `${String(viewport.height)}px` }}
          onWheel={onWheel}
        />
        {/* Zoom controls — monochrome, unobtrusive, bottom-right. No focus
            rings (project doctrine). */}
        <div className="pointer-events-auto absolute right-6 bottom-6 flex flex-col gap-2">
          <button
            type="button"
            data-testid="map-zoom-in"
            aria-label="Zoom in"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => {
              applyZoom(zoom * ZOOM_STEP, viewport.width / 2, viewport.height / 2)
            }}
            className="border-border-dim h-9 w-9 rounded border bg-black/50 font-mono text-lg text-[#B8A678] outline-none focus:outline-none disabled:opacity-30"
          >
            +
          </button>
          <button
            type="button"
            data-testid="map-zoom-out"
            aria-label="Zoom out"
            disabled={zoom <= MIN_ZOOM}
            onClick={() => {
              applyZoom(zoom / ZOOM_STEP, viewport.width / 2, viewport.height / 2)
            }}
            className="border-border-dim h-9 w-9 rounded border bg-black/50 font-mono text-lg text-[#B8A678] outline-none focus:outline-none disabled:opacity-30"
          >
            −
          </button>
        </div>
        {/* Exit hint — the map closes via Escape, Tab, or a backdrop click;
            there is no close button by design. */}
        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 font-mono text-xs text-[#7A6E50]">
          Press Esc to close
        </div>
      </div>
    </ModalShell>
  )
}
