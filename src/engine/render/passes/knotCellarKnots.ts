import { getAlcovePosition } from '../../cellar'
import { CELLAR_KNOT_COLOR, CELLAR_KNOT_GLYPH } from '../../constants'
import { worldToScreen } from '../../projection'
import { Zone } from '../../types'
import { registerPass } from '../passes'

import type { CharMetrics, GameState } from '../../types'
import type { RenderPass } from '../passes'

// RP-37 — render the Revery Knot glyph (`§`) at each archived alcove.
//
// While `state.bedKnotPresent === true`, an extra `§` is drawn at alcove
// index `archivedKnots.length` — the in-hand knot whose archive entry
// has not yet been committed at Winter→Spring per RP-36. The visual is
// therefore continuous across the archive flip: pre-archive the glyph
// is sourced from `bedKnotPresent`, post-archive from the new
// `archivedKnots` entry, but it stays at the same alcove tile.

const isActive = (state: GameState): boolean => state.currentZone === Zone.KnotCellar

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, _time: number): void => {
  const { camera, viewportWidth, viewportHeight, archivedKnots, bedKnotPresent } = state
  const { charWidth, charHeight } = metrics

  ctx.save()
  ctx.fillStyle = CELLAR_KNOT_COLOR
  ctx.font = `${String(charHeight)}px monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const drawKnotAt = (index: number): void => {
    const { x, y } = getAlcovePosition(index)
    const { px, py } = worldToScreen(x, y, camera, charWidth, charHeight, viewportWidth, viewportHeight)
    ctx.fillText(CELLAR_KNOT_GLYPH, px, py)
  }

  for (let i = 0; i < archivedKnots.length; i++) {
    drawKnotAt(i)
  }
  if (bedKnotPresent) {
    drawKnotAt(archivedKnots.length)
  }

  ctx.restore()
}

export const knotCellarKnotsPass: RenderPass = {
  id: 'knot-cellar-knots',
  slot: 'effect',
  isActive,
  draw,
}

registerPass(knotCellarKnotsPass)
