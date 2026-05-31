import { describe, expect, it } from 'vitest'
import {
  ZONE_TRANSITION_FADE_IN_MS,
  ZONE_TRANSITION_FADE_OUT_MS,
  ZONE_TRANSITION_HOLD_MS,
} from '../../../constants'
import { RuinArchetype } from '../../../types'
import { getDestinationLabel, overlayAlpha, zoneTransitionOverlayPass } from '../zoneTransitionOverlay'

import type { GameState, ZoneTransition, ZoneTransitionDirection, ZoneTransitionKind } from '../../../types'

const makeTransition = (kind: ZoneTransitionKind, direction: ZoneTransitionDirection, ruinIndex: number | null = null): ZoneTransition => ({
  startTime: 0,
  duration: ZONE_TRANSITION_FADE_IN_MS + ZONE_TRANSITION_HOLD_MS + ZONE_TRANSITION_FADE_OUT_MS,
  direction,
  kind,
  irisCenter: { x: 0, y: 0 },
  ruinIndex,
  swapApplied: false,
})

// Minimal state shape — only the fields the label resolver and the
// pass's isActive predicate read. Cast to GameState so we don't fabricate
// the rest of the world.
const makeState = (overrides: Partial<GameState> = {}): GameState =>
  ({
    zoneTransition: null,
    ruinInteriors: [],
    ...overrides,
  }) as GameState

describe('zoneTransitionOverlay', () => {
  describe('overlayAlpha', () => {
    it('returns 0 before the transition starts', () => {
      expect(overlayAlpha(-50)).toBe(0)
      expect(overlayAlpha(0)).toBe(0)
    })

    it('ramps linearly from 0 to 1 across the fade-in window', () => {
      expect(overlayAlpha(ZONE_TRANSITION_FADE_IN_MS / 2)).toBeCloseTo(0.5, 5)
      expect(overlayAlpha(ZONE_TRANSITION_FADE_IN_MS * 0.25)).toBeCloseTo(0.25, 5)
    })

    it('holds at 1 for the entire hold window', () => {
      expect(overlayAlpha(ZONE_TRANSITION_FADE_IN_MS)).toBe(1)
      expect(overlayAlpha(ZONE_TRANSITION_FADE_IN_MS + ZONE_TRANSITION_HOLD_MS / 2)).toBe(1)
      // The last millisecond of the hold is still at 1.
      expect(overlayAlpha(ZONE_TRANSITION_FADE_IN_MS + ZONE_TRANSITION_HOLD_MS - 1)).toBe(1)
    })

    it('ramps linearly from 1 to 0 across the fade-out window', () => {
      const holdEnd = ZONE_TRANSITION_FADE_IN_MS + ZONE_TRANSITION_HOLD_MS
      expect(overlayAlpha(holdEnd + ZONE_TRANSITION_FADE_OUT_MS / 2)).toBeCloseTo(0.5, 5)
      expect(overlayAlpha(holdEnd + ZONE_TRANSITION_FADE_OUT_MS * 0.75)).toBeCloseTo(0.25, 5)
    })

    it('returns 0 once elapsed has passed the full duration', () => {
      const total = ZONE_TRANSITION_FADE_IN_MS + ZONE_TRANSITION_HOLD_MS + ZONE_TRANSITION_FADE_OUT_MS
      expect(overlayAlpha(total)).toBe(0)
      expect(overlayAlpha(total + 1000)).toBe(0)
    })
  })

  describe('getDestinationLabel', () => {
    it('returns "Yard" for kind="yard" enter', () => {
      const state = makeState()
      expect(getDestinationLabel(state, makeTransition('yard', 'enter'))).toBe('Yard')
    })

    it('returns "Yard" for kind="house-to-yard" exit (RP-67)', () => {
      const state = makeState()
      expect(getDestinationLabel(state, makeTransition('house-to-yard', 'exit'))).toBe('Yard')
    })

    it('returns "Revery Prairie" for any other exit (gate, cave, ruin, house)', () => {
      const state = makeState()
      expect(getDestinationLabel(state, makeTransition('yard', 'exit'))).toBe('Revery Prairie')
      expect(getDestinationLabel(state, makeTransition('cave', 'exit'))).toBe('Revery Prairie')
      expect(getDestinationLabel(state, makeTransition('ruin', 'exit'))).toBe('Revery Prairie')
      expect(getDestinationLabel(state, makeTransition('house', 'exit'))).toBe('Revery Prairie')
    })

    it('returns "Cave" for cave enter', () => {
      const state = makeState()
      expect(getDestinationLabel(state, makeTransition('cave', 'enter'))).toBe('Cave')
    })

    it('returns "The Little House" for house enter', () => {
      const state = makeState()
      expect(getDestinationLabel(state, makeTransition('house', 'enter'))).toBe('The Little House')
    })

    it('returns "<archetype> <name>" when both are known for a ruin enter', () => {
      const state = makeState({
        ruinInteriors: [
          {
            archetype: RuinArchetype.DormantGarden,
            name: 'Threshold',
          },
        ] as GameState['ruinInteriors'],
      })
      expect(getDestinationLabel(state, makeTransition('ruin', 'enter', 0))).toBe('Dormant Garden Threshold')
    })

    it('returns just the archetype label when name is missing', () => {
      const state = makeState({
        ruinInteriors: [
          {
            archetype: RuinArchetype.DormantGarden,
            name: '',
          },
        ] as GameState['ruinInteriors'],
      })
      expect(getDestinationLabel(state, makeTransition('ruin', 'enter', 0))).toBe('Dormant Garden')
    })

    it('returns just the name when the archetype has no Title-Case label', () => {
      const state = makeState({
        ruinInteriors: [
          {
            archetype: 'unknownArchetype',
            name: 'Hollow',
          },
        ] as unknown as GameState['ruinInteriors'],
      })
      expect(getDestinationLabel(state, makeTransition('ruin', 'enter', 0))).toBe('Hollow')
    })

    it('falls back to "Ruin" when neither archetype nor name resolves', () => {
      const state = makeState({ ruinInteriors: [] })
      // ruinIndex points at no interior — falls through.
      expect(getDestinationLabel(state, makeTransition('ruin', 'enter', 5))).toBe('Ruin')
    })

    it('falls back to "Ruin" when ruinIndex is null on a ruin transition', () => {
      const state = makeState()
      expect(getDestinationLabel(state, makeTransition('ruin', 'enter', null))).toBe('Ruin')
    })
  })

  describe('zoneTransitionOverlayPass', () => {
    it('is registered with the screen-overlay slot', () => {
      expect(zoneTransitionOverlayPass.id).toBe('zone-transition-overlay')
      expect(zoneTransitionOverlayPass.slot).toBe('screen-overlay')
    })

    it('isActive returns true exactly when state.zoneTransition is non-null', () => {
      expect(zoneTransitionOverlayPass.isActive(makeState())).toBe(false)
      expect(zoneTransitionOverlayPass.isActive(makeState({ zoneTransition: makeTransition('yard', 'enter') }))).toBe(true)
    })
  })
})
