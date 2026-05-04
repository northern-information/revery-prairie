import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ComponentType } from '../ecs/types'
import { MAX_BEE_POLLEN, MAX_POLLEN, POLLEN_PROFILES, emitPlayerTrailBurst, tickPollenDrift, tickPollenEmit } from '../pollen'
import { TileType, Zone } from '../types'

import { clearAroundPlayer, createBeeEntity, createTestState } from './helpers'

// ─── helpers ──────────────────────────────────────────────────────────────────

const makeWeather = (windSpeed: number, windDirection = 'W' as const) => ({
  sky: 'sun' as const,
  temperatureF: 60,
  windSpeed,
  windDirection,
  humidity: 60,
  season: 'spring' as const,
})

// Place a clover tile at position and mark it healthy
const plantClover = (state: ReturnType<typeof createTestState>, x: number, y: number): void => {
  state.map[y][x] = { type: TileType.Clover }
  // No lifecycle entry = defaults to Healthy in emission check
}

// ─── pollen emission ──────────────────────────────────────────────────────────

describe('pollen emission', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not emit when wind is below threshold', () => {
    const state = createTestState()
    state.weather = makeWeather(5)  // below threshold of 8
    plantClover(state, state.player.x, state.player.y)

    tickPollenEmit(state, 100)
    expect(state.pollen).toHaveLength(0)
  })

  it('does not emit outside Overworld zone', () => {
    const state = createTestState()
    state.weather = makeWeather(20)
    state.currentZone = Zone.Cave
    plantClover(state, state.player.x, state.player.y)

    tickPollenEmit(state, 100)
    expect(state.pollen).toHaveLength(0)
  })

  it('emits particles when wind exceeds threshold', () => {
    const state = createTestState()
    state.weather = makeWeather(25)
    // Ensure clover is within visible viewport
    const cx = state.camera.x + 5
    const cy = state.camera.y + 5
    plantClover(state, cx, cy)
    // Mock random to always emit
    vi.spyOn(Math, 'random').mockReturnValue(0)

    tickPollenEmit(state, 100)
    expect(state.pollen.length).toBeGreaterThan(0)
  })

  it('never exceeds MAX_POLLEN cap', () => {
    const state = createTestState()
    state.weather = makeWeather(25)
    vi.spyOn(Math, 'random').mockReturnValue(0)

    // Fill the pool to capacity
    for (let i = 0; i < MAX_POLLEN; i++) {
      state.pollen.push({ x: 5, y: 5, age: 0, maxAge: 1000, profileId: 'clover' })
    }

    const cx = state.camera.x + 5
    const cy = state.camera.y + 5
    plantClover(state, cx, cy)
    tickPollenEmit(state, 100)

    expect(state.pollen).toHaveLength(MAX_POLLEN)
  })

  it('particles have valid profile id and finite positions', () => {
    const state = createTestState()
    state.weather = makeWeather(25)
    const cx = state.camera.x + 5
    const cy = state.camera.y + 5
    plantClover(state, cx, cy)
    vi.spyOn(Math, 'random').mockReturnValue(0)

    tickPollenEmit(state, 100)

    for (const p of state.pollen) {
      expect(POLLEN_PROFILES[p.profileId]).toBeDefined()
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
      expect(p.age).toBe(0)
      expect(p.maxAge).toBeGreaterThan(0)
    }
  })
})

// ─── pollen drift ─────────────────────────────────────────────────────────────

