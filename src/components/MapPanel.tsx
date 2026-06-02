import { useEffect, useRef } from 'react'

import { computeIsoLayout, projectIso } from './minimapProjection'

import { HOT_PINK } from '@/engine/constants'
import type { IsoLayout } from './minimapProjection'
import type { GameState, Position } from '@/engine/types'

// RP-70 — The Map. A read-only ASCII chart of the prairie surfaced as a
// permacomputer tab. Unlike Minimap (a live fog-aware HUD glance of the
// current zone), this is a fixed inherited artifact: it always renders
// the overworld's water and landmarks regardless of where the steward
// has walked, plus the steward's own marks (placed cameras, meteorites,
// and Geodetic Markers). It does not pause the prairie clock — opening
// the tab is a free action like every other permacomputer surface.

// Reduced pitch: larger than Minimap's 176px square so the chart reads,
// smaller than gameplay. The iso layout scales the 147x147 overworld to
// fit this square.
const MAP_CSS_SIZE = 460

const PARCHMENT_BG = '#1A1714'
const WATER_COLOR = '#3D6FA8'
const LANDMARK_COLOR = '#C2B280'
const REGION_LABEL_COLOR = '#8A8266'
const CAMERA_COLOR = '#FFD700'
const METEORITE_COLOR = '#FFE4B5'

const drawIsoTile = (ctx: CanvasRenderingContext2D, layout: IsoLayout, worldX: number, worldY: number, color: string) => {
  const { px, py } = projectIso(worldX, worldY, layout)
  ctx.fillStyle = color
  ctx.fillRect(Math.round(px - layout.tilePx), Math.round(py), layout.tilePx * 2, layout.tilePx)
}

// A landmark glyph drawn at a world tile, optionally labeled. Glyph size
// tracks the pitch so landmarks stay legible against the sparse field.
// Landmark glyphs use a fixed, readable size rather than scaling with the
// (tiny ~1.6px) tile pitch — at 147 tiles the pitch is far too small for
// legible text. Labels sit just below the glyph.
const LANDMARK_GLYPH_PX = 14
const LABEL_PX = 9

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

const drawMap = (ctx: CanvasRenderingContext2D, state: GameState) => {
  const w = state.overworldMapWidth
  const h = state.overworldMapHeight
  const layout = computeIsoLayout(w, h, MAP_CSS_SIZE)

  ctx.fillStyle = PARCHMENT_BG
  ctx.fillRect(0, 0, MAP_CSS_SIZE, MAP_CSS_SIZE)
  if (layout.tilePx === 0) return

  // Water — the one terrain layer the chart carries. Ponds and rivers
  // are overworld posKey sets.
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
  // marker is projected at its stored tile, regardless of the zone it
  // was placed in.
  for (const marker of state.placedMarkers) {
    drawLandmark(ctx, layout, { x: marker.x, y: marker.y }, '⚑', HOT_PINK, marker.label)
  }
}

interface MapPanelProps {
  state: GameState
}

export const MapPanel = ({ state }: MapPanelProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawMap(ctx, state)
    // Redraw whenever the panel re-renders (refreshUI bumps the consumer);
    // the chart is cheap and reads the latest marks each time.
  })

  return (
    <div className="flex flex-col items-center gap-2 p-3 font-mono">
      <canvas
        ref={canvasRef}
        width={MAP_CSS_SIZE}
        height={MAP_CSS_SIZE}
        style={{ width: `${String(MAP_CSS_SIZE)}px`, height: `${String(MAP_CSS_SIZE)}px` }}
      />
    </div>
  )
}
