// Spec acceptance tests for precis #4 (The Revery).
// Detailed unit tests live in revery.test.ts, omen-detection.test.ts,
// egregore-advance.test.ts, phenotype.test.ts, ReverySummary.test.tsx,
// and ManualPanel.test.tsx. This file is the spec's surface-level acceptance.
import { describe, expect, it } from 'vitest'

import { REVERY_COOLDOWN_MS } from '../constants'
import { createFloraLifecycleEntry } from '../floraLifecycleEntry'
import { FLORA_SPECIES } from '../flora/species'
import { generateGenesisIdentity, generateTraitBag } from '../genetics'
import { movePlayer } from '../movement'
import { detectOmen } from '../omen'
import { initiateRevery, isReveryLocked, tickRevery } from '../revery'
import { posKey } from '../position'
import { FloraSpecies, OmenKind, ReveryPhase, Season, Sky, TileType, Zone } from '../types'

import { clearAroundPlayer, createBeeEntity, createTestState } from './helpers'

import type { GameState } from '../types'

const setAutumnOverworld = (state: GameState): void => {
  state.weather.season = Season.Autumn
  state.currentZone = Zone.Overworld
  state.lastReveryEndTime = -REVERY_COOLDOWN_MS
}

const placeFloraAt = (state: GameState, x: number, y: number, species: FloraSpecies, trait = 0.5): void => {
  state.map[y][x] = { type: TileType.Flora }
  const identity = generateGenesisIdentity(FLORA_SPECIES[species].latinBinomial, 1, posKey(x, y))
  const traits = generateTraitBag(identity)
  traits.bloomTiming = trait
  state.floraLifecycle.set(
    posKey(x, y),
    createFloraLifecycleEntry({ time: 0, hasLight: true, species, identity, traits })
  )
}

describe('the revery (precis #4) — acceptance', () => {
  it('revery-state-on-gamestate: GameState exposes revery, reveryCount, cosmologicalDrift, revealedPhenotypes', () => {
    const state = createTestState()
    expect(state.revery).toBeNull()
    expect(state.reveryCount).toBe(0)
    expect(state.cosmologicalDrift).toBe(0)
    expect(state.revealedPhenotypes).toBeInstanceOf(Map)
    expect(state.lastReveryEndTime).toBe(0)
    expect(state.playerStationarySince).toBe(0)
    expect(state.lastSky).toBe(Sky.Sun)
  })

  it('omen-detection: bee on the player tile schedules the Revery (when gates pass)', () => {
    const state = createTestState()
    setAutumnOverworld(state)
    createBeeEntity(state, state.player.x, state.player.y)
    const omen = detectOmen(state, 60_000)
    expect(omen).toBe(OmenKind.BeeOnShoulder)
  })

  it('revery-enter-and-observe: Observing phase is reached and elapsedYears accumulates', () => {
    const state = createTestState()
    initiateRevery(state, 1000, OmenKind.BeeOnShoulder)
    tickRevery(state, 0, 1100)
    expect(state.revery?.phase).toBe(ReveryPhase.Observing)
    const before = state.revery?.elapsedYears ?? 0
    tickRevery(state, 0, 1200)
    expect((state.revery?.elapsedYears ?? 0) - before).toBeGreaterThan(0)
  })

  it('revery-input-lock: movePlayer is blocked during the Revery', () => {
    const state = createTestState()
    clearAroundPlayer(state, 3)
    initiateRevery(state, 1000, OmenKind.BeeOnShoulder)
    tickRevery(state, 0, 1100)
    expect(isReveryLocked(state)).toBe(true)
    expect(movePlayer(state, 'right')).toBe(false)
  })

  it('revery-resolves-phenotype-label: most-discovered species gains a hedged label at Summary', () => {
    const state = createTestState()
    state.manualDiscoveries.add('flora:clover')
    clearAroundPlayer(state, 5)
    placeFloraAt(state, state.player.x + 1, state.player.y, FloraSpecies.Clover, 0.5)
    initiateRevery(state, 1000, OmenKind.BeeOnShoulder)
    tickRevery(state, 0, 1100) // → Observing
    for (let i = 0; i < 250; i++) tickRevery(state, 0, 2000 + i)
    expect(state.revery?.phase).toBe(ReveryPhase.Summary)
    const list = state.revealedPhenotypes.get(FloraSpecies.Clover)
    expect(list?.length).toBe(1)
    expect(list?.[0].axis).toBe('bloomTiming')
  })

  it('revery-first-egregore-advance: only the first Revery places new egregore tiles', () => {
    const state = createTestState()
    state.egregorePositions = []
    clearAroundPlayer(state, 6)
    state.map[state.player.y + 4][state.player.x + 4] = { type: TileType.Egregore }
    state.egregorePositions.push({ x: state.player.x + 4, y: state.player.y + 4 })
    const before = state.egregorePositions.length
    initiateRevery(state, 1000, OmenKind.BeeOnShoulder)
    tickRevery(state, 0, 1100)
    for (let i = 0; i < 250; i++) tickRevery(state, 0, 2000 + i)
    expect(state.egregorePositions.length).toBeGreaterThan(before)
    // Mark Summary → Closing → null, then run a second Revery
    if (state.revery) state.revery.phase = ReveryPhase.Closing
    tickRevery(state, 0, 10_000)
    expect(state.reveryCount).toBe(1)
    const afterFirst = state.egregorePositions.length

    initiateRevery(state, 200_000, OmenKind.BeeOnShoulder)
    tickRevery(state, 0, 200_100)
    for (let i = 0; i < 250; i++) tickRevery(state, 0, 201_000 + i)
    expect(state.egregorePositions.length).toBe(afterFirst)
  })

  it('revery-summary-phase: summaryReady is true at Summary and scheduledChanges is populated', () => {
    const state = createTestState()
    initiateRevery(state, 1000, OmenKind.BeeOnShoulder)
    tickRevery(state, 0, 1100)
    for (let i = 0; i < 250; i++) tickRevery(state, 0, 2000 + i)
    expect(state.revery?.summaryReady).toBe(true)
    expect(state.revery?.phase).toBe(ReveryPhase.Summary)
  })

  it('revery-closing-and-reset: Closing increments reveryCount and clears state.revery', () => {
    const state = createTestState()
    initiateRevery(state, 1000, OmenKind.BeeOnShoulder)
    tickRevery(state, 0, 1100)
    if (state.revery) state.revery.phase = ReveryPhase.Closing
    tickRevery(state, 0, 5000)
    expect(state.revery).toBeNull()
    expect(state.reveryCount).toBe(1)
  })
})
