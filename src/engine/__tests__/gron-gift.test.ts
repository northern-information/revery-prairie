import { getCharacterDefinition, getCharacterDialog } from '../characters'
import { giveCharacterGift } from '../interaction'
import { createGameState } from '../state'
import { describe, expect, it } from 'vitest'

import type { GameState } from '../types'

const makeState = (): GameState => createGameState('test', 40, 30)

describe('gron character definition', () => {
  it('has no gift configured', () => {
    const def = getCharacterDefinition('gron')
    expect(def.gift).toBeUndefined()
  })

  it('has no postGiftDialog', () => {
    const def = getCharacterDefinition('gron')
    expect(def.postGiftDialog).toBeUndefined()
  })

  it('has no postGift', () => {
    const def = getCharacterDefinition('gron')
    expect(def.postGift).toBeUndefined()
  })

  it('has two dialog lines', () => {
    const def = getCharacterDefinition('gron')
    expect(def.dialog).toHaveLength(2)
    expect(def.dialog[0]).toBe('...')
    expect(def.dialog[1]).toContain('new steward')
  })
})

describe('gron gift delivery', () => {
  it('returns null — gron has no gift', () => {
    const state = makeState()
    const result = giveCharacterGift(state, 'gron')
    expect(result).toBeNull()
  })

  it('giftsReceived does not include gron after interaction', () => {
    const state = makeState()
    giveCharacterGift(state, 'gron')
    expect(state.giftsReceived.has('gron')).toBe(false)
  })

  it('dialog returns the awaiting-coyote phase block (no postGiftDialog branch)', () => {
    const state = makeState()
    const dialog = getCharacterDialog(state, 'gron')
    // Phase-driven dispatch: 5-line opener while quest phase is awaiting-coyote.
    expect(dialog[0]).toBe('...')
    expect(dialog[1]).toContain('new steward')
    expect(dialog).toContain('What is a steward without their coyote?')
  })
})

describe('moab gift delivery', () => {
  it('moab no longer gifts — re-anchored in RP-9', () => {
    const state = makeState()
    const result = giveCharacterGift(state, 'moab')
    expect(result).toBeNull()
    expect(state.giftsReceived.has('moab')).toBe(false)
  })
})
