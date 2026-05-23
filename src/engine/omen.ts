// Precis #32 — dormancy pressure (forcing function).
//
// The three predicates from precis #4 (bee on shoulder, distant meteorite,
// cloud passing the sun) are RETIRED. See v6 thinktank round 6 in
// docs/precis-thinktank-v6.md for the doctrinal critique — the three were
// rare, frame-stacked, and not aimed at the steward. They have been deleted.
//
// This module is now a pressure tick. Each frame in gameLoop:
//   - tickDormancyPressure(state) applies the linear ramp floor when the
//     standard gates pass (no active Revery, no deep time, Overworld zone,
//     Autumn season, cooldown elapsed). The floor is a linear function of
//     state.seasonalPhase between REVERY_PRESSURE_RAMP_START (0.5, autumn
//     equinox) and REVERY_PRESSURE_RAMP_END (0.75, winter solstice).
//   - contributeDormancyPressure(state, amount) is the entry point precis-36
//     (The Revery Knot) will call on Knot pickup. Precis-32 itself never
//     calls this — it exists so the contract is locked once.
//
// state.dormancyPressure crossing 1.0 schedules the Revery; the threshold
// check and initiateRevery call live in gameLoop, not here.

import {
  REVERY_COOLDOWN_MS,
  REVERY_PRESSURE_RAMP_END,
  REVERY_PRESSURE_RAMP_START,
} from './constants'
import { Season, Zone } from './types'

import type { GameState } from './types'

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))

// Returns true when the per-frame pressure tick should run.
// Same gate logic as the retired detectOmen — preserves back-to-back-
// Revery prevention via REVERY_COOLDOWN_MS.
const pressureGateOpen = (state: GameState, time: number): boolean => {
  if (state.revery) return false
  if (state.deepTime?.active) return false
  if (state.currentZone !== Zone.Overworld) return false
  if (state.weather.season !== Season.Autumn) return false
  if (time - state.lastReveryEndTime < REVERY_COOLDOWN_MS) return false
  return true
}

// Per-frame pressure tick. Sets state.dormancyPressure to max(prior, floor)
// when the gate is open; no-op otherwise. The floor is a linear ramp from
// 0 at the autumn equinox (seasonalPhase = 0.5) to 1 at the winter solstice
// (seasonalPhase = 0.75). Outside the ramp window the floor is 0 (autumn
// not yet) or 1 (past solstice).
export const tickDormancyPressure = (state: GameState, time: number): void => {
  if (!pressureGateOpen(state, time)) return
  const span = REVERY_PRESSURE_RAMP_END - REVERY_PRESSURE_RAMP_START
  const floor = clamp01((state.seasonalPhase - REVERY_PRESSURE_RAMP_START) / span)
  if (floor > state.dormancyPressure) state.dormancyPressure = floor
}

// External contribution entry point. Precis-36 (The Revery Knot) calls this
// on Knot pickup; precis-32 itself never calls it. Adds a non-negative
// amount to dormancyPressure, clamped to [0, 1]. Negative amounts are
// clamped to 0 before addition (no-op).
export const contributeDormancyPressure = (state: GameState, amount: number): void => {
  const safe = Math.max(0, amount)
  state.dormancyPressure = clamp01(state.dormancyPressure + safe)
}
