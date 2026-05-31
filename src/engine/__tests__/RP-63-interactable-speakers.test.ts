import { CHARACTER_DEFINITIONS, getCharacterDefinition } from '../characters'
import { getInteractableDefinition, getInteractableLines, INTERACTABLES } from '../interactables'
import {
  advanceDialog,
  getActiveDialogLines,
  getActiveSpeakerName,
  openLockedGateDialog,
  tickDialogTyping,
} from '../interaction'
import { MANUAL_ENTRIES } from '../manual'
import { createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

describe('RP-63 — Interactable registry', () => {
  it('registers the gate as an Interactable with id, name, and lines', () => {
    expect(INTERACTABLES.gate).toBeDefined()
    expect(INTERACTABLES.gate.id).toBe('gate')
    expect(INTERACTABLES.gate.name).toBe('Gate')
    expect(INTERACTABLES.gate.lines).toEqual(['The gate is locked.'])
  })

  it('resolves the gate via getInteractableDefinition', () => {
    const def = getInteractableDefinition('gate')
    expect(def.name).toBe('Gate')
    expect(def.lines).toEqual(['The gate is locked.'])
  })

  it('throws on an unknown interactable id', () => {
    expect(() => getInteractableDefinition('not-a-real-interactable')).toThrow(/unknown interactable definition/)
  })

  it('returns the gate dialog lines via getInteractableLines', () => {
    expect(getInteractableLines('gate')).toEqual(['The gate is locked.'])
  })
})

describe('RP-63 — the gate is not a character', () => {
  it('CHARACTER_DEFINITIONS no longer contains an entry for "gate"', () => {
    expect((CHARACTER_DEFINITIONS as Record<string, unknown>).gate).toBeUndefined()
  })

  it('getCharacterDefinition("gate") throws', () => {
    expect(() => getCharacterDefinition('gate')).toThrow(/unknown character definition: gate/)
  })

  it('the gate has no manual entry under any namespace', () => {
    expect(MANUAL_ENTRIES['character:gate']).toBeUndefined()
    expect(MANUAL_ENTRIES['interactable:gate']).toBeUndefined()
  })
})

describe('RP-63 — activeDialog discriminated union', () => {
  it('openLockedGateDialog writes the interactable variant with speakerKind and interactableId', () => {
    const state = createTestState()
    expect(state.activeDialog).toBeNull()
    openLockedGateDialog(state)
    expect(state.activeDialog).toMatchObject({
      speakerKind: 'interactable',
      interactableId: 'gate',
      lineIndex: 0,
      typingIndex: 0,
      typingDone: false,
      transitioning: false,
    })
    // The interactable variant must not carry a characterId field.
    const d = state.activeDialog
    expect(d && 'characterId' in d ? d.characterId : undefined).toBeUndefined()
  })

  it('getActiveDialogLines returns the gate Interactable lines when speaker is interactable', () => {
    const state = createTestState()
    openLockedGateDialog(state)
    expect(getActiveDialogLines(state)).toEqual(['The gate is locked.'])
  })

  it('getActiveSpeakerName returns the gate Interactable name when speaker is interactable', () => {
    const state = createTestState()
    openLockedGateDialog(state)
    expect(getActiveSpeakerName(state)).toBe('Gate')
  })

  it('getActiveDialogLines returns [] when no activeDialog', () => {
    const state = createTestState()
    state.activeDialog = null
    expect(getActiveDialogLines(state)).toEqual([])
  })

  it('getActiveSpeakerName returns null when no activeDialog', () => {
    const state = createTestState()
    state.activeDialog = null
    expect(getActiveSpeakerName(state)).toBeNull()
  })
})

describe('RP-63 — interactable dialog advance and typing flow', () => {
  it('tickDialogTyping reveals one character of the gate line per cadence step', () => {
    const state = createTestState()
    openLockedGateDialog(state)
    const lastLine = 'The gate is locked.'
    state.lastDialogTypingTick = 0

    for (let t = 50; t < 50 + lastLine.length * 50 + 100; t += 50) {
      tickDialogTyping(state, t)
    }

    expect(state.activeDialog?.typingDone).toBe(true)
    expect(state.activeDialog?.typingIndex).toBe(lastLine.length)
  })

  it('advanceDialog closes the gate dialog and runs no gift flow', () => {
    const state = createTestState()
    openLockedGateDialog(state)
    if (!state.activeDialog) throw new Error('expected gate dialog')
    // Skip the typing animation — set state directly so advance closes on the last line.
    state.activeDialog.typingDone = true

    const giftsBefore = new Set(state.giftsReceived)
    const result = advanceDialog(state)

    expect(result.continuing).toBe(false)
    expect(result.gift).toBeNull()
    expect(state.activeDialog).toBeNull()
    // No gift delivery, no relationship state change.
    expect(state.giftsReceived).toEqual(giftsBefore)
    expect(state.giftsReceived.has('gate')).toBe(false)
  })
})

describe('RP-63 — character-keyed branches do not fire on interactable dialogs', () => {
  it('emily/gron/moab id comparisons against activeDialog.characterId return false', () => {
    const state = createTestState()
    openLockedGateDialog(state)
    const d = state.activeDialog
    // Under the discriminated union, characterId is only present on the
    // character variant. Direct equality comparisons against character ids
    // must resolve to false on the interactable variant.
    expect(d?.speakerKind === 'character' && d.characterId === 'emily').toBe(false)
    expect(d?.speakerKind === 'character' && d.characterId === 'gron').toBe(false)
    expect(d?.speakerKind === 'character' && d.characterId === 'moab').toBe(false)
  })
})
