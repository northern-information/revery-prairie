import {
  DEEP_TIME_BURN_DURATION_MS,
  DEEP_TIME_TOTAL_YEARS,
  DEEP_TIME_TRANSITION_DURATION_MS,
  DEEP_TIME_TRANSITION_GLYPH_DURATION_MS,
  DEEP_TIME_YEARS_PER_FRAME,
} from '../constants'
import { initiateDeepTime, tickDeepTime } from '../deepTime'
import { DeepTimePhase } from '../types'
import { createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

import type { GameState } from '../types'

const tickToWandering = (state: GameState): void => {
  initiateDeepTime(state, 0)
  // Advance past burning phase
  tickDeepTime(state, DEEP_TIME_BURN_DURATION_MS + 1)
  // Tick enough frames to reach total years
  const framesNeeded = Math.ceil(DEEP_TIME_TOTAL_YEARS / DEEP_TIME_YEARS_PER_FRAME)
  for (let i = 0; i < framesNeeded + 1; i++) {
    tickDeepTime(state, DEEP_TIME_BURN_DURATION_MS + 2 + i)
  }
}

describe('deep time transition', () => {
  describe('transition is set when entering Wandering', () => {
    it('sets deepTimeTransition with startTime and duration', () => {
      const state = createTestState()
      expect(state.deepTimeTransition).toBeNull()

      tickToWandering(state)

      expect(state.deepTime?.phase).toBe(DeepTimePhase.Wandering)
      expect(state.deepTimeTransition).not.toBeNull()
      expect(state.deepTimeTransition?.duration).toBe(DEEP_TIME_TRANSITION_DURATION_MS)
      expect(typeof state.deepTimeTransition?.startTime).toBe('number')
    })

    it('does not set transition during Burning or Simulating', () => {
      const state = createTestState()
      initiateDeepTime(state, 0)

      expect(state.deepTime?.phase).toBe(DeepTimePhase.Burning)
      expect(state.deepTimeTransition).toBeNull()

      tickDeepTime(state, DEEP_TIME_BURN_DURATION_MS + 1)
      expect(state.deepTime?.phase).toBe(DeepTimePhase.Simulating)
      expect(state.deepTimeTransition).toBeNull()
    })
  })

  describe('transition is not set without deep time', () => {
    it('deepTimeTransition is null in fresh game state', () => {
      const state = createTestState()
      expect(state.deepTimeTransition).toBeNull()
    })
  })

  describe('constants', () => {
    it('has expected transition duration', () => {
      expect(DEEP_TIME_TRANSITION_DURATION_MS).toBe(1000)
    })

    it('has expected glyph crossfade duration', () => {
      expect(DEEP_TIME_TRANSITION_GLYPH_DURATION_MS).toBe(800)
    })

    it('glyph duration is less than or equal to transition duration', () => {
      expect(DEEP_TIME_TRANSITION_GLYPH_DURATION_MS).toBeLessThanOrEqual(DEEP_TIME_TRANSITION_DURATION_MS)
    })
  })
})
