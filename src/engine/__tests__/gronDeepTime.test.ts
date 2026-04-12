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

  it('completing initial dialog gives water revery', () => {
    const state = makeState()
    clearAroundPlayer(state)
    createCharacterTestEntity(state, 'gron', state.player.x + 1, state.player.y)

    const result = interactWithCharacter(state)
    expect(result.opened).toBe(true)

    advanceToEnd(state)

    expect(state.reveries).toContain('water')
    expect(state.giftsReceived.has('gron')).toBe(true)
  })

  it('completing postGiftDialog gives deep-time revery', () => {
    const state = makeState()
    giveCharacterGift(state, 'gron')
    clearAroundPlayer(state)
    createCharacterTestEntity(state, 'gron', state.player.x + 1, state.player.y)

    interactWithCharacter(state)
    advanceToEnd(state)

    expect(state.reveries).toContain('deep-time')
  })

  it('postGift only fires once', () => {
    const state = makeState()
    giveCharacterGift(state, 'gron')

    // First postGiftDialog completion
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

    // Second postGiftDialog completion
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

  it('initial dialog gives water not deep-time', () => {
    const state = makeState()
    // Open dialog without prior gift — initial dialog plays
    state.activeDialog = {
      characterId: 'gron',
      lineIndex: 0,
      typingIndex: 0,
      typingDone: false,
      transitioning: false,
      transitionStartTime: 0,
    }

    advanceToEnd(state)

    // Completing initial dialog gives water gift
    expect(state.reveries).toContain('water')
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
