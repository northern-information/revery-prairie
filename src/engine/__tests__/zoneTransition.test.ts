import { checkTransition, enterCave, exitCave } from '../cave'
import { STRUCTURE_REENTRY_REARM_DISTANCE, ZONE_TRANSITION_DURATION_MS } from '../constants'
import { movePlayer, tickPath } from '../movement'
import { findPath } from '../pathfinding'
import { TileType, Zone } from '../types'
import {
  armReentryLock,
  clearReentryLockIfRearmed,
  getZoneTransitionProgress,
  isReentryLocked,
  isZoneTransitioning,
  scheduleZoneTransition,
  tickZoneTransition,
} from '../zoneTransition'
import { clearAroundPlayer, createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

const setCaveEntranceAt = (state: ReturnType<typeof createTestState>, x: number, y: number): void => {
  state.map[y][x] = { type: TileType.CaveEntrance }
  state.caveEntranceOverworld = { x, y }
}

const requireValue = <T>(value: T | null | undefined): T => {
  expect(value).toBeTruthy()
  return value as T
}

describe('zone transition', () => {
  describe('schedule on zone change', () => {
    it('schedules a ZoneTransition when player steps onto a CaveEntrance tile', () => {
      const state = createTestState()
      const ex = state.player.x
      const ey = state.player.y - 1
      setCaveEntranceAt(state, ex, ey)

      expect(state.zoneTransition).toBeNull()
      const result = checkTransition(state)
      expect(result).toBe(true)
      expect(state.zoneTransition).not.toBeNull()
      expect(state.zoneTransition?.direction).toBe('enter')
      expect(state.zoneTransition?.kind).toBe('cave')
      expect(state.zoneTransition?.irisCenter).toEqual({ x: ex, y: ey })
    })

    it('does not change state.currentZone synchronously', () => {
      const state = createTestState()
      const ex = state.player.x
      const ey = state.player.y - 1
      setCaveEntranceAt(state, ex, ey)

      checkTransition(state)
      expect(state.currentZone).toBe(Zone.Overworld)
    })

    it('returns false silently when a transition is already in flight', () => {
      const state = createTestState()
      const time = 1000
      const ok = scheduleZoneTransition(state, time, {
        direction: 'enter',
        kind: 'cave',
        irisCenter: { x: 5, y: 5 },
      })
      expect(ok).toBe(true)

      // Second schedule call while one is in flight is rejected.
      const second = scheduleZoneTransition(state, time + 50, {
        direction: 'enter',
        kind: 'cave',
        irisCenter: { x: 9, y: 9 },
      })
      expect(second).toBe(false)
      // The in-flight transition is preserved unchanged.
      expect(state.zoneTransition?.irisCenter).toEqual({ x: 5, y: 5 })
      expect(state.zoneTransition?.startTime).toBe(time)
    })
  })

  describe('tick and swap at midpoint', () => {
    it('does not fire the swap before progress reaches 0.5', () => {
      const state = createTestState()
      const ex = state.player.x
      const ey = state.player.y - 1
      setCaveEntranceAt(state, ex, ey)
      checkTransition(state)

      const transition = requireValue(state.zoneTransition)
      // 40% through — under midpoint
      const t = transition.startTime + transition.duration * 0.4
      tickZoneTransition(state, t)
      expect(state.currentZone).toBe(Zone.Overworld)
      expect(state.zoneTransition?.swapApplied).toBe(false)
    })

    it('fires the swap exactly once when progress crosses 0.5', () => {
      const state = createTestState()
      const ex = state.player.x
      const ey = state.player.y - 1
      setCaveEntranceAt(state, ex, ey)
      checkTransition(state)

      const transition = requireValue(state.zoneTransition)
      const t = transition.startTime + transition.duration * 0.6
      tickZoneTransition(state, t)
      expect(state.currentZone).toBe(Zone.Cave)
      expect(state.zoneTransition?.swapApplied).toBe(true)

      // A second tick still in-flight does not re-fire the swap.
      const playerAfterSwap = { ...state.player }
      tickZoneTransition(state, t + 10)
      expect(state.player).toEqual(playerAfterSwap)
    })

    it('clears state.zoneTransition when progress reaches 1', () => {
      const state = createTestState()
      const ex = state.player.x
      const ey = state.player.y - 1
      setCaveEntranceAt(state, ex, ey)
      checkTransition(state)

      const start = requireValue(state.zoneTransition).startTime
      tickZoneTransition(state, start + ZONE_TRANSITION_DURATION_MS + 1)
      expect(state.zoneTransition).toBeNull()
    })

    it('handles a zero-duration transition by completing on first tick', () => {
      const state = createTestState()
      state.zoneTransition = {
        startTime: 0,
        duration: 0,
        direction: 'enter',
        kind: 'cave',
        irisCenter: { ...state.caveEntranceOverworld },
        ruinIndex: null,
        swapApplied: false,
      }
      tickZoneTransition(state, 0)
      expect(state.currentZone).toBe(Zone.Cave)
      expect(state.zoneTransition).toBeNull()
    })

    it('is a no-op when state.zoneTransition is null', () => {
      const state = createTestState()
      expect(state.zoneTransition).toBeNull()
      tickZoneTransition(state, 0)
      // No mutation, no crash.
      expect(state.zoneTransition).toBeNull()
    })
  })

  describe('progress helper', () => {
    it('returns 0 at start, 0.5 at midpoint, 1 at end', () => {
      const transition = {
        startTime: 1000,
        duration: 1000,
        direction: 'enter' as const,
        kind: 'cave' as const,
        irisCenter: { x: 0, y: 0 },
        ruinIndex: null,
        swapApplied: false,
      }
      expect(getZoneTransitionProgress(transition, 1000)).toBe(0)
      expect(getZoneTransitionProgress(transition, 1500)).toBe(0.5)
      expect(getZoneTransitionProgress(transition, 2000)).toBe(1)
      expect(getZoneTransitionProgress(transition, 9999)).toBe(1)
    })

    it('treats a zero-or-negative duration as already complete', () => {
      const transition = {
        startTime: 0,
        duration: 0,
        direction: 'enter' as const,
        kind: 'cave' as const,
        irisCenter: { x: 0, y: 0 },
        ruinIndex: null,
        swapApplied: false,
      }
      expect(getZoneTransitionProgress(transition, 0)).toBe(1)
    })
  })

  describe('input gating', () => {
    it('movePlayer is rejected while a transition is in flight', () => {
      const state = createTestState()
      // Schedule a transition manually so we can isolate the gate.
      scheduleZoneTransition(state, 0, {
        direction: 'enter',
        kind: 'cave',
        irisCenter: { ...state.player },
      })
      expect(isZoneTransitioning(state)).toBe(true)

      const before = { ...state.player }
      const moved = movePlayer(state, 'right')
      expect(moved).toBe(false)
      expect(state.player).toEqual(before)
    })

    it('tickPath does not advance an active path while transitioning', () => {
      const state = createTestState()
      // Set up a real path with at least one step ahead.
      const target = { x: state.player.x + 3, y: state.player.y }
      const path = findPath(state.map, state.mapWidth, state.mapHeight, state.player, target, new Set())
      expect(path).not.toBeNull()
      state.path = path

      scheduleZoneTransition(state, 0, {
        direction: 'enter',
        kind: 'cave',
        irisCenter: { ...state.player },
      })

      const beforeLen = requireValue(state.path).length
      const beforePos = { ...state.player }
      tickPath(state)
      expect(state.path?.length).toBe(beforeLen)
      expect(state.player).toEqual(beforePos)
    })
  })

  describe('exit direction', () => {
    it('schedules an exit transition when stepping onto a CaveExit tile', () => {
      const state = createTestState()
      enterCave(state)
      state.player = { ...state.caveEntranceInterior }
      const result = checkTransition(state)
      expect(result).toBe(true)
      expect(state.zoneTransition?.direction).toBe('exit')
      expect(state.zoneTransition?.kind).toBe('cave')
    })
  })

  describe('isZoneTransitioning', () => {
    it('returns true when a transition is set and false when null', () => {
      const state = createTestState()
      expect(isZoneTransitioning(state)).toBe(false)
      scheduleZoneTransition(state, 0, {
        direction: 'enter',
        kind: 'cave',
        irisCenter: { x: 0, y: 0 },
      })
      expect(isZoneTransitioning(state)).toBe(true)
    })
  })

  describe('re-entry lock', () => {
    describe('helpers', () => {
      it('armReentryLock stores a copy of the entrance position', () => {
        const state = createTestState()
        const entrance = { x: 30, y: 30 }
        armReentryLock(state, entrance)
        expect(state.reentryLock).toEqual({ entrance: { x: 30, y: 30 } })
        // Stored a copy — mutating the source does not leak into the lock.
        entrance.x = 99
        expect(state.reentryLock?.entrance.x).toBe(30)
      })

      it('isReentryLocked is true only for the exact locked entrance', () => {
        const state = createTestState()
        armReentryLock(state, { x: 30, y: 30 })
        expect(isReentryLocked(state, { x: 30, y: 30 })).toBe(true)
        // A different entrance is not suppressed.
        expect(isReentryLocked(state, { x: 31, y: 30 })).toBe(false)
      })

      it('isReentryLocked is false when no lock is armed', () => {
        const state = createTestState()
        expect(state.reentryLock).toBeNull()
        expect(isReentryLocked(state, { x: 30, y: 30 })).toBe(false)
      })

      it('isReentryLocked is pure — it never clears the lock', () => {
        const state = createTestState()
        armReentryLock(state, { x: 30, y: 30 })
        // Player far away, but the pure predicate must not clear.
        state.player = { x: 50, y: 50 }
        isReentryLocked(state, { x: 30, y: 30 })
        expect(state.reentryLock).not.toBeNull()
      })

      it('clearReentryLockIfRearmed clears once the player reaches the re-arm distance', () => {
        const state = createTestState()
        const entrance = { x: 30, y: 30 }
        armReentryLock(state, entrance)

        // One tile short of the re-arm distance — still locked.
        state.player = { x: entrance.x + STRUCTURE_REENTRY_REARM_DISTANCE - 1, y: entrance.y }
        clearReentryLockIfRearmed(state)
        expect(state.reentryLock).not.toBeNull()

        // Exactly at the re-arm distance (Chebyshev) — clears.
        state.player = { x: entrance.x + STRUCTURE_REENTRY_REARM_DISTANCE, y: entrance.y }
        clearReentryLockIfRearmed(state)
        expect(state.reentryLock).toBeNull()
      })

      it('clearReentryLockIfRearmed uses Chebyshev distance (diagonal counts)', () => {
        const state = createTestState()
        const entrance = { x: 30, y: 30 }
        armReentryLock(state, entrance)
        // Diagonal: dx and dy both equal the re-arm distance → Chebyshev
        // is the re-arm distance, so it clears.
        state.player = {
          x: entrance.x + STRUCTURE_REENTRY_REARM_DISTANCE,
          y: entrance.y + STRUCTURE_REENTRY_REARM_DISTANCE,
        }
        clearReentryLockIfRearmed(state)
        expect(state.reentryLock).toBeNull()
      })

      it('clearReentryLockIfRearmed is a no-op when no lock is armed', () => {
        const state = createTestState()
        expect(state.reentryLock).toBeNull()
        clearReentryLockIfRearmed(state)
        expect(state.reentryLock).toBeNull()
      })
    })

    describe('checkTransition integration', () => {
      // Place a cave entrance and stand the player adjacent to it. With a
      // lock armed for that entrance, checkTransition must not schedule.
      const standOnCaveEntrance = (state: ReturnType<typeof createTestState>) => {
        clearAroundPlayer(state, STRUCTURE_REENTRY_REARM_DISTANCE + 2)
        const ex = state.player.x
        const ey = state.player.y - 1
        state.map[ey][ex] = { type: TileType.CaveEntrance }
        state.caveEntranceOverworld = { x: ex, y: ey }
        return { x: ex, y: ey }
      }

      it('suppresses re-entry while the player is point-blank to the just-exited entrance', () => {
        const state = createTestState()
        const entrance = standOnCaveEntrance(state)
        armReentryLock(state, entrance)

        const result = checkTransition(state)
        expect(result).toBe(false)
        expect(state.zoneTransition).toBeNull()
        // The lock survives — the player has not walked away.
        expect(state.reentryLock).not.toBeNull()
      })

      it('re-entry succeeds after the player walks the re-arm distance away and returns', () => {
        // This is the regression for the permanent-lock bug: the exit
        // drop sits outside the 3x3 hitbox, so the clear must run even
        // when no entrance tile is in the scan.
        const state = createTestState()
        const entrance = standOnCaveEntrance(state)
        armReentryLock(state, entrance)

        // Walk straight away to the re-arm distance. No entrance tile is
        // under the hitbox out here, yet the lock must clear.
        state.player = { x: entrance.x, y: entrance.y + STRUCTURE_REENTRY_REARM_DISTANCE }
        const farResult = checkTransition(state)
        expect(farResult).toBe(false)
        expect(state.reentryLock).toBeNull()

        // Return to point-blank — re-entry now schedules normally.
        state.player = { x: entrance.x, y: entrance.y + 1 }
        const backResult = checkTransition(state)
        expect(backResult).toBe(true)
        expect(state.zoneTransition?.direction).toBe('enter')
        expect(state.zoneTransition?.kind).toBe('cave')
      })

      it('exitCave arms the lock keyed to the cave entrance', () => {
        const state = createTestState()
        clearAroundPlayer(state, STRUCTURE_REENTRY_REARM_DISTANCE + 2)
        state.caveEntranceOverworld = { x: state.player.x, y: state.player.y }
        enterCave(state)
        exitCave(state)
        expect(state.reentryLock).toEqual({ entrance: { ...state.caveEntranceOverworld } })
      })

      it('lock clears immediately when the exit drop is already past the re-arm distance', () => {
        // findSafeExitPosition can drop the player beyond the re-arm
        // distance; the lock then clears on the first checkTransition
        // tick. This is correct, not a bug.
        const state = createTestState()
        const entrance = standOnCaveEntrance(state)
        armReentryLock(state, entrance)
        // Simulate a drop already past the re-arm distance.
        state.player = { x: entrance.x, y: entrance.y + STRUCTURE_REENTRY_REARM_DISTANCE + 1 }
        checkTransition(state)
        expect(state.reentryLock).toBeNull()
      })

      it('a different entrance stays enterable while one entrance is locked nearby', () => {
        const state = createTestState()
        clearAroundPlayer(state, STRUCTURE_REENTRY_REARM_DISTANCE + 2)
        // Lock an entrance still within the re-arm distance (so the lock
        // does NOT clear), but at a different tile than the one the
        // player is about to step onto.
        const lockedEntrance = { x: state.player.x - 1, y: state.player.y }
        armReentryLock(state, lockedEntrance)

        // Stand next to a fresh cave entrance at a different tile.
        const ex = state.player.x
        const ey = state.player.y - 1
        state.map[ey][ex] = { type: TileType.CaveEntrance }
        state.caveEntranceOverworld = { x: ex, y: ey }

        const result = checkTransition(state)
        expect(result).toBe(true)
        expect(state.zoneTransition?.kind).toBe('cave')
        // The lock for the OTHER entrance is untouched — player is still
        // within the re-arm distance of it.
        expect(state.reentryLock).toEqual({ entrance: lockedEntrance })
      })
    })
  })
})
