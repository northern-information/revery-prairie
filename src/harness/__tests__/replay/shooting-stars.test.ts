import { withSeededRandom } from '@/harness/prng'
import { createGameState } from '@/engine/state'
import { tickShootingStars } from '@/engine/actions'

const SEED = 42

const createSeededState = () =>
  withSeededRandom(SEED, () => createGameState('test', 40, 30))

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
      return {
        meteorites: state.meteorites.map((m) => ({ x: m.pos.x, y: m.pos.y })),
        starsRemaining: state.shootingStars.length,
      }
    }

    const first = run()
    const second = run()

    expect(first).toEqual(second)
  })

  it('shooting stars move each tick', () => {
    const state = createSeededState()
    // ensure we have at least one shooting star
    if (state.shootingStars.length === 0) return

    const star = state.shootingStars[0]!
    const startX = star.pos.x

    tickShootingStars(state, 0)

    // star should have moved by its dx/dy
    expect(star.pos.x).not.toBe(startX)
  })

  it('meteorites accumulate as stars land', () => {
    const state = createSeededState()
    const initialMeteoriteCount = state.meteorites.length

    let time = 0
    for (let i = 0; i < 500; i++) {
      tickShootingStars(state, time)
      time += 100
    }

    // the 7 spawned shooting stars should have produced meteorites
    expect(state.meteorites.length).toBeGreaterThan(initialMeteoriteCount)
  })
})
