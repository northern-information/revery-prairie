// Click-target feedback. When the player initiates a click-to-move
// (left or right mouse) the destination tile briefly "pops and fades"
// in hot pink so the player can see where they're headed. Entities are
// spawned by effects.spawnClickTarget and reaped by celestial cleanup.

import { CLICK_TARGET_COLOR, CLICK_TARGET_DURATION_MS, CLICK_TARGET_POP_MS } from '../../constants'
import { ComponentType } from '../../ecs/types'
import { drawCellHighlight, worldToScreen } from '../../projection'
import { registerPass } from '../passes'
import { getTierGrid, liftAt } from '../tierGrid'

import type { CharMetrics, GameState } from '../../types'
import type { RenderPass } from '../passes'

const isActive = (state: GameState): boolean => {
  for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) === 'clickTarget') return true
  }
  return false
}

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, time: number): void => {
  const { camera, viewportWidth, viewportHeight } = state
  const { charWidth, charHeight } = metrics
  const tierGrid = getTierGrid(state.elevation, state.mapWidth, state.mapHeight)

  for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag, ComponentType.Position)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'clickTarget') continue
    const effect = state.world.getComponent(eid, ComponentType.TimedEffect)
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!effect || !pos) continue

    const elapsed = time - effect.startTime
    if (elapsed < 0 || elapsed > CLICK_TARGET_DURATION_MS) continue

    // Pop curve: ramp 0 → 1 over CLICK_TARGET_POP_MS, then ease-out fade back to 0.
    let alpha: number
    if (elapsed <= CLICK_TARGET_POP_MS) {
      alpha = elapsed / CLICK_TARGET_POP_MS
    } else {
      const fadeProgress = (elapsed - CLICK_TARGET_POP_MS) / (CLICK_TARGET_DURATION_MS - CLICK_TARGET_POP_MS)
      // Ease-out cubic for a gentler trail.
      alpha = 1 - fadeProgress * fadeProgress * fadeProgress
    }
    if (alpha <= 0) continue

    const { px, py } = worldToScreen(pos.x, pos.y, camera, charWidth, charHeight, viewportWidth, viewportHeight)
    const pyLift = py + liftAt(tierGrid, pos.x, pos.y, state.mapWidth, state.mapHeight)
    ctx.globalAlpha = alpha
    drawCellHighlight(ctx, px, pyLift, charWidth, charHeight, CLICK_TARGET_COLOR)
    ctx.globalAlpha = 1
  }
}

export const clickTargetPass: RenderPass = {
  id: 'click-target',
  slot: 'effect',
  isActive,
  draw,
}

registerPass(clickTargetPass)
