import { describe, expect, it } from 'vitest'

import { getInteractableDefinition, getInteractableLines, INTERACTABLES } from '../interactables'

describe('RP-63 interactable speakers', () => {
  it('registers the gate as an interactable', () => {
    expect(INTERACTABLES.gate).toBeDefined()
    expect(INTERACTABLES.gate.id).toBe('gate')
    expect(INTERACTABLES.gate.name).toBe('Gate')
    expect(INTERACTABLES.gate.lines).toEqual(['The gate is locked.'])
  })

  it('resolves the gate via getInteractableDefinition', () => {
    const def = getInteractableDefinition('gate')
    expect(def.name).toBe('Gate')
  })

  it('throws on an unknown interactable id', () => {
    expect(() => getInteractableDefinition('not-a-real-interactable')).toThrow(/unknown interactable definition/)
  })

  it('returns the gate dialog lines via getInteractableLines', () => {
    expect(getInteractableLines('gate')).toEqual(['The gate is locked.'])
  })

  // Behaviors covered by RP-63 that this stub does not yet test, pending the
  // RP-63 implementation pass:
  // - state.activeDialog discriminated union (speakerKind)
  // - openLockedGateDialog writes the interactable variant
  // - getActiveDialogLines branches on speakerKind
  // - manual auto-derivation never enumerates INTERACTABLES
  // - CHARACTER_DEFINITIONS no longer contains id 'gate'
  // - character-keyed branches (emily, gron) do not fire on interactable dialogs
})
