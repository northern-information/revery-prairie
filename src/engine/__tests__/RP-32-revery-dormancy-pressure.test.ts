// Spec acceptance tests for RP-32 (Revery dormancy pressure — forcing
// function). See harness/specs/RP-32-revery-dormancy-pressure.yaml.
//
// This file is the spec's surface-level acceptance suite — a thin smoke
// test over the spec's behaviors. Detailed coverage lives in
// dormancy-pressure.test.ts and revery-summons.test.ts.
//
// v6 thinktank round 6 (2026-05-22) retired the three existing omen
// variants. The omen surface itself is now RP-36's scope (The Revery
// Knot). This spec covers the pressure substrate, threshold, summons
// sequence, Gron arrival, collapse tile, and the Closing-phase egregoric
// commit.
import { REVERY_COOLDOWN_MS, REVERY_PRESSURE_RAMP_END } from '../constants'
import { createCharacterEntity } from '../entities'
import * as omenModule from '../omen'
import { contributeDormancyPressure, tickDormancyPressure } from '../omen'
import { initiateRevery, tickRevery } from '../revery'
import { OmenKind, ReveryPhase, Season, TileType, Zone } from '../types'
import { clearAroundPlayer, createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

import type { GameState } from '../types'

const setAutumnOverworld = (state: GameState): void => {
  state.weather.season = Season.Autumn
  state.currentZone = Zone.Overworld
  state.lastReveryEndTime = -REVERY_COOLDOWN_MS
}

describe('RP-32 — revery dormancy pressure', () => {
  it('initializes dormancyPressure to 0 on createGameState', () => {
    const state = createTestState()
    expect(state.dormancyPressure).toBe(0)
  })

  it('floors dormancyPressure linearly from autumn equinox to winter solstice', () => {
    const state = createTestState()
    setAutumnOverworld(state)
    state.seasonalPhase = 0.625 // midpoint of the ramp
    tickDormancyPressure(state, 60_000)
    expect(state.dormancyPressure).toBeCloseTo(0.5, 5)
  })

  it('reaches dormancyPressure 1.0 at the winter solstice frame with no contributions', () => {
    const state = createTestState()
    setAutumnOverworld(state)
    state.seasonalPhase = REVERY_PRESSURE_RAMP_END
    tickDormancyPressure(state, 60_000)
    expect(state.dormancyPressure).toBe(1)
  })

  it('exposes contributeDormancyPressure that clamps additions to [0, 1]', () => {
    const state = createTestState()
    state.dormancyPressure = 0.8
    contributeDormancyPressure(state, 0.5)
    expect(state.dormancyPressure).toBe(1)
  })

  it('runs the summons sequence when state.revery.summons is true', () => {
    const state = createTestState()
    setAutumnOverworld(state)
    clearAroundPlayer(state, 3)
    createCharacterEntity(state, 'gron', { x: state.player.x + 5, y: state.player.y + 5 })
    // RP-33 — capture the collapse tile expectation BEFORE
    // tickRevery, since Omen → Observing moves the steward to the bed.
    const expected = { x: state.player.x, y: state.player.y }
    initiateRevery(state, 1000, OmenKind.ReveryKnot)
    if (state.revery) state.revery.summons = true
    tickRevery(state, 0, 1000)
    expect(state.revery?.summonsCollapseTile).toEqual(expected)
    expect(state.collapsedStewardTile).not.toBeNull()
    expect(state.activeDialog).toMatchObject({ speakerKind: 'character', characterId: 'gron' })
  })

  it('commits the steward collapse tile to TileType.Egregore at Closing (summons path)', () => {
    const state = createTestState()
    setAutumnOverworld(state)
    clearAroundPlayer(state, 3)
    createCharacterEntity(state, 'gron', { x: state.player.x + 5, y: state.player.y + 5 })
    const px = state.player.x
    const py = state.player.y
    state.overworldMap[py][px] = { type: TileType.Dirt }
    initiateRevery(state, 1000, OmenKind.ReveryKnot)
    if (state.revery) state.revery.summons = true
    tickRevery(state, 0, 1000)
    if (state.revery) state.revery.phase = ReveryPhase.Closing
    tickRevery(state, 0, 2000)
    expect(state.overworldMap[py][px].type).toBe(TileType.Egregore)
  })

  it('resets dormancyPressure at Revery Closing', () => {
    const state = createTestState()
    setAutumnOverworld(state)
    clearAroundPlayer(state, 3)
    createCharacterEntity(state, 'gron', { x: state.player.x + 5, y: state.player.y + 5 })
    initiateRevery(state, 1000, OmenKind.ReveryKnot)
    if (state.revery) state.revery.summons = true
    tickRevery(state, 0, 1000)
    if (state.revery) state.revery.phase = ReveryPhase.Closing
    tickRevery(state, 0, 2000)
    expect(state.dormancyPressure).toBe(0)
    expect(state.collapsedStewardTile).toBeNull()
  })

  it('omen module no longer exports detectOmen (retired predicates)', () => {
    expect((omenModule as Record<string, unknown>).detectOmen).toBeUndefined()
  })

  it('omen module exports tickDormancyPressure and contributeDormancyPressure', () => {
    expect(typeof omenModule.tickDormancyPressure).toBe('function')
    expect(typeof omenModule.contributeDormancyPressure).toBe('function')
  })
})
