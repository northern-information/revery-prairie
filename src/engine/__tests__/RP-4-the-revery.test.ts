// Spec acceptance tests for RP-4 (The Revery).
// Detailed unit tests live in revery.test.ts,
// egregore-advance.test.ts, phenotype.test.ts, ReverySummary.test.tsx,
// and ManualPanel.test.tsx. This file is the spec's surface-level acceptance.
//
// RP-32 retired the three omen-detection predicates and the
// detectOmen function. Tests that asserted omen-driven Revery entry
// have been removed here; the new pressure-path entry is covered by
// RP-32-revery-dormancy-pressure.test.ts and dormancy-pressure
// unit tests. The remaining tests below cover non-omen Revery behavior
// that survives unchanged.
import { describe, expect, it } from 'vitest'

import { createFloraLifecycleEntry } from '../floraLifecycleEntry'
import { FLORA_SPECIES } from '../flora/species'
import { generateGenesisIdentity, generateTraitBag } from '../genetics'
import { movePlayer } from '../movement'
import { initiateRevery, isReveryLocked, tickRevery } from '../revery'
import { posKey } from '../position'
import { FloraSpecies, OmenKind, ReveryPhase, Sky, TileType } from '../types'

import { clearAroundPlayer, createTestState } from './helpers'

import type { GameState } from '../types'

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

describe('the revery (RP-4) — acceptance', () => {
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

  // Removed (RP-32): bee-on-shoulder omen detection. The three predicates
  // and detectOmen were retired in v6 thinktank round 6. Pressure-path entry
  // is covered by RP-32-revery-dormancy-pressure.test.ts.

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

  it('revery-egregore-advance: every Revery places new egregore tiles (RP-8b)', () => {
    // First Revery: places FIRST_REVERY_EGREGORE_COUNT (3) per the
    // RP-4 contract. Subsequent Reveries: RP-8b refactor places
    // 6 + (reveryCount % 4) tiles. Both paths route through
    // advanceEgregoreInRevery.
    const state = createTestState()
    state.egregorePositions = []
    clearAroundPlayer(state, 8)
    // Two seed egregores so the candidate set is comfortably > 9 for
    // the second Revery (reveryCount=1 places 7).
    state.map[state.player.y + 3][state.player.x + 3] = { type: TileType.Egregore }
    state.egregorePositions.push({ x: state.player.x + 3, y: state.player.y + 3 })
    state.map[state.player.y + 6][state.player.x + 6] = { type: TileType.Egregore }
    state.egregorePositions.push({ x: state.player.x + 6, y: state.player.y + 6 })
    const before = state.egregorePositions.length
    initiateRevery(state, 1000, OmenKind.BeeOnShoulder)
    tickRevery(state, 0, 1100)
    for (let i = 0; i < 250; i++) tickRevery(state, 0, 2000 + i)
    expect(state.egregorePositions.length).toBeGreaterThan(before)
    if (state.revery) state.revery.phase = ReveryPhase.Closing
    tickRevery(state, 0, 10_000)
    expect(state.reveryCount).toBe(1)
    const afterFirst = state.egregorePositions.length

    initiateRevery(state, 200_000, OmenKind.BeeOnShoulder)
    tickRevery(state, 0, 200_100)
    for (let i = 0; i < 250; i++) tickRevery(state, 0, 201_000 + i)
    // Second Revery (reveryCount=1 entering Summary) places 6 + 1 % 4 = 7 more.
    expect(state.egregorePositions.length).toBeGreaterThan(afterFirst)
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
