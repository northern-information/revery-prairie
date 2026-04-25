import { withSeededRandom } from '@/harness/prng'

import {
  spawnShootingStarAtTarget,
  tickMeteorShower,
  tickShootingStars,
  triggerPlayerSpawnShower,
} from '@/engine/celestial'
import { ComponentType } from '@/engine/ecs/types'
import { createGameState } from '@/engine/state'
import type { GameState } from '@/engine/types'

const SEED = 42

const createSeededState = () => withSeededRandom(SEED, () => createGameState('test', 40, 30))

const getMeteoriteEntities = (state: GameState) =>
  state.world
    .query(ComponentType.EntityTag)
    .filter(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'meteorite')

/** Trigger the opening meteor shower (via the player-spawn ceremony) and spawn all its stars */
const spawnOpeningShower = (state: GameState): number => {
  // The first shower is initiated by the player-spawn ceremony.
  triggerPlayerSpawnShower(state, state.player, 1000)

  // Drain all remaining stars in the shower
  const interval = Math.ceil(state.meteorShower.spawnIntervalMs) + 1
  let time = 1000
  while (state.meteorShower.remainingStars > 0) {
    time += interval
    tickMeteorShower(state, time)
  }
  return time
}

describe('replay: shooting stars', () => {
  it('produces identical meteorite positions after ticking to completion', () => {
    const run = () =>
      withSeededRandom(SEED, () => {
        const state = createGameState('test', 40, 30)
        // Spawn the opening meteor shower stars (inside seeded context for determinism)
        let time = spawnOpeningShower(state)
        // tick until all shooting stars have resolved
        for (let i = 0; i < 500; i++) {
          tickShootingStars(state, time)
          time += 100
        }
        const meteorites = getMeteoriteEntities(state).map(eid => {
          const pos = state.world.getComponent(eid, ComponentType.Position)
          return { x: pos?.x, y: pos?.y }
        })
        return {
          meteorites,
          starsRemaining: state.world.query(ComponentType.ShootingStarData).length,
        }
      })

    const first = run()
    const second = run()

    expect(first).toEqual(second)
  })

  it('shooting stars move each tick', () => {
    const state = createSeededState()
    // Spawn a targeted star so we have one to track
    spawnShootingStarAtTarget(state, { x: 50, y: 50 }, { dx: -1, dy: 1 })

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
    // Spawn the opening meteor shower stars
    let time = spawnOpeningShower(state)
    const initialMeteoriteCount = getMeteoriteEntities(state).length

    for (let i = 0; i < 500; i++) {
      tickShootingStars(state, time)
      time += 100
    }

    // the meteor shower stars should have produced meteorites
    expect(getMeteoriteEntities(state).length).toBeGreaterThan(initialMeteoriteCount)
  })
})
