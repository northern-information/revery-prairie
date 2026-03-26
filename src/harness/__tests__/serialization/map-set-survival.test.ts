import { withSeededRandom } from '@/harness/prng'
import { serializeState, deserializeState } from '@/harness/serialize'
import { createGameState } from '@/engine/state'

const SEED = 42

const createSeededState = () =>
  withSeededRandom(SEED, () => createGameState('test', 40, 30))

describe('Map and Set survival', () => {
  describe('omniboxContainers (Map)', () => {
    it('survives round-trip as a Map', () => {
      const state = createSeededState()
      // the default state has at least one omnibox container from createGameState
      expect(state.omniboxContainers).toBeInstanceOf(Map)

      const json = serializeState(state)
      const restored = deserializeState(json)

      expect(restored.omniboxContainers).toBeInstanceOf(Map)
    })

    it('preserves all entries', () => {
      const state = createSeededState()
      const originalSize = state.omniboxContainers.size

      const json = serializeState(state)
      const restored = deserializeState(json)

      expect(restored.omniboxContainers.size).toBe(originalSize)

      for (const [key, value] of state.omniboxContainers) {
        expect(restored.omniboxContainers.has(key)).toBe(true)
        const restoredContainer = restored.omniboxContainers.get(key)
        expect(restoredContainer).toBeDefined()
        expect(restoredContainer?.name).toBe(value.name)
        expect(restoredContainer?.width).toBe(value.width)
        expect(restoredContainer?.height).toBe(value.height)
      }
    })

    it('preserves an empty Map', () => {
      const state = createSeededState()
      state.omniboxContainers = new Map()

      const json = serializeState(state)
      const restored = deserializeState(json)

      expect(restored.omniboxContainers).toBeInstanceOf(Map)
      expect(restored.omniboxContainers.size).toBe(0)
    })
  })

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
      state.discoveredRecipes.add('omnibox')

      const json = serializeState(state)
      const restored = deserializeState(json)

      expect(restored.discoveredRecipes.size).toBe(2)
      expect(restored.discoveredRecipes.has('prairie')).toBe(true)
      expect(restored.discoveredRecipes.has('omnibox')).toBe(true)
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
