import { useEffect, useRef, useState } from 'react'

import { findHoveredIcon } from './MapPanel.helpers'
import { ModalShell } from './ModalShell'
import { projectIso } from './minimapProjection'

import { HOT_PINK } from '@/engine/constants'
import { TileType } from '@/engine/types'
import type { MapIcon } from './MapPanel.helpers'
import type { IsoLayout } from './minimapProjection'
import type { GameState, Position, Tile } from '@/engine/types'

// RP-70 — The Map. A read-only, full-screen ASCII chart of the prairie,
// launched from the permacomputer MAP tab. Unlike Minimap (a live
// fog-aware HUD glance of the current zone), this is a fixed inherited
// artifact: it always renders the overworld's dirt landmass, water, and
// landmark icons regardless of where the steward has walked, plus the
// steward's own marks (placed cameras, meteorites, Geodetic Markers). It
// does not pause the prairie clock — consulting it is a free action like
// every other permacomputer surface. It mounts full-screen (not inside
// the 500px shell) following the ScanResultModal / TimeLapsePlayback
// precedent; Escape or a backdrop click closes it.
//
// Place names are not drawn on the map — each named element is an icon,
// and its name is revealed on hover via a DOM tooltip. The canvas is
// never redrawn on mousemove; hover state lives entirely in React/DOM.

// Fit the iso diamond (mapWidth+mapHeight units wide, half that tall) into
// a width x height rectangle, maximizing the tile pitch against whichever
// dimension binds, then center it. Unlike the minimap's square-canvas
// computeIsoLayout, this fills an arbitrary viewport-sized rectangle so the
// map is as large as possible. projectIso consumes the same IsoLayout.
const computeFullscreenLayout = (mapWidth: number, mapHeight: number, width: number, height: number): IsoLayout => {
  if (mapWidth === 0 || mapHeight === 0) return { tilePx: 0, originX: 0, originY: 0 }
  const widthUnits = mapWidth + mapHeight
  const tilePx = Math.min(width / widthUnits, height / (widthUnits / 2))
  const drawnWidth = widthUnits * tilePx
  const drawnHeight = drawnWidth / 2
  const originX = (width - drawnWidth) / 2 + mapHeight * tilePx
  const originY = (height - drawnHeight) / 2
  return { tilePx, originX, originY }
}

const PARCHMENT_BG = '#1A1714'
const DIRT_COLOR = '#3A2E22'
const COASTLINE_COLOR = '#5A4A38'
const WATER_COLOR = '#3D6FA8'
const LANDMARK_COLOR = '#C2B280'
const REGION_ICON_COLOR = '#8A8266'
const CAMERA_COLOR = '#FFD700'
const METEORITE_COLOR = '#FFE4B5'

const ICON_GLYPH_PX = 16

const drawIsoTile = (ctx: CanvasRenderingContext2D, layout: IsoLayout, worldX: number, worldY: number, color: string) => {
  const { px, py } = projectIso(worldX, worldY, layout)
  ctx.fillStyle = color
  ctx.fillRect(Math.round(px - layout.tilePx), Math.round(py), Math.ceil(layout.tilePx * 2), Math.ceil(layout.tilePx))
}

// A coastline tile is a non-void tile adjacent (4-neighbor) to the Space
// void or the map edge. With the land filled, this is the rim that defines
// the island's edge against the void.
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

