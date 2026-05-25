import { KEYBOARD_MOVE_TICK_MS, PATH_TICK_MS, SPRINT_MOVE_TICK_MS } from '../constants'
import { pickUpGroundItems } from '../entities'
import { movePlayer, tickPath } from '../movement'
import { DeepTimePhase } from '../types'

import type { GameState } from '../types'
import type { GameLoopCallbacks, TickSystem } from './types'

export const AUTO_HIDE_THRESHOLD = 5

const checkAutoHide = (state: GameState, callbacks: GameLoopCallbacks) => {
  state.panelOpenMoveCount++
  if (state.autoHidePanels && state.panelOpenMoveCount >= AUTO_HIDE_THRESHOLD) {
    callbacks.onAutoHidePanel?.()
  }
}

export const movementSystems = (callbacks: GameLoopCallbacks): TickSystem[] => [
  {
    // Sprint runs at SPRINT_MOVE_TICK_MS with one move per tick instead of
    // two moves per PATH_TICK_MS — keeps the 2x speed but makes every tile
    // a discrete stop point so keyup never overshoots an item.
    id: 'path',
    intervalMs: 0,
    zone: 'always',
    priority: -10,
    fn: (() => {
      let lastMoveTime = 0
      return (state: GameState, time: number) => {
        if (state.deepTime?.active && state.deepTime.phase !== DeepTimePhase.Wandering) return
        if (!state.path) return
        const interval = state.sprinting ? SPRINT_MOVE_TICK_MS : PATH_TICK_MS
        if (time - lastMoveTime < interval) return
        if (!tickPath(state)) return
        lastMoveTime = time
        checkAutoHide(state, callbacks)
        pickUpGroundItems(state, time)
        callbacks.onRefreshUI?.()
      }
    })(),
  },
  {
    id: 'keyboard-move',
    intervalMs: 0,
    zone: 'always',
    priority: -5,
    fn: (() => {
      let lastMoveTime = 0
      return (state: GameState, time: number) => {
        if (state.deepTime?.active && state.deepTime.phase !== DeepTimePhase.Wandering) return
        if (!state.heldDirection) return
        if (state.activeDialog) return
        if (state.path) return
        const interval = state.sprinting ? SPRINT_MOVE_TICK_MS : KEYBOARD_MOVE_TICK_MS
        if (time - lastMoveTime < interval) return
        if (!movePlayer(state, state.heldDirection)) return
        lastMoveTime = time
        // RTS pan: WASD does NOT auto-recenter. Only spacebar and
        // click-to-move pull the camera back to the player; WASD lets
        // the user walk while leaving the camera wherever they panned it.
        checkAutoHide(state, callbacks)
        pickUpGroundItems(state, time)
        callbacks.onRefreshUI?.()
      }
    })(),
  },
]
