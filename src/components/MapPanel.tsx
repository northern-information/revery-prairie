import { useEffect, useRef, useState } from 'react'

import { ModalShell } from './ModalShell'
import { projectIso } from './minimapProjection'

import { HOT_PINK } from '@/engine/constants'
import { TileType } from '@/engine/types'
import type { IsoLayout } from './minimapProjection'
import type { GameState, Position, Tile } from '@/engine/types'

// Fit the iso diamond (mapWidth+mapHeight units wide, half that tall) into
// a width x height rectangle, maximizing the tile pitch against whichever
// dimension binds, then center it. Unlike the minimap's square-canvas
// computeIsoLayout, this fills an arbitrary viewport-sized rectangle so the
// map is as large as possible. projectIso consumes the same IsoLayout.
const computeFullscreenLayout = (mapWidth: number, mapHeight: number, width: number, height: number): IsoLayout => {
  if (mapWidth === 0 || mapHeight === 0) return { tilePx: 0, originX: 0, originY: 0 }
  const widthUnits = mapWidth + mapHeight
  // Diamond is widthUnits*tilePx wide and half that tall. Bind on whichever
  // viewport dimension is tighter.
  const tilePx = Math.min(width / widthUnits, height / (widthUnits / 2))
  const drawnWidth = widthUnits * tilePx
  const drawnHeight = drawnWidth / 2
  const originX = (width - drawnWidth) / 2 + mapHeight * tilePx
  const originY = (height - drawnHeight) / 2
  return { tilePx, originX, originY }
}

// RP-70 — The Map. A read-only, full-screen ASCII chart of the prairie,
// launched from the permacomputer MAP tab. Unlike Minimap (a live
// fog-aware HUD glance of the current zone), this is a fixed inherited
// artifact: it always renders the overworld's coastline, water, and
// landmarks regardless of where the steward has walked, plus the
// steward's own marks (placed cameras, meteorites, Geodetic Markers). It
// does not pause the prairie clock — consulting it is a free action like
// every other permacomputer surface. It mounts full-screen (not inside
// the 500px shell) following the ScanResultModal / TimeLapsePlayback
// precedent; Escape or a backdrop click closes it.

const PARCHMENT_BG = '#1A1714'
const COASTLINE_COLOR = '#5A4A38'
const WATER_COLOR = '#3D6FA8'
const LANDMARK_COLOR = '#C2B280'
const REGION_LABEL_COLOR = '#8A8266'
const CAMERA_COLOR = '#FFD700'
const METEORITE_COLOR = '#FFE4B5'

// Fixed, readable label/glyph sizes — independent of the tile pitch.
const LANDMARK_GLYPH_PX = 16
const LABEL_PX = 11

const drawIsoTile = (ctx: CanvasRenderingContext2D, layout: IsoLayout, worldX: number, worldY: number, color: string) => {
  const { px, py } = projectIso(worldX, worldY, layout)
  ctx.fillStyle = color
  ctx.fillRect(Math.round(px - layout.tilePx), Math.round(py), Math.ceil(layout.tilePx * 2), Math.ceil(layout.tilePx))
}

const drawLandmark = (
  ctx: CanvasRenderingContext2D,
  layout: IsoLayout,
  pos: Position,
  glyph: string,
  color: string,
  label?: string
) => {
  const { px, py } = projectIso(pos.x, pos.y, layout)
  ctx.fillStyle = color
  ctx.font = `${String(LANDMARK_GLYPH_PX)}px monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(glyph, px, py)
  if (label) {
    ctx.fillStyle = REGION_LABEL_COLOR
    ctx.font = `${String(LABEL_PX)}px monospace`
    ctx.textBaseline = 'top'
    ctx.fillText(label, px, py + LANDMARK_GLYPH_PX * 0.6)
  }
}

// A coastline tile is a non-void tile adjacent (4-neighbor) to the Space
// void or the map edge — the boundary of the dirt island. Drawn as a thin
// outline rather than a fill, keeping the sparse-chart register.
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

const drawMap = (ctx: CanvasRenderingContext2D, state: GameState, width: number, height: number) => {
  const w = state.overworldMapWidth
  const h = state.overworldMapHeight
  const map = state.overworldMap
  const layout = computeFullscreenLayout(w, h, width, height)

  ctx.fillStyle = PARCHMENT_BG
  ctx.fillRect(0, 0, width, height)
  if (layout.tilePx === 0) return

  // Coastline — the outline of the dirt island against the Space void.
  // Drawn first so water and marks layer on top.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isCoastline(map, w, h, x, y)) drawIsoTile(ctx, layout, x, y, COASTLINE_COLOR)
    }
  }

  // Water — ponds and rivers (overworld posKey sets).
  for (const key of state.ponds) {
    const [x, y] = key.split(',').map(Number)
    drawIsoTile(ctx, layout, x, y, WATER_COLOR)
  }
  for (const key of state.rivers) {
    const [x, y] = key.split(',').map(Number)
    drawIsoTile(ctx, layout, x, y, WATER_COLOR)
  }

  // Named-region labels (RP-22) at each region anchor. A map names its
  // places; the chart is not fog-gated.
  ctx.fillStyle = REGION_LABEL_COLOR
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${String(LABEL_PX)}px monospace`
  for (const region of state.namedRegions) {
    const { px, py } = projectIso(region.anchor.x, region.anchor.y, layout)
    ctx.fillText(region.name, px, py)
  }

  // Fixed landmarks — always shown.
  drawLandmark(ctx, layout, state.houseEntranceOverworld, 'α', LANDMARK_COLOR, 'House')
  drawLandmark(ctx, layout, state.caveEntranceOverworld, 'O', LANDMARK_COLOR, 'Cave')
  if (state.whineEntranceOverworld) {
    drawLandmark(ctx, layout, state.whineEntranceOverworld, 'W', LANDMARK_COLOR, 'Whine')
  }
  for (const ruin of state.ruinInteriors) {
    drawLandmark(ctx, layout, ruin.entranceOverworld, ruin.glyph ?? '⌂', LANDMARK_COLOR, ruin.name)
  }

  // Steward's own marks.
  for (const camera of state.placedCameras) {
    drawLandmark(ctx, layout, { x: camera.x, y: camera.y }, '⌖', CAMERA_COLOR)
  }
  for (const meteorite of state.placedMeteorites) {
    drawLandmark(ctx, layout, meteorite, '✦', METEORITE_COLOR)
  }

  // Geodetic Markers — hot pink with their GM-N labels. Every placed
  // marker is projected at its stored tile, regardless of placement zone.
  for (const marker of state.placedMarkers) {
    drawLandmark(ctx, layout, { x: marker.x, y: marker.y }, '⚑', HOT_PINK, marker.label)
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
    drawMap(ctx, state, viewport.width, viewport.height)
    // Redraws on every render (refreshUI bumps the consumer) and on resize;
    // the chart is cheap and reads the latest marks each time.
  })

  return (
    <ModalShell onDismiss={onDismiss} ariaLabel="Prairie map" data-testid="map-overlay">
      <canvas
        ref={canvasRef}
        width={viewport.width}
        height={viewport.height}
        style={{ width: `${String(viewport.width)}px`, height: `${String(viewport.height)}px` }}
      />
    </ModalShell>
  )
}
