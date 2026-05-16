import { ZONE_TRANSITION_DURATION_MS, ZONE_TRANSITION_MIDPOINT } from './constants'
import type {
  GameState,
  Position,
  ZoneTransition,
  ZoneTransitionDirection,
  ZoneTransitionKind,
} from './types'

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

  const progress = getZoneTransitionProgress(transition, time)

  if (!transition.swapApplied && progress >= ZONE_TRANSITION_MIDPOINT) {
    const handler = swapHandlers.get(swapKey(transition.kind, transition.direction))
    if (handler) {
      handler(state, transition)
    }
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
