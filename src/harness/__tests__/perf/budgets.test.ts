import { withSeededRandom } from '@/harness/prng'
import { findPath } from '@/engine/pathfinding'
import { generateTerrain } from '@/engine/terrain'
import { autoSort, placeItem } from '@/engine/inventory'
import { createBackpack } from '@/engine/items'
import { MAP_WIDTH, MAP_HEIGHT, SPACE_BORDER } from '@/engine/constants'
import { Rotation } from '@/engine/types'

const SEED = 42

// advisory budgets — warn at 1x, fail at 10x
const budget = (name: string, budgetMs: number, fn: () => void) => {
  it(`${name} completes within ${budgetMs}ms (hard limit: ${budgetMs * 10}ms)`, () => {
    const start = performance.now()
    fn()
    const elapsed = performance.now() - start

    if (elapsed > budgetMs) {
      console.warn(
        `[perf] ${name}: ${elapsed.toFixed(1)}ms (budget: ${budgetMs}ms)`,
      )
    }

    // hard fail at 10x budget
    expect(elapsed).toBeLessThan(budgetMs * 10)
  })
}

describe('performance budgets', () => {
  budget('findPath across full map', 50, () => {
    const map = withSeededRandom(SEED, () =>
      generateTerrain(MAP_WIDTH, MAP_HEIGHT),
    )

    // path from near top-left land to near bottom-right land
    const from = { x: SPACE_BORDER + 5, y: SPACE_BORDER + 5 }
    const to = {
      x: MAP_WIDTH - SPACE_BORDER - 5,
      y: MAP_HEIGHT - SPACE_BORDER - 5,
    }

    findPath(map, MAP_WIDTH, MAP_HEIGHT, from, to)
  })

  budget('generateTerrain', 100, () => {
    withSeededRandom(SEED, () => {
      generateTerrain(MAP_WIDTH, MAP_HEIGHT)
    })
  })

  budget('autoSort on full backpack', 10, () => {
    const backpack = createBackpack()

    // fill backpack with small items
    withSeededRandom(SEED, () => {
      const smallItems = ['bee', 'clover']
      for (let y = 0; y < 6; y++) {
        for (let x = 0; x < 4; x++) {
          const itemId = smallItems[(x + y) % smallItems.length]!
          placeItem(backpack, itemId, Rotation.R0, x, y)
        }
      }
    })

    autoSort(backpack)
  })
})
