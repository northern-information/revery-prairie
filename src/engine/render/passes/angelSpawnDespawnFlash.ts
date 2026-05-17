import { LIGHTNING_SCREEN_FLASH_MS, LIGHTNING_SCREEN_FLASH_OPACITY } from '../../constants'
import { registerPass } from '../passes'

import type { CharMetrics, GameState } from '../../types'
import type { RenderPass } from '../passes'

// Reuses the lightning screen flash duration/opacity constants — a
// deliberate visual rhyme with the lightning flash, kept in sync.

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, time: number): void => {
  const elapsed = time - state.angelFlashTime
  if (elapsed >= LIGHTNING_SCREEN_FLASH_MS) return
  const alpha = LIGHTNING_SCREEN_FLASH_OPACITY * (1 - elapsed / LIGHTNING_SCREEN_FLASH_MS)
  const pxWidth = state.viewportWidth * metrics.charWidth
  const pxHeight = state.viewportHeight * metrics.charHeight
  ctx.fillStyle = `rgba(255, 255, 255, ${String(alpha)})`
  ctx.fillRect(0, 0, pxWidth, pxHeight)
}

export const angelSpawnDespawnFlashPass: RenderPass = {
  id: 'angel-spawn-despawn-flash',
  slot: 'screen-overlay',
  isActive: () => true,
  draw,
}

registerPass(angelSpawnDespawnFlashPass)
