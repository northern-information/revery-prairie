import { withSeededRandom } from '@/harness/prng'
import { createGameState } from '@/engine/state'
import { tickWeather } from '@/engine/weather'

const SEED = 42
const TICK_SEED = 77

const createSeededState = () =>
  withSeededRandom(SEED, () => createGameState('test', 40, 30))

describe('replay: weather drift', () => {
  it('produces identical weather after the same tick sequence', () => {
    const run = () => {
      const state = createSeededState()
      withSeededRandom(TICK_SEED, () => {
        for (let i = 0; i < 50; i++) {
          tickWeather(state.weather)
        }
      })
      return { ...state.weather }
    }

    expect(run()).toEqual(run())
  })

  it('weather drifts from initial values over many ticks', () => {
    const state = createSeededState()
    const initialTemp = state.weather.temperatureF
    const initialHumidity = state.weather.humidity
    const initialWind = state.weather.windSpeed

    withSeededRandom(TICK_SEED, () => {
      for (let i = 0; i < 100; i++) {
        tickWeather(state.weather)
      }
    })

    // at least one value should have changed after 100 ticks
    const changed =
      state.weather.temperatureF !== initialTemp ||
      state.weather.humidity !== initialHumidity ||
      state.weather.windSpeed !== initialWind
    expect(changed).toBe(true)
  })

  it('temperature stays within spring bounds', () => {
    const state = createSeededState()

    withSeededRandom(TICK_SEED, () => {
      for (let i = 0; i < 200; i++) {
        tickWeather(state.weather)
        expect(state.weather.temperatureF).toBeGreaterThanOrEqual(35)
        expect(state.weather.temperatureF).toBeLessThanOrEqual(72)
      }
    })
  })

  it('humidity stays within spring bounds', () => {
    const state = createSeededState()

    withSeededRandom(TICK_SEED, () => {
      for (let i = 0; i < 200; i++) {
        tickWeather(state.weather)
        expect(state.weather.humidity).toBeGreaterThanOrEqual(45)
        expect(state.weather.humidity).toBeLessThanOrEqual(85)
      }
    })
  })

  it('wind speed stays within spring bounds', () => {
    const state = createSeededState()

    withSeededRandom(TICK_SEED, () => {
      for (let i = 0; i < 200; i++) {
        tickWeather(state.weather)
        expect(state.weather.windSpeed).toBeGreaterThanOrEqual(3)
        expect(state.weather.windSpeed).toBeLessThanOrEqual(25)
      }
    })
  })
})
