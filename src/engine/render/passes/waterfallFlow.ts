import {
  WATERFALL_FLOW_CADENCE_MS,
  WATERFALL_FLOW_GLYPHS,
  WATERFALL_FROZEN_GLYPH,
  getPondBgColor,
  getRiverBgColor,
} from '../../tileBg'
import { worldToScreen } from '../../projection'
import { posKey } from '../../position'
import { Zone } from '../../types'
import { registerPass } from '../passes'

import type { CharMetrics, GameState } from '../../types'
import type { RenderPass } from '../passes'

// RP-64 — Waterfalls drawn on the iso side wall between top and
// bottom tiles. Flowing waterfalls animate a 3-glyph cycle at
// WATERFALL_FLOW_CADENCE_MS; frozen waterfalls show a single
// static glyph. Lives in its own per-frame pass (rather than on
// the bg cache) because animation would invalidate the cache
// every cadence step.
//
// Slot 'world-overlay' — drawn after the bg cache (so RP-41's
// cliff shadow sits beneath the moving water) but before glyphs
// and entities (so the player avatar sits on top of the top
// tile's center, well above the side wall).
const isActive = (state: GameState): boolean => state.currentZone === Zone.Overworld && state.waterfalls.size > 0

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, time: number): void => {
  const { camera, viewportWidth, viewportHeight, waterfalls } = state
  const { charWidth, charHeight } = metrics
  const tick = Math.floor(time / WATERFALL_FLOW_CADENCE_MS)
  const flowGlyph = WATERFALL_FLOW_GLYPHS[tick % WATERFALL_FLOW_GLYPHS.length]

  const savedFont = ctx.font
  const savedAlign = ctx.textAlign
  const savedBaseline = ctx.textBaseline
  ctx.font = `${String(charHeight)}px monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  for (const waterfall of waterfalls.values()) {
    // Anchor at the midpoint between top and bottom tile centers
    // — visually sits on the iso side wall connecting them.
    const midX = (waterfall.topX + waterfall.bottomX) / 2
    const midY = (waterfall.topY + waterfall.bottomY) / 2
    const { px, py } = worldToScreen(midX, midY, camera, charWidth, charHeight, viewportWidth, viewportHeight)
    // Color: pull from the source's water palette so river-fed and
    // pond-fed waterfalls match their feeder. Frozen waterfalls
    // get a single colder shade (lighter pale blue derived from
    // the river palette).
    const sourceKey = posKey(waterfall.topX, waterfall.topY)
    const isPond = state.ponds.has(sourceKey)
    const baseColor = isPond ? getPondBgColor(waterfall.topX, waterfall.topY) : getRiverBgColor(waterfall.topX, waterfall.topY)
    ctx.fillStyle = waterfall.frozen ? '#cfe7f5' : baseColor
    ctx.fillText(waterfall.frozen ? WATERFALL_FROZEN_GLYPH : flowGlyph, px, py)
  }

  ctx.font = savedFont
  ctx.textAlign = savedAlign
  ctx.textBaseline = savedBaseline
}

export const waterfallFlowPass: RenderPass = {
  id: 'waterfall-flow',
  slot: 'world-overlay',
  isActive,
  draw,
}

registerPass(waterfallFlowPass)
