import { checkTransition, enterCave } from '../cave'
import { ZONE_TRANSITION_DURATION_MS } from '../constants'
import { movePlayer, tickPath } from '../movement'
import { findPath } from '../pathfinding'
import { TileType, Zone } from '../types'
import {
  getZoneTransitionProgress,
  isZoneTransitioning,
  scheduleZoneTransition,
  tickZoneTransition,
} from '../zoneTransition'
import { createTestState } from './helpers'
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
})
