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

describe('player starts with deep-time revery', () => {
  it('deep-time revery is in state.reveries from game start', () => {
    const state = makeState()
    expect(state.reveries).toContain('deep-time')
  })

  it('water revery is in state.reveries from game start', () => {
    const state = makeState()
    expect(state.reveries).toContain('water')
  })

  it('deep-time revery is auto-assigned to action bar slot 3', () => {
    const state = makeState()
    expect(state.actionBar[3]?.kind).toBe('revery')
    expect(state.actionBar[3]?.id).toBe('deep-time')
  })

  it('water revery is auto-assigned to action bar slot 2', () => {
    const state = makeState()
    expect(state.actionBar[2]?.kind).toBe('revery')
    expect(state.actionBar[2]?.id).toBe('water')
  })

  it('postGiftActionsCompleted does not include gron', () => {
    const state = makeState()
    expect(state.postGiftActionsCompleted.has('gron')).toBe(false)
  })
})

describe('gron has no gift chain', () => {
  it('giveCharacterGift returns null for gron', () => {
    const state = makeState()
    const result = giveCharacterGift(state, 'gron')
    expect(result).toBeNull()
  })

  it('gron dialog routes through phase dispatch (no postGiftDialog branch)', () => {
    const state = makeState()
    const dialog = getCharacterDialog(state, 'gron')
    // Phase-driven dispatch: 5-line opener while quest phase is awaiting-coyote.
    expect(dialog[0]).toBe('...')
    expect(dialog[1]).toContain('new steward')
    expect(dialog).toContain('What is a steward without their coyote?')
  })
})
