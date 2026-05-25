import { tickDeepTime } from '../deepTime'
import { tickDialogTransition, tickDialogTyping } from '../interaction'
import { DeepTimePhase } from '../types'

import type { GameState } from '../types'
import type { GameLoopCallbacks, TickSystem } from './types'

export const interactionSystems = (callbacks: GameLoopCallbacks): TickSystem[] => [
  {
    id: 'dialog',
    intervalMs: 0,
    zone: 'always',
    fn: (state, time) => {
      if (!state.activeDialog) return
      const prevTypingIndex = state.activeDialog.typingIndex
      const prevTransitioning = state.activeDialog.transitioning
      tickDialogTyping(state, time)
      tickDialogTransition(state, time)
      if (
        state.activeDialog.typingIndex !== prevTypingIndex ||
        state.activeDialog.transitioning !== prevTransitioning
      ) {
        callbacks.onRefreshUI?.()
      }
    },
  },
  {
    id: 'deep-time',
    intervalMs: 0,
    zone: 'always',
    priority: -20,
    fn: (() => {
      let lastRefresh = 0
      return (state: GameState, time: number) => {
        if (!state.deepTime?.active) return
        tickDeepTime(state, time)
        if (state.deepTime.phase !== DeepTimePhase.Wandering && time - lastRefresh >= 100) {
          lastRefresh = time
          callbacks.onRefreshUI?.()
        }
      }
    })(),
  },
]
