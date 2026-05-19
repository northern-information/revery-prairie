import { describe, expect, it } from 'vitest'

import { FIRST_REVERY_EGREGORE_COUNT } from '../constants'
import { advanceEgregoreFirstRevery } from '../revery'
import { TileType } from '../types'

import { clearAroundPlayer, createTestState } from './helpers'

import type { GameState } from '../types'

const seedEgregoreAt = (state: GameState, x: number, y: number): void => {
  state.map[y][x] = { type: TileType.Egregore }
  state.egregorePositions.push({ x, y })
}

describe('advanceEgregoreFirstRevery (precis #4)', () => {
  it('returns empty array when no existing egregore tiles', () => {
    const state = createTestState()
    state.egregorePositions = []
    const placed = advanceEgregoreFirstRevery(state)
    expect(placed).toEqual([])
  })

  it('places FIRST_REVERY_EGREGORE_COUNT new tiles adjacent to existing ones', () => {
    const state = createTestState()
    state.egregorePositions = []
    clearAroundPlayer(state, 6)
    seedEgregoreAt(state, state.player.x + 4, state.player.y + 4)
    const placed = advanceEgregoreFirstRevery(state)
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
    const placed = advanceEgregoreFirstRevery(state)
    expect(state.egregorePositions.length).toBe(before + placed.length)
  })

  it('biases placement toward the player trail centroid (deterministic)', () => {
    const state = createTestState()
    state.egregorePositions = []
    clearAroundPlayer(state, 6)
    // Set the trail centroid clearly toward one side of the egregore source.
    state.trail = [
      { x: state.player.x + 6, y: state.player.y + 4, time: 0 },
      { x: state.player.x + 6, y: state.player.y + 4, time: 0 },
      { x: state.player.x + 6, y: state.player.y + 4, time: 0 },
    ]
    seedEgregoreAt(state, state.player.x + 4, state.player.y + 4)
    const placed = advanceEgregoreFirstRevery(state)
    // The +x neighbor (5, 4) is closer to the trail centroid than the -x
    // neighbor (3, 4), so it should be placed.
    const placedKeys = placed.map(p => `${String(p.x)},${String(p.y)}`)
    expect(placedKeys).toContain(`${String(state.player.x + 5)},${String(state.player.y + 4)}`)
  })

  it('is deterministic given identical state', () => {
    const stateA = createTestState()
    stateA.egregorePositions = []
    clearAroundPlayer(stateA, 6)
    seedEgregoreAt(stateA, stateA.player.x + 4, stateA.player.y + 4)
    const a = advanceEgregoreFirstRevery(stateA)

    const stateB = createTestState()
    stateB.egregorePositions = []
    clearAroundPlayer(stateB, 6)
    seedEgregoreAt(stateB, stateB.player.x + 4, stateB.player.y + 4)
    const b = advanceEgregoreFirstRevery(stateB)

    expect(a).toEqual(b)
  })

  it('returns fewer than FIRST_REVERY_EGREGORE_COUNT if no dirt neighbors are available', () => {
    const state = createTestState()
    state.egregorePositions = []
    clearAroundPlayer(state, 3)
    // Single egregore in the middle, surround it with non-dirt to prevent placement.
    const ex = state.player.x + 4
    const ey = state.player.y + 4
    seedEgregoreAt(state, ex, ey)
    // Block all 8 ordinal neighbors so no dirt neighbors remain.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        state.map[ey + dy][ex + dx] = { type: TileType.Egregore }
      }
    }
    const placed = advanceEgregoreFirstRevery(state)
    expect(placed.length).toBe(0)
  })
})
