import { ComponentType } from './ecs/types'

import type { GameState, MovementTween } from './types'

export const clearMovementTweens = (state: GameState): void => {
  state.playerTween = null
  state.cameraTween = null
  for (const eid of state.world.query(ComponentType.MovementTween)) {
    state.world.removeComponent(eid, ComponentType.MovementTween)
  }
}

export const getTweenLerp = (
  tween: MovementTween,
  time: number,
  toX: number,
  toY: number
): { x: number; y: number; t: number } => {
  if (!Number.isFinite(time)) {
    return { x: toX, y: toY, t: 1 }
  }
  if (tween.durationMs <= 0) {
    return { x: toX, y: toY, t: 1 }
  }
  const elapsed = time - tween.startTime
  const t = elapsed <= 0 ? 0 : elapsed >= tween.durationMs ? 1 : elapsed / tween.durationMs
  return {
    x: tween.fromX + (toX - tween.fromX) * t,
    y: tween.fromY + (toY - tween.fromY) * t,
    t,
  }
}
