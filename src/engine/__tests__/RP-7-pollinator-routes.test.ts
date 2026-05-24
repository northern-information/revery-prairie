// Spec acceptance tests for RP-7 (Pollinator routes & preference).
// Detailed unit tests live in tileBeePreference.test.ts, bee-routing.test.ts,
// and pollen-emit-bias.test.ts. This file is the spec's acceptance surface.
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ComponentType } from '../ecs/types'
import { tickBees } from '../entities'
import { createFloraLifecycleEntry } from '../floraLifecycleEntry'
import { FLORA_SPECIES, getTileBeePreference } from '../flora/species'
import {
  registerFloraPollinate,
  tickPollenEmit,
  unregisterFloraPollinate,
} from '../flora/actions/pollinate'
import { generateGenesisIdentity, generateTraitBag } from '../genetics'
import { posKey } from '../position'
import { FloraSpecies, TileType } from '../types'

import { clearAroundPlayer, createBeeEntity, createTestState } from './helpers'

import type { FloraPollinateProfile, GameState } from '../types'

const TEST_POLLEN_PROFILE: FloraPollinateProfile = {
  glyph: '.',
  color: '#b07fc7',
  parsedColor: [176, 127, 199],
  windThreshold: 8,
  emitRate: 0.15,
  minAge: 800,
  maxAge: 1400,
}

const placeFloraAt = (state: GameState, x: number, y: number, species: FloraSpecies, trait: number): void => {
  state.map[y][x] = { type: TileType.Flora }
  const identity = generateGenesisIdentity(FLORA_SPECIES[species].latinBinomial, 1, posKey(x, y))
  const traits = generateTraitBag(identity)
  traits.pollinatorPreference = trait
  state.floraLifecycle.set(
    posKey(x, y),
    createFloraLifecycleEntry({ time: 0, hasLight: true, species, identity, traits })
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  unregisterFloraPollinate(TileType.Flora)
})

describe('pollinator routes (RP-7) — acceptance', () => {
  it('species-bee-preference-baseline: registry exposes per-species bee preference', () => {
    expect(FLORA_SPECIES[FloraSpecies.Clover].beePreference).toBe(1.0)
    expect(FLORA_SPECIES[FloraSpecies.Wildflower].beePreference).toBe(0.6)
    expect(FLORA_SPECIES[FloraSpecies.TallGrass].beePreference).toBe(0.3)
  })

  it('tile-bee-preference-blend: combines species baseline with per-plant trait, clamped to [0, 1]', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const x = state.player.x + 1
    const y = state.player.y
    placeFloraAt(state, x, y, FloraSpecies.Clover, 1.0)
    expect(getTileBeePreference(state, x, y)).toBe(1.0) // clamped down from 1.25
    placeFloraAt(state, x, y, FloraSpecies.Wildflower, 0)
    expect(getTileBeePreference(state, x, y)).toBeCloseTo(0.45) // 0.6 * 0.75
  })

  it('bee-routing-by-preference: weighted neighbor choice favors high-preference tiles', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const bx = state.player.x + 3
    const by = state.player.y
    placeFloraAt(state, bx + 1, by, FloraSpecies.Clover, 0.5)
    const beeEid = createBeeEntity(state, bx, by)

    let cloverHits = 0
    let idx = 0
    const sequence: number[] = []
    for (let i = 0; i < 200; i++) sequence.push(0.1, i / 200)
    vi.spyOn(Math, 'random').mockImplementation(() => {
      const v = sequence[idx % sequence.length]
      idx += 1
      return v
    })
    try {
      for (let i = 0; i < 200; i++) {
        state.world.addComponent(beeEid, ComponentType.Position, { x: bx, y: by })
        tickBees(state)
        const pos = state.world.getComponent(beeEid, ComponentType.Position)
        if (pos && state.map[pos.y][pos.x].type === TileType.Flora) cloverHits += 1
      }
    } finally {
      vi.restoreAllMocks()
    }
    expect(cloverHits).toBeGreaterThan(100)
  })

  it('bee-starvation-multi-species: non-clover flora counts as bee food', () => {
    const state = createTestState()
    clearAroundPlayer(state, 5)
    const bx = state.player.x + 3
    const by = state.player.y
    placeFloraAt(state, bx + 1, by, FloraSpecies.Wildflower, 0.5)
    const beeEid = createBeeEntity(state, bx, by)
    for (let i = 0; i < 50; i++) tickBees(state)
    // If wildflower didn't count as food, BEE_STARVATION_MS would have killed
    // the bee by now. Surviving 50 ticks proves multi-species food works.
    expect(state.world.getComponent(beeEid, ComponentType.Position)).toBeDefined()
  })

  it('pollen-emit-bias: high-pollinatorPreference plants emit more pollen than low-preference siblings', () => {
    const state = createTestState()
    state.wind.smoothSx = 1
    state.wind.smoothSy = 0
    state.wind.smoothSpeed = 25
    state.wind.gustIntensity = 0
    state.weather.windSpeed = 25
    clearAroundPlayer(state, 8)
    registerFloraPollinate(TileType.Flora, TEST_POLLEN_PROFILE)

    const lowX = state.player.x + 1
    const lowY = state.player.y
    const highX = state.player.x + 3
    const highY = state.player.y
    placeFloraAt(state, lowX, lowY, FloraSpecies.Clover, 0.0)
    placeFloraAt(state, highX, highY, FloraSpecies.Clover, 1.0)

    let callIdx = 0
    vi.spyOn(Math, 'random').mockImplementation(() => {
      const v = callIdx % 3 === 0 ? 0.01 : 0.5
      callIdx += 1
      return v
    })
    try {
      for (let i = 0; i < 30; i++) tickPollenEmit(state, 100)
    } finally {
      vi.restoreAllMocks()
    }

    let lowCount = 0
    let highCount = 0
    for (const p of state.pollen) {
      if (Math.abs(p.x - lowX) < 1 && Math.abs(p.y - lowY) < 1) lowCount += 1
      if (Math.abs(p.x - highX) < 1 && Math.abs(p.y - highY) < 1) highCount += 1
    }
    expect(highCount).toBeGreaterThan(lowCount)
  })
})
