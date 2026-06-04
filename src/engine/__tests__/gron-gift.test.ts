import { getCharacterDefinition, getCharacterDialog } from '../characters'
import { giveCharacterGift } from '../interaction'
import { createGameState } from '../state'
import { describe, expect, it } from 'vitest'

import type { GameState } from '../types'

const makeState = (): GameState => createGameState('test', 40, 30)

describe('gron character definition', () => {
  it('gifts the map (RP-70 — the inherited cartography)', () => {
    const def = getCharacterDefinition('gron')
    expect(def.gift).toEqual({ kind: 'item', id: 'map' })
  })

  it('has no postGiftDialog', () => {
    const def = getCharacterDefinition('gron')
    expect(def.postGiftDialog).toBeUndefined()
  })

  it('has no postGift', () => {
    const def = getCharacterDefinition('gron')
    expect(def.postGift).toBeUndefined()
  })

  it('has two dialog lines on the static fallback', () => {
    const def = getCharacterDefinition('gron')
    expect(def.dialog).toHaveLength(2)
    expect(def.dialog[0]).toBe('...')
    expect(def.dialog[1]).toBe('A steward.')
  })
})

describe('gron gift delivery', () => {
  it('hands over the map as a key item: records item:map, opens the tab, never enters the backpack', () => {
    const state = makeState()
    let opened = 0
    state.onMapAcquired = () => {
      opened++
    }
    const result = giveCharacterGift(state, 'gron')
    expect(result).toEqual({ name: 'Map', glyphs: ['▤'], glyphColor: '#C2B280' })
    expect(state.giftsReceived.has('gron')).toBe(true)
    expect(state.manualDiscoveries.has('item:map')).toBe(true)
    expect(opened).toBe(1)
  })

  it('only gifts once — a second call after giftsReceived returns null', () => {
    const state = makeState()
    giveCharacterGift(state, 'gron')
    const second = giveCharacterGift(state, 'gron')
    expect(second).toBeNull()
  })

  it('the awaiting-coyote dialog ends on the map handoff line', () => {
    const state = makeState()
    // Phase-driven dispatch: the round-5 opener while quest phase is
    // awaiting-coyote, with the user-authored map handoff as the last line
    // (the gift fires when this line completes).
    expect(getCharacterDialog(state, 'gron')).toEqual([
      '...',
      'A steward.',
      'A steward goes to the ruins.',
      'Here. From your predecessor.',
    ])
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
