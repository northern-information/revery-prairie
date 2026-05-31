// RP-36 — integration test for Tyler's bug report flow.
//
//   1. Pick up the Knot in autumn (dormancyPressure = 0.5)
//   2. Walk back to the little house, talk to Emily
//   3. Press [f] through her 3 lines, the third arms awaitingConfirmation
//   4. Press [f] one more time — confirm path should fire
//   5. Revery should trigger; steward should teleport to the bed
import { describe, expect, it } from 'vitest'

import { advanceDialog, interactWithCharacter, tickDialogTransition, tickDialogTyping } from '../interaction'
import { initiateRevery, tickRevery } from '../revery'
import { onReveryKnotEntered } from '../reveryKnot'
import { findFitPosition, placeItem } from '../inventory'
import { OmenKind, Season, Zone } from '../types'
import { clearAroundPlayer, createCharacterTestEntity, createTestState } from './helpers'

import type { GameState } from '../types'

const advancePastTransition = (state: GameState): void => {
  // Force-finish any in-flight transition by pushing time past the threshold.
  if (state.activeDialog?.transitioning) {
    state.activeDialog.transitionStartTime = -100_000
    tickDialogTransition(state, 0)
  }
}

const advancePastTyping = (state: GameState): void => {
  // Run tickDialogTyping repeatedly until typingDone — emulates the
  // wall-clock advance.
  for (let i = 0; i < 1000 && state.activeDialog && !state.activeDialog.typingDone; i++) {
    state.lastDialogTypingTick = -100_000
    tickDialogTyping(state, 0)
  }
}

describe("RP-36 — Tyler's confirm-after-Knot flow", () => {
  it('confirming with Emily after Knot pickup raises dormancyPressure to 1', () => {
    const state = createTestState()
    clearAroundPlayer(state, 10)
    state.currentZone = Zone.HouseInterior
    state.weather.season = Season.Autumn
    state.weather.temperatureF = 55

    // Knot in backpack first (the in-game prerequisite).
    state.lastKnotPickupHarvestYear = 0
    const fit = findFitPosition(state.backpack, 'reveryKnot')
    if (!fit) throw new Error('no fit')
    const placed = placeItem(state.backpack, 'reveryKnot', fit.gridX, fit.gridY)
    if (!placed) throw new Error('placeItem returned null')
    onReveryKnotEntered(state, placed.uid, 1000)
    expect(state.dormancyPressure).toBeCloseTo(0.5, 5)

    // Walk to Emily (just spawn her adjacent for the test).
    createCharacterTestEntity(state, 'emily', state.player.x + 1, state.player.y)
    state.facingEntityPos = { x: state.player.x + 1, y: state.player.y }

    // Open Emily's dialog manually (starts at lineIndex 1, skipping greeting).
    const open = interactWithCharacter(state)
    expect(open.opened).toBe(true)
    if (state.activeDialog?.speakerKind !== 'character') throw new Error('expected character dialog')
    expect(state.activeDialog.characterId).toBe('emily')
    expect(state.activeDialog.lineIndex).toBe(1)

    // Advance through lines 1 → 2.
    advancePastTyping(state) // finish line 1 typing
    advanceDialog(state, 2000) // advance to line 2 (sets transitioning)
    advancePastTransition(state) // arrive at line 2
    if (state.activeDialog?.speakerKind !== 'character') throw new Error('expected character dialog')
    expect(state.activeDialog.lineIndex).toBe(2)
    advancePastTyping(state) // finish line 2 typing — should arm awaitingConfirmation

    if (state.activeDialog?.speakerKind !== 'character') throw new Error('expected character dialog')
    expect(state.activeDialog.awaitingConfirmation).toBe(true)
    expect(state.emilyInvitation).toBe('offered')

    // Press [f] one more time — the confirm path.
    advanceDialog(state, 3000)

    expect(state.dormancyPressure).toBe(1)
    expect(state.emilyInvitation).toBe('confirmed')
    expect(state.activeDialog).toBeNull()
  })

  it('Revery initiates and teleports steward to the bed after Emily confirm', () => {
    const state = createTestState()
    clearAroundPlayer(state, 10)
    state.currentZone = Zone.HouseInterior
    state.weather.season = Season.Autumn
    state.weather.temperatureF = 55

    // Simulate the post-confirm state: dormancyPressure at ceiling.
    state.dormancyPressure = 1
    expect(state.revery).toBeNull()

    // Walk through what gameLoop would do at the threshold trigger:
    initiateRevery(state, 5000, OmenKind.ReveryKnot)
    ;(state.revery as { summons?: boolean }).summons = true
    expect(state.revery?.summons).toBe(true)

    // Snapshot player position before tickRevery. Place steward
    // somewhere other than the hearth so the teleport is observable.
    state.player = { x: 3, y: 4 }
    const beforePos = { x: state.player.x, y: state.player.y }

    // tickRevery runs the Omen → Observing transition (summons sequence,
    // house-scene swap, etc).
    tickRevery(state, 0, 5000)

    expect(state.revery?.phase).toBe('observing')
    // v11 R7 — the steward is anchored at houseEntranceInterior (the
    // hearth opposite Emily across the fireplace), not on a bed.
    expect(state.player).toEqual(state.houseEntranceInterior)
    expect(state.player).not.toEqual(beforePos)
  })
})
