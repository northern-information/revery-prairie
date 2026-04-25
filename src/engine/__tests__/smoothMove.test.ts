import { afterEach, describe, expect, it, vi } from 'vitest'

import { enterCave, exitCave } from '../cave'
import { MOVEMENT_TWEEN_DEFAULT_MS, MOVEMENT_TWEEN_SPRINT_MS } from '../constants'
import { ComponentType } from '../ecs/types'
import { clearMovementTweens, getTweenLerp } from '../movementTween'
import { movePlayer } from '../movement'
import { clearAroundPlayer, createTestState } from './helpers'

const requireComponent = <T>(val: T | undefined): T => {
  expect(val).toBeTruthy()
  return val as T
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('smooth move', () => {
  describe('player tween', () => {
    it('writes a player tween on a successful move with default duration', () => {
      const state = createTestState()
      clearAroundPlayer(state)
      const startX = state.player.x
      const startY = state.player.y
      vi.spyOn(performance, 'now').mockReturnValue(1000)

      movePlayer(state, 'right')

      const tween = state.playerTween
      expect(tween).not.toBeNull()
      expect(tween).toMatchObject({
        fromX: startX,
        fromY: startY,
        startTime: 1000,
        durationMs: MOVEMENT_TWEEN_DEFAULT_MS,
      })
    })

    it('uses sprint duration when sprinting is enabled', () => {
      const state = createTestState()
      clearAroundPlayer(state)
      state.sprinting = true

      movePlayer(state, 'right')

      expect(state.playerTween?.durationMs).toBe(MOVEMENT_TWEEN_SPRINT_MS)
    })

    it('does not write a tween on a failed move', () => {
      const state = createTestState({ viewportWidth: 80, viewportHeight: 40 })
      state.player.x = 0
      state.player.y = 0

      const result = movePlayer(state, 'left')

      expect(result).toBe(false)
      expect(state.playerTween).toBeNull()
    })

    it('overwrites prior tween on rapid successive moves', () => {
      const state = createTestState()
      clearAroundPlayer(state)
      vi.spyOn(performance, 'now').mockReturnValue(1000)

      movePlayer(state, 'right')
      const firstX = state.player.x
      vi.spyOn(performance, 'now').mockReturnValue(1030)
      movePlayer(state, 'right')

      expect(state.playerTween?.fromX).toBe(firstX)
      expect(state.playerTween?.startTime).toBe(1030)
    })
  })

  describe('ECS world.moveEntity tween', () => {
    it('writes a MovementTween on entity move with default duration when omitted', () => {
      const state = createTestState()
      vi.spyOn(performance, 'now').mockReturnValue(2000)
      const eid = state.world.createEntity()
      state.world.addComponent(eid, ComponentType.Position, { x: 5, y: 5 })

      state.world.moveEntity(eid, 6, 5)

      const tween = requireComponent(state.world.getComponent(eid, ComponentType.MovementTween))
      expect(tween).toEqual({
        fromX: 5,
        fromY: 5,
        startTime: 2000,
        durationMs: MOVEMENT_TWEEN_DEFAULT_MS,
      })
    })

    it('honors caller-supplied durationMs', () => {
      const state = createTestState()
      const eid = state.world.createEntity()
      state.world.addComponent(eid, ComponentType.Position, { x: 0, y: 0 })

      state.world.moveEntity(eid, 1, 0, 250)

      const tween = requireComponent(state.world.getComponent(eid, ComponentType.MovementTween))
      expect(tween.durationMs).toBe(250)
    })

    it('overwrites an existing tween in place rather than stacking', () => {
      const state = createTestState()
      const eid = state.world.createEntity()
      state.world.addComponent(eid, ComponentType.Position, { x: 0, y: 0 })
      vi.spyOn(performance, 'now').mockReturnValue(100)
      state.world.moveEntity(eid, 1, 0)
      vi.spyOn(performance, 'now').mockReturnValue(200)
      state.world.moveEntity(eid, 2, 0)

      const tween = requireComponent(state.world.getComponent(eid, ComponentType.MovementTween))
      expect(tween).toEqual({
        fromX: 1,
        fromY: 0,
        startTime: 200,
        durationMs: MOVEMENT_TWEEN_DEFAULT_MS,
      })
    })

    it('does not write a tween for a zero-distance move', () => {
      const state = createTestState()
      const eid = state.world.createEntity()
      state.world.addComponent(eid, ComponentType.Position, { x: 4, y: 4 })

      state.world.moveEntity(eid, 4, 4)

      expect(state.world.getComponent(eid, ComponentType.MovementTween)).toBeUndefined()
    })

    it('removes tween component when entity is destroyed', () => {
      const state = createTestState()
      const eid = state.world.createEntity()
      state.world.addComponent(eid, ComponentType.Position, { x: 0, y: 0 })
      state.world.moveEntity(eid, 1, 0)
      expect(state.world.hasComponent(eid, ComponentType.MovementTween)).toBe(true)

      state.world.destroyEntity(eid)

      expect(state.world.hasComponent(eid, ComponentType.MovementTween)).toBe(false)
    })
  })

  describe('zone-transition clears tweens', () => {
    it('clears player and ECS tweens on enterCave', () => {
      const state = createTestState()
      clearAroundPlayer(state)
      movePlayer(state, 'right')
      const eid = state.world.createEntity()
      state.world.addComponent(eid, ComponentType.Position, { x: 0, y: 0 })
      state.world.moveEntity(eid, 1, 0)
      expect(state.playerTween).not.toBeNull()
      expect(state.world.hasComponent(eid, ComponentType.MovementTween)).toBe(true)

      enterCave(state)

      expect(state.playerTween).toBeNull()
      expect(state.world.hasComponent(eid, ComponentType.MovementTween)).toBe(false)
    })

    it('clears tweens on exitCave', () => {
      const state = createTestState()
      enterCave(state)
      const eid = state.world.createEntity()
      state.world.addComponent(eid, ComponentType.Position, { x: 0, y: 0 })
      state.world.moveEntity(eid, 1, 0)
      movePlayer(state, 'right')
      expect(state.world.hasComponent(eid, ComponentType.MovementTween)).toBe(true)

      exitCave(state)

      expect(state.playerTween).toBeNull()
      expect(state.world.hasComponent(eid, ComponentType.MovementTween)).toBe(false)
    })

    it('clearMovementTweens is idempotent on empty state', () => {
      const state = createTestState()

      expect(() => {
        clearMovementTweens(state)
        clearMovementTweens(state)
      }).not.toThrow()
      expect(state.playerTween).toBeNull()
    })
  })

  describe('getTweenLerp', () => {
    const tween = { fromX: 10, fromY: 5, startTime: 1000, durationMs: 100 }

    it('returns from-position at t=0', () => {
      const lerp = getTweenLerp(tween, 1000, 11, 5)
      expect(lerp).toEqual({ x: 10, y: 5, t: 0 })
    })

    it('interpolates linearly at midpoint', () => {
      const lerp = getTweenLerp(tween, 1050, 11, 5)
      expect(lerp.t).toBeCloseTo(0.5)
      expect(lerp.x).toBeCloseTo(10.5)
    })

    it('clamps t to 1 when elapsed exceeds duration', () => {
      const lerp = getTweenLerp(tween, 9999, 11, 5)
      expect(lerp).toEqual({ x: 11, y: 5, t: 1 })
    })

    it('clamps t to 0 when time is before startTime', () => {
      const lerp = getTweenLerp(tween, 500, 11, 5)
      expect(lerp.t).toBe(0)
    })

    it('returns t=1 when durationMs is zero or negative', () => {
      const lerp = getTweenLerp({ ...tween, durationMs: 0 }, 1050, 11, 5)
      expect(lerp.t).toBe(1)
    })

    it('returns t=1 when time is NaN', () => {
      const lerp = getTweenLerp(tween, NaN, 11, 5)
      expect(lerp.t).toBe(1)
    })
  })
})
