import { describe, expect, it } from 'vitest'

import { REVERY_COOLDOWN_MS, REVERY_OMEN_STATIONARY_MS } from '../constants'
import { ComponentType } from '../ecs/types'
import { detectOmen } from '../omen'
import { initiateRevery } from '../revery'
import { DeepTimePhase, OmenKind, Season, Sky, Zone } from '../types'

import { clearAroundPlayer, createBeeEntity, createTestState } from './helpers'

import type { GameState } from '../types'

const setAutumnOverworld = (state: GameState): void => {
  state.weather.season = Season.Autumn
  state.currentZone = Zone.Overworld
  state.lastReveryEndTime = -REVERY_COOLDOWN_MS // ensure cooldown is satisfied
}

describe('detectOmen — variants (precis #4)', () => {
  it('returns BeeOnShoulder when a bee is on the player tile', () => {
    const state = createTestState()
    setAutumnOverworld(state)
    clearAroundPlayer(state, 3)
    createBeeEntity(state, state.player.x, state.player.y)
    expect(detectOmen(state, 60_000)).toBe(OmenKind.BeeOnShoulder)
  })

  it('returns DistantMeteorite when a shooting star lands within Chebyshev 3', () => {
    const state = createTestState()
    setAutumnOverworld(state)
    clearAroundPlayer(state, 5)
    const e = state.world.createEntity()
    state.world.addComponent(e, ComponentType.Position, { x: state.player.x, y: state.player.y })
    state.world.addComponent(e, ComponentType.ShootingStarData, {
      length: 5,
      age: 0,
      willLand: true,
      landingTarget: { x: state.player.x + 2, y: state.player.y + 1 },
    })
    expect(detectOmen(state, 60_000)).toBe(OmenKind.DistantMeteorite)
  })

  it('does NOT return DistantMeteorite when willLand is false', () => {
    const state = createTestState()
    setAutumnOverworld(state)
    const e = state.world.createEntity()
    state.world.addComponent(e, ComponentType.Position, { x: state.player.x, y: state.player.y })
    state.world.addComponent(e, ComponentType.ShootingStarData, {
      length: 5,
      age: 0,
      willLand: false,
      landingTarget: null,
    })
    expect(detectOmen(state, 60_000)).toBeNull()
  })

  it('returns CloudPassingSun on Cloudy → Sun transition with stationary player', () => {
    const state = createTestState()
    setAutumnOverworld(state)
    state.lastSky = Sky.Cloudy
    state.weather.sky = Sky.Sun
    state.playerStationarySince = 1000
    const now = 1000 + REVERY_OMEN_STATIONARY_MS + 100
    expect(detectOmen(state, now)).toBe(OmenKind.CloudPassingSun)
  })

  it('does NOT return CloudPassingSun if player moved too recently', () => {
    const state = createTestState()
    setAutumnOverworld(state)
    state.lastSky = Sky.Rain
    state.weather.sky = Sky.Sun
    state.playerStationarySince = 1000
    // Player has only been stationary for 500ms — below threshold
    expect(detectOmen(state, 1500)).toBeNull()
  })
})

describe('detectOmen — gates (precis #4)', () => {
  it('returns null when a Revery is already running', () => {
    const state = createTestState()
    setAutumnOverworld(state)
    createBeeEntity(state, state.player.x, state.player.y)
    initiateRevery(state, 60_000, OmenKind.BeeOnShoulder)
    expect(detectOmen(state, 60_000)).toBeNull()
  })

  it('returns null when deep time is active', () => {
    const state = createTestState()
    setAutumnOverworld(state)
    createBeeEntity(state, state.player.x, state.player.y)
    state.deepTime = {
      active: true,
      startTime: 0,
      phase: DeepTimePhase.Burning,
      elapsedYears: 0,
      playerGlyph: 'ö',
      playerGlyphColor: '#fff',
      scheduledStrikeYears: [],
      strikesCompleted: 0,
      shakeUntil: 0,
    }
    expect(detectOmen(state, 60_000)).toBeNull()
  })

  it('returns null when player is in cave zone', () => {
    const state = createTestState()
    setAutumnOverworld(state)
    state.currentZone = Zone.Cave
    createBeeEntity(state, state.player.x, state.player.y)
    expect(detectOmen(state, 60_000)).toBeNull()
  })

  it('returns null when season is not Autumn', () => {
    const state = createTestState()
    setAutumnOverworld(state)
    state.weather.season = Season.Spring
    createBeeEntity(state, state.player.x, state.player.y)
    expect(detectOmen(state, 60_000)).toBeNull()
  })

  it('returns null when within cooldown of the previous Revery', () => {
    const state = createTestState()
    setAutumnOverworld(state)
    state.lastReveryEndTime = 30_000
    createBeeEntity(state, state.player.x, state.player.y)
    expect(detectOmen(state, 30_000 + REVERY_COOLDOWN_MS - 100)).toBeNull()
  })
})
