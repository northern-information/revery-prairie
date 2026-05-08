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

  it('dialog always returns base dialog (no postGiftDialog branch)', () => {
    const state = makeState()
    const dialog = getCharacterDialog(state, 'gron')
    expect(dialog).toHaveLength(2)
    expect(dialog[0]).toBe('...')
    expect(dialog[1]).toContain('new steward')
  })
})

describe('player starts with all four reveries', () => {
  it('water and deep-time are in state.reveries from game start', () => {
    const state = makeState()
    expect(state.reveries).toContain('water')
    expect(state.reveries).toContain('deep-time')
  })

  it('action bar slots 2 and 3 are pre-filled at game start', () => {
    const state = makeState()
    expect(state.actionBar[2]?.kind).toBe('revery')
    expect(state.actionBar[2]?.id).toBe('water')
    expect(state.actionBar[3]?.kind).toBe('revery')
    expect(state.actionBar[3]?.id).toBe('deep-time')
  })
})

describe('multiple gifts', () => {
  it('moab can still give fire gift', () => {
    const state = makeState()
    const fire = giveCharacterGift(state, 'moab')
    expect(fire?.id).toBe('fire')
    expect(state.reveries).toContain('fire')
    expect(state.giftsReceived.has('moab')).toBe(true)
  })

  it('moab fire gift has no empty action bar slot (all four pre-filled)', () => {
    const state = makeState()
    giveCharacterGift(state, 'moab')
    // Fire is in reveries but action bar is already full
    expect(state.reveries).toContain('fire')
    expect(state.actionBar[0]?.id).toBe('earth')
    expect(state.actionBar[1]?.id).toBe('lightning')
    expect(state.actionBar[2]?.id).toBe('water')
    expect(state.actionBar[3]?.id).toBe('deep-time')
  })
})
