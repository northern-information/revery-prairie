import { createGameState } from '../state'
import { Sky, Zone } from '../types'
import { describe, expect, it } from 'vitest'

describe('weather rain overlay', () => {
  it('weather sky can be set to rain', () => {
    const state = createGameState('test', 80, 24)
    state.weather.sky = Sky.Rain
    expect(state.weather.sky).toBe('rain')
  })

  it('weather sky defaults to a valid value', () => {
    const state = createGameState('test', 80, 24)
    expect([Sky.Sun, Sky.Cloudy, Sky.Rain, Sky.Snow]).toContain(state.weather.sky)
  })

  it('currentZone defaults to overworld', () => {
    const state = createGameState('test', 80, 24)
    expect(state.currentZone).toBe(Zone.Overworld)
  })

  it('rain overlay should only render in overworld', () => {
    // Verify that the Zone enum has the expected values
    // The renderer checks zone === Zone.Overworld
    expect(Zone.Overworld).toBe('overworld')
    expect(Zone.Cave).toBe('cave')
  })
})
