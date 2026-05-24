// RP-18 — render pass for placed meteorites, golden connecting
// lines, hallowed-ground tint, and the inventory-hover preview.
//
// Pipeline order: 'effect' slot, so the lines and glyphs sit above
// terrain glyphs (a faint line buried under a '%' grass tile would be
// invisible). The hallowed-ground tint is intentionally subtle (~6%
// opacity) so terrain reads through it; it does not need to live in
// 'world-overlay' for that to work.

import { ACTION_COLOR } from '../../constants'
import { findMeteoriteDropTarget } from '../../entities'
import { findPickupableMeteorite } from '../../interaction'
import { findItemByDefinition } from '../../inventory'
import { drawCellHighlight, getCellDiamondCorners, worldToScreen } from '../../projection'
import {
  containingPolygonsKey,
  getHallowedPolygons,
  getStoneCircleGraph,
} from '../../stoneCircles'
import { registerPass } from '../passes'
import { getTierGrid, liftAt } from '../tierGrid'

import type { CharMetrics, GameState, Position } from '../../types'
import type { RenderPass } from '../passes'

const METEORITE_GLYPH = '✦'
const METEORITE_COLOR = '#FFE4B5'
const LINE_COLOR_BASE = 'rgba(255, 215, 0, ' // gold, alpha appended
const TINT_COLOR = 'rgba(255, 215, 0, 0.06)'
const PREVIEW_COLOR_BASE = 'rgba(255, 105, 180, ' // hot pink, alpha appended
const CYCLE_EDGE_ALPHA = 0.55
const CHAIN_EDGE_ALPHA = 0.35
const PREVIEW_CLOSURE_ALPHA = 0.95
const PREVIEW_CHAIN_ALPHA = 0.75

const isActive = (state: GameState): boolean =>
  state.placedMeteorites.length > 0 || state.stoneCirclePreview

