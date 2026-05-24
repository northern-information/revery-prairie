// Acceptance suite for precis #34 — the tenure opens in the little house.
// Covers: initial-state latch, firstWakeTrigger eligibility (every gate),
// one-shot latch behavior, and onRefreshUI side effect. Emily's dialog
// content is a single unified register asserted in emily-invitation.test.ts;
// the first-wake auto-trigger reuses that register.
import { describe, expect, it, vi } from 'vitest'

import { createGameLoop } from '../gameLoop'
import { createGameState } from '../state'
import { Season, Zone } from '../types'

import { createTestState } from './helpers'

import type { ReveryState } from '../types'

const stubRevery = {} as ReveryState

const stubZoneTransition = {
  startTime: 0,
  fromZone: Zone.HouseInterior,
  toZone: Zone.Overworld,
  kind: 'house',
  direction: 'exit',
  swapApplied: false,
} as unknown as NonNullable<ReturnType<typeof createGameState>['zoneTransition']>

describe('precis #34 — the tenure opens in the little house', () => {
  describe('tenureOpened latch', () => {
    it('createGameState initializes tenureOpened to false', () => {
      const state = createGameState('Test', 20, 20)
      expect(state.tenureOpened).toBe(false)
    })
  })

  describe('firstWakeTrigger TickSystem', () => {
    it('opens Emily dialog at lineIndex 0 (greeting included) when tenure opens in spring', () => {
      const state = createTestState({ keepHouseSpawn: true })
      state.weather.season = Season.Spring
      const refreshUI = vi.fn()
      const loop = createGameLoop(state, { onRefreshUI: refreshUI })

      expect(state.tenureOpened).toBe(false)
      expect(state.activeDialog).toBeNull()

      loop.tick(0)

      expect(state.tenureOpened).toBe(true)
      expect(state.activeDialog).toEqual({
        characterId: 'emily',
        lineIndex: 0,
        typingIndex: 0,
        typingDone: false,
        transitioning: false,
        transitionStartTime: 0,
      })
      expect(refreshUI).toHaveBeenCalled()
    })

    it('opens Emily dialog at lineIndex 1 (skipping the greeting) when tenure opens outside spring', () => {
      for (const season of [Season.Summer, Season.Autumn, Season.Winter]) {
        const state = createTestState({ keepHouseSpawn: true })
        state.weather.season = season
        const loop = createGameLoop(state, {})
        loop.tick(0)
        expect(state.activeDialog?.lineIndex).toBe(1)
        expect(state.tenureOpened).toBe(true)
      }
    })

    it('does not re-fire after tenureOpened latches (one-shot)', () => {
      const state = createTestState({ keepHouseSpawn: true })
      const loop = createGameLoop(state, {})
      loop.tick(0)
      expect(state.tenureOpened).toBe(true)

      // Player closes the dialog.
      state.activeDialog = null

      // Another tick — no re-trigger.
      loop.tick(16)
      expect(state.activeDialog).toBeNull()
    })

    it('short-circuits when tenureOpened is already true', () => {
      const state = createTestState({ keepHouseSpawn: true })
      state.tenureOpened = true
      const loop = createGameLoop(state, {})
      loop.tick(0)
      expect(state.activeDialog).toBeNull()
    })

    it('short-circuits while genesis is still simulating', () => {
      const state = createTestState({ keepHouseSpawn: true })
      // Force genesis non-null without running it.
      state.genesis = { epochIndex: 0 } as unknown as typeof state.genesis
      const loop = createGameLoop(state, {})
      loop.tick(0)
      expect(state.activeDialog).toBeNull()
      expect(state.tenureOpened).toBe(false)
    })

    it('short-circuits while the bootTitleCard fade is still on screen', () => {
      const state = createTestState({ keepHouseSpawn: true })
      state.bootTitleCard = { startTime: 0, label: 'Revery Prairie' }
      const loop = createGameLoop(state, {})
      loop.tick(0)
      expect(state.activeDialog).toBeNull()
      expect(state.tenureOpened).toBe(false)
    })

    it('short-circuits when the player is not in the house interior', () => {
      const state = createTestState({ keepHouseSpawn: true })
      state.currentZone = Zone.Overworld
      const loop = createGameLoop(state, {})
      loop.tick(0)
      expect(state.activeDialog).toBeNull()
      expect(state.tenureOpened).toBe(false)
    })

    it('short-circuits when an unrelated dialog is already open', () => {
      const state = createTestState({ keepHouseSpawn: true })
      const preset = {
        characterId: 'gron',
        lineIndex: 0,
        typingIndex: 0,
        typingDone: false,
        transitioning: false,
        transitionStartTime: 0,
      }
      state.activeDialog = preset
      const loop = createGameLoop(state, {})
      loop.tick(0)
      // Dialog is not replaced; tenureOpened is not latched.
      expect(state.activeDialog).toBe(preset)
      expect(state.tenureOpened).toBe(false)
    })

    it('short-circuits while a Revery is active', () => {
      const state = createTestState({ keepHouseSpawn: true })
      state.revery = stubRevery
      const loop = createGameLoop(state, {})
      loop.tick(0)
      expect(state.activeDialog).toBeNull()
      expect(state.tenureOpened).toBe(false)
    })

    it('short-circuits while a zone transition is in progress', () => {
      const state = createTestState({ keepHouseSpawn: true })
      state.zoneTransition = stubZoneTransition
      const loop = createGameLoop(state, {})
      loop.tick(0)
      expect(state.activeDialog).toBeNull()
      expect(state.tenureOpened).toBe(false)
    })

    it('fires on a later eligible tick after a blocking condition clears', () => {
      const state = createTestState({ keepHouseSpawn: true })
      state.bootTitleCard = { startTime: 0, label: 'Revery Prairie' }
      const loop = createGameLoop(state, {})
      loop.tick(0)
      expect(state.tenureOpened).toBe(false)

      state.bootTitleCard = null
      loop.tick(16)
      expect(state.tenureOpened).toBe(true)
      expect(state.activeDialog?.characterId).toBe('emily')
    })

    it('does not crash when onRefreshUI is undefined', () => {
      const state = createTestState({ keepHouseSpawn: true })
      const loop = createGameLoop(state, {})
      expect(() => {
        loop.tick(0)
      }).not.toThrow()
      expect(state.tenureOpened).toBe(true)
    })
  })
})
