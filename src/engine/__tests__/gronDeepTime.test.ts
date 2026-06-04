import { getCharacterDialog } from '../characters'
import { ComponentType } from '../ecs/types'
import { giveCharacterGift } from '../interaction'
import { createGameState } from '../state'
import { describe, expect, it } from 'vitest'

import type { GameState } from '../types'

const makeState = (): GameState => {
  const state = createGameState('test', 40, 30)
  for (const eid of state.world.query(ComponentType.CharacterIdentity)) {
    state.world.destroyEntity(eid)
  }
  return state
}

describe('gron gifts the map once, with no postGift chain', () => {
  it('postGiftActionsCompleted does not include gron (no postGift)', () => {
    const state = makeState()
    expect(state.postGiftActionsCompleted.has('gron')).toBe(false)
  })

  it('giveCharacterGift hands over the map (RP-70) and only once', () => {
    const state = makeState()
    const first = giveCharacterGift(state, 'gron')
    expect(first).toEqual({ name: 'Map', glyphs: ['▤'], glyphColor: '#C2B280' })
    expect(giveCharacterGift(state, 'gron')).toBeNull()
  })

  it('gron dialog routes through phase dispatch (no postGiftDialog branch)', () => {
    const state = makeState()
    // Phase-driven dispatch: the round-5 opener while quest phase is
    // awaiting-coyote, ending on the RP-70 map handoff.
    expect(getCharacterDialog(state, 'gron')).toEqual([
      '...',
      'A steward.',
      'A steward goes to the ruins.',
      'Here. From your predecessor.',
    ])
  })
})