const cellCenter = (
  pos: Position,
  state: GameState,
  charWidth: number,
  charHeight: number,
  tierGrid: ReturnType<typeof getTierGrid>
): { cx: number; cy: number } => {
  const { px, py } = worldToScreen(
    pos.x,
    pos.y,
    state.camera,
    charWidth,
    charHeight,
    state.viewportWidth,
    state.viewportHeight
  )
  const lift = liftAt(tierGrid, pos.x, pos.y, state.mapWidth, state.mapHeight)
  const corners = getCellDiamondCorners(px, py - lift, charWidth, charHeight)
  return { cx: corners.cx, cy: corners.cy }
}

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, _time: number): void => {
  const placed = state.placedMeteorites
  // Preview is only meaningful while the steward actually holds a meteorite —
  // if they drag-placed or [X]-dropped the last one, the flag may still be
  // true (the hover handler only fires on mouse move), so gate render-time
  // on inventory contents too. Position is recomputed every frame using the
  // same DROP_DELTAS search dropItem() uses, so the preview shows the
  // actual tile a drop would land on.
  const hasMeteorite = findItemByDefinition(state.backpack, 'meteorite') !== undefined
  const preview: Position | null =
    state.stoneCirclePreview && hasMeteorite ? findMeteoriteDropTarget(state) : null
  if (placed.length === 0 && preview === null) return

  const { charWidth, charHeight } = metrics
  const tierGrid = getTierGrid(state.elevation, state.mapWidth, state.mapHeight)

  const edges = getStoneCircleGraph(placed)
  const polygons = placed.length >= 3 ? getHallowedPolygons(placed, edges) : []

  // Which edges participate in at least one cycle? An edge { aIndex, bIndex }
  // is in a cycle iff some polygon ring contains the (a, b) pair adjacently.
  const cycleEdgeKey = (a: number, b: number): string => `${String(Math.min(a, b))}-${String(Math.max(a, b))}`
  const cycleEdges = new Set<string>()
  for (const ring of polygons) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % ring.length]
      cycleEdges.add(cycleEdgeKey(a, b))
    }
  }

  // --- Hallowed ground tint -------------------------------------------------
  // Iterate viewport tiles; for each tile center inside any polygon, fill the
  // cell background with a faint gold wash. Small (~600 tiles per frame) so
  // the per-tile point-in-polygon checks are cheap.
  if (polygons.length > 0) {
    const savedFill = ctx.fillStyle
    ctx.fillStyle = TINT_COLOR
    const vx0 = state.camera.x
    const vy0 = state.camera.y
    const vw = state.viewportWidth
    const vh = state.viewportHeight
    for (let y = vy0; y < vy0 + vh; y++) {
      for (let x = vx0; x < vx0 + vw; x++) {
        if (x < 0 || y < 0 || x >= state.mapWidth || y >= state.mapHeight) continue
        const key = containingPolygonsKey(polygons, placed, x, y)
        if (key === '') continue
        const { px, py } = worldToScreen(x, y, state.camera, charWidth, charHeight, vw, vh)
        const lift = liftAt(tierGrid, x, y, state.mapWidth, state.mapHeight)
        const corners = getCellDiamondCorners(px, py - lift, charWidth, charHeight)
        // Diamond fill via path.
        ctx.beginPath()
        ctx.moveTo(corners.cx, corners.topY)
        ctx.lineTo(corners.rightX, corners.cy)
        ctx.lineTo(corners.cx, corners.bottomY)
        ctx.lineTo(corners.leftX, corners.cy)
        ctx.closePath()
        ctx.fill()
      }
    }
    ctx.fillStyle = savedFill
  }

  // --- Connecting lines (placed meteorites only) ----------------------------
  if (edges.length > 0) {
    const savedStroke = ctx.strokeStyle
    const savedWidth = ctx.lineWidth
    ctx.lineWidth = 1
    for (const e of edges) {
      const isCycle = cycleEdges.has(cycleEdgeKey(e.aIndex, e.bIndex))
      const alpha = isCycle ? CYCLE_EDGE_ALPHA : CHAIN_EDGE_ALPHA
      ctx.strokeStyle = `${LINE_COLOR_BASE}${String(alpha)})`
      const a = cellCenter(placed[e.aIndex], state, charWidth, charHeight, tierGrid)
      const b = cellCenter(placed[e.bIndex], state, charWidth, charHeight, tierGrid)
      ctx.beginPath()
      ctx.moveTo(a.cx, a.cy)
      ctx.lineTo(b.cx, b.cy)
      ctx.stroke()
    }
    ctx.strokeStyle = savedStroke
    ctx.lineWidth = savedWidth
  }

  // --- Hover preview --------------------------------------------------------
  // Treat the preview tile as a transient additional meteorite. Recompute the
  // proximity graph and polygons with it appended; new edges (those touching
  // the preview vertex) draw in pink, with closure edges drawing brighter.
  if (preview !== null) {
    const augmented = [...placed, preview]
    const previewIndex = augmented.length - 1
    const augEdges = getStoneCircleGraph(augmented)
    const augPolygons = augmented.length >= 3 ? getHallowedPolygons(augmented, augEdges) : []
    const augCycleEdges = new Set<string>()
    for (const ring of augPolygons) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]
        const b = ring[(i + 1) % ring.length]
        augCycleEdges.add(cycleEdgeKey(a, b))
      }
    }

    const savedStroke = ctx.strokeStyle
    const savedWidth = ctx.lineWidth
    ctx.lineWidth = 1
    for (const e of augEdges) {
      if (e.aIndex !== previewIndex && e.bIndex !== previewIndex) continue
      const isClosure = augCycleEdges.has(cycleEdgeKey(e.aIndex, e.bIndex))
      const alpha = isClosure ? PREVIEW_CLOSURE_ALPHA : PREVIEW_CHAIN_ALPHA
      ctx.strokeStyle = `${PREVIEW_COLOR_BASE}${String(alpha)})`
      const a = cellCenter(augmented[e.aIndex], state, charWidth, charHeight, tierGrid)
      const b = cellCenter(augmented[e.bIndex], state, charWidth, charHeight, tierGrid)
      ctx.beginPath()
      ctx.moveTo(a.cx, a.cy)
      ctx.lineTo(b.cx, b.cy)
      ctx.stroke()
    }
    ctx.strokeStyle = savedStroke
    ctx.lineWidth = savedWidth
  }

  // --- Pickup highlight ----------------------------------------------------
  // Pink cell highlight on the placed meteorite under foot or in the facing
  // direction — pairs with the "[F] Pickup Meteorite" prompt and matches
  // the right-click-walk pink palette.
  const pickup = findPickupableMeteorite(state)
  if (pickup) {
    const { px, py } = worldToScreen(
      pickup.x,
      pickup.y,
      state.camera,
      charWidth,
      charHeight,
      state.viewportWidth,
      state.viewportHeight
    )
    const lift = liftAt(tierGrid, pickup.x, pickup.y, state.mapWidth, state.mapHeight)
    const savedAlpha = ctx.globalAlpha
    ctx.globalAlpha = 0.55
    drawCellHighlight(ctx, px, py - lift, charWidth, charHeight, ACTION_COLOR)
    ctx.globalAlpha = savedAlpha
  }

  // --- Meteorite glyphs (drawn last so they sit above lines) ----------------
  const savedFill = ctx.fillStyle
  ctx.fillStyle = METEORITE_COLOR
  for (const pos of placed) {
    const { px, py } = worldToScreen(
      pos.x,
      pos.y,
      state.camera,
      charWidth,
      charHeight,
      state.viewportWidth,
      state.viewportHeight
    )
    const lift = liftAt(tierGrid, pos.x, pos.y, state.mapWidth, state.mapHeight)
    ctx.fillText(METEORITE_GLYPH, px, py - lift)
  }
  ctx.fillStyle = savedFill
}

export const stoneCirclesPass: RenderPass = {
  id: 'stone-circles',
  slot: 'effect',
  isActive,
  draw,
}

registerPass(stoneCirclesPass)
