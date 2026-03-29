import { withSeededRandom } from '@/harness/prng'
import { ComponentType } from '@/engine/ecs'
import { createGameState } from '@/engine/state'
import { tickBees } from '@/engine/entities'
import type { GameState } from '@/engine/types'

const SEED = 42
const TICK_SEED = 99

const createSeededState = () =>
  withSeededRandom(SEED, () => createGameState('test', 40, 30))

const addBee = (state: GameState, x: number, y: number) => {
  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x, y })
  state.world.addComponent(e, ComponentType.EntityTag, 'bee')
  return e
}

const getBees = (state: GameState) =>
  state.world
    .query(ComponentType.EntityTag, ComponentType.Position)
    .filter((eid) => state.world.getComponent(eid, ComponentType.EntityTag) === 'bee')

describe('replay: bee behavior', () => {
  it('produces identical bee positions for the same tick sequence', () => {
    const run = () => {
      const state = createSeededState()
      addBee(state, state.player.x + 3, state.player.y + 3)
      addBee(state, state.player.x + 5, state.player.y + 5)

      // tick 10 times with seeded random
      withSeededRandom(TICK_SEED, () => {
        for (let i = 0; i < 10; i++) {
          tickBees(state)
        }
      })

      return getBees(state).map((eid) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const pos = state.world.getComponent(eid, ComponentType.Position)!
        return { x: pos.x, y: pos.y }
      })
    }

    expect(run()).toEqual(run())
  })

  it('bees move over multiple ticks', () => {
    const state = createSeededState()
    const startX = state.player.x + 3
    const startY = state.player.y + 3
    const beeEid = addBee(state, startX, startY)

    // tick enough times that movement is very likely (30% chance per tick)
    withSeededRandom(TICK_SEED, () => {
      for (let i = 0; i < 50; i++) {
        tickBees(state)
      }
    })

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const pos = state.world.getComponent(beeEid, ComponentType.Position)!
    expect(pos).toBeDefined()
    const moved = pos.x !== startX || pos.y !== startY
    expect(moved).toBe(true)
  })

  it('bee count stays constant when no capture or spawn happens', () => {
    const state = createSeededState()
    addBee(state, state.player.x + 10, state.player.y + 10)
    addBee(state, state.player.x + 12, state.player.y + 12)

    withSeededRandom(TICK_SEED, () => {
      for (let i = 0; i < 20; i++) {
        tickBees(state)
      }
    })

    expect(getBees(state)).toHaveLength(2)
  })
})
