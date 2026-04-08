import { describe, expect, it } from 'vitest'

import { getCharacterDefinition, getCharacterDialog } from '../characters'
import { giveCharacterGift } from '../interaction'
import { createGameState } from '../state'

import type { GameState } from '../types'

const makeState = (): GameState => createGameState('test', 40, 30)

describe('gron character definition', () => {
  it('has water revery gift configured', () => {
    const def = getCharacterDefinition('gron')
    expect(def.gift).toEqual({ kind: 'revery', id: 'water' })
  })

  it('has postGiftDialog', () => {
    const def = getCharacterDefinition('gron')
    expect(def.postGiftDialog).toEqual(['...'])
  })
})

describe('gron gift delivery', () => {
  it('gives water revery', () => {
    const state = makeState()
    const result = giveCharacterGift(state, 'gron')

    expect(result).not.toBeNull()
    expect(result?.id).toBe('water')
    expect(result?.name).toBe('Water Revery')
    expect(state.reveries).toContain('water')
    expect(state.giftsReceived.has('gron')).toBe(true)
  })

  it('auto-assigns water revery to action bar', () => {
    const state = makeState()
    giveCharacterGift(state, 'gron')

    // Slot 0 = earth (pre-assigned), slot 1 = water
    expect(state.actionBar[1]?.kind).toBe('revery')
    expect(state.actionBar[1]?.id).toBe('water')
  })

  it('records discovery', () => {
    const state = makeState()
    giveCharacterGift(state, 'gron')

    expect(state.manualDiscoveries.has('revery:water')).toBe(true)
    expect(state.manualDiscoveries.has('event:gron-gift')).toBe(true)
  })

  it('returns null if already given', () => {
    const state = makeState()
    giveCharacterGift(state, 'gron')

    const result = giveCharacterGift(state, 'gron')
    expect(result).toBeNull()
  })

  it('switches to postGiftDialog after gift', () => {
    const state = makeState()
    giveCharacterGift(state, 'gron')

    const dialog = getCharacterDialog(state, 'gron')
    expect(dialog).toEqual(['...'])
  })

  it('returns original dialog before gift', () => {
    const state = makeState()
    const dialog = getCharacterDialog(state, 'gron')
    expect(dialog).toHaveLength(1)
    expect(dialog[0]).toBe('...')
  })
})

describe('multiple gifts', () => {
  it('both moab and gron can give gifts', () => {
    const state = makeState()
    const fire = giveCharacterGift(state, 'moab')
    const water = giveCharacterGift(state, 'gron')

    expect(fire?.id).toBe('fire')
    expect(water?.id).toBe('water')
    expect(state.reveries).toEqual(['earth', 'fire', 'water'])
    expect(state.actionBar[0]?.id).toBe('earth')
    expect(state.actionBar[1]?.id).toBe('fire')
    expect(state.actionBar[2]?.id).toBe('water')
  })
})