// Draw the terrain + icon glyphs and return the hoverable icon hit-targets.
// Names are NOT drawn — they surface on hover. Returns the icon list so the
// component can hit-test mousemove against it without re-projecting.
const drawMap = (ctx: CanvasRenderingContext2D, state: GameState, width: number, height: number): MapIcon[] => {
  const w = state.overworldMapWidth
  const h = state.overworldMapHeight
  const map = state.overworldMap
  const layout = computeFullscreenLayout(w, h, width, height)

  ctx.fillStyle = PARCHMENT_BG
  ctx.fillRect(0, 0, width, height)
  if (layout.tilePx === 0) return []

  // Dirt landmass — fill every non-Space tile, with a slightly lighter rim
  // at the coastline for edge definition. Drawn first; water and icons
  // layer on top.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (map[y][x].type === TileType.Space) continue
      drawIsoTile(ctx, layout, x, y, isCoastline(map, w, h, x, y) ? COASTLINE_COLOR : DIRT_COLOR)
    }
  }

  // Water — ponds and rivers (overworld posKey sets), over the dirt.
  for (const key of state.ponds) {
    const [x, y] = key.split(',').map(Number)
    drawIsoTile(ctx, layout, x, y, WATER_COLOR)
  }
  for (const key of state.rivers) {
    const [x, y] = key.split(',').map(Number)
    drawIsoTile(ctx, layout, x, y, WATER_COLOR)
  }

  // Collect icons, then draw their glyphs (no names). The hit-targets use
  // the same projected coordinates so hover never re-projects.
  const icons: MapIcon[] = []
  const addIcon = (pos: Position, glyph: string, color: string, name: string) => {
    const { px, py } = projectIso(pos.x, pos.y, layout)
    icons.push({ px, py, glyph, color, name })
  }

  // Named regions (RP-22) — a faint ring at the region anchor.
  for (const region of state.namedRegions) {
    addIcon(region.anchor, '◦', REGION_ICON_COLOR, region.name)
  }
  // Fixed landmarks.
  addIcon(state.houseEntranceOverworld, 'α', LANDMARK_COLOR, 'House')
  addIcon(state.caveEntranceOverworld, 'O', LANDMARK_COLOR, 'Cave')
  if (state.whineEntranceOverworld) {
    addIcon(state.whineEntranceOverworld, 'W', LANDMARK_COLOR, 'Whine')
  }
  for (const ruin of state.ruinInteriors) {
    addIcon(ruin.entranceOverworld, ruin.glyph ?? '⌂', LANDMARK_COLOR, ruin.name)
  }
  // Steward's own marks.
  for (const camera of state.placedCameras) {
    addIcon({ x: camera.x, y: camera.y }, '⌖', CAMERA_COLOR, 'Field Camera')
  }
  for (const meteorite of state.placedMeteorites) {
    addIcon(meteorite, '✦', METEORITE_COLOR, 'Meteorite')
  }
  for (const marker of state.placedMarkers) {
    addIcon({ x: marker.x, y: marker.y }, '⚑', HOT_PINK, marker.label)
  }

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${String(ICON_GLYPH_PX)}px monospace`
  for (const icon of icons) {
    ctx.fillStyle = icon.color
    ctx.fillText(icon.glyph, icon.px, icon.py)
  }

  return icons
}

// Fill the entire viewport — the map maximizes over everything, including
// the bottom bar (ModalShell is z-30; the bottom bar is z-10).
const computeViewport = (): { width: number; height: number } => ({
  width: window.innerWidth,
  height: window.innerHeight,
})

interface HoverState {
  name: string
  x: number
  y: number
}

interface MapPanelProps {
  state: GameState
  onDismiss: () => void
}

export const MapPanel = ({ state, onDismiss }: MapPanelProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const iconsRef = useRef<MapIcon[]>([])
  const [viewport, setViewport] = useState(computeViewport)
  const [hover, setHover] = useState<HoverState | null>(null)

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
    // Canvas redraws only on render (refreshUI) and resize — never on
    // mousemove. Capture the hit-targets for hover lookup.
    iconsRef.current = drawMap(ctx, state, viewport.width, viewport.height)
  })

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const icon = findHoveredIcon(iconsRef.current, mx, my)
    setHover(icon ? { name: icon.name, x: mx, y: my } : null)
  }

  return (
    <ModalShell onDismiss={onDismiss} ariaLabel="Prairie map" data-testid="map-overlay">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={viewport.width}
          height={viewport.height}
          style={{ width: `${String(viewport.width)}px`, height: `${String(viewport.height)}px` }}
          onMouseMove={onMouseMove}
          onMouseLeave={() => {
            setHover(null)
          }}
        />
        {hover && (
          <div
            className="bg-border-dim/90 text-permacomputer pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded px-2 py-1 font-mono text-xs"
            style={{ left: hover.x, top: hover.y - 8 }}
          >
            {hover.name}
          </div>
        )}
      </div>
    </ModalShell>
  )
}
