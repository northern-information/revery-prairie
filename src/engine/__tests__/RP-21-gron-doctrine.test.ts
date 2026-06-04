import { ComponentType } from '../ecs/types'
import { getCharacterDefinition, getCharacterDialog } from '../characters'
import { triggerStewardSeal } from '../interaction'
import { MANUAL_ENTRIES } from '../manual'
import { createGameState } from '../state'
import { MainQuestPhase, OmenKind, ReveryPhase, Zone } from '../types'
import { clearAroundPlayer } from './helpers'
import { describe, expect, it } from 'vitest'

import type { GameState, ReveryState, ReverySnapshot } from '../types'

const makeState = (): GameState => createGameState('rp-21-test', 40, 30)

const emptySnapshot: ReverySnapshot = {} as ReverySnapshot

const summonsOmenRevery = (): ReveryState => ({
  active: true,
  startTime: 0,
  phase: ReveryPhase.Omen,
  elapsedYears: 0,
  snapshotBeforeRevery: emptySnapshot,
  scheduledChanges: [],
  summaryReady: false,
  omenKind: OmenKind.ReveryKnot,
  summons: true,
})

const countBees = (state: GameState): number => {
  let n = 0
  for (const eid of state.world.query(ComponentType.EntityTag)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) === 'bee') n++
  }
  return n
}

describe('RP-21 — gron doctrine pass', () => {
  describe('manual-lore-glitched-flag (shape)', () => {
    it('ManualEntry surface exposes an optional glitched field', () => {
      // A non-glitched entry — clover. glitched is either undefined or false.
      const entry = MANUAL_ENTRIES['flora:clover']
      expect(entry).toBeDefined()
      expect(entry.glitched).toBeFalsy()
    })
  })

  describe('gron-manual-entry-glitched', () => {
    it("MANUAL_ENTRIES['character:gron'] lore is the round-5 doctrine line", () => {
      expect(MANUAL_ENTRIES['character:gron'].lore).toBe('The manual does not know.')
    })

    it("MANUAL_ENTRIES['character:gron'] is glitched", () => {
      expect(MANUAL_ENTRIES['character:gron'].glitched).toBe(true)
    })

    it('the rain-curse line is no longer present anywhere in the gron manual entry', () => {
      const entry = MANUAL_ENTRIES['character:gron']
      expect(entry.lore).not.toContain('rain curse')
      expect(entry.lore).not.toContain('codger')
      expect(entry.lore).not.toContain('immortal')
    })
  })

  describe('gron-dialog-revised-lines', () => {
    it('awaiting-coyote phase returns the round-5 opener ending on the RP-70 map handoff', () => {
      const state = makeState()
      state.mainQuestPhase = MainQuestPhase.AwaitingCoyote
      expect(getCharacterDialog(state, 'gron')).toEqual([
        '...',
        'A steward.',
        'A steward goes to the ruins.',
        'Here. From your predecessor.',
      ])
    })

    it('gathering phase (no bee, no clover) returns the Dickinson-correct one-liner', () => {
      const state = makeState()
      state.mainQuestPhase = MainQuestPhase.Gathering
      expect(getCharacterDialog(state, 'gron')).toEqual(['A clover and a bee.'])
    })

    it('sealed phase returns the single-line declaration', () => {
      const state = makeState()
      state.mainQuestPhase = MainQuestPhase.Sealed
      expect(getCharacterDialog(state, 'gron')).toEqual(['A steward.'])
    })

    it('solstice-summons branch retains its RP-32 placeholder line', () => {
      const state = makeState()
      state.revery = summonsOmenRevery()
      expect(getCharacterDialog(state, 'gron')).toEqual(['TODO: solstice summons dialog'])
    })

    it("CHARACTER_DEFINITIONS.gron.dialog static fallback is ['...', 'A steward.']", () => {
      const def = getCharacterDefinition('gron')
      expect(def.dialog).toEqual(['...', 'A steward.'])
    })

    it('no Gron line contains a contraction or editorial affect', () => {
      const state = makeState()
      const allLines: string[] = []
      for (const phase of [MainQuestPhase.AwaitingCoyote, MainQuestPhase.Gathering, MainQuestPhase.Sealed]) {
        state.mainQuestPhase = phase
        allLines.push(...getCharacterDialog(state, 'gron'))
      }
      const forbidden = ["n't", 'Oh,', 'Ahhh', 'Well ', 'Worrisome', 'indeed']
      for (const line of allLines) {
        for (const f of forbidden) {
          expect(line).not.toContain(f)
        }
      }
    })
  })

  describe('gron-not-beekeeper-bees-spawn-at-combine', () => {
    it('triggerStewardSeal on the overworld spawns up to 3 bees synchronously', () => {
      const state = makeState()
      clearAroundPlayer(state, 5)
      state.currentZone = Zone.Overworld
      state.mainQuestPhase = MainQuestPhase.Gathering
      const beesBefore = countBees(state)
      triggerStewardSeal(state, 0)
      const beesAfter = countBees(state)
      const spawned = beesAfter - beesBefore
      expect(spawned).toBeGreaterThanOrEqual(0)
      expect(spawned).toBeLessThanOrEqual(3)
    })

    it('triggerStewardSeal advances mainQuestPhase to Sealed', () => {
      const state = makeState()
      clearAroundPlayer(state, 5)
      state.currentZone = Zone.Overworld
      state.mainQuestPhase = MainQuestPhase.Gathering
      triggerStewardSeal(state, 0)
      expect(state.mainQuestPhase).toBe(MainQuestPhase.Sealed)
    })

    it('triggerStewardSeal off the overworld is a no-op (no bees, no seal)', () => {
      const state = makeState()
      state.currentZone = Zone.Cave
      state.mainQuestPhase = MainQuestPhase.Gathering
      const beesBefore = countBees(state)
      triggerStewardSeal(state, 0)
      expect(countBees(state)).toBe(beesBefore)
      expect(state.mainQuestPhase).toBe(MainQuestPhase.Gathering)
    })

    it('GameState no longer carries a pendingSavedBees field', () => {
      const state = makeState()
      expect('pendingSavedBees' in state).toBe(false)
    })
  })
})
