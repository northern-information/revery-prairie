import { ACTION_COLOR } from '../../constants'
import type { CharMetrics, GameState } from '../../types'
import { type RenderPass, registerPass } from '../passes'

const isActive = (state: GameState): boolean => state.selectionBox !== null

const draw = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  _metrics: CharMetrics,
  _time: number,
): void => {
  const box = state.selectionBox
  if (!box) return
  const x = Math.min(box.startScreen.x, box.endScreen.x)
  const y = Math.min(box.startScreen.y, box.endScreen.y)
  const w = Math.abs(box.endScreen.x - box.startScreen.x)
  const h = Math.abs(box.endScreen.y - box.startScreen.y)
  ctx.fillStyle = 'rgba(255, 105, 180, 0.15)'
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = ACTION_COLOR
  ctx.lineWidth = 1
  ctx.strokeRect(x, y, w, h)
}

export const rtsSelectionBoxPass: RenderPass = {
  id: 'rts-selection-box',
  slot: 'screen-overlay',
  isActive,
  draw,
}

registerPass(rtsSelectionBoxPass)
