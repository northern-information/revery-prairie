import { spawnShootingStar } from '../celestial'
import {
  DEEP_TIME_BURN_DURATION_MS,
  DEEP_TIME_LIGHTNING_COUNT,
  DEEP_TIME_TOTAL_YEARS,
  DEEP_TIME_YEARS_PER_FRAME,
} from '../constants'
import { initiateDeepTime, isDeepTimeLocked, tickDeepTime } from '../deepTime'
import { ComponentType } from '../ecs/types'
import { tickCharacterBehaviors } from '../entities'
import { createGameLoop } from '../gameLoop'
import { DeepTimePhase } from '../types'
import { createCharacterTestEntity, createTestState, getCharacterEntities } from './helpers'
import { describe, expect, it, vi } from 'vitest'

import type { GameState } from '../types'

const enterSimulatingPhase = (state: GameState): void => {
  initiateDeepTime(state, 0)
  tickDeepTime(state, DEEP_TIME_BURN_DURATION_MS + 1)
}

describe('deep time', () => {
  describe('initiation', () => {
    it('initiateDeepTime sets deepTime state', () => {
      const state = createTestState()
      initiateDeepTime(state, 1000)

      const dt = state.deepTime
      expect(dt).not.toBeNull()
      expect(dt?.active).toBe(true)
      expect(dt?.phase).toBe(DeepTimePhase.Burning)
      expect(dt?.elapsedYears).toBe(0)
      expect(dt?.playerGlyph).toBe('ö')
    })

    it('initiateDeepTime clears player state', () => {
      const state = createTestState()

      // Set up active player state
      state.activeDialog = {
        speakerKind: 'character',
        characterId: 'gron',
        lineIndex: 0,
        typingIndex: 0,
        typingDone: false,
        transitioning: false,
        transitionStartTime: 0,
      }
      state.path = [{ x: 10, y: 10 }]

      initiateDeepTime(state, 1000)

      expect(state.activeDialog).toBeNull()
      expect(state.path).toBeNull()
    })

    it('initiateDeepTime removes character entities', () => {
      const state = createTestState()
      createCharacterTestEntity(state, 'gron', state.player.x + 3, state.player.y)

      const beforeCount = getCharacterEntities(state).length
      expect(beforeCount).toBeGreaterThan(0)

      initiateDeepTime(state, 1000)

      const afterCount = getCharacterEntities(state).length
      expect(afterCount).toBe(0)
    })
  })

  describe('burning phase', () => {
    it('burning phase transitions to simulating after duration', () => {
      const state = createTestState()
      initiateDeepTime(state, 0)

      tickDeepTime(state, DEEP_TIME_BURN_DURATION_MS + 1)

      expect(state.deepTime?.phase).toBe(DeepTimePhase.Simulating)
    })

    it('burning phase does not transition early', () => {
      const state = createTestState()
      initiateDeepTime(state, 0)

      tickDeepTime(state, DEEP_TIME_BURN_DURATION_MS - 1)

      expect(state.deepTime?.phase).toBe(DeepTimePhase.Burning)
    })
  })

  describe('simulation phase', () => {
    it('simulation advances years each tick', () => {
      const state = createTestState()
      enterSimulatingPhase(state)

      expect(state.deepTime?.phase).toBe(DeepTimePhase.Simulating)

      const yearsBefore = state.deepTime?.elapsedYears ?? 0
      tickDeepTime(state, DEEP_TIME_BURN_DURATION_MS + 100)

      expect(state.deepTime?.elapsedYears).toBe(yearsBefore + DEEP_TIME_YEARS_PER_FRAME)
    })

    it('simulation transitions to wandering at total years', () => {
      const state = createTestState()
      enterSimulatingPhase(state)

      const ticksNeeded = DEEP_TIME_TOTAL_YEARS / DEEP_TIME_YEARS_PER_FRAME
      for (let i = 0; i < ticksNeeded; i++) {
        tickDeepTime(state, DEEP_TIME_BURN_DURATION_MS + 100 + i)
      }

      expect(state.deepTime?.phase).toBe(DeepTimePhase.Wandering)
      expect(state.deepTime?.elapsedYears).toBe(DEEP_TIME_TOTAL_YEARS)
    })
  })

  describe('movement suppression', () => {
    it('movement blocked during burning phase', () => {
      const state = createTestState()
      initiateDeepTime(state, 0)

      expect(isDeepTimeLocked(state)).toBe(true)
    })

    it('movement allowed during wandering phase', () => {
      const state = createTestState()
      enterSimulatingPhase(state)

      // Tick to wandering
      const ticksNeeded = DEEP_TIME_TOTAL_YEARS / DEEP_TIME_YEARS_PER_FRAME
      for (let i = 0; i < ticksNeeded; i++) {
        tickDeepTime(state, DEEP_TIME_BURN_DURATION_MS + 100 + i)
      }

      expect(state.deepTime?.phase).toBe(DeepTimePhase.Wandering)
      expect(isDeepTimeLocked(state)).toBe(false)
    })
  })

  describe('entity suppression', () => {
    it('shooting stars suppressed during deep time', () => {
      const state = createTestState()
      initiateDeepTime(state, 0)

      const beforeCount = state.world.query(ComponentType.ShootingStarData).length

      // Call spawn multiple times — none should create entities
      for (let i = 0; i < 50; i++) {
        spawnShootingStar(state)
      }

      const afterCount = state.world.query(ComponentType.ShootingStarData).length
      expect(afterCount).toBe(beforeCount)
    })

    it('character behaviors suppressed during deep time', () => {
      const state = createTestState()

      // Add a character with drift behavior at a known position
      const charX = state.player.x + 5
      const charY = state.player.y
      state.map[charY][charX] = { type: { toString: () => 'dirt' } as never }
      createCharacterTestEntity(state, 'gron', charX, charY, {
        behavior: { type: 'drift', moveChance: 1.0, freezeOnDialog: false },
      })

      initiateDeepTime(state, 0)

      // Characters were removed by initiateDeepTime, so add one back for this test
      createCharacterTestEntity(state, 'gron', charX, charY, {
        behavior: { type: 'drift', moveChance: 1.0, freezeOnDialog: false },
      })

      // Tick behaviors many times — character should not move
      for (let i = 0; i < 50; i++) {
        tickCharacterBehaviors(state)
      }

      const chars = getCharacterEntities(state)
      const gron = chars.find(c => c.definitionId === 'gron')
      expect(gron).toBeDefined()
      expect(gron?.pos.x).toBe(charX)
      expect(gron?.pos.y).toBe(charY)
    })
  })

  describe('UI refresh during deep time (regression)', () => {
    it('onRefreshUI called during burning phase', () => {
      const state = createTestState()
      const refreshUI = vi.fn()
      const gameLoop = createGameLoop(state, { onRefreshUI: refreshUI })

      initiateDeepTime(state, 0)
      expect(state.deepTime?.phase).toBe(DeepTimePhase.Burning)

      // Tick at t=0 (first tick, lastRefresh=0, so 0-0>=100 is false)
      gameLoop.tick(0)
      // Tick at t=100 — should trigger refreshUI (100-0 >= 100)
      gameLoop.tick(100)

      expect(refreshUI).toHaveBeenCalled()
    })

    it('onRefreshUI called during simulating phase', () => {
      const state = createTestState()
      const refreshUI = vi.fn()
      const gameLoop = createGameLoop(state, { onRefreshUI: refreshUI })

      initiateDeepTime(state, 0)

      // Advance past burning phase
      gameLoop.tick(DEEP_TIME_BURN_DURATION_MS + 1)
      expect(state.deepTime?.phase).toBe(DeepTimePhase.Simulating)
      refreshUI.mockClear()

      // Tick at +200ms — should trigger refreshUI
      gameLoop.tick(DEEP_TIME_BURN_DURATION_MS + 201)

      expect(refreshUI).toHaveBeenCalled()
    })

    it('onRefreshUI throttled to ~100ms intervals', () => {
      const state = createTestState()
      const refreshUI = vi.fn()
      const gameLoop = createGameLoop(state, { onRefreshUI: refreshUI })

      initiateDeepTime(state, 0)

      // Advance past burning into simulating
      gameLoop.tick(DEEP_TIME_BURN_DURATION_MS + 1)
      refreshUI.mockClear()

      // Rapid ticks at 16ms intervals (simulating 60fps) over 200ms
      const baseTime = DEEP_TIME_BURN_DURATION_MS + 1
      for (let t = baseTime + 16; t <= baseTime + 200; t += 16) {
        gameLoop.tick(t)
      }

      // At 60fps over 200ms, that's ~12 frames but only ~2 refreshUI calls
      // (one at ~100ms, one at ~200ms)
      expect(refreshUI.mock.calls.length).toBeGreaterThanOrEqual(1)
      expect(refreshUI.mock.calls.length).toBeLessThanOrEqual(3)
    })

    it('onRefreshUI not called during wandering phase', () => {
      const state = createTestState()
      const refreshUI = vi.fn()
      const gameLoop = createGameLoop(state, { onRefreshUI: refreshUI })

      initiateDeepTime(state, 0)

      // Advance to wandering: burn phase + all simulation ticks
      gameLoop.tick(DEEP_TIME_BURN_DURATION_MS + 1)
      const ticksNeeded = Math.ceil(DEEP_TIME_TOTAL_YEARS / DEEP_TIME_YEARS_PER_FRAME)
      for (let i = 0; i < ticksNeeded; i++) {
        gameLoop.tick(DEEP_TIME_BURN_DURATION_MS + 200 + i * 100)
      }
      expect(state.deepTime?.phase).toBe(DeepTimePhase.Wandering)
      refreshUI.mockClear()

      // Tick several more times in wandering — no refreshUI from deep-time system
      const wanderingBase = DEEP_TIME_BURN_DURATION_MS + 200 + ticksNeeded * 100
      for (let t = wanderingBase + 100; t <= wanderingBase + 500; t += 100) {
        gameLoop.tick(t)
      }

      // refreshUI may be called by other systems (movement, etc.) but
      // since we haven't triggered any movement or other state changes,
      // verify no calls were made
      expect(refreshUI).not.toHaveBeenCalled()
    })
  })

  describe('scheduled lightning strikes', () => {
    it('schedules exactly DEEP_TIME_LIGHTNING_COUNT strikes when entering simulating phase', () => {
      const state = createTestState()
      enterSimulatingPhase(state)

      const dt = state.deepTime
      expect(dt).not.toBeNull()
      expect(dt?.scheduledStrikeYears).toHaveLength(DEEP_TIME_LIGHTNING_COUNT)
      expect(dt?.strikesCompleted).toBe(0)
    })

    it('all strikes are scheduled at year 0 (instant barrage)', () => {
      const state = createTestState()
      enterSimulatingPhase(state)

      const years = state.deepTime?.scheduledStrikeYears ?? []
      for (const y of years) {
        expect(y).toBe(0)
      }
    })

    it('no strikes are scheduled during burning phase', () => {
      const state = createTestState()
      initiateDeepTime(state, 0)

      expect(state.deepTime?.scheduledStrikeYears).toEqual([])
      expect(state.deepTime?.strikesCompleted).toBe(0)
    })

    it('fires all strikes on first simulation tick', () => {
      const state = createTestState()
      enterSimulatingPhase(state)

      // Single tick advances past year 0
      tickDeepTime(state, DEEP_TIME_BURN_DURATION_MS + 100)

      expect(state.deepTime?.strikesCompleted).toBe(DEEP_TIME_LIGHTNING_COUNT)
    })

    it('triggers camera shake on strikes', () => {
      const state = createTestState()
      enterSimulatingPhase(state)

      const strikeTime = DEEP_TIME_BURN_DURATION_MS + 100
      tickDeepTime(state, strikeTime)

      expect(state.deepTime?.shakeUntil).toBeGreaterThan(strikeTime)
    })
  })
})
