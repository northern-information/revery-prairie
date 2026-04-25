import { movePlayer } from '../movement'
import { TileType } from '../types'

import { clearAroundPlayer, createTestState } from './helpers'

import type { ColorId } from '@revery-prairie/shared'

describe('multiplayer foundation: state shape', () => {
  it('createGameState initializes multiplayer fields with defaults', () => {
    const state = createTestState()
    expect(state.multiplayerSession).toBeNull()
    expect(state.remotePlayers).toBeInstanceOf(Map)
    expect(state.remotePlayers.size).toBe(0)
    expect(state.onPlayerMoved).toBeNull()
  })

  it('remotePlayers entries can be inserted, mutated, and removed', () => {
    const state = createTestState()
    state.remotePlayers.set('s1', {
      sessionId: 's1',
      stewardName: 'alice',
      color: 'amber' satisfies ColorId,
      x: 10,
      y: 12,
      facing: 'down',
      lastUpdateMs: 1000,
    })
    expect(state.remotePlayers.size).toBe(1)
    const entry = state.remotePlayers.get('s1')
    expect(entry).toBeDefined()
    if (!entry) return
    entry.x = 11
    entry.lastUpdateMs = 2000
    expect(state.remotePlayers.get('s1')?.x).toBe(11)
    state.remotePlayers.delete('s1')
    expect(state.remotePlayers.size).toBe(0)
  })
})

describe('multiplayer foundation: onPlayerMoved emission', () => {
  it('movePlayer invokes onPlayerMoved after a successful move', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    let calls = 0
    state.onPlayerMoved = () => {
      calls++
    }
    const ok = movePlayer(state, 'right')
    expect(ok).toBe(true)
    expect(calls).toBe(1)
  })

  it('movePlayer does not invoke onPlayerMoved when the move is blocked', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    state.map[state.player.y][state.player.x + 1] = { type: TileType.CaveWall }
    let calls = 0
    state.onPlayerMoved = () => {
      calls++
    }
    const ok = movePlayer(state, 'right')
    expect(ok).toBe(false)
    expect(calls).toBe(0)
  })

  it('movePlayer is safe when onPlayerMoved is null', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    state.onPlayerMoved = null
    expect(() => movePlayer(state, 'down')).not.toThrow()
  })
})
