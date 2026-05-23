import {
  BG_COLOR,
  ZONE_TRANSITION_FADE_IN_MS,
  ZONE_TRANSITION_FADE_OUT_MS,
  ZONE_TRANSITION_HOLD_MS,
} from '../../constants'
import { RuinArchetype } from '../../types'
import { registerPass } from '../passes'

import type { CharMetrics, GameState, ZoneTransition } from '../../types'
import type { RenderPass } from '../passes'

const ZONE_LABEL_COLOR = '#d8a860'
// Title Case per writing-style rule for in-game entry names.
const RUIN_ARCHETYPE_LABEL: Record<string, string> = {
  [RuinArchetype.DormantGarden]: 'Dormant Garden',
}

const getDestinationLabel = (state: GameState, transition: ZoneTransition): string => {
  if (transition.direction === 'exit') return 'Revery Prairie'
  if (transition.kind === 'cave') return 'Cave'
  if (transition.kind === 'house') return 'The Little House'
  // Ruin enter — "<archetype> <name>" if both are known, else fall
  // back to whichever is available, else generic "Ruin".
  const idx = transition.ruinIndex
  if (idx !== null) {
    const interior = state.ruinInteriors[idx]
    if (interior) {
      const archetype = RUIN_ARCHETYPE_LABEL[interior.archetype]
      const name = interior.name
      if (archetype && name) return `${archetype} ${name}`
      if (archetype) return archetype
      if (name) return name
    }
  }
  return 'Ruin'
}

// Crossfade through black with a hold at peak. Three phases keyed
// off elapsed time (ms) within the transition:
//   [0, fadeIn)                    -> alpha 0 -> 1, source scene
//   [fadeIn, fadeIn + hold)        -> alpha 1, swap fires mid-hold
//   [fadeIn + hold, total)         -> alpha 1 -> 0, destination scene
const overlayAlpha = (elapsed: number): number => {
  if (elapsed <= 0) return 0
  if (elapsed < ZONE_TRANSITION_FADE_IN_MS) {
    return elapsed / ZONE_TRANSITION_FADE_IN_MS
  }
  const holdStart = ZONE_TRANSITION_FADE_IN_MS
  const holdEnd = holdStart + ZONE_TRANSITION_HOLD_MS
  if (elapsed < holdEnd) return 1
  const total = holdEnd + ZONE_TRANSITION_FADE_OUT_MS
  if (elapsed < total) {
    return 1 - (elapsed - holdEnd) / ZONE_TRANSITION_FADE_OUT_MS
  }
  return 0
}

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, time: number): void => {
  const transition = state.zoneTransition
  if (!transition) return

  const elapsed = time - transition.startTime
  const alpha = overlayAlpha(elapsed)
  if (alpha <= 0) return

  const pxWidth = state.viewportWidth * metrics.charWidth
  const pxHeight = state.viewportHeight * metrics.charHeight

  const prevAlpha = ctx.globalAlpha
  ctx.globalAlpha = alpha
  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, pxWidth, pxHeight)

  // Destination zone label — centered, Times New Roman italic, gold.
  // Same triangle-wave alpha as the overlay so the text rides the
  // fade in and out.
  const prevFont = ctx.font
  const prevAlign = ctx.textAlign
  const prevBaseline = ctx.textBaseline
  // Scale font with charHeight so it adapts to the viewport's grid.
  const labelSize = Math.max(28, Math.round(metrics.charHeight * 1.6))
  ctx.font = `italic ${String(labelSize)}px "Times New Roman", Times, serif`
  ctx.fillStyle = ZONE_LABEL_COLOR
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(getDestinationLabel(state, transition), pxWidth / 2, pxHeight / 2)
  ctx.font = prevFont
  ctx.textAlign = prevAlign
  ctx.textBaseline = prevBaseline
  ctx.globalAlpha = prevAlpha
}

export const zoneTransitionOverlayPass: RenderPass = {
  id: 'zone-transition-overlay',
  slot: 'screen-overlay',
  isActive: state => state.zoneTransition !== null,
  draw,
}

registerPass(zoneTransitionOverlayPass)
