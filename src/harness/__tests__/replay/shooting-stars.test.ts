import { withSeededRandom } from '@/harness/prng'
import { createGameState } from '@/engine/state'
import { tickShootingStars } from '@/engine/celestial'
import { ComponentType } from '@/engine/ecs'

import type { GameState } from '@/engine/types'

const SEED = 42

const createSeededState = () =>
  withSeededRandom(SEED, () => createGameState('test', 40, 30))

const getMeteoriteEntities = (state: GameState) =>
  state.world
    .query(ComponentType.EntityTag)
    .filter((eid) => state.world.getComponent(eid, ComponentType.EntityTag) === 'meteorite')

describe('replay: shooting stars', () => {
  it('produces identical meteorite positions after ticking to completion', () => {
    const run = () => {
      const state = createSeededState()
      // tick until all shooting stars have resolved
      let time = 0
      for (let i = 0; i < 500; i++) {
        tickShootingStars(state, time)
        time += 100
      }
      const meteorites = getMeteoriteEntities(state).map((eid) => {
        const pos = state.world.getComponent(eid, ComponentType.Position)
        return { x: pos?.x, y: pos?.y }
      })
      return {
        meteorites,
        starsRemaining: state.world.query(ComponentType.ShootingStarData).length,
      }
    }

    const first = run()
    const second = run()

    expect(first).toEqual(second)
  })

  it('shooting stars move each tick', () => {
    const state = createSeededState()
    // ensure we have at least one shooting star
    const stars = state.world.query(ComponentType.ShootingStarData, ComponentType.Position)
    if (stars.length === 0) return

    const eid = stars[0]
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!pos) return
    const startX = pos.x

    tickShootingStars(state, 0)

    // star should have moved by its dx/dy (entity may be destroyed if it landed,
    // so only check if still alive)
    if (state.world.isAlive(eid)) {
      const newPos = state.world.getComponent(eid, ComponentType.Position)
      expect(newPos).toBeDefined()
      expect(newPos?.x).not.toBe(startX)
    }
  })

  it('meteorites accumulate as stars land', () => {
    const state = createSeededState()
    const initialMeteoriteCount = getMeteoriteEntities(state).length

    let time = 0
    for (let i = 0; i < 500; i++) {
      tickShootingStars(state, time)
      time += 100
    }

    // the 7 spawned shooting stars should have produced meteorites
    expect(getMeteoriteEntities(state).length).toBeGreaterThan(initialMeteoriteCount)
  })
})
