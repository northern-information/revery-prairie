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
 * and textAlign default 'left'). In orthogonal mode this is the
 * cell's top-left. In isometric mode the cell is a 2:1 diamond
 * (2*charWidth wide, charHeight tall); the anchor is shifted right
 * by charWidth/2 so a charWidth-wide glyph renders horizontally
 * centered within the diamond. Vertically the glyph bbox is aligned
 * with the diamond bbox so the visible character sits in the middle
 * band of the diamond rather than hanging out below it.
 *
 * The iso origin offsets (originX, originY) are chosen so the center
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
  isometric: boolean,
  viewportWidth: number,
  viewportHeight: number,
): ScreenPos => {
  if (!isometric) {
    return { px: vx * charWidth, py: vy * charHeight }
  }
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
  isometric: boolean,
  viewportWidth: number,
  viewportHeight: number,
): ScreenPos =>
  viewportToScreen(
    worldX - camera.x,
    worldY - camera.y,
    charWidth,
    charHeight,
    isometric,
    viewportWidth,
    viewportHeight,
  )

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
  isometric = false,
  viewportWidth = 0,
  viewportHeight = 0,
): Position => {
  if (!isometric) {
    return {
      x: Math.floor(canvasX / charWidth) + camera.x,
      y: Math.floor(canvasY / charHeight) + camera.y,
    }
  }
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
 * is anchored at (px, py) in iso mode. Reverses the horizontal-centering
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
  charHeight: number,
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
 * Paints the cell background under a glyph anchored at (px, py).
 * In orthogonal mode this is a fillRect of (charWidth × charHeight).
 * In isometric mode this is a 2:1 diamond whose bounding box is
 * 2*charWidth × charHeight, with the glyph anchor centered
 * horizontally within. Caller sets ctx.fillStyle before invoking.
 */
export const drawCellBackground = (
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  charWidth: number,
  charHeight: number,
  isometric: boolean,
): void => {
  if (!isometric) {
    ctx.fillRect(px, py, charWidth, charHeight)
    return
  }
  const { leftX, rightX, topY, bottomY, cx, cy } = getCellDiamondCorners(
    px,
    py,
    charWidth,
    charHeight,
  )
  ctx.beginPath()
  ctx.moveTo(cx, topY)
  ctx.lineTo(rightX, cy)
  ctx.lineTo(cx, bottomY)
  ctx.lineTo(leftX, cy)
  ctx.closePath()
  ctx.fill()
}
