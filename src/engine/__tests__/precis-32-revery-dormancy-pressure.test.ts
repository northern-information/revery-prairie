// Spec acceptance tests for precis #32 (Revery dormancy pressure — forcing
// function). See harness/specs/precis-32-revery-dormancy-pressure.yaml.
//
// This file is the spec's surface-level acceptance suite. Detailed unit tests
// live in revery.test.ts and any new dormancy-pressure module test.
// Acceptance assertions are filled in by the harness implementation tasks per
// harness/plans/precis-32-revery-dormancy-pressure.yaml.
//
// Round 6 (v6 thinktank, 2026-05-22) retired the three existing omen variants.
// The omen surface is now precis-36's scope (The Revery Knot). This spec
// covers the pressure substrate, threshold, summons sequence, Gron arrival,
// collapse tile, and the Closing-phase egregoric commit.
import { describe, it } from 'vitest'

describe('precis #32 — revery dormancy pressure', () => {
  it.todo('initializes dormancyPressure to 0 on createGameState')
  it.todo('floors dormancyPressure linearly from autumn equinox to winter solstice')
  it.todo('reaches dormancyPressure 1.0 at the winter solstice frame with no contributions')
  it.todo('exposes contributeDormancyPressure that clamps additions to [0, 1]')
  it.todo('initiates Revery when dormancyPressure crosses 1.0')
  it.todo('sets state.revery.summons = true when the Revery enters via the pressure-ceiling path')
  it.todo('teleports Gron to an adjacent walkable tile and opens his solstice-summons dialog')
  it.todo('returns GRON_DIALOG_SOLSTICE_SUMMONS during the summons Omen phase')
  it.todo('sets collapsedStewardTile at Omen → Observing and clears at Closing')
  it.todo('commits the steward collapse tile to TileType.Egregore at Closing')
  it.todo('resets dormancyPressure at Revery Closing')
  it.todo('resets dormancyPressure when season transitions Autumn → Winter without a Revery')
  it.todo('skips egregoric commit silently when collapse tile is ineligible at Closing')
  it.todo('handles missing Gron entity at summons without crashing')
  it.todo('handles pickAdjacentWalkableTile returning null at summons without crashing')
  it.todo('removes detectOmen from src/engine/omen.ts and replaces the gameLoop call site')
  it.todo('does not fire the retired bee-on-shoulder predicate at any frame')
  it.todo('does not fire the retired distant-meteorite predicate at any frame')
  it.todo('does not fire the retired cloud-passing-sun predicate at any frame')
})
