import { MAP_HEIGHT, MAP_WIDTH } from '../constants'
import { createGenesisState, GENESIS_EPOCHS, runAllMutations } from '../genesis'
import { posKey } from '../position'
import { withSeededRandom } from '@/harness/prng'
import { describe, expect, it } from 'vitest'

const SEED = 42

describe('genesis lightning bolts', () => {
  it('FireSeason produces lightning bolts alongside meteorites', () => {
    const sim = withSeededRandom(SEED, () => createGenesisState(MAP_WIDTH, MAP_HEIGHT, SEED))
    withSeededRandom(SEED, () => {
      runAllMutations(sim, GENESIS_EPOCHS)
    })

    expect(sim.meteorites.length).toBeGreaterThanOrEqual(5)
    expect(sim.lightningBolts.length).toBeGreaterThanOrEqual(2)
    expect(sim.lightningBolts.length).toBeLessThanOrEqual(4)
  })

  it('lightning bolt paths are valid vertical zigzag patterns', () => {
    const sim = withSeededRandom(SEED, () => createGenesisState(MAP_WIDTH, MAP_HEIGHT, SEED))
    withSeededRandom(SEED, () => {
      runAllMutations(sim, GENESIS_EPOCHS)
    })

    for (const bolt of sim.lightningBolts) {
      // Path descends monotonically
      for (let i = 1; i < bolt.path.length; i++) {
        expect(bolt.path[i].y).toBe(bolt.path[i - 1].y + 1)
      }

      // Each step has dx in {-1, 0, +1}
      for (let i = 1; i < bolt.path.length; i++) {
        const dx = bolt.path[i].x - bolt.path[i - 1].x
        expect([-1, 0, 1]).toContain(dx)
      }

      // Path ends at impact point
      const last = bolt.path[bolt.path.length - 1]
      expect(last.x).toBe(bolt.impactX)
      expect(last.y).toBe(bolt.impactY)

      // Path length is within bounds
      expect(bolt.path.length).toBeGreaterThanOrEqual(8)
      expect(bolt.path.length).toBeLessThanOrEqual(12)
    }
  })

  it('lightning impact points contribute to fire BFS spread', () => {
    const sim = withSeededRandom(SEED, () => createGenesisState(MAP_WIDTH, MAP_HEIGHT, SEED))
    withSeededRandom(SEED, () => {
      runAllMutations(sim, GENESIS_EPOCHS)
    })

    // At least some lightning impact points should be in burn scars
    let boltHitsInScars = 0
    for (const bolt of sim.lightningBolts) {
      if (sim.burnScars.has(posKey(bolt.impactX, bolt.impactY))) {
        boltHitsInScars++
      }
    }
    // Most bolt impacts should have triggered burn scars (they target vegetated land)
    expect(boltHitsInScars).toBeGreaterThan(0)
  })

  it('lightning bolts have staggered start times', () => {
    const sim = withSeededRandom(SEED, () => createGenesisState(MAP_WIDTH, MAP_HEIGHT, SEED))
    withSeededRandom(SEED, () => {
      runAllMutations(sim, GENESIS_EPOCHS)
    })

    const startTimes = sim.lightningBolts.map(b => b.startTime)
    // All start times should be between 0 and 0.3 (staggered in first 30% of epoch)
    for (const t of startTimes) {
      expect(t).toBeGreaterThanOrEqual(0.05)
      expect(t).toBeLessThanOrEqual(0.35)
    }
    // No two should have the same start time
    const unique = new Set(startTimes)
    expect(unique.size).toBe(startTimes.length)
  })
})
