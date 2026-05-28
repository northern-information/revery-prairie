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

describe('gron has no gift chain', () => {
  it('postGiftActionsCompleted does not include gron', () => {
    const state = makeState()
    expect(state.postGiftActionsCompleted.has('gron')).toBe(false)
  })

  it('giveCharacterGift returns null for gron', () => {
    const state = makeState()
    const result = giveCharacterGift(state, 'gron')
    expect(result).toBeNull()
  })

  it('gron dialog routes through phase dispatch (no postGiftDialog branch)', () => {
    const state = makeState()
    // Phase-driven dispatch: the round-5 opener while quest phase is awaiting-coyote.
    expect(getCharacterDialog(state, 'gron')).toEqual(['...', 'A steward.', 'A steward goes to the ruins.'])
  })
})
