import { AUTO_HIDE_THRESHOLD, createGameLoop } from '../gameLoop'
import { clearAroundPlayer, createTestState } from './helpers'
import { describe, expect, it, vi } from 'vitest'

describe('auto-hide panels', () => {
  describe('panelOpenMoveCount', () => {
    it('starts at 0', () => {
      const state = createTestState()
      expect(state.panelOpenMoveCount).toBe(0)
    })

    it('increments on successful WASD move via keyboard-move tick', () => {
      const state = createTestState()
      clearAroundPlayer(state)
      state.heldDirection = 'right'
      const loop = createGameLoop(state, {})
      loop.tick(200)
      expect(state.panelOpenMoveCount).toBe(1)
    })

    it('increments on successful click-to-move via path tick', () => {
      const state = createTestState()
      clearAroundPlayer(state)
      const targetX = state.player.x + 1
      const targetY = state.player.y
      state.path = [{ x: targetX, y: targetY }]
      const loop = createGameLoop(state, {})
      loop.tick(200)
      expect(state.panelOpenMoveCount).toBe(1)
    })

    it('does not increment when move fails', () => {
      const state = createTestState()
      state.player.x = 0
      state.player.y = 0
      state.heldDirection = 'left'
      const loop = createGameLoop(state, {})
      loop.tick(200)
      expect(state.panelOpenMoveCount).toBe(0)
    })

    it('increments once per 50ms tick on sprint', () => {
      const state = createTestState()
      clearAroundPlayer(state)
      state.heldDirection = 'right'
      state.sprinting = true
      const loop = createGameLoop(state, {})
      // Sprint runs one move per 50ms tick, not two moves per 100ms tick —
      // a 100ms wallclock interval still produces two increments, but each
      // increment lands on its own discrete tile.
      loop.tick(0)
      loop.tick(50)
      loop.tick(100)
      expect(state.panelOpenMoveCount).toBe(2)
    })
  })

  describe('onAutoHidePanel callback', () => {
    it('fires when counter reaches threshold with autoHidePanels enabled', () => {
      const onAutoHidePanel = vi.fn()
      const state = createTestState()
      clearAroundPlayer(state)
      state.autoHidePanels = true
      state.panelOpenMoveCount = AUTO_HIDE_THRESHOLD - 1
      state.heldDirection = 'right'
      const loop = createGameLoop(state, { onAutoHidePanel })
      loop.tick(200)
      expect(onAutoHidePanel).toHaveBeenCalledOnce()
    })

    it('does not fire when autoHidePanels is disabled', () => {
      const onAutoHidePanel = vi.fn()
      const state = createTestState()
      clearAroundPlayer(state)
      state.autoHidePanels = false
      state.panelOpenMoveCount = AUTO_HIDE_THRESHOLD - 1
      state.heldDirection = 'right'
      const loop = createGameLoop(state, { onAutoHidePanel })
      loop.tick(200)
      expect(onAutoHidePanel).not.toHaveBeenCalled()
    })

    it('does not fire when counter is below threshold', () => {
      const onAutoHidePanel = vi.fn()
      const state = createTestState()
      clearAroundPlayer(state)
      state.autoHidePanels = true
      state.panelOpenMoveCount = 0
      state.heldDirection = 'right'
      const loop = createGameLoop(state, { onAutoHidePanel })
      loop.tick(200)
      expect(onAutoHidePanel).not.toHaveBeenCalled()
      expect(state.panelOpenMoveCount).toBe(1)
    })

    it('fires on path movement at threshold', () => {
      const onAutoHidePanel = vi.fn()
      const state = createTestState()
      clearAroundPlayer(state)
      state.autoHidePanels = true
      state.panelOpenMoveCount = AUTO_HIDE_THRESHOLD - 1
      state.path = [{ x: state.player.x + 1, y: state.player.y }]
      const loop = createGameLoop(state, { onAutoHidePanel })
      loop.tick(200)
      expect(onAutoHidePanel).toHaveBeenCalledOnce()
    })

    it('sprint reaches threshold faster than walking', () => {
      const onAutoHidePanel = vi.fn()
      const state = createTestState()
      clearAroundPlayer(state)
      state.autoHidePanels = true
      state.panelOpenMoveCount = AUTO_HIDE_THRESHOLD - 2
      state.heldDirection = 'right'
      state.sprinting = true
      const loop = createGameLoop(state, { onAutoHidePanel })
      // Two consecutive 50ms sprint ticks cross the threshold within 100ms
      // — half the wallclock time the non-sprint cadence would take.
      loop.tick(0)
      loop.tick(50)
      loop.tick(100)
      expect(onAutoHidePanel).toHaveBeenCalled()
    })

    it('counter continues incrementing when disabled (inert)', () => {
      const state = createTestState()
      // Need 10 walkable tiles east of the player, so clear a wider radius
      // than the default 2 — otherwise random coastline can block a step.
      clearAroundPlayer(state, 12)
      state.autoHidePanels = false
      state.heldDirection = 'right'
      const loop = createGameLoop(state, {})
      for (let i = 0; i < 10; i++) {
        loop.tick(200 + i * 200)
      }
      expect(state.panelOpenMoveCount).toBe(10)
    })
  })

  describe('autoHidePanels setting', () => {
    it('defaults to true', () => {
      const state = createTestState()
      expect(state.autoHidePanels).toBe(true)
    })

    it('can be toggled off', () => {
      const state = createTestState()
      state.autoHidePanels = false
      expect(state.autoHidePanels).toBe(false)
    })
  })

  describe('threshold constant', () => {
    it('is 5', () => {
      expect(AUTO_HIDE_THRESHOLD).toBe(5)
    })
  })
})
