import { describe, it, expect } from 'vitest'
import { createGameState } from '../state'
import { getCharacterDialog } from '../characters'
import { advanceDialog, giveCharacterGift, interactWithCharacter } from '../interaction'
import { clearAroundPlayer, createCharacterTestEntity } from './helpers'

import type { GameState } from '../types'

const makeState = (): GameState => createGameState('test', 40, 30)

const advanceToEnd = (state: GameState): void => {
  while (state.activeDialog) {
    state.activeDialog.typingDone = true
    advanceDialog(state)
    if (state.activeDialog?.transitioning) {
      state.activeDialog.transitioning = false
      state.activeDialog.lineIndex++
      state.activeDialog.typingIndex = 0
      state.activeDialog.typingDone = false
    }
  }
}

describe('gron deep time', () => {
  it('gron postGiftDialog has deep time speech', () => {
    const state = makeState()
    giveCharacterGift(state, 'gron')

    const dialog = getCharacterDialog(state, 'gron')
    expect(dialog).toHaveLength(2)
    expect(dialog[0]).toContain('Deep Time revery')
    expect(dialog[1]).toContain('ready to burn')
  })

  it('postGiftAction grants deep-time revery on dialog completion', () => {
    const state = makeState()
    giveCharacterGift(state, 'gron')
    clearAroundPlayer(state)
    createCharacterTestEntity(state, 'gron', state.player.x + 1, state.player.y)

    const result = interactWithCharacter(state)
    expect(result.opened).toBe(true)

    advanceToEnd(state)

    expect(state.activeDialog).toBeNull()
    expect(state.reveries).toContain('deep-time')
  })

  it('postGiftAction only fires once', () => {
    const state = makeState()
    giveCharacterGift(state, 'gron')

    // First dialog completion
    state.activeDialog = {
      characterId: 'gron',
      lineIndex: 0,
      typingIndex: 0,
      typingDone: false,
      transitioning: false,
      transitionStartTime: 0,
    }
    advanceToEnd(state)

    const reveryCount = state.reveries.filter(r => r === 'deep-time').length
    expect(reveryCount).toBe(1)

    // Second dialog completion
    state.activeDialog = {
      characterId: 'gron',
      lineIndex: 0,
      typingIndex: 0,
      typingDone: false,
      transitioning: false,
      transitionStartTime: 0,
    }
    advanceToEnd(state)

    const reveryCount2 = state.reveries.filter(r => r === 'deep-time').length
    expect(reveryCount2).toBe(1)
  })

  it('postGiftAction does not fire if gift not received', () => {
    const state = makeState()
    // Manually open dialog without giving gift first
    state.activeDialog = {
      characterId: 'gron',
      lineIndex: 0,
      typingIndex: 0,
      typingDone: false,
      transitioning: false,
      transitionStartTime: 0,
    }

    // Advance through original dialog (only 1 line: '...')
    state.activeDialog.typingDone = true
    advanceDialog(state)

    expect(state.activeDialog).toBeNull()
    expect(state.reveries).not.toContain('deep-time')
    expect(state.postGiftActionsCompleted.has('gron')).toBe(false)
  })

  it('deep-time revery auto-assigned to action bar', () => {
    const state = makeState()
    giveCharacterGift(state, 'gron')

    state.activeDialog = {
      characterId: 'gron',
      lineIndex: 0,
      typingIndex: 0,
      typingDone: false,
      transitioning: false,
      transitionStartTime: 0,
    }
    advanceToEnd(state)

    const deepTimeSlot = state.actionBar.find(slot => slot?.kind === 'revery' && slot?.id === 'deep-time')
    expect(deepTimeSlot).toBeDefined()
    expect(deepTimeSlot?.kind).toBe('revery')
    expect(deepTimeSlot?.id).toBe('deep-time')
  })
})
