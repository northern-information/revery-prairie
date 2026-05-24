import { describe, expect, it } from 'vitest'

import { FIRST_REVERY_EGREGORE_COUNT } from '../constants'
import { advanceEgregoreInRevery } from '../egregore/spread'
import { TileType } from '../types'

import { clearAroundPlayer, createTestState } from './helpers'

import type { GameState, Position } from '../types'

const seedEgregoreAt = (state: GameState, x: number, y: number): void => {
  state.map[y][x] = { type: TileType.Egregore }
  state.egregorePositions.push({ x, y })
}

describe('advanceEgregoreInRevery — first Revery (RP-4 contract preserved)', () => {
  it('returns empty array when no existing egregore tiles', () => {
    const state = createTestState()
    state.egregorePositions = []
    const placed = advanceEgregoreInRevery(state)
    expect(placed).toEqual([])
  })

  it('places FIRST_REVERY_EGREGORE_COUNT (3) tiles when reveryCount === 0', () => {
    const state = createTestState()
    state.egregorePositions = []
    state.reveryCount = 0
    clearAroundPlayer(state, 6)
    seedEgregoreAt(state, state.player.x + 4, state.player.y + 4)
    const placed = advanceEgregoreInRevery(state)
    expect(placed.length).toBe(FIRST_REVERY_EGREGORE_COUNT)
    for (const pos of placed) {
      expect(state.map[pos.y][pos.x].type).toBe(TileType.Egregore)
    }
  })

  it('appends placed positions to state.egregorePositions', () => {
    const state = createTestState()
    state.egregorePositions = []
    clearAroundPlayer(state, 6)
    seedEgregoreAt(state, state.player.x + 4, state.player.y + 4)
    const before = state.egregorePositions.length
    const placed = advanceEgregoreInRevery(state)
    expect(state.egregorePositions.length).toBe(before + placed.length)
  })

  it('biases placement toward the player trail centroid (deterministic)', () => {
    const state = createTestState()
    state.egregorePositions = []
    clearAroundPlayer(state, 6)
    state.trail = [
      { x: state.player.x + 6, y: state.player.y + 4, time: 0 },
      { x: state.player.x + 6, y: state.player.y + 4, time: 0 },
      { x: state.player.x + 6, y: state.player.y + 4, time: 0 },
    ]
    seedEgregoreAt(state, state.player.x + 4, state.player.y + 4)
    const placed = advanceEgregoreInRevery(state)
    const placedKeys = placed.map((p: Position) => `${String(p.x)},${String(p.y)}`)
    expect(placedKeys).toContain(`${String(state.player.x + 5)},${String(state.player.y + 4)}`)
  })

  it('is deterministic given identical state', () => {
    const stateA = createTestState()
    stateA.egregorePositions = []
    clearAroundPlayer(stateA, 6)
    seedEgregoreAt(stateA, stateA.player.x + 4, stateA.player.y + 4)
    const a = advanceEgregoreInRevery(stateA)

    const stateB = createTestState()
    stateB.egregorePositions = []
    clearAroundPlayer(stateB, 6)
    seedEgregoreAt(stateB, stateB.player.x + 4, stateB.player.y + 4)
    const b = advanceEgregoreInRevery(stateB)

    expect(a).toEqual(b)
  })

  it('returns fewer than FIRST_REVERY_EGREGORE_COUNT if no dirt neighbors are available', () => {
    const state = createTestState()
    state.egregorePositions = []
    clearAroundPlayer(state, 3)
    const ex = state.player.x + 4
    const ey = state.player.y + 4
    seedEgregoreAt(state, ex, ey)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        state.map[ey + dy][ex + dx] = { type: TileType.Egregore }
      }
    }
    const placed = advanceEgregoreInRevery(state)
    expect(placed.length).toBe(0)
  })
})

describe('advanceEgregoreInRevery — subsequent Reveries (RP-8b)', () => {
  it('places 6 tiles when reveryCount === 4 (6 + 4 % 4 = 6)', () => {
    const state = createTestState()
    state.egregorePositions = []
    state.reveryCount = 4
    clearAroundPlayer(state, 8)
    seedEgregoreAt(state, state.player.x + 4, state.player.y + 4)
    const placed = advanceEgregoreInRevery(state)
    expect(placed.length).toBe(6)
  })

  it('places 7 tiles when reveryCount === 1 (6 + 1 % 4 = 7)', () => {
    const state = createTestState()
    state.egregorePositions = []
    state.reveryCount = 1
    clearAroundPlayer(state, 8)
    seedEgregoreAt(state, state.player.x + 4, state.player.y + 4)
    const placed = advanceEgregoreInRevery(state)
    expect(placed.length).toBe(7)
  })

  it('places 9 tiles when reveryCount === 3 (6 + 3 % 4 = 9)', () => {
    const state = createTestState()
    state.egregorePositions = []
    state.reveryCount = 3
    clearAroundPlayer(state, 8)
    // Two seed egregores 3 tiles apart so the combined ordinal-neighbor
    // candidate set is comfortably >= 9.
    seedEgregoreAt(state, state.player.x + 3, state.player.y + 3)
    seedEgregoreAt(state, state.player.x + 6, state.player.y + 6)
    const placed = advanceEgregoreInRevery(state)
    expect(placed.length).toBe(9)
  })

  it('seeds an egregoreLifecycle entry for every placed tile', () => {
    const state = createTestState()
    state.egregorePositions = []
    state.egregoreLifecycle.clear()
    state.reveryCount = 0
    clearAroundPlayer(state, 6)
    seedEgregoreAt(state, state.player.x + 4, state.player.y + 4)
    const placed = advanceEgregoreInRevery(state)
    for (const pos of placed) {
      const key = `${String(pos.x)},${String(pos.y)}`
      expect(state.egregoreLifecycle.has(key)).toBe(true)
    }
  })
})
