import { updateCamera } from './camera'
import {
  ZONE_TRANSITION_DURATION_MS,
  ZONE_TRANSITION_FADE_IN_MS,
  ZONE_TRANSITION_HOLD_MS,
} from './constants'
import type {
  GameState,
  Position,
  ZoneTransition,
  ZoneTransitionDirection,
  ZoneTransitionKind,
} from './types'

// Elapsed time at which the deferred map swap fires. Sits in the
// middle of the hold so the swap is fully covered by peak black.
const ZONE_TRANSITION_SWAP_AT_MS = ZONE_TRANSITION_FADE_IN_MS + ZONE_TRANSITION_HOLD_MS / 2

export interface ScheduleZoneTransitionInput {
  direction: ZoneTransitionDirection
  kind: ZoneTransitionKind
  irisCenter: Position
  ruinIndex?: number
}

// Registered at module load by cave.ts and ruins.ts. Avoids a circular
// import between zoneTransition.ts and those modules. Each handler is
// the existing enterCave / enterRuin / exitCave / exitRuin function.
type SwapHandler = (state: GameState, transition: ZoneTransition) => void

const swapHandlers = new Map<string, SwapHandler>()

const swapKey = (kind: ZoneTransitionKind, direction: ZoneTransitionDirection): string =>
  `${kind}:${direction}`

export const registerZoneSwapHandler = (
  kind: ZoneTransitionKind,
  direction: ZoneTransitionDirection,
  handler: SwapHandler,
): void => {
  swapHandlers.set(swapKey(kind, direction), handler)
}

/**
 * Schedule a zone transition. The map swap is deferred to
 * tickZoneTransition at midpoint. If a transition is already in flight
 * the call is ignored.
 */
export const scheduleZoneTransition = (
  state: GameState,
  time: number,
  input: ScheduleZoneTransitionInput,
): boolean => {
  if (state.zoneTransition !== null) return false

  state.zoneTransition = {
    startTime: time,
    duration: ZONE_TRANSITION_DURATION_MS,
    direction: input.direction,
    kind: input.kind,
    irisCenter: { x: input.irisCenter.x, y: input.irisCenter.y },
    ruinIndex: input.ruinIndex ?? null,
    swapApplied: false,
  }
  return true
}

/**
 * Compute progress in [0, 1] from a transition and current time. A
 * zero-or-negative duration is treated as already complete.
 */
export const getZoneTransitionProgress = (
  transition: ZoneTransition,
  time: number,
): number => {
  if (transition.duration <= 0) return 1
  const elapsed = time - transition.startTime
  if (elapsed <= 0) return 0
  if (elapsed >= transition.duration) return 1
  return elapsed / transition.duration
}

/**
 * Advance the active zone transition. Fires the deferred map swap
 * exactly once when progress crosses the midpoint, and clears the
 * transition once progress reaches 1.
 */
export const tickZoneTransition = (state: GameState, time: number): void => {
  const transition = state.zoneTransition
  if (!transition) return

  const elapsed = time - transition.startTime
  const progress = getZoneTransitionProgress(transition, time)

  // Fire the swap when (a) we have reached the mid-hold swap moment,
  // or (b) the transition is already complete (progress >= 1) — the
  // latter covers zero-or-negative durations where the swap moment
  // would otherwise never be reached.
  const shouldSwap = elapsed >= ZONE_TRANSITION_SWAP_AT_MS || progress >= 1
  if (!transition.swapApplied && shouldSwap) {
    const handler = swapHandlers.get(swapKey(transition.kind, transition.direction))
    if (handler) {
      handler(state, transition)
    }
    // Snap the camera to center on the player's new position so the
    // fade-out reveals the player at the viewport center.
    updateCamera(state)
    transition.swapApplied = true
  }

  if (progress >= 1) {
    state.zoneTransition = null
  }
}

/**
 * True while a zone transition is in flight. Used by input handlers to
 * short-circuit movement and interaction.
 */
export const isZoneTransitioning = (state: GameState): boolean =>
  state.zoneTransition !== null

/**
 * True while any full-screen overlay is gating input — zone transition
 * or the boot title card. Movement and interaction handlers route
 * through here so the player can't walk while the canvas is black.
 */
export const isInputGated = (state: GameState): boolean =>
  state.zoneTransition !== null || state.bootTitleCard !== null
