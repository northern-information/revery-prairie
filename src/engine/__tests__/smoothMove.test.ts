import { spawnAngel, tickAngelDrift } from '../angels'
import { enterCave, exitCave } from '../cave'
import {
  ANGEL_DRIFT_TICK_MS,
  BEE_TICK_MS,
  COYOTE_TICK_MS,
  GHOST_TICK_MS,
  MONARCH_TICK_MS,
  MOVEMENT_TWEEN_DEFAULT_MS,
  MOVEMENT_TWEEN_SPRINT_MS,
  SPACE_BORDER,
  UNIT_COMMAND_TICK_MS,
} from '../constants'
import { tickCoyote } from '../coyote'
import { ComponentType } from '../ecs/types'
import { tickBees, tickCharacterBehaviors } from '../entities'
import { spawnMonarch, tickMonarchs } from '../monarch'
import { movePlayer } from '../movement'
import { clearMovementTweens, getTweenLerp } from '../movementTween'
import { worldDeltaToIsoPx, worldToScreen } from '../projection'
import { selectUnit } from '../selection'
import { CoyoteMode, TileType, Zone } from '../types'
import { issueMoveCommand, tickUnitCommands } from '../unitCommands'
import {
  clearArea,
  clearAroundPlayer,
  createBeeEntity,
  createCharacterTestEntity,
  createTestState,
} from './helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
        playerX,
        playerY,
        camera,
        charWidth,
        charHeight,
        viewportWidth,
        viewportHeight
      )

      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const lerpX = fromX + (playerX - fromX) * t
        const lerpY = fromY + (playerY - fromY) * t

        // Renderer path: player draws at lerp, then ctx.translate(-drift)
        // is applied (drift composed from worldDeltaToIsoPx(lerp - player)).
        const lerpDraw = worldToScreen(lerpX, lerpY, camera, charWidth, charHeight, viewportWidth, viewportHeight)
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
      const expectedCenter = worldToScreen(toX, toY, camera, charWidth, charHeight, viewportWidth, viewportHeight)

      // At t=0: drift derived from (lerp = from) - (player = to). Tile at
      // fromX should land where the player visually is (canvas center).
      const driftAtZero = worldDeltaToIsoPx(fromX - toX, fromY - toY, charWidth, charHeight)
      const fromTileDrawT0 = worldToScreen(fromX, fromY, camera, charWidth, charHeight, viewportWidth, viewportHeight)
      expect(fromTileDrawT0.px - driftAtZero.px).toBeCloseTo(expectedCenter.px)
      expect(fromTileDrawT0.py - driftAtZero.py).toBeCloseTo(expectedCenter.py)

      // At t=1: drift is zero (lerp == player). Tile at toX is at center.
      const driftAtOne = worldDeltaToIsoPx(0, 0, charWidth, charHeight)
      const toTileDrawT1 = worldToScreen(toX, toY, camera, charWidth, charHeight, viewportWidth, viewportHeight)
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

    it('tween offset is zero on axes where camera does not track player (small map)', () => {
      // updateCamera centers the map (rather than the player) when the
      // map is smaller than the visible viewport on an axis. The cave
      // is 40x25 inside an 80+x40+ viewport — both axes are
      // small-map. The renderer must mirror that gate so a player
      // walking inside the cave does NOT shift the world; the player
      // glyph slides smoothly across stationary tiles via its own
      // lerp draw. Mirrors the gate the renderer applies inline.
      const gateOffset = (
        lerpX: number,
        lerpY: number,
        playerX: number,
        playerY: number,
        mapWidth: number,
        mapHeight: number,
        visibleViewportWidth: number,
        viewportHeight: number,
        charWidth: number,
        charHeight: number
      ): { px: number; py: number } => {
        const xTracks = mapWidth >= visibleViewportWidth
        const yTracks = mapHeight >= viewportHeight
        return worldDeltaToIsoPx(xTracks ? lerpX - playerX : 0, yTracks ? lerpY - playerY : 0, charWidth, charHeight)
      }

      // Cave-shaped scenario: 40x25 map, 80x40 viewport.
      const caveOffset = gateOffset(49.5, 12, 50, 12, 40, 25, 80, 40, 10, 20)
      expect(caveOffset).toEqual({ px: 0, py: 0 })

      // Overworld-shaped scenario: 147x147 map, 80x40 viewport — both axes track.
      const overworldOffset = gateOffset(49.5, 30, 50, 30, 147, 147, 80, 40, 10, 20)
      expect(overworldOffset.px).not.toBe(0)

      // Hybrid: narrow x (small map), tall y (tracks). Only y axis offsets.
      const hybridOffset = gateOffset(49.5, 30.5, 50, 30, 40, 200, 80, 40, 10, 20)
      // x contribution from worldDeltaToIsoPx(0, dy) = (-dy)*cw, (dy)*halfH
      // dy = 0.5 - 0 = 0.5 → px = -5, py = 5
      expect(hybridOffset.px).toBeCloseTo(-5)
      expect(hybridOffset.py).toBeCloseTo(5)
    })
  })

  describe('tick-cadence tween duration', () => {
    // Each periodic tick that calls world.moveEntity must pass its tick
    // interval as durationMs so the tween fills the gap to the next tick.
    // Default tween (100ms) on a 150ms+ tick leaves an idle gap at the
    // destination tile and reads as choppy.

    it('unit-command: tickUnitCommands writes a tween with durationMs = UNIT_COMMAND_TICK_MS', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const eid = createCharacterTestEntity(state, 'coyote', state.player.x + 2, state.player.y, {
        behavior: { type: 'follow' },
      })
      selectUnit(state, eid)
      issueMoveCommand(state, { x: state.player.x + 5, y: state.player.y })

      tickUnitCommands(state)

      const tween = state.world.getComponent(eid, ComponentType.MovementTween)
      expect(tween).toBeTruthy()
      expect(tween?.durationMs).toBe(UNIT_COMMAND_TICK_MS)
    })

    it('coyote follow: tickCoyote writes a tween with durationMs = COYOTE_TICK_MS', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const eid = createCharacterTestEntity(state, 'coyote', state.player.x + 5, state.player.y, {
        behavior: { type: 'follow' },
      })

      tickCoyote(state)

      const tween = state.world.getComponent(eid, ComponentType.MovementTween)
      expect(tween).toBeTruthy()
      expect(tween?.durationMs).toBe(COYOTE_TICK_MS)
    })

    it('coyote collect: tickCoyote writes a tween with durationMs = COYOTE_TICK_MS when stepping toward a collectible', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const eid = createCharacterTestEntity(state, 'coyote', state.player.x + 2, state.player.y, {
        behavior: { type: 'follow' },
      })
      state.coyoteMode = CoyoteMode.Collect
      // Place a ground item several tiles away to force a step toward it.
      const itemX = state.player.x + 6
      const itemY = state.player.y
      clearArea(state, itemX, itemY, 1)
      const gItem = state.world.createEntity()
      state.world.addComponent(gItem, ComponentType.Position, { x: itemX, y: itemY })
      state.world.addComponent(gItem, ComponentType.ItemDrop, { definitionId: 'clover' })
      state.world.addComponent(gItem, ComponentType.EntityTag, 'groundItem')
      state.world.addComponent(gItem, ComponentType.EntityZone, { zone: state.currentZone })

      tickCoyote(state)

      const tween = state.world.getComponent(eid, ComponentType.MovementTween)
      expect(tween).toBeTruthy()
      expect(tween?.durationMs).toBe(COYOTE_TICK_MS)
    })

    it('character drift: tickCharacterBehaviors writes a tween with durationMs = GHOST_TICK_MS', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      // Spawn a ghost far enough from the player not to be the player tile.
      const eid = createCharacterTestEntity(state, 'ghost-1', state.player.x + 4, state.player.y, {
        behavior: { type: 'drift', moveChance: 1, freezeOnDialog: false },
      })
      clearArea(state, state.player.x + 4, state.player.y, 2)
      // Force a move: moveChance gate is `Math.random() > moveChance` → return 0 to pass.
      vi.spyOn(Math, 'random').mockReturnValue(0)

      tickCharacterBehaviors(state, Zone.Overworld)

      const tween = state.world.getComponent(eid, ComponentType.MovementTween)
      expect(tween).toBeTruthy()
      expect(tween?.durationMs).toBe(GHOST_TICK_MS)
    })

    it('bees: tickBees writes a tween with durationMs = BEE_TICK_MS', () => {
      const state = createTestState()
      const bx = state.player.x + 5
      const by = state.player.y
      clearArea(state, bx, by, 2)
      const eid = createBeeEntity(state, bx, by)
      // Force the bee to move every tick (gate is `Math.random() > 0.3` → 0 passes).
      vi.spyOn(Math, 'random').mockReturnValue(0)

      tickBees(state)

      const tween = state.world.getComponent(eid, ComponentType.MovementTween)
      expect(tween).toBeTruthy()
      expect(tween?.durationMs).toBe(BEE_TICK_MS)
    })

    it('monarchs: tickMonarchs writes a tween with durationMs = MONARCH_TICK_MS', () => {
      const state = createTestState()
      const mx = state.player.x + 5
      const my = state.player.y
      clearArea(state, mx, my, 3)
      const eid = spawnMonarch(state, mx, my)
      // Put the monarch into the settled phase so tickSettled's wander branch
      // (monarch.ts:308) drives the moveEntity call we care about.
      const monarchState = state.world.getComponent(eid, ComponentType.MonarchState)
      if (monarchState) {
        monarchState.phase = 'settled'
        monarchState.target = { x: mx, y: my }
      }
      // Force the 15% wander gate to fire.
      vi.spyOn(Math, 'random').mockReturnValue(0)

      tickMonarchs(state, 1000, Zone.Overworld)

      const tween = state.world.getComponent(eid, ComponentType.MovementTween)
      expect(tween).toBeTruthy()
      expect(tween?.durationMs).toBe(MONARCH_TICK_MS)
    })

    it('angels: tickAngelDrift writes a tween with durationMs = ANGEL_DRIFT_TICK_MS', () => {
      const state = createTestState({ viewportWidth: 80, viewportHeight: 40 })
      state.player.x = SPACE_BORDER + 5
      state.player.y = SPACE_BORDER + 5
      for (let y = 0; y < state.mapHeight; y++) {
        for (let x = 0; x < state.mapWidth; x++) {
          state.map[y][x] = { type: TileType.Dirt }
        }
      }
      state.nextAngelSpawnTime = 0
      const spawned = spawnAngel(state, 1000)
      expect(spawned).toBe(true)
      const angels = state.world.query(ComponentType.AngelData)
      expect(angels).toHaveLength(1)
      const eid = angels[0]
      // First random() gates ANGEL_DRIFT_CHANCE (return 0 to pass), second
      // picks a cardinal direction (any tile is dirt so any pick is valid).
      vi.spyOn(Math, 'random').mockReturnValue(0)

      tickAngelDrift(state)

      const tween = state.world.getComponent(eid, ComponentType.MovementTween)
      expect(tween).toBeTruthy()
      expect(tween?.durationMs).toBe(ANGEL_DRIFT_TICK_MS)
    })
  })
})
