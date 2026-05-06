import { updateCursorState } from '../cursor'
import { worldToScreen } from '../projection'
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
})