describe('pollen drift', () => {
  it('advances particle age each frame', () => {
    const state = createTestState()
    state.weather = makeWeather(25)
    state.pollen.push({ x: 5, y: 5, age: 0, maxAge: 1000, profileId: 'clover' })

    tickPollenDrift(state, 16)
    expect(state.pollen[0]?.age).toBe(16)
  })

  it('removes particles whose age exceeds maxAge', () => {
    const state = createTestState()
    state.weather = makeWeather(25)
    state.pollen.push({ x: 5, y: 5, age: 990, maxAge: 1000, profileId: 'clover' })

    tickPollenDrift(state, 20)
    expect(state.pollen).toHaveLength(0)
  })

  it('moves particles in the wind direction', () => {
    const state = createTestState()
    state.weather = makeWeather(25, 'W')  // blows east: sx=1, sy=1
    state.pollen.push({ x: 5, y: 5, age: 0, maxAge: 5000, profileId: 'clover' })

    const before = { x: state.pollen[0].x, y: state.pollen[0].y }
    tickPollenDrift(state, 100)
    const after = { x: state.pollen[0].x, y: state.pollen[0].y }

    // W wind: sx=1, sy=1 — both x and y should increase
    expect(after.x).toBeGreaterThan(before.x)
    expect(after.y).toBeGreaterThan(before.y)
  })

  it('does not move particles when wind speed is 0', () => {
    const state = createTestState()
    state.weather = makeWeather(0)
    state.pollen.push({ x: 5, y: 5, age: 0, maxAge: 5000, profileId: 'clover' })

    const before = { x: state.pollen[0].x, y: state.pollen[0].y }
    tickPollenDrift(state, 100)

    expect(state.pollen[0]?.x).toBeCloseTo(before.x)
    expect(state.pollen[0]?.y).toBeCloseTo(before.y)
  })

  it('does not crash with an empty pool', () => {
    const state = createTestState()
    state.weather = makeWeather(25)
    expect(() => { tickPollenDrift(state, 16) }).not.toThrow()
    expect(state.pollen).toHaveLength(0)
  })
})

// ─── pool capacity cap ────────────────────────────────────────────────────────

describe('pool capacity cap', () => {
  it('pool never exceeds MAX_POLLEN (150)', () => {
    const state = createTestState()
    state.weather = makeWeather(25)
    state.currentZone = Zone.Overworld
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const cx = state.camera.x + 5
    const cy = state.camera.y + 5
    plantClover(state, cx, cy)

    // Run many emit ticks
    for (let i = 0; i < 200; i++) {
      tickPollenEmit(state, 100)
    }
    expect(state.pollen.length).toBeLessThanOrEqual(MAX_POLLEN)

    vi.restoreAllMocks()
  })
})

// ─── player trail ─────────────────────────────────────────────────────────────

describe('player trail', () => {
  it('emits burst particles when stepping off clover', () => {
    const state = createTestState()
    clearAroundPlayer(state)

    state.pollenTrailDepth = 3
    emitPlayerTrailBurst(state, state.player.x, state.player.y)

    // 2 + min(3, 6) = 5 particles
    expect(state.pollen).toHaveLength(5)
  })

  it('resets pollenTrailDepth to 0 after burst', () => {
    const state = createTestState()
    state.pollenTrailDepth = 5
    emitPlayerTrailBurst(state, state.player.x, state.player.y)
    expect(state.pollenTrailDepth).toBe(0)
  })

  it('burst size minimum is 2 when depth is 0', () => {
    const state = createTestState()
    state.pollenTrailDepth = 0
    emitPlayerTrailBurst(state, state.player.x, state.player.y)
    expect(state.pollen).toHaveLength(2)
  })

  it('burst size caps at 8 when depth is large', () => {
    const state = createTestState()
    state.pollenTrailDepth = 8
    emitPlayerTrailBurst(state, state.player.x, state.player.y)
    // 2 + min(8, 6) = 8
    expect(state.pollen).toHaveLength(8)
  })

  it('respects MAX_POLLEN cap during burst', () => {
    const state = createTestState()
    // Fill pool to capacity minus 1
    for (let i = 0; i < MAX_POLLEN - 1; i++) {
      state.pollen.push({ x: 0, y: 0, age: 0, maxAge: 1000, profileId: 'clover' })
    }
    state.pollenTrailDepth = 8
    emitPlayerTrailBurst(state, state.player.x, state.player.y)
    expect(state.pollen.length).toBeLessThanOrEqual(MAX_POLLEN)
  })
})

// ─── bee pollen attachment ────────────────────────────────────────────────────

describe('bee pollen attachment', () => {
  it('bee starts with pollenCount 0', () => {
    const state = createTestState()
    clearAroundPlayer(state)
    const eid = createBeeEntity(state, state.player.x + 2, state.player.y)
    const pollenData = state.world.getComponent(eid, ComponentType.BeePollenData)
    expect(pollenData).toBeDefined()
    expect(pollenData?.pollenCount).toBe(0)
  })

  it('MAX_BEE_POLLEN is 4', () => {
    expect(MAX_BEE_POLLEN).toBe(4)
  })
})
