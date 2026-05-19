import { SCAN_DURATION_MS } from '../../constants'
import { FLORA_SPECIES } from '../../flora/species'
import { worldToScreen } from '../../projection'
import { registerPass } from '../passes'

import type { CharMetrics, GameState } from '../../types'
import type { RenderPass } from '../passes'

// Precis #6 — scan progress arc.
//
// While state.scanInProgress is non-null, draw a thin colored arc at the
// target tile position. The arc sweeps from 0° at the top, clockwise,
// filling proportionally to elapsed / SCAN_DURATION_MS. Color is the
// species color from FLORA_SPECIES at ~60% alpha.

const ARC_ALPHA = 0.6
const ARC_LINE_WIDTH = 2
// Inset the arc slightly inside the tile so it reads as "marking this tile."
const ARC_INSET_FRACTION = 0.15

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, time: number): void => {
  const progress = state.scanInProgress
  if (!progress) return

  const elapsed = time - progress.startTime
  const t = Math.max(0, Math.min(1, elapsed / SCAN_DURATION_MS))
  if (t <= 0) return

  const { charWidth, charHeight } = metrics
  const { camera, viewportWidth, viewportHeight } = state
  const { px, py } = worldToScreen(
    progress.target.x,
    progress.target.y,
    camera,
    charWidth,
    charHeight,
    viewportWidth,
    viewportHeight
  )

  // worldToScreen returns the baseline of the glyph. Use the tile box
  // centered on the glyph cell — px is the left edge, py is the baseline.
  const cx = px + charWidth / 2
  const cy = py - charHeight / 2
  const inset = Math.min(charWidth, charHeight) * ARC_INSET_FRACTION
  const radius = Math.min(charWidth, charHeight) / 2 - inset

  const species = FLORA_SPECIES[progress.species]
  const color = species.color

  const savedAlpha = ctx.globalAlpha
  const savedLineWidth = ctx.lineWidth
  const savedStrokeStyle = ctx.strokeStyle

  ctx.globalAlpha = savedAlpha * ARC_ALPHA
  ctx.strokeStyle = color
  ctx.lineWidth = ARC_LINE_WIDTH

  ctx.beginPath()
  // Start at -π/2 (12 o'clock), sweep clockwise by t * 2π.
  ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + t * 2 * Math.PI)
  ctx.stroke()

  ctx.globalAlpha = savedAlpha
  ctx.lineWidth = savedLineWidth
  ctx.strokeStyle = savedStrokeStyle
}

export const scanProgressPass: RenderPass = {
  id: 'scan-progress',
  slot: 'effect',
  isActive: state => state.scanInProgress !== null,
  draw,
}

registerPass(scanProgressPass)
