import { withSeededRandom } from '@/harness/prng'

import { ComponentType } from '@/engine/ecs/types'
import { movePlayer } from '@/engine/movement'
import { createGameState } from '@/engine/state'
import type { Direction } from '@/engine/types'

const SEED = 42

const createSeededState = () => {
  const state = withSeededRandom(SEED, () => createGameState('test', 40, 30))
  // Destroy all spawned characters so they don't block movement tests
  for (const eid of state.world.query(ComponentType.CharacterIdentity)) {
    state.world.destroyEntity(eid)
  }
  return state
}

describe('replay: movement sequences', () => {
  it('produces identical final position for the same move sequence', () => {
    const sequence: Direction[] = [
      'right',
      'right',
      'down',
      'down',
      'left',
      'up',
      'right',
      'right',
      'right',
      'down',
      'down',
      'down',
    ]

    // run the sequence twice with fresh state each time
    const run = () => {
      const state = createSeededState()
      for (const dir of sequence) {
        movePlayer(state, dir)
      }
      return { x: state.player.x, y: state.player.y }
    }

    const first = run()
    const second = run()

    expect(first).toEqual(second)
  })

  it('player facing matches last move direction', () => {
    const state = createSeededState()
    const sequence: Direction[] = ['right', 'up', 'left', 'down']

    for (const dir of sequence) {
      movePlayer(state, dir)
    }

    expect(state.playerFacing).toBe('down')
  })

  it('camera tracks player position deterministically', () => {
    const sequence: Direction[] = Array.from(
      { length: 20 },
      (_, i) => (['right', 'down', 'right', 'down'] as const)[i % 4]
    )

    const run = () => {
      const state = createSeededState()
      for (const dir of sequence) {
        movePlayer(state, dir)
      }
      return { camera: { ...state.camera }, player: { ...state.player } }
    }

    expect(run()).toEqual(run())
  })

  it('blocked moves do not change position', () => {
    const state = createSeededState()
    const startX = state.player.x

    // walk left until blocked (will eventually hit space border)
    let moved = true
    while (moved) {
      moved = movePlayer(state, 'left')
    }

    // one more attempt should not change position
    const blockedX = state.player.x
    const blockedY = state.player.y
    movePlayer(state, 'left')

    expect(state.player.x).toBe(blockedX)
    expect(state.player.y).toBe(blockedY)
    // should have moved at least some tiles from start
    expect(blockedX).toBeLessThan(startX)
  })
})
