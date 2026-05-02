import { updateCursorState } from '../cursor'
import { worldToScreen } from '../projection'
import { TileType } from '../types'
import { clearAroundPlayer, createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

import type { CharMetrics, GameState, Position } from '../types'

const metrics: CharMetrics = { charWidth: 10, charHeight: 16, font: '16px monospace' }

// Convert a target world tile to a cursorScreenPos that lands inside its
// diamond. Nudge by (0, charHeight/2) into the diamond center.
const cursorPosForTile = (state: GameState, target: Position) => {
  const { px, py } = worldToScreen(
    target.x,
    target.y,
    state.camera,
    metrics.charWidth,
    metrics.charHeight,
    state.viewportWidth,
    state.viewportHeight,
  )
  return { x: px + 0.01, y: py + metrics.charHeight / 2 + 0.01 }
}

describe('updateCursorState', () => {
  it('sets cursorTile from cursorScreenPos using camera + metrics', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    state.camera = { x: 3, y: 7 }
    const target = { x: 5, y: 10 }
    state.cursorScreenPos = cursorPosForTile(state, target)

    updateCursorState(state, metrics)

    expect(state.cursorTile).toEqual(target)
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
    state.camera = { x: state.player.x - 2, y: state.player.y - 2 }
    const target = { x: state.player.x + 1, y: state.player.y }
    state.cursorScreenPos = cursorPosForTile(state, target)

    updateCursorState(state, metrics)

    expect(state.cursorTile).toEqual(target)
    expect(state.hoverPath).not.toBeNull()
    expect(state.hoverPath?.length).toBeGreaterThan(0)
    expect(state.hoverPathTarget).toEqual(target)
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
    const target = { x: state.player.x + 1, y: state.player.y }
    state.cursorScreenPos = cursorPosForTile(state, target)
    state.path = [target]

    updateCursorState(state, metrics)

    expect(state.cursorTile).not.toBeNull()
    expect(state.hoverPath).toBeNull()
    expect(state.hoverPathTarget).toBeNull()
  })

  it('does not compute hoverPath when cursor is on the player tile', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    state.camera = { x: state.player.x - 2, y: state.player.y - 2 }
    state.cursorScreenPos = cursorPosForTile(state, { x: state.player.x, y: state.player.y })

    updateCursorState(state, metrics)

    expect(state.cursorTile).toEqual({ x: state.player.x, y: state.player.y })
    expect(state.hoverPath).toBeNull()
  })

  it('does not recompute hoverPath when cursor tile has not changed', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const target = { x: state.player.x + 1, y: state.player.y }
    state.camera = { x: state.player.x - 2, y: state.player.y - 2 }
    state.cursorScreenPos = cursorPosForTile(state, target)
    state.hoverPathTarget = { ...target }
    const sentinel = [{ x: 99, y: 99 }]
    state.hoverPath = sentinel

    updateCursorState(state, metrics)

    expect(state.hoverPath).toBe(sentinel)
  })

  it('sets hoverPath to null for unwalkable tiles', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const target = { x: state.player.x + 1, y: state.player.y }
    state.map[target.y][target.x] = { type: TileType.Space }
    state.camera = { x: state.player.x - 2, y: state.player.y - 2 }
    state.cursorScreenPos = cursorPosForTile(state, target)

    updateCursorState(state, metrics)

    expect(state.cursorTile).toEqual(target)
    expect(state.hoverPath).toBeNull()
    expect(state.hoverPathTarget).toEqual(target)
  })

  it('sets hoverPath to null for out-of-bounds cursor', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    state.camera = { x: state.mapWidth - 1, y: state.mapHeight - 1 }
    const target = { x: state.mapWidth + 4, y: state.mapHeight + 4 }
    state.cursorScreenPos = cursorPosForTile(state, target)

    updateCursorState(state, metrics)

    expect(state.cursorTile?.x).toBeGreaterThanOrEqual(state.mapWidth)
    expect(state.hoverPath).toBeNull()
  })
})
