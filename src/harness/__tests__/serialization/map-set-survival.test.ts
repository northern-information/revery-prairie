import { withSeededRandom } from '@/harness/prng'
import { deserializeState, serializeState } from '@/harness/serialize'

import { createGameState } from '@/engine/state'

const SEED = 42

const createSeededState = () => withSeededRandom(SEED, () => createGameState('test', 40, 30))

describe('Map and Set survival', () => {
  describe('discoveredRecipes (Set)', () => {
    it('survives round-trip as a Set', () => {
      const state = createSeededState()
      expect(state.discoveredRecipes).toBeInstanceOf(Set)

      const json = serializeState(state)
      const restored = deserializeState(json)

      expect(restored.discoveredRecipes).toBeInstanceOf(Set)
    })

    it('preserves all values', () => {
      const state = createSeededState()
      state.discoveredRecipes.add('prairie')
      state.discoveredRecipes.add('test-recipe')

      const json = serializeState(state)
      const restored = deserializeState(json)

      expect(restored.discoveredRecipes.size).toBe(2)
      expect(restored.discoveredRecipes.has('prairie')).toBe(true)
      expect(restored.discoveredRecipes.has('test-recipe')).toBe(true)
    })

    it('preserves an empty Set', () => {
      const state = createSeededState()
      state.discoveredRecipes = new Set()

      const json = serializeState(state)
      const restored = deserializeState(json)

      expect(restored.discoveredRecipes).toBeInstanceOf(Set)
      expect(restored.discoveredRecipes.size).toBe(0)
    })
  })
})
