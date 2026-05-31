import type { Position } from './types'

export interface ScreenPos {
  px: number
  py: number
}

export interface DiamondCorners {
  leftX: number
  rightX: number
  topY: number
  bottomY: number
  cx: number
  cy: number
}

/**
 * Returns the (px, py) anchor at which a monospace glyph at viewport
 * tile (vx, vy) should be drawn (ctx.fillText with textBaseline 'top'
 * and textAlign default 'left'). The cell is a 2:1 diamond
 * (2*charWidth wide, charHeight tall); the anchor is shifted right
 * by charWidth/2 so a charWidth-wide glyph renders horizontally
 * centered within the diamond. Vertically the glyph bbox is aligned
 * with the diamond bbox so the visible character sits in the middle
 * band of the diamond rather than hanging out below it.
 *
 * The origin offsets (originX, originY) are chosen so the center
 * viewport tile (viewportWidth/2, viewportHeight/2) projects to the
 * canvas center (viewportWidth*charWidth/2, viewportHeight*charHeight/2).
 *
 * drawCellBackground reverses the horizontal centering offset to draw
 * the diamond shape; getCellDiamondCorners exposes the same geometry
 * for callers that need to stroke individual edges (e.g. the
 * land/space border outline).
 */
const ISO_GLYPH_VERTICAL_NUDGE = (_charHeight: number): number => 0

export const viewportToScreen = (
  vx: number,
  vy: number,
  charWidth: number,
  charHeight: number,
  viewportWidth: number,
  viewportHeight: number
): ScreenPos => {
  const halfH = charHeight / 2
  const originX = isoOriginX(viewportWidth, viewportHeight, charWidth)
  const originY = isoOriginY(viewportWidth, viewportHeight, charHeight)
  return {
    px: (vx - vy) * charWidth + originX + charWidth / 2,
    py: (vx + vy) * halfH + originY + ISO_GLYPH_VERTICAL_NUDGE(charHeight),
  }
}

export const worldToScreen = (
  worldX: number,
  worldY: number,
  camera: Position,
  charWidth: number,
  charHeight: number,
  viewportWidth: number,
  viewportHeight: number
): ScreenPos =>
  viewportToScreen(worldX - camera.x, worldY - camera.y, charWidth, charHeight, viewportWidth, viewportHeight)

/**
 * Iso pixel offset for a fractional world-tile delta. Use to translate
 * the rendered scene by sub-tile amounts without disturbing integer
 * camera coordinates that drive tile indexing. dx/dy are world tiles;
 * positive dx is east, positive dy is south. The returned (px, py) is
 * the iso-projected canvas-space delta the entire scene would shift
 * if the camera advanced by (dx, dy) tiles.
 */
export const worldDeltaToIsoPx = (dx: number, dy: number, charWidth: number, charHeight: number): ScreenPos => ({
  px: (dx - dy) * charWidth,
  py: (dx + dy) * (charHeight / 2),
})

// Horizontally center the iso footprint so the center viewport tile
// projects to canvas center x. Solving px(vw/2, vh/2) = vw*cw/2 yields
// originX = (vh*cw)/2 - cw/2. Independent of viewportWidth because the
// (vx - vy) term cancels at the center.
const isoOriginX = (_viewportWidth: number, viewportHeight: number, charWidth: number): number =>
  (viewportHeight * charWidth) / 2 - charWidth / 2

// Vertically center: solve py(vw/2, vh/2) = vh*cH/2.
// (vw/2 + vh/2)*cH/2 + originY = vh*cH/2
//   →  originY = (vh - vw)/4 * cH
// Negative for wide viewports (typical), shifts iso footprint up.
const isoOriginY = (viewportWidth: number, viewportHeight: number, charHeight: number): number =>
  ((viewportHeight - viewportWidth) / 4) * charHeight

export const screenToTile = (
  canvasX: number,
  canvasY: number,
  camera: Position,
  charWidth: number,
  charHeight: number,
  viewportWidth: number,
  viewportHeight: number
): Position => {
  const halfH = charHeight / 2
  const originX = isoOriginX(viewportWidth, viewportHeight, charWidth)
  const originY = isoOriginY(viewportWidth, viewportHeight, charHeight)
  const nudge = ISO_GLYPH_VERTICAL_NUDGE(charHeight)
  // viewport (vx, vy) where px = (vx - vy)*charWidth + originX + cw/2,
  //                     py = (vx + vy)*halfH + originY + nudge.
  const fx = (canvasX - originX - charWidth / 2) / charWidth
  const fy = (canvasY - originY - nudge) / halfH
  return {
    x: Math.floor((fx + fy) / 2) + camera.x,
    y: Math.floor((fy - fx) / 2) + camera.y,
  }
}

