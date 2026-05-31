import { afterEach, describe, expect, it, vi } from 'vitest'
import { Sky, Zone } from '../../../types'
import { weatherRainOverlayPass } from '../weatherRainOverlay'
import { TEST_CHAR_METRICS, makeCanvasStub } from '../../../__tests__/canvasStub'
import { clearAroundPlayer, createTestState } from '../../../__tests__/helpers'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('weatherRainOverlayPass', () => {
  describe('isActive', () => {
    it('is true when sky is Rain, precipitation > 0, and zone is Overworld', () => {
      const state = createTestState()
      state.currentZone = Zone.Overworld
      state.weather.sky = Sky.Rain
      state.precipitationIntensity = 0.5
      expect(weatherRainOverlayPass.isActive(state)).toBe(true)
    })

    it('is false when zone is not Overworld', () => {
      const state = createTestState()
      state.weather.sky = Sky.Rain
      state.precipitationIntensity = 1
      state.currentZone = Zone.Cave
      expect(weatherRainOverlayPass.isActive(state)).toBe(false)
      state.currentZone = Zone.HouseInterior
      expect(weatherRainOverlayPass.isActive(state)).toBe(false)
      state.currentZone = Zone.LittleHouseYard
      expect(weatherRainOverlayPass.isActive(state)).toBe(false)
    })

    it('is false when sky is not Rain (Clear, Snow, etc.)', () => {
      const state = createTestState()
      state.currentZone = Zone.Overworld
      state.precipitationIntensity = 1
      state.weather.sky = Sky.Sun
      expect(weatherRainOverlayPass.isActive(state)).toBe(false)
      state.weather.sky = Sky.Cloudy
      expect(weatherRainOverlayPass.isActive(state)).toBe(false)
      state.weather.sky = Sky.Snow
      expect(weatherRainOverlayPass.isActive(state)).toBe(false)
    })

    it('is false when precipitationIntensity is 0', () => {
      const state = createTestState()
      state.currentZone = Zone.Overworld
      state.weather.sky = Sky.Rain
      state.precipitationIntensity = 0
      expect(weatherRainOverlayPass.isActive(state)).toBe(false)
    })
  })

  describe('pass metadata', () => {
    it('registers in the effect slot with id "weather-rain-overlay"', () => {
      expect(weatherRainOverlayPass.id).toBe('weather-rain-overlay')
      expect(weatherRainOverlayPass.slot).toBe('effect')
    })
  })

  describe('draw', () => {
    it('does not throw with a fully-initialized rain state', () => {
      const state = createTestState()
      state.currentZone = Zone.Overworld
      state.weather.sky = Sky.Rain
      state.precipitationIntensity = 0.6
      // Make sure the player has space around them so the loop runs but
      // no asserting tile properties are required.
      clearAroundPlayer(state, 5)
      const { ctx } = makeCanvasStub()
      expect(() => {
        weatherRainOverlayPass.draw(ctx, state, TEST_CHAR_METRICS, 1000)
      }).not.toThrow()
    })

    it('restores globalAlpha to its prior value after drawing', () => {
      const state = createTestState()
      state.currentZone = Zone.Overworld
      state.weather.sky = Sky.Rain
      state.precipitationIntensity = 0.6
      const { ctx } = makeCanvasStub()
      ctx.globalAlpha = 0.42
      weatherRainOverlayPass.draw(ctx, state, TEST_CHAR_METRICS, 1000)
      expect(ctx.globalAlpha).toBe(0.42)
    })
  })
})
