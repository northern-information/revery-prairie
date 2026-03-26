import { withSeededRandom } from '@/harness/prng'
import { createGameState } from '@/engine/state'
import { tickBees } from '@/engine/actions'
import type { GameState } from '@/engine/types'

const SEED = 42
const TICK_SEED = 99

const createSeededState = () =>
  withSeededRandom(SEED, () => createGameState('test', 40, 30))

const addBee = (state: GameState, x: number, y: number) => {
  state.bees.push({
    pos: { x, y },
  })
}

describe('replay: bee behavior', () => {
  it('produces identical bee positions for the same tick sequence', () => {
    const run = () => {
      const state = createSeededState()
      state.bees = []
      addBee(state, state.player.x + 3, state.player.y + 3)
      addBee(state, state.player.x + 5, state.player.y + 5)

      // tick 10 times with seeded random
      withSeededRandom(TICK_SEED, () => {
        for (let i = 0; i < 10; i++) {
          tickBees(state)
        }
      })

      return state.bees.map((b) => ({ x: b.pos.x, y: b.pos.y }))
    }

    expect(run()).toEqual(run())
  })

  it('bees move over multiple ticks', () => {
    const state = createSeededState()
    state.bees = []
    const startX = state.player.x + 3
    const startY = state.player.y + 3
    addBee(state, startX, startY)

    // tick enough times that movement is very likely (30% chance per tick)
    withSeededRandom(TICK_SEED, () => {
      for (let i = 0; i < 50; i++) {
        tickBees(state)
      }
    })

    const bee = state.bees[0]
    expect(bee).toBeDefined()
    const moved = bee.pos.x !== startX || bee.pos.y !== startY
    expect(moved).toBe(true)
  })

  it('bee count stays constant when no capture or spawn happens', () => {
    const state = createSeededState()
    state.bees = []
    addBee(state, state.player.x + 10, state.player.y + 10)
    addBee(state, state.player.x + 12, state.player.y + 12)

    withSeededRandom(TICK_SEED, () => {
      for (let i = 0; i < 20; i++) {
        tickBees(state)
      }
    })

    expect(state.bees).toHaveLength(2)
  })
})
