import { updateCursorState } from '../cursor'
import { TileType } from '../types'
import { clearAroundPlayer, createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

import type { CharMetrics } from '../types'

const metrics: CharMetrics = { charWidth: 10, charHeight: 16, font: '16px monospace' }

describe('updateCursorState', () => {
  it('sets cursorTile from cursorScreenPos using camera + metrics', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    state.camera = { x: 3, y: 7 }
    state.cursorScreenPos = { x: 25, y: 48 }

    updateCursorState(state, metrics)

    // floor(25/10) + 3 = 5, floor(48/16) + 7 = 10
    expect(state.cursorTile).toEqual({ x: 5, y: 10 })
  })

  it('clears cursorTile when cursorScreenPos is null', () => {
    const state = createTestState()
    state.cursorTile = { x: 5, y: 5 }
    state.cursorScreenPos = null

    updateCursorState(state, metrics)

    expect(state.cursorTile).toBeNull()
  })

  it('computes hoverPath when cursor moves to a new walkable tile', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    // Position camera so cursor maps to a tile near the player
    state.camera = { x: state.player.x - 2, y: state.player.y - 2 }
    // Screen pos that maps to player.x + 1, player.y
    state.cursorScreenPos = {
      x: 3 * metrics.charWidth,
      y: 2 * metrics.charHeight,
    }

    updateCursorState(state, metrics)

    expect(state.cursorTile).toEqual({ x: state.player.x + 1, y: state.player.y })
    expect(state.hoverPath).not.toBeNull()
    expect(state.hoverPath?.length).toBeGreaterThan(0)
    expect(state.hoverPathTarget).toEqual({ x: state.player.x + 1, y: state.player.y })
  })

  it('clears hoverPath when cursor is null', () => {
    const state = createTestState()
    state.hoverPath = [{ x: 1, y: 1 }]
    state.hoverPathTarget = { x: 1, y: 1 }
    state.cursorScreenPos = null

    updateCursorState(state, metrics)

    expect(state.hoverPath).toBeNull()
    expect(state.hoverPathTarget).toBeNull()
  })

  it('clears hoverPath when state.path is active', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    state.camera = { x: state.player.x - 2, y: state.player.y - 2 }
    state.cursorScreenPos = {
      x: 3 * metrics.charWidth,
      y: 2 * metrics.charHeight,
    }
    state.path = [{ x: state.player.x + 1, y: state.player.y }]

    updateCursorState(state, metrics)

    expect(state.cursorTile).not.toBeNull()
    expect(state.hoverPath).toBeNull()
    expect(state.hoverPathTarget).toBeNull()
  })

  it('does not compute hoverPath when cursor is on the player tile', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    state.camera = { x: state.player.x - 2, y: state.player.y - 2 }
    // Screen pos that maps exactly to the player
    state.cursorScreenPos = {
      x: 2 * metrics.charWidth,
      y: 2 * metrics.charHeight,
    }

    updateCursorState(state, metrics)

    expect(state.cursorTile).toEqual({ x: state.player.x, y: state.player.y })
    expect(state.hoverPath).toBeNull()
  })

  it('does not recompute hoverPath when cursor tile has not changed', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const target = { x: state.player.x + 1, y: state.player.y }
    state.camera = { x: state.player.x - 2, y: state.player.y - 2 }
    state.cursorScreenPos = {
      x: 3 * metrics.charWidth,
      y: 2 * metrics.charHeight,
    }
    // Pre-set hoverPathTarget to match what cursorTile will resolve to
    state.hoverPathTarget = { ...target }
    const sentinel = [{ x: 99, y: 99 }]
    state.hoverPath = sentinel

    updateCursorState(state, metrics)

    // hoverPath should not have been overwritten
    expect(state.hoverPath).toBe(sentinel)
  })

  it('sets hoverPath to null for unwalkable tiles', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const targetX = state.player.x + 1
    const targetY = state.player.y
    state.map[targetY][targetX] = { type: TileType.Space }
    state.camera = { x: state.player.x - 2, y: state.player.y - 2 }
    state.cursorScreenPos = {
      x: 3 * metrics.charWidth,
      y: 2 * metrics.charHeight,
    }

    updateCursorState(state, metrics)

    expect(state.cursorTile).toEqual({ x: targetX, y: targetY })
    expect(state.hoverPath).toBeNull()
    expect(state.hoverPathTarget).toEqual({ x: targetX, y: targetY })
  })

  it('sets hoverPath to null for out-of-bounds cursor', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    // Camera offset that pushes the cursor tile past mapWidth
    state.camera = { x: state.mapWidth - 1, y: state.mapHeight - 1 }
    state.cursorScreenPos = {
      x: 5 * metrics.charWidth,
      y: 5 * metrics.charHeight,
    }

    updateCursorState(state, metrics)

    // Cursor tile is out of bounds
    expect(state.cursorTile?.x).toBeGreaterThanOrEqual(state.mapWidth)
    expect(state.hoverPath).toBeNull()
  })
})
