import { getAlcovePosition } from '../../cellar'
import { CELLAR_KNOT_COLOR, CELLAR_KNOT_GLYPH, FOG_EXPLORED_BRIGHTNESS } from '../../constants'
import { worldToScreen } from '../../projection'
import { darkenColor } from '../../tileBg'
import { Zone } from '../../types'
import { getLastVisibleSet, getTileVisibility } from '../../visibility'
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
//
// Fog of war: knots in unexplored tiles are hidden; knots in remembered
// (out-of-gaze) tiles render dimmed by FOG_EXPLORED_BRIGHTNESS so they
// match the cave/ruin remembered-tier register. Visible (in-gaze) knots
// render at full color.

const REMEMBERED_KNOT_COLOR = darkenColor(CELLAR_KNOT_COLOR, FOG_EXPLORED_BRIGHTNESS)

const isActive = (state: GameState): boolean => state.currentZone === Zone.KnotCellar

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, _time: number): void => {
  const { camera, viewportWidth, viewportHeight, archivedKnots, bedKnotPresent } = state
  const { charWidth, charHeight } = metrics
  const visibleSet = getLastVisibleSet() ?? new Set<string>()

  ctx.save()
  ctx.font = `${String(charHeight)}px monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const drawKnotAt = (index: number): void => {
    const { x, y } = getAlcovePosition(index)
    const visibility = getTileVisibility(state, x, y, visibleSet)
    if (visibility === 'unexplored') return
    ctx.fillStyle = visibility === 'visible' ? CELLAR_KNOT_COLOR : REMEMBERED_KNOT_COLOR
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