/**
 * Returns the four diamond vertex coordinates for a cell whose glyph
 * is anchored at (px, py). Reverses the horizontal-centering
 * and vertical-nudge offsets to recover the diamond's bounding box.
 *
 * The diamond is 2*charWidth wide and charHeight tall. Vertices:
 *   top    = (cx, topY)
 *   right  = (rightX, cy)
 *   bottom = (cx, bottomY)
 *   left   = (leftX, cy)
 */
export const getCellDiamondCorners = (
  px: number,
  py: number,
  charWidth: number,
  charHeight: number
): DiamondCorners => {
  const nudge = ISO_GLYPH_VERTICAL_NUDGE(charHeight)
  const leftX = px - charWidth / 2
  const rightX = leftX + 2 * charWidth
  const topY = py - nudge
  const bottomY = topY + charHeight
  return {
    leftX,
    rightX,
    topY,
    bottomY,
    cx: leftX + charWidth,
    cy: topY + charHeight / 2,
  }
}

/**
 * Paints a highlight (cursor target, selection, etc.) under the glyph at
 * (px, py): a soft outer glow of `color` followed by the solid cell
 * background. The glow gives interactive highlights more visual presence
 * without shifting the glyph or distorting the diamond shape — useful
 * because the diamond's narrow top/bottom apexes can otherwise leave
 * the highlight feeling thin.
 *
 * Sets and restores ctx.fillStyle, ctx.shadowColor, and ctx.shadowBlur.
 * Caller does NOT need to pre-set fillStyle.
 */
export const drawCellHighlight = (
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  charWidth: number,
  charHeight: number,
  color: string
): void => {
  const savedFill = ctx.fillStyle
  const savedShadowBlur = ctx.shadowBlur
  const savedShadowColor = ctx.shadowColor
  ctx.fillStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = Math.max(charWidth, charHeight) * 0.75
  drawCellBackground(ctx, px, py, charWidth, charHeight)
  ctx.shadowBlur = savedShadowBlur
  ctx.shadowColor = savedShadowColor
  ctx.fillStyle = savedFill
}

/**
 * Paints the cell background under a glyph anchored at (px, py).
 * The cell is a 2:1 diamond whose bounding box is
 * 2*charWidth × charHeight, with the glyph anchor centered
 * horizontally within. Caller sets ctx.fillStyle before invoking.
 */
export const drawCellBackground = (
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  charWidth: number,
  charHeight: number
): void => {
  const { leftX, rightX, topY, bottomY, cx, cy } = getCellDiamondCorners(px, py, charWidth, charHeight)
  ctx.beginPath()
  ctx.moveTo(cx, topY)
  ctx.lineTo(rightX, cy)
  ctx.lineTo(cx, bottomY)
  ctx.lineTo(leftX, cy)
  ctx.closePath()
  ctx.fill()
}

/**
 * Cosmetic terrain elevation. Each tile's surface lifts up (negative y)
 * for elev > 50, sinks down (positive y) for elev < 50. Range is
 * [-charHeight*FRAC, +charHeight*FRAC]. elev=undefined → 0 (e.g. cave,
 * out-of-bounds, space tiles).
 */
export const ELEVATION_LIFT_FRACTION = 0.35

export const getElevationLift = (elevation: number | undefined, charHeight: number): number => {
  if (elevation === undefined) return 0
  const max = charHeight * ELEVATION_LIFT_FRACTION
  return -((elevation - 50) / 50) * max
}

export interface SideQuads {
  leftQuad: [number, number][]
  rightQuad: [number, number][]
}

/**
 * Side-wall geometry: returns the two visible quads (left + right
 * wall) connecting a lifted diamond top at (px, py) down to the
 * flat-baseline diamond. Returns null when lift >= 0 (sunken — no wall
 * drawn; neighbors' walls are responsible for the depression).
 */
export const getCellSideQuads = (
  px: number,
  py: number,
  charWidth: number,
  charHeight: number,
  lift: number
): SideQuads | null => {
  if (lift >= 0) return null
  const top = getCellDiamondCorners(px, py, charWidth, charHeight)
  const base = getCellDiamondCorners(px, py - lift, charWidth, charHeight)
  return {
    leftQuad: [
      [top.leftX, top.cy],
      [top.cx, top.bottomY],
      [base.cx, base.bottomY],
      [base.leftX, base.cy],
    ],
    rightQuad: [
      [top.cx, top.bottomY],
      [top.rightX, top.cy],
      [base.rightX, base.cy],
      [base.cx, base.bottomY],
    ],
  }
}

