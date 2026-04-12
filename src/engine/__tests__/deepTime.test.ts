import { describe, it, expect } from 'vitest'
import { activateActionBarSlot, assignActionBarSlot } from '../actionBar'
import { spawnShootingStar } from '../celestial'
import {
  DEEP_TIME_BURN_DURATION_MS,
  DEEP_TIME_TOTAL_YEARS,
  DEEP_TIME_YEARS_PER_FRAME,
} from '../constants'
import { initiateDeepTime, tickDeepTime } from '../deepTime'
import { ComponentType } from '../ecs/types'
import { tickCharacterBehaviors } from '../entities'
import { DeepTimePhase } from '../types'
import { createTestState, createCharacterTestEntity, getCharacterEntities } from './helpers'

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
        characterId: 'gron',
        lineIndex: 0,
        typingIndex: 0,
        typingDone: false,
        transitioning: false,
        transitionStartTime: 0,
      }
      state.path = [{ x: 10, y: 10 }]
      assignActionBarSlot(state, 0, 'revery', 'earth')
      assignActionBarSlot(state, 1, 'revery', 'fire')

      initiateDeepTime(state, 1000)

      expect(state.activeDialog).toBeNull()
      expect(state.path).toBeNull()
      expect(state.actionBar).toEqual([null, null, null, null])
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

    it('casting deep-time revery triggers initiation', () => {
      const state = createTestState()
      state.reveries.push('deep-time')
      assignActionBarSlot(state, 0, 'revery', 'deep-time')

      activateActionBarSlot(state, 0, 1000)

      expect(state.deepTime?.active).toBe(true)
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

      // The guard condition used by game loop systems
      const blocked =
        state.deepTime?.active === true && state.deepTime.phase !== DeepTimePhase.Wandering

      expect(blocked).toBe(true)
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

      const blocked =
        state.deepTime?.active === true && state.deepTime.phase !== DeepTimePhase.Wandering

      expect(blocked).toBe(false)
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
})
