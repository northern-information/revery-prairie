import { afterEach, describe, expect, it, vi } from 'vitest'

import { enterCave, exitCave } from '../cave'
import { MOVEMENT_TWEEN_DEFAULT_MS, MOVEMENT_TWEEN_SPRINT_MS } from '../constants'
import { ComponentType } from '../ecs/types'
import { clearMovementTweens, getTweenLerp } from '../movementTween'
import { movePlayer } from '../movement'
import { worldDeltaToIsoPx, worldToScreen } from '../projection'
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

  describe('camera follow tween offset (regression)', () => {
    // Reproduces the bug where state.player.x snaps to the destination
    // tile but the renderer's camera follow was implicitly tweening only
    // the player glyph. The world tiles jumped one full tile per move
    // tick, fighting the player tween and reading as choppy. The fix
    // composes a sub-tile world translate from the tween delta.

    it('worldDeltaToIsoPx returns zero for zero delta', () => {
      const off = worldDeltaToIsoPx(0, 0, 8, 16)
      expect(off).toEqual({ px: 0, py: 0 })
    })

    it('worldDeltaToIsoPx projects east step onto iso axes', () => {
      // East = +x in world, which is upper-right in iso screen.
      const off = worldDeltaToIsoPx(1, 0, 10, 20)
      expect(off.px).toBe(10)
      expect(off.py).toBe(10)
    })

    it('worldDeltaToIsoPx projects south step onto iso axes', () => {
      // South = +y in world, which is lower-left in iso screen.
      const off = worldDeltaToIsoPx(0, 1, 10, 20)
      expect(off.px).toBe(-10)
      expect(off.py).toBe(10)
    })

    it('player drawn at lerp + world translate keeps player visually centered across the tween', () => {
      // The renderer draws the player at the fractional lerp position
      // and translates the entire scene by worldDeltaToIsoPx(lerp -
      // player). The composition must put the player at the same canvas
      // pixel as worldToScreen(player.x, player.y, camera) — i.e. the
      // canvas center for follow-mode camera, on every frame of the tween.
      const charWidth = 10
      const charHeight = 20
      const viewportWidth = 80
      const viewportHeight = 40
      const camera = { x: 50, y: 30 } // post-snap destination
      const playerX = 50
      const playerY = 30
      const fromX = 49
      const fromY = 30

      const expectedScreen = worldToScreen(
        playerX, playerY, camera, charWidth, charHeight, viewportWidth, viewportHeight,
      )

      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const lerpX = fromX + (playerX - fromX) * t
        const lerpY = fromY + (playerY - fromY) * t

        // Renderer path: player draws at lerp, then ctx.translate(-drift)
        // is applied (drift composed from worldDeltaToIsoPx(lerp - player)).
        const lerpDraw = worldToScreen(
          lerpX, lerpY, camera, charWidth, charHeight, viewportWidth, viewportHeight,
        )
        const drift = worldDeltaToIsoPx(lerpX - playerX, lerpY - playerY, charWidth, charHeight)
        // ctx.translate(sx - drift) inverts the drift sign.
        const drawnPx = lerpDraw.px - drift.px
        const drawnPy = lerpDraw.py - drift.py

        expect(drawnPx).toBeCloseTo(expectedScreen.px)
        expect(drawnPy).toBeCloseTo(expectedScreen.py)
      }
    })

    it('world tile that the player came from slides to the player position at t=0 and away at t=1', () => {
      // Verifies the world tiles slide smoothly under the player. At t=0
      // the from-tile sits where the player visually is (under their
      // feet); at t=1 the to-tile sits there.
      const charWidth = 10
      const charHeight = 20
      const viewportWidth = 80
      const viewportHeight = 40
      const camera = { x: 50, y: 30 }
      const toX = 50
      const toY = 30
      const fromX = 49
      const fromY = 30
      const expectedCenter = worldToScreen(
        toX, toY, camera, charWidth, charHeight, viewportWidth, viewportHeight,
      )

      // At t=0: drift derived from (lerp = from) - (player = to). Tile at
      // fromX should land where the player visually is (canvas center).
      const driftAtZero = worldDeltaToIsoPx(fromX - toX, fromY - toY, charWidth, charHeight)
      const fromTileDrawT0 = worldToScreen(
        fromX, fromY, camera, charWidth, charHeight, viewportWidth, viewportHeight,
      )
      expect(fromTileDrawT0.px - driftAtZero.px).toBeCloseTo(expectedCenter.px)
      expect(fromTileDrawT0.py - driftAtZero.py).toBeCloseTo(expectedCenter.py)

      // At t=1: drift is zero (lerp == player). Tile at toX is at center.
      const driftAtOne = worldDeltaToIsoPx(0, 0, charWidth, charHeight)
      const toTileDrawT1 = worldToScreen(
        toX, toY, camera, charWidth, charHeight, viewportWidth, viewportHeight,
      )
      expect(toTileDrawT1.px - driftAtOne.px).toBeCloseTo(expectedCenter.px)
      expect(toTileDrawT1.py - driftAtOne.py).toBeCloseTo(expectedCenter.py)
    })

    it('iso translate keeps tween offset zero on the final tween frame', () => {
      // Failure case: at lerp.t = 1, lerp = (toX, toY) = (player.x, player.y).
      // Offset must be exactly zero so the post-tween frame renders
      // identically to the final tween frame.
      const offset = worldDeltaToIsoPx(0, 0, 12, 24)
      expect(offset.px).toBe(0)
      expect(offset.py).toBe(0)
    })

    it('player lift interpolates linearly across a cube-step tween', () => {
      // The renderer interpolates playerLift = liftFrom + (liftTo - liftFrom) * t.
      // Verify the math holds for an arbitrary cube-step delta.
      const liftFrom = -8 // negative = up (cube top of a higher tier)
      const liftTo = 0
      const at = (t: number): number => liftFrom + (liftTo - liftFrom) * t
      expect(at(0)).toBe(liftFrom)
      expect(at(1)).toBe(liftTo)
      expect(at(0.5)).toBeCloseTo(-4)
      expect(at(0.25)).toBeCloseTo(-6)
    })
  })
})