/**
 * Paints the side walls of a tile whose top diamond is anchored at
 * (px, py). Each face is drawn independently with its own depth (px
 * to extend down) and its own color, so callers can render only the
 * faces that border a lower neighbor — e.g. for tier-based "Minecraft"
 * stepped terrain, draw the south face only when the south neighbor
 * is at a lower tier, and similarly for the east face. depth=0 skips
 * that face. The left face faces SOUTH in world coords (lower-left in
 * iso screen space); the right face faces EAST (lower-right).
 */
// RP-41 — cliff-face shadow + x-ray constants. Trigger threshold is
// in elevation units so it stays coupled with CLIMBABLE_STEP_THRESHOLD
// in position.ts — shadows appear precisely where the step is
// unclimbable. Picked the elevation-unit framing over the spec's
// pixel-delta framing because the player-facing intent is "the
// shadow marks where the feet can't go," not "the shadow marks where
// the lift is big." Same outcome in practice.
export const CLIFF_SHADOW_COLOR = 'rgba(0, 0, 0, 0.55)'
export const XRAY_ALPHA = 0.45
export const AVATAR_OCCLUSION_PAD = 4

// Rectangle in screen-space pixels (axis-aligned). Used by the x-ray
// occlusion check and any caller that needs to reason about a tile's
// drawn footprint.
export interface ScreenRect {
  left: number
  right: number
  top: number
  bottom: number
}

// RP-41 — Axis-aligned bounding rect of a tile's lifted diamond. Caller
// supplies the glyph anchor (px, py) and the lift value returned by
// getElevationLift (negative = lifted up). The rect spans the full
// diamond width (2*charWidth) and the diamond height plus the lifted
// extension.
export const getTileScreenRect = (
  px: number,
  py: number,
  charWidth: number,
  charHeight: number,
  lift: number
): ScreenRect => ({
  left: px - charWidth,
  right: px + charWidth,
  top: py + lift,
  bottom: py + charHeight,
})

// RP-41 — True when the two rects overlap on both axes. Used by the
// x-ray rule to detect tiles whose lifted footprint would occlude
// the player avatar's screen-space rect.
export const rectsOverlap = (a: ScreenRect, b: ScreenRect): boolean =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

// RP-41 — Player avatar's screen-space rect, inflated by
// AVATAR_OCCLUSION_PAD. The avatar is a single glyph, so its rect is
// charWidth × charHeight centered on the projected player anchor.
export const getAvatarScreenRect = (
  playerPx: number,
  playerPy: number,
  charWidth: number,
  charHeight: number,
  pad: number = AVATAR_OCCLUSION_PAD
): ScreenRect => ({
  left: playerPx - charWidth / 2 - pad,
  right: playerPx + charWidth / 2 + pad,
  top: playerPy - pad,
  bottom: playerPy + charHeight + pad,
})

// RP-41 — True when the tile sits "in front of" the player in iso
// z-order (drawn later) AND its lifted screen rect overlaps the
// avatar's rect. Tiles behind the player in z-order are never
// occluders — they are drawn earlier and the avatar is drawn on top
// of them by default.
export const isTileOccludingAvatar = (
  tileWorldX: number,
  tileWorldY: number,
  tileScreenRect: ScreenRect,
  playerWorldX: number,
  playerWorldY: number,
  avatarRect: ScreenRect
): boolean => {
  if (tileWorldX + tileWorldY <= playerWorldX + playerWorldY) return false
  return rectsOverlap(tileScreenRect, avatarRect)
}

export const drawCellWalls = (
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  charWidth: number,
  charHeight: number,
  leftDepth: number,
  rightDepth: number,
  leftColor: string,
  rightColor: string
): void => {
  if (leftDepth <= 0 && rightDepth <= 0) return
  const top = getCellDiamondCorners(px, py, charWidth, charHeight)
  if (leftDepth > 0) {
    const base = getCellDiamondCorners(px, py + leftDepth, charWidth, charHeight)
    ctx.fillStyle = leftColor
    ctx.beginPath()
    ctx.moveTo(top.leftX, top.cy)
    ctx.lineTo(top.cx, top.bottomY)
    ctx.lineTo(base.cx, base.bottomY)
    ctx.lineTo(base.leftX, base.cy)
    ctx.closePath()
    ctx.fill()
  }
  if (rightDepth > 0) {
    const base = getCellDiamondCorners(px, py + rightDepth, charWidth, charHeight)
    ctx.fillStyle = rightColor
    ctx.beginPath()
    ctx.moveTo(top.cx, top.bottomY)
    ctx.lineTo(top.rightX, top.cy)
    ctx.lineTo(base.rightX, base.cy)
    ctx.lineTo(base.cx, base.bottomY)
    ctx.closePath()
    ctx.fill()
  }
}
