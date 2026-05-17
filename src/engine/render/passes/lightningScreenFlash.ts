import { LIGHTNING_DURATION_MS, LIGHTNING_SCREEN_FLASH_MS, LIGHTNING_SCREEN_FLASH_OPACITY } from '../../constants'
import { ComponentType } from '../../ecs/types'
import { isEntityInCurrentZone } from '../../zone'
import { registerPass } from '../passes'

import type { CharMetrics, GameState } from '../../types'
import type { RenderPass } from '../passes'

const earliestLightningElapsed = (state: GameState, time: number): number => {
  let earliest = Infinity
  for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
    if (!isEntityInCurrentZone(state, eid)) continue
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag !== 'lightning') continue
    const effect = state.world.getComponent(eid, ComponentType.TimedEffect)
    if (!effect) continue
    const elapsed = time - effect.startTime
    if (elapsed >= LIGHTNING_DURATION_MS) continue
    if (elapsed < earliest) earliest = elapsed
  }
  return earliest
}

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, time: number): void => {
  const elapsed = earliestLightningElapsed(state, time)
  if (elapsed >= LIGHTNING_SCREEN_FLASH_MS) return
  const alpha = LIGHTNING_SCREEN_FLASH_OPACITY * (1 - elapsed / LIGHTNING_SCREEN_FLASH_MS)
  const pxWidth = state.viewportWidth * metrics.charWidth
  const pxHeight = state.viewportHeight * metrics.charHeight
  ctx.fillStyle = `rgba(255, 255, 255, ${String(alpha)})`
  ctx.fillRect(0, 0, pxWidth, pxHeight)
}

// Time-dependent pass: isActive is left permissive and draw() bails on
// elapsed >= threshold using the same `time` value used elsewhere in the
// frame. Using performance.now() here would risk a 1-frame predicate /
// draw mismatch.
export const lightningScreenFlashPass: RenderPass = {
  id: 'lightning-screen-flash',
  slot: 'screen-overlay',
  isActive: () => true,
  draw,
}

registerPass(lightningScreenFlashPass)
