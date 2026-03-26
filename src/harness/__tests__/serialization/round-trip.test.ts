import { withSeededRandom } from '@/harness/prng'
import {
  serializeState,
  deserializeState,
  FUNCTION_FIELDS,
} from '@/harness/serialize'
import { createGameState } from '@/engine/state'
import type { GameState } from '@/engine/types'

const SEED = 42

const createSeededState = () =>
  withSeededRandom(SEED, () => createGameState('test', 40, 30))

describe('serialization round-trip', () => {
  it('persistent fields survive serialize/deserialize', () => {
    const original = createSeededState()
    const json = serializeState(original)
    const restored = deserializeState(json)

    const persistentKeys = (Object.keys(original) as (keyof GameState)[]).filter(
      (k) => !FUNCTION_FIELDS.includes(k),
    )

    for (const key of persistentKeys) {
      const origVal = original[key]
      const restoredVal = restored[key]

      if (origVal instanceof Map) {
        expect(restoredVal).toBeInstanceOf(Map)
        expect([...(restoredVal as Map<string, unknown>).entries()]).toEqual(
          [...origVal.entries()],
        )
      } else if (origVal instanceof Set) {
        expect(restoredVal).toBeInstanceOf(Set)
        expect([...(restoredVal as Set<unknown>).values()]).toEqual(
          [...origVal.values()],
        )
      } else {
        expect(restoredVal).toEqual(origVal)
      }
    }
  })

  it('function fields become null after round-trip', () => {
    const original = createSeededState()
    const json = serializeState(original)
    const restored = deserializeState(json)

    for (const key of FUNCTION_FIELDS) {
      expect(restored[key]).toBeNull()
    }
  })

  it('round-trip produces valid JSON', () => {
    const state = createSeededState()
    const json = serializeState(state)

    expect(() => {
      JSON.parse(json) as unknown
    }).not.toThrow()
  })

  it('two seeded states have the same structure (excluding UIDs)', () => {
    const a = createSeededState()
    const b = createSeededState()

    // same number of backpack items
    expect(a.backpack.items).toHaveLength(b.backpack.items.length)

    // same item definition IDs in same order
    const aIds = a.backpack.items.map((i) => i.definitionId)
    const bIds = b.backpack.items.map((i) => i.definitionId)
    expect(aIds).toEqual(bIds)

    // same map dimensions and player position
    expect(a.player).toEqual(b.player)
    expect(a.mapWidth).toBe(b.mapWidth)
    expect(a.mapHeight).toBe(b.mapHeight)
  })
})
