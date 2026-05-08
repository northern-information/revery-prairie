import { describe, it, expect } from 'vitest'
import { createGameState } from '../state'
import { getCharacterDialog } from '../characters'
import { ComponentType } from '../ecs/types'
import { giveCharacterGift } from '../interaction'

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

  it('gron dialog is base dialog only (no postGiftDialog branch)', () => {
    const state = makeState()
    const dialog = getCharacterDialog(state, 'gron')
    expect(dialog).toHaveLength(2)
    expect(dialog[0]).toBe('...')
    expect(dialog[1]).toContain('new steward')
  })
})
